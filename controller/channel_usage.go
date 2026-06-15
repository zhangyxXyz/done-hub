package controller

import (
	"done-hub/common"
	"done-hub/common/config"
	"done-hub/model"
	"done-hub/providers/claudecode"
	"done-hub/providers/codex"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const maxChannelUsageListLimit = 50

func channelSupportsUsageWindows(channelType int) bool {
	return channelType == config.ChannelTypeClaudeCode || channelType == config.ChannelTypeCodex
}

func channelMatchesUsageProvider(channelType int, provider string) bool {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "", "all":
		return true
	case "claude", "claudecode", "anthropic":
		return channelType == config.ChannelTypeClaudeCode
	case "codex", "openai":
		return channelType == config.ChannelTypeCodex
	default:
		if parsedType, err := strconv.Atoi(provider); err == nil {
			return channelType == parsedType
		}
		return false
	}
}

func usageChannelAllowedForRequest(c *gin.Context, channel *model.Channel, enforceTokenAccess bool) bool {
	if !enforceTokenAccess || model.IsAdmin(c.GetInt("id")) {
		return true
	}
	if channel.Status != config.ChannelStatusEnabled {
		return false
	}
	return codexUsageChannelAllowed(c, channel)
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
	providerFilter := c.Query("provider")
	if providerFilter == "" {
		providerFilter = c.Query("type")
	}
	channelID := 0
	if rawChannelID := c.Query("channel_id"); rawChannelID != "" {
		if parsedChannelID, err := strconv.Atoi(rawChannelID); err == nil && parsedChannelID > 0 {
			channelID = parsedChannelID
		}
	}
	if channelID == 0 {
		channelID = c.GetInt("specific_channel_id")
	}

	channels, err := model.GetAllChannels()
	if err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}

	items := make([]gin.H, 0, limit)
	minTTLSeconds := 0
	for _, channel := range channels {
		if channel == nil || !channelSupportsUsageWindows(channel.Type) || !channelMatchesUsageProvider(channel.Type, providerFilter) {
			continue
		}
		if channelID > 0 && channel.Id != channelID {
			continue
		}
		if !usageChannelAllowedForRequest(c, channel, enforceTokenAccess) {
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
