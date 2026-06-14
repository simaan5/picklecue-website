# Inland Empire Electronics — Self-Hosted Store

A $0-software-cost, self-hosted **WordPress + WooCommerce** ecommerce system for
**Inland Empire Electronics** (public brand: *Anstelias Technology*; legal:
*ANSI Corporation dba Anstelias Technology*, 1302 Monte Vista Ave Suite 1,
Upland, CA 91786).

Goal: gradually move resale inventory off eBay fees while keeping full ownership.
eBay stays live during the transition. Reference store:
<https://www.ebay.com/str/inlandempireelectronics>

> This project is self-contained in this directory so it can be lifted into its
> own dedicated git repository at any time.

## What's inside

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | Local/single-host stack: MariaDB, Redis, WordPress (PHP 8.2), Nginx |
| `docker-compose.staging.yml` | Production overlay: HTTPS + Let's Encrypt |
| `wordpress/` | Custom WordPress image (Redis + imagick + WP-CLI) and PHP tuning |
| `nginx/` | Reverse proxy config (TLS-ready) |
| `scripts/` | install, deploy, backup, restore, healthcheck helpers |
| `wp-content/themes/anstelias-storefront/` | Custom lightweight WooCommerce theme |
| `wp-content/plugins/anstelias-store-tools/` | Store enhancements, seeders, order CSV export |
| `wp-content/plugins/anstelias-ebay-importer/` | eBay CSV + API importer with review queue |
| `importer/` | Standalone Python importer for heavy/offline imports |
| `docs/` | Setup, deployment, backup, eBay import, Pirate Ship, admin, launch |

## Fleet topology (Anstelias hardware)

This system is designed to run entirely on hardware you already own, over your
LAN / Tailscale tailnet — no paid hosting required.

| Host | Address | Role in this system |
|------|---------|---------------------|
| **Anstelias server** | `192.168.5.33` (`ssh anstelias`) | **Production** WooCommerce Docker stack |
| **Pi #1 `builder`** (8GB, Docker) | `192.168.5.29` | **Staging** stack · GitHub Actions runner · **Ollama (:8001)** = free local AI for description cleanup & category confidence |
| **Pi #2 `watcher`** (8GB) | `192.168.5.26` | Uptime Kuma (3001) pings store · Prometheus (9090)/Grafana (3000) scrape `healthcheck.sh --prom` |
| **Pi #3 `ops`** (2GB) | `192.168.5.30` | Standalone **Python importer**, eBay image intake, **Tesseract OCR** spec extraction, CSV pipeline |
| **Pi #4 `utility`** (2GB) | `192.168.5.23` | Pi-hole internal DNS (`store.anstelias.internal`) · Tailscale remote access |

The Ollama and Tesseract integrations are **optional** — the system runs fully
without them. See `docs/deployment.md` for the full topology and `docs/ebay-import.md`
for how Pi #3 feeds products into the store.

## Quick start (local development)

```bash
cp .env.example .env          # edit DB passwords, admin creds, SITE_URL
docker compose up -d          # build + start the stack
./scripts/wp-install.sh       # install WP + WooCommerce + free plugins, seed taxonomy
```

Then open <http://localhost:8080/wp-admin/>.

## Deploy to your hardware

From any tailnet machine (e.g. your laptop):

```bash
./scripts/deploy.sh staging      # -> Pi #1 builder (192.168.5.29)
./scripts/deploy.sh production    # -> Anstelias server (192.168.5.33)
```

(Copy `.env` to the host once, by hand, and edit secrets there. Secrets are
never committed or rsynced.)

## Budget guarantee

Everything here is free / open-source: WordPress, WooCommerce, official free
Stripe & PayPal gateways, Rank Math (free), Wordfence (free), Redis Object Cache,
WP Mail SMTP (free), Docker, Nginx, MariaDB, Redis, Let's Encrypt, WP-CLI, and
all custom code. Pirate Ship's free WooCommerce integration handles shipping
labels. The only money that ever changes hands is normal Stripe/PayPal
per-transaction processing fees on real orders.

See `docs/` for everything else.
