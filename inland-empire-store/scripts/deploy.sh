#!/usr/bin/env bash
# =============================================================================
# Deploy the store to a remote host over SSH/Tailscale.
# Run this from your workstation or any machine on the tailnet — NOT from
# inside the container build environment.
#
# Targets (override host with TARGET_HOST=...):
#   ./scripts/deploy.sh production   -> anstelias server (andrew@192.168.5.33)
#   ./scripts/deploy.sh staging      -> Pi #1 builder    (andrew@192.168.5.29)
#
# What it does:
#   1. rsync the project (excluding secrets, backups, node/venv) to the host
#   2. ensure .env exists on the host (you copy/edit it once, by hand)
#   3. docker compose build + up -d
#   4. run wp-install.sh (idempotent)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

ENVIRONMENT="${1:-staging}"
REMOTE_DIR="${REMOTE_DIR:-/opt/inland-empire-store}"

case "$ENVIRONMENT" in
  production) HOST="${TARGET_HOST:-andrew@192.168.5.33}"; COMPOSE="-f docker-compose.yml -f docker-compose.staging.yml" ;;
  staging)    HOST="${TARGET_HOST:-andrew@192.168.5.29}"; COMPOSE="-f docker-compose.yml" ;;
  *) echo "Usage: $0 [production|staging]"; exit 1 ;;
esac

echo ">> Deploying '${ENVIRONMENT}' to ${HOST}:${REMOTE_DIR}"

echo ">> Syncing files..."
rsync -az --delete \
  --exclude '.git' --exclude '.env' --exclude 'backups' \
  --exclude 'importer/.venv' --exclude '**/__pycache__' \
  --exclude 'wp-content/uploads' \
  ./ "${HOST}:${REMOTE_DIR}/"

echo ">> Checking remote .env..."
ssh "${HOST}" "test -f ${REMOTE_DIR}/.env" || {
  echo "   No .env on remote. Copy and edit it once:"
  echo "   scp .env ${HOST}:${REMOTE_DIR}/.env   # then edit secrets on the host"
  exit 1
}

echo ">> Building + starting containers on remote..."
# shellcheck disable=SC2029
ssh "${HOST}" "cd ${REMOTE_DIR} && docker compose ${COMPOSE} build && docker compose ${COMPOSE} up -d"

echo ">> Running idempotent WP install/upgrade..."
# shellcheck disable=SC2029
ssh "${HOST}" "cd ${REMOTE_DIR} && ./scripts/wp-install.sh"

echo ">> Deploy complete -> ${HOST}"
