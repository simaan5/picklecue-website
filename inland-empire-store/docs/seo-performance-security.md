# SEO, Performance & Security

## SEO

Implemented in the theme (`inc/seo.php`) and works with or without Rank Math:

- **Meta title template**: `{Brand} {Model} {MPN/SKU} - {Condition} | Anstelias Technology`
- **Meta description template**: `Shop {Brand} {Model} {category} from Anstelias
  Technology. Condition: {Condition}. Ships from Upland, CA. Secure checkout with
  PayPal or card.`
- **Canonical URLs** on product pages.
- **Image alt text** defaults to the product title when empty.
- Clean product/category slugs (permalinks set to `/%postname%/`).

With **Rank Math (free)** active, our code defers to it for meta + schema and
provides the templates as guidance. Rank Math also gives you:

- Product schema (Product/Offer JSON-LD) → rich results.
- XML sitemap at `/sitemap_index.xml`.
- Breadcrumbs (enable in Rank Math → General → Breadcrumbs; the theme outputs the
  WooCommerce breadcrumb otherwise).

### Setup steps
1. Rank Math → Setup Wizard → choose **WooCommerce** module.
2. Set the title separator and the brand name (Anstelias Technology).
3. Titles & Meta → Products → set templates to match the above.
4. Add category descriptions for your top categories (helps ranking + UX).
5. Avoid duplicate product pages: imported items stay drafts until reviewed, and
   duplicate detection prevents multiple posts for the same item.

## Performance

- **Redis object cache** (Redis Object Cache plugin) — enabled by `wp-install.sh`.
- **OPcache + JIT** tuned in `wordpress/php.ini`.
- **Nginx gzip** + long-lived cache headers for static assets (`nginx/`).
- **Lightweight theme** — hand-written CSS, ~one small JS file, no page builder,
  no jQuery dependency in our code, lazy-loaded images (WP core `loading="lazy"`).
- **Product images** stored locally and served by Nginx.
- For a full-page cache, add the free **Cache Enabler** or **W3 Total Cache**
  (free) if needed; Redis object cache already covers most dynamic load.

### Core Web Vitals tips
- Keep hero text-based (done) — no large hero image to block LCP.
- Compress product photos (the importer keeps originals; consider the free
  EWWW/Smush plugin if pages get heavy).
- Test with PageSpeed Insights after go-live; revisit per page type.

## Security

Built into the custom code:

- **Nonces** on every admin-post action; **capability checks**
  (`manage_woocommerce`) on all importer/store-tools admin actions and pages.
- **Input sanitization** (`sanitize_text_field`, `esc_url_raw`, `wp_kses_post`)
  and **output escaping** (`esc_html`, `esc_attr`, `esc_url`) throughout.
- **Prepared SQL** for the one direct query (duplicate lookup).
- **Validated uploads**: CSVs checked by extension/type and stored in a
  `Deny from all` directory; downloaded images verified as real images before
  import.
- **No secrets in the repo**: credentials live in `.env`/WP options; the loggers
  redact anything resembling a token/secret.
- **`DISALLOW_FILE_EDIT`** and disabled auto-updates set in the container config.

Recommended free hardening:

- **Wordfence (free)** — firewall + login protection (installed by default).
- Strong admin passwords + limit admin accounts.
- Keep WordPress/WooCommerce/plugins updated (test on staging first).
- Put the site behind a Cloudflare Tunnel to avoid exposing ports.
- Restrict `/wp-admin` and `/wp-login.php` to your tailnet if only staff log in.
