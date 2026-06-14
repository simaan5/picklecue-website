#!/usr/bin/env bash
# =============================================================================
# Restore the store from a backup folder created by backup.sh.
# DESTRUCTIVE: overwrites the current database and uploads. Asks to confirm.
#
# Usage:  ./scripts/restore.sh backups/20260614-020000
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; source .env; set +a

SRC="${1:-}"
if [[ -z "${SRC}" || ! -d "${SRC}" ]]; then
  echo "Usage: $0 <backup-folder>" >&2
  echo "Available backups:" >&2
  ls -1dt backups/*/ 2>/dev/null || echo "  (none)" >&2
  exit 1
fi

echo "!! This will OVERWRITE the current database '${MYSQL_DATABASE}' and uploads."
read -r -p "   Type 'RESTORE' to continue: " confirm
[[ "${confirm}" == "RESTORE" ]] || { echo "Aborted."; exit 1; }

if [[ -f "${SRC}/database.sql.gz" ]]; then
  echo ">> Restoring database..."
  gunzip -c "${SRC}/database.sql.gz" | docker compose exec -T db \
    mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}"
  echo "   Database restored."
else
  echo "   WARN: no database.sql.gz in ${SRC}"
fi

if [[ -f "${SRC}/uploads.tar.gz" ]]; then
  echo ">> Restoring uploads..."
  docker run --rm \
    -v "$(docker volume ls -q | grep -m1 wp_core)":/dest \
    -v "$(pwd)/${SRC}":/backup:ro \
    alpine:3.20 \
    sh -c 'cd /dest && tar xzf /backup/uploads.tar.gz'
  echo "   Uploads restored."
else
  echo "   WARN: no uploads.tar.gz in ${SRC}"
fi

echo ">> Flushing caches..."
docker compose run --rm wpcli wp cache flush || true
docker compose run --rm wpcli wp redis flush || true

echo ">> Restore complete from ${SRC}"
