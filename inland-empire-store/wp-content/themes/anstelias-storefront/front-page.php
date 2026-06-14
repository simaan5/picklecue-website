<?php
/**
 * Homepage template.
 *
 * @package Anstelias\Storefront
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
$shop_url = function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'shop' ) : home_url( '/shop/' );
?>

<section class="ie-hero">
	<div class="ie-container ie-hero__inner">
		<h1 class="ie-hero__title">
			<?php esc_html_e( 'Reliable electronics, computer parts, audio/video equipment, and business hardware — shipped from Upland, CA.', 'anstelias-storefront' ); ?>
		</h1>
		<p class="ie-hero__sub">
			<?php esc_html_e( 'A professional resale store for tested electronics, computer hardware, A/V gear, and business equipment.', 'anstelias-storefront' ); ?>
		</p>
		<div class="ie-hero__search">
			<?php anstelias_search_bar(); ?>
		</div>
		<?php anstelias_trust_badges(); ?>
	</div>
</section>

<section class="ie-section">
	<div class="ie-container">
		<h2 class="ie-section__title"><?php esc_html_e( 'Shop by category', 'anstelias-storefront' ); ?></h2>
		<?php anstelias_category_grid( 12 ); ?>
		<p class="ie-section__more"><a class="ie-btn ie-btn--ghost" href="<?php echo esc_url( $shop_url ); ?>"><?php esc_html_e( 'Browse all inventory', 'anstelias-storefront' ); ?></a></p>
	</div>
</section>

<?php if ( class_exists( 'WooCommerce' ) ) : ?>
<section class="ie-section ie-section--alt">
	<div class="ie-container">
		<h2 class="ie-section__title"><?php esc_html_e( 'New arrivals', 'anstelias-storefront' ); ?></h2>
		<?php echo do_shortcode( '[products limit="8" columns="4" orderby="date" order="DESC" visibility="visible"]' ); ?>
	</div>
</section>

<section class="ie-section">
	<div class="ie-container">
		<h2 class="ie-section__title"><?php esc_html_e( 'Featured inventory', 'anstelias-storefront' ); ?></h2>
		<?php echo do_shortcode( '[products limit="8" columns="4" visibility="featured"]' ); ?>
	</div>
</section>
<?php endif; ?>

<section class="ie-section ie-cta">
	<div class="ie-container ie-cta__inner">
		<h2><?php esc_html_e( 'Need a quote or have a question about an item?', 'anstelias-storefront' ); ?></h2>
		<p><?php esc_html_e( 'We test what we sell. Reach out before you buy — we are happy to help.', 'anstelias-storefront' ); ?></p>
		<a class="ie-btn ie-btn--primary" href="<?php echo esc_url( home_url( '/contact/' ) ); ?>"><?php esc_html_e( 'Contact support', 'anstelias-storefront' ); ?></a>
	</div>
</section>

<?php get_footer(); ?>
