<?php
/**
 * eBay Importer bootstrap.
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Plugin {

	public function __construct() {
		// Hard requirement: WooCommerce + Store Tools (for the Utils library).
		if ( ! class_exists( 'WooCommerce' ) || ! class_exists( '\Anstelias\StoreTools\Utils' ) ) {
			add_action( 'admin_notices', array( $this, 'dependency_notice' ) );
			return;
		}

		$logger = new Logger();
		if ( is_admin() ) {
			( new Admin( $logger ) )->register();
		}

		// WP-CLI command for headless/cron imports.
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			require_once ANST_EB_DIR . 'includes/class-cli.php';
			\WP_CLI::add_command( 'anstelias import', new CLI( $logger ) );
		}
	}

	public function dependency_notice(): void {
		echo '<div class="notice notice-error"><p>';
		esc_html_e( 'Anstelias eBay Importer requires WooCommerce and Anstelias Store Tools to be active.', 'anstelias-ebay-importer' );
		echo '</p></div>';
	}
}
