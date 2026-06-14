<?php
/**
 * Importer logger. Reuses Store Tools' logger when available, otherwise
 * falls back to the WooCommerce logger directly.
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Logger {

	/** @var object */
	private $inner;

	public function __construct() {
		if ( class_exists( '\Anstelias\StoreTools\Logger' ) ) {
			$this->inner = new \Anstelias\StoreTools\Logger( 'ebay-importer' );
		}
	}

	public function info( string $m, array $c = array() ): void { $this->log( 'info', $m, $c ); }
	public function warn( string $m, array $c = array() ): void { $this->log( 'warning', $m, $c ); }
	public function error( string $m, array $c = array() ): void { $this->log( 'error', $m, $c ); }

	private function log( string $level, string $message, array $context ): void {
		if ( $this->inner ) {
			$map = array( 'warning' => 'warn' );
			$method = $map[ $level ] ?? $level;
			if ( method_exists( $this->inner, $method ) ) {
				$this->inner->{$method}( $message, $context );
				return;
			}
		}
		if ( function_exists( 'wc_get_logger' ) ) {
			wc_get_logger()->log( $level, $message . ( $context ? ' ' . wp_json_encode( $context ) : '' ), array( 'source' => 'anstelias-ebay-importer' ) );
		}
	}

	/**
	 * Read recent log lines from the WooCommerce log files for display.
	 *
	 * @return string[]
	 */
	public static function tail( int $lines = 200 ): array {
		$out = array();
		if ( ! function_exists( 'wc_get_log_file_path' ) ) {
			return $out;
		}
		// WooCommerce names files like source-YYYY-MM-DD-hash.log.
		$dir = trailingslashit( WP_CONTENT_DIR ) . 'uploads/wc-logs/';
		$files = glob( $dir . 'anstelias-ebay-importer-*.log' );
		if ( empty( $files ) ) {
			return $out;
		}
		rsort( $files );
		$content = @file( $files[0], FILE_IGNORE_NEW_LINES ); // phpcs:ignore
		if ( $content ) {
			$out = array_slice( $content, -$lines );
		}
		return $out;
	}
}
