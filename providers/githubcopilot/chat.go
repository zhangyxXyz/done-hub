package githubcopilot

import (
	"bytes"
	"done-hub/common/requester"
	"done-hub/providers/openai"
	"done-hub/types"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

func (p *Provider) chatRequest(request *types.ChatCompletionRequest, raw bool) (*http.Response, *types.OpenAIErrorWithStatusCode) {
	for attempt := 0; attempt < 2; attempt++ {
		e, err := p.getToken(attempt > 0)
		if err != nil {
			return nil, tokenError(err)
		}
		requestURL, err := p.apiURL(e.apiBase, "/chat/completions")
		if err != nil {
			return nil, tokenError(err)
		}
		initiator := "user"
		if len(request.Messages) > 0 {
			role := request.Messages[len(request.Messages)-1].Role
			if role == "assistant" || role == "tool" {
				initiator = "agent"
			}
		}
		req, err := p.Requester.NewRequest(http.MethodPost, requestURL, p.Requester.WithHeader(p.inferenceHeaders(e.token, "conversation-agent", initiator)), p.Requester.WithBody(request))
		if err != nil {
			return nil, tokenError(err)
		}
		resp, ew := p.Requester.SendRequestRaw(req)
		if ew != nil && ew.StatusCode == http.StatusUnauthorized && attempt == 0 {
			p.invalidate()
			continue
		}
		return resp, ew
	}
	return nil, tokenError(io.ErrUnexpectedEOF)
}

func tokenError(err error) *types.OpenAIErrorWithStatusCode {
	return &types.OpenAIErrorWithStatusCode{StatusCode: http.StatusInternalServerError, OpenAIError: types.OpenAIError{Message: err.Error(), Type: "provider_error"}}
}

func (p *Provider) CreateChatCompletion(request *types.ChatCompletionRequest) (*types.ChatCompletionResponse, *types.OpenAIErrorWithStatusCode) {
	request.Stream = false
	resp, ew := p.chatRequest(request, false)
	if ew != nil {
		return nil, ew
	}
	defer resp.Body.Close()
	var out openai.OpenAIProviderChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, tokenError(err)
	}
	if out.Usage != nil && p.Usage != nil {
		*p.Usage = *out.Usage
	}
	out.Model = p.GetResponseModelName(request.Model)
	return &out.ChatCompletionResponse, nil
}

func (p *Provider) CreateChatCompletionStream(request *types.ChatCompletionRequest) (requester.StreamReaderInterface[string], *types.OpenAIErrorWithStatusCode) {
	request.Stream = true
	resp, ew := p.chatRequest(request, true)
	if ew != nil {
		return nil, ew
	}
	return requester.RequestStream(p.Requester, resp, func(raw *[]byte, data chan string, errs chan error) {
		if !bytes.HasPrefix(*raw, []byte("data:")) {
			*raw = nil
			return
		}
		line := bytes.TrimSpace((*raw)[5:])
		if string(line) == "[DONE]" {
			errs <- io.EOF
			*raw = requester.StreamClosed
			return
		}
		var chunk types.ChatCompletionStreamResponse
		if json.Unmarshal(line, &chunk) == nil && chunk.Usage != nil && p.Usage != nil {
			*p.Usage = *chunk.Usage
		}
		data <- strings.TrimSpace(string(line))
	})
}
