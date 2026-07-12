package githubcopilot

import (
	"done-hub/providers/base"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"
)

type modelListResponse struct {
	Data []struct {
		ID                 string   `json:"id"`
		ModelPickerEnabled *bool    `json:"model_picker_enabled"`
		SupportedEndpoints []string `json:"supported_endpoints"`
	} `json:"data"`
}

type modelCapabilitiesEntry struct {
	models    map[string]base.ModelEndpointCapabilities
	refreshAt time.Time
}

var modelCapabilitiesStore = struct {
	sync.Mutex
	entries map[string]modelCapabilitiesEntry
}{entries: make(map[string]modelCapabilitiesEntry)}

func (p *Provider) GetModelList() ([]string, error) {
	out, err := p.fetchModelList()
	if err != nil {
		return nil, err
	}
	models := make([]string, 0, len(out.Data))
	for _, m := range out.Data {
		if m.ID != "" && (m.ModelPickerEnabled == nil || *m.ModelPickerEnabled) {
			models = append(models, m.ID)
		}
	}
	return models, nil
}

func (p *Provider) fetchModelList() (*modelListResponse, error) {
	for attempt := 0; attempt < 2; attempt++ {
		e, err := p.getToken(attempt > 0)
		if err != nil {
			return nil, err
		}
		requestURL, err := p.apiURL(e.apiBase, "/models")
		if err != nil {
			return nil, err
		}
		req, err := p.Requester.NewRequest(http.MethodGet, requestURL, p.Requester.WithHeader(p.inferenceHeaders(e.token, "model-access", "")))
		if err != nil {
			return nil, err
		}
		var out modelListResponse
		_, ew := p.Requester.SendRequest(req, &out, false)
		if ew != nil {
			if ew.StatusCode == http.StatusUnauthorized && attempt == 0 {
				p.invalidate()
				continue
			}
			return nil, errors.New(ew.Message)
		}
		p.cacheModelCapabilities(&out)
		return &out, nil
	}
	return nil, errors.New("github copilot authentication failed")
}

func (p *Provider) cacheModelCapabilities(out *modelListResponse) {
	models := make(map[string]base.ModelEndpointCapabilities, len(out.Data))
	for _, model := range out.Data {
		capability := base.ModelEndpointCapabilities{
			Known:  model.SupportedEndpoints != nil,
			Source: "github_copilot_model_metadata",
		}
		for _, endpoint := range model.SupportedEndpoints {
			switch strings.TrimSpace(endpoint) {
			case "/chat/completions":
				capability.ChatCompletions = true
			case "/responses", "ws:/responses":
				capability.Responses = true
			}
		}
		models[model.ID] = capability
	}
	modelCapabilitiesStore.Lock()
	modelCapabilitiesStore.entries[channelCacheKey(p.Channel)] = modelCapabilitiesEntry{models: models, refreshAt: time.Now().Add(10 * time.Minute)}
	modelCapabilitiesStore.Unlock()
}

func (p *Provider) modelCapabilities(modelName string) (base.ModelEndpointCapabilities, bool) {
	key := channelCacheKey(p.Channel)
	modelCapabilitiesStore.Lock()
	entry, ok := modelCapabilitiesStore.entries[key]
	if ok && time.Now().Before(entry.refreshAt) {
		capability, found := entry.models[modelName]
		modelCapabilitiesStore.Unlock()
		return capability, found
	}
	modelCapabilitiesStore.Unlock()
	if _, err := p.fetchModelList(); err != nil {
		return base.ModelEndpointCapabilities{}, false
	}
	modelCapabilitiesStore.Lock()
	entry = modelCapabilitiesStore.entries[key]
	capability, found := entry.models[modelName]
	modelCapabilitiesStore.Unlock()
	return capability, found
}

func (p *Provider) ResolveModelEndpointCapabilities(modelName string) base.ModelEndpointCapabilities {
	capability, ok := p.modelCapabilities(modelName)
	if !ok {
		return base.ModelEndpointCapabilities{}
	}
	return capability
}
