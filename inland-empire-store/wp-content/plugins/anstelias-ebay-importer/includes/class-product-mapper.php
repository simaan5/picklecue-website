<?php
/**
 * Maps a normalized listing record to a WooCommerce product (upsert).
 *
 * A "record" is a plain array produced by the CSV importer or the API client:
 *   [
 *     'ebay_item_id' => '123', 'listing_url' => 'https://...',
 *     'title' => '...', 'description' => '...',
 *     'price' => '129.99', 'quantity' => 1, 'sku' => 'ABC',
 *     'condition' => 'Used', 'brand' => 'Dell', 'mpn' => '...',
 *     'ebay_category' => 'PC Desktops', 'images' => ['url', ...],
 *     'specifics' => ['RAM' => '16GB', 'CPU' => 'i7', ...],
 *   ]
 *
 * Idempotent: same item_id/SKU updates the existing product, never duplicates.
 * Imported products are always drafts pending review.
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

use Anstelias\StoreTools\Utils;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Product_Mapper {

	/** @var Logger */
	private $log;
	/** @var Category_Mapper */
	private $cats;
	/** @var Image_Importer */
	private $images;

	public function __construct( Logger $log ) {
		$this->log    = $log;
		$this->cats   = new Category_Mapper();
		$this->images = new Image_Importer( $log );
	}

	/**
	 * Required fields for a clean import; missing => needs_review.
	 *
	 * @return string[]
	 */
	public static function required_fields(): array {
		return array( 'title', 'price' );
	}

	/**
	 * Upsert one record.
	 *
	 * @param array $record      Normalized record.
	 * @param array $opts        ['dry_run'=>bool,'skip_images'=>bool,'reprocess_images'=>bool,'source'=>'csv'|'api'].
	 * @return array{action:string,product_id:int,status:string,warnings:string[],missing:string[]}
	 */
	public function upsert( array $record, array $opts = array() ): array {
		$opts = wp_parse_args( $opts, array(
			'dry_run'          => false,
			'skip_images'      => false,
			'reprocess_images' => false,
			'source'           => 'csv',
		) );

		$record   = $this->sanitize_record( $record );
		$missing  = $this->missing_fields( $record );
		$warnings = array();

		// Duplicate detection -> existing product id (0 if new).
		$existing_id = $this->find_existing( $record );
		$action      = $existing_id ? 'updated' : 'created';

		if ( $opts['dry_run'] ) {
			$cat = $this->cats->map( $record['title'], $record['ebay_category'], $record['brand'], $this->specifics_text( $record ) );
			if ( $cat['confidence'] < 0.5 ) {
				$warnings[] = 'Low category confidence (' . round( $cat['confidence'] * 100 ) . '%): ' . $cat['path'];
			}
			return array(
				'action'     => $action . ' (dry-run)',
				'product_id' => $existing_id,
				'status'     => $missing ? Utils::STATUS_NEEDS_REVIEW : Utils::STATUS_READY_TO_PUBLISH,
				'warnings'   => $warnings,
				'missing'    => $missing,
			);
		}

		// Build / load product.
		$product = $existing_id ? wc_get_product( $existing_id ) : new \WC_Product_Simple();
		if ( ! $product ) {
			$product = new \WC_Product_Simple();
		}

		$product->set_name( $record['title'] );
		$product->set_status( 'draft' ); // ALWAYS draft on import.
		$product->set_catalog_visibility( 'hidden' );
		if ( $record['description'] ) {
			$product->set_description( $record['description'] );
		}
		if ( '' !== $record['sku'] ) {
			$this->set_sku_safely( $product, $record['sku'] );
		}
		if ( '' !== $record['price'] ) {
			$price = $this->apply_markup( (float) $record['price'] );
			$product->set_regular_price( (string) $price );
		}
		// Stock.
		$product->set_manage_stock( true );
		$product->set_stock_quantity( max( 0, (int) $record['quantity'] ) );
		$product->set_stock_status( (int) $record['quantity'] > 0 ? 'instock' : 'outofstock' );

		// Attributes (custom, non-taxonomy).
		$product->set_attributes( $this->build_attributes( $record ) );

		// Category.
		$cat = $this->cats->map( $record['title'], $record['ebay_category'], $record['brand'], $this->specifics_text( $record ) );
		if ( ! empty( $cat['term_ids'] ) ) {
			$product->set_category_ids( $cat['term_ids'] );
		}
		if ( $cat['confidence'] < 0.5 ) {
			$warnings[] = 'Low category confidence (' . round( $cat['confidence'] * 100 ) . '%): ' . $cat['path'];
		}

		// Persist meta.
		$status = $missing ? Utils::STATUS_NEEDS_REVIEW : Utils::STATUS_READY_TO_PUBLISH;
		$hash   = md5( wp_json_encode( $record ) );
		$product->update_meta_data( Utils::META_IMPORT_SOURCE, $opts['source'] );
		$product->update_meta_data( Utils::META_IMPORT_STATUS, $status );
		$product->update_meta_data( Utils::META_SYNC_STATUS, 'ok' );
		$product->update_meta_data( Utils::META_LAST_SYNCED_AT, current_time( 'mysql' ) );
		$product->update_meta_data( Utils::META_PAYLOAD_HASH, $hash );
		if ( $record['ebay_item_id'] ) {
			$product->update_meta_data( Utils::META_EBAY_ITEM_ID, $record['ebay_item_id'] );
		}
		if ( $record['listing_url'] ) {
			$product->update_meta_data( Utils::META_EBAY_URL, $record['listing_url'] );
		}
		if ( ! $existing_id ) {
			$product->update_meta_data( Utils::META_IMPORTED_AT, current_time( 'mysql' ) );
		}
		// Dedup-helper meta so future re-imports match on title / brand+mpn.
		$norm = Utils::normalize_title( $record['title'] );
		if ( $norm ) {
			$product->update_meta_data( '_anstelias_norm_title', $norm );
		}
		if ( $record['brand'] && $record['mpn'] ) {
			$product->update_meta_data( '_anstelias_brand_mpn', strtolower( $record['brand'] . '|' . $record['mpn'] ) );
		}
		if ( $cat['confidence'] < 0.5 ) {
			$product->update_meta_data( '_anstelias_category_confidence', $cat['confidence'] );
		}

		$product_id = $product->save();

		// Category confidence stored as cat meta too is fine; assign cosmetic cond etc done via attrs.

		// Images (after save so the post ID exists).
		if ( ! $opts['skip_images'] && ! empty( $record['images'] ) ) {
			$img = $this->images->import_for_product( $product_id, $record['images'], $record['title'], $opts['reprocess_images'] );
			if ( $img['errors'] > 0 ) {
				$warnings[] = $img['errors'] . ' image(s) failed to download';
			}
		} elseif ( empty( $record['images'] ) ) {
			$warnings[] = 'No images in source record';
		}

		$this->log->info( ucfirst( $action ) . ' product', array(
			'product_id' => $product_id,
			'ebay_item'  => $record['ebay_item_id'],
			'status'     => $status,
		) );

		return array(
			'action'     => $action,
			'product_id' => $product_id,
			'status'     => $status,
			'warnings'   => $warnings,
			'missing'    => $missing,
		);
	}

	/* ------------------------------------------------------------------ */

	private function sanitize_record( array $r ): array {
		$defaults = array(
			'ebay_item_id' => '', 'listing_url' => '', 'title' => '', 'description' => '',
			'price' => '', 'quantity' => 0, 'sku' => '', 'condition' => '', 'brand' => '',
			'mpn' => '', 'ebay_category' => '', 'images' => array(), 'specifics' => array(),
		);
		$r = wp_parse_args( $r, $defaults );

		$r['ebay_item_id'] = preg_replace( '/[^0-9]/', '', (string) $r['ebay_item_id'] );
		$r['listing_url']  = esc_url_raw( (string) $r['listing_url'] );
		$r['title']        = sanitize_text_field( (string) $r['title'] );
		$r['description']  = wp_kses_post( (string) $r['description'] );
		$r['price']        = '' === $r['price'] ? '' : (string) wc_format_decimal( $r['price'] );
		$r['quantity']     = (int) $r['quantity'];
		$r['sku']          = sanitize_text_field( (string) $r['sku'] );
		$r['condition']    = sanitize_text_field( (string) $r['condition'] );
		$r['brand']        = sanitize_text_field( (string) $r['brand'] );
		$r['mpn']          = sanitize_text_field( (string) $r['mpn'] );
		$r['ebay_category']= sanitize_text_field( (string) $r['ebay_category'] );
		$r['images']       = array_values( array_filter( array_map( 'esc_url_raw', (array) $r['images'] ) ) );

		$clean_specifics = array();
		foreach ( (array) $r['specifics'] as $k => $v ) {
			$clean_specifics[ sanitize_text_field( (string) $k ) ] = sanitize_text_field( (string) $v );
		}
		$r['specifics'] = $clean_specifics;
		return $r;
	}

	private function missing_fields( array $r ): array {
		$missing = array();
		foreach ( self::required_fields() as $f ) {
			if ( '' === (string) $r[ $f ] ) {
				$missing[] = $f;
			}
		}
		if ( empty( $r['images'] ) ) {
			$missing[] = 'images';
		}
		if ( '' === $r['condition'] ) {
			$missing[] = 'condition';
		}
		return $missing;
	}

	/**
	 * Duplicate detection, in priority order:
	 *   1. _ebay_item_id   2. SKU   3. normalized title   4. brand + model/MPN
	 */
	private function find_existing( array $r ): int {
		// 1. eBay item id.
		if ( $r['ebay_item_id'] ) {
			$id = $this->find_by_meta( Utils::META_EBAY_ITEM_ID, $r['ebay_item_id'] );
			if ( $id ) {
				return $id;
			}
		}
		// 2. SKU.
		if ( '' !== $r['sku'] ) {
			$id = wc_get_product_id_by_sku( $r['sku'] );
			if ( $id ) {
				return (int) $id;
			}
		}
		// 3. Normalized title.
		$norm = Utils::normalize_title( $r['title'] );
		if ( $norm ) {
			$id = $this->find_by_meta( '_anstelias_norm_title', $norm );
			if ( $id ) {
				return $id;
			}
		}
		// 4. brand + mpn.
		if ( $r['brand'] && $r['mpn'] ) {
			$id = $this->find_by_meta( '_anstelias_brand_mpn', strtolower( $r['brand'] . '|' . $r['mpn'] ) );
			if ( $id ) {
				return $id;
			}
		}
		return 0;
	}

	private function find_by_meta( string $key, string $value ): int {
		global $wpdb;
		// HPOS-safe: product meta still lives in postmeta for products.
		$id = $wpdb->get_var( $wpdb->prepare( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			"SELECT post_id FROM {$wpdb->postmeta} m JOIN {$wpdb->posts} p ON p.ID = m.post_id
			 WHERE m.meta_key = %s AND m.meta_value = %s AND p.post_type = 'product' LIMIT 1",
			$key,
			$value
		) );
		return $id ? (int) $id : 0;
	}

	private function set_sku_safely( \WC_Product $product, string $sku ): void {
		$owner = wc_get_product_id_by_sku( $sku );
		if ( ! $owner || $owner === $product->get_id() ) {
			$product->set_sku( $sku );
		} else {
			$this->log->warn( 'SKU already used by another product; leaving blank', array( 'sku' => $sku ) );
		}
	}

	private function apply_markup( float $price ): float {
		$pct = (float) Settings::get( 'markup_percent', 0 );
		return $pct > 0 ? round( $price * ( 1 + $pct / 100 ), 2 ) : $price;
	}

	/**
	 * Build WooCommerce custom product attributes from condition/brand/specifics.
	 *
	 * @return array<string,\WC_Product_Attribute>
	 */
	private function build_attributes( array $r ): array {
		$values = array();
		if ( $r['brand'] )     { $values['Brand'] = $r['brand']; }
		if ( $r['mpn'] )       { $values['MPN'] = $r['mpn']; $values['Part Number'] = $r['mpn']; }
		if ( $r['condition'] ) { $values['Condition'] = $r['condition']; }

		// Map known item specifics onto our attribute names.
		$alias = array(
			'model' => 'Model', 'manufacturer' => 'Brand', 'brand' => 'Brand',
			'memory' => 'RAM', 'ram' => 'RAM', 'ram size' => 'RAM',
			'processor' => 'CPU', 'cpu' => 'CPU', 'processor type' => 'CPU',
			'gpu' => 'GPU', 'graphics' => 'GPU', 'graphics processing type' => 'GPU',
			'storage' => 'Storage Capacity', 'ssd capacity' => 'Storage Capacity',
			'hard drive capacity' => 'Storage Capacity', 'capacity' => 'Storage Capacity',
			'form factor' => 'Form Factor', 'interface' => 'Interface',
			'mpn' => 'MPN', 'type' => 'Notes',
		);
		foreach ( $r['specifics'] as $k => $v ) {
			$lk = strtolower( trim( $k ) );
			$target = $alias[ $lk ] ?? null;
			if ( $target && '' !== $v ) {
				$values[ $target ] = $v;
			}
		}

		$attributes = array();
		$position = 0;
		foreach ( $values as $name => $value ) {
			$attr = new \WC_Product_Attribute();
			$attr->set_name( $name );          // custom (non-taxonomy) attribute
			$attr->set_options( array( $value ) );
			$attr->set_position( $position++ );
			$attr->set_visible( true );
			$attr->set_variation( false );
			$attributes[ sanitize_title( $name ) ] = $attr;
		}
		return $attributes;
	}

	private function specifics_text( array $r ): string {
		return implode( ' ', array_merge( array_keys( $r['specifics'] ), array_values( $r['specifics'] ), array( $r['mpn'] ) ) );
	}
}
