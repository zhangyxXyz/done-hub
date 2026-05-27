# LLM Model Prices

English | [简体中文](README.md)

Sync model pricing from Portkey and generate a One Hub / One API compatible `prices.json`.

## Output

Generated file:

```text
prices/prices.json
```

Format:

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

`input` and `output` are USD prices per 1M tokens.

## Flow

1. Fetch Portkey model pricing data.
2. Fetch OpenRouter's public models API as a supplemental source.
3. Normalize prices to USD per 1M tokens.
4. Map upstream providers to One Hub `channel_type` values.
5. Keep Portkey prices when a model already exists, and use OpenRouter only to fill missing OpenRouter models.
6. Generate `prices/prices.json`.
7. Generate `prices/metadata.json` for audit and debugging.
8. Run daily with GitHub Actions.
9. If generated files changed, commit and push automatically.

## Model Price Fallbacks

If a model is supported by special configuration but is temporarily missing from the upstream pricing source,
add an entry to `config/model_price_fallbacks.json` to reuse another model's price.

Example:

```json
[
  {
    "model": "gpt-5.3-codex-spark",
    "fallback_model": "gpt-5.3-codex",
    "channel_type": 1
  }
]
```

The sync script applies fallbacks after upstream prices are fetched and converted. If the target model already
exists, the upstream price is kept. If the target is missing and the fallback model exists, the script copies the
fallback model's `type`, `input`, `output`, and `channel_type`, replacing only the model name. Results are recorded
in `prices/metadata.json`.

## Current Sources

Sources:

```text
https://configs.portkey.ai/pricing/{provider}.json
https://openrouter.ai/api/v1/models
```

Portkey prices are published as cents per token, and the script converts them to USD per 1M tokens.
OpenRouter prices are published as USD per token, and the script converts them to USD per 1M tokens.

## Local Run

```bash
python scripts/sync_prices.py
```

Generated files:

```text
prices/prices.json
prices/metadata.json
```

## GitHub Action

Workflow file:

```text
.github/workflows/sync-prices.yml
```

It runs daily and can also be triggered manually from the GitHub Actions page.

## Notes

- Provider to `channel_type` mapping is maintained in `config/provider_channel_map.json`.
- Unknown providers are skipped by default to avoid polluting output with incorrect mappings.
- Non-token pricing such as image, session, and search pricing is skipped for now.
- The script only uses Python standard library.
