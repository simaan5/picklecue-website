<?php
/**
 * Store Tools bootstrap: wires the feature classes and front-end assets.
 *
 * @package Anstelias\StoreTools
 */

namespace Anstelias\StoreTools;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Plugin {

	public function __construct() {
		// WooCommerce is required for the product features.
		if ( class_exists( 'WooCommerce' ) ) {
			( new Product_Display() )->register();
			( new Shipping_Export() )->register();
		}

		if ( is_admin() ) {
			( new Admin() )->register();
		}

		add_action( 'wp_enqueue_scripts', array( $this, 'assets' ) );
	}

	public function assets(): void {
		wp_enqueue_style(
			'anstelias-store-tools',
			ANST_ST_URL . 'assets/css/store-tools.css',
			array(),
			ANST_ST_VERSION
		);
	}
}
