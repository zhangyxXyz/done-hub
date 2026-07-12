<p align="right">
   <a href="./README.md">English</a> | <strong>中文</strong>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./web/src/assets/images/ai-hub-dark.svg">
    <img width="240" src="./web/src/assets/images/ai-hub-light.svg" alt="AI Hub">
  </picture>
</p>

<div align="center">

# AI Hub

_基于 [done-hub](https://github.com/deanxv/done-hub) 的多模型 API 网关与管理平台。_

</div>

## 核心功能

- 多渠道模型代理，支持 Codex、Claude Code、GitHub Copilot、Gemini、Vertex 等渠道及流式兼容。
- 模型价格与详情自动同步，支持定时更新、别名匹配和厂商归属修正。
- 渠道额度查询、令牌用量告警、日志和图片用量统计。
- 玻璃主题、自定义 CSS / 页面 / 页脚、头像管理和注册入口控制。
- 内置 NextChat / Midjourney Proxy 集成及 Docker、多平台发布工作流。

## 模型数据

- `prices/prices.json`：模型价格。
- `model_info/model_info.json`：模型名称、描述、上下文、模态及参考链接。

## Thanks

<p dir="auto">
  <a href="https://github.com/MartialBE/one-api"><img src="https://img.shields.io/badge/One--Hub-github.com%2FMartialBE%2Fone--api-1f6feb?style=flat-square&logo=github&logoColor=white" alt="One-Hub"></a><br>
  <a href="https://github.com/deanxv/done-hub"><img src="https://img.shields.io/badge/Done--Hub-github.com%2Fdeanxv%2Fdone--hub-1f6feb?style=flat-square&logo=github&logoColor=white" alt="Done-Hub"></a>
</p>
