<?php
/**
 * Plugin Name:       Anstelias eBay Importer
 * Plugin URI:        https://www.anstelias.com/
 * Description:       Import, normalize, auto-categorize, review, and publish eBay listings into WooCommerce using only free methods (CSV-first, optional official eBay API). Idempotent, draft-by-default, with a review queue and local image rehosting.
 * Version:           1.0.0
 * Author:            Anstelias Technology (ANSI Corporation)
 * License:           GPL-2.0-or-later
 * Text Domain:       anstelias-ebay-importer
 * Requires PHP:      8.0
 * Requires at least: 6.4
 *
 * @package Anstelias\EbayImporter
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ANST_EB_VERSION', '1.0.0' );
define( 'ANST_EB_FILE', __FILE__ );
define( 'ANST_EB_DIR', plugin_dir_path( __FILE__ ) );
define( 'ANST_EB_URL', plugin_dir_url( __FILE__ ) );

require_once ANST_EB_DIR . 'includes/class-logger.php';
require_once ANST_EB_DIR . 'includes/class-settings.php';
require_once ANST_EB_DIR . 'includes/class-category-mapper.php';
require_once ANST_EB_DIR . 'includes/class-image-importer.php';
require_once ANST_EB_DIR . 'includes/class-product-mapper.php';
require_once ANST_EB_DIR . 'includes/class-csv-importer.php';
require_once ANST_EB_DIR . 'includes/class-ebay-api-client.php';
require_once ANST_EB_DIR . 'includes/class-review-queue.php';
require_once ANST_EB_DIR . 'includes/class-sync-manager.php';
require_once ANST_EB_DIR . 'includes/class-reporting.php';
require_once ANST_EB_DIR . 'includes/class-admin.php';
require_once ANST_EB_DIR . 'includes/class-plugin.php';

/**
 * Boot after WooCommerce + Store Tools (priority 12 > Store Tools' 11).
 */
function anst_eb() {
	static $plugin = null;
	if ( null === $plugin ) {
		$plugin = new \Anstelias\EbayImporter\Plugin();
	}
	return $plugin;
}
add_action( 'plugins_loaded', 'anst_eb', 12 );

// Declare HPOS compatibility.
add_action( 'before_woocommerce_init', function () {
	if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
	}
} );

register_activation_hook( __FILE__, function () {
	// Ensure an upload dir for CSV staging exists and is protected.
	$dir = wp_upload_dir();
	$path = trailingslashit( $dir['basedir'] ) . 'anstelias-imports';
	if ( ! file_exists( $path ) ) {
		wp_mkdir_p( $path );
		file_put_contents( $path . '/.htaccess', "Deny from all\n" ); // phpcs:ignore
		file_put_contents( $path . '/index.html', '' ); // phpcs:ignore
	}
} );
