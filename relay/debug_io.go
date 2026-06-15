package relay

import (
	"bytes"
	"done-hub/common"
	"done-hub/common/logger"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

const (
	relayDebugMaxEntries = 100
	relayDebugBodyLimit  = 256 * 1024
)

var (
	relayDebugSecretPattern = regexp.MustCompile(`(?i)\b(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,})`)
	relayDebugStore         = newRelayDebugRingBuffer(relayDebugMaxEntries)
)

type RelayDebugEntry struct {
	ID             int64             `json:"id"`
	CapturedAt     int64             `json:"captured_at"`
	RequestID      string            `json:"request_id"`
	Method         string            `json:"method"`
	Path           string            `json:"path"`
	Query          string            `json:"query"`
	Status         int               `json:"status"`
	DurationMs     int64             `json:"duration_ms"`
	UserID         int               `json:"user_id"`
	TokenID        int               `json:"token_id"`
	TokenName      string            `json:"token_name"`
	ChannelID      int               `json:"channel_id"`
	OriginalModel  string            `json:"original_model"`
	NewModel       string            `json:"new_model"`
	IsStream       bool              `json:"is_stream"`
	RequestBody    string            `json:"request_body"`
	ResponseBody   string            `json:"response_body"`
	RequestFields  []RelayDebugField `json:"request_fields"`
	ResponseFields []RelayDebugField `json:"response_fields"`
}

type RelayDebugEntrySummary struct {
	ID            int64  `json:"id"`
	CapturedAt    int64  `json:"captured_at"`
	RequestID     string `json:"request_id"`
	Method        string `json:"method"`
	Path          string `json:"path"`
	Query         string `json:"query"`
	Status        int    `json:"status"`
	DurationMs    int64  `json:"duration_ms"`
	UserID        int    `json:"user_id"`
	TokenID       int    `json:"token_id"`
	TokenName     string `json:"token_name"`
	ChannelID     int    `json:"channel_id"`
	OriginalModel string `json:"original_model"`
	NewModel      string `json:"new_model"`
	IsStream      bool   `json:"is_stream"`
}

type RelayDebugField struct {
	Name    string `json:"name"`
	Content string `json:"content"`
	Kind    string `json:"kind"`
}

type RelayDebugState struct {
	Enabled       bool  `json:"enabled"`
	ExpiresAt     int64 `json:"expires_at"`
	MaxEntries    int   `json:"max_entries"`
	Count         int   `json:"count"`
	NextID        int64 `json:"next_id"`
	BodyLimit     int   `json:"body_limit"`
	FilterUserID  int   `json:"filter_user_id"`
	FilterTokenID int   `json:"filter_token_id"`
}

type relayDebugRingBuffer struct {
	mu            sync.Mutex
	enabled       bool
	expiresAt     time.Time
	maxEntries    int
	nextID        int64
	filterUserID  int
	filterTokenID int
	entries       []RelayDebugEntry
}

type relayDebugResponseWriter struct {
	gin.ResponseWriter
	body bytes.Buffer
}

func newRelayDebugRingBuffer(maxEntries int) *relayDebugRingBuffer {
	return &relayDebugRingBuffer{
		maxEntries: maxEntries,
		entries:    make([]RelayDebugEntry, 0, maxEntries),
	}
}

func (w *relayDebugResponseWriter) Write(data []byte) (int, error) {
	writeLimited(&w.body, data, relayDebugBodyLimit)
	return w.ResponseWriter.Write(data)
}

func (w *relayDebugResponseWriter) WriteString(data string) (int, error) {
	writeLimited(&w.body, []byte(data), relayDebugBodyLimit)
	return w.ResponseWriter.WriteString(data)
}

func beginRelayIODebug(c *gin.Context) func() {
	if !relayDebugStore.shouldCapture(c.GetInt("id"), c.GetInt("token_id")) {
		return func() {}
	}

	requestBody, requestErr := common.ReadBodyRaw(c)
	writer := &relayDebugResponseWriter{ResponseWriter: c.Writer}
	c.Writer = writer
	startedAt := time.Now()

	return func() {
		isStream := c.GetBool("is_stream")
		responseBytes := writer.body.Bytes()
		requestFields := buildRelayDebugFields(requestBody, false, false)
		if requestErr != nil {
			requestFields = []RelayDebugField{{Name: "body", Content: "read request body failed: " + requestErr.Error(), Kind: "error"}}
		}
		responseFields := buildRelayDebugFields(responseBytes, true, isStream)

		entry := RelayDebugEntry{
			CapturedAt:     startedAt.Unix(),
			RequestID:      valueOrUnknown(c.GetString(logger.RequestIdKey)),
			Method:         c.Request.Method,
			Path:           c.Request.URL.Path,
			Query:          redactRelayDebugSecretsInText(c.Request.URL.RawQuery),
			Status:         writer.Status(),
			DurationMs:     time.Since(startedAt).Milliseconds(),
			UserID:         c.GetInt("id"),
			TokenID:        c.GetInt("token_id"),
			TokenName:      c.GetString("token_name"),
			ChannelID:      c.GetInt("channel_id"),
			OriginalModel:  c.GetString("original_model"),
			NewModel:       c.GetString("new_model"),
			IsStream:       isStream,
			RequestFields:  requestFields,
			ResponseFields: responseFields,
		}
		relayDebugStore.add(entry)
	}
}

func GetRelayDebugSnapshot() (RelayDebugState, []RelayDebugEntry) {
	return relayDebugStore.snapshot()
}

func GetRelayDebugList(offset, limit int) (RelayDebugState, []RelayDebugEntrySummary, int, bool) {
	return relayDebugStore.list(offset, limit)
}

func GetRelayDebugListIfChanged(offset, limit int, knownNextID int64, knownCount int) (RelayDebugState, []RelayDebugEntrySummary, int, bool, bool) {
	return relayDebugStore.listIfChanged(offset, limit, knownNextID, knownCount)
}

func GetRelayDebugEntry(id int64) (RelayDebugEntry, bool) {
	return relayDebugStore.get(id)
}

func SetRelayDebugEnabled(enabled bool, ttlMinutes int, filterUserID int, filterTokenID int) RelayDebugState {
	return relayDebugStore.setEnabled(enabled, ttlMinutes, filterUserID, filterTokenID)
}

func ClearRelayDebugEntries() RelayDebugState {
	return relayDebugStore.clear()
}

func (s *relayDebugRingBuffer) shouldCapture(userID int, tokenID int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireLocked()
	if !s.enabled {
		return false
	}
	if s.filterUserID > 0 && s.filterUserID != userID {
		return false
	}
	if s.filterTokenID > 0 && s.filterTokenID != tokenID {
		return false
	}
	return true
}

func (s *relayDebugRingBuffer) setEnabled(enabled bool, ttlMinutes int, filterUserID int, filterTokenID int) RelayDebugState {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.enabled = enabled
	s.expiresAt = time.Time{}
	if filterUserID < 0 {
		filterUserID = 0
	}
	if filterTokenID < 0 {
		filterTokenID = 0
	}
	s.filterUserID = filterUserID
	s.filterTokenID = filterTokenID
	if enabled {
		if ttlMinutes <= 0 {
			ttlMinutes = 10
		}
		if ttlMinutes > 60 {
			ttlMinutes = 60
		}
		s.expiresAt = time.Now().Add(time.Duration(ttlMinutes) * time.Minute)
	}
	return s.stateLocked()
}

func (s *relayDebugRingBuffer) add(entry RelayDebugEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireLocked()
	if !s.enabled {
		return
	}

	s.nextID++
	entry.ID = s.nextID
	if len(s.entries) >= s.maxEntries {
		copy(s.entries, s.entries[1:])
		s.entries[len(s.entries)-1] = entry
		return
	}
	s.entries = append(s.entries, entry)
}

func (s *relayDebugRingBuffer) clear() RelayDebugState {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries = s.entries[:0]
	return s.stateLocked()
}

func (s *relayDebugRingBuffer) snapshot() (RelayDebugState, []RelayDebugEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireLocked()
	entries := make([]RelayDebugEntry, len(s.entries))
	copy(entries, s.entries)
	for i := range entries {
		hydrateRelayDebugEntryBodies(&entries[i])
	}
	return s.stateLocked(), entries
}

func (s *relayDebugRingBuffer) list(offset, limit int) (RelayDebugState, []RelayDebugEntrySummary, int, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireLocked()

	state := s.stateLocked()
	entries, total, hasMore := s.listLocked(offset, limit)
	return state, entries, total, hasMore
}

func (s *relayDebugRingBuffer) listIfChanged(offset, limit int, knownNextID int64, knownCount int) (RelayDebugState, []RelayDebugEntrySummary, int, bool, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireLocked()

	state := s.stateLocked()
	if knownNextID == state.NextID && knownCount == state.Count {
		return state, nil, state.Count, false, false
	}

	entries, total, hasMore := s.listLocked(offset, limit)
	return state, entries, total, hasMore, true
}

func (s *relayDebugRingBuffer) listLocked(offset, limit int) ([]RelayDebugEntrySummary, int, bool) {
	total := len(s.entries)
	if offset < 0 {
		offset = 0
	}
	if limit <= 0 || limit > s.maxEntries {
		limit = s.maxEntries
	}
	if offset >= total {
		return []RelayDebugEntrySummary{}, total, false
	}

	summaries := make([]RelayDebugEntrySummary, 0, limit)
	for i := total - 1 - offset; i >= 0 && len(summaries) < limit; i-- {
		summaries = append(summaries, summarizeRelayDebugEntry(s.entries[i]))
	}
	return summaries, total, offset+len(summaries) < total
}

func (s *relayDebugRingBuffer) get(id int64) (RelayDebugEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireLocked()

	for i := len(s.entries) - 1; i >= 0; i-- {
		if s.entries[i].ID == id {
			entry := s.entries[i]
			hydrateRelayDebugEntryBodies(&entry)
			return entry, true
		}
	}
	return RelayDebugEntry{}, false
}

func (s *relayDebugRingBuffer) expireLocked() {
	if s.enabled && !s.expiresAt.IsZero() && time.Now().After(s.expiresAt) {
		s.enabled = false
		s.expiresAt = time.Time{}
	}
}

func (s *relayDebugRingBuffer) stateLocked() RelayDebugState {
	expiresAt := int64(0)
	if !s.expiresAt.IsZero() {
		expiresAt = s.expiresAt.Unix()
	}
	return RelayDebugState{
		Enabled:       s.enabled,
		ExpiresAt:     expiresAt,
		MaxEntries:    s.maxEntries,
		Count:         len(s.entries),
		NextID:        s.nextID,
		BodyLimit:     relayDebugBodyLimit,
		FilterUserID:  s.filterUserID,
		FilterTokenID: s.filterTokenID,
	}
}

func summarizeRelayDebugEntry(entry RelayDebugEntry) RelayDebugEntrySummary {
	return RelayDebugEntrySummary{
		ID:            entry.ID,
		CapturedAt:    entry.CapturedAt,
		RequestID:     entry.RequestID,
		Method:        entry.Method,
		Path:          entry.Path,
		Query:         entry.Query,
		Status:        entry.Status,
		DurationMs:    entry.DurationMs,
		UserID:        entry.UserID,
		TokenID:       entry.TokenID,
		TokenName:     entry.TokenName,
		ChannelID:     entry.ChannelID,
		OriginalModel: entry.OriginalModel,
		NewModel:      entry.NewModel,
		IsStream:      entry.IsStream,
	}
}

func sanitizeRelayDebugBody(body []byte) string {
	if len(body) > relayDebugBodyLimit {
		body = body[:relayDebugBodyLimit]
	}
	body = bytes.TrimPrefix(body, []byte{0xEF, 0xBB, 0xBF})
	bodyText := string(body)

	var parsed any
	if err := json.Unmarshal(body, &parsed); err == nil {
		redacted := redactRelayDebugJSON(parsed, "")
		if formatted, err := json.MarshalIndent(redacted, "", "  "); err == nil {
			bodyText = string(formatted)
		}
	}

	bodyText = redactRelayDebugSecretsInText(bodyText)

	if !utf8.ValidString(bodyText) {
		bodyText = strings.ToValidUTF8(bodyText, "[invalid utf8]")
	}
	if len(body) == relayDebugBodyLimit {
		bodyText += fmt.Sprintf("\n...[truncated at %d bytes]", relayDebugBodyLimit)
	}
	return bodyText
}

func buildRelayDebugFields(body []byte, response bool, stream bool) []RelayDebugField {
	if len(body) == 0 {
		return nil
	}
	if len(body) > relayDebugBodyLimit {
		body = body[:relayDebugBodyLimit]
	}
	if stream && response {
		return buildRelayDebugStreamResponseFields(body)
	}

	var parsed any
	if err := json.Unmarshal(body, &parsed); err != nil {
		return []RelayDebugField{{Name: "body", Content: sanitizeRelayDebugBody(body), Kind: "text"}}
	}
	redacted := redactRelayDebugJSON(parsed, "")
	fields := buildRelayDebugJSONFields(redacted, response)
	if len(fields) == 0 {
		if formatted, err := json.MarshalIndent(redacted, "", "  "); err == nil {
			return []RelayDebugField{{Name: "body", Content: string(formatted), Kind: "json"}}
		}
	}
	return fields
}

func buildRelayDebugJSONFields(value any, response bool) []RelayDebugField {
	root, ok := value.(map[string]any)
	if !ok {
		return []RelayDebugField{{Name: "body", Content: relayDebugContentToString(value), Kind: "json"}}
	}

	var fields []RelayDebugField
	seen := map[string]bool{}
	add := func(name string, value any, kind string) {
		appendRelayDebugField(&fields, seen, name, value, kind)
	}

	if messages, ok := root["messages"].([]any); ok {
		for i, message := range messages {
			msg, ok := message.(map[string]any)
			if !ok {
				continue
			}
			role := fmt.Sprint(msg["role"])
			if role == "" || role == "<nil>" {
				role = fmt.Sprintf("message[%d]", i)
			}
			prefix := fmt.Sprintf("messages.%d.%s", i, role)
			appendRelayDebugContentFields(&fields, seen, prefix+".content", msg["content"], role)
			add(prefix+".name", msg["name"], "meta")
			add(prefix+".tool_call_id", msg["tool_call_id"], "tool")
			add(prefix+".function_call", msg["function_call"], "tool")
			add(prefix+".tool_calls", msg["tool_calls"], "tool")
			add(prefix+".reasoning", msg["reasoning"], "reasoning")
			add(prefix+".reasoning_content", msg["reasoning_content"], "reasoning")
			add(prefix+".refusal", msg["refusal"], "error")
			add(prefix+".annotations", msg["annotations"], "meta")
			add(prefix+".audio", msg["audio"], "meta")
			add(prefix+".images", msg["images"], "image")
		}
	}

	if input, ok := root["input"]; ok {
		appendRelayDebugInputFields(&fields, seen, "input", input)
	}
	if instructions, ok := root["instructions"]; ok {
		add("instructions", instructions, "system")
	}

	if response {
		appendResponseTextFields(root, &fields, seen)
	}

	for _, key := range []string{
		"model", "stream", "temperature", "top_p", "top_k", "n", "stop", "max_tokens",
		"max_completion_tokens", "max_output_tokens", "max_tool_calls", "reasoning_effort",
		"reasoning", "response_format", "text", "tool_choice", "parallel_tool_calls",
		"stream_options", "modalities", "audio", "prediction", "web_search_options", "store",
		"verbosity", "include", "previous_response_id", "truncation", "top_logprobs",
		"metadata", "service_tier", "safety_identifier", "prompt_cache_key",
		"prompt_cache_retention", "conversation", "background",
	} {
		if value, ok := root[key]; ok {
			add(key, value, "meta")
		}
	}

	if tools, ok := root["tools"]; ok {
		appendRelayDebugToolsFields(&fields, seen, "tools", tools)
	}
	add("functions", root["functions"], "tool")
	add("function_call", root["function_call"], "tool")

	appendRelayDebugJSONFallback(&fields, seen, "json", root, "json", 4)
	return fields
}

func appendResponseTextFields(root map[string]any, fields *[]RelayDebugField, seen map[string]bool) {
	add := func(name string, value any, kind string) {
		appendRelayDebugField(fields, seen, name, value, kind)
	}
	if output, ok := root["output"].(string); ok && output != "" {
		add("output", output, "assistant")
	} else if outputs, ok := root["output"].([]any); ok {
		for i, output := range outputs {
			appendRelayDebugResponsesItemFields(fields, seen, fmt.Sprintf("output.%d", i), output)
		}
	}
	if outputText, ok := root["output_text"].(string); ok && outputText != "" {
		add("output_text", outputText, "assistant")
	}
	if choices, ok := root["choices"].([]any); ok {
		for i, choice := range choices {
			choiceMap, ok := choice.(map[string]any)
			if !ok {
				continue
			}
			if message, ok := choiceMap["message"].(map[string]any); ok {
				prefix := fmt.Sprintf("choices.%d.message", i)
				appendRelayDebugContentFields(fields, seen, prefix+".content", message["content"], "assistant")
				add(prefix+".tool_calls", message["tool_calls"], "tool")
				add(prefix+".function_call", message["function_call"], "tool")
				add(prefix+".reasoning", message["reasoning"], "reasoning")
				add(prefix+".reasoning_content", message["reasoning_content"], "reasoning")
				add(prefix+".refusal", message["refusal"], "error")
			}
			if delta, ok := choiceMap["delta"].(map[string]any); ok {
				prefix := fmt.Sprintf("choices.%d.delta", i)
				appendRelayDebugContentFields(fields, seen, prefix+".content", delta["content"], "assistant")
				add(prefix+".tool_calls", delta["tool_calls"], "tool")
				add(prefix+".function_call", delta["function_call"], "tool")
				add(prefix+".reasoning", delta["reasoning"], "reasoning")
				add(prefix+".reasoning_content", delta["reasoning_content"], "reasoning")
			}
			if text := relayDebugContentToString(choiceMap["text"]); text != "" {
				add(fmt.Sprintf("choices.%d.text", i), text, "assistant")
			}
			add(fmt.Sprintf("choices.%d.finish_reason", i), choiceMap["finish_reason"], "meta")
			add(fmt.Sprintf("choices.%d.logprobs", i), choiceMap["logprobs"], "meta")
		}
	}
	add("usage", root["usage"], "meta")
	add("error", root["error"], "error")
	add("incomplete_details", root["incomplete_details"], "error")
	add("status", root["status"], "meta")
}

func buildRelayDebugStreamResponseFields(body []byte) []RelayDebugField {
	lines := strings.Split(string(body), "\n")
	var content strings.Builder
	var reasoning strings.Builder
	var refusal strings.Builder
	var toolCalls []string
	var toolFields []RelayDebugField
	seenToolCalls := map[string]bool{}
	var finishReasons []string
	var eventTypes []string
	var usage any
	chunks := 0
	currentEvent := ""
	seen := map[string]bool{}

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "event:") {
			currentEvent = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var event map[string]any
		if err := json.Unmarshal([]byte(payload), &event); err != nil {
			continue
		}
		chunks++
		eventType := firstRelayDebugString(event, "type")
		if eventType == "" {
			eventType = currentEvent
		}
		if eventType != "" {
			eventTypes = append(eventTypes, eventType)
		}
		if eventUsage, ok := event["usage"]; ok && eventUsage != nil {
			usage = redactRelayDebugJSON(eventUsage, "usage")
		}
		if response, ok := event["response"].(map[string]any); ok {
			if responseUsage, ok := response["usage"]; ok && responseUsage != nil {
				usage = redactRelayDebugJSON(responseUsage, "usage")
			}
		}
		appendRelayDebugResponsesStreamEventFields(&toolFields, seen, eventType, event, &content, &reasoning, &refusal, seenToolCalls)
		if delta, ok := event["delta"].(string); ok && eventType == "" {
			content.WriteString(delta)
			appendRelayDebugToolFieldsFromTextSeen(&toolFields, delta, seenToolCalls)
		}
		if outputDelta, ok := event["output_text_delta"].(string); ok && eventType == "" {
			content.WriteString(outputDelta)
			appendRelayDebugToolFieldsFromTextSeen(&toolFields, outputDelta, seenToolCalls)
		}
		if choices, ok := event["choices"].([]any); ok {
			for _, choice := range choices {
				choiceMap, ok := choice.(map[string]any)
				if !ok {
					continue
				}
				if reason := relayDebugContentToString(choiceMap["finish_reason"]); reason != "" {
					finishReasons = append(finishReasons, reason)
				}
				if deltaMap, ok := choiceMap["delta"].(map[string]any); ok {
					deltaContent := relayDebugContentToString(deltaMap["content"])
					content.WriteString(deltaContent)
					appendRelayDebugToolFieldsFromTextSeen(&toolFields, deltaContent, seenToolCalls)
					reasoning.WriteString(relayDebugContentToString(deltaMap["reasoning_content"]))
					if calls, ok := deltaMap["tool_calls"]; ok {
						toolCalls = append(toolCalls, relayDebugContentToString(calls))
						appendRelayDebugToolFieldsFromValueSeen(&toolFields, calls, seenToolCalls)
					}
				}
			}
		}
		if response, ok := event["response"].(map[string]any); ok {
			appendResponseTextFromMap(response, &content)
			appendRelayDebugToolFieldsFromValueSeen(&toolFields, response, seenToolCalls)
		}
		appendRelayDebugToolFieldsFromValueSeen(&toolFields, event, seenToolCalls)
	}

	fields := []RelayDebugField{{Name: "stream.chunks", Content: fmt.Sprintf("%d", chunks), Kind: "meta"}}
	if len(eventTypes) > 0 {
		fields = append(fields, RelayDebugField{Name: "stream.event_types", Content: strings.Join(uniqueRelayDebugStrings(eventTypes), ", "), Kind: "meta"})
	}
	if content.Len() > 0 {
		fields = append(fields, RelayDebugField{Name: "assistant.content", Content: redactRelayDebugSecretsInText(content.String()), Kind: "assistant"})
	}
	if reasoning.Len() > 0 {
		fields = append(fields, RelayDebugField{Name: "assistant.reasoning", Content: redactRelayDebugSecretsInText(reasoning.String()), Kind: "reasoning"})
	}
	if refusal.Len() > 0 {
		fields = append(fields, RelayDebugField{Name: "assistant.refusal", Content: redactRelayDebugSecretsInText(refusal.String()), Kind: "error"})
	}
	if len(toolCalls) > 0 {
		fields = append(fields, RelayDebugField{Name: "tool_calls", Content: strings.Join(toolCalls, "\n"), Kind: "tool"})
	}
	fields = append(fields, toolFields...)
	if len(finishReasons) > 0 {
		fields = append(fields, RelayDebugField{Name: "finish_reason", Content: strings.Join(uniqueRelayDebugStrings(finishReasons), ", "), Kind: "meta"})
	}
	if usage != nil {
		fields = append(fields, RelayDebugField{Name: "usage", Content: relayDebugContentToString(usage), Kind: "meta"})
	}
	return fields
}

func hydrateRelayDebugEntryBodies(entry *RelayDebugEntry) {
	if entry.RequestBody == "" {
		entry.RequestBody = renderRelayDebugFieldsAsRaw(entry.RequestFields)
	}
	if entry.ResponseBody == "" {
		entry.ResponseBody = renderRelayDebugFieldsAsRaw(entry.ResponseFields)
	}
}

func renderRelayDebugFieldsAsRaw(fields []RelayDebugField) string {
	if len(fields) == 0 {
		return ""
	}
	if len(fields) == 1 && fields[0].Name == "body" {
		return fields[0].Content
	}

	compact := make(map[string]any, len(fields))
	for _, field := range fields {
		if field.Name == "" {
			continue
		}
		compact[field.Name] = relayDebugRawFieldValue(field.Content)
	}
	if len(compact) == 0 {
		return fieldTextRelayDebugFallback(fields)
	}
	formatted, err := json.MarshalIndent(compact, "", "  ")
	if err != nil {
		return fieldTextRelayDebugFallback(fields)
	}
	return string(formatted)
}

func relayDebugRawFieldValue(content string) any {
	var parsed any
	if err := json.Unmarshal([]byte(content), &parsed); err == nil {
		return parsed
	}
	return content
}

func fieldTextRelayDebugFallback(fields []RelayDebugField) string {
	var builder strings.Builder
	for i, field := range fields {
		if i > 0 {
			builder.WriteString("\n\n")
		}
		builder.WriteString("field: ")
		builder.WriteString(field.Name)
		builder.WriteString("\ncontent:\n")
		builder.WriteString(field.Content)
	}
	return builder.String()
}

func appendResponseTextFromMap(root map[string]any, content *strings.Builder) {
	if output, ok := root["output"].(string); ok {
		content.WriteString(output)
	}
	if outputText, ok := root["output_text"].(string); ok {
		content.WriteString(outputText)
	}
}

func appendRelayDebugField(fields *[]RelayDebugField, seen map[string]bool, name string, value any, kind string) {
	if name == "" || seen[name] || value == nil {
		return
	}
	content := relayDebugContentToString(value)
	if strings.TrimSpace(content) == "" {
		return
	}
	seen[name] = true
	*fields = append(*fields, RelayDebugField{Name: name, Content: content, Kind: kind})
}

func appendRelayDebugContentFields(fields *[]RelayDebugField, seen map[string]bool, prefix string, value any, kind string) {
	if value == nil {
		return
	}
	switch typed := value.(type) {
	case []any:
		if len(typed) == 0 {
			return
		}
		for i, item := range typed {
			itemMap, ok := item.(map[string]any)
			if !ok {
				appendRelayDebugField(fields, seen, fmt.Sprintf("%s.%d", prefix, i), item, kind)
				continue
			}
			itemType := firstRelayDebugString(itemMap, "type")
			itemPrefix := fmt.Sprintf("%s.%d", prefix, i)
			if itemType != "" {
				itemPrefix += "." + itemType
			}
			appendRelayDebugField(fields, seen, itemPrefix+".text", itemMap["text"], contentKindByType(itemType, kind))
			appendRelayDebugField(fields, seen, itemPrefix+".refusal", itemMap["refusal"], "error")
			appendRelayDebugField(fields, seen, itemPrefix+".image_url", itemMap["image_url"], "image")
			appendRelayDebugField(fields, seen, itemPrefix+".file_id", itemMap["file_id"], "file")
			appendRelayDebugField(fields, seen, itemPrefix+".file_name", itemMap["file_name"], "file")
			appendRelayDebugField(fields, seen, itemPrefix+".file_url", itemMap["file_url"], "file")
			appendRelayDebugField(fields, seen, itemPrefix+".annotations", itemMap["annotations"], "meta")
			appendRelayDebugField(fields, seen, itemPrefix+".logprobs", itemMap["logprobs"], "meta")
		}
	default:
		appendRelayDebugField(fields, seen, prefix, value, kind)
	}
}

func appendRelayDebugInputFields(fields *[]RelayDebugField, seen map[string]bool, prefix string, value any) {
	switch typed := value.(type) {
	case []any:
		for i, item := range typed {
			appendRelayDebugResponsesItemFields(fields, seen, fmt.Sprintf("%s.%d", prefix, i), item)
		}
	default:
		appendRelayDebugField(fields, seen, prefix, value, "input")
	}
}

func appendRelayDebugResponsesItemFields(fields *[]RelayDebugField, seen map[string]bool, prefix string, value any) {
	item, ok := value.(map[string]any)
	if !ok {
		appendRelayDebugField(fields, seen, prefix, value, "json")
		return
	}

	itemType := firstRelayDebugString(item, "type")
	kind := relayDebugKindForItemType(itemType)
	appendRelayDebugField(fields, seen, prefix+".type", itemType, "meta")
	appendRelayDebugField(fields, seen, prefix+".id", item["id"], "meta")
	appendRelayDebugField(fields, seen, prefix+".status", item["status"], "meta")
	appendRelayDebugField(fields, seen, prefix+".role", item["role"], "meta")

	switch itemType {
	case "message", "":
		appendRelayDebugContentFields(fields, seen, prefix+".content", item["content"], contentKindByRole(firstRelayDebugString(item, "role")))
	case "function_call":
		appendRelayDebugField(fields, seen, prefix+".call_id", item["call_id"], "tool")
		appendRelayDebugField(fields, seen, prefix+".name", item["name"], "tool")
		appendRelayDebugField(fields, seen, prefix+".arguments", item["arguments"], "tool")
	case "function_call_output", "computer_call_output", "local_shell_call_output":
		appendRelayDebugField(fields, seen, prefix+".call_id", item["call_id"], "tool")
		appendRelayDebugField(fields, seen, prefix+".output", item["output"], "tool")
		appendRelayDebugField(fields, seen, prefix+".acknowledged_safety_checks", item["acknowledged_safety_checks"], "meta")
	case "reasoning":
		appendRelayDebugField(fields, seen, prefix+".summary", item["summary"], "reasoning")
		appendRelayDebugField(fields, seen, prefix+".encrypted_content", item["encrypted_content"], "reasoning")
	case "file_search_call", "web_search_call":
		appendRelayDebugField(fields, seen, prefix+".queries", item["queries"], kind)
		appendRelayDebugField(fields, seen, prefix+".results", item["results"], kind)
	case "computer_call":
		appendRelayDebugField(fields, seen, prefix+".call_id", item["call_id"], "tool")
		appendRelayDebugField(fields, seen, prefix+".action", item["action"], "tool")
		appendRelayDebugField(fields, seen, prefix+".pending_safety_checks", item["pending_safety_checks"], "meta")
	case "code_interpreter_call", "local_shell_call":
		appendRelayDebugField(fields, seen, prefix+".code", item["code"], "tool")
		appendRelayDebugField(fields, seen, prefix+".container_id", item["container_id"], "tool")
		appendRelayDebugField(fields, seen, prefix+".outputs", item["outputs"], "tool")
	case "image_generation_call":
		appendRelayDebugField(fields, seen, prefix+".result", item["result"], "image")
		appendRelayDebugField(fields, seen, prefix+".revised_prompt", item["revised_prompt"], "assistant")
		appendRelayDebugField(fields, seen, prefix+".quality", item["quality"], "meta")
		appendRelayDebugField(fields, seen, prefix+".size", item["size"], "meta")
	case "mcp_call", "mcp_list_tools", "mcp_approval_request", "mcp_approval_response":
		appendRelayDebugField(fields, seen, prefix+".server_label", item["server_label"], "tool")
		appendRelayDebugField(fields, seen, prefix+".name", item["name"], "tool")
		appendRelayDebugField(fields, seen, prefix+".arguments", item["arguments"], "tool")
		appendRelayDebugField(fields, seen, prefix+".input", item["input"], "tool")
		appendRelayDebugField(fields, seen, prefix+".output", item["output"], "tool")
		appendRelayDebugField(fields, seen, prefix+".tools", item["tools"], "tool")
		appendRelayDebugField(fields, seen, prefix+".error", item["error"], "error")
		appendRelayDebugField(fields, seen, prefix+".approval_request_id", item["approval_request_id"], "tool")
		appendRelayDebugField(fields, seen, prefix+".approve", item["approve"], "tool")
		appendRelayDebugField(fields, seen, prefix+".reason", item["reason"], "tool")
	default:
		appendRelayDebugJSONFallback(fields, seen, prefix, item, kind, 3)
	}
}

func appendRelayDebugToolsFields(fields *[]RelayDebugField, seen map[string]bool, prefix string, value any) {
	tools, ok := value.([]any)
	if !ok {
		appendRelayDebugField(fields, seen, prefix, value, "tool")
		return
	}
	for i, tool := range tools {
		toolMap, ok := tool.(map[string]any)
		if !ok {
			appendRelayDebugField(fields, seen, fmt.Sprintf("%s.%d", prefix, i), tool, "tool")
			continue
		}
		itemPrefix := fmt.Sprintf("%s.%d", prefix, i)
		appendRelayDebugField(fields, seen, itemPrefix+".type", toolMap["type"], "tool")
		appendRelayDebugField(fields, seen, itemPrefix+".name", toolMap["name"], "tool")
		appendRelayDebugField(fields, seen, itemPrefix+".description", toolMap["description"], "tool")
		appendRelayDebugField(fields, seen, itemPrefix+".parameters", toolMap["parameters"], "tool")
		appendRelayDebugField(fields, seen, itemPrefix+".function", toolMap["function"], "tool")
		appendRelayDebugField(fields, seen, itemPrefix+".server_label", toolMap["server_label"], "tool")
		appendRelayDebugField(fields, seen, itemPrefix+".server_url", toolMap["server_url"], "tool")
		appendRelayDebugField(fields, seen, itemPrefix+".allowed_tools", toolMap["allowed_tools"], "tool")
		appendRelayDebugField(fields, seen, itemPrefix+".tools", toolMap["tools"], "tool")
	}
}

func appendRelayDebugResponsesStreamEventFields(
	fields *[]RelayDebugField,
	seen map[string]bool,
	eventType string,
	event map[string]any,
	content *strings.Builder,
	reasoning *strings.Builder,
	refusal *strings.Builder,
	seenToolCalls map[string]bool,
) {
	if eventType == "" {
		return
	}
	prefix := "event." + eventType
	switch eventType {
	case "response.created", "response.in_progress", "response.completed", "response.failed", "response.incomplete":
		if response, ok := event["response"].(map[string]any); ok {
			appendRelayDebugField(fields, seen, prefix+".id", response["id"], "meta")
			appendRelayDebugField(fields, seen, prefix+".status", response["status"], "meta")
			appendRelayDebugField(fields, seen, prefix+".model", response["model"], "meta")
			appendRelayDebugField(fields, seen, prefix+".usage", response["usage"], "meta")
			if outputs, ok := response["output"].([]any); ok {
				for i, output := range outputs {
					appendRelayDebugResponsesItemFields(fields, seen, fmt.Sprintf("%s.output.%d", prefix, i), output)
				}
			}
		}
	case "response.output_item.added", "response.output_item.done":
		appendRelayDebugResponsesItemFields(fields, seen, prefix+".item", event["item"])
	case "response.content_part.added", "response.content_part.done", "response.reasoning_summary_part.added", "response.reasoning_summary_part.done":
		appendRelayDebugContentFields(fields, seen, prefix+".part", event["part"], "assistant")
	case "response.output_text.delta":
		if delta := relayDebugContentToString(event["delta"]); delta != "" {
			content.WriteString(delta)
		}
	case "response.output_text.done":
		appendRelayDebugField(fields, seen, prefix+".text", event["text"], "assistant")
	case "response.refusal.delta":
		if delta := relayDebugContentToString(event["delta"]); delta != "" {
			refusal.WriteString(delta)
		}
	case "response.refusal.done":
		appendRelayDebugField(fields, seen, prefix+".refusal", event["refusal"], "error")
	case "response.reasoning_summary_text.delta", "response.reasoning.delta", "response.reasoning_summary.delta":
		if delta := relayDebugContentToString(event["delta"]); delta != "" {
			reasoning.WriteString(delta)
		}
	case "response.reasoning_summary_text.done", "response.reasoning.done", "response.reasoning_summary.done":
		appendRelayDebugField(fields, seen, prefix+".text", event["text"], "reasoning")
	case "response.function_call_arguments.delta", "response.mcp_call.arguments.delta":
		if delta := relayDebugContentToString(event["delta"]); delta != "" {
			appendRelayDebugField(fields, seen, prefix+".item_id", event["item_id"], "tool")
			appendRelayDebugToolFieldsFromTextSeen(fields, delta, seenToolCalls)
		}
	case "response.function_call_arguments.done", "response.mcp_call.arguments.done":
		appendRelayDebugField(fields, seen, prefix+".arguments", event["arguments"], "tool")
		appendRelayDebugToolFieldsFromValueSeen(fields, event["arguments"], seenToolCalls)
	case "response.image_generation_call.partial_image":
		appendRelayDebugField(fields, seen, prefix+".partial_image_index", event["partial_image_index"], "image")
		appendRelayDebugField(fields, seen, prefix+".partial_image_b64", relayDebugSummarizeLargeValue(event["partial_image_b64"]), "image")
	case "error":
		appendRelayDebugField(fields, seen, prefix+".code", event["code"], "error")
		appendRelayDebugField(fields, seen, prefix+".message", event["message"], "error")
		appendRelayDebugField(fields, seen, prefix+".param", event["param"], "error")
	}
}

func appendRelayDebugJSONFallback(fields *[]RelayDebugField, seen map[string]bool, prefix string, value any, kind string, depth int) {
	if depth <= 0 {
		appendRelayDebugField(fields, seen, prefix, value, kind)
		return
	}
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			name := prefix + "." + key
			if seen[name] {
				continue
			}
			if isRelayDebugScalar(child) {
				appendRelayDebugField(fields, seen, name, relayDebugSummarizeLargeValue(child), relayDebugKindForKey(key, kind))
				continue
			}
			appendRelayDebugJSONFallback(fields, seen, name, child, relayDebugKindForKey(key, kind), depth-1)
		}
	case []any:
		for i, child := range typed {
			if i >= 20 {
				appendRelayDebugField(fields, seen, prefix+".truncated", fmt.Sprintf("%d more items", len(typed)-i), "meta")
				break
			}
			name := fmt.Sprintf("%s.%d", prefix, i)
			if isRelayDebugScalar(child) {
				appendRelayDebugField(fields, seen, name, relayDebugSummarizeLargeValue(child), kind)
				continue
			}
			appendRelayDebugJSONFallback(fields, seen, name, child, kind, depth-1)
		}
	default:
		appendRelayDebugField(fields, seen, prefix, relayDebugSummarizeLargeValue(value), kind)
	}
}

func isRelayDebugScalar(value any) bool {
	switch value.(type) {
	case nil, string, float64, bool:
		return true
	default:
		return false
	}
}

func relayDebugSummarizeLargeValue(value any) any {
	text, ok := value.(string)
	if !ok {
		return value
	}
	if len(text) <= 4096 {
		return text
	}
	return fmt.Sprintf("%s\n...[truncated field at %d chars]", text[:4096], len(text))
}

func contentKindByRole(role string) string {
	switch strings.ToLower(role) {
	case "assistant":
		return "assistant"
	case "system", "developer":
		return "system"
	case "tool", "function":
		return "tool"
	case "user":
		return "user"
	default:
		return "input"
	}
}

func contentKindByType(contentType, fallback string) string {
	switch contentType {
	case "output_text":
		return "assistant"
	case "input_text":
		return "user"
	case "refusal":
		return "error"
	case "input_image":
		return "image"
	case "input_file":
		return "file"
	case "summary_text":
		return "reasoning"
	default:
		return fallback
	}
}

func relayDebugKindForItemType(itemType string) string {
	switch itemType {
	case "message":
		return "assistant"
	case "reasoning":
		return "reasoning"
	case "file_search_call", "web_search_call", "computer_call", "computer_call_output", "function_call", "function_call_output", "code_interpreter_call", "local_shell_call", "local_shell_call_output", "mcp_list_tools", "mcp_approval_request", "mcp_approval_response", "mcp_call":
		return "tool"
	case "image_generation_call":
		return "image"
	default:
		return "json"
	}
}

func relayDebugKindForKey(key string, fallback string) string {
	key = strings.ToLower(key)
	switch {
	case strings.Contains(key, "error") || strings.Contains(key, "refusal") || strings.Contains(key, "incomplete"):
		return "error"
	case strings.Contains(key, "reasoning") || strings.Contains(key, "summary"):
		return "reasoning"
	case strings.Contains(key, "tool") || strings.Contains(key, "function") || strings.Contains(key, "mcp") || strings.Contains(key, "call"):
		return "tool"
	case strings.Contains(key, "image") || strings.Contains(key, "b64"):
		return "image"
	case strings.Contains(key, "file"):
		return "file"
	case key == "usage" || key == "status" || key == "model":
		return "meta"
	default:
		return fallback
	}
}

func appendRelayDebugToolFieldsFromText(fields *[]RelayDebugField, text string) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" || !(strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[")) {
		return
	}

	var parsed any
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return
	}
	appendRelayDebugToolFieldsFromValue(fields, parsed)
}

func appendRelayDebugToolFieldsFromValue(fields *[]RelayDebugField, value any) {
	appendRelayDebugToolFieldsFromValueSeen(fields, value, map[string]bool{})
}

func appendRelayDebugToolFieldsFromValueSeen(fields *[]RelayDebugField, value any, seen map[string]bool) {
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			appendRelayDebugToolFieldsFromValueSeen(fields, item, seen)
		}
	case map[string]any:
		if appendRelayDebugToolCallFields(fields, typed, seen) {
			return
		}
		for _, child := range typed {
			appendRelayDebugToolFieldsFromValueSeen(fields, child, seen)
		}
	case string:
		appendRelayDebugToolFieldsFromTextSeen(fields, typed, seen)
	}
}

func appendRelayDebugToolFieldsFromTextSeen(fields *[]RelayDebugField, text string, seen map[string]bool) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" || !(strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[")) {
		return
	}

	var parsed any
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return
	}
	appendRelayDebugToolFieldsFromValueSeen(fields, parsed, seen)
}

func appendRelayDebugToolCallFields(fields *[]RelayDebugField, value map[string]any, seen map[string]bool) bool {
	name := firstRelayDebugString(value, "toolName", "tool_name", "name")
	server := firstRelayDebugString(value, "server", "server_label", "serverLabel")
	arguments, hasArguments := firstRelayDebugValue(value, "arguments", "args", "parameters", "params")
	callType := strings.ToLower(firstRelayDebugString(value, "type"))
	if name == "" || (!hasArguments && server == "" && !strings.Contains(callType, "tool") && !strings.Contains(callType, "function")) {
		return false
	}

	fingerprint := relayDebugContentToString(value)
	if seen[fingerprint] {
		return true
	}
	seen[fingerprint] = true

	index := len(seen) - 1
	prefix := fmt.Sprintf("tool_call.%d", index)
	if server != "" {
		*fields = append(*fields, RelayDebugField{Name: prefix + ".server", Content: server, Kind: "tool"})
	}
	if name != "" {
		*fields = append(*fields, RelayDebugField{Name: prefix + ".name", Content: name, Kind: "tool"})
	}
	if callType != "" {
		*fields = append(*fields, RelayDebugField{Name: prefix + ".type", Content: callType, Kind: "tool"})
	}
	if hasArguments {
		*fields = append(*fields, RelayDebugField{Name: prefix + ".arguments", Content: relayDebugContentToString(arguments), Kind: "tool"})
	}
	return true
}

func firstRelayDebugString(value map[string]any, keys ...string) string {
	for _, key := range keys {
		if content := relayDebugContentToString(value[key]); content != "" {
			return content
		}
	}
	return ""
}

func firstRelayDebugValue(value map[string]any, keys ...string) (any, bool) {
	for _, key := range keys {
		if content, ok := value[key]; ok && content != nil {
			return content, true
		}
	}
	return nil, false
}

func relayDebugContentToString(value any) string {
	if value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return redactRelayDebugSecretsInText(typed)
	case float64, bool:
		return fmt.Sprint(typed)
	default:
		if formatted, err := json.MarshalIndent(typed, "", "  "); err == nil {
			return redactRelayDebugSecretsInText(string(formatted))
		}
		return redactRelayDebugSecretsInText(fmt.Sprint(typed))
	}
}

func uniqueRelayDebugStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	var unique []string
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		unique = append(unique, value)
	}
	return unique
}

func redactRelayDebugJSON(value any, key string) any {
	if isRelayDebugSensitiveKey(key) {
		return "[redacted]"
	}

	switch typed := value.(type) {
	case map[string]any:
		redacted := make(map[string]any, len(typed))
		for childKey, childValue := range typed {
			redacted[childKey] = redactRelayDebugJSON(childValue, childKey)
		}
		return redacted
	case []any:
		redacted := make([]any, len(typed))
		for i, childValue := range typed {
			redacted[i] = redactRelayDebugJSON(childValue, key)
		}
		return redacted
	case string:
		return redactRelayDebugSecretsInText(typed)
	default:
		return value
	}
}

func redactRelayDebugSecretsInText(text string) string {
	return relayDebugSecretPattern.ReplaceAllStringFunc(text, func(match string) string {
		if strings.HasPrefix(strings.ToLower(match), "bearer ") {
			return "Bearer [redacted]"
		}
		return "sk-[redacted]"
	})
}

func isRelayDebugSensitiveKey(key string) bool {
	key = strings.ToLower(key)
	return strings.Contains(key, "authorization") ||
		strings.Contains(key, "password") ||
		strings.Contains(key, "secret") ||
		strings.Contains(key, "api_key") ||
		strings.Contains(key, "apikey") ||
		key == "key" ||
		key == "token" ||
		strings.HasSuffix(key, "_token")
}

func writeLimited(buf *bytes.Buffer, data []byte, limit int) {
	if buf.Len() >= limit {
		return
	}
	remaining := limit - buf.Len()
	if len(data) > remaining {
		data = data[:remaining]
	}
	buf.Write(data)
}

func valueOrUnknown(value string) string {
	if value == "" {
		return "unknown"
	}
	return value
}
