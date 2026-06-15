package controller

import (
	"done-hub/common"
	"done-hub/common/config"
	"done-hub/cron"
	"done-hub/model"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type BatchImportModelInfoRequest struct {
	Strategy string             `json:"strategy"`
	Items    []*model.ModelInfo `json:"items"`
}

type ModelInfoScheduleRequest struct {
	Enabled  bool   `json:"enabled"`
	Mode     string `json:"mode"`
	Interval int    `json:"interval"`
	Cron     string `json:"cron"`
	Service  string `json:"service"`
}

func GetAllModelInfo(c *gin.Context) {
	modelInfos, err := model.GetAllModelInfo()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    modelInfos,
	})
}

func GetModelInfo(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	modelInfo, err := model.GetModelInfo(id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    modelInfo,
	})
}

func BatchImportModelInfo(c *gin.Context) {
	req := BatchImportModelInfoRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if req.Strategy != "overwrite" && req.Strategy != "replace" {
		req.Strategy = "skip"
	}

	result, err := model.ImportModelInfo(req.Items, req.Strategy)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    result,
	})
}

func GetModelInfoSchedule(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": ModelInfoScheduleRequest{
			Enabled:  config.AutoModelInfoUpdates,
			Mode:     config.AutoModelInfoUpdatesMode,
			Interval: config.AutoModelInfoUpdatesInterval,
			Cron:     config.AutoModelInfoUpdatesCron,
			Service:  config.UpdateModelInfoService,
		},
	})
}

func UpdateModelInfoSchedule(c *gin.Context) {
	var req ModelInfoScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	req.Cron = strings.TrimSpace(req.Cron)
	req.Service = strings.TrimSpace(req.Service)

	if req.Mode != "add" && req.Mode != "overwrite" && req.Mode != "replace" {
		common.APIRespondWithError(c, http.StatusOK, errors.New("update mode must be add, overwrite, or replace"))
		return
	}
	if req.Enabled && req.Cron == "" && req.Interval <= 0 {
		common.APIRespondWithError(c, http.StatusOK, errors.New("interval must be greater than 0 when cron is empty"))
		return
	}
	if req.Service == "" {
		common.APIRespondWithError(c, http.StatusOK, errors.New("model info service URL is required"))
		return
	}

	origin := ModelInfoScheduleRequest{
		Enabled:  config.AutoModelInfoUpdates,
		Mode:     config.AutoModelInfoUpdatesMode,
		Interval: config.AutoModelInfoUpdatesInterval,
		Cron:     config.AutoModelInfoUpdatesCron,
		Service:  config.UpdateModelInfoService,
	}

	updates := []model.Option{
		{Key: "AutoModelInfoUpdates", Value: strconv.FormatBool(req.Enabled)},
		{Key: "AutoModelInfoUpdatesMode", Value: req.Mode},
		{Key: "AutoModelInfoUpdatesInterval", Value: strconv.Itoa(req.Interval)},
		{Key: "AutoModelInfoUpdatesCron", Value: req.Cron},
		{Key: "UpdateModelInfoService", Value: req.Service},
	}
	for _, option := range updates {
		if err := model.UpdateOption(option.Key, option.Value); err != nil {
			rollbackModelInfoSchedule(origin)
			common.APIRespondWithError(c, http.StatusOK, err)
			return
		}
	}

	if err := cron.ConfigureModelInfoUpdateJob(); err != nil {
		rollbackModelInfoSchedule(origin)
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func SyncModelInfoFromService(c *gin.Context) {
	result, err := model.UpdateModelInfoByService()
	if err != nil {
		common.APIRespondWithError(c, http.StatusOK, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    result,
	})
}

func rollbackModelInfoSchedule(origin ModelInfoScheduleRequest) {
	_ = model.UpdateOption("AutoModelInfoUpdates", strconv.FormatBool(origin.Enabled))
	_ = model.UpdateOption("AutoModelInfoUpdatesMode", origin.Mode)
	_ = model.UpdateOption("AutoModelInfoUpdatesInterval", strconv.Itoa(origin.Interval))
	_ = model.UpdateOption("AutoModelInfoUpdatesCron", origin.Cron)
	_ = model.UpdateOption("UpdateModelInfoService", origin.Service)
	_ = cron.ConfigureModelInfoUpdateJob()
}

func CreateModelInfo(c *gin.Context) {
	modelInfo := model.ModelInfo{}
	err := c.ShouldBindJSON(&modelInfo)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	existingModel, _ := model.GetModelInfoByModel(modelInfo.Model)
	if existingModel != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "model identifier already exists",
		})
		return
	}
	err = model.CreateModelInfo(&modelInfo)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func UpdateModelInfo(c *gin.Context) {
	modelInfo := model.ModelInfo{}
	err := c.ShouldBindJSON(&modelInfo)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	existingModel, _ := model.GetModelInfoByModel(modelInfo.Model)
	if existingModel != nil && existingModel.Id != modelInfo.Id {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "model identifier already exists",
		})
		return
	}
	err = model.UpdateModelInfo(&modelInfo)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func DeleteModelInfo(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	err = model.DeleteModelInfo(id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}
