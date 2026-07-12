package githubcopilot

import (
	"errors"
	"net/http"
)

type modelListResponse struct {
	Data []struct {
		ID                 string `json:"id"`
		ModelPickerEnabled *bool  `json:"model_picker_enabled"`
	} `json:"data"`
}

func (p *Provider) GetModelList() ([]string, error) {
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
		models := make([]string, 0, len(out.Data))
		for _, m := range out.Data {
			if m.ID != "" && (m.ModelPickerEnabled == nil || *m.ModelPickerEnabled) {
				models = append(models, m.ID)
			}
		}
		return models, nil
	}
	return nil, errors.New("github copilot authentication failed")
}
