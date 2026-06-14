# Pirate Ship Workflow

Pirate Ship is free and gives you USPS/UPS rates with no monthly fee — you only
pay for postage. It does **not** offer a public API for custom live rates or
label buying, so we use its built-in WooCommerce integration and keep a free CSV
fallback.

## How orders flow

1. Customer checks out on the store (Stripe or PayPal).
2. Order is created in WooCommerce (status **Processing**).
3. Pirate Ship pulls the order through its WooCommerce connection.
4. You buy the label inside Pirate Ship.
5. Tracking can flow back to WooCommerce (settings-dependent); the customer gets
   a shipment/tracking email.

## Connect WooCommerce to Pirate Ship

1. Create a free account at <https://www.pirateship.com/>.
2. In Pirate Ship: **Settings → Connect a Store/Cart → WooCommerce**.
3. It will ask for your store URL and to authorize via WooCommerce REST API.
   Approve the connection in WP Admin when prompted (this creates read keys).
4. Pirate Ship imports your **Processing** orders automatically.

## Buy a label

1. Pirate Ship → **Ship** → select the imported order.
2. Confirm address, weight, and box size (our products carry weight/dimensions
   and a shipping class — see below).
3. Buy the label, print, attach. USPS/UPS as appropriate.

## Tracking back to WooCommerce

Depending on your Pirate Ship + WooCommerce settings, marking an order shipped in
Pirate Ship can write tracking back and move the order to **Completed**. If not,
mark the order Completed in WooCommerce and paste the tracking number into the
order note so the customer email includes it.

## Shipping classes (set during seeding)

Created automatically by `wp-install.sh`:

`Small Components`, `Storage/RAM`, `Mini PCs`, `Desktops`, `Monitors`,
`Heavy Equipment`, `Fragile Equipment`.

Assign each product a class and a weight/dimensions so labels price correctly.
Flat-rate-by-class is configured under WooCommerce → Settings → Shipping (see
`docs/admin-guide.md`). Local pickup (Upland, CA) can be offered as a free
method.

## Free CSV fallback (no integration needed)

If the integration is down or you prefer bulk handling:

1. WP Admin → **WooCommerce → Store Tools** → **Download unshipped orders (CSV)**
   (or **Download & mark as exported**).
2. The CSV has order number, name, address, phone, email, SKUs, titles, qty,
   weight, dimensions, total, and notes — everything Pirate Ship's CSV importer
   needs.
3. In Pirate Ship: **Ship → Import → Spreadsheet**, upload the CSV, buy labels.

Exported orders are tagged with `_anstelias_pirateship_exported` so you can skip
them next time.

## Exceptions

- **Address validation fails** — fix the address in the WooCommerce order, then
  re-pull/re-export.
- **Oversized/heavy** — use the `Heavy Equipment` class and UPS Ground; consider
  local pickup for very large items.
- **Refund/return** — handle in WooCommerce (Refund) and within your stated
  30-day window.
