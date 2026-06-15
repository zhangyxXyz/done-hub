package model

import (
	"done-hub/common/config"
	"done-hub/common/logger"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestModelInfoFromRemoteSerializesArrayFields(t *testing.T) {
	info := modelInfoFromRemote(map[string]any{
		"model":             "qwen/qwen3.7-max",
		"name":              "Qwen: Qwen3.7 Max",
		"context_length":    float64(1000000),
		"max_tokens":        float64(65536),
		"input_modalities":  []any{"text", "image"},
		"output_modalities": []any{"text"},
		"tags":              []any{"openrouter", "tools"},
		"support_url":       []any{"https://openrouter.ai/models/qwen/qwen3.7-max"},
	})

	if info.Model != "qwen/qwen3.7-max" {
		t.Fatalf("Model = %q", info.Model)
	}
	if info.ContextLength != 1000000 || info.MaxTokens != 65536 {
		t.Fatalf("unexpected token lengths: context=%d max=%d", info.ContextLength, info.MaxTokens)
	}
	if info.InputModalities != `["text","image"]` {
		t.Fatalf("InputModalities = %q", info.InputModalities)
	}
	if info.SupportUrl != `["https://openrouter.ai/models/qwen/qwen3.7-max"]` {
		t.Fatalf("SupportUrl = %q", info.SupportUrl)
	}
}

func TestImportModelInfoReplaceDeletesStaleRows(t *testing.T) {
	originalDB := DB
	t.Cleanup(func() {
		DB = originalDB
	})

	db, err := gorm.Open(sqlite.Open("file:model_info_replace?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	DB = db
	if err := DB.AutoMigrate(&ModelInfo{}); err != nil {
		t.Fatal(err)
	}
	if err := DB.Create([]*ModelInfo{
		{Model: "keep-model", Name: "Old"},
		{Model: "stale-model", Name: "Stale"},
	}).Error; err != nil {
		t.Fatal(err)
	}

	result, err := ImportModelInfo([]*ModelInfo{
		{Model: "keep-model", Name: "New"},
		{Model: "new-model", Name: "Created"},
	}, "replace")
	if err != nil {
		t.Fatal(err)
	}
	if result.Created != 1 || result.Updated != 1 || result.Deleted != 1 {
		t.Fatalf("unexpected result: %+v", result)
	}

	var count int64
	if err := DB.Model(&ModelInfo{}).Where("model = ?", "stale-model").Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("stale row count = %d", count)
	}
}

func TestPriceReplaceDeletesOnlyUnlockedStaleRows(t *testing.T) {
	logger.SetupLogger()
	originalDB := DB
	t.Cleanup(func() {
		DB = originalDB
	})

	db, err := gorm.Open(sqlite.Open("file:price_replace?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	DB = db
	if err := DB.AutoMigrate(&Price{}, &ModelInfo{}); err != nil {
		t.Fatal(err)
	}
	if err := DB.Create([]*Price{
		{Model: "remote-model", Type: TokensPriceType, ChannelType: config.ChannelTypeOpenAI, Input: 1, Output: 1},
		{Model: "stale-unlocked", Type: TokensPriceType, ChannelType: config.ChannelTypeOpenAI, Input: 1, Output: 1},
		{Model: "stale-locked", Type: TokensPriceType, ChannelType: config.ChannelTypeOpenAI, Input: 1, Output: 1, Locked: true},
	}).Error; err != nil {
		t.Fatal(err)
	}

	pricing := &Pricing{Prices: make(map[string]*Price), Match: make([]string, 0)}
	if err := pricing.Init(); err != nil {
		t.Fatal(err)
	}
	if err := pricing.SyncPricing([]*Price{
		{Model: "remote-model", Type: TokensPriceType, ChannelType: config.ChannelTypeOpenAI, Input: 2, Output: 3},
		{Model: "new-remote", Type: TokensPriceType, ChannelType: config.ChannelTypeOpenAI, Input: 4, Output: 5},
	}, string(PriceUpdateModeReplace)); err != nil {
		t.Fatal(err)
	}

	var staleUnlocked int64
	if err := DB.Model(&Price{}).Where("model = ?", "stale-unlocked").Count(&staleUnlocked).Error; err != nil {
		t.Fatal(err)
	}
	if staleUnlocked != 0 {
		t.Fatalf("stale unlocked price count = %d", staleUnlocked)
	}

	var staleLocked int64
	if err := DB.Model(&Price{}).Where("model = ?", "stale-locked").Count(&staleLocked).Error; err != nil {
		t.Fatal(err)
	}
	if staleLocked != 1 {
		t.Fatalf("stale locked price count = %d", staleLocked)
	}
}
