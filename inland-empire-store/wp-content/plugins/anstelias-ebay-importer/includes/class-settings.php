<?php
/**
 * Importer settings (eBay API creds, import defaults).
 *
 * Credentials are stored in WP options. They are never printed back to the
 * page in full and never written to logs.
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Settings {

	const OPTION = 'anstelias_ebay_settings';

	/**
	 * @return array{ebay_app_id:string,ebay_cert_id:string,ebay_dev_id:string,ebay_user_token:string,ebay_environment:string,default_status:string,default_visibility:string,markup_percent:float}
	 */
	public static function all(): array {
		$defaults = array(
			'ebay_app_id'        => '',
			'ebay_cert_id'       => '',
			'ebay_dev_id'        => '',
			'ebay_user_token'    => '',
			'ebay_environment'   => 'production',
			'default_status'     => 'draft',     // imported products always start as draft
			'default_visibility' => 'hidden',    // hidden until reviewed
			'markup_percent'     => 0.0,         // optional price markup over eBay price
		);
		$saved = get_option( self::OPTION, array() );
		return wp_parse_args( is_array( $saved ) ? $saved : array(), $defaults );
	}

	public static function get( string $key, $default = '' ) {
		$all = self::all();
		return $all[ $key ] ?? $default;
	}

	/**
	 * Persist settings from a sanitized array.
	 */
	public static function save( array $input ): void {
		$current = self::all();
		$clean = array(
			'ebay_app_id'        => sanitize_text_field( $input['ebay_app_id'] ?? $current['ebay_app_id'] ),
			'ebay_cert_id'       => sanitize_text_field( $input['ebay_cert_id'] ?? $current['ebay_cert_id'] ),
			'ebay_dev_id'        => sanitize_text_field( $input['ebay_dev_id'] ?? $current['ebay_dev_id'] ),
			// Token can be very long; preserve existing if the field was left blank.
			'ebay_user_token'    => '' !== trim( (string) ( $input['ebay_user_token'] ?? '' ) )
				? trim( wp_unslash( $input['ebay_user_token'] ) )
				: $current['ebay_user_token'],
			'ebay_environment'   => in_array( $input['ebay_environment'] ?? '', array( 'production', 'sandbox' ), true ) ? $input['ebay_environment'] : 'production',
			'default_status'     => 'draft', // enforced: never auto-publish
			'default_visibility' => in_array( $input['default_visibility'] ?? '', array( 'hidden', 'visible' ), true ) ? $input['default_visibility'] : 'hidden',
			'markup_percent'     => max( 0.0, (float) ( $input['markup_percent'] ?? 0 ) ),
		);
		update_option( self::OPTION, $clean, false );
	}

	/**
	 * True if enough API credentials exist to attempt API mode.
	 */
	public static function has_api_creds(): bool {
		$s = self::all();
		return '' !== $s['ebay_app_id'] && '' !== $s['ebay_user_token'];
	}

	/**
	 * Masked preview of a secret for display (first 4 + last 4).
	 */
	public static function mask( string $secret ): string {
		$len = strlen( $secret );
		if ( $len <= 8 ) {
			return $secret ? str_repeat( '•', $len ) : '';
		}
		return substr( $secret, 0, 4 ) . str_repeat( '•', 6 ) . substr( $secret, -4 );
	}
}
