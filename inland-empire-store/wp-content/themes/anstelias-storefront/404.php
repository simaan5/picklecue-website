<?php
/**
 * 404 template.
 *
 * @package Anstelias\Storefront
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
$shop_url = function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'shop' ) : home_url( '/shop/' );
?>
<div class="ie-container">
	<main id="primary" class="ie-main ie-404">
		<h1 class="ie-page-title"><?php esc_html_e( 'Page not found', 'anstelias-storefront' ); ?></h1>
		<p><?php esc_html_e( 'That page moved or never existed. Try searching our inventory:', 'anstelias-storefront' ); ?></p>
		<?php anstelias_search_bar(); ?>
		<p class="ie-404__links">
			<a class="ie-btn ie-btn--primary" href="<?php echo esc_url( $shop_url ); ?>"><?php esc_html_e( 'Browse the shop', 'anstelias-storefront' ); ?></a>
			<a class="ie-btn ie-btn--ghost" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Go home', 'anstelias-storefront' ); ?></a>
		</p>
	</main>
</div>
<?php
get_footer();
