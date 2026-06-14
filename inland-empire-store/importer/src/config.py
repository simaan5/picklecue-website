"""Configuration loaded from environment / .env. No hardcoded secrets."""
from __future__ import annotations

import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv optional at runtime
    pass


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Config:
    wc_store_url: str = os.getenv("WC_STORE_URL", "http://localhost:8080").rstrip("/")
    wc_consumer_key: str = os.getenv("WC_CONSUMER_KEY", "")
    wc_consumer_secret: str = os.getenv("WC_CONSUMER_SECRET", "")
    wc_verify_ssl: bool = _bool("WC_VERIFY_SSL", True)

    ebay_app_id: str = os.getenv("EBAY_APP_ID", "")
    ebay_cert_id: str = os.getenv("EBAY_CERT_ID", "")
    ebay_dev_id: str = os.getenv("EBAY_DEV_ID", "")
    ebay_user_token: str = os.getenv("EBAY_USER_TOKEN", "")
    ebay_environment: str = os.getenv("EBAY_ENVIRONMENT", "production")

    ollama_enabled: bool = _bool("OLLAMA_ENABLED", False)
    ollama_url: str = os.getenv("OLLAMA_URL", "http://localhost:8001").rstrip("/")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.2")

    ocr_enabled: bool = _bool("OCR_ENABLED", False)

    image_cache_dir: str = os.getenv("IMAGE_CACHE_DIR", "cache/images")
    report_dir: str = os.getenv("REPORT_DIR", "reports")
    default_status: str = os.getenv("DEFAULT_STATUS", "draft")
    price_markup_percent: float = float(os.getenv("PRICE_MARKUP_PERCENT", "0") or 0)

    def has_wc(self) -> bool:
        return bool(self.wc_consumer_key and self.wc_consumer_secret)

    def has_ebay(self) -> bool:
        return bool(self.ebay_app_id and self.ebay_user_token)


config = Config()
