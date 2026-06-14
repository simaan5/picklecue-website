<?php
/**
 * Anstelias Storefront theme functions.
 *
 * Lightweight, WooCommerce-compatible, no page builder, no paid dependencies.
 *
 * @package Anstelias\Storefront
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ANST_THEME_VERSION', '1.0.0' );

/* ---------------------------------------------------------------------------
 * Theme setup
 * ------------------------------------------------------------------------- */
add_action( 'after_setup_theme', function () {
	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'style', 'script', 'navigation-widgets' ) );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'custom-logo', array( 'height' => 60, 'width' => 220, 'flex-width' => true ) );

	// WooCommerce.
	add_theme_support( 'woocommerce' );
	add_theme_support( 'wc-product-gallery-zoom' );
	add_theme_support( 'wc-product-gallery-lightbox' );
	add_theme_support( 'wc-product-gallery-slider' );

	register_nav_menus( array(
		'primary' => __( 'Primary Menu', 'anstelias-storefront' ),
		'footer'  => __( 'Footer Menu', 'anstelias-storefront' ),
	) );
} );

/* ---------------------------------------------------------------------------
 * Assets
 * ------------------------------------------------------------------------- */
add_action( 'wp_enqueue_scripts', function () {
	$dir = get_template_directory_uri();
	wp_enqueue_style( 'anstelias-main', $dir . '/assets/css/main.css', array(), ANST_THEME_VERSION );
	if ( class_exists( 'WooCommerce' ) ) {
		wp_enqueue_style( 'anstelias-woo', $dir . '/assets/css/woocommerce.css', array( 'anstelias-main' ), ANST_THEME_VERSION );
	}
	wp_enqueue_script( 'anstelias-main', $dir . '/assets/js/main.js', array(), ANST_THEME_VERSION, true );
}, 20 );

/* ---------------------------------------------------------------------------
 * Widgets / sidebars
 * ------------------------------------------------------------------------- */
add_action( 'widgets_init', function () {
	register_sidebar( array(
		'name'          => __( 'Shop Sidebar', 'anstelias-storefront' ),
		'id'            => 'shop-sidebar',
		'description'   => __( 'Filters and categories shown on shop/category pages.', 'anstelias-storefront' ),
		'before_widget' => '<section id="%1$s" class="widget %2$s">',
		'after_widget'  => '</section>',
		'before_title'  => '<h3 class="widget-title">',
		'after_title'   => '</h3>',
	) );
	register_sidebar( array(
		'name'          => __( 'Footer', 'anstelias-storefront' ),
		'id'            => 'footer-widgets',
		'before_widget' => '<section id="%1$s" class="widget %2$s">',
		'after_widget'  => '</section>',
		'before_title'  => '<h4 class="widget-title">',
		'after_title'   => '</h4>',
	) );
} );

/* ---------------------------------------------------------------------------
 * WooCommerce layout tuning
 * ------------------------------------------------------------------------- */
// Products per page and grid columns.
add_filter( 'loop_shop_per_page', fn() => 24 );
add_filter( 'loop_shop_columns', fn() => 3 );

// Replace WooCommerce default wrappers with ours.
remove_action( 'woocommerce_before_main_content', 'woocommerce_output_content_wrapper', 10 );
remove_action( 'woocommerce_after_main_content', 'woocommerce_output_content_wrapper_end', 10 );
add_action( 'woocommerce_before_main_content', function () {
	echo '<div class="ie-container ie-shop"><main id="primary" class="ie-shop__main">';
}, 10 );
add_action( 'woocommerce_after_main_content', function () {
	echo '</main></div>';
}, 10 );

// Show SKU under the title on loop cards.
add_action( 'woocommerce_after_shop_loop_item_title', function () {
	global $product;
	if ( $product instanceof WC_Product && $product->get_sku() ) {
		echo '<span class="ie-card-sku">' . esc_html__( 'SKU:', 'anstelias-storefront' ) . ' ' . esc_html( $product->get_sku() ) . '</span>';
	}
}, 6 );

// Image sizes tuned for technical product photos.
add_action( 'after_switch_theme', function () {
	update_option( 'woocommerce_thumbnail_cropping', 'uncropped' );
} );

/* ---------------------------------------------------------------------------
 * SEO helpers (work with or without Rank Math) — Phase 8
 * ------------------------------------------------------------------------- */
require get_template_directory() . '/inc/seo.php';
require get_template_directory() . '/inc/template-helpers.php';
