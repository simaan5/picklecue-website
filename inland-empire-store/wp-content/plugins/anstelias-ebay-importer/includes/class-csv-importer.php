<?php
/**
 * Parses an eBay Seller Hub / File Exchange CSV export into normalized records.
 *
 * eBay column headers vary by account and category, so we match headers by a
 * set of aliases (case-insensitive). Unknown columns ending up as item
 * specifics are preserved.
 *
 * @package Anstelias\EbayImporter;
 */

namespace Anstelias\EbayImporter;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class CSV_Importer {

	/**
	 * Header aliases -> canonical record field.
	 *
	 * @return array<string,string>
	 */
	public static function header_aliases(): array {
		return array(
			// item id
			'item number' => 'ebay_item_id', 'itemid' => 'ebay_item_id', 'item id' => 'ebay_item_id', 'ebay item number' => 'ebay_item_id', 'item' => 'ebay_item_id',
			// title
			'title' => 'title', 'item title' => 'title', 'listing title' => 'title',
			// sku / custom label
			'custom label' => 'sku', 'custom label (sku)' => 'sku', 'sku' => 'sku', 'customlabel' => 'sku',
			// price
			'current price' => 'price', 'start price' => 'price', 'price' => 'price', 'buy it now price' => 'price', 'fixed price' => 'price',
			// quantity
			'available quantity' => 'quantity', 'quantity' => 'quantity', 'quantity available' => 'quantity', 'qty' => 'quantity',
			// condition
			'condition' => 'condition', 'item condition' => 'condition',
			// category
			'category' => 'ebay_category', 'ebay category' => 'ebay_category', 'category name' => 'ebay_category', 'store category' => 'ebay_category',
			// url
			'item url' => 'listing_url', 'url' => 'listing_url', 'view item url' => 'listing_url', 'listing url' => 'listing_url',
			// brand / mpn
			'brand' => 'brand', 'manufacturer' => 'brand',
			'mpn' => 'mpn', 'manufacturer part number' => 'mpn',
			// description
			'description' => 'description', 'item description' => 'description',
			// images
			'picture url' => 'images', 'image url' => 'images', 'gallery url' => 'images', 'pictureurl' => 'images', 'photo url' => 'images',
		);
	}

	/**
	 * Read a CSV file and return [headers, rows(assoc)].
	 *
	 * @return array{headers:string[],rows:array<int,array<string,string>>}
	 */
	public function read( string $path ): array {
		$rows = array();
		$headers = array();
		if ( ! is_readable( $path ) ) {
			return array( 'headers' => $headers, 'rows' => $rows );
		}
		$fh = fopen( $path, 'r' );
		if ( ! $fh ) {
			return array( 'headers' => $headers, 'rows' => $rows );
		}
		// Skip any leading "eBay header" lines until we find a row that looks like headers.
		$line = 0;
		while ( ( $data = fgetcsv( $fh ) ) !== false ) {
			$line++;
			if ( empty( $headers ) ) {
				$joined = strtolower( implode( ',', array_map( 'strval', $data ) ) );
				if ( str_contains( $joined, 'title' ) || str_contains( $joined, 'item number' ) || str_contains( $joined, 'custom label' ) ) {
					$headers = array_map( fn( $h ) => trim( (string) $h ), $data );
				}
				continue;
			}
			if ( count( array_filter( $data, fn( $v ) => '' !== trim( (string) $v ) ) ) === 0 ) {
				continue; // blank line
			}
			$assoc = array();
			foreach ( $headers as $i => $h ) {
				$assoc[ $h ] = isset( $data[ $i ] ) ? trim( (string) $data[ $i ] ) : '';
			}
			$rows[] = $assoc;
		}
		fclose( $fh );
		return array( 'headers' => $headers, 'rows' => $rows );
	}

	/**
	 * Normalize one assoc CSV row into a record array for the Product_Mapper.
	 *
	 * @param array               $row     Assoc row.
	 * @param array<string,string> $mapping Optional header->field override (from UI).
	 * @return array
	 */
	public function normalize_row( array $row, array $mapping = array() ): array {
		$aliases = self::header_aliases();
		$record = array(
			'ebay_item_id' => '', 'listing_url' => '', 'title' => '', 'description' => '',
			'price' => '', 'quantity' => 1, 'sku' => '', 'condition' => '', 'brand' => '',
			'mpn' => '', 'ebay_category' => '', 'images' => array(), 'specifics' => array(),
		);

		foreach ( $row as $header => $value ) {
			$key = strtolower( trim( $header ) );
			$field = $mapping[ $header ] ?? ( $aliases[ $key ] ?? null );

			if ( null === $field ) {
				// Treat as an item specific if it has content.
				if ( '' !== $value ) {
					$record['specifics'][ $header ] = $value;
				}
				continue;
			}

			if ( 'images' === $field ) {
				// eBay packs multiple image URLs separated by | or ;.
				$urls = preg_split( '/[|;,]\s*/', $value ) ?: array();
				$record['images'] = array_merge( $record['images'], array_filter( array_map( 'trim', $urls ) ) );
			} else {
				$record[ $field ] = $value;
			}
		}

		$record['images'] = array_values( array_unique( array_filter( $record['images'] ) ) );
		if ( '' === (string) $record['quantity'] ) {
			$record['quantity'] = 1;
		}
		return $record;
	}
}
