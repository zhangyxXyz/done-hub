package model

import (
	"done-hub/common/config"
	"strings"
	"testing"
)

func TestModelsDevChannelType(t *testing.T) {
	tests := []struct {
		name        string
		provider    string
		model       string
		channelType int
	}{
		{name: "provider fallback for OpenAI", provider: "openai", model: "gpt-5", channelType: config.ChannelTypeOpenAI},
		{name: "provider fallback for xAI", provider: "xai", model: "grok-4", channelType: config.ChannelTypeXAI},
		{name: "model inference takes priority", provider: "hosted", model: "claude-sonnet-4", channelType: config.ChannelTypeAnthropic},
		{name: "unknown provider becomes custom", provider: "hosted", model: "vendor-model", channelType: config.ChannelTypeCustom},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := modelsDevChannelType(tt.provider, tt.model); got != tt.channelType {
				t.Fatalf("modelsDevChannelType(%q, %q) = %d, want %d", tt.provider, tt.model, got, tt.channelType)
			}
		})
	}
}

func TestConvertModelsDevToPricesAssignsValidChannelTypes(t *testing.T) {
	prices, err := ConvertModelsDevToPrices(strings.NewReader(`{
		"openai": {"models": {"gpt-5": {"cost": {"input": 2, "output": 4}}}},
		"xai": {"models": {"grok-4": {"cost": {"input": 3, "output": 6}}}},
		"hosted": {"models": {"vendor-model": {"cost": {"input": 1, "output": 2}}}}
	}`))
	if err != nil {
		t.Fatalf("ConvertModelsDevToPrices returned error: %v", err)
	}

	got := make(map[string]int, len(prices))
	for _, price := range prices {
		got[price.Model] = price.ChannelType
		if price.ChannelType == config.ChannelTypeUnknown {
			t.Errorf("model %q retained an unknown channel type", price.Model)
		}
	}

	want := map[string]int{
		"gpt-5":        config.ChannelTypeOpenAI,
		"grok-4":       config.ChannelTypeXAI,
		"vendor-model": config.ChannelTypeCustom,
	}
	for model, channelType := range want {
		if got[model] != channelType {
			t.Errorf("model %q channel type = %d, want %d", model, got[model], channelType)
		}
	}
}
