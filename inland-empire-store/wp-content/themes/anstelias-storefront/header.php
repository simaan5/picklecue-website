<?php
/**
 * Theme header.
 *
 * @package Anstelias\Storefront
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<link rel="profile" href="https://gmpg.org/xfn/11" />
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<a class="skip-link screen-reader-text" href="#primary"><?php esc_html_e( 'Skip to content', 'anstelias-storefront' ); ?></a>

<header class="ie-header">
	<div class="ie-container ie-header__inner">
		<div class="ie-header__brand">
			<?php anstelias_site_branding(); ?>
		</div>

		<div class="ie-header__search">
			<?php anstelias_search_bar(); ?>
		</div>

		<div class="ie-header__actions">
			<?php if ( class_exists( 'WooCommerce' ) ) : ?>
				<a class="ie-header__account" href="<?php echo esc_url( get_permalink( get_option( 'woocommerce_myaccount_page_id' ) ) ); ?>">
					<span aria-hidden="true">👤</span><span class="ie-header__label"><?php esc_html_e( 'Account', 'anstelias-storefront' ); ?></span>
				</a>
				<a class="ie-header__cart" href="<?php echo esc_url( wc_get_cart_url() ); ?>">
					<span aria-hidden="true">🛒</span>
					<span class="ie-header__cart-count"><?php echo (int) WC()->cart->get_cart_contents_count(); ?></span>
				</a>
			<?php endif; ?>
			<button class="ie-nav-toggle" aria-expanded="false" aria-controls="ie-primary-nav">
				<span class="screen-reader-text"><?php esc_html_e( 'Menu', 'anstelias-storefront' ); ?></span>☰
			</button>
		</div>
	</div>

	<nav id="ie-primary-nav" class="ie-nav" aria-label="<?php esc_attr_e( 'Primary', 'anstelias-storefront' ); ?>">
		<div class="ie-container">
			<?php
			wp_nav_menu( array(
				'theme_location' => 'primary',
				'container'      => false,
				'menu_class'     => 'ie-nav__menu',
				'fallback_cb'    => 'anstelias_default_menu',
				'depth'          => 2,
			) );
			?>
		</div>
	</nav>
</header>

<?php
/**
 * Fallback nav when no menu assigned to "primary".
 */
function anstelias_default_menu(): void {
	$shop = function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'shop' ) : home_url( '/shop/' );
	$links = array(
		home_url( '/' )          => __( 'Home', 'anstelias-storefront' ),
		$shop                    => __( 'Shop', 'anstelias-storefront' ),
		add_query_arg( 'orderby', 'date', $shop ) => __( 'New Arrivals', 'anstelias-storefront' ),
		home_url( '/about/' )    => __( 'About', 'anstelias-storefront' ),
		home_url( '/contact/' )  => __( 'Contact', 'anstelias-storefront' ),
	);
	echo '<ul class="ie-nav__menu">';
	foreach ( $links as $url => $label ) {
		printf( '<li><a href="%s">%s</a></li>', esc_url( $url ), esc_html( $label ) );
	}
	echo '</ul>';
}
?>
<div id="content" class="ie-site-content">
