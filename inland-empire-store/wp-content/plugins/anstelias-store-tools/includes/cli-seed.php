<?php
/**
 * Idempotent taxonomy/attribute/shipping/page seeder.
 *
 * Run via WP-CLI:
 *   wp eval-file wp-content/plugins/anstelias-store-tools/includes/cli-seed.php
 *
 * Safe to re-run: everything checks for existence first.
 *
 * @package Anstelias\StoreTools
 */

if ( ! defined( 'ABSPATH' ) ) {
	// Allow execution under `wp eval-file` (which bootstraps WP) only.
	fwrite( STDERR, "Run via: wp eval-file <this-file>\n" );
	exit( 1 );
}

if ( ! class_exists( 'WooCommerce' ) ) {
	WP_CLI::error( 'WooCommerce is not active. Activate it first.' );
}

require_once ANST_ST_DIR . 'includes/class-utils.php';
use Anstelias\StoreTools\Utils;

/* ---------------------------------------------------------------------------
 * 1. Product categories (top-level + subcategories)
 * ------------------------------------------------------------------------- */
WP_CLI::log( 'Seeding product categories...' );
foreach ( Utils::categories() as $top => $subs ) {
	$parent = term_exists( $top, 'product_cat' );
	if ( ! $parent ) {
		$parent = wp_insert_term( $top, 'product_cat' );
		WP_CLI::log( "  + {$top}" );
	}
	$parent_id = is_array( $parent ) ? (int) $parent['term_id'] : 0;

	foreach ( $subs as $sub ) {
		if ( ! term_exists( $sub, 'product_cat' ) ) {
			wp_insert_term( $sub, 'product_cat', array( 'parent' => $parent_id ) );
			WP_CLI::log( "      - {$sub}" );
		}
	}
}

/* ---------------------------------------------------------------------------
 * 2. Global product attributes
 * ------------------------------------------------------------------------- */
WP_CLI::log( 'Seeding global product attributes...' );
foreach ( Utils::attributes() as $label ) {
	$slug = wc_sanitize_taxonomy_name( $label );
	$id   = wc_attribute_taxonomy_id_by_name( $slug );
	if ( ! $id ) {
		wc_create_attribute(
			array(
				'name'         => $label,
				'slug'         => $slug,
				'type'         => 'select',
				'order_by'     => 'menu_order',
				'has_archives' => false,
			)
		);
		WP_CLI::log( "  + attribute: {$label}" );
	}
}

/* ---------------------------------------------------------------------------
 * 3. Shipping classes
 * ------------------------------------------------------------------------- */
WP_CLI::log( 'Seeding shipping classes...' );
$shipping_classes = array(
	'Small Components' => 'small-components',
	'Storage/RAM'      => 'storage-ram',
	'Mini PCs'         => 'mini-pcs',
	'Desktops'         => 'desktops',
	'Monitors'         => 'monitors',
	'Heavy Equipment'  => 'heavy-equipment',
	'Fragile Equipment'=> 'fragile-equipment',
);
foreach ( $shipping_classes as $name => $slug ) {
	if ( ! term_exists( $slug, 'product_shipping_class' ) ) {
		wp_insert_term( $name, 'product_shipping_class', array( 'slug' => $slug ) );
		WP_CLI::log( "  + shipping class: {$name}" );
	}
}

/* ---------------------------------------------------------------------------
 * 4. Content pages (only created if missing)
 * ------------------------------------------------------------------------- */
WP_CLI::log( 'Ensuring content pages...' );
$pages = array(
	'about'              => array( 'About Anstelias Technology', "Inland Empire Electronics is operated by ANSI Corporation dba Anstelias Technology, a professional electronics reseller based in Upland, CA. We specialize in tested used electronics, computer hardware, networking gear, audio/video equipment, and business hardware." ),
	'contact'            => array( 'Contact', "Anstelias Technology\n1302 Monte Vista Ave Suite 1\nUpland, CA 91786\n\nEmail: support@anstelias.com" ),
	'shipping-returns'   => array( 'Shipping &amp; Returns', "We ship from Upland, CA via USPS and UPS. Most orders ship within 1–2 business days. Tested items carry a 30-day return window unless otherwise stated." ),
);
foreach ( $pages as $slug => $data ) {
	$existing = get_page_by_path( $slug );
	if ( ! $existing ) {
		wp_insert_post(
			array(
				'post_title'   => $data[0],
				'post_name'    => $slug,
				'post_content' => $data[1],
				'post_status'  => 'publish',
				'post_type'    => 'page',
			)
		);
		WP_CLI::log( "  + page: {$slug}" );
	}
}

/* ---------------------------------------------------------------------------
 * 5. Default notices
 * ------------------------------------------------------------------------- */
add_option( 'anst_shipping_notice', 'Ships from Upland, CA via USPS/UPS. Most orders ship within 1–2 business days.' );
add_option( 'anst_warranty_notice', '30-day return window on tested items unless otherwise stated. Sold by ANSI Corporation dba Anstelias Technology.' );

WP_CLI::success( 'Store seed complete: categories, attributes, shipping classes, pages.' );
