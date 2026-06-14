<?php
/**
 * Review queue data layer + bulk actions.
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

use Anstelias\StoreTools\Utils;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Review_Queue {

	/** @var Logger */
	private $log;

	public function __construct( Logger $log ) {
		$this->log = $log;
	}

	/**
	 * Query imported products for the queue.
	 *
	 * @param array $args ['status'=>string,'paged'=>int,'per_page'=>int,'search'=>string].
	 * @return array{items:array<int,array>,total:int,pages:int}
	 */
	public function query( array $args = array() ): array {
		$args = wp_parse_args( $args, array(
			'status'   => '',
			'paged'    => 1,
			'per_page' => 20,
			'search'   => '',
		) );

		$meta_query = array(
			array( 'key' => Utils::META_IMPORT_SOURCE, 'compare' => 'EXISTS' ),
		);
		if ( $args['status'] ) {
			$meta_query[] = array( 'key' => Utils::META_IMPORT_STATUS, 'value' => $args['status'] );
		}

		$q = new \WP_Query( array(
			'post_type'      => 'product',
			'post_status'    => array( 'draft', 'pending', 'publish' ),
			'posts_per_page' => (int) $args['per_page'],
			'paged'          => (int) $args['paged'],
			's'              => $args['search'],
			'meta_query'     => $meta_query, // phpcs:ignore WordPress.DB.SlowDBQuery
			'orderby'        => 'date',
			'order'          => 'DESC',
		) );

		$items = array();
		foreach ( $q->posts as $post ) {
			$product = wc_get_product( $post->ID );
			if ( ! $product ) {
				continue;
			}
			$terms = get_the_terms( $post->ID, 'product_cat' );
			$cat_names = ( $terms && ! is_wp_error( $terms ) ) ? wp_list_pluck( $terms, 'name' ) : array();

			$items[] = array(
				'id'         => $post->ID,
				'thumb'      => get_the_post_thumbnail_url( $post->ID, 'thumbnail' ),
				'title'      => $product->get_name(),
				'sku'        => $product->get_sku(),
				'price'      => $product->get_price(),
				'stock'      => $product->get_stock_quantity(),
				'condition'  => $product->get_attribute( 'Condition' ),
				'category'   => implode( ', ', $cat_names ),
				'confidence' => (float) $product->get_meta( '_anstelias_category_confidence' ),
				'status'     => $product->get_meta( Utils::META_IMPORT_STATUS ),
				'post_status'=> $post->post_status,
				'source_url' => $product->get_meta( Utils::META_EBAY_URL ),
				'missing'    => $this->detect_missing( $product ),
			);
		}

		return array(
			'items' => $items,
			'total' => (int) $q->found_posts,
			'pages' => (int) $q->max_num_pages,
		);
	}

	private function detect_missing( \WC_Product $product ): array {
		$missing = array();
		if ( '' === $product->get_regular_price() ) { $missing[] = 'price'; }
		if ( ! has_post_thumbnail( $product->get_id() ) ) { $missing[] = 'image'; }
		if ( '' === $product->get_attribute( 'Condition' ) ) { $missing[] = 'condition'; }
		if ( ! $product->get_category_ids() ) { $missing[] = 'category'; }
		return $missing;
	}

	/**
	 * Counts per import status for the filter tabs.
	 *
	 * @return array<string,int>
	 */
	public function status_counts(): array {
		$counts = array();
		foreach ( array(
			Utils::STATUS_IMPORTED_DRAFT, Utils::STATUS_NEEDS_REVIEW,
			Utils::STATUS_READY_TO_PUBLISH, Utils::STATUS_PUBLISHED,
			Utils::STATUS_SYNC_ERROR, Utils::STATUS_ARCHIVED,
		) as $status ) {
			$q = new \WP_Query( array(
				'post_type'      => 'product',
				'post_status'    => 'any',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'no_found_rows'  => false,
				'meta_query'     => array( array( 'key' => Utils::META_IMPORT_STATUS, 'value' => $status ) ), // phpcs:ignore
			) );
			$counts[ $status ] = (int) $q->found_posts;
		}
		return $counts;
	}

	/**
	 * Apply a bulk action to selected product IDs.
	 *
	 * @param string $action  publish|needs_review|ready|archive|reimport|delete|sync.
	 * @param int[]  $ids     Product IDs.
	 * @param array  $extra   ['category_id'=>int] for change-category.
	 * @return array{ok:int,fail:int,message:string}
	 */
	public function bulk( string $action, array $ids, array $extra = array() ): array {
		$ok = 0; $fail = 0;
		$ids = array_map( 'absint', $ids );

		foreach ( $ids as $id ) {
			$product = wc_get_product( $id );
			if ( ! $product ) { $fail++; continue; }

			switch ( $action ) {
				case 'publish':
					$product->set_status( 'publish' );
					$product->set_catalog_visibility( 'visible' );
					$product->update_meta_data( Utils::META_IMPORT_STATUS, Utils::STATUS_PUBLISHED );
					$product->save();
					$ok++;
					break;
				case 'needs_review':
					$product->update_meta_data( Utils::META_IMPORT_STATUS, Utils::STATUS_NEEDS_REVIEW );
					$product->save();
					$ok++;
					break;
				case 'ready':
					$product->update_meta_data( Utils::META_IMPORT_STATUS, Utils::STATUS_READY_TO_PUBLISH );
					$product->save();
					$ok++;
					break;
				case 'archive':
					$product->set_status( 'draft' );
					$product->set_catalog_visibility( 'hidden' );
					$product->update_meta_data( Utils::META_IMPORT_STATUS, Utils::STATUS_ARCHIVED );
					$product->save();
					$ok++;
					break;
				case 'change_category':
					$cat_id = (int) ( $extra['category_id'] ?? 0 );
					if ( $cat_id ) {
						$ids_with_anc = array_merge( array( $cat_id ), get_ancestors( $cat_id, 'product_cat' ) );
						$product->set_category_ids( array_map( 'intval', $ids_with_anc ) );
						$product->save();
						$ok++;
					} else {
						$fail++;
					}
					break;
				case 'delete':
					// Only delete drafts, never published products.
					if ( 'publish' !== $product->get_status() ) {
						wp_delete_post( $id, true );
						$ok++;
					} else {
						$fail++;
					}
					break;
				default:
					$fail++;
			}
		}

		$this->log->info( 'Bulk action', array( 'action' => $action, 'ok' => $ok, 'fail' => $fail ) );
		return array(
			'ok'      => $ok,
			'fail'    => $fail,
			'message' => sprintf( '%d updated, %d skipped/failed.', $ok, $fail ),
		);
	}
}
