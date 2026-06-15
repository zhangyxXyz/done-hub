<p align="right">
   <strong>中文</strong> | <a href="./README.en.md">English</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./web/src/assets/images/ai-hub-dark.svg">
    <img width="240" src="./web/src/assets/images/ai-hub-light.svg" alt="AI Hub">
  </picture>
</p>

<div align="center">

# AI Hub

_AI Hub fork 自 [done-hub](https://github.com/deanxv/done-hub)，done-hub 是基于 [one-hub](https://github.com/MartialBE/one-api) 二次开发的上游项目。_

</div>

## 功能摘要

- 品牌与主题：玻璃风格主题、全局自定义 CSS、自定义页面和页脚统一覆盖。
- 访问体验：关闭注册后隐藏入口，自定义 HTML / iframe 内容支持滚动并跟随深浅色主题。
- 用户资料：支持头像上传、裁剪和令牌密钥刷新。
- 价格同步：新增价格同步工作流入口和后台定时更新配置，并支持 Kimi、Qwen、GLM、DeepSeek、MiniMax、MiMo、Hy3、Claude 等模型裸名到上游价格 ID 的别名匹配与厂商归属修正。
- Playground：内置 NextChat / Midjourney Proxy 等聊天服务打包与启动能力，并在打开 NextChat 时自动带入当前用户可用模型到自定义模型名。
- 用量治理：令牌用量告警配置、日志展示优化和图片用量统计修复。
- 渠道兼容：按渠道配置 Chat 转 Responses 模型，并修复 Codex / Gemini / Vertex 等流式兼容问题。
- Fork 发布：GitHub Actions、Docker / 多平台发布和包 registry 配置更适配 fork 环境。

## 数据同步

- 模型价格与模型详情统一由 `llm-model-info` 数据分支维护。
- `prices/prices.json` 用于模型价格同步，`model_info/model_info.json` 用于“模型详情”页批量导入。
- 模型详情数据目前优先从 OpenRouter 模型目录生成，包含名称、描述、上下文长度、最大输出、输入/输出模态、标签和参考链接。
- “模型详情”页提供超级管理员可见的同步设置，可配置数据 URL、更新模式、定时规则并手动触发同步。
- 支持通过 GitHub Actions 同步模型价格与详情数据，并提交到数据分支。

## Thanks

<p dir="auto">
  <a href="https://github.com/MartialBE/one-api"><img src="https://img.shields.io/badge/One--Hub-github.com%2FMartialBE%2Fone--api-1f6feb?style=flat-square&logo=github&logoColor=white" alt="One-Hub"></a><br>
  <a href="https://github.com/deanxv/done-hub"><img src="https://img.shields.io/badge/Done--Hub-github.com%2Fdeanxv%2Fdone--hub-1f6feb?style=flat-square&logo=github&logoColor=white" alt="Done-Hub"></a>
</p>
