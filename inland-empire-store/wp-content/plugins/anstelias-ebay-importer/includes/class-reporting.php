<?php
/**
 * Import run reporting: accumulate counters + per-row outcomes, write a CSV.
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Reporting {

	/** @var array{created:int,updated:int,skipped:int,errors:int,needs_review:int} */
	public $counts = array( 'created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => 0, 'needs_review' => 0 );

	/** @var array<int,array> */
	public $rows = array();

	public function record( array $record, array $result ): void {
		$action = $result['action'] ?? '';
		if ( str_starts_with( $action, 'created' ) ) {
			$this->counts['created']++;
		} elseif ( str_starts_with( $action, 'updated' ) ) {
			$this->counts['updated']++;
		} elseif ( 'skipped' === $action ) {
			$this->counts['skipped']++;
		}
		if ( ! empty( $result['missing'] ) ) {
			$this->counts['needs_review']++;
		}

		$this->rows[] = array(
			'ebay_item_id' => $record['ebay_item_id'] ?? '',
			'sku'          => $record['sku'] ?? '',
			'title'        => $record['title'] ?? '',
			'action'       => $action,
			'product_id'   => $result['product_id'] ?? 0,
			'status'       => $result['status'] ?? '',
			'missing'      => implode( '|', $result['missing'] ?? array() ),
			'warnings'     => implode( '|', $result['warnings'] ?? array() ),
		);
	}

	public function record_error( array $record, string $message ): void {
		$this->counts['errors']++;
		$this->rows[] = array(
			'ebay_item_id' => $record['ebay_item_id'] ?? '',
			'sku'          => $record['sku'] ?? '',
			'title'        => $record['title'] ?? '',
			'action'       => 'error',
			'product_id'   => 0,
			'status'       => 'error',
			'missing'      => '',
			'warnings'     => $message,
		);
	}

	/**
	 * Write a CSV report to the protected import dir and return its URL.
	 */
	public function write_csv(): string {
		$dir  = wp_upload_dir();
		$path = trailingslashit( $dir['basedir'] ) . 'anstelias-imports';
		wp_mkdir_p( $path );
		$file = $path . '/report-' . gmdate( 'Ymd-His' ) . '.csv';

		$fh = fopen( $file, 'w' );
		if ( ! $fh ) {
			return '';
		}
		fputcsv( $fh, array( 'ebay_item_id', 'sku', 'title', 'action', 'product_id', 'status', 'missing', 'warnings' ) );
		foreach ( $this->rows as $r ) {
			fputcsv( $fh, $r );
		}
		fclose( $fh );
		return $file;
	}

	public function summary_line(): string {
		return sprintf(
			'Created: %d · Updated: %d · Needs review: %d · Skipped: %d · Errors: %d',
			$this->counts['created'],
			$this->counts['updated'],
			$this->counts['needs_review'],
			$this->counts['skipped'],
			$this->counts['errors']
		);
	}
}
