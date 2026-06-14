#!/usr/bin/env bash
# =============================================================================
# Timestamped backup of the store: database dump + wp-content/uploads tarball.
# Retains the last N backups (default 14).
#
# Usage:  ./scripts/backup.sh [retention_count]
# Cron (e.g. on Pi #1 builder, nightly 2am):
#   0 2 * * * cd /opt/inland-empire-store && ./scripts/backup.sh >> backups/backup.log 2>&1
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; source .env; set +a

RETENTION="${1:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="backups/${STAMP}"
mkdir -p "${DEST}"

echo ">> [${STAMP}] Backing up database '${MYSQL_DATABASE}'..."
docker compose exec -T db mysqldump \
  --single-transaction --quick --default-character-set=utf8mb4 \
  -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" \
  | gzip > "${DEST}/database.sql.gz"

echo ">> Backing up wp-content/uploads..."
# Stream uploads out of the named volume via a throwaway alpine container.
docker run --rm \
  -v "$(docker volume ls -q | grep -m1 wp_core || echo '')":/src:ro \
  -v "$(pwd)/${DEST}":/backup \
  alpine:3.20 \
  sh -c 'tar czf /backup/uploads.tar.gz -C /src wp-content/uploads 2>/dev/null || echo "   (no uploads yet)"'

# Record manifest
{
  echo "backup_stamp=${STAMP}"
  echo "site_url=${SITE_URL}"
  echo "db=${MYSQL_DATABASE}"
  date -u +"created_utc=%Y-%m-%dT%H:%M:%SZ"
} > "${DEST}/manifest.txt"

echo ">> Pruning old backups (keeping last ${RETENTION})..."
ls -1dt backups/*/ 2>/dev/null | tail -n +"$((RETENTION + 1))" | xargs -r rm -rf

echo ">> Backup complete: ${DEST}"
du -sh "${DEST}"
