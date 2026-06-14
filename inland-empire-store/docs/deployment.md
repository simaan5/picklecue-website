# Deployment

This system is built to run entirely on **your own hardware** — no paid hosting.

## Recommended topology (Anstelias fleet)

| Host | Address (LAN / Tailscale) | Role |
|------|---------------------------|------|
| **Anstelias server** | `192.168.5.33` / `ssh anstelias` | **Production** store (Docker stack) |
| **Pi #1 `builder`** (8GB) | `192.168.5.29` / `100.110.40.108` | **Staging** stack · GitHub Actions runner · Ollama AI (`:8001`) |
| **Pi #2 `watcher`** (8GB) | `192.168.5.26` / `100.85.38.3` | Uptime Kuma, Prometheus, Grafana |
| **Pi #3 `ops`** (2GB) | `192.168.5.30` / `100.103.12.2` | Python importer, eBay image intake, Tesseract OCR |
| **Pi #4 `utility`** (2GB) | `192.168.5.23` / `100.112.51.11` | Pi-hole DNS, Tailscale |

> Production on the x86 Anstelias server is recommended for performance; Pi #1
> `builder` makes an ideal staging mirror (it already runs Docker). All images
> are multi-arch, so either works.

## One-time per host

1. Install Docker + Compose (Pi #1 already has Docker).
2. Create the deploy directory and copy `.env`:
   ```bash
   ssh anstelias 'sudo mkdir -p /opt/inland-empire-store && sudo chown $USER /opt/inland-empire-store'
   scp .env anstelias:/opt/inland-empire-store/.env   # then edit secrets ON the host
   ```

## Deploy (run from any tailnet machine, e.g. your laptop)

```bash
./scripts/deploy.sh staging      # -> Pi #1 builder (192.168.5.29)
./scripts/deploy.sh production    # -> Anstelias server (192.168.5.33)
```

`deploy.sh` rsyncs the project (excluding secrets/backups/uploads), then runs
`docker compose build && up -d` and the idempotent `wp-install.sh` on the host.

> Note: deployment is initiated from a machine on your LAN/Tailscale network.
> A cloud build environment cannot reach `192.168.5.x` or your tailnet.

## DNS

Use Pi #4 `utility` (Pi-hole) for an internal hostname:

```
# Pi-hole -> Local DNS -> DNS Records
store.anstelias.internal   ->   192.168.5.33
```

For the public domain, point an `A`/`AAAA` record (or a Cloudflare Tunnel) at the
Anstelias server's public address. Set `SITE_URL`/`SITE_DOMAIN` in `.env`
accordingly and re-run `wp-install.sh` (or `wp option update home/siteurl`).

## TLS

Two free options:

1. **Cloudflare Tunnel** (simplest, no open ports): run `cloudflared` on the host,
   point it at `http://localhost:${HTTP_PORT}`. TLS terminates at Cloudflare.
2. **Let's Encrypt** (built in): use the staging overlay and issue a cert:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d
   docker compose -f docker-compose.yml -f docker-compose.staging.yml run --rm certbot \
     certonly --webroot -w /var/www/certbot -d your-domain.com \
     --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email
   ```
   Then uncomment the HTTPS server block in `nginx/conf.d/site.conf` (set your
   domain) and `docker compose ... restart nginx`. Renewal runs automatically.

Local development runs over plain HTTP — no TLS needed.

## Monitoring (Pi #2 `watcher`)

- **Uptime Kuma**: add an HTTP(s) monitor for `http://192.168.5.33:8080/?ie-health=1`
  (returns `ok`).
- **Prometheus**: scrape a node-exporter textfile produced by cron:
  ```bash
  */1 * * * * cd /opt/inland-empire-store && ./scripts/healthcheck.sh --prom > /var/lib/node_exporter/store.prom
  ```

## CI (Pi #1 GitHub Actions runner)

A `session-start`/CI workflow can run `php -l` on the plugins/theme and
`pytest` on the importer before deploys. Keep it free by using your self-hosted
runner on Pi #1.

## Updating

```bash
git pull
./scripts/deploy.sh production
```

WordPress core/plugin updates: `docker compose run --rm wpcli wp plugin update --all`
(test on staging first; take a backup — see `backup-restore.md`).
