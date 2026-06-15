package relay

import (
	"fmt"
	"strings"
	"testing"
)

func TestRelayDebugSanitizeBodyRedactsSecrets(t *testing.T) {
	body := []byte(`{"api_key":"sk-test123456789","nested":{"authorization":"Bearer abcdefghijklmnop","token":"plain-token"},"prompt":"keep me"}`)

	got := sanitizeRelayDebugBody(body)

	if strings.Contains(got, "sk-test123456789") || strings.Contains(got, "abcdefghijklmnop") || strings.Contains(got, "plain-token") {
		t.Fatalf("sanitizeRelayDebugBody leaked a secret: %s", got)
	}
	if !strings.Contains(got, "keep me") {
		t.Fatalf("sanitizeRelayDebugBody removed non-sensitive content: %s", got)
	}
}

func TestRelayDebugRedactsQuerySecrets(t *testing.T) {
	got := redactRelayDebugSecretsInText("api_key=sk-test123456789&auth=Bearer abcdefghijklmnop&name=ringbuff")

	if strings.Contains(got, "sk-test123456789") || strings.Contains(got, "abcdefghijklmnop") {
		t.Fatalf("redactRelayDebugSecretsInText leaked a secret: %s", got)
	}
	if !strings.Contains(got, "ringbuff") {
		t.Fatalf("redactRelayDebugSecretsInText removed safe query content: %s", got)
	}
}

func TestRelayDebugCaptureFilter(t *testing.T) {
	store := newRelayDebugRingBuffer(10)
	store.setEnabled(true, 10, 7, 11)

	if !store.shouldCapture(7, 11) {
		t.Fatal("expected matching user and token to be captured")
	}
	if store.shouldCapture(8, 11) {
		t.Fatal("expected non-matching user to be skipped")
	}
	if store.shouldCapture(7, 12) {
		t.Fatal("expected non-matching token to be skipped")
	}

	store.setEnabled(true, 10, 0, 11)
	if !store.shouldCapture(99, 11) {
		t.Fatal("expected all users to match when user filter is all")
	}

	store.setEnabled(false, 10, 0, 0)
	if store.shouldCapture(99, 11) {
		t.Fatal("expected disabled capture to skip all requests")
	}
}

func TestRelayDebugStreamResponseFieldsMergeChunks(t *testing.T) {
	body := []byte(strings.Join([]string{
		`data: {"choices":[{"delta":{"content":"hel"}}]}`,
		`data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"total_tokens":2}}`,
		`data: [DONE]`,
	}, "\n\n"))

	fields := buildRelayDebugFields(body, true, true)

	var content string
	for _, field := range fields {
		if field.Name == "assistant.content" {
			content = field.Content
		}
	}
	if content != "hello" {
		t.Fatalf("expected merged stream content hello, got fields=%#v", fields)
	}
}

func TestRelayDebugStreamResponseFieldsExpandsToolCallJSON(t *testing.T) {
	body := []byte(strings.Join([]string{
		`data: {"output_text_delta":"{\"server\":\"user-jetbrains\",\"toolName\":\"read_file\",\"arguments\":{\"file_path\":\"Plugins\\\\KFEngine\\\\Source\\\\KFEngine\\\\Private\\\\Logic\\\\Unit\\\\Manager\\\\KFDropItemManager.cpp\",\"max_lines\":160}}"}`,
		`data: [DONE]`,
	}, "\n\n"))

	fields := buildRelayDebugStreamResponseFields(body)
	got := map[string]string{}
	for _, field := range fields {
		got[field.Name] = field.Content
	}
	if got["tool_call.0.server"] != "user-jetbrains" || got["tool_call.0.name"] != "read_file" {
		t.Fatalf("expected expanded tool call fields, got %#v", fields)
	}
	if !strings.Contains(got["tool_call.0.arguments"], "KFDropItemManager.cpp") {
		t.Fatalf("expected expanded arguments field, got %#v", fields)
	}
}

func TestRelayDebugResponsesRequestFieldsCoverToolsAndInputItems(t *testing.T) {
	body := []byte(`{
		"model":"gpt-5",
		"instructions":"be concise",
		"input":[
			{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]},
			{"type":"function_call_output","call_id":"call_1","output":"done"}
		],
		"tools":[{"type":"function","name":"lookup","parameters":{"type":"object"}}],
		"tool_choice":"auto",
		"reasoning":{"effort":"medium"}
	}`)

	fields := buildRelayDebugFields(body, false, false)
	got := relayDebugTestFields(fields)
	if got["input.0.content.0.input_text.text"] != "hello" {
		t.Fatalf("expected responses input text field, got %#v", fields)
	}
	if got["input.1.output"] != "done" {
		t.Fatalf("expected function output field, got %#v", fields)
	}
	if got["tools.0.name"] != "lookup" || got["reasoning"] == "" {
		t.Fatalf("expected tool and reasoning fields, got %#v", fields)
	}
}

func TestRelayDebugResponsesRequestFieldsCoverUntypedInputMessage(t *testing.T) {
	body := []byte(`{
		"input":[
			{
				"content":[
					{
						"text":"Output the numbers 1 through 120 separated by a single space. No commas, no newlines, no explanation.",
						"type":"input_text"
					}
				],
				"role":"user"
			}
		],
		"model":"deepseek-v4-pro",
		"stream":false
	}`)

	fields := buildRelayDebugFields(body, false, false)
	got := relayDebugTestFields(fields)
	if got["input.0.content.0.input_text.text"] != "Output the numbers 1 through 120 separated by a single space. No commas, no newlines, no explanation." {
		t.Fatalf("expected untyped input message to expand text, got %#v", fields)
	}
	if got["input.0.role"] != "user" || got["model"] != "deepseek-v4-pro" || got["stream"] != "false" {
		t.Fatalf("expected role/model/stream fields, got %#v", fields)
	}
}

func TestRelayDebugResponsesResponseFieldsCoverOutputItems(t *testing.T) {
	body := []byte(`{
		"id":"resp_1",
		"status":"completed",
		"output":[
			{"type":"reasoning","id":"rs_1","summary":[{"type":"summary_text","text":"thought"}]},
			{"type":"function_call","id":"fc_1","call_id":"call_1","name":"read_file","arguments":"{\"path\":\"main.go\"}"},
			{"type":"message","id":"msg_1","role":"assistant","content":[{"type":"output_text","text":"answer"}]}
		],
		"usage":{"input_tokens":1,"output_tokens":2,"total_tokens":3}
	}`)

	fields := buildRelayDebugFields(body, true, false)
	got := relayDebugTestFields(fields)
	if got["output.0.summary"] == "" || got["output.1.name"] != "read_file" || got["output.2.content.0.output_text.text"] != "answer" {
		t.Fatalf("expected responses output fields, got %#v", fields)
	}
	if got["usage"] == "" {
		t.Fatalf("expected usage field, got %#v", fields)
	}
}

func TestRelayDebugResponsesStreamFieldsCoverEvents(t *testing.T) {
	body := []byte(strings.Join([]string{
		`event: response.output_item.added`,
		`data: {"type":"response.output_item.added","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"read_file","arguments":""}}`,
		``,
		`event: response.function_call_arguments.delta`,
		`data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","delta":"{\"path\":\"main.go\"}"}`,
		``,
		`event: response.output_text.delta`,
		`data: {"type":"response.output_text.delta","delta":"hello"}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1,"output_tokens":2,"total_tokens":3}}}`,
	}, "\n"))

	fields := buildRelayDebugStreamResponseFields(body)
	got := relayDebugTestFields(fields)
	if got["event.response.output_item.added.item.name"] != "read_file" {
		t.Fatalf("expected output item field, got %#v", fields)
	}
	if got["event.response.function_call_arguments.delta.item_id"] != "fc_1" {
		t.Fatalf("expected function delta item id, got %#v", fields)
	}
	if got["assistant.content"] != "hello" || got["usage"] == "" {
		t.Fatalf("expected text and usage fields, got %#v", fields)
	}
}

func TestRelayDebugRenderFieldsAsRawCompactsStreamResponse(t *testing.T) {
	body := []byte(strings.Join([]string{
		`data: {"choices":[{"delta":{"content":"hel"}}]}`,
		`data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}`,
		`data: [DONE]`,
	}, "\n\n"))

	got := renderRelayDebugFieldsAsRaw(buildRelayDebugStreamResponseFields(body))

	if strings.Contains(got, "data:") {
		t.Fatalf("expected compact body without SSE data lines, got %s", got)
	}
	if !strings.Contains(got, "hello") {
		t.Fatalf("expected compact body to include merged content, got %s", got)
	}
}

func relayDebugTestFields(fields []RelayDebugField) map[string]string {
	got := map[string]string{}
	for _, field := range fields {
		got[field.Name] = field.Content
	}
	return got
}

func TestRelayDebugSnapshotHydratesRawWithoutStoringBody(t *testing.T) {
	store := newRelayDebugRingBuffer(3)
	store.setEnabled(true, 10, 0, 0)
	store.add(RelayDebugEntry{
		Path:          "/v1/chat/completions",
		RequestFields: []RelayDebugField{{Name: "messages.0.user", Content: "hello", Kind: "user"}},
	})

	_, entries := store.snapshot()
	if len(entries) != 1 {
		t.Fatalf("expected one entry, got %d", len(entries))
	}
	if entries[0].RequestBody == "" || !strings.Contains(entries[0].RequestBody, "hello") {
		t.Fatalf("expected snapshot to hydrate request body from fields, got %#v", entries[0])
	}
	if store.entries[0].RequestBody != "" {
		t.Fatalf("expected ring buffer to keep raw body empty, got %q", store.entries[0].RequestBody)
	}
}

func TestRelayDebugListReturnsNewestSummariesWithoutBodies(t *testing.T) {
	store := newRelayDebugRingBuffer(5)
	store.setEnabled(true, 10, 0, 0)

	for i := 0; i < 4; i++ {
		store.add(RelayDebugEntry{
			Path:           fmt.Sprintf("/v1/%d", i),
			RequestBody:    "request body should not be summarized",
			ResponseBody:   "response body should not be summarized",
			RequestFields:  []RelayDebugField{{Name: "messages.0.user", Content: strings.Repeat("hello", 100), Kind: "user"}},
			ResponseFields: []RelayDebugField{{Name: "choices.0.message", Content: strings.Repeat("world", 100), Kind: "assistant"}},
		})
	}

	_, entries, total, hasMore := store.list(1, 2)
	if total != 4 || !hasMore || len(entries) != 2 {
		t.Fatalf("expected paged summary list, got total=%d hasMore=%v entries=%#v", total, hasMore, entries)
	}
	if entries[0].Path != "/v1/2" || entries[1].Path != "/v1/1" {
		t.Fatalf("expected newest-first page after offset, got %#v", entries)
	}
}

func TestRelayDebugListIfChangedSkipsUnchangedSummaries(t *testing.T) {
	store := newRelayDebugRingBuffer(5)
	store.setEnabled(true, 10, 0, 0)
	store.add(RelayDebugEntry{Path: "/v1/first"})

	state, entries, total, hasMore, changed := store.listIfChanged(0, 5, 1, 1)
	if changed || len(entries) != 0 || total != 1 || hasMore {
		t.Fatalf("expected unchanged cursor to skip summaries, state=%#v entries=%#v total=%d hasMore=%v changed=%v", state, entries, total, hasMore, changed)
	}

	store.add(RelayDebugEntry{Path: "/v1/second"})
	_, entries, total, _, changed = store.listIfChanged(0, 5, 1, 1)
	if !changed || total != 2 || len(entries) != 2 {
		t.Fatalf("expected changed cursor to return summaries, entries=%#v total=%d changed=%v", entries, total, changed)
	}
	if entries[0].Path != "/v1/second" {
		t.Fatalf("expected newest entry first, got %#v", entries)
	}
}

func TestRelayDebugGetHydratesSingleEntry(t *testing.T) {
	store := newRelayDebugRingBuffer(3)
	store.setEnabled(true, 10, 0, 0)
	store.add(RelayDebugEntry{
		Path:           "/v1/chat/completions",
		RequestFields:  []RelayDebugField{{Name: "messages.0.user", Content: "hello", Kind: "user"}},
		ResponseFields: []RelayDebugField{{Name: "choices.0.message", Content: "world", Kind: "assistant"}},
	})

	entry, ok := store.get(1)
	if !ok {
		t.Fatal("expected entry id 1")
	}
	if entry.RequestBody == "" || entry.ResponseBody == "" {
		t.Fatalf("expected detail endpoint to hydrate raw bodies, got %#v", entry)
	}
}

func TestRelayDebugRingBufferKeepsNewestEntries(t *testing.T) {
	store := newRelayDebugRingBuffer(3)
	store.setEnabled(true, 10, 0, 0)

	for i := 0; i < 5; i++ {
		store.add(RelayDebugEntry{Path: fmt.Sprintf("/v1/%d", i)})
	}

	state, entries := store.snapshot()
	if state.Count != 3 || len(entries) != 3 {
		t.Fatalf("expected 3 entries, got state=%d len=%d", state.Count, len(entries))
	}
	if entries[0].Path != "/v1/2" || entries[2].Path != "/v1/4" {
		t.Fatalf("expected newest rolling window, got %#v", entries)
	}
}
