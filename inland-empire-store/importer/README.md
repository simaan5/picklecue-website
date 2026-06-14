# Standalone Importer (Python)

A free, dependency-light eBay → WooCommerce importer for **heavy / offline**
imports. Designed to run on **Pi #3 `ops`** (which already has the eBay image
intake + Tesseract OCR + CSV pipeline) and push to the store's WooCommerce REST
API over Tailscale.

The in-WordPress plugin (`anstelias-ebay-importer`) is enough for everyday use;
this service is for large batches, scheduled runs, and OCR-assisted enrichment.

## Setup

```bash
cd importer
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # set WC_STORE_URL + REST keys (and optional eBay/Ollama/OCR)
```

Create WooCommerce REST keys in: WP Admin → WooCommerce → Settings → Advanced →
REST API (Read/Write).

## Usage

```bash
# Dry run from a CSV (no writes)
python -m src.main --source csv --file exports/ebay-active.csv --dry-run --limit 10

# Real import from CSV
python -m src.main --source csv --file exports/ebay-active.csv

# Import from the eBay API (needs EBAY_* creds)
python -m src.main --source api --limit 50

# Faster runs / re-processing
python -m src.main --source csv --file exports/ebay-active.csv --skip-images
python -m src.main --source csv --file exports/ebay-active.csv --reprocess-images

# Categorize + report only, no upsert
python -m src.main --source csv --file exports/ebay-active.csv --report-only
```

## Guarantees

- **Idempotent** — duplicate detection by eBay item id (product meta) then SKU.
- **Draft by default** — every product is created hidden/draft pending review.
- **Local images** — downloaded to a cache, de-duplicated by URL hash, uploaded
  to the Media Library, attached as featured + gallery.
- **Category confidence** — low-confidence items are flagged `needs_review`.
- **No hardcoded secrets** — everything comes from `.env` / environment.
- **Reports** — each run writes `reports/report-<ts>.csv` and `.json`.

## Optional free AI / OCR (off by default)

- `OLLAMA_ENABLED=true` → cleans descriptions via Pi #1's local Ollama (`:8001`). No cloud, no cost.
- `OCR_ENABLED=true` → Tesseract reads model/serial text off photos to fill missing specifics on Pi #3.

## Tests

```bash
cd importer && python -m pytest -q
```

The keyword/category rules and duplicate-key logic are mirrored from the PHP
plugin's `Utils` class so both importers behave identically.
