<?php
/**
 * Downloads eBay images and rehosts them in the Media Library.
 *
 * Never hotlinks eBay URLs. De-duplicates via a per-attachment source-URL hash
 * so re-running an import does not re-download the same image.
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Image_Importer {

	const META_SOURCE_HASH = '_anstelias_image_source_hash';

	/** @var Logger */
	private $log;

	public function __construct( Logger $log ) {
		$this->log = $log;
		// Pull the larger eBay variant when a thumbnail URL is given.
	}

	/**
	 * Import a list of image URLs and attach to a product.
	 *
	 * @param int      $product_id   Product post ID.
	 * @param string[] $urls         Ordered image URLs (first = featured).
	 * @param string   $alt          Alt text (product title).
	 * @param bool     $reprocess    Force re-download even if hash matches.
	 * @return array{featured:int,gallery:int[],skipped:int,errors:int}
	 */
	public function import_for_product( int $product_id, array $urls, string $alt = '', bool $reprocess = false ): array {
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';

		$result = array( 'featured' => 0, 'gallery' => array(), 'skipped' => 0, 'errors' => 0 );
		$attachment_ids = array();

		foreach ( array_values( array_filter( array_unique( $urls ) ) ) as $i => $url ) {
			$url = $this->upgrade_ebay_url( $url );
			$hash = md5( $url );

			$existing = $this->find_existing( $hash );
			if ( $existing && ! $reprocess ) {
				$attachment_ids[] = $existing;
				$result['skipped']++;
				continue;
			}

			$att_id = $this->sideload( $url, $product_id, $alt );
			if ( is_wp_error( $att_id ) ) {
				$this->log->warn( 'Image download failed', array( 'url' => $url, 'error' => $att_id->get_error_message() ) );
				$result['errors']++;
				continue;
			}
			update_post_meta( $att_id, self::META_SOURCE_HASH, $hash );
			$attachment_ids[] = $att_id;
		}

		if ( ! empty( $attachment_ids ) ) {
			$featured = array_shift( $attachment_ids );
			set_post_thumbnail( $product_id, $featured );
			$result['featured'] = $featured;
			if ( ! empty( $attachment_ids ) ) {
				update_post_meta( $product_id, '_product_image_gallery', implode( ',', $attachment_ids ) );
				$result['gallery'] = $attachment_ids;
			}
		}

		return $result;
	}

	/**
	 * eBay thumbnail URLs end in s-l64/s-l225 etc. Request a larger variant.
	 */
	private function upgrade_ebay_url( string $url ): string {
		return preg_replace( '#s-l\d+\.#', 's-l1600.', $url ) ?: $url;
	}

	/**
	 * Find an attachment previously imported from the same source URL.
	 */
	private function find_existing( string $hash ): int {
		$q = new \WP_Query( array(
			'post_type'      => 'attachment',
			'post_status'    => 'inherit',
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'no_found_rows'  => true,
			'meta_key'       => self::META_SOURCE_HASH, // phpcs:ignore WordPress.DB.SlowDBQuery
			'meta_value'     => $hash, // phpcs:ignore WordPress.DB.SlowDBQuery
		) );
		return $q->have_posts() ? (int) $q->posts[0] : 0;
	}

	/**
	 * Download + sideload one image. Validates that the file is a real image.
	 *
	 * @return int|\WP_Error attachment id or error.
	 */
	private function sideload( string $url, int $product_id, string $alt ) {
		$tmp = download_url( $url, 30 );
		if ( is_wp_error( $tmp ) ) {
			return $tmp;
		}

		// Validate it is genuinely an image before importing.
		$check = wp_check_filetype_and_ext( $tmp, basename( wp_parse_url( $url, PHP_URL_PATH ) ?: 'image.jpg' ) );
		$is_image = ! empty( $check['type'] ) && str_starts_with( (string) $check['type'], 'image/' );
		if ( ! $is_image ) {
			$info = @getimagesize( $tmp ); // phpcs:ignore
			$is_image = false !== $info;
		}
		if ( ! $is_image ) {
			@unlink( $tmp ); // phpcs:ignore
			return new \WP_Error( 'not_image', 'Downloaded file is not a valid image' );
		}

		$file_array = array(
			'name'     => $this->filename_from_url( $url, $alt ),
			'tmp_name' => $tmp,
		);
		$att_id = media_handle_sideload( $file_array, $product_id, $alt );
		if ( is_wp_error( $att_id ) ) {
			@unlink( $tmp ); // phpcs:ignore
			return $att_id;
		}
		if ( $alt ) {
			update_post_meta( $att_id, '_wp_attachment_image_alt', sanitize_text_field( $alt ) );
		}
		return (int) $att_id;
	}

	private function filename_from_url( string $url, string $alt ): string {
		$base = sanitize_title( $alt ?: 'product' );
		$ext  = pathinfo( wp_parse_url( $url, PHP_URL_PATH ) ?: '', PATHINFO_EXTENSION ) ?: 'jpg';
		return $base . '-' . substr( md5( $url ), 0, 8 ) . '.' . preg_replace( '/[^a-z0-9]/i', '', $ext );
	}
}
