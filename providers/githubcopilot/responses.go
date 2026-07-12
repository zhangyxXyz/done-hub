package githubcopilot

import (
	"done-hub/common/requester"
	"done-hub/providers/openai"
	"done-hub/types"
	"encoding/json"
	"net/http"
)

// copilotResponsesStreamNormalizer keeps the first item id emitted for each
// output_index. Copilot may encrypt the same logical item id independently in
// added/delta/done events; clients such as the AI SDK key their reasoning state
// by item id and require it to remain stable for the lifetime of the stream.
type copilotResponsesStreamNormalizer struct {
	itemIDs map[int]string
}

func newCopilotResponsesStreamNormalizer() *copilotResponsesStreamNormalizer {
	return &copilotResponsesStreamNormalizer{itemIDs: make(map[int]string)}
}

func (n *copilotResponsesStreamNormalizer) Patch(body []byte) []byte {
	var event map[string]any
	if err := json.Unmarshal(body, &event); err != nil {
		return body
	}
	outputIndex, ok := jsonNumberToInt(event["output_index"])
	if !ok {
		return body
	}

	item, _ := event["item"].(map[string]any)
	stableID := n.itemIDs[outputIndex]
	if stableID == "" && item != nil {
		stableID, _ = item["id"].(string)
		if stableID != "" {
			n.itemIDs[outputIndex] = stableID
		}
	}
	if stableID == "" {
		return body
	}

	changed := false
	if item != nil {
		if current, _ := item["id"].(string); current != "" && current != stableID {
			item["id"] = stableID
			changed = true
		}
	}
	if current, _ := event["item_id"].(string); current != "" && current != stableID {
		event["item_id"] = stableID
		changed = true
	}
	if !changed {
		return body
	}
	patched, err := json.Marshal(event)
	if err != nil {
		return body
	}
	return patched
}

func jsonNumberToInt(value any) (int, bool) {
	number, ok := value.(float64)
	if !ok || number < 0 || number != float64(int(number)) {
		return 0, false
	}
	return int(number), true
}

func (p *Provider) responsesDelegate(force bool) (*openai.OpenAIProvider, error) {
	entry, err := p.getToken(force)
	if err != nil {
		return nil, err
	}
	channel := *p.Channel
	channel.Key = entry.token
	baseURL := entry.apiBase
	channel.BaseURL = &baseURL
	delegate := openai.CreateOpenAIProvider(&channel, baseURL)
	delegate.Config.Responses = "/responses"
	delegate.Context = p.Context
	delegate.Usage = p.Usage
	delegate.OriginalModel = p.OriginalModel
	delegate.RequestHeaders = func() map[string]string {
		return p.inferenceHeaders(entry.token, "conversation-agent", "user")
	}
	delegate.ResponsesStreamEventPatch = newCopilotResponsesStreamNormalizer().Patch
	return delegate, nil
}

func (p *Provider) CreateResponses(request *types.OpenAIResponsesRequest) (*types.OpenAIResponsesResponses, *types.OpenAIErrorWithStatusCode) {
	for attempt := 0; attempt < 2; attempt++ {
		delegate, err := p.responsesDelegate(attempt > 0)
		if err != nil {
			return nil, tokenError(err)
		}
		response, apiErr := delegate.CreateResponses(request)
		if apiErr != nil && apiErr.StatusCode == http.StatusUnauthorized && attempt == 0 {
			p.invalidate()
			continue
		}
		return response, apiErr
	}
	return nil, tokenError(http.ErrAbortHandler)
}

func (p *Provider) CreateResponsesStream(request *types.OpenAIResponsesRequest) (requester.StreamReaderInterface[string], *types.OpenAIErrorWithStatusCode) {
	for attempt := 0; attempt < 2; attempt++ {
		delegate, err := p.responsesDelegate(attempt > 0)
		if err != nil {
			return nil, tokenError(err)
		}
		response, apiErr := delegate.CreateResponsesStream(request)
		if apiErr != nil && apiErr.StatusCode == http.StatusUnauthorized && attempt == 0 {
			p.invalidate()
			continue
		}
		return response, apiErr
	}
	return nil, tokenError(http.ErrAbortHandler)
}
