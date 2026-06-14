#!/usr/bin/env bash
# =============================================================================
# Install/activate one or more free WordPress.org plugins by slug.
# Usage:  ./scripts/wp-plugin-install.sh redis-cache wordfence
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <plugin-slug> [more-slugs...]" >&2
  exit 1
fi

wp() { docker compose run --rm wpcli wp "$@"; }

for slug in "$@"; do
  echo ">> Installing $slug ..."
  if wp plugin is-installed "$slug" >/dev/null 2>&1; then
    wp plugin activate "$slug"
    echo "   $slug already installed -> activated."
  else
    wp plugin install "$slug" --activate
    echo "   $slug installed + activated."
  fi
done
