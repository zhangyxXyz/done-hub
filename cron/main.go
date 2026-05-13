package cron

import (
	"done-hub/common/config"
	"done-hub/common/logger"
	"done-hub/common/scheduler"
	"done-hub/model"
	"time"

	"github.com/go-co-op/gocron/v2"
)

const priceUpdateJobName = "update_pricing_by_service"

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
	if err != nil {
		logger.SysError("Cron job error: " + err.Error())
		return
	}

	if err := ConfigurePriceUpdateJob(); err != nil {
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
