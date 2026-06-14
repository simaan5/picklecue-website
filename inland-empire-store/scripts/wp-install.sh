#!/usr/bin/env bash
# =============================================================================
# Bootstraps WordPress + WooCommerce for Inland Empire Electronics.
# Idempotent: safe to re-run. Skips steps already completed.
#
# Usage:  ./scripts/wp-install.sh
# Requires: docker compose stack running (docker compose up -d)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Run: cp .env.example .env  then edit it." >&2
  exit 1
fi
# shellcheck disable=SC1091
set -a; source .env; set +a

wp() { docker compose run --rm wpcli wp "$@"; }

echo ">> Waiting for database..."
until docker compose exec -T db healthcheck.sh --connect >/dev/null 2>&1; do
  sleep 2
done

echo ">> Ensuring WordPress core is installed..."
if ! wp core is-installed >/dev/null 2>&1; then
  wp core install \
    --url="${SITE_URL}" \
    --title="${WP_TITLE}" \
    --admin_user="${WP_ADMIN_USER}" \
    --admin_password="${WP_ADMIN_PASSWORD}" \
    --admin_email="${WP_ADMIN_EMAIL}" \
    --skip-email
  echo "   Core installed."
else
  echo "   Core already installed; skipping."
fi

echo ">> Setting timezone, permalinks, and basic options..."
wp option update timezone_string "America/Los_Angeles"
wp option update blogdescription "Used electronics, computer hardware, A/V & business equipment — shipped from Upland, CA"
wp rewrite structure '/%postname%/' --hard
wp rewrite flush --hard

echo ">> Installing free plugins from WordPress.org..."
PLUGINS=(
  woocommerce
  woocommerce-gateway-stripe
  woocommerce-paypal-payments
  redis-cache
  seo-by-rank-math
  wordfence
  wp-mail-smtp
)
for p in "${PLUGINS[@]}"; do
  if ! wp plugin is-installed "$p" >/dev/null 2>&1; then
    wp plugin install "$p" --activate || echo "   WARN: could not install $p (continuing)"
  else
    wp plugin activate "$p" || true
  fi
done

echo ">> Activating custom theme + plugins..."
wp theme activate anstelias-storefront || echo "   WARN: theme not active yet"
wp plugin activate anstelias-store-tools || echo "   WARN: store-tools not active"
wp plugin activate anstelias-ebay-importer || echo "   WARN: importer not active"

echo ">> Enabling Redis object cache..."
wp redis enable || echo "   WARN: redis enable failed (check WP_REDIS_HOST)"

echo ">> Configuring WooCommerce store base..."
wp option update woocommerce_store_address "1302 Monte Vista Ave Suite 1"
wp option update woocommerce_store_address_2 ""
wp option update woocommerce_store_city "Upland"
wp option update woocommerce_default_country "US:CA"
wp option update woocommerce_store_postcode "91786"
wp option update woocommerce_currency "USD"
wp option update woocommerce_weight_unit "lbs"
wp option update woocommerce_dimension_unit "in"
wp option update woocommerce_calc_taxes "yes"
# Enable HPOS (High-Performance Order Storage) + block cart/checkout where supported.
wp option update woocommerce_custom_orders_table_enabled "yes" || true
wp option update woocommerce_feature_custom_order_tables_enabled "yes" || true

echo ">> Creating WooCommerce categories, attributes, and shipping classes..."
wp eval-file wp-content/plugins/anstelias-store-tools/includes/cli-seed.php || \
  echo "   NOTE: run the seeder later via: docker compose run --rm wpcli wp eval-file wp-content/plugins/anstelias-store-tools/includes/cli-seed.php"

echo ""
echo "=============================================================="
echo " Done. Visit:  ${SITE_URL}/wp-admin/"
echo " Admin user :  ${WP_ADMIN_USER}"
echo "=============================================================="
