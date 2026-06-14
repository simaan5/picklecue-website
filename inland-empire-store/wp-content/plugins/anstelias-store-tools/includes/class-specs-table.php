<?php
/**
 * Technical specifications table + summary grid renderers.
 *
 * Pulls from the custom product attributes defined in Utils::attributes().
 *
 * @package Anstelias\StoreTools
 */

namespace Anstelias\StoreTools;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Specs_Table {

	/** Attributes featured in the compact "summary grid" near the top. */
	const SUMMARY_KEYS = array( 'Brand', 'Model', 'Condition', 'Tested Status', 'CPU', 'RAM', 'Storage Capacity', 'Form Factor' );

	/**
	 * Compact key spec grid shown above the add-to-cart button.
	 */
	public static function render_summary( \WC_Product $product ): string {
		$rows = array();
		foreach ( self::SUMMARY_KEYS as $key ) {
			$val = Condition_Badges::get_attr( $product, $key );
			if ( '' !== $val ) {
				$rows[ $key ] = $val;
			}
		}
		// Always surface SKU if present.
		if ( $product->get_sku() ) {
			$rows = array( 'SKU' => $product->get_sku() ) + $rows;
		}
		if ( empty( $rows ) ) {
			return '';
		}

		$out  = '<div class="ie-summary-grid" aria-label="' . esc_attr__( 'Key specifications', 'anstelias-store-tools' ) . '">';
		foreach ( $rows as $label => $value ) {
			$out .= '<div class="ie-summary-grid__item">';
			$out .= '<span class="ie-summary-grid__label">' . esc_html( $label ) . '</span>';
			$out .= '<span class="ie-summary-grid__value">' . esc_html( $value ) . '</span>';
			$out .= '</div>';
		}
		$out .= '</div>';
		return $out;
	}

	/**
	 * Full specifications table built from all known attributes.
	 */
	public static function render_full( \WC_Product $product ): string {
		$rows = array();
		foreach ( Utils::attributes() as $key ) {
			$val = Condition_Badges::get_attr( $product, $key );
			if ( '' !== $val ) {
				$rows[ $key ] = $val;
			}
		}
		if ( $product->get_sku() ) {
			$rows = array( 'SKU' => $product->get_sku() ) + $rows;
		}
		if ( empty( $rows ) ) {
			return '';
		}

		$out  = '<table class="ie-specs-table">';
		$out .= '<caption class="screen-reader-text">' . esc_html__( 'Technical specifications', 'anstelias-store-tools' ) . '</caption>';
		$out .= '<tbody>';
		foreach ( $rows as $label => $value ) {
			$out .= '<tr>';
			$out .= '<th scope="row">' . esc_html( $label ) . '</th>';
			$out .= '<td>' . esc_html( $value ) . '</td>';
			$out .= '</tr>';
		}
		$out .= '</tbody></table>';
		return $out;
	}
}
