package model

import (
	"done-hub/common/config"
	"testing"
)

func TestInferModelChannelTypeChineseModels(t *testing.T) {
	tests := []struct {
		modelName   string
		channelType int
	}{
		{modelName: "kimi-k2.6", channelType: config.ChannelTypeMoonshot},
		{modelName: "moonshotai/kimi-k2.5", channelType: config.ChannelTypeMoonshot},
		{modelName: "claude-sonnet-4-5", channelType: config.ChannelTypeAnthropic},
		{modelName: "anthropic/claude-opus-4.5", channelType: config.ChannelTypeAnthropic},
		{modelName: "minimax-m2.7", channelType: config.ChannelTypeMiniMax},
		{modelName: "mimo-v2-pro", channelType: config.ChannelTypeXiaomi},
		{modelName: "xiaomi/mimo-v2.5-pro", channelType: config.ChannelTypeXiaomi},
		{modelName: "qwen3.7-max", channelType: config.ChannelTypeAli},
		{modelName: "glm-5.1", channelType: config.ChannelTypeZhipu},
		{modelName: "deepseek-v4-flash", channelType: config.ChannelTypeDeepseek},
		{modelName: "hy3-preview", channelType: config.ChannelTypeTencent},
		{modelName: "hunyuan-turbos-latest", channelType: config.ChannelTypeHunyuan},
		{modelName: "doubao-seed-1.6", channelType: config.ChannelTypeDoubao},
		{modelName: "ERNIE-4.5-300B-A47B", channelType: config.ChannelTypeBaidu},
		{modelName: "qianfan-ocr-fast", channelType: config.ChannelTypeBaidu},
		{modelName: "ui-tars-1.5-7b", channelType: config.ChannelTypeDoubao},
		{modelName: "gemini-2.5-pro", channelType: config.ChannelTypeGemini},
		{modelName: "gemini-3-flash-preview", channelType: config.ChannelTypeGemini},
		{modelName: "gemini-3.1-pro-preview", channelType: config.ChannelTypeGemini},
		{modelName: "gemini-3.5-flash", channelType: config.ChannelTypeGemini},
		{modelName: "google/gemini-3.5-flash", channelType: config.ChannelTypeGemini},
	}

	for _, tt := range tests {
		t.Run(tt.modelName, func(t *testing.T) {
			if got := InferModelChannelType(tt.modelName); got != tt.channelType {
				t.Fatalf("InferModelChannelType(%q) = %d, want %d", tt.modelName, got, tt.channelType)
			}
		})
	}
}

func TestInferModelChannelTypeUnknown(t *testing.T) {
	if got := InferModelChannelType("unknown-model"); got != config.ChannelTypeUnknown {
		t.Fatalf("InferModelChannelType returned %d, want unknown", got)
	}
}

func TestGetPriceUsesCanonicalAliases(t *testing.T) {
	pricing := &Pricing{
		Prices: map[string]*Price{
			"moonshotai/kimi-k2.6": {
				Model:       "moonshotai/kimi-k2.6",
				Type:        TokensPriceType,
				ChannelType: config.ChannelTypeOpenRouter,
				Input:       0.75,
				Output:      3.5,
			},
			"xiaomi/mimo-v2-pro": {
				Model:       "xiaomi/mimo-v2-pro",
				Type:        TokensPriceType,
				ChannelType: config.ChannelTypeOpenRouter,
				Input:       1,
				Output:      3,
			},
			"tencent/hy3-preview:free": {
				Model:       "tencent/hy3-preview:free",
				Type:        TokensPriceType,
				ChannelType: config.ChannelTypeOpenRouter,
				Input:       0,
				Output:      0,
			},
			"anthropic/claude-opus-4.5": {
				Model:       "anthropic/claude-opus-4.5",
				Type:        TokensPriceType,
				ChannelType: config.ChannelTypeOpenRouter,
				Input:       5,
				Output:      25,
			},
			"qwen/qwen3.6-plus": {
				Model:       "qwen/qwen3.6-plus",
				Type:        TokensPriceType,
				ChannelType: config.ChannelTypeOpenRouter,
				Input:       0.325,
				Output:      1.95,
			},
			"z-ai/glm-5": {
				Model:       "z-ai/glm-5",
				Type:        TokensPriceType,
				ChannelType: config.ChannelTypeOpenRouter,
				Input:       0.6,
				Output:      1.92,
			},
			"deepseek/deepseek-v4-pro": {
				Model:       "deepseek/deepseek-v4-pro",
				Type:        TokensPriceType,
				ChannelType: config.ChannelTypeOpenRouter,
				Input:       0.435,
				Output:      0.87,
			},
			"qwen/qwen3-coder:exacto": {
				Model:       "qwen/qwen3-coder:exacto",
				Type:        TokensPriceType,
				ChannelType: config.ChannelTypeOpenRouter,
				Input:       0.2,
				Output:      0.8,
			},
			"alibaba/tongyi-deepresearch-30b-a3b": {
				Model:       "alibaba/tongyi-deepresearch-30b-a3b",
				Type:        TokensPriceType,
				ChannelType: config.ChannelTypeOpenRouter,
				Input:       0.09,
				Output:      0.45,
			},
		},
	}

	tests := []struct {
		modelName   string
		channelType int
		input       float64
		output      float64
	}{
		{modelName: "kimi-k2.6", channelType: config.ChannelTypeMoonshot, input: 0.75, output: 3.5},
		{modelName: "mimo-v2-pro", channelType: config.ChannelTypeXiaomi, input: 1, output: 3},
		{modelName: "hy3-preview", channelType: config.ChannelTypeTencent, input: 0, output: 0},
		{modelName: "claude-opus-4-5", channelType: config.ChannelTypeAnthropic, input: 5, output: 25},
		{modelName: "qwen3.6-plus", channelType: config.ChannelTypeAli, input: 0.325, output: 1.95},
		{modelName: "glm-5", channelType: config.ChannelTypeZhipu, input: 0.6, output: 1.92},
		{modelName: "deepseek-v4-pro", channelType: config.ChannelTypeDeepseek, input: 0.435, output: 0.87},
		{modelName: "qwen3-coder", channelType: config.ChannelTypeAli, input: 0.2, output: 0.8},
		{modelName: "tongyi-deepresearch-30b-a3b", channelType: config.ChannelTypeAli, input: 0.09, output: 0.45},
	}

	for _, tt := range tests {
		t.Run(tt.modelName, func(t *testing.T) {
			price := pricing.GetPrice(tt.modelName)
			if price.Model != tt.modelName {
				t.Fatalf("price.Model = %q, want %q", price.Model, tt.modelName)
			}
			if price.ChannelType != tt.channelType {
				t.Fatalf("price.ChannelType = %d, want %d", price.ChannelType, tt.channelType)
			}
			if price.Input != tt.input || price.Output != tt.output {
				t.Fatalf("price = %g/%g, want %g/%g", price.Input, price.Output, tt.input, tt.output)
			}
		})
	}
}

func TestGetPriceReclassifiesExactPriceProvider(t *testing.T) {
	pricing := &Pricing{
		Prices: map[string]*Price{
			"kimi-k2.5": {
				Model:       "kimi-k2.5",
				Type:        TokensPriceType,
				ChannelType: config.ChannelTypeAli,
				Input:       0.574,
				Output:      3.011,
			},
		},
	}

	price := pricing.GetPrice("kimi-k2.5")
	if price.ChannelType != config.ChannelTypeMoonshot {
		t.Fatalf("price.ChannelType = %d, want %d", price.ChannelType, config.ChannelTypeMoonshot)
	}
	if price.Input != 0.574 || price.Output != 3.011 {
		t.Fatalf("price = %g/%g, want 0.574/3.011", price.Input, price.Output)
	}
}

func TestShouldReplaceDuplicatePriceWithInferredProvider(t *testing.T) {
	existing := &Price{Model: "glm-5", ChannelType: config.ChannelTypeAli, Input: 0.573, Output: 2.58}
	candidate := &Price{Model: "glm-5", ChannelType: config.ChannelTypeZhipu, Input: 1, Output: 3.2}

	if !shouldReplaceDuplicatePrice(existing, candidate) {
		t.Fatal("expected duplicate GLM price to prefer Zhipu over Ali")
	}
}

func TestHYAndGrokProviderCompatibility(t *testing.T) {
	tests := []struct {
		name string
		want int
	}{
		{"hy3-preview", config.ChannelTypeTencent},
		{"hy4-preview", config.ChannelTypeTencent},
		{"hy10", config.ChannelTypeTencent},
		{" +~Tencent/HY4-preview ", config.ChannelTypeTencent},
		{"hunyuan-turbos-latest", config.ChannelTypeHunyuan},
		{"hyper-model", config.ChannelTypeUnknown},
		{"hybrid-model", config.ChannelTypeUnknown},
		{"hy", config.ChannelTypeUnknown},
		{"hy-preview", config.ChannelTypeUnknown},
		{"grok-4.6", config.ChannelTypeXAI},
		{"x-ai/grok-4.6", config.ChannelTypeXAI},
		{"xai.grok-4.6", config.ChannelTypeXAI},
		{"global.xai.grok-4.6", config.ChannelTypeXAI},
		{"us.xai.grok-4.6", config.ChannelTypeXAI},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := InferModelChannelType(tt.name); got != tt.want {
				t.Fatalf("provider = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestHYAndGrokPriceCompatibility(t *testing.T) {
	pricing := &Pricing{Prices: map[string]*Price{
		"tencent/hy4-preview": {Model: "tencent/hy4-preview", ChannelType: config.ChannelTypeOpenRouter, Input: 0.834, Output: 2.501},
		"x-ai/grok-4.6":       {Model: "x-ai/grok-4.6", ChannelType: config.ChannelTypeOpenRouter, Input: 2, Output: 6},
		"us.xai.grok-4.6":     {Model: "us.xai.grok-4.6", ChannelType: config.ChannelTypeBedrock, Input: 2.2, Output: 6.6},
	}}
	for _, tt := range []struct {
		name          string
		input, output float64
	}{
		{"hy4-preview", 0.834, 2.501},
		{"grok-4.6", 2, 6},
		{"us.xai.grok-4.6", 2.2, 6.6},
	} {
		t.Run(tt.name, func(t *testing.T) {
			price := pricing.GetPrice(tt.name)
			if price.Input != tt.input || price.Output != tt.output {
				t.Fatalf("price = %g/%g, want %g/%g", price.Input, price.Output, tt.input, tt.output)
			}
		})
	}
	// Exact platform prices take priority over aliases, and reads do not rewrite stored records.
	if pricing.Prices["us.xai.grok-4.6"].ChannelType != config.ChannelTypeBedrock {
		t.Fatal("GetPrice mutated the stored provider")
	}
	pricing.Prices["hy4-preview"] = &Price{Model: "hy4-preview", Input: 7, Output: 8}
	if price := pricing.GetPrice("hy4-preview"); price.Input != 7 || price.Output != 8 {
		t.Fatal("alias overrode an exact price")
	}
	for _, name := range []string{"hyper-model", "hybrid-model"} {
		if aliases := GetModelPriceAliases(name); len(aliases) != 0 {
			t.Fatalf("unexpected aliases for %s: %v", name, aliases)
		}
	}
}

func TestGrokDuplicatePrefersOriginalProvider(t *testing.T) {
	vertex := &Price{Model: "grok-4.6", ChannelType: config.ChannelTypeVertexAI}
	xai := &Price{Model: "grok-4.6", ChannelType: config.ChannelTypeXAI}
	if !shouldReplaceDuplicatePrice(vertex, xai) || shouldReplaceDuplicatePrice(xai, vertex) {
		t.Fatal("duplicate Grok prices must prefer xAI in either input order")
	}
}

func TestDeepseekFlashLatestPriceAlias(t *testing.T) {
	for _, name := range []string{"~deepseek/deepseek-flash-latest", "deepseek/deepseek-flash-latest"} {
		t.Run(name, func(t *testing.T) {
			latest := &Price{Model: name, ChannelType: config.ChannelTypeOpenRouter, Input: 0.15, Output: 0.6}
			pricing := &Pricing{Prices: map[string]*Price{name: latest}}
			price := pricing.GetPrice("deepseek-flash")
			if price.Model != "deepseek-flash" || price.ChannelType != config.ChannelTypeDeepseek || price.Input != 0.15 || price.Output != 0.6 {
				t.Fatalf("unexpected alias price: %+v", price)
			}
			if latest.Model != name || latest.ChannelType != config.ChannelTypeOpenRouter {
				t.Fatal("alias lookup mutated the stored price")
			}
			pricing.Prices["deepseek-flash"] = &Price{Model: "deepseek-flash", Input: 0.2, Output: 0.8}
			price = pricing.GetPrice("deepseek-flash")
			if price.Input != 0.2 || price.Output != 0.8 {
				t.Fatal("latest alias overrode the exact price")
			}
		})
	}
	for _, name := range []string{"deepseek-v4-flash", "deepseek-flash-preview", "other-model"} {
		for _, alias := range GetModelPriceAliases(name) {
			if alias == "~deepseek/deepseek-flash-latest" || alias == "deepseek/deepseek-flash-latest" || alias == name+"-latest" {
				t.Fatalf("unexpected latest alias for %s: %s", name, alias)
			}
		}
	}
}

func TestProviderRuleBoundaries(t *testing.T) {
	for _, rule := range modelProviderRules {
		t.Run(rule.prefix, func(t *testing.T) {
			for _, suffix := range []string{"3.5-preview", "10"} {
				if got := InferModelChannelType(rule.prefix + suffix); got != rule.channelType {
					t.Errorf("numeric suffix %q: got %d, want %d", suffix, got, rule.channelType)
				}
			}
			if rule.prefix != "hy" {
				for _, suffix := range []string{"", "-preview", "_preview", ".preview", ":free", "/model"} {
					if got := InferModelChannelType(rule.prefix + suffix); got != rule.channelType {
						t.Errorf("suffix %q: got %d, want %d", suffix, got, rule.channelType)
					}
				}
			}
			if hasModelProviderPrefix(rule.prefix+"unrelated", rule.prefix) {
				t.Error("matched an unrelated word")
			}
		})
	}
	for _, name := range []string{"seedling", "kimiko", "grokking", "hyper-model", "hybrid-model"} {
		if got := InferModelChannelType(name); got != config.ChannelTypeUnknown {
			t.Errorf("%s: got %d, want unknown", name, got)
		}
	}
}
