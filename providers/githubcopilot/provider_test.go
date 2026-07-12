package githubcopilot

import (
	"done-hub/common/requester"
	"done-hub/model"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"
)

func TestParseOAuthToken(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"gho_plain", "gho_plain"},
		{`{"access_token":"gho_json"}`, "gho_json"},
	} {
		got, err := parseOAuthToken(tc.in)
		if err != nil || got != tc.want {
			t.Fatalf("parseOAuthToken(%q) = %q, %v", tc.in, got, err)
		}
	}
	if _, err := parseOAuthToken(`{"token":"wrong"}`); err == nil {
		t.Fatal("expected missing access_token error")
	}
}

func TestAllowedCopilotHost(t *testing.T) {
	for _, host := range []string{"api.githubcopilot.com", "api.business.githubcopilot.com", "copilot-api.example.ghe.com"} {
		if !allowedCopilotHost(host) {
			t.Fatalf("expected %s to be allowed", host)
		}
	}
	for _, host := range []string{"githubcopilot.com.evil.example", "127.0.0.1", "example.com"} {
		if allowedCopilotHost(host) {
			t.Fatalf("expected %s to be rejected", host)
		}
	}
}

func TestModelListUsesExchangeCacheAndPickerFilter(t *testing.T) {
	allowTestCopilotHosts(t)
	requester.HTTPClient = &http.Client{}
	resetTokenStore()
	var exchanges atomic.Int32
	var inference *httptest.Server
	inference = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer copilot-token" {
			t.Errorf("unexpected authorization: %s", r.Header.Get("Authorization"))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"id": "enabled", "model_picker_enabled": true}, {"id": "disabled", "model_picker_enabled": false}, {"id": "legacy"}}})
	}))
	defer inference.Close()
	github := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/copilot_internal/user":
			_ = json.NewEncoder(w).Encode(map[string]any{"endpoints": map[string]string{"api": inference.URL}})
		case "/copilot_internal/v2/token":
			exchanges.Add(1)
			_ = json.NewEncoder(w).Encode(map[string]any{"token": "copilot-token", "refresh_in": 3600})
		default:
			http.NotFound(w, r)
		}
	}))
	defer github.Close()
	old := githubAPIBase
	githubAPIBase = github.URL
	defer func() { githubAPIBase = old }()
	p := New(&model.Channel{Id: 101, Key: `{"access_token":"gho_test"}`})
	for i := 0; i < 2; i++ {
		got, err := p.GetModelList()
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 2 || got[0] != "enabled" || got[1] != "legacy" {
			t.Fatalf("unexpected models: %#v", got)
		}
	}
	if exchanges.Load() != 1 {
		t.Fatalf("expected one cached exchange, got %d", exchanges.Load())
	}
}

func TestModelListRefreshesOnceOnUnauthorized(t *testing.T) {
	allowTestCopilotHosts(t)
	requester.HTTPClient = &http.Client{}
	resetTokenStore()
	var exchanges atomic.Int32
	var requests atomic.Int32
	inference := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Header.Get("Authorization") == "Bearer token-1" {
			http.Error(w, `{"error":{"message":"expired"}}`, http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"id": "ok"}}})
	}))
	defer inference.Close()
	github := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/copilot_internal/user" {
			_ = json.NewEncoder(w).Encode(map[string]any{"endpoints": map[string]string{"api": inference.URL}})
			return
		}
		n := exchanges.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{"token": "token-" + string(rune('0'+n)), "refresh_in": 3600})
	}))
	defer github.Close()
	old := githubAPIBase
	githubAPIBase = github.URL
	defer func() { githubAPIBase = old }()
	p := New(&model.Channel{Id: 102, Key: "gho_test"})
	models, err := p.GetModelList()
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 1 || models[0] != "ok" {
		t.Fatalf("unexpected models: %#v", models)
	}
	if exchanges.Load() != 2 || requests.Load() != 2 {
		t.Fatalf("expected one retry, exchanges=%d requests=%d", exchanges.Load(), requests.Load())
	}
}

func allowTestCopilotHosts(t *testing.T) {
	t.Helper()
	previous := copilotEndpointValidator
	copilotEndpointValidator = func(*url.URL) bool { return true }
	t.Cleanup(func() { copilotEndpointValidator = previous })
}

func resetTokenStore() {
	tokenStore.Lock()
	tokenStore.entries = map[string]tokenEntry{}
	tokenStore.flights = map[string]*inflight{}
	tokenStore.failures = map[string]tokenFailure{}
	tokenStore.Unlock()
}
