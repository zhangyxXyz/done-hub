package model

import (
	"done-hub/common/config"
	"done-hub/common/logger"
	"done-hub/common/utils"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"
)

type ModelInfo struct {
	Id               int    `json:"id" gorm:"index"`
	Model            string `json:"model" gorm:"type:varchar(100);index"`
	Name             string `json:"name" gorm:"type:varchar(100)"`
	Description      string `json:"description" gorm:"type:text"`
	ContextLength    int    `json:"context_length"`
	MaxTokens        int    `json:"max_tokens"`
	InputModalities  string `json:"input_modalities" gorm:"type:text"`
	OutputModalities string `json:"output_modalities" gorm:"type:text"`
	Tags             string `json:"tags" gorm:"type:text"`
	SupportUrl       string `json:"support_url" gorm:"type:text"`
	CreatedAt        int64  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        int64  `json:"updated_at" gorm:"autoUpdateTime"`
}

type ModelInfoResponse struct {
	Model            string   `json:"model"`
	Name             string   `json:"name"`
	Description      string   `json:"description"`
	ContextLength    int      `json:"context_length"`
	MaxTokens        int      `json:"max_tokens"`
	InputModalities  []string `json:"input_modalities"`
	OutputModalities []string `json:"output_modalities"`
	Tags             []string `json:"tags"`
	SupportUrl       []string `json:"support_url"`
	CreatedAt        int64    `json:"created_at"`
	UpdatedAt        int64    `json:"updated_at"`
}

type ModelInfoImportResult struct {
	Created int `json:"created"`
	Updated int `json:"updated"`
	Skipped int `json:"skipped"`
	Failed  int `json:"failed"`
	Deleted int `json:"deleted"`
	Total   int `json:"total"`
}

type remoteModelInfoItem struct {
	Model     string         `json:"model"`
	ModelInfo map[string]any `json:"model_info"`
}

type remoteModelInfoResponse struct {
	Data []*remoteModelInfoItem `json:"data"`
}

func (m *ModelInfo) ToResponse() *ModelInfoResponse {
	res := &ModelInfoResponse{
		Model:         m.Model,
		Name:          m.Name,
		Description:   m.Description,
		ContextLength: m.ContextLength,
		MaxTokens:     m.MaxTokens,
		CreatedAt:     m.CreatedAt,
		UpdatedAt:     m.UpdatedAt,
	}

	res.InputModalities, _ = utils.UnmarshalString[[]string](m.InputModalities)
	res.OutputModalities, _ = utils.UnmarshalString[[]string](m.OutputModalities)
	res.Tags, _ = utils.UnmarshalString[[]string](m.Tags)

	var err error
	res.SupportUrl, err = utils.UnmarshalString[[]string](m.SupportUrl)
	if err != nil {
		if m.SupportUrl != "" {
			res.SupportUrl = []string{m.SupportUrl}
		} else {
			res.SupportUrl = []string{}
		}
	}

	return res
}

func (m *ModelInfo) TableName() string {
	return "model_info"
}

func CreateModelInfo(modelInfo *ModelInfo) error {
	err := DB.Create(modelInfo).Error
	if err != nil {
		return err
	}
	return nil
}

func UpdateModelInfo(modelInfo *ModelInfo) error {
	err := DB.Omit("id", "created_at").Save(modelInfo).Error
	if err != nil {
		return err
	}
	return nil
}

func GetModelInfo(id int) (*ModelInfo, error) {
	modelInfo := &ModelInfo{}
	err := DB.Where("id = ?", id).First(modelInfo).Error
	if err != nil {
		return nil, err
	}
	return modelInfo, nil
}

func GetModelInfoByModel(model string) (*ModelInfo, error) {
	modelInfo := &ModelInfo{}
	err := DB.Where("model = ?", model).First(modelInfo).Error
	if err != nil {
		return nil, err
	}
	return modelInfo, nil
}

func GetAllModelInfo() ([]*ModelInfo, error) {
	var modelInfos []*ModelInfo
	err := DB.Order("id desc").Find(&modelInfos).Error
	if err != nil {
		return nil, err
	}
	return modelInfos, nil
}

func DeleteModelInfo(id int) error {
	err := DB.Delete(&ModelInfo{}, id).Error
	if err != nil {
		return err
	}
	return nil
}

func ImportModelInfo(items []*ModelInfo, strategy string) (*ModelInfoImportResult, error) {
	result := &ModelInfoImportResult{Total: len(items)}
	if len(items) == 0 {
		return result, nil
	}

	modelMap := make(map[string]*ModelInfo)
	modelNames := make([]string, 0, len(items))
	for _, item := range items {
		if item == nil || item.Model == "" {
			result.Failed++
			continue
		}
		if _, ok := modelMap[item.Model]; !ok {
			modelNames = append(modelNames, item.Model)
		}
		modelMap[item.Model] = item
	}
	if len(modelNames) == 0 {
		return result, nil
	}

	var existingItems []*ModelInfo
	if err := DB.Where("model IN ?", modelNames).Find(&existingItems).Error; err != nil {
		return nil, err
	}

	existingMap := make(map[string]*ModelInfo)
	for _, item := range existingItems {
		existingMap[item.Model] = item
	}

	err := DB.Transaction(func(tx *gorm.DB) error {
		toCreate := make([]*ModelInfo, 0)
		for _, modelName := range modelNames {
			item := modelMap[modelName]
			existing := existingMap[modelName]
			if existing == nil {
				toCreate = append(toCreate, item)
				result.Created++
				continue
			}

			if strategy != "overwrite" && strategy != "replace" {
				result.Skipped++
				continue
			}

			if err := tx.Model(&ModelInfo{}).
				Where("model = ?", modelName).
				Select("*").
				Omit("id", "created_at").
				Updates(item).Error; err != nil {
				return err
			}
			result.Updated++
		}

		if strategy == "replace" && len(modelNames) > 0 {
			deleteResult := tx.Where("model NOT IN ?", modelNames).Delete(&ModelInfo{})
			if deleteResult.Error != nil {
				return deleteResult.Error
			}
			result.Deleted = int(deleteResult.RowsAffected)
		}

		if len(toCreate) > 0 {
			if err := tx.CreateInBatches(toCreate, 100).Error; err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return result, nil
}

func UpdateModelInfoByService() (*ModelInfoImportResult, error) {
	mode := config.AutoModelInfoUpdatesMode
	if mode != "add" && mode != "overwrite" && mode != "replace" {
		return nil, errors.New("model info update mode must be add, overwrite, or replace")
	}

	items, err := GetModelInfoByService()
	if err != nil {
		return nil, err
	}
	return ImportModelInfo(items, mode)
}

func GetModelInfoByService() ([]*ModelInfo, error) {
	api := config.UpdateModelInfoService
	if api == "" {
		return nil, errors.New("update_model_info_service is not configured")
	}

	logger.SysLog("Start Update Model Info, Service URL: " + api)
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	req, err := http.NewRequest("GET", api, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "done-hub-model-info-sync/1.0")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusBadRequest {
		return nil, errors.New("bad response status code: " + resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var wrapped remoteModelInfoResponse
	if err := json.Unmarshal(body, &wrapped); err == nil && len(wrapped.Data) > 0 {
		items := make([]*ModelInfo, 0, len(wrapped.Data))
		for _, item := range wrapped.Data {
			if item == nil || item.ModelInfo == nil {
				continue
			}
			modelInfo := modelInfoFromRemote(item.ModelInfo)
			if modelInfo.Model == "" {
				modelInfo.Model = item.Model
			}
			items = append(items, modelInfo)
		}
		return items, nil
	}

	var direct []map[string]any
	if err := json.Unmarshal(body, &direct); err != nil {
		return nil, err
	}
	items := make([]*ModelInfo, 0, len(direct))
	for _, item := range direct {
		items = append(items, modelInfoFromRemote(item))
	}
	return items, nil
}

func modelInfoFromRemote(raw map[string]any) *ModelInfo {
	return &ModelInfo{
		Model:            remoteString(raw["model"]),
		Name:             remoteString(raw["name"]),
		Description:      remoteString(raw["description"]),
		ContextLength:    remoteInt(raw["context_length"]),
		MaxTokens:        remoteInt(raw["max_tokens"]),
		InputModalities:  remoteJSONString(raw["input_modalities"]),
		OutputModalities: remoteJSONString(raw["output_modalities"]),
		Tags:             remoteJSONString(raw["tags"]),
		SupportUrl:       remoteJSONString(raw["support_url"]),
	}
}

func remoteString(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

func remoteInt(value any) int {
	switch v := value.(type) {
	case int:
		return v
	case float64:
		return int(v)
	case json.Number:
		result, _ := v.Int64()
		return int(result)
	default:
		return 0
	}
}

func remoteJSONString(value any) string {
	if value == nil {
		return "[]"
	}
	if text, ok := value.(string); ok {
		if strings.TrimSpace(text) == "" {
			return "[]"
		}
		return text
	}
	bytes, err := json.Marshal(value)
	if err != nil {
		return "[]"
	}
	return string(bytes)
}
