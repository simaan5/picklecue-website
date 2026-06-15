#!/usr/bin/env bash
# =============================================================================
# fleetctl — one-command remote control of the Anstelias Pi fleet + server.
#
# RUN THIS FROM YOUR LOCAL COMPUTER (it must be on the LAN or Tailscale tailnet).
# It does NOT work from the cloud build sandbox, which cannot reach 192.168.5.x
# or the tailnet.
#
# Requires: ssh (and rsync for deploys). Tailscale or LAN connectivity.
#
# Quick start:
#   ./scripts/fleetctl.sh ping                 # who's up
#   ./scripts/fleetctl.sh status               # uptime + docker on every host
#   ./scripts/fleetctl.sh ssh builder          # shell into Pi #1
#   ./scripts/fleetctl.sh run all -- 'uptime'  # run a command everywhere
#   ./scripts/fleetctl.sh deploy production     # deploy the store (-> anstelias)
#   ./scripts/fleetctl.sh store ps              # docker compose ps on store host
#   ./scripts/fleetctl.sh store logs            # tail store logs
#   ./scripts/fleetctl.sh health                # hit the store health endpoint
#   ./scripts/fleetctl.sh backup                # run backup.sh on the store host
#   ./scripts/fleetctl.sh import ./ebay.csv     # push a CSV + dry-run import
#
# Network selection (LAN by default; Tailscale IPs if you're remote):
#   FLEET_NET=ts ./scripts/fleetctl.sh status
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_USER="${SSH_USER:-andrew}"
REMOTE_DIR="${REMOTE_DIR:-/opt/inland-empire-store}"
FLEET_NET="${FLEET_NET:-lan}"   # lan | ts

# host alias -> "LAN_IP TS_IP description"
host_record() {
  case "$1" in
    builder)   echo "192.168.5.29 100.110.40.108 Pi #1 builder (8GB, Docker, Ollama, CI runner)" ;;
    watcher)   echo "192.168.5.26 100.85.38.3   Pi #2 watcher (Uptime Kuma, Grafana, Prometheus)" ;;
    ops)       echo "192.168.5.30 100.103.12.2  Pi #3 ops (importer, OCR, image intake)" ;;
    utility)   echo "192.168.5.23 100.112.51.11 Pi #4 utility (Pi-hole DNS, Tailscale)" ;;
    anstelias) echo "192.168.5.33 192.168.5.33   Anstelias server (production store)" ;;
    *)         return 1 ;;
  esac
}

ALL_HOSTS="anstelias builder watcher ops utility"
# Which host runs the WooCommerce stack (override with STORE_HOST=builder for staging).
STORE_HOST="${STORE_HOST:-anstelias}"

addr() {  # alias -> ip for the selected network
  local rec; rec="$(host_record "$1")" || { echo "unknown host: $1" >&2; return 1; }
  if [[ "$FLEET_NET" == "ts" ]]; then echo "$rec" | awk '{print $2}'; else echo "$rec" | awk '{print $1}'; fi
}
desc() { host_record "$1" | cut -d' ' -f3- ; }
target() { echo "${SSH_USER}@$(addr "$1")"; }

SSH_OPTS=(-o ConnectTimeout=6 -o StrictHostKeyChecking=accept-new -o BatchMode=yes)

require_ssh() { command -v ssh >/dev/null || { echo "ssh not found. Run fleetctl from your local computer." >&2; exit 1; }; }

resolve_set() {  # "all" or a single alias -> list
  if [[ "$1" == "all" ]]; then echo "$ALL_HOSTS"; else host_record "$1" >/dev/null && echo "$1"; fi
}

cmd_ping() {
  require_ssh
  for h in $ALL_HOSTS; do
    if ssh "${SSH_OPTS[@]}" "$(target "$h")" true 2>/dev/null; then
      printf "  \033[32m●\033[0m %-10s %-15s %s\n" "$h" "$(addr "$h")" "$(desc "$h")"
    else
      printf "  \033[31m○\033[0m %-10s %-15s %s\n" "$h" "$(addr "$h")" "unreachable"
    fi
  done
}

cmd_status() {
  require_ssh
  for h in $ALL_HOSTS; do
    echo "==== $h ($(addr "$h")) — $(desc "$h") ===="
    ssh "${SSH_OPTS[@]}" "$(target "$h")" \
      'echo -n "  "; uptime | sed "s/^ *//"; (docker ps --format "  docker: {{.Names}} ({{.Status}})" 2>/dev/null || echo "  docker: n/a")' \
      2>/dev/null || echo "  (unreachable)"
  done
}

cmd_ssh() { require_ssh; [[ $# -ge 1 ]] || { echo "usage: fleetctl ssh <host>"; exit 1; }; exec ssh "${SSH_OPTS[@]}" -tt "$(target "$1")"; }

cmd_run() {  # run <host|all> -- <command...>
  require_ssh
  local who="$1"; shift
  [[ "${1:-}" == "--" ]] && shift
  [[ $# -ge 1 ]] || { echo "usage: fleetctl run <host|all> -- <command>"; exit 1; }
  for h in $(resolve_set "$who"); do
    echo "==== $h ===="
    ssh "${SSH_OPTS[@]}" "$(target "$h")" "$*" 2>&1 || echo "  (command failed on $h)"
  done
}

cmd_deploy() {  # deploy production|staging — reuses deploy.sh with the right host
  local env="${1:-staging}"
  case "$env" in
    production) TARGET_HOST="$(target anstelias)" ./scripts/deploy.sh production ;;
    staging)    TARGET_HOST="$(target builder)"   ./scripts/deploy.sh staging ;;
    *) echo "usage: fleetctl deploy [production|staging]"; exit 1 ;;
  esac
}

store_compose() {  # run a docker compose command on the store host
  require_ssh
  ssh "${SSH_OPTS[@]}" -tt "$(target "$STORE_HOST")" "cd ${REMOTE_DIR} && docker compose $*"
}

cmd_store() {
  case "${1:-ps}" in
    up)      store_compose up -d ;;
    down)    store_compose down ;;
    restart) store_compose restart ;;
    ps)      store_compose ps ;;
    logs)    store_compose logs --tail=120 -f ;;
    *)       echo "usage: fleetctl store [up|down|restart|ps|logs]"; exit 1 ;;
  esac
}

cmd_health() {
  require_ssh
  local url="http://$(addr "$STORE_HOST"):${HTTP_PORT:-8080}/?ie-health=1"
  echo "GET $url"
  ssh "${SSH_OPTS[@]}" "$(target "$STORE_HOST")" "curl -fsS '$url' && echo" 2>/dev/null \
    || echo "  health check FAILED"
}

cmd_backup() {
  require_ssh
  ssh "${SSH_OPTS[@]}" -tt "$(target "$STORE_HOST")" "cd ${REMOTE_DIR} && ./scripts/backup.sh"
}

cmd_import() {  # import <local.csv> [--real]
  require_ssh
  local file="${1:-}"; local mode="${2:-}"
  [[ -f "$file" ]] || { echo "usage: fleetctl import <local.csv> [--real]"; exit 1; }
  local remote="${REMOTE_DIR}/importer/exports/$(basename "$file")"
  echo ">> copying $file -> $STORE_HOST:$remote"
  rsync -az "$file" "$(target "$STORE_HOST"):$remote"
  local dry="--dry-run --limit=10"; [[ "$mode" == "--real" ]] && dry=""
  echo ">> running import ($([[ -z "$dry" ]] && echo REAL || echo dry-run)) via WP-CLI"
  ssh "${SSH_OPTS[@]}" -tt "$(target "$STORE_HOST")" \
    "cd ${REMOTE_DIR} && docker compose run --rm wpcli wp anstelias import csv --file=/var/www/html/wp-content/uploads/anstelias-imports/$(basename "$file") $dry || \
     docker compose run --rm wpcli wp anstelias import csv --file=$remote $dry"
}

usage() {
  cat <<EOF
fleetctl — remote control for the Anstelias fleet (run from your local computer)

Hosts: $ALL_HOSTS   (store host: $STORE_HOST; network: $FLEET_NET)

Commands:
  ping                       reachability of every host
  status                     uptime + docker containers per host
  ssh <host>                 interactive shell
  run <host|all> -- <cmd>    run a shell command on host(s)
  deploy [production|staging] deploy the store (production=anstelias, staging=builder)
  store [up|down|restart|ps|logs]   docker compose ops on the store host
  health                     hit the store /?ie-health=1 endpoint
  backup                     run backup.sh on the store host
  import <local.csv> [--real]   copy a CSV to the store host and import (dry-run unless --real)

Env: SSH_USER (default andrew), FLEET_NET=lan|ts, STORE_HOST (default anstelias),
     REMOTE_DIR (default /opt/inland-empire-store), HTTP_PORT (default 8080)
EOF
}

main() {
  local cmd="${1:-}"; shift || true
  case "$cmd" in
    ping)    cmd_ping ;;
    status)  cmd_status ;;
    ssh)     cmd_ssh "$@" ;;
    run)     cmd_run "$@" ;;
    deploy)  cmd_deploy "$@" ;;
    store)   cmd_store "$@" ;;
    health)  cmd_health ;;
    backup)  cmd_backup ;;
    import)  cmd_import "$@" ;;
    ""|-h|--help|help) usage ;;
    *) echo "unknown command: $cmd"; echo; usage; exit 1 ;;
  esac
}
main "$@"
