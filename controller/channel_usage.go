package controller

import (
	"done-hub/common"
	"done-hub/common/config"
	"done-hub/model"
	"done-hub/providers/claudecode"
	"done-hub/providers/codex"
	"done-hub/providers/githubcopilot"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const maxChannelUsageListLimit = 50

func channelSupportsUsageWindows(channelType int) bool {
	return channelType == config.ChannelTypeClaudeCode || channelType == config.ChannelTypeCodex || channelType == config.ChannelTypeGithubCopilot
}

func channelMatchesUsageProvider(channelType int, provider string) bool {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "", "all":
		return true
	case "claude", "claudecode", "anthropic":
		return channelType == config.ChannelTypeClaudeCode
	case "codex", "openai":
		return channelType == config.ChannelTypeCodex
	case "copilot", "githubcopilot", "github-copilot", "github":
		return channelType == config.ChannelTypeGithubCopilot
	default:
		if parsedType, err := strconv.Atoi(provider); err == nil {
			return channelType == parsedType
		}
		return false
	}
}

func usageChannelAllowedForRequest(c *gin.Context, channel *model.Channel, enforceTokenAccess bool) bool {
	if !channel.EnableUsageQuery {
		return false
	}
	if !enforceTokenAccess || model.IsAdmin(c.GetInt("id")) {
		return true
	}
	if channel.Status != config.ChannelStatusEnabled {
		return false
	}
	return codexUsageChannelAllowed(c, channel)
}

func usageQueryEnabled(channel *model.Channel) error {
	if !channelSupportsUsageWindows(channel.Type) {
		return errors.New("当前渠道类型不支持额度窗口查询")
	}
	if !channel.EnableUsageQuery {
		return errors.New("该渠道已关闭额度查询")
	}
	return nil
}

func usageCacheMeta(fetchedAt int64, ttlSeconds int) gin.H {
	nextRefreshAt := int64(0)
	if fetchedAt > 0 && ttlSeconds > 0 {
		nextRefreshAt = fetchedAt + int64(ttlSeconds)
	}
	return gin.H{
		"cache_ttl_seconds": ttlSeconds,
		"next_refresh_at":   nextRefreshAt,
	}
}

func claudeUsageData(channel *model.Channel, usageResult *claudecode.UsageResult, cacheConfig claudecode.UsageCacheConfig) gin.H {
	data := gin.H{
		"channel_id": channel.Id,
		"type":       channel.Type,
		"name":       channel.Name,
		"status":     usageResult.StatusCode,
		"usage":      usageResult.Usage,
		"cached":     usageResult.Cached,
		"stale":      usageResult.Stale,
		"empty":      usageResult.Empty,
		"fetched_at": usageResult.FetchedAt,
		"warning":    usageResult.Warning,
	}
	for key, value := range usageCacheMeta(usageResult.FetchedAt, cacheConfig.TTLSeconds) {
		data[key] = value
	}
	return data
}

func codexUsageData(channel *model.Channel, usageResult *codex.UsageResult, cacheConfig codex.UsageCacheConfig) gin.H {
	data := gin.H{
		"channel_id": channel.Id,
		"type":       channel.Type,
		"name":       channel.Name,
		"status":     usageResult.StatusCode,
		"usage":      usageResult.Usage,
		"cached":     usageResult.Cached,
		"stale":      usageResult.Stale,
		"fetched_at": usageResult.FetchedAt,
		"warning":    usageResult.Warning,
	}
	for key, value := range usageCacheMeta(usageResult.FetchedAt, cacheConfig.TTLSeconds) {
		data[key] = value
	}
	return data
}

func githubCopilotUsageData(channel *model.Channel, usageResult *githubcopilot.UsageResult, cacheConfig githubcopilot.UsageCacheConfig) gin.H {
	data := gin.H{
		"channel_id": channel.Id, "type": channel.Type, "name": channel.Name,
		"status": usageResult.StatusCode, "usage": usageResult.Usage,
		"cached": usageResult.Cached, "stale": usageResult.Stale, "empty": usageResult.Empty,
		"fetched_at": usageResult.FetchedAt, "warning": usageResult.Warning,
	}
	for key, value := range usageCacheMeta(usageResult.FetchedAt, cacheConfig.TTLSeconds) {
		data[key] = value
	}
	return data
}

type GitHubCopilotUsageRequest struct {
	ChannelID int `form:"channel_id" json:"channel_id"`
}

// GetGitHubCopilotUsage proxies the selected channel's live Copilot entitlement data.
// GET /api/github-copilot/usage?channel_id=1
// Authorization: Bearer sk-...
func GetGitHubCopilotUsage(c *gin.Context) {
	var req GitHubCopilotUsageRequest
	if c.Request.Method == http.MethodGet {
		if err := c.ShouldBindQuery(&req); err != nil {
			common.APIRespondWithError(c, http.StatusOK, err)
			return
		}
	} else if err := c.ShouldBindJSON(&req); err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	if req.ChannelID == 0 {
		req.ChannelID = c.GetInt("specific_channel_id")
	}
	if req.ChannelID <= 0 {
		common.APIRespondWithError(c, http.StatusOK, errors.New("channel_id 不能为空"))
		return
	}

	channel, err := model.GetChannelById(req.ChannelID)
	if err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	if channel.Type != config.ChannelTypeGithubCopilot {
		common.APIRespondWithError(c, http.StatusOK, errors.New("指定渠道不是 GitHub Copilot 类型"))
		return
	}
	if !model.IsAdmin(c.GetInt("id")) {
		if channel.Status != config.ChannelStatusEnabled {
			common.APIRespondWithError(c, http.StatusOK, errors.New("指定渠道未启用"))
			return
		}
		if !codexUsageChannelAllowed(c, channel) {
			common.APIRespondWithError(c, http.StatusOK, errors.New("当前令牌无权查询该渠道"))
			return
		}
	}
	if err := usageQueryEnabled(channel); err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}

	copilotProvider := githubcopilot.New(channel)
	cacheConfig := copilotProvider.GetUsageCacheConfig()
	usageResult, err := copilotProvider.RequestUsageWithCache()
	if err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": githubCopilotUsageData(channel, usageResult, cacheConfig)})
}

// GetChannelUsage queries admin-visible usage windows for OAuth-backed channels.
func GetChannelUsage(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.APIRespondWithError(c, http.StatusOK, errors.New("invalid channel id"))
		return
	}

	channel, err := model.GetChannelById(id)
	if err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	if err := usageQueryEnabled(channel); err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}

	switch channel.Type {
	case config.ChannelTypeClaudeCode:
		provider := claudecode.ClaudeCodeProviderFactory{}.Create(channel)
		claudeCodeProvider, ok := provider.(*claudecode.ClaudeCodeProvider)
		if !ok {
			common.APIRespondWithError(c, http.StatusOK, errors.New("创建 ClaudeCode provider 失败"))
			return
		}
		claudeCodeProvider.SetContext(c)
		cacheConfig := claudeCodeProvider.GetUsageCacheConfig()
		usageResult, err := claudeCodeProvider.RequestUsageWithCache()
		if err != nil {
			common.APIRespondWithError(c, http.StatusOK, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "",
			"data":    claudeUsageData(channel, usageResult, cacheConfig),
		})
	case config.ChannelTypeCodex:
		provider := codex.CodexProviderFactory{}.Create(channel)
		codexProvider, ok := provider.(*codex.CodexProvider)
		if !ok {
			common.APIRespondWithError(c, http.StatusOK, errors.New("创建 Codex provider 失败"))
			return
		}
		codexProvider.SetContext(c)
		cacheConfig := codexProvider.GetUsageCacheConfig()
		usageResult, err := codexProvider.RequestUsageWithCache()
		if err != nil {
			common.APIRespondWithError(c, http.StatusOK, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "",
			"data":    codexUsageData(channel, usageResult, cacheConfig),
		})
	case config.ChannelTypeGithubCopilot:
		copilotProvider := githubcopilot.New(channel)
		cacheConfig := copilotProvider.GetUsageCacheConfig()
		usageResult, err := copilotProvider.RequestUsageWithCache()
		if err != nil {
			common.APIRespondWithError(c, http.StatusOK, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": githubCopilotUsageData(channel, usageResult, cacheConfig)})
	default:
		common.APIRespondWithError(c, http.StatusOK, errors.New("当前渠道类型不支持额度窗口查询"))
	}
}

// GetChannelsUsage queries usage windows for all OAuth-backed channels shown on the dashboard.
func GetChannelsUsage(c *gin.Context) {
	getChannelsUsage(c, false)
}

// GetChannelsUsageByToken queries usage windows for channels visible to the caller's sk token.
func GetChannelsUsageByToken(c *gin.Context) {
	getChannelsUsage(c, true)
}

func getChannelsUsage(c *gin.Context, enforceTokenAccess bool) {
	limit := 12
	if rawLimit := c.Query("limit"); rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	if limit > maxChannelUsageListLimit {
		limit = maxChannelUsageListLimit
	}
	providerFilters, err := parseUsageList(c.Query("provider"), 20)
	if err != nil {
		common.APIRespondWithError(c, http.StatusBadRequest, fmt.Errorf("provider 参数无效: %w", err))
		return
	}
	if len(providerFilters) == 0 {
		providerFilters, err = parseUsageList(c.Query("type"), 20)
		if err != nil {
			common.APIRespondWithError(c, http.StatusBadRequest, fmt.Errorf("type 参数无效: %w", err))
			return
		}
	}
	rawChannelIDs := c.Query("channel-id")
	if rawChannelIDs == "" {
		rawChannelIDs = c.Query("channel_id")
	}
	channelIDs, err := parseUsageChannelIDs(rawChannelIDs, maxChannelUsageListLimit)
	if err != nil {
		common.APIRespondWithError(c, http.StatusBadRequest, err)
		return
	}
	specificChannelID := c.GetInt("specific_channel_id")
	if specificChannelID > 0 {
		// A token pinned to a channel can never broaden its scope with query parameters.
		if len(channelIDs) > 0 {
			if _, ok := channelIDs[specificChannelID]; !ok {
				c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"items": []gin.H{}, "cache_ttl_seconds": 0}})
				return
			}
		}
		channelIDs = map[int]struct{}{specificChannelID: {}}
	}
	explicitChannelSelection := len(channelIDs) > 0

	channels, err := model.GetAllChannels()
	if err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}

	items := make([]gin.H, 0, limit)
	minTTLSeconds := 0
	for _, channel := range channels {
		if channel == nil || !channelSupportsUsageWindows(channel.Type) || !matchesAnyUsageProvider(channel.Type, providerFilters) {
			continue
		}
		if len(channelIDs) > 0 {
			if _, ok := channelIDs[channel.Id]; !ok {
				continue
			}
		}
		if enforceTokenAccess && !usageChannelAllowedForRequest(c, channel, true) {
			continue
		}
		if !enforceTokenAccess && !channel.EnableUsageQuery && !explicitChannelSelection {
			continue
		}
		if len(items) >= limit {
			break
		}

		item := gin.H{
			"channel": gin.H{
				"id":     channel.Id,
				"type":   channel.Type,
				"name":   channel.Name,
				"group":  channel.Group,
				"tag":    channel.Tag,
				"status": channel.Status,
			},
		}
		if !channel.EnableUsageQuery {
			item["enabled"] = false
			item["supported"] = true
			item["error"] = gin.H{"code": "usage_query_disabled", "message": "该渠道已关闭额度查询"}
			items = append(items, item)
			continue
		}
		item["enabled"] = true
		item["supported"] = true

		switch channel.Type {
		case config.ChannelTypeClaudeCode:
			provider := claudecode.ClaudeCodeProviderFactory{}.Create(channel)
			claudeCodeProvider, ok := provider.(*claudecode.ClaudeCodeProvider)
			if !ok {
				item["error"] = "创建 ClaudeCode provider 失败"
				break
			}
			claudeCodeProvider.SetContext(c)
			cacheConfig := claudeCodeProvider.GetUsageCacheConfig()
			usageResult, err := claudeCodeProvider.RequestUsageWithCache()
			if err != nil {
				item["error"] = err.Error()
				break
			}
			item["data"] = claudeUsageData(channel, usageResult, cacheConfig)
			if cacheConfig.TTLSeconds > 0 && (minTTLSeconds == 0 || cacheConfig.TTLSeconds < minTTLSeconds) {
				minTTLSeconds = cacheConfig.TTLSeconds
			}
		case config.ChannelTypeCodex:
			provider := codex.CodexProviderFactory{}.Create(channel)
			codexProvider, ok := provider.(*codex.CodexProvider)
			if !ok {
				item["error"] = "创建 Codex provider 失败"
				break
			}
			codexProvider.SetContext(c)
			cacheConfig := codexProvider.GetUsageCacheConfig()
			usageResult, err := codexProvider.RequestUsageWithCache()
			if err != nil {
				item["error"] = err.Error()
				break
			}
			item["data"] = codexUsageData(channel, usageResult, cacheConfig)
			if cacheConfig.TTLSeconds > 0 && (minTTLSeconds == 0 || cacheConfig.TTLSeconds < minTTLSeconds) {
				minTTLSeconds = cacheConfig.TTLSeconds
			}
		case config.ChannelTypeGithubCopilot:
			copilotProvider := githubcopilot.New(channel)
			cacheConfig := copilotProvider.GetUsageCacheConfig()
			usageResult, err := copilotProvider.RequestUsageWithCache()
			if err != nil {
				item["error"] = err.Error()
				break
			}
			item["data"] = githubCopilotUsageData(channel, usageResult, cacheConfig)
			if cacheConfig.TTLSeconds > 0 && (minTTLSeconds == 0 || cacheConfig.TTLSeconds < minTTLSeconds) {
				minTTLSeconds = cacheConfig.TTLSeconds
			}
		default:
			item["error"] = fmt.Sprintf("不支持的渠道类型: %d", channel.Type)
		}

		items = append(items, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items":             items,
			"cache_ttl_seconds": minTTLSeconds,
		},
	})
}

func parseUsageList(raw string, max int) ([]string, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	seen := make(map[string]struct{})
	values := make([]string, 0)
	for _, part := range strings.Split(raw, ",") {
		value := strings.ToLower(strings.TrimSpace(part))
		if value == "" {
			return nil, errors.New("包含空值")
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		values = append(values, value)
		if len(values) > max {
			return nil, fmt.Errorf("最多允许 %d 项", max)
		}
	}
	return values, nil
}

func parseUsageChannelIDs(raw string, max int) (map[int]struct{}, error) {
	values, err := parseUsageList(raw, max)
	if err != nil {
		return nil, fmt.Errorf("channel-id 参数无效: %w", err)
	}
	ids := make(map[int]struct{}, len(values))
	for _, value := range values {
		id, err := strconv.Atoi(value)
		if err != nil || id <= 0 {
			return nil, fmt.Errorf("channel-id 参数无效: %q", value)
		}
		ids[id] = struct{}{}
	}
	return ids, nil
}

func matchesAnyUsageProvider(channelType int, providers []string) bool {
	if len(providers) == 0 {
		return true
	}
	for _, provider := range providers {
		if channelMatchesUsageProvider(channelType, provider) {
			return true
		}
	}
	return false
}
