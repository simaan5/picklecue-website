<?php
/**
 * Condition + tested-status badges for product cards and pages.
 *
 * @package Anstelias\StoreTools
 */

namespace Anstelias\StoreTools;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Condition_Badges {

	/**
	 * Map a free-text condition to a CSS modifier class.
	 */
	public static function condition_class( string $condition ): string {
		$c = strtolower( $condition );
		if ( str_contains( $c, 'new' ) && ! str_contains( $c, 'open' ) ) {
			return 'is-new';
		}
		if ( str_contains( $c, 'open box' ) || str_contains( $c, 'open-box' ) ) {
			return 'is-openbox';
		}
		if ( str_contains( $c, 'refurb' ) ) {
			return 'is-refurb';
		}
		if ( str_contains( $c, 'parts' ) || str_contains( $c, 'not working' ) || str_contains( $c, 'as-is' ) ) {
			return 'is-parts';
		}
		return 'is-used';
	}

	/**
	 * Render the condition badge HTML for a product (escaped).
	 */
	public static function render( \WC_Product $product ): string {
		$condition = self::get_attr( $product, 'Condition' );
		if ( '' === $condition ) {
			return '';
		}
		$class = self::condition_class( $condition );
		return sprintf(
			'<span class="ie-badge ie-badge--condition %s">%s</span>',
			esc_attr( $class ),
			esc_html( $condition )
		);
	}

	/**
	 * Render the tested-status badge if present.
	 */
	public static function render_tested( \WC_Product $product ): string {
		$tested = self::get_attr( $product, 'Tested Status' );
		if ( '' === $tested ) {
			return '';
		}
		$ok = preg_match( '/(tested|working|pass|verified|powers? on)/i', $tested );
		return sprintf(
			'<span class="ie-badge ie-badge--tested %s">%s%s</span>',
			$ok ? 'is-pass' : 'is-unknown',
			$ok ? '✓ ' : '',
			esc_html( $tested )
		);
	}

	/**
	 * Read a custom (non-taxonomy) product attribute value.
	 */
	public static function get_attr( \WC_Product $product, string $name ): string {
		$value = $product->get_attribute( $name );
		return is_string( $value ) ? trim( $value ) : '';
	}
}
