package githubcopilot

import (
	"crypto/sha256"
	"done-hub/common/requester"
	"done-hub/model"
	"done-hub/providers/base"
	"done-hub/providers/openai"
	"fmt"
	"net/url"
	"strings"

	"github.com/google/uuid"
)

var githubAPIBase = "https://api.github.com"
var copilotEndpointValidator = func(parsed *url.URL) bool {
	return parsed.Scheme == "https" && allowedCopilotHost(parsed.Hostname())
}

const (
	copilotUserAgent     = "GitHubCopilotChat/0.52.0"
	copilotEditorVersion = "vscode/1.120.0"
	copilotPluginVersion = "copilot-chat/0.52.0"
	copilotAPIVersion    = "2026-06-01"
)

type Factory struct{}

func (Factory) Create(channel *model.Channel) base.ProviderInterface { return New(channel) }

type Provider struct{ base.BaseProvider }

func New(channel *model.Channel) *Provider {
	return &Provider{BaseProvider: base.BaseProvider{
		Config:  base.ProviderConfig{BaseURL: "https://api.githubcopilot.com", ChatCompletions: "/chat/completions", ModelList: "/models"},
		Channel: channel, Requester: requester.NewHTTPRequester(channel.GetProxy(), openai.RequestErrorHandle), SupportResponse: false,
	}}
}

func (p *Provider) GetRequestHeaders() map[string]string {
	h := map[string]string{}
	p.CommonRequestHeaders(h)
	h["User-Agent"] = copilotUserAgent
	h["Editor-Version"] = copilotEditorVersion
	h["Editor-Plugin-Version"] = copilotPluginVersion
	h["Copilot-Integration-Id"] = "vscode-chat"
	h["X-GitHub-Api-Version"] = copilotAPIVersion
	h["X-Vscode-User-Agent-Library-Version"] = "electron-fetch"
	h["Editor-Device-Id"] = p.deviceID()
	return h
}

func (p *Provider) inferenceHeaders(token, intent, initiator string) map[string]string {
	h := p.GetRequestHeaders()
	h["Authorization"] = "Bearer " + token
	h["OpenAI-Intent"] = intent
	h["X-Request-Id"] = uuid.NewString()
	if initiator != "" {
		h["X-Initiator"] = initiator
	}
	if intent == "model-access" {
		h["X-Interaction-Type"] = "model-access"
	}
	return h
}

func (p *Provider) apiURL(apiBase, path string) (string, error) {
	if p.Channel.GetBaseURL() != "" {
		apiBase = p.Channel.GetBaseURL()
	}
	parsed, err := url.Parse(apiBase)
	if err != nil || !copilotEndpointValidator(parsed) {
		return "", fmt.Errorf("untrusted GitHub Copilot API endpoint: %s", apiBase)
	}
	return strings.TrimRight(apiBase, "/") + "/" + strings.TrimLeft(path, "/"), nil
}

func allowedCopilotHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	return host == "api.githubcopilot.com" || strings.HasSuffix(host, ".githubcopilot.com") ||
		host == "copilot-proxy.githubusercontent.com" || strings.HasSuffix(host, ".ghe.com")
}

func (p *Provider) deviceID() string {
	sum := sha256.Sum256([]byte("done-hub/github-copilot/device/" + p.Channel.Key))
	return fmt.Sprintf("%x-%x-%x-%x-%x", sum[0:4], sum[4:6], sum[6:8], sum[8:10], sum[10:16])
}

func channelCacheKey(c *model.Channel) string {
	keyHash := sha256.Sum256([]byte(c.Key))
	return fmt.Sprintf("%d:%x", c.Id, keyHash)
}
