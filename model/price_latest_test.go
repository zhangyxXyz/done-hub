package model

import (
	"done-hub/common/config"
	"testing"
)

func TestLatestFallbackGenericAndPriority(t *testing.T) {
	old := config.ModelPriceLatestFallbackEnabled
	config.ModelPriceLatestFallbackEnabled = true
	t.Cleanup(func() { config.ModelPriceLatestFallbackEnabled = old })
	for _, name := range []string{"arbitrary-model", "vendor/arbitrary-model", "global.vendor.model", "qwen3.5"} {
		t.Run(name, func(t *testing.T) {
			latest := &Price{Model: name + "-latest", Input: 12.34}
			p := &Pricing{Prices: map[string]*Price{latest.Model: latest}}
			if p.GetPrice(name).Input != latest.Input {
				t.Fatal("generic fallback failed")
			}
			p.Prices[name+"*"] = &Price{Input: 23.45}
			p.Match = []string{name + "*"}
			if p.GetPrice(name).Input != 23.45 {
				t.Fatal("fallback overrode wildcard")
			}
			p.Prices[name] = &Price{Input: 34.56}
			if p.GetPrice(name).Input != 34.56 {
				t.Fatal("fallback overrode exact match")
			}
		})
	}
	p := &Pricing{Prices: map[string]*Price{
		"deepseek/deepseek-flash": {Input: 12.34},
		"deepseek-flash-latest":   {Input: 23.45},
	}}
	if p.GetPrice("deepseek-flash").Input != 12.34 {
		t.Fatal("fallback overrode existing alias")
	}
	config.ModelPriceLatestFallbackEnabled = false
	p = &Pricing{Prices: map[string]*Price{"arbitrary-model-latest": {Input: 12.34}}}
	if p.GetPrice("arbitrary-model").Input == 12.34 {
		t.Fatal("disabled fallback applied")
	}
}

func TestLatestFallbackPreservesDirectionAndPlatform(t *testing.T) {
	for _, name := range []string{"vendor/claude-test", "global.xai.grok-4.6"} {
		aliases := GetLatestPriceAliases(name)
		if len(aliases) != 1 || aliases[0] != name+"-latest" {
			t.Fatalf("platform changed: %v", aliases)
		}
	}
	if aliases := GetLatestPriceAliases("anything-latest"); len(aliases) != 0 {
		t.Fatalf("appended latest twice: %v", aliases)
	}
}
