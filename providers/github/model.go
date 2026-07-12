package github

import (
	"errors"
	"net/http"
)

func (p *GithubProvider) GetModelList() ([]string, error) {
	fullRequestURL := p.GetFullRequestURL(p.Config.ModelList, "")
	headers := p.GetRequestHeaders()
	headers["Accept"] = "application/vnd.github+json"
	headers["X-GitHub-Api-Version"] = "2022-11-28"

	req, err := p.Requester.NewRequest(http.MethodGet, fullRequestURL, p.Requester.WithHeader(headers))
	if err != nil {
		return nil, errors.New("new_request_failed")
	}

	var response ModelListResponse
	_, errWithCode := p.Requester.SendRequest(req, &response, false)
	if errWithCode != nil {
		return nil, errors.New(errWithCode.Message)
	}

	var modelList []string
	for _, model := range response {
		modelList = append(modelList, model.ID)
	}

	return modelList, nil
}
