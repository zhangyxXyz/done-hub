package opencode

import (
	"context"
	"crypto/sha256"
	"done-hub/common/cache"
	"done-hub/common/utils"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/sync/singleflight"
)

const (
	defaultDashboardBase          = "https://opencode.ai/workspace"
	defaultWorkspaceServerID      = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f"
	defaultUsageCacheTTLSeconds   = 300
	defaultUsageCacheStaleSeconds = 86400
	defaultUsageTimeoutSeconds    = 10
	maxUsageResponseBytes         = 4 << 20
)

var (
	workspaceIDPattern    = regexp.MustCompile(`wrk_[A-Za-z0-9]+`)
	workspaceEntryPattern = regexp.MustCompile(`(?s)id\s*:\s*"(wrk_[^"]+)"[^{}]*?name\s*:\s*"([^"]*)"`)
	usageObjectPatterns   = map[string]*regexp.Regexp{
		"rolling": regexp.MustCompile(`(?s)rollingUsage:\s*\$R\[\d+\]\s*=\s*\{([^}]*)\}`),
		"weekly":  regexp.MustCompile(`(?s)weeklyUsage:\s*\$R\[\d+\]\s*=\s*\{([^}]*)\}`),
		"monthly": regexp.MustCompile(`(?s)monthlyUsage:\s*\$R\[\d+\]\s*=\s*\{([^}]*)\}`),
	}
	usagePercentPattern = regexp.MustCompile(`usagePercent\s*:\s*(-?\d+(?:\.\d+)?)`)
	resetInSecPattern   = regexp.MustCompile(`resetInSec\s*:\s*(-?\d+(?:\.\d+)?)`)
	usageRequestGroup   singleflight.Group
)

type UsageWindow struct {
	Key              string  `json:"key"`
	Label            string  `json:"label"`
	UsedPercent      float64 `json:"used_percent"`
	RemainingPercent float64 `json:"remaining_percent"`
	ResetInSeconds   int64   `json:"reset_in_seconds"`
	ResetAt          int64   `json:"reset_at"`
}

type UsageStatus struct {
	WorkspaceID string        `json:"workspace_id"`
	Windows     []UsageWindow `json:"windows"`
}

type UsageCacheConfig struct {
	TTLSeconds        int    `json:"usage_cache_ttl_seconds"`
	StaleSeconds      int    `json:"usage_cache_stale_seconds"`
	UseStaleOnError   *bool  `json:"usage_cache_use_stale_on_error"`
	AuthCookie        string `json:"-"`
	WorkspaceID       string `json:"workspace_id"`
	DashboardBase     string `json:"dashboard_base"`
	WorkspaceServerID string `json:"workspace_server_id"`
	TimeoutSeconds    int    `json:"usage_timeout_seconds"`
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

func (p *Provider) RequestUsage() (UsageStatus, int, error) {
	if p.Channel == nil {
		return UsageStatus{}, 0, errors.New("OpenCode 渠道未配置")
	}
	config := p.GetUsageCacheConfig()
	cookie := buildAuthCookie(config.AuthCookie)
	if cookie == "" {
		return UsageStatus{}, 0, errors.New("未配置 OpenCode Dashboard auth cookie")
	}

	client, err := utils.NewProxyHTTPClient(p.Channel.GetProxy())
	if err != nil {
		return UsageStatus{}, 0, err
	}
	client.Timeout = time.Duration(config.TimeoutSeconds) * time.Second
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	ctx := p.requestContext()

	workspaceID := extractWorkspaceID(config.WorkspaceID)
	if workspaceID == "" {
		workspaceID, err = discoverWorkspaceID(ctx, client, config, cookie)
		if err != nil {
			return UsageStatus{}, 0, err
		}
	}

	dashboardBase := strings.TrimRight(config.DashboardBase, "/")
	requestURL := dashboardBase + "/" + url.PathEscape(workspaceID) + "/go"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return UsageStatus{}, 0, err
	}
	setDashboardHeaders(req, cookie)

	resp, err := client.Do(req)
	if err != nil {
		return UsageStatus{}, 0, fmt.Errorf("OpenCode Dashboard 请求失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		return UsageStatus{}, resp.StatusCode, errors.New("OpenCode Dashboard 返回登录重定向，请检查 auth cookie 和 workspace_id")
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return UsageStatus{}, resp.StatusCode, fmt.Errorf("OpenCode Dashboard 认证失败 (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return UsageStatus{}, resp.StatusCode, fmt.Errorf("OpenCode Dashboard 返回 HTTP %d", resp.StatusCode)
	}

	body, err := readLimitedBody(resp.Body)
	if err != nil {
		return UsageStatus{}, resp.StatusCode, err
	}
	windows := parseUsageWindows(string(body), time.Now())
	if len(windows) == 0 {
		return UsageStatus{}, resp.StatusCode, errors.New("无法从 OpenCode Dashboard 解析额度窗口")
	}
	return UsageStatus{WorkspaceID: workspaceID, Windows: windows}, resp.StatusCode, nil
}

func (p *Provider) RequestUsageWithCache() (*UsageResult, error) {
	requestKey := "opencode_usage_request:" + p.usageCacheKey(p.GetUsageCacheConfig())
	value, err, _ := usageRequestGroup.Do(requestKey, func() (any, error) {
		return p.requestUsageWithCache()
	})
	if err != nil {
		return nil, err
	}
	return value.(*UsageResult), nil
}

func (p *Provider) requestUsageWithCache() (*UsageResult, error) {
	config := p.GetUsageCacheConfig()
	cacheKey := p.usageCacheKey(config)
	staleKey := cacheKey + ":stale"
	if config.TTLSeconds > 0 {
		if entry, err := cache.GetCache[usageCacheEntry](cacheKey); err == nil && len(entry.Usage.Windows) > 0 {
			return &UsageResult{Usage: entry.Usage, StatusCode: entry.Status, Cached: true, FetchedAt: entry.FetchedAt}, nil
		}
	}

	usage, status, err := p.RequestUsage()
	if err != nil {
		if config.AllowStaleOnError() {
			if entry, cacheErr := cache.GetCache[usageCacheEntry](staleKey); cacheErr == nil && len(entry.Usage.Windows) > 0 {
				return &UsageResult{Usage: entry.Usage, StatusCode: entry.Status, Cached: true, Stale: true, FetchedAt: entry.FetchedAt, Warning: err.Error()}, nil
			}
		}
		return nil, err
	}

	entry := usageCacheEntry{Usage: usage, Status: status, FetchedAt: time.Now().Unix()}
	if config.TTLSeconds > 0 {
		cache.SetCache(cacheKey, entry, time.Duration(config.TTLSeconds)*time.Second)
		if config.StaleSeconds > 0 {
			cache.SetCache(staleKey, entry, time.Duration(config.StaleSeconds)*time.Second)
		}
	}
	return &UsageResult{Usage: usage, StatusCode: status, FetchedAt: entry.FetchedAt}, nil
}

func (p *Provider) usageCacheKey(config UsageCacheConfig) string {
	channelID := 0
	channelKey := ""
	if p.Channel != nil {
		channelID = p.Channel.Id
		channelKey = p.Channel.Key
	}
	seed := strings.Join([]string{channelKey, config.WorkspaceID, config.DashboardBase, config.WorkspaceServerID}, "\x00")
	sum := sha256.Sum256([]byte(seed))
	return fmt.Sprintf("opencode_usage:%d:%s", channelID, hex.EncodeToString(sum[:8]))
}

func (p *Provider) requestContext() context.Context {
	if p.Context != nil && p.Context.Request != nil {
		return p.Context.Request.Context()
	}
	return context.Background()
}

func (p *Provider) GetUsageCacheConfig() UsageCacheConfig {
	result := UsageCacheConfig{
		TTLSeconds: defaultUsageCacheTTLSeconds, StaleSeconds: defaultUsageCacheStaleSeconds,
		DashboardBase: defaultDashboardBase, WorkspaceServerID: defaultWorkspaceServerID,
		TimeoutSeconds: defaultUsageTimeoutSeconds,
	}
	if p.Channel != nil {
		result.AuthCookie = parseCredentials(p.Channel.Key).AuthCookie
	}
	if p.Channel == nil || strings.TrimSpace(p.Channel.Other) == "" {
		return result
	}
	var raw map[string]any
	if err := json.Unmarshal([]byte(p.Channel.Other), &raw); err != nil {
		return result
	}
	if value, ok := raw["workspace_id"].(string); ok {
		result.WorkspaceID = value
	}
	if value, ok := raw["dashboard_base"].(string); ok {
		if dashboardBase, valid := allowedDashboardBase(value); valid {
			result.DashboardBase = dashboardBase
		}
	}
	if value, ok := raw["workspace_server_id"].(string); ok && strings.TrimSpace(value) != "" {
		result.WorkspaceServerID = strings.TrimSpace(value)
	}
	if value, ok := raw["usage_cache_use_stale_on_error"].(bool); ok {
		result.UseStaleOnError = &value
	}
	if value, ok := usageNumber(raw["usage_cache_ttl_seconds"]); ok {
		result.TTLSeconds = clamp(value, 0, 3600)
	}
	if value, ok := usageNumber(raw["usage_cache_stale_seconds"]); ok {
		result.StaleSeconds = clamp(value, 0, 604800)
	}
	if value, ok := usageNumber(raw["usage_timeout_seconds"]); ok {
		result.TimeoutSeconds = clamp(value, 3, 60)
	}
	return result
}

func allowedDashboardBase(raw string) (string, bool) {
	trimmed := strings.TrimRight(strings.TrimSpace(raw), "/")
	parsed, err := url.Parse(trimmed)
	if err != nil || !strings.EqualFold(parsed.Scheme, "https") || !strings.EqualFold(parsed.Hostname(), "opencode.ai") || parsed.Port() != "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", false
	}
	return trimmed, true
}

func (c UsageCacheConfig) AllowStaleOnError() bool {
	return c.StaleSeconds > 0 && (c.UseStaleOnError == nil || *c.UseStaleOnError)
}

func buildAuthCookie(raw string) string {
	raw = strings.TrimSpace(raw)
	if len(raw) >= len("Cookie:") && strings.EqualFold(raw[:len("Cookie:")], "Cookie:") {
		raw = strings.TrimSpace(raw[len("Cookie:"):])
	}
	for _, part := range strings.Split(raw, ";") {
		part = strings.TrimSpace(part)
		name, value, ok := strings.Cut(part, "=")
		if ok && strings.EqualFold(strings.TrimSpace(name), "auth") && strings.TrimSpace(value) != "" {
			return "auth=" + strings.TrimSpace(value)
		}
	}
	if raw != "" && !strings.ContainsAny(raw, ";=\r\n") {
		return "auth=" + raw
	}
	return ""
}

func extractWorkspaceID(raw string) string {
	return workspaceIDPattern.FindString(strings.TrimSpace(raw))
}

func discoverWorkspaceID(ctx context.Context, client *http.Client, config UsageCacheConfig, cookie string) (string, error) {
	requestURL := "https://opencode.ai/_server?id=" + url.QueryEscape(config.WorkspaceServerID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return "", err
	}
	setDashboardHeaders(req, cookie)
	req.Header.Set("X-Server-Id", config.WorkspaceServerID)
	req.Header.Set("X-Server-Instance", fmt.Sprintf("server-fn:%d", time.Now().UnixNano()))
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("OpenCode workspace 查询失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return "", fmt.Errorf("OpenCode workspace 认证失败 (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("OpenCode workspace 查询返回 HTTP %d", resp.StatusCode)
	}
	body, err := readLimitedBody(resp.Body)
	if err != nil {
		return "", err
	}
	matches := workspaceEntryPattern.FindAllStringSubmatch(string(body), -1)
	return selectWorkspaceID(matches, config.WorkspaceID)
}

func selectWorkspaceID(matches [][]string, rawHint string) (string, error) {
	validMatches := make([][]string, 0, len(matches))
	for _, match := range matches {
		if len(match) >= 3 && strings.TrimSpace(match[1]) != "" {
			validMatches = append(validMatches, match)
		}
	}
	if len(validMatches) == 0 {
		return "", errors.New("无法自动发现 OpenCode workspace_id，请手工填写 wrk_...；Dashboard 页面结构可能已变化")
	}
	hint := strings.TrimSpace(rawHint)
	if hint == "" {
		return validMatches[0][1], nil
	}
	for _, match := range validMatches {
		if strings.EqualFold(hint, strings.TrimSpace(match[1])) || strings.EqualFold(hint, strings.TrimSpace(match[2])) {
			return match[1], nil
		}
	}
	return "", fmt.Errorf("未找到名为 %q 的 OpenCode workspace，请填写正确名称或 wrk_... ID", hint)
}

func setDashboardHeaders(req *http.Request, cookie string) {
	req.Header.Set("Cookie", cookie)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8")
	req.Header.Set("Origin", "https://opencode.ai")
	req.Header.Set("Referer", "https://opencode.ai/")
}

func readLimitedBody(body io.Reader) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(body, maxUsageResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("读取 OpenCode Dashboard 响应失败: %w", err)
	}
	if len(data) > maxUsageResponseBytes {
		return nil, errors.New("OpenCode Dashboard 响应超过大小限制")
	}
	return data, nil
}

func parseUsageWindows(html string, now time.Time) []UsageWindow {
	labels := map[string]string{"rolling": "5h", "weekly": "7d", "monthly": "Monthly"}
	windows := make([]UsageWindow, 0, 3)
	for _, key := range []string{"rolling", "weekly", "monthly"} {
		object := usageObjectPatterns[key].FindStringSubmatch(html)
		if len(object) != 2 {
			continue
		}
		percentMatch := usagePercentPattern.FindStringSubmatch(object[1])
		resetMatch := resetInSecPattern.FindStringSubmatch(object[1])
		if len(percentMatch) != 2 || len(resetMatch) != 2 {
			continue
		}
		used, err1 := strconv.ParseFloat(percentMatch[1], 64)
		resetFloat, err2 := strconv.ParseFloat(resetMatch[1], 64)
		if err1 != nil || err2 != nil {
			continue
		}
		used = clampPercent(used)
		reset := int64(resetFloat)
		windows = append(windows, UsageWindow{Key: key, Label: labels[key], UsedPercent: used, RemainingPercent: 100 - used, ResetInSeconds: reset, ResetAt: now.Add(time.Duration(reset) * time.Second).Unix()})
	}
	return windows
}

func clampPercent(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
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

func clamp(value, minValue, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}
