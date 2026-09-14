package codex

import (
	"done-hub/model"
	"reflect"
	"testing"
	"time"
)

func TestApplyDefaultHeadersUsesOneDynamicClientVersion(t *testing.T) {
	codexClientVersionCache.Lock()
	previousVersion := codexClientVersionCache.version
	previousExpiry := codexClientVersionCache.expiresAt
	codexClientVersionCache.version = "9.8.7"
	codexClientVersionCache.expiresAt = time.Now().Add(time.Minute)
	codexClientVersionCache.Unlock()
	t.Cleanup(func() {
		codexClientVersionCache.Lock()
		codexClientVersionCache.version = previousVersion
		codexClientVersionCache.expiresAt = previousExpiry
		codexClientVersionCache.Unlock()
	})

	provider := CodexProviderFactory{}.Create(&model.Channel{}).(*CodexProvider)
	headers := map[string]string{}
	provider.applyDefaultHeaders(headers)

	if got, want := headers["version"], "9.8.7"; got != want {
		t.Fatalf("version header = %q, want %q", got, want)
	}
	if got, want := headers["User-Agent"], "codex_cli_rs/9.8.7 (Ubuntu 22.4.0; x86_64) WindowsTerminal"; got != want {
		t.Fatalf("User-Agent header = %q, want %q", got, want)
	}
}

func TestParseCodexModelListUsesSlugAndDeduplicates(t *testing.T) {
	response := &codexModelListResponse{
		Models: []codexModelDetails{
			{Slug: "gpt-5.3-codex", Visibility: "list", Priority: 25},
			{Slug: "gpt-5.4-mini", Visibility: "list", Priority: 23},
			{Slug: "gpt-5.3-codex", Visibility: "list", Priority: 25},
			{ID: "fallback-id", Visibility: "hide", Priority: 1},
			{},
		},
	}

	got := parseCodexModelList(response)
	want := []string{"gpt-5.4-mini", "gpt-5.3-codex"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseCodexModelList() = %#v, want %#v", got, want)
	}
}

func TestParseCodexModelListFallsBackToData(t *testing.T) {
	response := &codexModelListResponse{
		Data: []codexModelDetails{
			{ID: "gpt-5.2", Visibility: "list"},
		},
	}

	got := parseCodexModelList(response)
	want := []string{"gpt-5.2"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseCodexModelList() = %#v, want %#v", got, want)
	}
}

func TestParseCodexModelListFiltersHiddenModels(t *testing.T) {
	response := &codexModelListResponse{
		Models: []codexModelDetails{
			{Slug: "codex-auto-review", Visibility: "hide", Priority: 1},
			{Slug: "gpt-5.5", Visibility: "list", Priority: 9},
			{Slug: "gpt-5.4", Visibility: "list", Priority: 16},
		},
	}

	got := parseCodexModelList(response)
	want := []string{"gpt-5.5", "gpt-5.4"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseCodexModelList() = %#v, want %#v", got, want)
	}
}

func TestWithCodexModelListClientVersion(t *testing.T) {
	got := withCodexModelListClientVersion("https://chatgpt.com/backend-api/codex/models", "0.134.0")
	want := "https://chatgpt.com/backend-api/codex/models?client_version=0.134.0"
	if got != want {
		t.Fatalf("withCodexModelListClientVersion() = %q, want %q", got, want)
	}

	got = withCodexModelListClientVersion("https://chatgpt.com/backend-api/codex/models?foo=bar", "0.134.0")
	want = "https://chatgpt.com/backend-api/codex/models?foo=bar&client_version=0.134.0"
	if got != want {
		t.Fatalf("withCodexModelListClientVersion() = %q, want %q", got, want)
	}
}

func TestIsValidCodexClientVersion(t *testing.T) {
	tests := []struct {
		version string
		want    bool
	}{
		{version: "0.134.0", want: true},
		{version: "0.134.0-alpha.3", want: true},
		{version: "", want: false},
		{version: "latest", want: false},
		{version: "0.134.0/../../x", want: false},
	}

	for _, tt := range tests {
		got := isValidCodexClientVersion(tt.version)
		if got != tt.want {
			t.Fatalf("isValidCodexClientVersion(%q) = %v, want %v", tt.version, got, tt.want)
		}
	}
}
