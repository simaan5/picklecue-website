<?php
/**
 * Shared, secret-safe logger used across Anstelias plugins.
 *
 * @package Anstelias\StoreTools
 */

namespace Anstelias\StoreTools;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Logger {

	/** @var string */
	private $channel;

	public function __construct( string $channel = 'store-tools' ) {
		$this->channel = sanitize_key( $channel );
	}

	public function info( string $message, array $context = array() ): void {
		$this->write( 'INFO', $message, $context );
	}

	public function warn( string $message, array $context = array() ): void {
		$this->write( 'WARN', $message, $context );
	}

	public function error( string $message, array $context = array() ): void {
		$this->write( 'ERROR', $message, $context );
	}

	/**
	 * Write a line to the WooCommerce logger if available, else error_log.
	 * Secrets are never logged: callers must not pass tokens in context.
	 */
	private function write( string $level, string $message, array $context ): void {
		$line = $message;
		if ( ! empty( $context ) ) {
			$line .= ' ' . wp_json_encode( $this->redact( $context ) );
		}

		if ( function_exists( 'wc_get_logger' ) ) {
			$logger = wc_get_logger();
			$method = strtolower( $level );
			if ( ! method_exists( $logger, $method ) ) {
				$method = 'info';
			}
			$logger->{$method}( $line, array( 'source' => 'anstelias-' . $this->channel ) );
			return;
		}

		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			error_log( sprintf( '[anstelias-%s][%s] %s', $this->channel, $level, $line ) ); // phpcs:ignore
		}
	}

	/**
	 * Defensive redaction of anything that looks like a credential.
	 */
	private function redact( array $context ): array {
		$secret_keys = array( 'token', 'secret', 'password', 'cert', 'key', 'authorization' );
		foreach ( $context as $k => $v ) {
			foreach ( $secret_keys as $needle ) {
				if ( false !== stripos( (string) $k, $needle ) ) {
					$context[ $k ] = '***redacted***';
				}
			}
		}
		return $context;
	}
}
