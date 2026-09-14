package model

import (
	"done-hub/common/config"
	"done-hub/common/logger"
	"net/http"
	"net/http/httptest"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestUpdatePriceByPriceServiceRefreshesGlobalPricing(t *testing.T) {
	logger.SetupLogger()
	originalDB := DB
	originalPricing := PricingInstance
	originalMode := config.AutoPriceUpdatesMode
	originalService := config.UpdatePriceService
	t.Cleanup(func() {
		DB = originalDB
		PricingInstance = originalPricing
		config.AutoPriceUpdatesMode = originalMode
		config.UpdatePriceService = originalService
	})

	db, err := gorm.Open(sqlite.Open("file:pricing_auto_update?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	DB = db
	if err := DB.AutoMigrate(&Price{}, &ModelInfo{}); err != nil {
		t.Fatal(err)
	}
	if err := DB.Create(&Price{
		Model: "stale-model", Type: TokensPriceType, ChannelType: config.ChannelTypeOpenAI, Input: 1, Output: 1,
	}).Error; err != nil {
		t.Fatal(err)
	}

	PricingInstance = &Pricing{Prices: make(map[string]*Price), Match: make([]string, 0)}
	if err := PricingInstance.Init(); err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"model":"fresh-model","type":"tokens","channel_type":1,"input":2,"output":8}]`))
	}))
	defer server.Close()

	config.AutoPriceUpdatesMode = string(PriceUpdateModeReplace)
	config.UpdatePriceService = server.URL
	if err := UpdatePriceByPriceService(); err != nil {
		t.Fatal(err)
	}

	if _, ok := PricingInstance.Prices["stale-model"]; ok {
		t.Fatal("stale model remains in global pricing after automatic replace")
	}
	fresh, ok := PricingInstance.Prices["fresh-model"]
	if !ok {
		t.Fatal("fresh model is missing from global pricing after automatic update")
	}
	if fresh.Input != 2 || fresh.Output != 8 {
		t.Fatalf("fresh model price = input %v, output %v", fresh.Input, fresh.Output)
	}
}
