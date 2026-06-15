package model

import (
	"context"
	"done-hub/common/config"
	"done-hub/common/logger"
	"done-hub/common/redis"
	"done-hub/common/stmp"
	"fmt"
	"strconv"
	"time"
)

const tokenUsageAlertKeyPrefix = "token_usage_alert"

func CheckTokenUsageAlert(ctx context.Context, tokenId int, userId int, tokenName string, quota int, setting UsageAlertSetting) {
	if quota <= 0 || !setting.Enabled || setting.WindowSeconds <= 0 || setting.ThresholdQuota <= 0 {
		return
	}
	if !config.RedisEnabled || redis.GetRedisClient() == nil {
		logger.LogError(ctx, "token usage alert skipped: redis is not enabled")
		return
	}

	redisCtx := context.Background()
	bucketSeconds := getUsageAlertBucketSeconds(setting.WindowSeconds)
	now := time.Now().Unix()
	currentBucket := now / int64(bucketSeconds) * int64(bucketSeconds)
	bucketCount := (setting.WindowSeconds + bucketSeconds - 1) / bucketSeconds
	if bucketCount < 1 {
		bucketCount = 1
	}

	rdb := redis.GetRedisClient()
	bucketKey := fmt.Sprintf("%s:%d:%d", tokenUsageAlertKeyPrefix, tokenId, currentBucket)
	ttl := time.Duration(setting.WindowSeconds+bucketSeconds*2) * time.Second

	if err := rdb.IncrBy(redisCtx, bucketKey, int64(quota)).Err(); err != nil {
		logger.LogError(ctx, "token usage alert incr failed: "+err.Error())
		return
	}
	if err := rdb.Expire(redisCtx, bucketKey, ttl).Err(); err != nil {
		logger.LogError(ctx, "token usage alert expire failed: "+err.Error())
	}

	keys := make([]string, 0, bucketCount)
	for i := 0; i < bucketCount; i++ {
		bucket := currentBucket - int64(i*bucketSeconds)
		keys = append(keys, fmt.Sprintf("%s:%d:%d", tokenUsageAlertKeyPrefix, tokenId, bucket))
	}

	values, err := rdb.MGet(redisCtx, keys...).Result()
	if err != nil {
		logger.LogError(ctx, "token usage alert mget failed: "+err.Error())
		return
	}

	usedQuota := 0
	for _, value := range values {
		if value == nil {
			continue
		}
		switch v := value.(type) {
		case string:
			n, err := strconv.Atoi(v)
			if err == nil {
				usedQuota += n
			}
		case int64:
			usedQuota += int(v)
		}
	}

	if usedQuota < setting.ThresholdQuota {
		return
	}

	if setting.AutoDisable {
		disableTokenByUsageAlert(tokenId)
	}

	cooldownSeconds := setting.CooldownSeconds
	if cooldownSeconds <= 0 {
		cooldownSeconds = setting.WindowSeconds
	}
	if cooldownSeconds < 60 {
		cooldownSeconds = 60
	}

	sentKey := fmt.Sprintf("%s:sent:%d", tokenUsageAlertKeyPrefix, tokenId)
	ok, err := rdb.SetNX(redisCtx, sentKey, strconv.FormatInt(now, 10), time.Duration(cooldownSeconds)*time.Second).Result()
	if err != nil {
		logger.LogError(ctx, "token usage alert setnx failed: "+err.Error())
		return
	}
	if !ok {
		return
	}

	sendTokenUsageAlertEmail(tokenId, userId, tokenName, setting.WindowSeconds, setting.ThresholdQuota, usedQuota)
}

func getUsageAlertBucketSeconds(windowSeconds int) int {
	switch {
	case windowSeconds <= 300:
		return 10
	case windowSeconds <= 3600:
		return 60
	case windowSeconds <= 86400:
		return 300
	default:
		return 900
	}
}

func sendTokenUsageAlertEmail(tokenId int, userId int, tokenName string, windowSeconds int, thresholdQuota int, usedQuota int) {
	user := User{Id: userId}
	if err := user.FillUserById(); err != nil {
		logger.SysError("failed to fetch user email: " + err.Error())
		return
	}
	if user.Email == "" {
		logger.SysError("user email is empty")
		return
	}

	userName := user.DisplayName
	if userName == "" {
		userName = user.Username
	}
	if tokenName == "" {
		tokenName = fmt.Sprintf("#%d", tokenId)
	}

	err := stmp.SendTokenUsageAlertEmail(userName, user.Email, tokenName, windowSeconds, thresholdQuota, usedQuota)
	if err != nil {
		logger.SysError("failed to send token usage alert email: " + err.Error())
	}
}

func disableTokenByUsageAlert(tokenId int) {
	token, err := GetTokenById(tokenId)
	if err != nil {
		logger.SysError("failed to fetch token for usage alert disable: " + err.Error())
		return
	}
	if token.Status != config.TokenStatusEnabled {
		return
	}

	err = DB.Model(&Token{}).
		Where("id = ? AND status = ?", tokenId, config.TokenStatusEnabled).
		Update("status", config.TokenStatusDisabled).Error
	if err != nil {
		logger.SysError("failed to disable token by usage alert: " + err.Error())
		return
	}
	if config.RedisEnabled && token.Key != "" {
		_ = redis.RedisDel(fmt.Sprintf(UserTokensKey, token.Key))
	}
	RecordLog(token.UserId, LogTypeSystem, fmt.Sprintf("令牌 %s 触发用量提醒阈值，已自动禁用", token.Name))
}
