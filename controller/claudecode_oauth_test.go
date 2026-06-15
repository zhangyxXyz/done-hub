package controller

import (
	"net/url"
	"testing"
)

func TestClaudeCodeStateIsIndependentFromCodeVerifier(t *testing.T) {
	codeVerifier, err := generateCodeVerifier()
	if err != nil {
		t.Fatalf("generateCodeVerifier() verifier error = %v", err)
	}
	state, err := generateCodeVerifier()
	if err != nil {
		t.Fatalf("generateCodeVerifier() state error = %v", err)
	}
	if state == codeVerifier {
		t.Fatal("state should be generated independently from code_verifier")
	}

	params := url.Values{}
	params.Set("code_challenge", generateCodeChallenge(codeVerifier))
	params.Set("state", state)
	if params.Get("state") != state {
		t.Fatalf("state param = %q, want %q", params.Get("state"), state)
	}
}

func TestParseClaudeCodeCallbackInputKeepsDirectCodeState(t *testing.T) {
	code, state, err := parseClaudeCodeCallbackInput("auth-code-123456#state-verifier-abcdef")
	if err != nil {
		t.Fatalf("parseClaudeCodeCallbackInput() error = %v", err)
	}
	if code != "auth-code-123456" {
		t.Fatalf("code = %q, want %q", code, "auth-code-123456")
	}
	if state != "state-verifier-abcdef" {
		t.Fatalf("state = %q, want %q", state, "state-verifier-abcdef")
	}
}

func TestParseClaudeCodeCallbackInputKeepsURLFragmentState(t *testing.T) {
	input := "https://console.anthropic.com/oauth/code/callback?code=auth-code-123456#state=state-verifier-abcdef"
	code, state, err := parseClaudeCodeCallbackInput(input)
	if err != nil {
		t.Fatalf("parseClaudeCodeCallbackInput() error = %v", err)
	}
	if code != "auth-code-123456" {
		t.Fatalf("code = %q, want %q", code, "auth-code-123456")
	}
	if state != "state-verifier-abcdef" {
		t.Fatalf("state = %q, want %q", state, "state-verifier-abcdef")
	}
}
