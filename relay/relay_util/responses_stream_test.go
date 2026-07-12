package relay_util

import (
	"bufio"
	"done-hub/types"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestChatToResponsesStreamEmitsLinkedTextPart(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	converter := NewOpenAIResponsesStreamConverter(ctx, &types.OpenAIResponsesRequest{Model: "gpt-test", Stream: true}, &types.Usage{})

	converter.ProcessStreamData(`{"id":"","created":0,"model":"gpt-test","choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}`)
	converter.ProcessStreamData(`{"id":"chatcmpl_test","created":123,"model":"gpt-test","choices":[{"index":0,"delta":{"content":"OK"}}]}`)
	converter.ProcessStreamData(`[DONE]`)

	events := decodeResponseEvents(t, recorder.Body.String())
	added := findResponseEvent(t, events, "response.output_item.added")
	if index, ok := added["output_index"].(float64); !ok || index != 0 {
		t.Fatalf("output_item.added output_index = %#v, want 0", added["output_index"])
	}
	item := added["item"].(map[string]any)
	itemID := item["id"].(string)
	if itemID == "" {
		t.Fatal("output item id is empty")
	}

	partAdded := findResponseEvent(t, events, "response.content_part.added")
	if partAdded["item_id"] != itemID {
		t.Fatalf("content part item_id = %#v, want %q", partAdded["item_id"], itemID)
	}
	part := partAdded["part"].(map[string]any)
	if text, ok := part["text"].(string); !ok || text != "" {
		t.Fatalf("content part text = %#v, want empty string", part["text"])
	}
	if annotations, ok := part["annotations"].([]any); !ok || len(annotations) != 0 {
		t.Fatalf("content part annotations = %#v, want []", part["annotations"])
	}

	created := findResponseEvent(t, events, "response.created")
	response := created["response"].(map[string]any)
	if response["id"] == "" || response["created_at"].(float64) <= 0 {
		t.Fatalf("created response lacks fallback metadata: %#v", response)
	}

	for _, event := range events {
		if event["type"] == "response.output_text.delta" && event["delta"] == "" {
			t.Fatal("empty output_text delta was emitted")
		}
	}
}

func TestChatToResponsesStreamSupportsParallelToolCalls(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	converter := NewOpenAIResponsesStreamConverter(ctx, &types.OpenAIResponsesRequest{Model: "gpt-test", Stream: true}, &types.Usage{})

	converter.ProcessStreamData(`{"id":"chatcmpl_tools","created":123,"model":"gpt-test","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"tool_a","arguments":"{\"a\":"}},{"index":1,"id":"call_b","type":"function","function":{"name":"tool_b","arguments":"{\"b\":"}}]}}]}`)
	converter.ProcessStreamData(`{"id":"chatcmpl_tools","created":123,"model":"gpt-test","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}},{"index":1,"function":{"arguments":"2}"}}]}}]}`)
	converter.ProcessStreamData(`{"id":"chatcmpl_tools","created":123,"model":"gpt-test","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}`)
	converter.ProcessStreamData(`[DONE]`)

	events := decodeResponseEvents(t, recorder.Body.String())
	added := findResponseEvents(events, "response.output_item.added")
	if len(added) != 2 {
		t.Fatalf("output_item.added count = %d, want 2", len(added))
	}
	for index, event := range added {
		if event["output_index"].(float64) != float64(index) {
			t.Fatalf("tool %d output_index = %#v", index, event["output_index"])
		}
	}
	if added[0]["item"].(map[string]any)["name"] != "tool_a" || added[1]["item"].(map[string]any)["name"] != "tool_b" {
		t.Fatalf("tool metadata missing from output_item.added: %#v", added)
	}
	done := findResponseEvents(events, "response.function_call_arguments.done")
	if len(done) != 2 || done[0]["name"] != "tool_a" || done[1]["name"] != "tool_b" {
		t.Fatalf("unexpected function call done events: %#v", done)
	}
	if done[0]["arguments"] != `{"a":1}` {
		t.Fatalf("tool_a arguments = %#v", done[0]["arguments"])
	}
	completed := findResponseEvent(t, events, "response.completed")
	response := completed["response"].(map[string]any)
	if len(response["output"].([]any)) != 2 || response["status"] != types.ResponseStatusCompleted {
		t.Fatalf("unexpected completed response: %#v", response)
	}
}

func decodeResponseEvents(t *testing.T, stream string) []map[string]any {
	t.Helper()
	var events []map[string]any
	scanner := bufio.NewScanner(strings.NewReader(stream))
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var event map[string]any
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &event); err != nil {
			t.Fatalf("decode event: %v", err)
		}
		events = append(events, event)
	}
	return events
}

func findResponseEvent(t *testing.T, events []map[string]any, eventType string) map[string]any {
	t.Helper()
	for _, event := range events {
		if event["type"] == eventType {
			return event
		}
	}
	t.Fatalf("event %s not found", eventType)
	return nil
}

func findResponseEvents(events []map[string]any, eventType string) []map[string]any {
	matched := make([]map[string]any, 0)
	for _, event := range events {
		if event["type"] == eventType {
			matched = append(matched, event)
		}
	}
	return matched
}
