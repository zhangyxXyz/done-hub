<p align="right">
   <strong>English</strong> | <a href="./README.zh-CN.md">中文</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./web/src/assets/images/ai-hub-dark.svg">
    <img width="240" src="./web/src/assets/images/ai-hub-light.svg" alt="AI Hub">
  </picture>
</p>

<div align="center">

# AI Hub

_A multi-model API gateway and management platform based on [done-hub](https://github.com/deanxv/done-hub)._

</div>

## Core Features

- Multi-provider model proxying for Codex, Claude Code, GitHub Copilot, Gemini, Vertex, and more, including streaming compatibility.
- Automatic model price and metadata sync with scheduling, alias matching, and provider correction.
- Channel quota queries, token usage alerts, logs, and image usage accounting.
- Glass theme, custom CSS / pages / footer, avatar management, and registration controls.
- Built-in NextChat / Midjourney Proxy integration with Docker and multi-platform release workflows.

## Model Data

- `prices/prices.json`: model pricing.
- `model_info/model_info.json`: names, descriptions, context limits, modalities, and references.

## Thanks

<p dir="auto">
  <a href="https://github.com/MartialBE/one-api"><img src="https://img.shields.io/badge/One--Hub-github.com%2FMartialBE%2Fone--api-1f6feb?style=flat-square&logo=github&logoColor=white" alt="One-Hub"></a><br>
  <a href="https://github.com/deanxv/done-hub"><img src="https://img.shields.io/badge/Done--Hub-github.com%2Fdeanxv%2Fdone--hub-1f6feb?style=flat-square&logo=github&logoColor=white" alt="Done-Hub"></a>
</p>
