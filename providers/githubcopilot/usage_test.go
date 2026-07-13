package githubcopilot

import (
	"done-hub/model"
	"testing"
)

func TestHasUsageQuota(t *testing.T) {
	tests := []struct {
		name  string
		usage UsageStatus
		want  bool
	}{
		{name: "paid snapshots", usage: UsageStatus{"quota_snapshots": map[string]any{"premium_interactions": map[string]any{"remaining": 42}}}, want: true},
		{name: "free remaining", usage: UsageStatus{"limited_user_quotas": map[string]any{"chat": 12}}, want: true},
		{name: "free monthly", usage: UsageStatus{"monthly_quotas": map[string]any{"chat": 50}}, want: true},
		{name: "no quota", usage: UsageStatus{"copilot_plan": "business"}, want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := hasUsageQuota(tt.usage); got != tt.want {
				t.Fatalf("hasUsageQuota() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestUsageCacheConfigDefaultsAndBounds(t *testing.T) {
	provider := New(&model.Channel{Other: `{"client_id":"custom-client","usage_cache_ttl_seconds":99999,"usage_cache_stale_seconds":9999999,"usage_cache_use_stale_on_error":false}`})
	config := provider.GetUsageCacheConfig()
	if config.TTLSeconds != 3600 || config.StaleSeconds != 604800 || config.AllowStaleOnError() {
		t.Fatalf("unexpected cache config: %+v", config)
	}

	provider = New(&model.Channel{Other: "OAuth Client ID is not JSON"})
	config = provider.GetUsageCacheConfig()
	if config.TTLSeconds != 300 || config.StaleSeconds != 86400 || !config.AllowStaleOnError() {
		t.Fatalf("unexpected default cache config: %+v", config)
	}
}
