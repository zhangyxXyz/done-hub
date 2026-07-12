package relay

import "testing"

func TestShouldUseResponses(t *testing.T) {
	if !shouldUseResponses("any-model", "any-model", true, nil) {
		t.Fatal("global Chat to Responses switch should match every model")
	}
	if !shouldUseResponses("gpt-test", "client-model", false, []string{"gpt-*"}) {
		t.Fatal("model pattern should enable Chat to Responses")
	}
	if shouldUseResponses("claude-test", "client-model", false, []string{"gpt-*"}) {
		t.Fatal("unmatched model should stay on Chat Completions")
	}
	if !shouldUseResponses("mapped-model", "client-gpt", false, []string{"client-*"}) {
		t.Fatal("original client model should also match channel conversion patterns")
	}
}
