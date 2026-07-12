package cron

import (
	"done-hub/common/config"
	"done-hub/common/logger"
	"done-hub/common/scheduler"
	"done-hub/model"
	"fmt"
	"time"

	"github.com/go-co-op/gocron/v2"
)

const (
	priceUpdateJobName     = "update_pricing_by_service"
	modelInfoUpdateJobName = "update_model_info_by_service"
)

func InitCron() {
	if !config.IsMasterNode {
		logger.SysLog("Cron is disabled on slave node")
		return
	}

	err := scheduler.Manager.AddJob(
		"update_daily_statistics",
		gocron.DailyJob(
			1,
			gocron.NewAtTimes(
				gocron.NewAtTime(0, 0, 30),
			)),
		gocron.NewTask(func() {
			model.UpdateStatistics(model.StatisticsUpdateTypeYesterday)
			logger.SysLog("更新昨日统计数据")
		}),
	)
	if err != nil {
		logger.SysError("Cron job error: " + err.Error())
		return
	}

	if config.UserInvoiceMonth {
		err = scheduler.Manager.AddJob(
			"generate_statistics_month",
			gocron.DailyJob(1, gocron.NewAtTimes(gocron.NewAtTime(4, 0, 0))),
			gocron.NewTask(func() {
				err := model.InsertStatisticsMonth()
				if err != nil {
					logger.SysError("Generate statistics month data error:" + err.Error())
				}
			}),
		)
	}

	err = scheduler.Manager.AddJob(
		"update_statistics",
		gocron.DurationJob(10*time.Minute),
		gocron.NewTask(func() {
			model.UpdateStatistics(model.StatisticsUpdateTypeToDay)
			logger.SysLog("10分钟统计数据")
		}),
	)

	// 每天凌晨 3:00 自动清理过期消费日志
	err = scheduler.Manager.AddJob(
		"log_auto_delete",
		gocron.DailyJob(1, gocron.NewAtTimes(gocron.NewAtTime(3, 0, 0))),
		gocron.NewTask(func() {
			if !config.LogAutoDeleteEnabled || config.LogAutoDeleteDays <= 0 {
				return
			}
			targetTimestamp := time.Now().AddDate(0, 0, -config.LogAutoDeleteDays).Unix()
			const batchSize = 10000
			var totalDeleted int64
			for {
				affected, err := model.DeleteOldLogBatch(targetTimestamp, batchSize)
				if err != nil {
					logger.SysError(fmt.Sprintf("[cron] 消费日志自动清理失败，已删 %d 行: %v", totalDeleted, err))
					break
				}
				totalDeleted += affected
				if affected == 0 {
					break
				}
			}
			if totalDeleted > 0 {
				logger.SysLog(fmt.Sprintf("[cron] 消费日志自动清理完成，共删除 %d 行", totalDeleted))
			}
		}),
	)
	if err != nil {
		logger.SysError("Cron job error: " + err.Error())
		return
	}

	if err != nil {
		logger.SysError("Cron job error: " + err.Error())
		return
	}

	if err := ConfigurePriceUpdateJob(); err != nil {
		logger.SysError("Cron job error: " + err.Error())
		return
	}
	if err := ConfigureModelInfoUpdateJob(); err != nil {
		logger.SysError("Cron job error: " + err.Error())
		return
	}
}

func ConfigurePriceUpdateJob() error {
	if !config.IsMasterNode {
		return nil
	}

	if err := scheduler.Manager.RemoveJob(priceUpdateJobName); err != nil {
		return err
	}

	if !config.AutoPriceUpdates ||
		!(config.AutoPriceUpdatesMode == string(model.PriceUpdateModeAdd) ||
			config.AutoPriceUpdatesMode == string(model.PriceUpdateModeOverwrite) ||
			config.AutoPriceUpdatesMode == string(model.PriceUpdateModeReplace) ||
			config.AutoPriceUpdatesMode == string(model.PriceUpdateModeUpdate)) {
		return nil
	}

	var definition gocron.JobDefinition
	if config.AutoPriceUpdatesCron != "" {
		definition = gocron.CronJob(config.AutoPriceUpdatesCron, false)
	} else {
		if config.AutoPriceUpdatesInterval <= 0 {
			return nil
		}
		definition = gocron.DurationJob(time.Duration(config.AutoPriceUpdatesInterval) * time.Minute)
	}

	return scheduler.Manager.AddJob(
		priceUpdateJobName,
		definition,
		gocron.NewTask(func() {
			err := model.UpdatePriceByPriceService()
			if err != nil {
				logger.SysError("Update Price Error: " + err.Error())
				return
			}
			logger.SysLog("Update Price Done")
		}),
	)
}

func ConfigureModelInfoUpdateJob() error {
	if !config.IsMasterNode {
		return nil
	}

	if err := scheduler.Manager.RemoveJob(modelInfoUpdateJobName); err != nil {
		return err
	}

	if !config.AutoModelInfoUpdates ||
		!(config.AutoModelInfoUpdatesMode == "add" ||
			config.AutoModelInfoUpdatesMode == "overwrite" ||
			config.AutoModelInfoUpdatesMode == "replace") {
		return nil
	}

	var definition gocron.JobDefinition
	if config.AutoModelInfoUpdatesCron != "" {
		definition = gocron.CronJob(config.AutoModelInfoUpdatesCron, false)
	} else {
		if config.AutoModelInfoUpdatesInterval <= 0 {
			return nil
		}
		definition = gocron.DurationJob(time.Duration(config.AutoModelInfoUpdatesInterval) * time.Minute)
	}

	return scheduler.Manager.AddJob(
		modelInfoUpdateJobName,
		definition,
		gocron.NewTask(func() {
			result, err := model.UpdateModelInfoByService()
			if err != nil {
				logger.SysError("Update Model Info Error: " + err.Error())
				return
			}
			logger.SysLog(fmt.Sprintf("Update Model Info Done: created=%d updated=%d skipped=%d failed=%d total=%d",
				result.Created, result.Updated, result.Skipped, result.Failed, result.Total))
		}),
	)
}
