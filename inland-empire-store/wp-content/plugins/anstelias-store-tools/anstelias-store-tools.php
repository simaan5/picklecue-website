<?php
/**
 * Plugin Name:       Anstelias Store Tools
 * Plugin URI:        https://www.anstelias.com/
 * Description:       Store enhancements for Inland Empire Electronics — condition badges, technical specs tables, product summary grid, admin source metadata, shipping/warranty notices, and an unshipped-order CSV export for the Pirate Ship workflow.
 * Version:           1.0.0
 * Author:            Anstelias Technology (ANSI Corporation)
 * License:           GPL-2.0-or-later
 * Text Domain:       anstelias-store-tools
 * Requires PHP:      8.0
 * Requires at least: 6.4
 *
 * @package Anstelias\StoreTools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'ANST_ST_VERSION', '1.0.0' );
define( 'ANST_ST_FILE', __FILE__ );
define( 'ANST_ST_DIR', plugin_dir_path( __FILE__ ) );
define( 'ANST_ST_URL', plugin_dir_url( __FILE__ ) );

require_once ANST_ST_DIR . 'includes/class-logger.php';
require_once ANST_ST_DIR . 'includes/class-utils.php';
require_once ANST_ST_DIR . 'includes/class-condition-badges.php';
require_once ANST_ST_DIR . 'includes/class-specs-table.php';
require_once ANST_ST_DIR . 'includes/class-product-display.php';
require_once ANST_ST_DIR . 'includes/class-shipping-export.php';
require_once ANST_ST_DIR . 'includes/class-admin.php';
require_once ANST_ST_DIR . 'includes/class-plugin.php';

/**
 * Boot the plugin on plugins_loaded so WooCommerce is available.
 */
function anst_st() {
	static $plugin = null;
	if ( null === $plugin ) {
		$plugin = new \Anstelias\StoreTools\Plugin();
	}
	return $plugin;
}
add_action( 'plugins_loaded', 'anst_st', 11 );

// Lightweight health endpoint used by scripts/healthcheck.sh (?ie-health=1).
add_action( 'init', function () {
	if ( isset( $_GET['ie-health'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		status_header( 200 );
		header( 'Content-Type: text/plain' );
		echo 'ok';
		exit;
	}
} );
