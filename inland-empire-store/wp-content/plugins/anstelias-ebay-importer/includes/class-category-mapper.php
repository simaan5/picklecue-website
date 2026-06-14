<?php
/**
 * Rule-based category mapper with confidence scoring.
 *
 * Uses the shared keyword rules in Store Tools' Utils class. Admin overrides
 * (eBay category -> WooCommerce category) take priority over keyword rules.
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

use Anstelias\StoreTools\Utils;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Category_Mapper {

	const MAP_OPTION = 'anstelias_ebay_category_map';

	/**
	 * Resolve a category for a product.
	 *
	 * @param string $title       Listing title.
	 * @param string $ebay_cat    eBay category name/id (may be empty).
	 * @param string $brand       Brand item-specific.
	 * @param string $extra       Any additional text (description snippet, specifics).
	 * @return array{term_ids:int[],path:string,confidence:float,detected:string}
	 */
	public function map( string $title, string $ebay_cat = '', string $brand = '', string $extra = '' ): array {
		// 1. Explicit admin override by eBay category.
		$overrides = get_option( self::MAP_OPTION, array() );
		if ( $ebay_cat && is_array( $overrides ) && isset( $overrides[ $ebay_cat ] ) ) {
			$term_id = (int) $overrides[ $ebay_cat ];
			$term = get_term( $term_id, 'product_cat' );
			if ( $term && ! is_wp_error( $term ) ) {
				return array(
					'term_ids'   => $this->with_ancestors( $term_id ),
					'path'       => $this->path_for( $term ),
					'confidence' => 1.0,
					'detected'   => $ebay_cat,
				);
			}
		}

		// 2. Keyword rules with scoring.
		$haystack = strtolower( $title . ' ' . $brand . ' ' . $extra );
		$best = null;
		foreach ( Utils::category_rules() as $rule ) {
			foreach ( $rule['keywords'] as $kw ) {
				if ( str_contains( $haystack, $kw ) ) {
					if ( null === $best || $rule['score'] > $best['score'] ) {
						$best = $rule;
					}
					break;
				}
			}
		}

		if ( $best ) {
			$term_ids = $this->resolve_path( $best['path'][0], $best['path'][1] );
			return array(
				'term_ids'   => $term_ids,
				'path'       => $best['path'][1] ? "{$best['path'][0]} > {$best['path'][1]}" : $best['path'][0],
				'confidence' => (float) $best['score'],
				'detected'   => $ebay_cat,
			);
		}

		// 3. Fallback: Miscellaneous, low confidence -> forces manual review.
		return array(
			'term_ids'   => $this->resolve_path( 'Miscellaneous', null ),
			'path'       => 'Miscellaneous',
			'confidence' => 0.1,
			'detected'   => $ebay_cat,
		);
	}

	/**
	 * Resolve "Top > Sub" names to existing term IDs (incl. ancestors).
	 *
	 * @return int[]
	 */
	private function resolve_path( string $top, ?string $sub ): array {
		$ids = array();
		$top_term = get_term_by( 'name', $top, 'product_cat' );
		if ( $top_term ) {
			$ids[] = (int) $top_term->term_id;
		}
		if ( $sub ) {
			$sub_term = get_term_by( 'name', $sub, 'product_cat' );
			if ( $sub_term ) {
				$ids[] = (int) $sub_term->term_id;
			}
		}
		return array_values( array_unique( $ids ) );
	}

	private function with_ancestors( int $term_id ): array {
		$ids = array( $term_id );
		foreach ( get_ancestors( $term_id, 'product_cat' ) as $a ) {
			$ids[] = (int) $a;
		}
		return array_values( array_unique( $ids ) );
	}

	private function path_for( \WP_Term $term ): string {
		$names = array( $term->name );
		foreach ( get_ancestors( $term->term_id, 'product_cat' ) as $a ) {
			$t = get_term( $a, 'product_cat' );
			if ( $t && ! is_wp_error( $t ) ) {
				array_unshift( $names, $t->name );
			}
		}
		return implode( ' > ', $names );
	}
}
