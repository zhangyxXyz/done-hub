package opencode

import (
	"done-hub/model"
	"done-hub/providers/openai"
	"strings"
	"testing"
	"time"
)

func TestBuildAuthCookie(t *testing.T) {
	tests := map[string]string{
		"token":                           "auth=token",
		"Cookie: auth=token; other=value": "auth=token",
		"other=value; auth=token":         "auth=token",
		"cookie: AUTH=token":              "auth=token",
		"auth=":                           "",
	}
	for input, want := range tests {
		if got := buildAuthCookie(input); got != want {
			t.Fatalf("buildAuthCookie(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestParseUsageWindowsHandlesFieldOrder(t *testing.T) {
	html := `rollingUsage: $R[1] = {usagePercent: 12.5, resetInSec: 60}
	weeklyUsage: $R[2] = {resetInSec: 120, usagePercent: 42}
	monthlyUsage: $R[3] = {usagePercent: 101, resetInSec: 180}`
	now := time.Unix(1_700_000_000, 0)
	windows := parseUsageWindows(html, now)
	if len(windows) != 3 {
		t.Fatalf("got %d windows, want 3", len(windows))
	}
	if windows[0].UsedPercent != 12.5 || windows[0].ResetAt != now.Unix()+60 {
		t.Fatalf("unexpected rolling window: %+v", windows[0])
	}
	if windows[1].UsedPercent != 42 || windows[1].ResetInSeconds != 120 {
		t.Fatalf("unexpected weekly window: %+v", windows[1])
	}
	if windows[2].UsedPercent != 100 || windows[2].RemainingPercent != 0 {
		t.Fatalf("unexpected monthly window: %+v", windows[2])
	}
}

func TestExtractWorkspaceID(t *testing.T) {
	if got := extractWorkspaceID("https://opencode.ai/workspace/wrk_abc123/go"); got != "wrk_abc123" {
		t.Fatalf("unexpected workspace id %q", got)
	}
}

func TestParseCredentials(t *testing.T) {
	credentials := parseCredentials(`{"api_key":" sk-test ","auth_cookie":" auth=session "}`)
	if credentials.APIKey != "sk-test" || credentials.AuthCookie != "auth=session" {
		t.Fatalf("unexpected credentials: %+v", credentials)
	}
	if credentials := parseCredentials("sk-plain"); credentials.APIKey != "sk-plain" || credentials.AuthCookie != "" {
		t.Fatalf("unexpected plain credentials: %+v", credentials)
	}
}

func TestParseCredentialsRejectsInvalidJSON(t *testing.T) {
	tests := []string{`{"api_key":`, `{"auth_cookie":"auth=session"}`, "sk-one\nsk-two"}
	for _, input := range tests {
		if _, err := ParseCredentials(input); err == nil {
			t.Fatalf("ParseCredentials(%q) unexpectedly succeeded", input)
		}
	}
}

func TestUsageCacheKeyChangesWithAccountAndWorkspace(t *testing.T) {
	first := (&Provider{OpenAIProvider: newOpenAIProviderForTest(7, `{"api_key":"a","auth_cookie":"auth=one"}`)}).usageCacheKey(UsageCacheConfig{WorkspaceID: "wrk_one"})
	second := (&Provider{OpenAIProvider: newOpenAIProviderForTest(7, `{"api_key":"a","auth_cookie":"auth=two"}`)}).usageCacheKey(UsageCacheConfig{WorkspaceID: "wrk_one"})
	third := (&Provider{OpenAIProvider: newOpenAIProviderForTest(7, `{"api_key":"a","auth_cookie":"auth=one"}`)}).usageCacheKey(UsageCacheConfig{WorkspaceID: "wrk_two"})
	if first == second || first == third {
		t.Fatalf("cache keys were not isolated: %q %q %q", first, second, third)
	}
	if strings.Contains(first, "auth=") {
		t.Fatalf("cache key contains credential material: %q", first)
	}
}

func TestGetUsageCacheConfigRejectsExternalDashboardBase(t *testing.T) {
	provider := &Provider{OpenAIProvider: newOpenAIProviderForTest(7, `{"api_key":"a","auth_cookie":"auth=one"}`)}
	provider.Channel.Other = `{"dashboard_base":"https://example.com/steal"}`
	if got := provider.GetUsageCacheConfig().DashboardBase; got != defaultDashboardBase {
		t.Fatalf("external dashboard base was accepted: %q", got)
	}
	provider.Channel.Other = `{"dashboard_base":"https://opencode.ai/workspace/"}`
	if got := provider.GetUsageCacheConfig().DashboardBase; got != defaultDashboardBase {
		t.Fatalf("official dashboard base = %q, want %q", got, defaultDashboardBase)
	}
}

func TestSelectWorkspaceID(t *testing.T) {
	matches := [][]string{{"", "wrk_one", "Default"}, {"", "wrk_two", "Team"}}
	if got, err := selectWorkspaceID(matches, ""); err != nil || got != "wrk_one" {
		t.Fatalf("empty hint = %q, %v", got, err)
	}
	if got, err := selectWorkspaceID(matches, "team"); err != nil || got != "wrk_two" {
		t.Fatalf("named hint = %q, %v", got, err)
	}
	if _, err := selectWorkspaceID(matches, "missing"); err == nil {
		t.Fatal("missing workspace hint unexpectedly fell back to the first workspace")
	}
}

func TestProviderUsesOnlyAPIKeyForAuthorization(t *testing.T) {
	channel := &model.Channel{Key: `{"api_key":"sk-test","auth_cookie":"auth=session"}`}
	provider := ProviderFactory{}.Create(channel).(*Provider)
	headers := provider.GetRequestHeaders()
	if headers["Authorization"] != "Bearer sk-test" {
		t.Fatalf("unexpected authorization header %q", headers["Authorization"])
	}
	if value := headers["Cookie"]; value != "" {
		t.Fatalf("Dashboard cookie leaked into model request: %q", value)
	}
	if provider.SupportResponse {
		t.Fatal("OpenCode Go should not advertise native Responses support")
	}
	if provider.BalanceAction {
		t.Fatal("OpenCode Go should not advertise OpenAI balance support")
	}
}

func newOpenAIProviderForTest(id int, key string) openai.OpenAIProvider {
	provider := openai.CreateOpenAIProvider(&model.Channel{Id: id, Key: key}, DefaultBaseURL)
	return *provider
}
