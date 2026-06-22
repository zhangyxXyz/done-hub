package claudecode

import (
	"done-hub/providers/claude"
	"reflect"
	"testing"
)

func TestParseClaudeCodeModelListCollapsesSnapshotsAndDropsOldFamilies(t *testing.T) {
	response := &claude.ModelListResponse{
		Data: []claude.Model{
			{ID: "claude-fable-5"},
			{ID: "claude-haiku-4-5-20251001"},
			{ID: "claude-opus-4-20250514"},
			{ID: "claude-opus-4-5-20251101"},
			{ID: "claude-opus-4-6"},
			{ID: "claude-opus-4-7"},
			{ID: "claude-opus-4-8"},
			{ID: "claude-sonnet-4-5-20250929"},
			{ID: "claude-sonnet-4-6"},
		},
	}

	got := parseClaudeCodeModelList(response)
	want := []string{
		"claude-fable-5",
		"claude-haiku-4-5",
		"claude-opus-4-6",
		"claude-opus-4-7",
		"claude-opus-4-8",
		"claude-sonnet-4-6",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseClaudeCodeModelList() = %#v, want %#v", got, want)
	}
}

func TestParseClaudeCodeModelListKeepsFutureAliases(t *testing.T) {
	response := &claude.ModelListResponse{
		Data: []claude.Model{
			{ID: "claude-opus-4-8"},
			{ID: "claude-opus-4-9"},
			{ID: "claude-sonnet-4-7"},
		},
	}

	got := parseClaudeCodeModelList(response)
	want := []string{"claude-opus-4-8", "claude-opus-4-9", "claude-sonnet-4-7"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseClaudeCodeModelList() = %#v, want %#v", got, want)
	}
}

func TestClaudeCodeModelDisallowsTemperature(t *testing.T) {
	tests := []struct {
		model string
		want  bool
	}{
		{model: "claude-opus-4-8", want: true},
		{model: "claude-haiku-4-5", want: true},
		{model: "claude-sonnet-4-6-20260101", want: true},
		{model: "claude-opus-5", want: true},
		{model: "claude-3-5-sonnet-20241022", want: false},
		{model: "claude-fable-5", want: false},
		{model: "gpt-5.5", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.model, func(t *testing.T) {
			if got := claudeCodeModelDisallowsTemperature(tt.model); got != tt.want {
				t.Fatalf("claudeCodeModelDisallowsTemperature(%q) = %v, want %v", tt.model, got, tt.want)
			}
		})
	}
}

func TestApplyClaudeCodeCompatibilityDropsTemperatureForClaude4(t *testing.T) {
	temperature := 0.7
	topP := 0.9
	request := &claude.ClaudeRequest{
		Model:       "claude-haiku-4-5",
		Messages:    []claude.Message{{Role: "user", Content: "hello"}},
		Temperature: &temperature,
		TopP:        &topP,
	}

	(&ClaudeCodeProvider{}).applyClaudeCodeCompatibility(request)

	if request.Temperature != nil {
		t.Fatalf("Temperature = %v, want nil", *request.Temperature)
	}
	if request.TopP == nil || *request.TopP != topP {
		t.Fatalf("TopP = %v, want %v", request.TopP, topP)
	}
}

func TestApplyClaudeCodeCompatibilityKeepsTemperatureForClaude3(t *testing.T) {
	temperature := 0.7
	request := &claude.ClaudeRequest{
		Model:       "claude-3-5-sonnet-20241022",
		Messages:    []claude.Message{{Role: "user", Content: "hello"}},
		Temperature: &temperature,
	}

	(&ClaudeCodeProvider{}).applyClaudeCodeCompatibility(request)

	if request.Temperature == nil || *request.Temperature != temperature {
		t.Fatalf("Temperature = %v, want %v", request.Temperature, temperature)
	}
}
