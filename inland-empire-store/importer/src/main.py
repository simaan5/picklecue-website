"""CLI entrypoint for the standalone importer.

Examples:
  python -m src.main --source csv --file exports/ebay-active.csv --dry-run --limit 10
  python -m src.main --source csv --file exports/ebay-active.csv
  python -m src.main --source api --limit 50
  python -m src.main --source csv --file exports/ebay-active.csv --skip-images
  python -m src.main --source csv --file exports/ebay-active.csv --report-only
"""
from __future__ import annotations

import argparse
import sys

from . import csv_loader, ebay_client, image_downloader, mapper, woocommerce_client
from .config import config
from .logger import log
from .reporter import Reporter


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="anstelias-importer", description="eBay -> WooCommerce importer (free).")
    p.add_argument("--source", choices=["csv", "api"], required=True)
    p.add_argument("--file", help="CSV path (for --source csv)")
    p.add_argument("--dry-run", action="store_true", help="Validate without writing to WooCommerce")
    p.add_argument("--limit", type=int, default=0, help="Limit number of records (0 = all)")
    p.add_argument("--skip-images", action="store_true", help="Do not download/upload images")
    p.add_argument("--reprocess-images", action="store_true", help="Force re-download images")
    p.add_argument("--report-only", action="store_true", help="Load + categorize, write report, no upsert")
    return p.parse_args(argv)


def load_records(args: argparse.Namespace) -> list[dict]:
    if args.source == "csv":
        if not args.file:
            log.error("--file is required for --source csv")
            sys.exit(2)
        records = csv_loader.load_csv(args.file)
    else:
        records = ebay_client.fetch_active_listings(limit=args.limit)
    if args.limit:
        records = records[: args.limit]
    return records


def run(argv: list[str]) -> int:
    args = parse_args(argv)

    if not args.report_only and not args.dry_run and not config.has_wc():
        log.error("WooCommerce REST credentials missing. Set WC_CONSUMER_KEY/SECRET or use --dry-run.")
        return 2

    records = load_records(args)
    log.info("Loaded %d records from %s", len(records), args.source)

    reporter = Reporter()

    for record in records:
        try:
            if config.ollama_enabled and record.get("description"):
                record["description"] = mapper.enrich_description(record["description"])

            payload = mapper.to_wc_payload(record)

            if args.report_only:
                reporter.record(record, {"action": "report", "id": 0,
                                         "status": payload["meta_data"][3]["value"]})
                continue

            result = woocommerce_client.upsert(payload, dry_run=args.dry_run)

            # Images after the product exists (skip in dry-run).
            if (not args.dry_run and not args.skip_images and result.get("id")
                    and record.get("images")):
                media_ids = []
                for url in record["images"]:
                    local = image_downloader.download(url)
                    if local:
                        # OCR can fill missing specs from the photo (optional).
                        if config.ocr_enabled and not record.get("mpn"):
                            _ = image_downloader.ocr_text(local)
                        mid = woocommerce_client.upload_image(local)
                        if mid:
                            media_ids.append(mid)
                woocommerce_client.set_product_images(result["id"], media_ids)

            reporter.record(record, result)
        except Exception as exc:  # noqa: BLE001 - keep the batch going
            log.error("Row failed (%s): %s", record.get("title", ""), exc)
            reporter.record(record, {"action": "error", "id": 0, "status": "error", "error": str(exc)})

    path = reporter.write()
    log.info("%s", reporter.summary())
    log.info("Report written: %s", path)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(run(sys.argv[1:]))
