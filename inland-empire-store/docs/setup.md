# Setup

Local development on any machine with Docker (your laptop, the Anstelias server,
or Pi #1 `builder`).

## 1. Prerequisites

- Docker + Docker Compose v2 (`docker compose version`)
- ~3 GB free disk for images + database

## 2. Configure environment

```bash
cd inland-empire-store
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Notes |
|----------|-------|
| `SITE_URL` | `http://localhost:8080` for local; your domain in production |
| `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | strong, unique |
| `WP_ADMIN_USER`, `WP_ADMIN_PASSWORD`, `WP_ADMIN_EMAIL` | your admin login |

Secrets are never committed — `.env` is gitignored.

## 3. Start the stack

```bash
docker compose up -d         # builds the WordPress image first run
docker compose ps            # all services should become healthy
```

Services: `db` (MariaDB 11), `redis`, `wordpress` (PHP 8.2-FPM), `nginx`.

## 4. Install WordPress + WooCommerce + plugins

```bash
./scripts/wp-install.sh
```

This is idempotent and:

- installs WordPress core (if needed)
- installs/activates free plugins: WooCommerce, Stripe gateway, PayPal Payments,
  Redis Object Cache, Rank Math SEO, Wordfence, WP Mail SMTP
- activates our custom theme + two custom plugins
- enables the Redis object cache
- sets the store address (Upland, CA), currency, units, HPOS
- seeds categories, attributes, shipping classes, and core pages

## 5. Open the site

- Storefront: <http://localhost:8080>
- Admin: <http://localhost:8080/wp-admin/>

## 6. Environment variables reference

See `.env.example` for the full annotated list (DB, Redis, PHP tuning, ports,
eBay API, WooCommerce REST API).

## 7. WP-CLI

Run any WP-CLI command through the helper container:

```bash
docker compose run --rm wpcli wp plugin list
docker compose run --rm wpcli wp eval-file wp-content/plugins/anstelias-store-tools/includes/cli-seed.php
```

## Troubleshooting

- **White screen / 502**: `docker compose logs wordpress nginx`.
- **DB connection errors**: ensure `db` is healthy (`docker compose ps`); the
  install script waits for it automatically.
- **Redis not connecting**: confirm `WP_REDIS_HOST=redis` (set automatically) and
  run `docker compose run --rm wpcli wp redis status`.
- **Permalinks 404**: `docker compose run --rm wpcli wp rewrite flush --hard`.
