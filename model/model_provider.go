package model

import (
	"done-hub/common/config"
	"strings"
)

type modelProviderRule struct {
	prefix      string
	channelType int
}

var modelProviderRules = []modelProviderRule{
	{prefix: "anthropic", channelType: config.ChannelTypeAnthropic},
	{prefix: "claude", channelType: config.ChannelTypeAnthropic},
	{prefix: "moonshot", channelType: config.ChannelTypeMoonshot},
	{prefix: "moonshotai", channelType: config.ChannelTypeMoonshot},
	{prefix: "kimi", channelType: config.ChannelTypeMoonshot},
	{prefix: "minimax", channelType: config.ChannelTypeMiniMax},
	{prefix: "abab", channelType: config.ChannelTypeMiniMax},
	{prefix: "mimo", channelType: config.ChannelTypeXiaomi},
	{prefix: "xiaomi", channelType: config.ChannelTypeXiaomi},
	{prefix: "qwen", channelType: config.ChannelTypeAli},
	{prefix: "qwq", channelType: config.ChannelTypeAli},
	{prefix: "qvq", channelType: config.ChannelTypeAli},
	{prefix: "tongyi", channelType: config.ChannelTypeAli},
	{prefix: "dashscope", channelType: config.ChannelTypeAli},
	{prefix: "glm", channelType: config.ChannelTypeZhipu},
	{prefix: "z-ai", channelType: config.ChannelTypeZhipu},
	{prefix: "zhipu", channelType: config.ChannelTypeZhipu},
	{prefix: "deepseek", channelType: config.ChannelTypeDeepseek},
	{prefix: "ernie", channelType: config.ChannelTypeBaidu},
	{prefix: "cobuddy", channelType: config.ChannelTypeBaidu},
	{prefix: "qianfan", channelType: config.ChannelTypeBaidu},
	{prefix: "wenxin", channelType: config.ChannelTypeBaidu},
	{prefix: "baidu", channelType: config.ChannelTypeBaidu},
	{prefix: "hunyuan", channelType: config.ChannelTypeHunyuan},
	{prefix: "hy3", channelType: config.ChannelTypeTencent},
	{prefix: "tencent", channelType: config.ChannelTypeTencent},
	{prefix: "doubao", channelType: config.ChannelTypeDoubao},
	{prefix: "seed", channelType: config.ChannelTypeDoubao},
	{prefix: "ui-tars", channelType: config.ChannelTypeDoubao},
	{prefix: "volcengine", channelType: config.ChannelTypeDoubao},
	{prefix: "baichuan", channelType: config.ChannelTypeBaichuan},
	{prefix: "yi", channelType: config.ChannelTypeLingyi},
	{prefix: "lingyi", channelType: config.ChannelTypeLingyi},
	{prefix: "sparkdesk", channelType: config.ChannelTypeXunfei},
	{prefix: "xunfei", channelType: config.ChannelTypeXunfei},
	{prefix: "360gpt", channelType: config.ChannelType360},
	{prefix: "ai360", channelType: config.ChannelType360},
}

func InferModelChannelType(modelName string) int {
	candidates := modelNameCandidates(modelName)
	for _, candidate := range candidates {
		for _, rule := range modelProviderRules {
			if hasModelProviderPrefix(candidate, rule.prefix) {
				return rule.channelType
			}
		}
	}
	return config.ChannelTypeUnknown
}

func GetModelPriceAliases(modelName string) []string {
	candidates := modelNameCandidates(modelName)
	if len(candidates) == 0 {
		return nil
	}

	aliases := make([]string, 0)
	seen := make(map[string]bool)
	addAlias := func(alias string) {
		if alias == "" || seen[alias] {
			return
		}
		seen[alias] = true
		aliases = append(aliases, alias)
	}
	addAliasVariants := func(alias string) {
		addAlias(alias)
		addAlias(alias + ":exacto")
		addAlias(alias + ":thinking")
		addAlias(alias + ":free")
	}

	for _, candidate := range candidates {
		if strings.Contains(candidate, "/") {
			continue
		}

		switch {
		case hasModelProviderPrefix(candidate, "kimi"):
			addAliasVariants("moonshotai/" + candidate)
			addAlias("~moonshotai/" + candidate)
		case hasModelProviderPrefix(candidate, "claude"):
			addAliasVariants("anthropic/" + candidate)
			addAliasVariants("anthropic/" + normalizeClaudeOpenRouterModel(candidate))
			addAlias("~anthropic/" + candidate)
		case hasModelProviderPrefix(candidate, "qwen") || hasModelProviderPrefix(candidate, "qwq") || hasModelProviderPrefix(candidate, "qvq") || hasModelProviderPrefix(candidate, "tongyi"):
			addAliasVariants("qwen/" + candidate)
			addAliasVariants("alibaba/" + candidate)
		case hasModelProviderPrefix(candidate, "glm"):
			addAliasVariants("z-ai/" + candidate)
			addAlias("zai." + candidate)
		case hasModelProviderPrefix(candidate, "deepseek"):
			addAliasVariants("deepseek/" + candidate)
		case hasModelProviderPrefix(candidate, "mimo"):
			addAliasVariants("xiaomi/" + candidate)
		case hasModelProviderPrefix(candidate, "hy3"):
			addAlias("tencent/" + candidate)
			addAlias("tencent/" + candidate + ":free")
		case hasModelProviderPrefix(candidate, "hunyuan"):
			addAliasVariants("tencent/" + candidate)
		case hasModelProviderPrefix(candidate, "minimax"):
			addAliasVariants("minimax/" + candidate)
		case hasModelProviderPrefix(candidate, "ernie") || hasModelProviderPrefix(candidate, "cobuddy") || hasModelProviderPrefix(candidate, "qianfan"):
			addAliasVariants("baidu/" + candidate)
		case hasModelProviderPrefix(candidate, "doubao") || hasModelProviderPrefix(candidate, "seed") || hasModelProviderPrefix(candidate, "ui-tars"):
			addAliasVariants("bytedance-seed/" + candidate)
			addAliasVariants("bytedance/" + candidate)
		}
	}

	return aliases
}

func normalizeClaudeOpenRouterModel(modelName string) string {
	parts := strings.Split(modelName, "-")
	if len(parts) < 2 {
		return modelName
	}

	start := len(parts) - 1
	for start >= 0 && isNumericModelVersionPart(parts[start]) {
		start--
	}
	if start == len(parts)-1 {
		return modelName
	}

	return strings.Join(parts[:start+1], "-") + "-" + strings.Join(parts[start+1:], ".")
}

func isNumericModelVersionPart(part string) bool {
	if part == "" {
		return false
	}
	for _, r := range part {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func hasModelProviderPrefix(modelName, prefix string) bool {
	return modelName == prefix ||
		strings.HasPrefix(modelName, prefix+"-") ||
		strings.HasPrefix(modelName, prefix+"_") ||
		strings.HasPrefix(modelName, prefix+".") ||
		(len(prefix) >= 3 && strings.HasPrefix(modelName, prefix))
}

func modelNameCandidates(modelName string) []string {
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	normalized = strings.TrimLeft(normalized, "+~")
	if normalized == "" {
		return nil
	}

	candidates := []string{normalized}
	if slashIndex := strings.LastIndex(normalized, "/"); slashIndex >= 0 && slashIndex < len(normalized)-1 {
		candidates = append(candidates, normalized[:slashIndex], normalized[slashIndex+1:])
	}

	return candidates
}
