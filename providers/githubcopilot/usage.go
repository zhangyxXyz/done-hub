package githubcopilot

import (
	"done-hub/common/cache"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"golang.org/x/sync/singleflight"
)

const UsageEndpoint = "/copilot_internal/user"

type UsageStatus map[string]any

type UsageCacheConfig struct {
	TTLSeconds      int   `json:"usage_cache_ttl_seconds"`
	StaleSeconds    int   `json:"usage_cache_stale_seconds"`
	UseStaleOnError *bool `json:"usage_cache_use_stale_on_error"`
}

type UsageResult struct {
	Usage      UsageStatus `json:"usage"`
	StatusCode int         `json:"status"`
	Cached     bool        `json:"cached"`
	Stale      bool        `json:"stale"`
	Empty      bool        `json:"empty,omitempty"`
	FetchedAt  int64       `json:"fetched_at"`
	Warning    string      `json:"warning,omitempty"`
}

type usageCacheEntry struct {
	Usage     UsageStatus `json:"usage"`
	Status    int         `json:"status"`
	FetchedAt int64       `json:"fetched_at"`
}

type usageErrorCacheEntry struct {
	Message string `json:"message"`
}

const (
	defaultUsageCacheTTLSeconds   = 300
	defaultUsageCacheStaleSeconds = 86400
)

var usageRequestGroup singleflight.Group

func (p *Provider) RequestUsage() (UsageStatus, int, error) {
	oauthToken, err := parseOAuthToken(p.Channel.Key)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get GitHub OAuth token: %w", err)
	}

	headers := p.GetRequestHeaders()
	headers["Authorization"] = "Bearer " + oauthToken
	headers["Accept"] = "application/json"

	req, err := p.Requester.NewRequest(http.MethodGet, strings.TrimRight(githubAPIBase, "/")+UsageEndpoint, p.Requester.WithHeader(headers))
	if err != nil {
		return nil, 0, err
	}

	var usage UsageStatus
	resp, errWithCode := p.Requester.SendRequest(req, &usage, false)
	if errWithCode != nil {
		return nil, errWithCode.StatusCode, fmt.Errorf("%s", errWithCode.OpenAIError.Message)
	}
	statusCode := http.StatusOK
	if resp != nil {
		statusCode = resp.StatusCode
	}
	if usage == nil {
		return UsageStatus{}, statusCode, nil
	}
	return usage, statusCode, nil
}

func hasUsageQuota(usage UsageStatus) bool {
	for _, key := range []string{"quota_snapshots", "limited_user_quotas", "monthly_quotas"} {
		if value, ok := usage[key]; ok && value != nil {
			return true
		}
	}
	return false
}

func (p *Provider) RequestUsageWithCache() (*UsageResult, error) {
	key := "githubcopilot_usage_request:" + channelCacheKey(p.Channel)
	value, err, _ := usageRequestGroup.Do(key, func() (any, error) {
		return p.requestUsageWithCache()
	})
	if err != nil {
		return nil, err
	}
	result, ok := value.(*UsageResult)
	if !ok {
		return nil, fmt.Errorf("invalid GitHub Copilot usage result")
	}
	return result, nil
}

func (p *Provider) requestUsageWithCache() (*UsageResult, error) {
	cacheConfig := p.GetUsageCacheConfig()
	cacheKey := fmt.Sprintf("githubcopilot_usage:%s", channelCacheKey(p.Channel))
	staleCacheKey := cacheKey + ":stale"
	errorCacheKey := cacheKey + ":error"

	if cacheConfig.TTLSeconds > 0 {
		if entry, err := cache.GetCache[usageCacheEntry](cacheKey); err == nil && entry.Usage != nil {
			return &UsageResult{Usage: entry.Usage, StatusCode: entry.Status, Cached: true, FetchedAt: entry.FetchedAt, Empty: !hasUsageQuota(entry.Usage)}, nil
		}
		if entry, err := cache.GetCache[usageErrorCacheEntry](errorCacheKey); err == nil && entry.Message != "" {
			return nil, fmt.Errorf("%s", entry.Message)
		}
	}

	usage, statusCode, err := p.RequestUsage()
	if err != nil {
		if cacheConfig.AllowStaleOnError() {
			if entry, cacheErr := cache.GetCache[usageCacheEntry](staleCacheKey); cacheErr == nil && entry.Usage != nil {
				return &UsageResult{Usage: entry.Usage, StatusCode: entry.Status, Cached: true, Stale: true, FetchedAt: entry.FetchedAt, Empty: !hasUsageQuota(entry.Usage), Warning: err.Error()}, nil
			}
		}
		if cacheConfig.TTLSeconds > 0 {
			cache.SetCache(errorCacheKey, usageErrorCacheEntry{Message: err.Error()}, usageErrorCacheDuration(cacheConfig.TTLSeconds))
		}
		return nil, err
	}

	fetchedAt := time.Now().Unix()
	empty := !hasUsageQuota(usage)
	warning := ""
	if empty {
		warning = "GitHub 未返回可用的 Copilot 额度快照"
	}
	if cacheConfig.TTLSeconds > 0 {
		entry := usageCacheEntry{Usage: usage, Status: statusCode, FetchedAt: fetchedAt}
		cache.SetCache(cacheKey, entry, time.Duration(cacheConfig.TTLSeconds)*time.Second)
		if cacheConfig.StaleSeconds > 0 {
			cache.SetCache(staleCacheKey, entry, time.Duration(cacheConfig.StaleSeconds)*time.Second)
		}
	}
	return &UsageResult{Usage: usage, StatusCode: statusCode, FetchedAt: fetchedAt, Empty: empty, Warning: warning}, nil
}

func (p *Provider) GetUsageCacheConfig() UsageCacheConfig {
	result := UsageCacheConfig{TTLSeconds: defaultUsageCacheTTLSeconds, StaleSeconds: defaultUsageCacheStaleSeconds}
	if p.Channel == nil || p.Channel.Other == "" {
		return result
	}
	var raw map[string]any
	if err := json.Unmarshal([]byte(p.Channel.Other), &raw); err != nil {
		return result
	}
	if value, ok := usageNumber(raw["usage_cache_ttl_seconds"]); ok {
		result.TTLSeconds = clampUsageCacheSeconds(value, 0, 3600)
	}
	if value, ok := usageNumber(raw["usage_cache_stale_seconds"]); ok {
		result.StaleSeconds = clampUsageCacheSeconds(value, 0, 604800)
	}
	if value, ok := raw["usage_cache_use_stale_on_error"].(bool); ok {
		result.UseStaleOnError = &value
	}
	return result
}

func (c UsageCacheConfig) AllowStaleOnError() bool {
	if c.StaleSeconds <= 0 {
		return false
	}
	return c.UseStaleOnError == nil || *c.UseStaleOnError
}

func usageNumber(value any) (int, bool) {
	switch number := value.(type) {
	case float64:
		return int(number), true
	case int:
		return number, true
	default:
		return 0, false
	}
}

func clampUsageCacheSeconds(value, minValue, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func usageErrorCacheDuration(ttlSeconds int) time.Duration {
	if ttlSeconds < 30 {
		return 30 * time.Second
	}
	if ttlSeconds > 120 {
		return 120 * time.Second
	}
	return time.Duration(ttlSeconds) * time.Second
}
