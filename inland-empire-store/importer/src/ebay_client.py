"""eBay Trading API client (GetSellerList) — optional, free with a dev account."""
from __future__ import annotations

import time
import xml.etree.ElementTree as ET

import requests

from .config import config
from .logger import log

_NS = "urn:ebay:apis:eBLBaseComponents"
_COMPAT = "1193"


def _endpoint() -> str:
    return (
        "https://api.sandbox.ebay.com/ws/api.dll"
        if config.ebay_environment == "sandbox"
        else "https://api.ebay.com/ws/api.dll"
    )


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1]


def _find(el, name):
    for child in el.iter():
        if _strip_ns(child.tag) == name:
            return child
    return None


def fetch_active_listings(limit: int = 0, per_page: int = 100) -> list[dict]:
    """Fetch active listings as normalized records."""
    if not config.has_ebay():
        raise RuntimeError("eBay API credentials are not configured.")
    per_page = min(200, max(1, per_page))
    records: list[dict] = []
    page = 1
    total_pages = 1
    while page <= total_pages:
        body = f"""<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="{_NS}">
  <RequesterCredentials><eBayAuthToken>{config.ebay_user_token}</eBayAuthToken></RequesterCredentials>
  <GranularityLevel>Fine</GranularityLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <EndTimeFrom>{time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())}</EndTimeFrom>
  <EndTimeTo>{time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(time.time() + 120*86400))}</EndTimeTo>
  <Pagination><EntriesPerPage>{per_page}</EntriesPerPage><PageNumber>{page}</PageNumber></Pagination>
</GetSellerListRequest>"""
        root = _call("GetSellerList", body)
        if root is None:
            break
        pages_el = _find(root, "TotalNumberOfPages")
        if pages_el is not None and pages_el.text:
            total_pages = int(pages_el.text)
        for item in (e for e in root.iter() if _strip_ns(e.tag) == "Item"):
            records.append(_item_to_record(item))
            if limit and len(records) >= limit:
                return records[:limit]
        page += 1
    return records


def _item_to_record(item) -> dict:
    def txt(name, default=""):
        el = _find(item, name)
        return el.text if el is not None and el.text else default

    specifics = {}
    for nv in (e for e in item.iter() if _strip_ns(e.tag) == "NameValueList"):
        name = _find(nv, "Name")
        val = _find(nv, "Value")
        if name is not None and name.text:
            specifics[name.text] = val.text if val is not None and val.text else ""

    images = [e.text for e in item.iter() if _strip_ns(e.tag) == "PictureURL" and e.text]

    return {
        "ebay_item_id": txt("ItemID"),
        "listing_url": txt("ViewItemURL"),
        "title": txt("Title"),
        "description": txt("Description"),
        "price": txt("CurrentPrice") or txt("StartPrice"),
        "quantity": int(txt("Quantity", "1") or 1),
        "sku": txt("SKU"),
        "condition": txt("ConditionDisplayName"),
        "brand": specifics.get("Brand", ""),
        "mpn": specifics.get("MPN", ""),
        "ebay_category": txt("CategoryName"),
        "images": images,
        "specifics": specifics,
    }


def _call(call_name: str, body: str, max_attempts: int = 3):
    headers = {
        "X-EBAY-API-COMPATIBILITY-LEVEL": _COMPAT,
        "X-EBAY-API-DEV-NAME": config.ebay_dev_id,
        "X-EBAY-API-APP-NAME": config.ebay_app_id,
        "X-EBAY-API-CERT-NAME": config.ebay_cert_id,
        "X-EBAY-API-CALL-NAME": call_name,
        "X-EBAY-API-SITEID": "0",
        "Content-Type": "text/xml",
    }
    for attempt in range(1, max_attempts + 1):
        try:
            resp = requests.post(_endpoint(), data=body.encode("utf-8"), headers=headers, timeout=45)
            if resp.status_code == 200:
                return ET.fromstring(resp.content)
            log.warning("eBay %s HTTP %s", call_name, resp.status_code)
        except (requests.RequestException, ET.ParseError) as exc:
            log.warning("eBay %s attempt %d failed: %s", call_name, attempt, exc)
        if attempt < max_attempts:
            time.sleep(2 ** attempt)
    log.error("eBay %s failed after %d attempts", call_name, max_attempts)
    return None
