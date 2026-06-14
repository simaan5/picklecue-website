"""Download eBay images locally (cache) + optional Tesseract OCR for specs."""
from __future__ import annotations

import hashlib
import os
import re

import requests

from .config import config
from .logger import log


def upgrade_ebay_url(url: str) -> str:
    """Request a larger eBay image variant (s-l1600)."""
    return re.sub(r"s-l\d+\.", "s-l1600.", url)


def download(url: str) -> str | None:
    """Download an image into the cache dir; return local path or None.

    De-duplicates by URL hash so re-runs do not re-download.
    """
    url = upgrade_ebay_url(url)
    os.makedirs(config.image_cache_dir, exist_ok=True)
    digest = hashlib.md5(url.encode()).hexdigest()
    ext = os.path.splitext(url.split("?")[0])[1] or ".jpg"
    path = os.path.join(config.image_cache_dir, f"{digest}{ext}")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        if not resp.headers.get("Content-Type", "").startswith("image/"):
            log.warning("Not an image: %s", url)
            return None
        with open(path, "wb") as fh:
            fh.write(resp.content)
        return path
    except requests.RequestException as exc:
        log.warning("Image download failed (%s): %s", url, exc)
        return None


def ocr_text(image_path: str) -> str:
    """Extract text from an image with Tesseract (Pi #3). Returns '' if disabled."""
    if not config.ocr_enabled:
        return ""
    try:
        import pytesseract
        from PIL import Image

        return pytesseract.image_to_string(Image.open(image_path)).strip()
    except Exception as exc:  # pragma: no cover - optional dependency
        log.warning("OCR failed: %s", exc)
        return ""
