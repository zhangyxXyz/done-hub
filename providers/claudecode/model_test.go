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
