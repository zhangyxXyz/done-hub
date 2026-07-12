package types

import "testing"

func TestChatToResponsesPreservesTextAlongsideToolCalls(t *testing.T) {
	request := &ChatCompletionRequest{
		Model: "gpt-test",
		Messages: []ChatCompletionMessage{{
			Role:    ChatMessageRoleAssistant,
			Content: "I will call a tool.",
			ToolCalls: []*ChatCompletionToolCalls{{
				Id:   "call_1",
				Type: "function",
				Function: &ChatCompletionToolCallsFunction{
					Name:      "lookup",
					Arguments: `{"q":"test"}`,
				},
			}},
		}},
	}

	converted := request.ToResponsesRequest()
	inputs, ok := converted.Input.([]InputResponses)
	if !ok || len(inputs) != 2 {
		t.Fatalf("converted inputs = %#v, want message and function call", converted.Input)
	}
	if inputs[0].Type != InputTypeMessage || inputs[1].Type != InputTypeFunctionCall {
		t.Fatalf("converted input order = %#v", inputs)
	}
}

func TestChatToResponsesPreservesImageDetail(t *testing.T) {
	request := &ChatCompletionRequest{Messages: []ChatCompletionMessage{{
		Role: ChatMessageRoleUser,
		Content: []ChatMessagePart{{
			Type: ContentTypeImageURL,
			ImageURL: &ChatMessageImageURL{
				URL:    "https://example.com/image.png",
				Detail: "high",
			},
		}},
	}}}
	converted := request.ToResponsesRequest()
	inputs := converted.Input.([]InputResponses)
	contents, err := inputs[0].ParseContent()
	if err != nil || len(contents) != 1 || contents[0].Detail != "high" {
		t.Fatalf("converted image content = %#v, err=%v", contents, err)
	}
}

func TestResponsesToChatMergesMultipleOutputItems(t *testing.T) {
	response := &OpenAIResponsesResponses{
		Status: ResponseStatusCompleted,
		Output: []ResponsesOutput{
			{Type: InputTypeReasoning, Summary: []SummaryResponses{{Type: ContentTypeSummaryText, Text: "first"}}},
			{Type: InputTypeReasoning, Summary: []SummaryResponses{{Type: ContentTypeSummaryText, Text: " second"}}},
			{Type: InputTypeMessage, Content: []any{map[string]any{"type": ContentTypeOutputText, "text": "hello"}}},
			{Type: InputTypeMessage, Content: []any{map[string]any{"type": ContentTypeOutputText, "text": " world"}}},
		},
	}
	chat := response.ToChat()
	if chat.Choices[0].Message.Content != "hello world" {
		t.Fatalf("merged content = %#v", chat.Choices[0].Message.Content)
	}
	if chat.Choices[0].Message.ReasoningContent != "first second" {
		t.Fatalf("merged reasoning = %#v", chat.Choices[0].Message.ReasoningContent)
	}
}
