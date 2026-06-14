# Anstelias eBay Importer

Import, normalize, auto-categorize, review, and publish eBay listings into
WooCommerce using only free methods. CSV-first; the official eBay Trading API
is optional.

## Admin pages (WP Admin → eBay Importer)

| Page | What it does |
|------|--------------|
| Review Queue | Triage imported drafts; bulk publish/ready/needs-review/change-category/archive/delete |
| Import from CSV | Upload a Seller Hub active-listings CSV; dry-run, limit, skip-images options |
| Import from eBay API | Test connection + fetch active listings (needs API creds) |
| Category Mapping | Override automatic categorization by exact eBay category name |
| Import Logs | Recent log entries (secrets redacted) |
| Reports | Per-run CSV reports (created/updated/needs-review/errors) |
| Settings | eBay API credentials + price markup |

## Key guarantees

- **Idempotent.** Re-running never duplicates. Duplicate detection order:
  `_ebay_item_id` → SKU → normalized title → brand+MPN.
- **Draft by default.** Every import lands as a hidden draft pending review.
- **Local images.** eBay photos are downloaded into the Media Library (never
  hotlinked), de-duplicated by source-URL hash; first image = featured, rest =
  gallery. Thumbnail URLs are upgraded to `s-l1600` for full resolution.
- **Auto-categorize with confidence.** Keyword rules score each product; low
  confidence (<50%) flags the item for review.
- **Secure.** Nonces + `manage_woocommerce` capability on every action,
  validated uploads stored in a deny-all directory, prepared SQL, escaped output,
  credentials never printed or logged.

## WP-CLI (great for cron on Pi #1 / Pi #3)

```bash
wp anstelias import csv --file=/path/ebay-active.csv --dry-run --limit=10
wp anstelias import csv --file=/path/ebay-active.csv
wp anstelias import api --limit=50
```

## Meta written to each product

`_ebay_item_id`, `_ebay_listing_url`, `_ebay_raw_payload_hash`,
`_anstelias_import_source`, `_anstelias_import_status`, `_anstelias_imported_at`,
`_anstelias_last_synced_at`, `_anstelias_sync_status`.
