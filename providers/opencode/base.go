package opencode

import (
	"done-hub/model"
	"done-hub/providers/base"
	"done-hub/providers/openai"
	"encoding/json"
	"errors"
	"strings"
)

const DefaultBaseURL = "https://opencode.ai/zen/go"

type ProviderFactory struct{}

func (ProviderFactory) Create(channel *model.Channel) base.ProviderInterface {
	provider := openai.CreateOpenAIProvider(channel, DefaultBaseURL)
	provider.SupportStreamOptions = true
	provider.SupportResponse = false
	provider.BalanceAction = false
	credentials := parseCredentials(channel.Key)
	provider.RequestHeaders = func() map[string]string {
		headers := make(map[string]string)
		provider.CommonRequestHeaders(headers)
		headers["Authorization"] = "Bearer " + credentials.APIKey
		return headers
	}
	return &Provider{OpenAIProvider: *provider}
}

// Provider 使用 OpenAI 兼容协议转发 OpenCode Go 请求，并额外提供 Dashboard 额度查询。
type Provider struct {
	openai.OpenAIProvider
}

type Credentials struct {
	APIKey     string `json:"api_key"`
	AuthCookie string `json:"auth_cookie"`
}

func parseCredentials(raw string) Credentials {
	credentials, _ := ParseCredentials(raw)
	return credentials
}

func ParseCredentials(raw string) (Credentials, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return Credentials{}, errors.New("OpenCode API Key 不能为空")
	}
	var credentials Credentials
	if strings.HasPrefix(trimmed, "{") {
		if err := json.Unmarshal([]byte(trimmed), &credentials); err != nil {
			return Credentials{}, errors.New("OpenCode 凭据必须是有效 JSON")
		}
		credentials.APIKey = strings.TrimSpace(credentials.APIKey)
		credentials.AuthCookie = strings.TrimSpace(credentials.AuthCookie)
		if credentials.APIKey == "" {
			return Credentials{}, errors.New("OpenCode 凭据缺少 api_key")
		}
		if credentials.AuthCookie != "" && buildAuthCookie(credentials.AuthCookie) == "" {
			return Credentials{}, errors.New("OpenCode auth_cookie 格式无效")
		}
		return credentials, nil
	}
	if strings.ContainsAny(trimmed, "\r\n") {
		return Credentials{}, errors.New("OpenCode API Key 不能包含换行")
	}
	return Credentials{APIKey: trimmed}, nil
}
