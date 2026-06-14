<?php
/**
 * SEO helpers (Phase 8).
 *
 * Works alongside Rank Math (free) if active, but also stands alone:
 *  - product meta title/description templates
 *  - image alt text defaulting to the product title
 *  - JSON-LD Product schema (only if no SEO plugin already emits it)
 *
 * @package Anstelias\Storefront
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * True when a dedicated SEO plugin is handling meta/schema.
 */
function anstelias_seo_plugin_active(): bool {
	return defined( 'RANK_MATH_VERSION' ) || defined( 'WPSEO_VERSION' );
}

/**
 * Build a product meta title:
 *   {Brand} {Model} {MPN/SKU} - {Condition} | Anstelias Technology
 */
function anstelias_product_meta_title( WC_Product $product ): string {
	$brand     = $product->get_attribute( 'Brand' );
	$model     = $product->get_attribute( 'Model' );
	$mpn       = $product->get_attribute( 'MPN' ) ?: $product->get_sku();
	$condition = $product->get_attribute( 'Condition' );

	$parts = array_filter( array( $brand, $model, $mpn ) );
	$lead  = $parts ? implode( ' ', $parts ) : $product->get_name();
	$title = $lead;
	if ( $condition ) {
		$title .= ' - ' . $condition;
	}
	return $title . ' | Anstelias Technology';
}

/**
 * Build a product meta description.
 */
function anstelias_product_meta_description( WC_Product $product ): string {
	$brand     = $product->get_attribute( 'Brand' );
	$model     = $product->get_attribute( 'Model' );
	$condition = $product->get_attribute( 'Condition' ) ?: 'Used';
	$terms     = get_the_terms( $product->get_id(), 'product_cat' );
	$category  = ( $terms && ! is_wp_error( $terms ) ) ? $terms[0]->name : 'electronics';

	return trim( sprintf(
		'Shop %s %s %s from Anstelias Technology. Condition: %s. Ships from Upland, CA. Secure checkout with PayPal or card.',
		$brand,
		$model,
		$category,
		$condition
	) );
}

// Only emit our own meta tags when no SEO plugin is present.
add_action( 'wp_head', function () {
	if ( anstelias_seo_plugin_active() || ! function_exists( 'is_product' ) || ! is_product() ) {
		return;
	}
	global $product;
	if ( ! $product instanceof WC_Product ) {
		$product = wc_get_product( get_the_ID() );
	}
	if ( ! $product instanceof WC_Product ) {
		return;
	}
	$desc = anstelias_product_meta_description( $product );
	printf( "<meta name=\"description\" content=\"%s\" />\n", esc_attr( $desc ) );
	printf( "<link rel=\"canonical\" href=\"%s\" />\n", esc_url( get_permalink( $product->get_id() ) ) );
}, 1 );

// Use the product title as a sensible default image alt where alt is empty.
add_filter( 'wp_get_attachment_image_attributes', function ( $attr, $attachment ) {
	if ( empty( $attr['alt'] ) ) {
		$parent = wp_get_post_parent_id( $attachment->ID );
		if ( $parent && 'product' === get_post_type( $parent ) ) {
			$attr['alt'] = get_the_title( $parent );
		}
	}
	return $attr;
}, 10, 2 );

// Override the <title> for products when running without an SEO plugin.
add_filter( 'document_title_parts', function ( $parts ) {
	if ( anstelias_seo_plugin_active() || ! function_exists( 'is_product' ) || ! is_product() ) {
		return $parts;
	}
	$product = wc_get_product( get_the_ID() );
	if ( $product instanceof WC_Product ) {
		$parts['title'] = anstelias_product_meta_title( $product );
		unset( $parts['site'], $parts['tagline'] );
	}
	return $parts;
} );
