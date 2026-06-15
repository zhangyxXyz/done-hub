package claudecode

import (
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"done-hub/providers/claude"
)

type claudeCodeModelCandidate struct {
	name        string
	family      string
	version     []int
	order       int
	hasAlias    bool
	hasSnapshot bool
}

func (p *ClaudeCodeProvider) GetModelList() ([]string, error) {
	fullRequestURL := p.GetFullRequestURL(p.Config.ModelList)
	headers := p.GetRequestHeaders()

	if _, hasAuth := headers["Authorization"]; !hasAuth {
		token, err := p.GetToken()
		if err != nil {
			return nil, err
		}
		headers["Authorization"] = "Bearer " + token
	}
	p.applyDefaultHeaders(headers)

	req, err := p.Requester.NewRequest(http.MethodGet, fullRequestURL, p.Requester.WithHeader(headers))
	if err != nil {
		return nil, errors.New("new_request_failed")
	}

	response := &claude.ModelListResponse{}
	_, errWithCode := p.Requester.SendRequest(req, response, false)
	if errWithCode != nil {
		return nil, errors.New(errWithCode.Message)
	}

	modelList := parseClaudeCodeModelList(response)
	if len(modelList) == 0 {
		return nil, errors.New("no models returned")
	}

	return modelList, nil
}

func parseClaudeCodeModelList(response *claude.ModelListResponse) []string {
	if response == nil {
		return nil
	}

	candidates := make(map[string]*claudeCodeModelCandidate, len(response.Data))
	ordered := make([]string, 0, len(response.Data))
	for i, model := range response.Data {
		modelName := strings.TrimSpace(model.ID)
		if modelName == "" {
			continue
		}

		canonical, isSnapshot := canonicalClaudeCodeModelName(modelName)
		candidate, ok := candidates[canonical]
		if !ok {
			family, version := splitClaudeCodeModelVersion(canonical)
			candidate = &claudeCodeModelCandidate{
				name:    canonical,
				family:  family,
				version: version,
				order:   i,
			}
			candidates[canonical] = candidate
			ordered = append(ordered, canonical)
		}
		if isSnapshot {
			candidate.hasSnapshot = true
		} else {
			candidate.hasAlias = true
		}
	}

	hasNewerAlias := func(candidate *claudeCodeModelCandidate) bool {
		for _, other := range candidates {
			if other == candidate || !other.hasAlias || other.family != candidate.family {
				continue
			}
			if compareClaudeCodeVersion(other.version, candidate.version) > 0 {
				return true
			}
		}
		return false
	}

	modelList := make([]string, 0, len(ordered))
	for _, name := range ordered {
		candidate := candidates[name]
		if !candidate.hasAlias && candidate.hasSnapshot && hasNewerAlias(candidate) {
			continue
		}
		modelList = append(modelList, candidate.name)
	}

	sort.SliceStable(modelList, func(i, j int) bool {
		return candidates[modelList[i]].order < candidates[modelList[j]].order
	})

	return modelList
}

func canonicalClaudeCodeModelName(modelName string) (string, bool) {
	parts := strings.Split(modelName, "-")
	if len(parts) == 0 {
		return modelName, false
	}

	last := parts[len(parts)-1]
	if len(last) != 8 {
		return modelName, false
	}
	if _, err := strconv.Atoi(last); err != nil {
		return modelName, false
	}

	return strings.Join(parts[:len(parts)-1], "-"), true
}

func splitClaudeCodeModelVersion(modelName string) (string, []int) {
	parts := strings.Split(modelName, "-")
	if len(parts) < 3 || parts[0] != "claude" {
		return modelName, nil
	}

	family := strings.Join(parts[:2], "-")
	version := make([]int, 0, len(parts)-2)
	for _, part := range parts[2:] {
		num, err := strconv.Atoi(part)
		if err != nil {
			break
		}
		version = append(version, num)
	}
	return family, version
}

func compareClaudeCodeVersion(a []int, b []int) int {
	maxLen := len(a)
	if len(b) > maxLen {
		maxLen = len(b)
	}
	for i := 0; i < maxLen; i++ {
		ai, bi := 0, 0
		if i < len(a) {
			ai = a[i]
		}
		if i < len(b) {
			bi = b[i]
		}
		if ai > bi {
			return 1
		}
		if ai < bi {
			return -1
		}
	}
	return 0
}
