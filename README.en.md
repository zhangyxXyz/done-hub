<p align="right">
   <a href="./README.md">中文</a> | <strong>English</strong>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./web/src/assets/images/ai-hub-dark.svg">
    <img width="240" src="./web/src/assets/images/ai-hub-light.svg" alt="AI Hub">
  </picture>
</p>

<div align="center">

# AI Hub

_AI Hub is forked from [done-hub](https://github.com/deanxv/done-hub), an upstream project built as a secondary development based on [one-hub](https://github.com/MartialBE/one-api)._

</div>

## Highlights

- Branding and theme: glass theme, global custom CSS, custom pages, and footer overrides.
- Access experience: hide the registration entry when disabled, and keep custom HTML / iframe content scrollable with light and dark themes.
- User profile: avatar upload and cropping, plus token key refresh.
- Price sync: price sync workflow entrypoint, configurable scheduled updates, and model alias matching for Kimi, Qwen, GLM, DeepSeek, MiniMax, MiMo, Hy3, Claude, and similar upstream pricing IDs.
- Playground: bundled NextChat / Midjourney Proxy chat services with packaging and startup scripts, plus automatic NextChat custom model import from the current user's available models.
- Usage controls: token usage alerts, improved log views, and image usage accounting fixes.
- Channel compatibility: per-channel Chat-to-Responses conversion models with Codex / Gemini / Vertex stream fixes.
- Fork releases: GitHub Actions, Docker / multi-platform releases, and package registry settings tuned for forks.

## Data Sync

- Model prices and model metadata are maintained together on the `llm-model-info` data branch.
- `prices/prices.json` powers model price sync, while `model_info/model_info.json` can be imported into the Model Info page.
- Model metadata is currently generated primarily from the OpenRouter model catalog, including names, descriptions, context length, max output tokens, input/output modalities, tags, and reference links.
- The Model Info page includes super-admin-only sync settings for the data URL, update mode, schedule, and manual sync.
- GitHub Actions can sync model prices and metadata, then commit the generated data back to the data branch.

## Thanks

<p dir="auto">
  <a href="https://github.com/MartialBE/one-api"><img src="https://img.shields.io/badge/One--Hub-github.com%2FMartialBE%2Fone--api-1f6feb?style=flat-square&logo=github&logoColor=white" alt="One-Hub"></a><br>
  <a href="https://github.com/deanxv/done-hub"><img src="https://img.shields.io/badge/Done--Hub-github.com%2Fdeanxv%2Fdone--hub-1f6feb?style=flat-square&logo=github&logoColor=white" alt="Done-Hub"></a>
</p>
