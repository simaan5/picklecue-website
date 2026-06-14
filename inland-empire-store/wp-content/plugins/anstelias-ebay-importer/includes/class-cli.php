<?php
/**
 * WP-CLI commands for headless / cron imports.
 *
 *   wp anstelias import csv --file=/path/to/ebay.csv [--dry-run] [--limit=10] [--skip-images]
 *   wp anstelias import api [--dry-run] [--limit=10] [--skip-images]
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class CLI {

	/** @var Logger */
	private $log;

	public function __construct( Logger $log ) {
		$this->log = $log;
	}

	/**
	 * Import listings.
	 *
	 * ## OPTIONS
	 * <source>  : csv | api
	 * [--file=<path>]    : CSV path (required for csv)
	 * [--dry-run]        : Validate without writing
	 * [--limit=<n>]      : Limit number of records
	 * [--skip-images]    : Do not download images
	 *
	 * @when after_wp_load
	 */
	public function __invoke( $args, $assoc ) {
		$source      = $args[0] ?? '';
		$dry         = isset( $assoc['dry-run'] );
		$skip_images = isset( $assoc['skip-images'] );
		$limit       = (int) ( $assoc['limit'] ?? 0 );

		$sync = new Sync_Manager( $this->log );

		if ( 'csv' === $source ) {
			$file = $assoc['file'] ?? '';
			if ( ! $file || ! is_readable( $file ) ) {
				\WP_CLI::error( 'Provide a readable --file=<path.csv>' );
			}
			$csv  = new CSV_Importer();
			$read = $csv->read( $file );
			if ( empty( $read['rows'] ) ) {
				\WP_CLI::error( 'No data rows found in CSV.' );
			}
			$records = array_map( fn( $row ) => $csv->normalize_row( $row ), $read['rows'] );
		} elseif ( 'api' === $source ) {
			if ( ! Settings::has_api_creds() ) {
				\WP_CLI::error( 'eBay API credentials not configured.' );
			}
			$client = new Ebay_API_Client( $this->log );
			$fetch  = $client->fetch_active_listings( $limit );
			foreach ( $fetch['errors'] as $e ) {
				\WP_CLI::warning( $e );
			}
			$records = $fetch['records'];
		} else {
			\WP_CLI::error( 'Source must be "csv" or "api".' );
		}

		$report = $sync->import_records( $records, array(
			'dry_run' => $dry, 'skip_images' => $skip_images, 'limit' => $limit, 'source' => $source,
		) );
		$path = $report->write_csv();
		\WP_CLI::success( $report->summary_line() . ( $path ? "\nReport: $path" : '' ) );
	}
}
