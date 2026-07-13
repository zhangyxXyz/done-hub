package controller

import (
	"done-hub/common/config"
	"reflect"
	"testing"
)

func TestParseUsageList(t *testing.T) {
	got, err := parseUsageList(" codex,github-copilot,CODEX ", 3)
	if err != nil {
		t.Fatalf("parseUsageList returned error: %v", err)
	}
	want := []string{"codex", "github-copilot"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseUsageList = %#v, want %#v", got, want)
	}
	if _, err := parseUsageList("codex,,claude", 3); err == nil {
		t.Fatal("parseUsageList accepted an empty item")
	}
	if _, err := parseUsageList("a,b,c", 2); err == nil {
		t.Fatal("parseUsageList accepted more than the configured maximum")
	}
}

func TestParseUsageChannelIDs(t *testing.T) {
	got, err := parseUsageChannelIDs("3,1,3", 3)
	if err != nil {
		t.Fatalf("parseUsageChannelIDs returned error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("parseUsageChannelIDs returned %d ids, want 2", len(got))
	}
	if _, ok := got[1]; !ok {
		t.Fatal("channel id 1 missing")
	}
	if _, err := parseUsageChannelIDs("1,-2", 3); err == nil {
		t.Fatal("parseUsageChannelIDs accepted a negative id")
	}
}

func TestMatchesAnyUsageProvider(t *testing.T) {
	if !matchesAnyUsageProvider(config.ChannelTypeGithubCopilot, []string{"codex", "github"}) {
		t.Fatal("GitHub Copilot provider alias did not match")
	}
	if matchesAnyUsageProvider(config.ChannelTypeClaudeCode, []string{"codex", "github"}) {
		t.Fatal("Claude Code unexpectedly matched unrelated providers")
	}
	if !matchesAnyUsageProvider(config.ChannelTypeOpenCode, []string{"opencode-go"}) {
		t.Fatal("OpenCode provider alias did not match")
	}
}
