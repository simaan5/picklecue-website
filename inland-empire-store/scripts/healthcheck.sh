#!/usr/bin/env bash
# =============================================================================
# Health probe for the store stack. Exit 0 = healthy, non-zero = problem.
# Designed to be scraped by Pi #2 'watcher' (Uptime Kuma / Prometheus textfile).
#
# Usage:  ./scripts/healthcheck.sh
#         ./scripts/healthcheck.sh --prom > /var/lib/node_exporter/store.prom
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
set -a; source .env 2>/dev/null || true; set +a

FMT="${1:-text}"
fail=0

check() {  # name  command...
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    [[ "$FMT" == "--prom" ]] && echo "store_check{component=\"$name\"} 1" || echo "OK    $name"
  else
    [[ "$FMT" == "--prom" ]] && echo "store_check{component=\"$name\"} 0" || echo "FAIL  $name"
    fail=1
  fi
}

check db      docker compose exec -T db healthcheck.sh --connect
check redis   docker compose exec -T redis redis-cli ping
check php     docker compose exec -T wordpress php -v
check http    curl -fsS -o /dev/null "${SITE_URL:-http://localhost:8080}/?ie-health=1"

if [[ "$FMT" == "--prom" ]]; then
  echo "store_check{component=\"overall\"} $([[ $fail -eq 0 ]] && echo 1 || echo 0)"
fi

exit "$fail"
