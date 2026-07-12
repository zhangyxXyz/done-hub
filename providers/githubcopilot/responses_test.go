package githubcopilot

import (
	"encoding/json"
	"testing"
)

func TestCopilotResponsesStreamNormalizerKeepsItemIDStable(t *testing.T) {
	normalizer := newCopilotResponsesStreamNormalizer()
	events := []string{
		`{"type":"response.output_item.added","output_index":0,"item":{"type":"reasoning","id":"encrypted-added","summary":[]}}`,
		`{"type":"response.reasoning_summary_part.added","output_index":0,"item_id":"encrypted-summary","summary_index":0}`,
		`{"type":"response.output_item.done","output_index":0,"item":{"type":"reasoning","id":"encrypted-done","summary":[]}}`,
	}

	for index, raw := range events {
		patched := normalizer.Patch([]byte(raw))
		var event map[string]any
		if err := json.Unmarshal(patched, &event); err != nil {
			t.Fatalf("event %d is invalid JSON: %v", index, err)
		}
		if itemID, ok := event["item_id"].(string); ok && itemID != "encrypted-added" {
			t.Fatalf("event %d item_id = %q", index, itemID)
		}
		if item, ok := event["item"].(map[string]any); ok && item["id"] != "encrypted-added" {
			t.Fatalf("event %d item.id = %q", index, item["id"])
		}
	}
}

func TestCopilotResponsesStreamNormalizerLeavesUnknownEventUntouched(t *testing.T) {
	normalizer := newCopilotResponsesStreamNormalizer()
	raw := []byte(`{"type":"response.created","response":{"id":"response-id"}}`)
	if got := string(normalizer.Patch(raw)); got != string(raw) {
		t.Fatalf("unexpected patch: %s", got)
	}
}
