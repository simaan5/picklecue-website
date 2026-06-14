# eBay Import

Two free paths. **CSV works with zero credentials** — start there.

## Path A — CSV (recommended to start)

### 1. Export from eBay

- eBay → **Seller Hub** → **Listings** → **Active** → **Download** → all active listings, OR
- Seller Hub → **Reports** → **Listings** → **Active listings report** → Download.

Save the `.csv`.

### 2. Import in WordPress

WP Admin → **eBay Importer → Import from CSV**:

1. Upload the CSV.
2. Leave **Dry run** checked and set **Limit = 10** for the first pass.
3. Click **Upload & import** → read the summary (created / needs-review / errors).
4. Uncheck Dry run, raise/clear the limit, import for real.
5. Review and publish in **eBay Importer → Review Queue**.

Recognized headers (case-insensitive) are listed on the import page; unknown
columns are preserved as item specifics.

### 3. Or import headlessly (cron on Pi #3)

```bash
docker compose run --rm wpcli wp anstelias import csv \
  --file=/var/www/html/wp-content/uploads/anstelias-imports/ebay-active.csv --dry-run --limit=10
```

Or use the **standalone Python importer** (see `importer/README.md`) which adds
optional Tesseract OCR and local Ollama description cleanup.

## Path B — eBay API (richer data)

Gives full item specifics (Brand, MPN, RAM, CPU…) and **all** photos.

### 1. Get free credentials

- Create an app at <https://developer.ebay.com/> → Production keyset.
- You need: **App ID (Client ID)**, **Cert ID (Client Secret)**, **Dev ID**, and a **User token**.

### 2. Configure

WP Admin → **eBay Importer → Settings** → paste credentials → Save.
The user token is stored securely and never displayed in full or logged.

### 3. Import

WP Admin → **eBay Importer → Import from eBay API** → **Test connection** →
then dry-run with a small limit → real import → Review Queue.

## Duplicate prevention (idempotent)

Re-running never duplicates. Match priority:

1. `_ebay_item_id`
2. SKU / custom label
3. normalized title
4. brand + MPN

Existing products are **updated** in place.

## Images

- Downloaded into the Media Library (never hotlinked from eBay).
- Thumbnail URLs upgraded to full resolution (`s-l1600`).
- De-duplicated by source-URL hash (no repeat downloads on re-runs).
- First image = featured; the rest = gallery.

## Statuses & review

Every import lands as a **hidden draft**. Items missing price/images/condition,
or with low category confidence (<50%), are flagged `needs_review`. Publish from
the Review Queue (bulk actions: publish / ready / needs-review / change category /
archive / delete draft).

## Avoiding overselling during transition

Keep eBay live. Because imported items start as drafts and you publish
deliberately, nothing sells on the new site until you choose. When a unique item
sells on one channel, set its stock to 0 (or archive it) on the other. The
`sync price/quantity` action and re-imports help keep counts aligned.

## Troubleshooting

- **"No data rows found"** — the CSV isn't an active-listings export, or headers
  weren't detected. Open it and confirm a header row with `Title`/`Item number`.
- **API Ack=Failure** — re-check App ID/token and that the token isn't expired
  (eBay user tokens expire; regenerate in the developer portal).
- **Images missing** — some eBay CDN URLs rate-limit; re-run with
  `--reprocess-images` (Python) or just re-import (WP dedups the rest).
