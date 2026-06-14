"""Map a normalized record into a WooCommerce product payload."""
from __future__ import annotations

import requests

from .categorizer import categorize, needs_review
from .config import config
from .logger import log
from .utils import SPECIFIC_ALIASES, apply_markup


def build_attributes(record: dict) -> list[dict]:
    """Build WooCommerce custom (non-taxonomy) attributes."""
    values: dict[str, str] = {}
    if record.get("brand"):
        values["Brand"] = record["brand"]
    if record.get("mpn"):
        values["MPN"] = record["mpn"]
        values["Part Number"] = record["mpn"]
    if record.get("condition"):
        values["Condition"] = record["condition"]
    for key, val in (record.get("specifics") or {}).items():
        target = SPECIFIC_ALIASES.get(key.strip().lower())
        if target and val:
            values[target] = val

    return [
        {"name": name, "options": [val], "visible": True, "variation": False, "position": i}
        for i, (name, val) in enumerate(values.items())
    ]


def to_wc_payload(record: dict) -> dict:
    """Produce the WooCommerce REST product payload (always draft)."""
    cat = categorize(
        record.get("title", ""),
        record.get("brand", ""),
        " ".join(list((record.get("specifics") or {}).keys()) + [record.get("mpn", "")]),
    )

    price = record.get("price", "")
    if price:
        try:
            price = str(apply_markup(float(price), config.price_markup_percent))
        except (TypeError, ValueError):
            price = ""

    payload = {
        "name": record.get("title", ""),
        "type": "simple",
        "status": "draft",            # never auto-publish
        "catalog_visibility": "hidden",
        "description": record.get("description", ""),
        "regular_price": price,
        "sku": record.get("sku", ""),
        "manage_stock": True,
        "stock_quantity": max(0, int(record.get("quantity", 0) or 0)),
        "attributes": build_attributes(record),
        "meta_data": [
            {"key": "_ebay_item_id", "value": record.get("ebay_item_id", "")},
            {"key": "_ebay_listing_url", "value": record.get("listing_url", "")},
            {"key": "_anstelias_import_source", "value": "python"},
            {"key": "_anstelias_import_status",
             "value": "needs_review" if needs_review(cat["confidence"]) else "ready_to_publish"},
            {"key": "_anstelias_category_confidence", "value": cat["confidence"]},
        ],
        # Category resolution by name is done by woocommerce_client (needs term ids).
        "_category_path": cat,
    }
    return payload


def enrich_description(text: str) -> str:
    """Optionally clean a description via local Ollama (Pi #1). Free + offline.

    No-op unless OLLAMA_ENABLED=true. Failures fall back to the original text.
    """
    if not config.ollama_enabled or not text:
        return text
    try:
        resp = requests.post(
            f"{config.ollama_url}/api/generate",
            json={
                "model": config.ollama_model,
                "prompt": (
                    "Rewrite this used-electronics product description to be clear, "
                    "factual, and concise. Do not invent specs. Keep it under 120 words:\n\n"
                    + text
                ),
                "stream": False,
            },
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json().get("response", text).strip() or text
    except requests.RequestException as exc:  # pragma: no cover - optional
        log.warning("Ollama enrichment skipped: %s", exc)
        return text
