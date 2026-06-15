package claudecode

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	claudeCodeFallbackClientVersion = "2.1.177"
	claudeCodeNPMRegistryLatestURL  = "https://registry.npmjs.org/@anthropic-ai%2Fclaude-code/latest"
	claudeCodeClientVersionCacheTTL = 6 * time.Hour
)

var claudeCodeClientVersionCache = struct {
	sync.RWMutex
	version   string
	expiresAt time.Time
}{}

type claudeCodeNPMMetadata struct {
	Version string `json:"version"`
}

func GetClaudeCodeUserAgent() string {
	return "claude-cli/" + GetClaudeCodeClientVersion()
}

func GetClaudeCodeUserAgentWithProxy(proxyURL string) string {
	return "claude-cli/" + GetClaudeCodeClientVersionWithProxy(proxyURL)
}

func GetClaudeCodeClientVersion() string {
	return GetClaudeCodeClientVersionWithProxy("")
}

func GetClaudeCodeClientVersionWithProxy(proxyURL string) string {
	now := time.Now()

	claudeCodeClientVersionCache.RLock()
	if claudeCodeClientVersionCache.version != "" && now.Before(claudeCodeClientVersionCache.expiresAt) {
		version := claudeCodeClientVersionCache.version
		claudeCodeClientVersionCache.RUnlock()
		return version
	}
	claudeCodeClientVersionCache.RUnlock()

	version, err := fetchLatestClaudeCodeClientVersion(proxyURL)
	if err != nil || !isValidClaudeCodeClientVersion(version) {
		version = claudeCodeFallbackClientVersion
	}

	claudeCodeClientVersionCache.Lock()
	claudeCodeClientVersionCache.version = version
	claudeCodeClientVersionCache.expiresAt = now.Add(claudeCodeClientVersionCacheTTL)
	claudeCodeClientVersionCache.Unlock()

	return version
}

func (p *ClaudeCodeProvider) getClaudeCodeUserAgent() string {
	proxyURL := ""
	if p != nil && p.Channel != nil {
		proxyURL = p.Channel.GetProxy()
	}
	return GetClaudeCodeUserAgentWithProxy(proxyURL)
}

func (p *ClaudeCodeProvider) getClaudeCodeClientVersion() string {
	proxyURL := ""
	if p != nil && p.Channel != nil {
		proxyURL = p.Channel.GetProxy()
	}
	return GetClaudeCodeClientVersionWithProxy(proxyURL)
}

func fetchLatestClaudeCodeClientVersion(proxyURL string) (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	if proxyURL != "" {
		proxyURLParsed, err := url.Parse(proxyURL)
		if err == nil {
			client.Transport = &http.Transport{
				Proxy: http.ProxyURL(proxyURLParsed),
			}
		}
	}

	req, err := http.NewRequest(http.MethodGet, claudeCodeNPMRegistryLatestURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", errors.New(resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var response claudeCodeNPMMetadata
	if err := json.Unmarshal(body, &response); err != nil {
		return "", err
	}

	return strings.TrimSpace(response.Version), nil
}

func isValidClaudeCodeClientVersion(version string) bool {
	if version == "" {
		return false
	}
	for _, r := range version {
		if (r >= '0' && r <= '9') || r == '.' || r == '-' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			continue
		}
		return false
	}
	return version[0] >= '0' && version[0] <= '9'
}
