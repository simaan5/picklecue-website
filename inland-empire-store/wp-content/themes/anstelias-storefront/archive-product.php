<?php
/**
 * Product archive (shop + category) with a category sidebar.
 *
 * Delegates the product loop to WooCommerce's own template via wc_get_template,
 * so all WooCommerce loop hooks (incl. our condition badges) still fire.
 *
 * @package Anstelias\Storefront
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<div class="ie-container ie-archive">
	<aside class="ie-archive__sidebar" aria-label="<?php esc_attr_e( 'Filters', 'anstelias-storefront' ); ?>">
		<div class="ie-archive__search"><?php anstelias_search_bar( __( 'Search inventory…', 'anstelias-storefront' ) ); ?></div>
		<h3 class="widget-title"><?php esc_html_e( 'Categories', 'anstelias-storefront' ); ?></h3>
		<?php
		wp_list_categories( array(
			'taxonomy'     => 'product_cat',
			'title_li'     => '',
			'hide_empty'   => false,
			'show_count'   => true,
			'hierarchical' => true,
		) );

		if ( is_active_sidebar( 'shop-sidebar' ) ) {
			dynamic_sidebar( 'shop-sidebar' );
		}
		?>
	</aside>

	<main id="primary" class="ie-archive__main">
		<?php if ( apply_filters( 'woocommerce_show_page_title', true ) ) : ?>
			<h1 class="ie-page-title woocommerce-products-header__title"><?php woocommerce_page_title(); ?></h1>
		<?php endif; ?>

		<?php do_action( 'woocommerce_archive_description' ); ?>

		<?php if ( woocommerce_product_loop() ) : ?>
			<?php do_action( 'woocommerce_before_shop_loop' ); ?>

			<?php woocommerce_product_loop_start(); ?>
				<?php while ( have_posts() ) : the_post(); ?>
					<?php wc_get_template_part( 'content', 'product' ); ?>
				<?php endwhile; ?>
			<?php woocommerce_product_loop_end(); ?>

			<?php do_action( 'woocommerce_after_shop_loop' ); ?>
		<?php else : ?>
			<?php do_action( 'woocommerce_no_products_found' ); ?>
		<?php endif; ?>
	</main>
</div>
<?php
get_footer();
