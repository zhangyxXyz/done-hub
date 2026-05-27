# LLM Model Info and Prices

[English](README.en.md) | 简体中文

维护 AI Hub 使用的模型价格与模型详情数据，生成兼容 One Hub / One API 的价格文件，以及可导入“模型详情”页的模型元数据文件。

## 输出

生成文件：

```text
prices/prices.json
prices/metadata.json
model_info/model_info.json
model_info/metadata.json
```

`prices/prices.json` 用于模型价格同步，价格单位为每 1M tokens 的美元价格。

`model_info/model_info.json` 用于模型详情导入，包含模型名称、描述、上下文长度、最大输出、输入/输出模态、标签和参考链接等信息。

## 数据来源

当前主要数据来源：

```text
https://configs.portkey.ai/pricing/{provider}.json
https://openrouter.ai/api/v1/models
```

OpenRouter 模型目录是 OpenRouter 模型价格与模型详情的优先来源；Portkey 价格会转换为每 1M tokens 的美元价格，用于其它 provider 的价格数据。

## 本地运行

```bash
python scripts/sync_model_data.py
```

## GitHub Actions

工作流文件：

```text
.github/workflows/sync-model-info.yml
```

支持通过 GitHub Actions 同步模型价格与详情数据，并在生成文件变化时提交到数据分支。

## 说明

- Provider 到 `channel_type` 的映射维护在 `config/provider_channel_map.json`。
- 模型价格 fallback 配置维护在 `config/model_price_fallbacks.json`。
- 未知 provider 默认会被跳过，避免错误映射污染输出结果。
- 图片、session、search 等非 token 计费暂时会被跳过。
- 脚本只使用 Python standard library，不需要额外安装依赖。
