# LLM Model Info and Prices

English | [简体中文](README.md)

Maintain model prices and model metadata for AI Hub, generating One Hub / One API compatible pricing data and model metadata that can be imported into the Model Info page.

## Output

Generated files:

```text
prices/prices.json
prices/metadata.json
model_info/model_info.json
model_info/metadata.json
```

`prices/prices.json` powers model price sync. Prices are normalized to USD per 1M tokens.

`model_info/model_info.json` powers Model Info imports, including model names, descriptions, context length, max output tokens, input/output modalities, tags, and reference links.

## Sources

Current primary sources:

```text
https://configs.portkey.ai/pricing/{provider}.json
https://openrouter.ai/api/v1/models
```

The OpenRouter model catalog is the priority source for OpenRouter model prices and metadata. Portkey prices are converted to USD per 1M tokens for other provider pricing data.

## Local Run

```bash
python scripts/sync_model_data.py
```

## GitHub Actions

Workflow file:

```text
.github/workflows/sync-model-info.yml
```

GitHub Actions can sync model prices and metadata, then commit changed generated files back to the data branch.

## Notes

- Provider to `channel_type` mapping is maintained in `config/provider_channel_map.json`.
- Model price fallback configuration is maintained in `config/model_price_fallbacks.json`.
- Unknown providers are skipped by default to avoid polluting output with incorrect mappings.
- Non-token pricing such as image, session, and search pricing is skipped for now.
- The scripts only use Python standard library.
