# Anstelias Store Tools

Store-wide enhancements for Inland Empire Electronics that are **not** tied to
eBay. Shared utility code here is also consumed by the eBay Importer plugin.

## Features

- **Condition badges** — colored New/Used/Open-box/Refurb/Parts + Tested-status badges on cards and product pages.
- **Summary grid** — compact key-spec block above add-to-cart (SKU, Brand, Model, Condition, CPU, RAM, Storage, Form Factor).
- **Specifications tab** — full attribute table built from the 16 used-electronics attributes.
- **Shipping & warranty notices** — editable in *WooCommerce → Store Tools*.
- **Admin-only eBay source link** — shown on product pages only to users with `manage_woocommerce`.
- **Unshipped-order CSV export** — the free Pirate Ship fallback; can mark orders as exported.
- **Shared library** (`class-utils.php`) — single source of truth for meta keys, import statuses, the attribute list, the category tree, and the rule-based categorization map.
- **Seeder** (`includes/cli-seed.php`) — idempotently creates categories, attributes, shipping classes, and core pages.

## Seeding

```bash
docker compose run --rm wpcli \
  wp eval-file wp-content/plugins/anstelias-store-tools/includes/cli-seed.php
```

## Security

Nonces on all admin-post actions, `manage_woocommerce` capability checks,
input sanitized, output escaped, no secrets stored or logged.
