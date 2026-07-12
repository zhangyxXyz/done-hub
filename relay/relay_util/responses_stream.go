package relay_util

import (
	"done-hub/common/utils"
	"done-hub/types"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type responsesHandler func(response *types.OpenAIResponsesStreamResponses)

type OpenAIResponsesStreamConverter struct {
	sequenceNumber    int
	lastChoiceIndex   int
	lastResponseType  string
	outputIndex       int
	contentIndex      int
	summaryIndex      int
	responses         *types.OpenAIResponsesResponses
	item              *types.ResponsesOutput
	part              *types.ContentResponses
	content           []types.ContentResponses
	itemID            string
	isFirstResponse   bool
	isCompleted       bool
	c                 *gin.Context
	nowStatus         string
	lastToolCallIndex int
	usage             *types.Usage
	toolCalls         map[int]*responsesToolCallState
	toolCallOrder     []int
}

type responsesToolCallState struct {
	outputIndex int
	item        *types.ResponsesOutput
	arguments   strings.Builder
}

func NewOpenAIResponsesStreamConverter(c *gin.Context, request *types.OpenAIResponsesRequest, usage *types.Usage) *OpenAIResponsesStreamConverter {
	converter := &OpenAIResponsesStreamConverter{
		sequenceNumber:    0,
		lastChoiceIndex:   -1,
		outputIndex:       0,
		contentIndex:      0,
		summaryIndex:      0,
		isFirstResponse:   true,
		c:                 c,
		lastToolCallIndex: 0,
		usage:             usage,
		toolCalls:         make(map[int]*responsesToolCallState),
	}

	converter.initializeResponse(request)

	return converter
}

func (converter *OpenAIResponsesStreamConverter) initializeResponse(request *types.OpenAIResponsesRequest) {
	converter.responses = &types.OpenAIResponsesResponses{
		ID:        fmt.Sprintf("resp_%s", utils.GetRandomString(48)),
		Object:    "response",
		CreatedAt: time.Now().Unix(),
		Text: types.TextResponses{
			Format: struct {
				Type string `json:"type"`
			}{
				Type: "text",
			},
		},
		MaxOutputTokens:   request.MaxOutputTokens,
		ParallelToolCalls: request.ParallelToolCalls,
		Temperature:       request.Temperature,
		ToolChoice:        request.ToolChoice,
		TopP:              request.TopP,
		Truncation:        request.Truncation,
		Tools:             request.Tools,
		Output:            make([]types.ResponsesOutput, 0),
		Status:            "in_progress",
	}
}

func (converter *OpenAIResponsesStreamConverter) ProcessStreamData(jsonStr string) {
	if jsonStr == "[DONE]" {
		converter.finalizeStream()
		return
	}

	var response types.ChatCompletionStreamResponse
	if err := json.Unmarshal([]byte(jsonStr), &response); err != nil {
		converter.sendError(fmt.Sprintf("解析JSON失败: %v", err))
		return
	}

	// 第一次响应创建response.created
	if converter.isFirstResponse {
		if response.ID != "" {
			converter.responses.ID = response.ID
		}
		if createdAt, ok := positiveCreatedAt(response.Created); ok {
			converter.responses.CreatedAt = createdAt
		}
		converter.responses.Model = response.Model
		converter.sendStreamResponse("response.created", converter.populateResponseData)
		converter.sendStreamResponse("response.in_progress", converter.populateResponseData)
		converter.isFirstResponse = false
	}

	converter.processChoices(response.Choices)

}

func positiveCreatedAt(value any) (any, bool) {
	switch createdAt := value.(type) {
	case float64:
		return createdAt, createdAt > 0
	case float32:
		return createdAt, createdAt > 0
	case int:
		return createdAt, createdAt > 0
	case int64:
		return createdAt, createdAt > 0
	case json.Number:
		parsed, err := createdAt.Int64()
		return createdAt, err == nil && parsed > 0
	default:
		return nil, false
	}
}

func (converter *OpenAIResponsesStreamConverter) ProcessError(jsonStr string) {
	converter.sendError(jsonStr)
}

// 处理choices
func (converter *OpenAIResponsesStreamConverter) processChoices(choices []types.ChatCompletionStreamChoice) {
	for _, choice := range choices {
		nowStatus, ok := choice.FinishReason.(string)
		if ok {
			converter.nowStatus = types.ConvertChatStatusToResponses(nowStatus)
		}

		if nowStatus == types.FinishReasonToolCalls && len(choice.Delta.ToolCalls) == 0 && len(converter.toolCalls) > 0 {
			converter.finalizeToolCalls()
			converter.lastChoiceIndex = choice.Index
			converter.lastResponseType = types.InputTypeFunctionCall
			continue
		}

		if len(choice.Delta.ToolCalls) > 0 {
			if choice.Delta.ReasoningContent != "" {
				converter.createNewItem(choice, types.InputTypeReasoning)
				converter.processReasoning(choice)
				converter.done()
			}
			if choice.Delta.Content != "" {
				converter.createNewItem(choice, types.InputTypeMessage)
				converter.processMessage(choice)
				converter.done()
			}
			if converter.item != nil {
				converter.done()
			}
			converter.processFunctionCalls(choice)
			converter.lastChoiceIndex = choice.Index
			converter.lastResponseType = types.InputTypeFunctionCall
			continue
		}

		currentType := converter.GetResponseType(&choice)
		// 检查是否需要创建新的output_item
		needNewOutputItem := false
		if converter.lastResponseType != currentType {
			needNewOutputItem = true
		}

		if needNewOutputItem {
			converter.createNewItem(choice, currentType)
		}

		// 处理不同类型的内容
		switch currentType {
		case types.InputTypeReasoning:
			converter.processReasoning(choice)
		default:
			converter.processMessage(choice)
		}

		converter.lastChoiceIndex = choice.Index
		converter.lastResponseType = currentType
	}
}

// 创建新的输出项
func (converter *OpenAIResponsesStreamConverter) createNewItem(choice types.ChatCompletionStreamChoice, currentType string) {
	// 如果是新的输出类型，先结束上一个输出
	if converter.item != nil {
		converter.done()
	}

	// 生成新的itemID
	converter.generateResponseItemID(currentType)
	converter.contentIndex = 0
	converter.summaryIndex = 0

	response := converter.buildStreamResponse("response.output_item.added")
	response.OutputIndex = &converter.outputIndex

	converter.item = &types.ResponsesOutput{
		ID:     converter.itemID,
		Type:   currentType,
		Status: "in_progress",
	}

	switch currentType {
	case types.InputTypeReasoning:
		converter.item.Role = choice.Delta.Role
		converter.item.Summary = []types.SummaryResponses{}
	default:
		converter.item.Role = choice.Delta.Role
		converter.item.Content = []types.ContentResponses{}
	}

	response.Item = converter.item

	converter.sendStreamEvent(response, "response.output_item.added")
}

// 结束
func (converter *OpenAIResponsesStreamConverter) done() {

	switch converter.lastResponseType {
	case types.InputTypeMessage:
		if converter.part != nil {
			converter.doneMessagePart()
		}
	case types.InputTypeReasoning:
		if converter.part != nil {
			converter.doneReasoningPart()
		}
	}

	response := converter.buildStreamResponse("response.output_item.done")
	response.OutputIndex = &converter.outputIndex

	converter.item.Status = converter.nowStatus
	converter.item.Content = converter.content
	response.Item = converter.item

	if converter.item.Status == "" {
		converter.item.Status = types.ResponseStatusCompleted
	}

	converter.responses.Output = append(converter.responses.Output, *converter.item)

	converter.sendStreamEvent(response, "response.output_item.done")
	// 清空 item
	converter.item = nil
	// 清空 content
	converter.content = nil

	converter.outputIndex++
}

// 处理message类型的内容
func (converter *OpenAIResponsesStreamConverter) processMessage(choice types.ChatCompletionStreamChoice) {
	// 检查是否需要创建content_part.added
	if converter.lastChoiceIndex != choice.Index {
		// 先结束掉上一个part
		if converter.part != nil {
			converter.doneMessagePart()
		}

	}

	if converter.part == nil {
		// 创建新的part
		converter.part = &types.ContentResponses{
			Type: types.ContentTypeOutputText,
			Text: "",
		}

		response := converter.buildStreamResponseWithItemID("response.content_part.added")
		response.ContentIndex = &converter.contentIndex
		response.Part = converter.part
		converter.sendStreamEvent(response, "response.content_part.added")
	}

	// 处理文本内容
	if choice.Delta.Content != "" {
		response := converter.buildStreamResponseWithItemID("response.output_text.delta")
		response.ContentIndex = &converter.contentIndex
		response.Delta = choice.Delta.Content
		converter.sendStreamEvent(response, "response.output_text.delta")
	}

	// 处理文本增量
	converter.part.Text += choice.Delta.Content
}

// 结束message part
func (converter *OpenAIResponsesStreamConverter) doneMessagePart() {

	// 先结束掉 response.output_text.done
	response := converter.buildStreamResponseWithItemID("response.output_text.done")
	response.ContentIndex = &converter.contentIndex
	text := converter.part.Text
	response.Text = &text
	converter.sendStreamEvent(response, "response.output_text.done")

	// 结束 part
	response = converter.buildStreamResponseWithItemID("response.content_part.done")
	response.ContentIndex = &converter.contentIndex
	part := *converter.part
	response.Part = &part
	converter.sendStreamEvent(response, "response.content_part.done")

	// contentIndex 递增
	converter.contentIndex++
	// 需要将数据添加到content中
	converter.addContent()
	// 清空 part
	converter.part = nil
}

// 处理reasoning类型的内容
func (converter *OpenAIResponsesStreamConverter) processReasoning(choice types.ChatCompletionStreamChoice) {
	// 检查是否需要创建reasoning_summary_part.added
	if converter.lastChoiceIndex != choice.Index {
		// 先结束掉上一个part
		if converter.part != nil {
			converter.doneReasoningPart()
		}

	}

	if converter.part == nil {
		// 创建新的part
		converter.part = &types.ContentResponses{
			Type: types.ContentTypeSummaryText,
			Text: "",
		}

		response := converter.buildStreamResponseWithItemID("response.reasoning_summary_part.added")
		response.ContentIndex = &converter.contentIndex
		response.Part = converter.part
		converter.sendStreamEvent(response, "response.reasoning_summary_part.added")
	}

	// 处理推理内容
	response := converter.buildStreamResponseWithItemID("response.reasoning_summary_text.delta")
	response.ContentIndex = &converter.contentIndex
	response.Delta = choice.Delta.ReasoningContent
	converter.sendStreamEvent(response, "response.reasoning_summary_text.delta")

	// 处理文本增量
	converter.part.Text += choice.Delta.ReasoningContent
}

// 结束reasoning part
func (converter *OpenAIResponsesStreamConverter) doneReasoningPart() {
	// 先结束掉 response.reasoning_summary_text.done
	response := converter.buildStreamResponseWithItemID("response.reasoning_summary_text.done")
	response.SummaryIndex = &converter.summaryIndex
	text := converter.part.Text
	response.Text = &text
	converter.sendStreamEvent(response, "response.reasoning_summary_text.done")

	// 结束 part
	response = converter.buildStreamResponseWithItemID("response.reasoning_summary_part.done")
	response.SummaryIndex = &converter.summaryIndex
	part := *converter.part
	response.Part = &part
	converter.sendStreamEvent(response, "response.reasoning_summary_part.done")

	// contentIndex 递增
	converter.summaryIndex++
	// 需要将数据添加到content中
	converter.addContent()
	// 清空 part
	converter.part = nil
}

func (converter *OpenAIResponsesStreamConverter) processFunctionCalls(choice types.ChatCompletionStreamChoice) {
	for _, tool := range choice.Delta.ToolCalls {
		if tool == nil {
			continue
		}
		state := converter.toolCalls[tool.Index]
		if state == nil {
			itemID := fmt.Sprintf("fc_%s", utils.GetRandomString(48))
			callID := tool.Id
			name := ""
			if tool.Function != nil {
				name = tool.Function.Name
			}
			state = &responsesToolCallState{
				outputIndex: converter.outputIndex,
				item: &types.ResponsesOutput{
					ID:        itemID,
					Type:      types.InputTypeFunctionCall,
					Status:    "in_progress",
					CallID:    callID,
					Name:      name,
					Arguments: types.ArgumentsFromString(""),
				},
			}
			converter.outputIndex++
			converter.toolCalls[tool.Index] = state
			converter.toolCallOrder = append(converter.toolCallOrder, tool.Index)
			added := converter.buildStreamResponse("response.output_item.added")
			added.OutputIndex = &state.outputIndex
			added.Item = state.item
			converter.sendStreamEvent(added, "response.output_item.added")
		}
		if tool.Id != "" {
			state.item.CallID = tool.Id
		}
		if tool.Function != nil {
			if tool.Function.Name != "" {
				state.item.Name = tool.Function.Name
			}
			if tool.Function.Arguments != "" {
				state.arguments.WriteString(tool.Function.Arguments)
				delta := converter.buildStreamResponse("response.function_call_arguments.delta")
				delta.OutputIndex = &state.outputIndex
				delta.ItemID = state.item.ID
				delta.Delta = tool.Function.Arguments
				converter.sendStreamEvent(delta, "response.function_call_arguments.delta")
			}
		}
	}
}

func (converter *OpenAIResponsesStreamConverter) finalizeToolCalls() {
	for _, toolIndex := range converter.toolCallOrder {
		state := converter.toolCalls[toolIndex]
		if state == nil {
			continue
		}
		state.item.Arguments = types.ArgumentsFromString(state.arguments.String())
		state.item.Status = types.ResponseStatusCompleted
		doneArgs := converter.buildStreamResponse("response.function_call_arguments.done")
		doneArgs.OutputIndex = &state.outputIndex
		doneArgs.ItemID = state.item.ID
		doneArgs.Name = state.item.Name
		doneArgs.Arguments = state.item.Arguments
		converter.sendStreamEvent(doneArgs, "response.function_call_arguments.done")

		doneItem := converter.buildStreamResponse("response.output_item.done")
		doneItem.OutputIndex = &state.outputIndex
		doneItem.Item = state.item
		converter.responses.Output = append(converter.responses.Output, *state.item)
		converter.sendStreamEvent(doneItem, "response.output_item.done")
	}
	converter.toolCalls = make(map[int]*responsesToolCallState)
	converter.toolCallOrder = nil
}

func (converter *OpenAIResponsesStreamConverter) addContent() {
	if converter.part == nil {
		return
	}

	if converter.content == nil {
		converter.content = make([]types.ContentResponses, 0)
	}

	converter.content = append(converter.content, *converter.part)
}

// 输出最终的数据
func (converter *OpenAIResponsesStreamConverter) finalizeStream() {
	if converter.item != nil {
		converter.done()
	}
	if len(converter.toolCalls) > 0 {
		converter.finalizeToolCalls()
	}
	if converter.nowStatus == "" {
		converter.nowStatus = types.ResponseStatusCompleted
	}

	respType := "response.completed"

	switch converter.nowStatus {
	case types.ResponseStatusFailed:
		respType = "response.failed"
	case types.ResponseStatusIncomplete:
		respType = "response.incomplete"
	}

	response := converter.buildStreamResponse(respType)
	response.Response = converter.responses
	response.Response.Status = converter.nowStatus

	response.Response.Usage = converter.usage.ToResponsesUsage()

	converter.sendStreamEvent(response, respType)
}

// 获取响应流字符串
func (converter *OpenAIResponsesStreamConverter) sendStreamEvent(resp any, responseType string) {
	respStr, err := json.Marshal(resp)
	if err != nil {
		return
	}

	_, writeErr := fmt.Fprintf(converter.c.Writer, "event: %s\ndata: %s\n\n", responseType, string(respStr))
	if writeErr != nil {
		return
	}

	converter.c.Writer.Flush()
}

// 错误响应
func (converter *OpenAIResponsesStreamConverter) sendError(msg string) {
	respErr := map[string]interface{}{
		"type":    "error",
		"code":    "error",
		"message": msg,
	}

	converter.sendStreamEvent(respErr, "error")
}

func (converter *OpenAIResponsesStreamConverter) generateResponseItemID(responseType string) {
	prefix := ""
	switch responseType {
	case types.InputTypeFunctionCall:
		prefix = "fc"
	case types.InputTypeReasoning:
		prefix = "rs"
	default:
		prefix = "msg"
	}

	converter.itemID = fmt.Sprintf("%s_%s", prefix, utils.GetRandomString(48))
}

func (converter *OpenAIResponsesStreamConverter) buildStreamResponse(responseType string) *types.OpenAIResponsesStreamResponses {
	response := &types.OpenAIResponsesStreamResponses{
		Type:           responseType,
		SequenceNumber: converter.sequenceNumber,
	}

	converter.sequenceNumber++

	return response
}

func (converter *OpenAIResponsesStreamConverter) buildStreamResponseWithItemID(responseType string) *types.OpenAIResponsesStreamResponses {
	response := converter.buildStreamResponse(responseType)
	response.ItemID = converter.itemID
	response.OutputIndex = &converter.outputIndex
	return response
}

func (converter *OpenAIResponsesStreamConverter) sendStreamResponse(responseType string, fn responsesHandler) {
	response := converter.buildStreamResponse(responseType)
	if fn != nil {
		fn(response)
	}

	converter.sendStreamEvent(response, responseType)
}

func (converter *OpenAIResponsesStreamConverter) populateResponseData(response *types.OpenAIResponsesStreamResponses) {
	response.Response = converter.responses
}

func (converter *OpenAIResponsesStreamConverter) GetResponseType(choice *types.ChatCompletionStreamChoice) string {
	if len(choice.Delta.ToolCalls) > 0 {
		return types.InputTypeFunctionCall
	}

	if choice.Delta.ReasoningContent != "" {
		return types.InputTypeReasoning
	}

	return types.InputTypeMessage
}
