# Backup & Restore

Free, script-based backups — no paid backup plugin.

## What gets backed up

- **Database** — full `mysqldump` of the WooCommerce database (gzipped).
- **Uploads** — `wp-content/uploads` (product images, imports) as a tarball.

Each run creates a timestamped folder under `backups/YYYYMMDD-HHMMSS/` with a
`manifest.txt`.

## Back up

```bash
./scripts/backup.sh            # keeps the last 14 backups
./scripts/backup.sh 30          # keep the last 30 instead
```

### Schedule nightly (cron on the host)

```cron
0 2 * * * cd /opt/inland-empire-store && ./scripts/backup.sh >> backups/backup.log 2>&1
```

### Off-host copies (recommended)

Push backups to another fleet member over Tailscale, e.g. Pi #3 `ops`:

```cron
30 2 * * * rsync -az /opt/inland-empire-store/backups/ andrew@192.168.5.30:/srv/store-backups/
```

## Restore

> Destructive: overwrites the current DB + uploads. Requires typing `RESTORE`.

```bash
./scripts/restore.sh backups/20260614-020000
```

The script restores the database, restores uploads, and flushes caches.

## Test your backups (do this!)

1. Take a backup on production.
2. On staging (Pi #1), `docker compose up -d`, then
   `./scripts/restore.sh <copied-backup-folder>`.
3. Confirm products, orders, and media appear correctly.

A backup you have never restored is not a backup.

## Disaster recovery outline

1. Provision Docker on a fresh host.
2. `git clone` the repo, `cp .env` (from your password manager), `docker compose up -d`.
3. `./scripts/wp-install.sh` then `./scripts/restore.sh <latest-backup>`.
4. Re-issue TLS (Cloudflare Tunnel or certbot).
