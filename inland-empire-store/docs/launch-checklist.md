# Launch Checklist

Work top to bottom. Don't go live until every box is checked on production.

## Infrastructure
- [ ] `docker compose ps` — all services healthy on the production host
- [ ] `./scripts/healthcheck.sh` exits 0
- [ ] TLS works (Cloudflare Tunnel or Let's Encrypt); HTTP→HTTPS redirect on
- [ ] `SITE_URL` matches the real domain; permalinks flushed
- [ ] Redis object cache enabled (`wp redis status`)

## Store foundation
- [ ] WooCommerce pages exist: Shop, Cart, Checkout, My Account
- [ ] Content pages exist: About, Contact, Shipping & Returns, Privacy, Terms
- [ ] Categories, attributes, and shipping classes seeded
- [ ] Store address = 1302 Monte Vista Ave Suite 1, Upland, CA 91786; USD; lbs/in

## Payments (start in test/sandbox, then switch to live)
- [ ] Stripe test payment succeeds
- [ ] PayPal sandbox payment succeeds
- [ ] Switch Stripe + PayPal to **live** keys
- [ ] One real low-value live order end-to-end, then refund it

## Email
- [ ] WP Mail SMTP configured (real mailbox/relay)
- [ ] New-order admin email received
- [ ] Customer "processing" + "completed" emails received

## Import
- [ ] Import 1 product from CSV (dry run, then real)
- [ ] Import 10 products from CSV
- [ ] Re-run the same import → **no duplicates**
- [ ] Images imported locally (Media Library, not eBay URLs)
- [ ] Categories auto-assigned; low-confidence items flagged
- [ ] Imported products are drafts until published
- [ ] Publish a product from the Review Queue → visible on storefront

## Storefront QA
- [ ] Homepage: hero, search, category grid, new arrivals, trust badges
- [ ] Product page: gallery, price, stock, SKU, badges, summary grid, specs tab
- [ ] Category/shop page: grid, sidebar, sorting, condition badges
- [ ] Search returns products
- [ ] Add to cart → cart → checkout works
- [ ] Mobile layout looks right (≤390px width)

## Shipping
- [ ] Shipping classes assigned + weights/dimensions on products
- [ ] Flat-rate (or pickup) shows correct cost at checkout
- [ ] Order CSV export downloads and opens in Pirate Ship
- [ ] Pirate Ship WooCommerce connection pulls a test order

## SEO
- [ ] Product/category slugs are clean
- [ ] XML sitemap reachable (`/sitemap_index.xml` via Rank Math)
- [ ] Product meta title/description look right
- [ ] Image alt text present (defaults to product title)

## Security
- [ ] Wordfence active; admin login uses a strong password
- [ ] `DISALLOW_FILE_EDIT` on (set in compose)
- [ ] Importer pages are admin-only (try as a logged-out user → blocked)
- [ ] No secrets in the repo (`git grep` for keys returns nothing)

## Backups
- [ ] `./scripts/backup.sh` produces a timestamped backup
- [ ] Restore tested on staging from that backup
- [ ] Nightly backup cron installed; off-host copy configured

## Monitoring
- [ ] Uptime Kuma monitor on `/?ie-health=1`
- [ ] Prometheus scraping `healthcheck.sh --prom`
