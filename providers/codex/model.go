package codex

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	codexFallbackClientVersion      = "0.134.0"
	codexNPMRegistryURL             = "https://registry.npmjs.org/@openai%2Fcodex"
	codexClientVersionCacheDuration = 6 * time.Hour
)

var codexClientVersionCache = struct {
	sync.RWMutex
	version   string
	expiresAt time.Time
}{}

type codexModelListResponse struct {
	Models []codexModelDetails `json:"models"`
	Data   []codexModelDetails `json:"data"`
}

type codexModelDetails struct {
	Slug       string `json:"slug"`
	ID         string `json:"id"`
	Visibility string `json:"visibility"`
	Priority   int    `json:"priority"`
}

func (p *CodexProvider) GetModelList() ([]string, error) {
	clientVersion := p.getCodexModelListClientVersion()
	fullRequestURL := withCodexModelListClientVersion(p.GetFullRequestURL(p.Config.ModelList, ""), clientVersion)
	headers, err := p.getRequestHeadersInternal()
	if err != nil {
		return nil, err
	}
	p.applyDefaultHeaders(headers)
	if headers["version"] == "" {
		headers["version"] = clientVersion
	}

	req, err := p.Requester.NewRequest(http.MethodGet, fullRequestURL, p.Requester.WithHeader(headers))
	if err != nil {
		return nil, errors.New("new_request_failed")
	}

	response := &codexModelListResponse{}
	_, errWithCode := p.Requester.SendRequest(req, response, false)
	if errWithCode != nil {
		return nil, errors.New(errWithCode.Message)
	}

	modelList := parseCodexModelList(response)
	if len(modelList) == 0 {
		return nil, errors.New("no models returned")
	}

	return modelList, nil
}

func (p *CodexProvider) getCodexModelListClientVersion() string {
	proxyURL := ""
	if p != nil && p.Channel != nil {
		proxyURL = p.Channel.GetProxy()
	}
	return GetCodexClientVersionWithProxy(proxyURL)
}

func (p *CodexProvider) getCodexCLIUserAgent() string {
	proxyURL := ""
	if p != nil && p.Channel != nil {
		proxyURL = p.Channel.GetProxy()
	}
	return GetCodexCLIUserAgentWithProxy(proxyURL)
}

func GetCodexCLIUserAgent() string {
	return "codex_cli_rs/" + GetCodexClientVersion() + " (Ubuntu 22.4.0; x86_64) WindowsTerminal"
}

func GetCodexCLIUserAgentWithProxy(proxyURL string) string {
	return "codex_cli_rs/" + GetCodexClientVersionWithProxy(proxyURL) + " (Ubuntu 22.4.0; x86_64) WindowsTerminal"
}

func GetCodexClientVersion() string {
	return GetCodexClientVersionWithProxy("")
}

func GetCodexClientVersionWithProxy(proxyURL string) string {
	now := time.Now()

	codexClientVersionCache.RLock()
	if codexClientVersionCache.version != "" && now.Before(codexClientVersionCache.expiresAt) {
		version := codexClientVersionCache.version
		codexClientVersionCache.RUnlock()
		return version
	}
	codexClientVersionCache.RUnlock()

	version, err := fetchLatestCodexClientVersion(proxyURL)
	if err != nil || !isValidCodexClientVersion(version) {
		version = codexFallbackClientVersion
	}

	codexClientVersionCache.Lock()
	codexClientVersionCache.version = version
	codexClientVersionCache.expiresAt = now.Add(codexClientVersionCacheDuration)
	codexClientVersionCache.Unlock()

	return version
}

func fetchLatestCodexClientVersion(proxyURL string) (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	if proxyURL != "" {
		proxyURLParsed, err := url.Parse(proxyURL)
		if err == nil {
			client.Transport = &http.Transport{
				Proxy: http.ProxyURL(proxyURLParsed),
			}
		}
	}

	req, err := http.NewRequest(http.MethodGet, codexNPMRegistryURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", errors.New(resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var response npmPackageMetadata
	if err := json.Unmarshal(body, &response); err != nil {
		return "", err
	}

	return strings.TrimSpace(response.DistTags.Latest), nil
}

func isValidCodexClientVersion(version string) bool {
	if version == "" {
		return false
	}
	for _, r := range version {
		if (r >= '0' && r <= '9') || r == '.' || r == '-' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			continue
		}
		return false
	}
	return version[0] >= '0' && version[0] <= '9'
}

func withCodexModelListClientVersion(rawURL string, clientVersion string) string {
	separator := "?"
	if strings.Contains(rawURL, "?") {
		separator = "&"
	}
	return rawURL + separator + "client_version=" + url.QueryEscape(clientVersion)
}

func parseCodexModelList(response *codexModelListResponse) []string {
	models := response.Models
	if len(models) == 0 {
		models = response.Data
	}

	seen := make(map[string]bool)
	modelList := make([]codexModelEntry, 0, len(models))
	for _, model := range models {
		modelName := model.Slug
		if modelName == "" {
			modelName = model.ID
		}
		if modelName == "" || seen[modelName] {
			continue
		}
		if model.Visibility != "" && model.Visibility != "list" {
			continue
		}
		seen[modelName] = true
		modelList = append(modelList, codexModelEntry{
			name:     modelName,
			priority: model.Priority,
		})
	}
	sort.SliceStable(modelList, func(i, j int) bool {
		if modelList[i].priority == modelList[j].priority {
			return modelList[i].name < modelList[j].name
		}
		return modelList[i].priority < modelList[j].priority
	})

	names := make([]string, 0, len(modelList))
	for _, model := range modelList {
		names = append(names, model.name)
	}
	return names
}

type codexModelEntry struct {
	name     string
	priority int
}

type npmPackageMetadata struct {
	DistTags npmDistTags `json:"dist-tags"`
}

type npmDistTags struct {
	Latest string `json:"latest"`
}
