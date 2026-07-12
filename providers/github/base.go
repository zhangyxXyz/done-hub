package github

import (
	"done-hub/common/requester"
	"done-hub/model"
	"done-hub/providers/base"
	"done-hub/providers/openai"
)

type GithubProviderFactory struct{}

// 创建 GithubProvider
func (f GithubProviderFactory) Create(channel *model.Channel) base.ProviderInterface {
	config := getGithubConfig()
	return &GithubProvider{
		OpenAIProvider: openai.OpenAIProvider{
			BaseProvider: base.BaseProvider{
				Config:    config,
				Channel:   channel,
				Requester: requester.NewHTTPRequester(channel.GetProxy(), openai.RequestErrorHandle),
			},
			BalanceAction: false,
		},
	}
}

func getGithubConfig() base.ProviderConfig {
	return base.ProviderConfig{
		BaseURL:         "https://models.github.ai",
		ChatCompletions: "/inference/chat/completions",
		Embeddings:      "/inference/embeddings",
		ModelList:       "/catalog/models",
	}
}

type GithubProvider struct {
	openai.OpenAIProvider
}
