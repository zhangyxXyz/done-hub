# LLM Model Prices

[English](README.en.md) | 简体中文

从 Portkey 同步模型价格，并生成兼容 One Hub / One API 的 `prices.json`。

## 输出

生成文件：

```text
prices/prices.json
```

格式：

```json
[
  {
    "model": "gpt-4o",
    "type": "tokens",
    "channel_type": 1,
    "input": 2.5,
    "output": 10
  }
]
```

`input` 和 `output` 表示每 100 万 tokens 的美元价格。

## 流程

1. 拉取 Portkey 模型价格数据。
2. 将价格统一换算成每 100 万 tokens 的美元价格。
3. 将上游 provider 映射到 One Hub 的 `channel_type`。
4. 生成 `prices/prices.json`。
5. 生成 `prices/metadata.json`，用于审计和调试。
6. GitHub Actions 每天自动执行。
7. 如果生成文件发生变化，自动 commit 并 push。

## 当前数据源

数据源：

```text
https://configs.portkey.ai/pricing/{provider}.json
```

Portkey 的原始单位是 cents per token，脚本会自动换算成每 100 万 tokens 的美元价格。

## 本地运行

```bash
python scripts/sync_prices.py
```

生成文件：

```text
prices/prices.json
prices/metadata.json
```

## GitHub Action

workflow 文件位置：

```text
.github/workflows/sync-prices.yml
```

它会每天自动运行，也可以在 GitHub Actions 页面手动触发。

## 说明

- Provider 到 `channel_type` 的映射维护在 `config/provider_channel_map.json`。
- 未知 provider 默认会被跳过，避免错误映射污染输出结果。
- 图片、session、search 等非 token 计费暂时会被跳过。
- 脚本只使用 Python standard library，不需要额外安装依赖。
