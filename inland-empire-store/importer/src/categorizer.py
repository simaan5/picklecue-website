"""Rule-based categorization with confidence scoring (mirrors the PHP logic)."""
from __future__ import annotations

from typing import Optional

from .utils import CATEGORY_RULES


def categorize(title: str, brand: str = "", extra: str = "") -> dict:
    """Return {top, sub, path, confidence} for a listing.

    Falls back to Miscellaneous with low confidence so unmatched items are
    flagged for manual review rather than silently mis-filed.
    """
    haystack = f"{title} {brand} {extra}".lower()
    best: Optional[tuple] = None
    for keywords, path, score in CATEGORY_RULES:
        if any(kw in haystack for kw in keywords):
            if best is None or score > best[2]:
                best = (keywords, path, score)

    if best:
        top, sub = best[1]
        return {
            "top": top,
            "sub": sub,
            "path": f"{top} > {sub}" if sub else top,
            "confidence": best[2],
        }
    return {"top": "Miscellaneous", "sub": None, "path": "Miscellaneous", "confidence": 0.1}


def needs_review(confidence: float, threshold: float = 0.5) -> bool:
    return confidence < threshold
