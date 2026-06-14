<?php
/**
 * Orchestrates import runs (CSV + API) and price/quantity sync.
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Sync_Manager {

	/** @var Logger */
	private $log;
	/** @var Product_Mapper */
	private $mapper;

	public function __construct( Logger $log ) {
		$this->log    = $log;
		$this->mapper = new Product_Mapper( $log );
	}

	/**
	 * Import an array of normalized records.
	 *
	 * @param array $records Normalized records.
	 * @param array $opts    ['dry_run','skip_images','reprocess_images','limit','source'].
	 * @return Reporting
	 */
	public function import_records( array $records, array $opts = array() ): Reporting {
		$opts = wp_parse_args( $opts, array(
			'dry_run' => false, 'skip_images' => false, 'reprocess_images' => false,
			'limit' => 0, 'source' => 'csv',
		) );

		$report = new Reporting();
		$count  = 0;

		// Allow long-running imports.
		if ( function_exists( 'wc_set_time_limit' ) ) {
			wc_set_time_limit( 0 );
		}

		foreach ( $records as $record ) {
			if ( $opts['limit'] && $count >= $opts['limit'] ) {
				break;
			}
			$count++;
			try {
				$result = $this->mapper->upsert( $record, $opts );
				$report->record( $record, $result );
			} catch ( \Throwable $e ) {
				$this->log->error( 'Import row failed', array( 'title' => $record['title'] ?? '', 'error' => $e->getMessage() ) );
				$report->record_error( $record, $e->getMessage() );
			}
		}

		$this->log->info( 'Import run complete', array( 'summary' => $report->summary_line(), 'source' => $opts['source'] ) );
		return $report;
	}

	/**
	 * Sync only price + quantity for products already imported (lightweight).
	 *
	 * @param array $records Normalized records keyed by item id.
	 * @return Reporting
	 */
	public function sync_price_quantity( array $records ): Reporting {
		$report = new Reporting();
		foreach ( $records as $record ) {
			$id = $record['ebay_item_id'] ? wc_get_product_id_by_sku( $record['sku'] ) : 0;
			// Prefer item-id match.
			if ( $record['ebay_item_id'] ) {
				$found = wc_get_products( array(
					'meta_key'   => \Anstelias\StoreTools\Utils::META_EBAY_ITEM_ID,
					'meta_value' => $record['ebay_item_id'],
					'limit'      => 1,
					'return'     => 'ids',
				) );
				$id = $found ? (int) $found[0] : $id;
			}
			if ( ! $id ) {
				$report->counts['skipped']++;
				continue;
			}
			$product = wc_get_product( $id );
			if ( ! $product ) {
				$report->counts['skipped']++;
				continue;
			}
			if ( '' !== $record['price'] ) {
				$product->set_regular_price( (string) wc_format_decimal( $record['price'] ) );
			}
			$product->set_stock_quantity( max( 0, (int) $record['quantity'] ) );
			$product->set_stock_status( (int) $record['quantity'] > 0 ? 'instock' : 'outofstock' );
			$product->update_meta_data( \Anstelias\StoreTools\Utils::META_LAST_SYNCED_AT, current_time( 'mysql' ) );
			$product->save();
			$report->counts['updated']++;
		}
		return $report;
	}
}
