<?php
/**
 * Admin UI controller: menus, asset loading, and POST handlers (nonce + cap
 * checked). Restricted to users with manage_woocommerce.
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

use Anstelias\StoreTools\Utils;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Admin {

	const CAP  = 'manage_woocommerce';
	const SLUG = 'anstelias-ebay';

	/** @var Logger */
	private $log;
	/** @var string transient key for last report */
	const NOTICE_KEY = 'anstelias_ebay_notice';

	public function __construct( Logger $log ) {
		$this->log = $log;
	}

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'assets' ) );

		// POST handlers (admin-post.php).
		add_action( 'admin_post_anstelias_save_settings', array( $this, 'handle_save_settings' ) );
		add_action( 'admin_post_anstelias_import_csv', array( $this, 'handle_import_csv' ) );
		add_action( 'admin_post_anstelias_import_api', array( $this, 'handle_import_api' ) );
		add_action( 'admin_post_anstelias_test_api', array( $this, 'handle_test_api' ) );
		add_action( 'admin_post_anstelias_save_catmap', array( $this, 'handle_save_catmap' ) );
		add_action( 'admin_post_anstelias_bulk', array( $this, 'handle_bulk' ) );

		add_action( 'admin_notices', array( $this, 'render_notices' ) );
	}

	public function menu(): void {
		add_menu_page(
			__( 'eBay Importer', 'anstelias-ebay-importer' ),
			__( 'eBay Importer', 'anstelias-ebay-importer' ),
			self::CAP,
			self::SLUG,
			array( $this, 'page_review' ),
			'dashicons-update',
			56
		);
		$pages = array(
			''            => array( __( 'Review Queue', 'anstelias-ebay-importer' ), 'page_review' ),
			'-import-csv' => array( __( 'Import from CSV', 'anstelias-ebay-importer' ), 'page_import_csv' ),
			'-import-api' => array( __( 'Import from eBay API', 'anstelias-ebay-importer' ), 'page_import_api' ),
			'-catmap'     => array( __( 'Category Mapping', 'anstelias-ebay-importer' ), 'page_catmap' ),
			'-logs'       => array( __( 'Import Logs', 'anstelias-ebay-importer' ), 'page_logs' ),
			'-reports'    => array( __( 'Reports', 'anstelias-ebay-importer' ), 'page_reports' ),
			'-settings'   => array( __( 'Settings', 'anstelias-ebay-importer' ), 'page_settings' ),
		);
		foreach ( $pages as $suffix => $info ) {
			add_submenu_page(
				self::SLUG,
				$info[0],
				$info[0],
				self::CAP,
				'' === $suffix ? self::SLUG : self::SLUG . $suffix,
				array( $this, $info[1] )
			);
		}
	}

	public function assets( string $hook ): void {
		if ( ! str_contains( $hook, self::SLUG ) ) {
			return;
		}
		wp_enqueue_style( 'anstelias-ebay-admin', ANST_EB_URL . 'assets/admin.css', array(), ANST_EB_VERSION );
		wp_enqueue_script( 'anstelias-ebay-admin', ANST_EB_URL . 'assets/admin.js', array(), ANST_EB_VERSION, true );
	}

	/* ----- Page renderers ------------------------------------------------ */

	public function page_review(): void {
		$this->guard();
		$queue   = new Review_Queue( $this->log );
		$status  = isset( $_GET['status'] ) ? sanitize_key( wp_unslash( $_GET['status'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		$paged   = max( 1, (int) ( $_GET['paged'] ?? 1 ) ); // phpcs:ignore WordPress.Security.NonceVerification
		$search  = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		$data    = $queue->query( array( 'status' => $status, 'paged' => $paged, 'search' => $search ) );
		$counts  = $queue->status_counts();
		$cats    = get_terms( array( 'taxonomy' => 'product_cat', 'hide_empty' => false ) );
		require ANST_EB_DIR . 'admin/views/review-queue.php';
	}

	public function page_import_csv(): void {
		$this->guard();
		require ANST_EB_DIR . 'admin/views/import-csv.php';
	}

	public function page_import_api(): void {
		$this->guard();
		$has_creds = Settings::has_api_creds();
		require ANST_EB_DIR . 'admin/views/import-api.php';
	}

	public function page_catmap(): void {
		$this->guard();
		$map  = get_option( Category_Mapper::MAP_OPTION, array() );
		$cats = get_terms( array( 'taxonomy' => 'product_cat', 'hide_empty' => false ) );
		require ANST_EB_DIR . 'admin/views/category-mapping.php';
	}

	public function page_logs(): void {
		$this->guard();
		$lines = Logger::tail( 300 );
		require ANST_EB_DIR . 'admin/views/logs.php';
	}

	public function page_reports(): void {
		$this->guard();
		$dir   = wp_upload_dir();
		$files = glob( trailingslashit( $dir['basedir'] ) . 'anstelias-imports/report-*.csv' ) ?: array();
		rsort( $files );
		$base_url = trailingslashit( $dir['baseurl'] ) . 'anstelias-imports/';
		require ANST_EB_DIR . 'admin/views/reports.php';
	}

	public function page_settings(): void {
		$this->guard();
		$s = Settings::all();
		require ANST_EB_DIR . 'admin/views/settings.php';
	}

	/* ----- POST handlers ------------------------------------------------- */

	public function handle_save_settings(): void {
		$this->verify( 'anstelias_save_settings' );
		Settings::save( $_POST ); // sanitized inside Settings::save()
		$this->notice( 'success', __( 'Settings saved.', 'anstelias-ebay-importer' ) );
		$this->redirect( self::SLUG . '-settings' );
	}

	public function handle_test_api(): void {
		$this->verify( 'anstelias_test_api' );
		$client = new Ebay_API_Client( $this->log );
		$res = $client->test_connection();
		$this->notice( $res['ok'] ? 'success' : 'error', $res['message'] );
		$this->redirect( self::SLUG . '-import-api' );
	}

	public function handle_import_csv(): void {
		$this->verify( 'anstelias_import_csv' );

		if ( empty( $_FILES['csv']['tmp_name'] ) || ! is_uploaded_file( $_FILES['csv']['tmp_name'] ) ) {
			$this->notice( 'error', __( 'No CSV uploaded.', 'anstelias-ebay-importer' ) );
			$this->redirect( self::SLUG . '-import-csv' );
		}

		// Validate file type/extension.
		$name  = sanitize_file_name( $_FILES['csv']['name'] );
		$check = wp_check_filetype( $name, array( 'csv' => 'text/csv', 'txt' => 'text/plain' ) );
		$ext   = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
		if ( ! in_array( $ext, array( 'csv', 'txt' ), true ) ) {
			$this->notice( 'error', __( 'File must be a .csv', 'anstelias-ebay-importer' ) );
			$this->redirect( self::SLUG . '-import-csv' );
		}

		// Move to the protected import dir.
		$dir  = wp_upload_dir();
		$dest_dir = trailingslashit( $dir['basedir'] ) . 'anstelias-imports';
		wp_mkdir_p( $dest_dir );
		$dest = $dest_dir . '/upload-' . gmdate( 'Ymd-His' ) . '.csv';
		if ( ! move_uploaded_file( $_FILES['csv']['tmp_name'], $dest ) ) {
			$this->notice( 'error', __( 'Could not store the uploaded file.', 'anstelias-ebay-importer' ) );
			$this->redirect( self::SLUG . '-import-csv' );
		}

		$dry         = ! empty( $_POST['dry_run'] );
		$skip_images = ! empty( $_POST['skip_images'] );
		$limit       = (int) ( $_POST['limit'] ?? 0 );

		$csv  = new CSV_Importer();
		$read = $csv->read( $dest );
		if ( empty( $read['rows'] ) ) {
			$this->notice( 'error', __( 'No data rows found. Check that this is an eBay active-listings CSV.', 'anstelias-ebay-importer' ) );
			$this->redirect( self::SLUG . '-import-csv' );
		}

		$records = array();
		foreach ( $read['rows'] as $row ) {
			$records[] = $csv->normalize_row( $row );
		}

		$sync   = new Sync_Manager( $this->log );
		$report = $sync->import_records( $records, array(
			'dry_run' => $dry, 'skip_images' => $skip_images, 'limit' => $limit, 'source' => 'csv',
		) );
		$report->write_csv();

		$this->notice( 'success', ( $dry ? __( 'Dry run: ', 'anstelias-ebay-importer' ) : '' ) . $report->summary_line() );
		$this->redirect( self::SLUG );
	}

	public function handle_import_api(): void {
		$this->verify( 'anstelias_import_api' );
		if ( ! Settings::has_api_creds() ) {
			$this->notice( 'error', __( 'Add eBay API credentials in Settings first.', 'anstelias-ebay-importer' ) );
			$this->redirect( self::SLUG . '-settings' );
		}
		$dry         = ! empty( $_POST['dry_run'] );
		$skip_images = ! empty( $_POST['skip_images'] );
		$limit       = (int) ( $_POST['limit'] ?? 0 );

		$client = new Ebay_API_Client( $this->log );
		$fetch  = $client->fetch_active_listings( $limit );
		if ( ! empty( $fetch['errors'] ) ) {
			$this->notice( 'error', __( 'eBay API: ', 'anstelias-ebay-importer' ) . implode( ' | ', $fetch['errors'] ) );
			if ( empty( $fetch['records'] ) ) {
				$this->redirect( self::SLUG . '-import-api' );
			}
		}

		$sync   = new Sync_Manager( $this->log );
		$report = $sync->import_records( $fetch['records'], array(
			'dry_run' => $dry, 'skip_images' => $skip_images, 'limit' => $limit, 'source' => 'api',
		) );
		$report->write_csv();

		$this->notice( 'success', ( $dry ? __( 'Dry run: ', 'anstelias-ebay-importer' ) : '' ) . $report->summary_line() );
		$this->redirect( self::SLUG );
	}

	public function handle_save_catmap(): void {
		$this->verify( 'anstelias_save_catmap' );
		$map = array();
		$ebay_cats = (array) ( $_POST['ebay_cat'] ?? array() );
		$wc_cats   = (array) ( $_POST['wc_cat'] ?? array() );
		foreach ( $ebay_cats as $i => $ebay_cat ) {
			$ebay_cat = sanitize_text_field( wp_unslash( $ebay_cat ) );
			$wc_id    = (int) ( $wc_cats[ $i ] ?? 0 );
			if ( '' !== $ebay_cat && $wc_id ) {
				$map[ $ebay_cat ] = $wc_id;
			}
		}
		update_option( Category_Mapper::MAP_OPTION, $map, false );
		$this->notice( 'success', __( 'Category mapping saved.', 'anstelias-ebay-importer' ) );
		$this->redirect( self::SLUG . '-catmap' );
	}

	public function handle_bulk(): void {
		$this->verify( 'anstelias_bulk' );
		$action = sanitize_key( wp_unslash( $_POST['bulk_action'] ?? '' ) );
		$ids    = array_map( 'absint', (array) ( $_POST['ids'] ?? array() ) );
		if ( empty( $ids ) || '' === $action ) {
			$this->notice( 'error', __( 'Select an action and at least one product.', 'anstelias-ebay-importer' ) );
			$this->redirect( self::SLUG );
		}
		// Deletion requires the explicit confirm checkbox.
		if ( 'delete' === $action && empty( $_POST['confirm_delete'] ) ) {
			$this->notice( 'error', __( 'Check the confirmation box to delete draft products.', 'anstelias-ebay-importer' ) );
			$this->redirect( self::SLUG );
		}
		$queue = new Review_Queue( $this->log );
		$res = $queue->bulk( $action, $ids, array( 'category_id' => (int) ( $_POST['category_id'] ?? 0 ) ) );
		$this->notice( 'success', $res['message'] );
		$this->redirect( self::SLUG );
	}

	/* ----- Helpers ------------------------------------------------------- */

	private function guard(): void {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'anstelias-ebay-importer' ) );
		}
	}

	private function verify( string $action ): void {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'anstelias-ebay-importer' ) );
		}
		check_admin_referer( $action );
	}

	private function notice( string $type, string $message ): void {
		set_transient( self::NOTICE_KEY, array( 'type' => $type, 'message' => $message ), 60 );
	}

	public function render_notices(): void {
		$n = get_transient( self::NOTICE_KEY );
		if ( ! $n ) {
			return;
		}
		delete_transient( self::NOTICE_KEY );
		printf(
			'<div class="notice notice-%s is-dismissible"><p>%s</p></div>',
			esc_attr( 'error' === $n['type'] ? 'error' : 'success' ),
			esc_html( $n['message'] )
		);
	}

	private function redirect( string $page ): void {
		wp_safe_redirect( admin_url( 'admin.php?page=' . $page ) );
		exit;
	}
}
