"""Load + normalize eBay Seller Hub CSV exports into records."""
from __future__ import annotations

import csv
import re
from typing import Iterator

HEADER_ALIASES = {
    "item number": "ebay_item_id", "itemid": "ebay_item_id", "item id": "ebay_item_id",
    "ebay item number": "ebay_item_id", "item": "ebay_item_id",
    "title": "title", "item title": "title", "listing title": "title",
    "custom label": "sku", "custom label (sku)": "sku", "sku": "sku", "customlabel": "sku",
    "current price": "price", "start price": "price", "price": "price",
    "buy it now price": "price", "fixed price": "price",
    "available quantity": "quantity", "quantity": "quantity",
    "quantity available": "quantity", "qty": "quantity",
    "condition": "condition", "item condition": "condition",
    "category": "ebay_category", "ebay category": "ebay_category",
    "category name": "ebay_category", "store category": "ebay_category",
    "item url": "listing_url", "url": "listing_url", "view item url": "listing_url",
    "listing url": "listing_url",
    "brand": "brand", "manufacturer": "brand",
    "mpn": "mpn", "manufacturer part number": "mpn",
    "description": "description", "item description": "description",
    "picture url": "images", "image url": "images", "gallery url": "images",
    "pictureurl": "images", "photo url": "images",
}

_HEADER_HINTS = ("title", "item number", "custom label")


def _looks_like_header(row: list[str]) -> bool:
    joined = ",".join(c.lower() for c in row)
    return any(h in joined for h in _HEADER_HINTS)


def load_csv(path: str) -> list[dict]:
    """Return a list of normalized record dicts."""
    return list(iter_csv(path))


def iter_csv(path: str) -> Iterator[dict]:
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as fh:
        reader = csv.reader(fh)
        headers: list[str] = []
        for row in reader:
            if not headers:
                if _looks_like_header(row):
                    headers = [c.strip() for c in row]
                continue
            if not any(c.strip() for c in row):
                continue
            assoc = {headers[i]: (row[i].strip() if i < len(row) else "") for i in range(len(headers))}
            yield normalize_row(assoc)


def normalize_row(row: dict) -> dict:
    record = {
        "ebay_item_id": "", "listing_url": "", "title": "", "description": "",
        "price": "", "quantity": 1, "sku": "", "condition": "", "brand": "",
        "mpn": "", "ebay_category": "", "images": [], "specifics": {},
    }
    for header, value in row.items():
        field = HEADER_ALIASES.get(header.strip().lower())
        if field is None:
            if value:
                record["specifics"][header] = value
            continue
        if field == "images":
            urls = re.split(r"[|;,]\s*", value)
            record["images"].extend(u.strip() for u in urls if u.strip())
        else:
            record[field] = value
    # de-dup images, coerce quantity
    record["images"] = list(dict.fromkeys(u for u in record["images"] if u))
    try:
        record["quantity"] = int(float(record["quantity"])) if str(record["quantity"]).strip() else 1
    except (TypeError, ValueError):
        record["quantity"] = 1
    return record
