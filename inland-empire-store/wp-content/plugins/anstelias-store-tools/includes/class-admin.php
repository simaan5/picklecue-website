<?php
/**
 * Admin UI for Store Tools: notices settings + the unshipped-order export page.
 *
 * @package Anstelias\StoreTools
 */

namespace Anstelias\StoreTools;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Admin {

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'settings' ) );
	}

	public function menu(): void {
		add_submenu_page(
			'woocommerce',
			__( 'Store Tools', 'anstelias-store-tools' ),
			__( 'Store Tools', 'anstelias-store-tools' ),
			'manage_woocommerce',
			'anstelias-store-tools',
			array( $this, 'render_page' )
		);
	}

	public function settings(): void {
		register_setting( 'anst_store_tools', 'anst_shipping_notice', array( 'sanitize_callback' => 'sanitize_textarea_field' ) );
		register_setting( 'anst_store_tools', 'anst_warranty_notice', array( 'sanitize_callback' => 'sanitize_textarea_field' ) );
	}

	public function render_page(): void {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$export_url = wp_nonce_url(
			admin_url( 'admin-post.php?action=' . Shipping_Export::ACTION ),
			Shipping_Export::ACTION
		);
		require ANST_ST_DIR . 'admin/views/store-tools.php';
	}
}
