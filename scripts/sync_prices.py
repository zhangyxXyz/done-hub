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
OUTPUT_PATH = PRICES_DIR / "prices.json"
METADATA_PATH = PRICES_DIR / "metadata.json"
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


def sort_prices(prices):
    return sorted(
        prices.values(),
        key=lambda item: (int(item.get("channel_type", 0)), str(item.get("model", ""))),
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

    fallback_results = apply_model_price_fallbacks(prices, model_price_fallbacks)
    output_rows = sort_prices(prices)

    PRICES_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(output_rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "portkey_converted_count": portkey_total,
        "portkey_provider_counts": portkey_counts,
        "portkey_errors": portkey_errors,
        "output_count": len(output_rows),
        "skipped": portkey_skipped,
        "model_price_fallbacks": fallback_results,
    }
    METADATA_PATH.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"wrote {OUTPUT_PATH.relative_to(ROOT)} ({len(output_rows)} rows)")
    print(f"wrote {METADATA_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise
