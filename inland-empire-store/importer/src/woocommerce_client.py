"""WooCommerce REST API client: idempotent product upsert + image upload."""
from __future__ import annotations

import os
from functools import lru_cache

import requests

from .config import config
from .logger import log

_API = "/wp-json/wc/v3"


def _auth() -> tuple[str, str]:
    return (config.wc_consumer_key, config.wc_consumer_secret)


def _url(path: str) -> str:
    return f"{config.wc_store_url}{_API}{path}"


def ping() -> bool:
    try:
        r = requests.get(_url("/system_status"), auth=_auth(), verify=config.wc_verify_ssl, timeout=20)
        return r.status_code == 200
    except requests.RequestException as exc:
        log.error("WooCommerce ping failed: %s", exc)
        return False


@lru_cache(maxsize=1)
def _category_index() -> dict[str, int]:
    """Map lowercased category name -> term id (one API sweep)."""
    index: dict[str, int] = {}
    page = 1
    while True:
        r = requests.get(
            _url("/products/categories"),
            params={"per_page": 100, "page": page},
            auth=_auth(), verify=config.wc_verify_ssl, timeout=30,
        )
        if r.status_code != 200:
            break
        batch = r.json()
        if not batch:
            break
        for term in batch:
            index[term["name"].lower()] = term["id"]
        page += 1
    return index


def resolve_categories(cat_path: dict) -> list[dict]:
    idx = _category_index()
    out = []
    for name in (cat_path.get("top"), cat_path.get("sub")):
        if name and name.lower() in idx:
            out.append({"id": idx[name.lower()]})
    return out


def find_existing_id(record: dict) -> int | None:
    """Duplicate detection: eBay item id (meta) -> SKU."""
    if record.get("ebay_item_id"):
        r = requests.get(
            _url("/products"),
            params={"meta_key": "_ebay_item_id", "meta_value": record["ebay_item_id"], "per_page": 1},
            auth=_auth(), verify=config.wc_verify_ssl, timeout=30,
        )
        if r.status_code == 200 and r.json():
            return r.json()[0]["id"]
    if record.get("sku"):
        r = requests.get(
            _url("/products"), params={"sku": record["sku"]},
            auth=_auth(), verify=config.wc_verify_ssl, timeout=30,
        )
        if r.status_code == 200 and r.json():
            return r.json()[0]["id"]
    return None


def upload_image(local_path: str) -> int | None:
    """Upload an image to the WP media library via the REST API; return media id."""
    media_url = f"{config.wc_store_url}/wp-json/wp/v2/media"
    name = os.path.basename(local_path)
    try:
        with open(local_path, "rb") as fh:
            r = requests.post(
                media_url,
                headers={"Content-Disposition": f'attachment; filename="{name}"'},
                files={"file": (name, fh)},
                auth=_auth(), verify=config.wc_verify_ssl, timeout=60,
            )
        if r.status_code in (200, 201):
            return r.json()["id"]
        log.warning("Image upload HTTP %s for %s", r.status_code, name)
    except (requests.RequestException, OSError) as exc:
        log.warning("Image upload failed: %s", exc)
    return None


def upsert(payload: dict, dry_run: bool = False) -> dict:
    """Create or update a product. Returns {action, id, status}."""
    cat_path = payload.pop("_category_path", {})
    record_keys = {"ebay_item_id": "", "sku": payload.get("sku", "")}
    for meta in payload.get("meta_data", []):
        if meta["key"] == "_ebay_item_id":
            record_keys["ebay_item_id"] = meta["value"]

    existing = find_existing_id(record_keys)
    if cat_path:
        cats = resolve_categories(cat_path)
        if cats:
            payload["categories"] = cats

    if dry_run:
        return {"action": "updated (dry-run)" if existing else "created (dry-run)",
                "id": existing or 0, "status": payload.get("status")}

    try:
        if existing:
            r = requests.put(_url(f"/products/{existing}"), json=payload,
                             auth=_auth(), verify=config.wc_verify_ssl, timeout=60)
            action = "updated"
        else:
            r = requests.post(_url("/products"), json=payload,
                              auth=_auth(), verify=config.wc_verify_ssl, timeout=60)
            action = "created"
        if r.status_code in (200, 201):
            return {"action": action, "id": r.json().get("id", existing or 0), "status": payload.get("status")}
        log.error("Upsert HTTP %s: %s", r.status_code, r.text[:200])
        return {"action": "error", "id": 0, "status": "error", "error": f"HTTP {r.status_code}"}
    except requests.RequestException as exc:
        log.error("Upsert failed: %s", exc)
        return {"action": "error", "id": 0, "status": "error", "error": str(exc)}


def set_product_images(product_id: int, media_ids: list[int]) -> None:
    if not media_ids:
        return
    images = [{"id": mid} for mid in media_ids]
    try:
        requests.put(_url(f"/products/{product_id}"), json={"images": images},
                     auth=_auth(), verify=config.wc_verify_ssl, timeout=60)
    except requests.RequestException as exc:
        log.warning("Setting images failed: %s", exc)
