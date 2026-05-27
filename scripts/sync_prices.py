#!/usr/bin/env python3
import json
import sys
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / "config"
PRICES_DIR = ROOT / "prices"
MODEL_INFO_DIR = ROOT / "model_info"
OUTPUT_PATH = PRICES_DIR / "prices.json"
METADATA_PATH = PRICES_DIR / "metadata.json"
MODEL_INFO_OUTPUT_PATH = MODEL_INFO_DIR / "model_info.json"
MODEL_INFO_METADATA_PATH = MODEL_INFO_DIR / "metadata.json"
MODEL_PRICE_FALLBACKS_PATH = CONFIG_DIR / "model_price_fallbacks.json"

def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_optional_json(path, default):
    if not path.exists():
        return default
    return load_json(path)


def fetch_json(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ai-hub-price-sync/1.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def compact_price(value):
    if value is None:
        return None
    rounded = round(float(value), 6)
    if rounded.is_integer():
        return int(rounded)
    return rounded


def price_key(model, channel_type):
    return f"{channel_type}:{model}"


def normalize_provider(provider):
    if not provider:
        return None
    return str(provider).strip().lower().replace("-", "_")


def portkey_cents_per_token_to_per_million(value):
    if value is None:
        return None
    amount = Decimal(str(value)) * Decimal("10000")
    return float(amount.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP))


def dollars_per_token_to_per_million(value):
    if value is None:
        return None
    amount = Decimal(str(value)) * Decimal("1000000")
    return float(amount.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP))


def compact_int(value):
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def normalize_list(value):
    if not isinstance(value, list):
        return []
    normalized = []
    seen = set()
    for item in value:
        if item is None:
            continue
        text = str(item).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
    return normalized


def openrouter_model_url(model_id):
    return f"https://openrouter.ai/models/{model_id}"


def openrouter_support_urls(spec):
    model_id = spec.get("id")
    urls = []
    if model_id:
        urls.append(openrouter_model_url(model_id))

    details = (spec.get("links") or {}).get("details")
    if details:
        if details.startswith("http://") or details.startswith("https://"):
            urls.append(details)
        else:
            urls.append("https://openrouter.ai" + details)

    return normalize_list(urls)


def openrouter_tags(spec, input_modalities, output_modalities):
    tags = ["openrouter"]
    supported_parameters = set(normalize_list(spec.get("supported_parameters")))
    if "image" in input_modalities:
        tags.append("vision")
    if "audio" in input_modalities or "audio" in output_modalities:
        tags.append("audio")
    if "tools" in supported_parameters or "tool_choice" in supported_parameters:
        tags.append("tools")
    if "reasoning" in supported_parameters or "include_reasoning" in supported_parameters:
        tags.append("reasoning")
    if "structured_outputs" in supported_parameters or "response_format" in supported_parameters:
        tags.append("structured_outputs")
    return tags


def convert_portkey_prices(provider, portkey_data, provider_channel_map):
    provider_key = normalize_provider(provider)
    channel_type = provider_channel_map.get(provider_key)
    converted = {}
    skipped = {
        "unknown_provider": 0,
        "default": 0,
        "missing_pricing_config": 0,
        "missing_input_price": 0,
    }

    if channel_type is None:
        skipped["unknown_provider"] += len(portkey_data)
        return converted, skipped

    for model, spec in portkey_data.items():
        if model == "default":
            skipped["default"] += 1
            continue
        if not isinstance(spec, dict):
            continue

        pricing_config = spec.get("pricing_config", {})
        pay_as_you_go = pricing_config.get("pay_as_you_go", {})
        if not pay_as_you_go:
            skipped["missing_pricing_config"] += 1
            continue

        request_token = pay_as_you_go.get("request_token", {})
        response_token = pay_as_you_go.get("response_token", {})
        input_price = portkey_cents_per_token_to_per_million(request_token.get("price"))
        output_price = portkey_cents_per_token_to_per_million(response_token.get("price"))

        if input_price is None:
            skipped["missing_input_price"] += 1
            continue
        if output_price is None:
            output_price = input_price

        converted[price_key(model, channel_type)] = {
            "model": model,
            "type": "tokens",
            "channel_type": channel_type,
            "input": compact_price(input_price),
            "output": compact_price(output_price),
        }

    return converted, skipped


def convert_openrouter_models(openrouter_data, provider_channel_map):
    channel_type = provider_channel_map.get("openrouter")
    converted = {}
    skipped = {
        "unknown_provider": 0,
        "missing_model_id": 0,
        "missing_pricing": 0,
        "missing_input_price": 0,
        "negative_price": 0,
    }

    if channel_type is None:
        skipped["unknown_provider"] = len(openrouter_data.get("data", []))
        return converted, skipped

    for spec in openrouter_data.get("data", []):
        if not isinstance(spec, dict):
            continue

        model = spec.get("id")
        if not model:
            skipped["missing_model_id"] += 1
            continue

        pricing = spec.get("pricing", {})
        if not pricing:
            skipped["missing_pricing"] += 1
            continue

        input_price = dollars_per_token_to_per_million(pricing.get("prompt"))
        output_price = dollars_per_token_to_per_million(pricing.get("completion"))

        if input_price is None:
            skipped["missing_input_price"] += 1
            continue
        if output_price is None:
            output_price = input_price
        if input_price < 0 or output_price < 0:
            skipped["negative_price"] += 1
            continue

        converted[price_key(model, channel_type)] = {
            "model": model,
            "type": "tokens",
            "channel_type": channel_type,
            "input": compact_price(input_price),
            "output": compact_price(output_price),
        }

    return converted, skipped


def convert_openrouter_model_info(openrouter_data):
    converted = {}
    skipped = {
        "missing_model_id": 0,
    }

    for spec in openrouter_data.get("data", []):
        if not isinstance(spec, dict):
            continue

        model = spec.get("id")
        if not model:
            skipped["missing_model_id"] += 1
            continue

        architecture = spec.get("architecture") or {}
        top_provider = spec.get("top_provider") or {}
        input_modalities = normalize_list(architecture.get("input_modalities"))
        output_modalities = normalize_list(architecture.get("output_modalities"))

        converted[model] = {
            "model": model,
            "name": spec.get("name") or model,
            "description": spec.get("description") or "",
            "context_length": compact_int(spec.get("context_length") or top_provider.get("context_length")),
            "max_tokens": compact_int(top_provider.get("max_completion_tokens")),
            "input_modalities": input_modalities,
            "output_modalities": output_modalities,
            "tags": openrouter_tags(spec, input_modalities, output_modalities),
            "support_url": openrouter_support_urls(spec),
        }

    return converted, skipped


def sort_prices(prices):
    return sorted(
        prices.values(),
        key=lambda item: (int(item.get("channel_type", 0)), str(item.get("model", ""))),
    )


def sort_model_info(model_info):
    return sorted(
        model_info.values(),
        key=lambda item: str(item.get("model", "")),
    )


def apply_model_price_fallbacks(prices, fallbacks):
    results = []
    for fallback in fallbacks:
        model = fallback.get("model")
        fallback_model = fallback.get("fallback_model")
        channel_type = fallback.get("channel_type")
        if not model or not fallback_model or channel_type is None:
            results.append(
                {
                    "model": model,
                    "fallback_model": fallback_model,
                    "channel_type": channel_type,
                    "status": "invalid_config",
                }
            )
            continue

        target_key = price_key(model, channel_type)
        source_key = price_key(fallback_model, channel_type)
        result = {
            "model": model,
            "fallback_model": fallback_model,
            "channel_type": channel_type,
        }

        if target_key in prices:
            result["status"] = "exists"
            results.append(result)
            continue

        source = prices.get(source_key)
        if source is None:
            result["status"] = "missing_fallback_model"
            results.append(result)
            continue

        prices[target_key] = {
            **source,
            "model": model,
        }
        result["status"] = "applied"
        results.append(result)

    return results


def main():
    sources = load_json(CONFIG_DIR / "sources.json")
    provider_channel_map = load_json(CONFIG_DIR / "provider_channel_map.json")
    model_price_fallbacks = load_optional_json(MODEL_PRICE_FALLBACKS_PATH, [])

    prices = {}
    portkey_counts = {}
    portkey_skipped = {}
    portkey_errors = {}
    portkey_total = 0
    for provider in sources.get("portkey_providers", []):
        url = f"{sources['portkey_base'].rstrip('/')}/{provider}.json"
        try:
            provider_data = fetch_json(url)
        except Exception as exc:
            portkey_errors[provider] = str(exc)
            continue
        provider_prices, provider_skipped = convert_portkey_prices(
            provider,
            provider_data,
            provider_channel_map,
        )
        prices.update(provider_prices)
        portkey_counts[provider] = len(provider_prices)
        portkey_skipped[provider] = provider_skipped
        portkey_total += len(provider_prices)

    openrouter_api_count = 0
    openrouter_api_added_count = 0
    openrouter_api_overridden_count = 0
    openrouter_api_skipped = {}
    openrouter_model_info = {}
    openrouter_model_info_skipped = {}
    openrouter_api_error = None
    openrouter_api_url = sources.get("openrouter_models_api")
    if openrouter_api_url:
        try:
            openrouter_data = fetch_json(openrouter_api_url)
            openrouter_prices, openrouter_api_skipped = convert_openrouter_models(
                openrouter_data,
                provider_channel_map,
            )
            openrouter_api_count = len(openrouter_prices)
            for key, price in openrouter_prices.items():
                if key in prices:
                    openrouter_api_overridden_count += 1
                else:
                    openrouter_api_added_count += 1
                prices[key] = price
            openrouter_model_info, openrouter_model_info_skipped = convert_openrouter_model_info(openrouter_data)
        except Exception as exc:
            openrouter_api_error = str(exc)

    fallback_results = apply_model_price_fallbacks(prices, model_price_fallbacks)
    output_rows = sort_prices(prices)

    PRICES_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_INFO_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(output_rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    model_info_rows = sort_model_info(openrouter_model_info)
    MODEL_INFO_OUTPUT_PATH.write_text(
        json.dumps(
            {
                "data": [
                    {
                        "model": item["model"],
                        "model_info": item,
                    }
                    for item in model_info_rows
                ]
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )

    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "portkey_converted_count": portkey_total,
        "portkey_provider_counts": portkey_counts,
        "portkey_errors": portkey_errors,
        "openrouter_api_converted_count": openrouter_api_count,
        "openrouter_api_added_count": openrouter_api_added_count,
        "openrouter_api_overridden_count": openrouter_api_overridden_count,
        "openrouter_api_error": openrouter_api_error,
        "openrouter_model_info_count": len(model_info_rows),
        "openrouter_model_info_skipped": openrouter_model_info_skipped,
        "output_count": len(output_rows),
        "skipped": portkey_skipped,
        "openrouter_api_skipped": openrouter_api_skipped,
        "model_price_fallbacks": fallback_results,
    }
    METADATA_PATH.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    MODEL_INFO_METADATA_PATH.write_text(
        json.dumps(
            {
                "generated_at": metadata["generated_at"],
                "sources": {
                    "openrouter_models_api": sources.get("openrouter_models_api"),
                },
                "openrouter_model_info_count": len(model_info_rows),
                "openrouter_model_info_skipped": openrouter_model_info_skipped,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )

    print(f"wrote {OUTPUT_PATH.relative_to(ROOT)} ({len(output_rows)} rows)")
    print(f"wrote {METADATA_PATH.relative_to(ROOT)}")
    print(f"wrote {MODEL_INFO_OUTPUT_PATH.relative_to(ROOT)} ({len(model_info_rows)} rows)")
    print(f"wrote {MODEL_INFO_METADATA_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise
