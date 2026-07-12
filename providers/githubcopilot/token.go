package githubcopilot

import (
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
	"strings"
	"sync"
	"time"
)

type tokenEntry struct {
	token, apiBase string
	refreshAt      time.Time
}
type inflight struct {
	done  chan struct{}
	entry tokenEntry
	err   error
}
type tokenFailure struct {
	err        error
	retryAt    time.Time
	retryDelay time.Duration
}

var tokenStore = struct {
	sync.Mutex
	entries  map[string]tokenEntry
	flights  map[string]*inflight
	failures map[string]tokenFailure
}{entries: map[string]tokenEntry{}, flights: map[string]*inflight{}, failures: map[string]tokenFailure{}}

type userResponse struct {
	Endpoints struct {
		API string `json:"api"`
	} `json:"endpoints"`
}
type tokenResponse struct {
	Token     string `json:"token"`
	ExpiresAt int64  `json:"expires_at"`
	RefreshIn int64  `json:"refresh_in"`
	Endpoints struct {
		API string `json:"api"`
	} `json:"endpoints"`
}

func (p *Provider) getToken(force bool) (tokenEntry, error) {
	key := channelCacheKey(p.Channel)
	tokenStore.Lock()
	if !force {
		if e, ok := tokenStore.entries[key]; ok && time.Now().Before(e.refreshAt) {
			tokenStore.Unlock()
			return e, nil
		}
		if failure, ok := tokenStore.failures[key]; ok && time.Now().Before(failure.retryAt) {
			tokenStore.Unlock()
			return tokenEntry{}, fmt.Errorf("GitHub Copilot authentication temporarily unavailable; retry after %s: %w", failure.retryAt.Format(time.RFC3339), failure.err)
		}
	}
	if f := tokenStore.flights[key]; f != nil {
		tokenStore.Unlock()
		<-f.done
		return f.entry, f.err
	}
	f := &inflight{done: make(chan struct{})}
	tokenStore.flights[key] = f
	tokenStore.Unlock()
	f.entry, f.err = p.exchangeToken()
	tokenStore.Lock()
	if f.err == nil {
		tokenStore.entries[key] = f.entry
		delete(tokenStore.failures, key)
	} else {
		delay := 15 * time.Second
		if previous, ok := tokenStore.failures[key]; ok {
			delay = min(previous.retryDelay*2, 10*time.Minute)
		}
		jitter := time.Duration(rand.Int64N(int64(delay/2) + 1))
		tokenStore.failures[key] = tokenFailure{err: f.err, retryAt: time.Now().Add(delay + jitter), retryDelay: delay}
	}
	delete(tokenStore.flights, key)
	close(f.done)
	tokenStore.Unlock()
	return f.entry, f.err
}

func (p *Provider) invalidate() {
	tokenStore.Lock()
	delete(tokenStore.entries, channelCacheKey(p.Channel))
	delete(tokenStore.failures, channelCacheKey(p.Channel))
	tokenStore.Unlock()
}

func (p *Provider) exchangeToken() (tokenEntry, error) {
	oauth, err := parseOAuthToken(p.Channel.Key)
	if err != nil {
		return tokenEntry{}, err
	}
	h := p.GetRequestHeaders()
	h["Authorization"] = "token " + oauth
	h["Accept"] = "application/json"
	apiBase := ""
	var u userResponse
	userReq, err := p.Requester.NewRequest(http.MethodGet, strings.TrimRight(githubAPIBase, "/")+"/copilot_internal/user", p.Requester.WithHeader(h))
	if err != nil {
		return tokenEntry{}, err
	}
	if _, sendErr := p.Requester.SendRequest(userReq, &u, false); sendErr != nil {
		return tokenEntry{}, fmt.Errorf("failed to resolve GitHub Copilot account endpoint: %s", sendErr.Message)
	}
	apiBase = u.Endpoints.API
	if apiBase == "" {
		return tokenEntry{}, errors.New("GitHub Copilot account response did not include an API endpoint")
	}
	var tr tokenResponse
	req, err := p.Requester.NewRequest(http.MethodGet, strings.TrimRight(githubAPIBase, "/")+"/copilot_internal/v2/token", p.Requester.WithHeader(h))
	if err != nil {
		return tokenEntry{}, err
	}
	if _, e := p.Requester.SendRequest(req, &tr, false); e != nil {
		return tokenEntry{}, errors.New(e.Message)
	}
	if tr.Token == "" {
		return tokenEntry{}, errors.New("GitHub returned an empty Copilot token")
	}
	if tr.Endpoints.API != "" {
		apiBase = tr.Endpoints.API
	}
	if apiBase == "" {
		apiBase = p.Config.BaseURL
	}
	now := time.Now()
	refreshAt := now.Add(time.Duration(tr.RefreshIn)*time.Second - time.Minute)
	if tr.RefreshIn <= 60 && tr.ExpiresAt > 0 {
		refreshAt = time.Unix(tr.ExpiresAt, 0).Add(-time.Minute)
	}
	if !refreshAt.After(now) {
		refreshAt = now.Add(30 * time.Second)
	}
	return tokenEntry{token: tr.Token, apiBase: apiBase, refreshAt: refreshAt}, nil
}
