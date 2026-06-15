package types

import (
	"reflect"
	"testing"
)

func TestChatToResponsesRequestMapsWebSearchOptions(t *testing.T) {
	request := &ChatCompletionRequest{
		Model: "gpt-5.5",
		Messages: []ChatCompletionMessage{
			{Role: ChatMessageRoleUser, Content: "search tomorrow weather in Shenzhen Baoan"},
		},
		WebSearchOptions: &WebSearchOptions{
			SearchContextSize: "high",
			UserLocation: map[string]any{
				"type":    "approximate",
				"country": "CN",
				"city":    "Shenzhen",
			},
		},
	}

	got := request.ToResponsesRequest()
	if len(got.Tools) != 1 {
		t.Fatalf("len(Tools) = %d, want 1", len(got.Tools))
	}
	if got.Tools[0].Type != APITollTypeWebSearchPreview {
		t.Fatalf("tool type = %q, want %q", got.Tools[0].Type, APITollTypeWebSearchPreview)
	}
	if got.Tools[0].SearchContextSize != "high" {
		t.Fatalf("search_context_size = %q, want high", got.Tools[0].SearchContextSize)
	}
	wantLocation := map[string]any{
		"type":    "approximate",
		"country": "CN",
		"city":    "Shenzhen",
	}
	if !reflect.DeepEqual(got.Tools[0].UserLocation, wantLocation) {
		t.Fatalf("user_location = %#v, want %#v", got.Tools[0].UserLocation, wantLocation)
	}
}

func TestChatToResponsesRequestDoesNotDuplicateExplicitWebSearchTool(t *testing.T) {
	request := &ChatCompletionRequest{
		Model: "gpt-5.5",
		Messages: []ChatCompletionMessage{
			{Role: ChatMessageRoleUser, Content: "search tomorrow weather in Shenzhen Baoan"},
		},
		Tools: []*ChatCompletionTool{
			{
				Type: APITollTypeWebSearchPreview,
				ResponsesTools: ResponsesTools{
					SearchContextSize: "medium",
				},
			},
		},
		WebSearchOptions: &WebSearchOptions{
			SearchContextSize: "high",
		},
	}

	got := request.ToResponsesRequest()
	if len(got.Tools) != 1 {
		t.Fatalf("len(Tools) = %d, want 1", len(got.Tools))
	}
	if got.Tools[0].SearchContextSize != "medium" {
		t.Fatalf("search_context_size = %q, want explicit medium", got.Tools[0].SearchContextSize)
	}
}
