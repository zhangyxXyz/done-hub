package codex

import (
	"done-hub/common/cache"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const UsageEndpoint = "/backend-api/wham/usage"

type UsageStatus map[string]any

type UsageCacheConfig struct {
	TTLSeconds      int    `json:"usage_cache_ttl_seconds"`
	StaleSeconds    int    `json:"usage_cache_stale_seconds"`
	UseStaleOnError *bool  `json:"usage_cache_use_stale_on_error"`
	UserAgent       string `json:"user_agent"`
}

type UsageResult struct {
	Usage      UsageStatus `json:"usage"`
	StatusCode int         `json:"status"`
	Cached     bool        `json:"cached"`
	Stale      bool        `json:"stale"`
	FetchedAt  int64       `json:"fetched_at"`
	Warning    string      `json:"warning,omitempty"`
}

type usageCacheEntry struct {
	Usage     UsageStatus `json:"usage"`
	Status    int         `json:"status"`
	FetchedAt int64       `json:"fetched_at"`
}

const (
	defaultUsageCacheTTLSeconds   = 300
	defaultUsageCacheStaleSeconds = 86400
)

func (p *CodexProvider) RequestUsage() (UsageStatus, int, error) {
	token, err := p.GetToken()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get token: %w", err)
	}

	headers := map[string]string{
		"Authorization":   "Bearer " + token,
		"originator":      "Codex Desktop",
		"User-Agent":      p.GetUsageCacheConfig().UsageUserAgent(),
		"Accept":          "application/json",
		"Accept-Language": "zh-CN,zh;q=0.9",
	}
	if p.Credentials != nil && p.Credentials.AccountID != "" {
		headers["ChatGPT-Account-Id"] = p.Credentials.AccountID
	}

	req, err := p.Requester.NewRequest(http.MethodGet, p.GetFullRequestURL(UsageEndpoint, ""), p.Requester.WithHeader(headers))
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
		return nil, statusCode, fmt.Errorf("empty usage response")
	}
	if _, ok := usage["rate_limit"]; !ok {
		body, _ := json.Marshal(usage)
		return nil, statusCode, fmt.Errorf("usage response missing rate_limit: %s", string(body))
	}

	return usage, statusCode, nil
}

func (p *CodexProvider) RequestUsageWithCache() (*UsageResult, error) {
	cacheConfig := p.GetUsageCacheConfig()
	if cacheConfig.TTLSeconds <= 0 {
		usage, statusCode, err := p.RequestUsage()
		if err != nil {
			return nil, err
		}
		return &UsageResult{
			Usage:      usage,
			StatusCode: statusCode,
			Cached:     false,
			Stale:      false,
			FetchedAt:  time.Now().Unix(),
		}, nil
	}

	cacheKey := fmt.Sprintf("codex_usage:%d", p.Channel.Id)
	staleCacheKey := fmt.Sprintf("codex_usage_stale:%d", p.Channel.Id)

	if entry, err := cache.GetCache[usageCacheEntry](cacheKey); err == nil && entry.Usage != nil {
		return &UsageResult{
			Usage:      entry.Usage,
			StatusCode: entry.Status,
			Cached:     true,
			Stale:      false,
			FetchedAt:  entry.FetchedAt,
		}, nil
	}

	usage, statusCode, err := p.RequestUsage()
	if err != nil {
		if cacheConfig.AllowStaleOnError() {
			if entry, cacheErr := cache.GetCache[usageCacheEntry](staleCacheKey); cacheErr == nil && entry.Usage != nil {
				return &UsageResult{
					Usage:      entry.Usage,
					StatusCode: entry.Status,
					Cached:     true,
					Stale:      true,
					FetchedAt:  entry.FetchedAt,
					Warning:    err.Error(),
				}, nil
			}
		}
		return nil, err
	}

	entry := usageCacheEntry{
		Usage:     usage,
		Status:    statusCode,
		FetchedAt: time.Now().Unix(),
	}
	cache.SetCache(cacheKey, entry, time.Duration(cacheConfig.TTLSeconds)*time.Second)
	if cacheConfig.StaleSeconds > 0 {
		cache.SetCache(staleCacheKey, entry, time.Duration(cacheConfig.StaleSeconds)*time.Second)
	}

	return &UsageResult{
		Usage:      usage,
		StatusCode: statusCode,
		Cached:     false,
		Stale:      false,
		FetchedAt:  entry.FetchedAt,
	}, nil
}

func (p *CodexProvider) GetUsageCacheConfig() UsageCacheConfig {
	config := UsageCacheConfig{
		TTLSeconds:   defaultUsageCacheTTLSeconds,
		StaleSeconds: defaultUsageCacheStaleSeconds,
	}

	if p.Channel == nil || p.Channel.Other == "" {
		return config
	}

	var raw map[string]any
	if err := json.Unmarshal([]byte(p.Channel.Other), &raw); err != nil {
		return config
	}

	if ttl, ok := numberFromJSON(raw["usage_cache_ttl_seconds"]); ok {
		config.TTLSeconds = clampUsageCacheSeconds(ttl, 0, 3600)
	}
	if stale, ok := numberFromJSON(raw["usage_cache_stale_seconds"]); ok {
		config.StaleSeconds = clampUsageCacheSeconds(stale, 0, 604800)
	}
	if useStale, ok := raw["usage_cache_use_stale_on_error"].(bool); ok {
		config.UseStaleOnError = &useStale
	}
	if userAgent, ok := raw["user_agent"].(string); ok {
		config.UserAgent = userAgent
	}

	return config
}

func (c UsageCacheConfig) UsageUserAgent() string {
	if c.UserAgent != "" {
		return c.UserAgent
	}
	return "Codex Desktop/26.601.2237.0 (Windows NT 10.0; x64)"
}

func (c UsageCacheConfig) AllowStaleOnError() bool {
	if c.StaleSeconds <= 0 {
		return false
	}
	if c.UseStaleOnError == nil {
		return true
	}
	return *c.UseStaleOnError
}

func numberFromJSON(value any) (int, bool) {
	switch v := value.(type) {
	case float64:
		return int(v), true
	case int:
		return v, true
	default:
		return 0, false
	}
}

func clampUsageCacheSeconds(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
