# Admin Guide

Day-to-day operation for you or an assistant. Everything below is in WP Admin.

## Adding a product manually

**Products → Add New**:

1. Title, description.
2. Product data → **Simple product** → set **Regular price**, **SKU**,
   **Manage stock** + quantity.
3. **Attributes** tab → add custom attributes (Brand, Model, MPN, Condition,
   Tested Status, CPU, RAM, Storage Capacity, Form Factor, etc.). These render as
   the condition badge, summary grid, and Specifications tab automatically.
4. Set **Product category** and **Shipping class** + weight/dimensions.
5. Featured image + gallery images.
6. Publish.

## Reviewing imports

**eBay Importer → Review Queue**:

- Filter by status (All / Needs review / Ready to publish / Published / …).
- Each row shows thumbnail, title, SKU, price, stock, condition, mapped category,
  confidence flag, missing-field flags, and an admin-only eBay source link.
- Fix anything flagged by clicking the title to edit the product.

### Bulk actions

Select rows → choose an action → **Apply**:

- **Publish selected** — makes them live + visible.
- **Mark ready to publish** / **Mark needs review** — triage.
- **Change category** — pick a category to apply.
- **Archive** — hide + set draft.
- **Delete draft (permanent)** — only deletes drafts; requires the confirm
  checkbox (published products are never deleted).

## Publishing

Publish from the Review Queue (bulk **Publish selected**) or from the product
editor (**Publish** button). Imported items are hidden drafts until you do this.

## Editing categories

- Per product: in the editor, **Product categories** box.
- In bulk: Review Queue → **Change category**.
- Map eBay categories to yours: **eBay Importer → Category Mapping** (overrides
  automatic keyword categorization).

## Processing orders

**WooCommerce → Orders**:

1. New paid order arrives as **Processing**.
2. Fulfill via Pirate Ship (see `pirateship-workflow.md`).
3. Mark **Completed** (or let Pirate Ship update it) — triggers the customer's
   completed/tracking email.

## Exporting orders (Pirate Ship fallback)

**WooCommerce → Store Tools → Download unshipped orders (CSV)**. Use
**Download & mark as exported** to avoid re-handling.

## Syncing inventory during the eBay transition

- Re-run a CSV/API import to refresh prices/quantities (idempotent — updates in
  place). The **sync price/quantity** path updates only price + stock.
- When a one-of-a-kind item sells on either channel, set its stock to 0 (or
  archive it) on the other to prevent overselling.

## Editing storefront notices

**WooCommerce → Store Tools** → edit the shipping and warranty/returns notices
shown on every product page.

## Useful WP-CLI

```bash
docker compose run --rm wpcli wp anstelias import csv --file=<path> --dry-run --limit=10
docker compose run --rm wpcli wp wc product list --user=<admin>      # list products
docker compose run --rm wpcli wp redis status
```
