<?php
/**
 * Small template helper functions used by the theme templates.
 *
 * @package Anstelias\Storefront
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Output the site logo or text fallback.
 */
function anstelias_site_branding(): void {
	if ( has_custom_logo() ) {
		the_custom_logo();
		return;
	}
	printf(
		'<a class="ie-logo" href="%s"><span class="ie-logo__brand">Inland Empire Electronics</span><span class="ie-logo__by">by Anstelias Technology</span></a>',
		esc_url( home_url( '/' ) )
	);
}

/**
 * Render the large product search bar (search-first UX).
 */
function anstelias_search_bar( string $placeholder = '' ): void {
	$placeholder = $placeholder ?: __( 'Search electronics, parts, brand, model, SKU…', 'anstelias-storefront' );
	$action      = function_exists( 'wc_get_page_permalink' ) ? get_post_type_archive_link( 'product' ) : home_url( '/' );
	?>
	<form role="search" method="get" class="ie-search" action="<?php echo esc_url( home_url( '/' ) ); ?>">
		<label class="screen-reader-text" for="ie-search-field"><?php esc_html_e( 'Search products', 'anstelias-storefront' ); ?></label>
		<input type="search" id="ie-search-field" class="ie-search__input" name="s"
			value="<?php echo esc_attr( get_search_query() ); ?>"
			placeholder="<?php echo esc_attr( $placeholder ); ?>" />
		<input type="hidden" name="post_type" value="product" />
		<button type="submit" class="ie-search__btn"><?php esc_html_e( 'Search', 'anstelias-storefront' ); ?></button>
	</form>
	<?php
}

/**
 * Trust-badge strip used on the homepage and footer.
 */
function anstelias_trust_badges(): void {
	$badges = array(
		array( '🔒', __( 'Secure checkout', 'anstelias-storefront' ) ),
		array( '💳', __( 'PayPal &amp; cards accepted', 'anstelias-storefront' ) ),
		array( '📦', __( 'USPS / UPS shipping', 'anstelias-storefront' ) ),
		array( '☀️', __( 'Ships from Southern California', 'anstelias-storefront' ) ),
	);
	echo '<ul class="ie-trust">';
	foreach ( $badges as $b ) {
		printf(
			'<li class="ie-trust__item"><span class="ie-trust__icon" aria-hidden="true">%s</span><span>%s</span></li>',
			esc_html( $b[0] ),
			wp_kses_post( $b[1] )
		);
	}
	echo '</ul>';
}

/**
 * Grid of top-level product categories with counts.
 */
function anstelias_category_grid( int $limit = 12 ): void {
	if ( ! taxonomy_exists( 'product_cat' ) ) {
		return;
	}
	$terms = get_terms( array(
		'taxonomy'   => 'product_cat',
		'parent'     => 0,
		'hide_empty' => false,
		'number'     => $limit,
		'exclude'    => array( get_option( 'default_product_cat', 0 ) ),
	) );
	if ( is_wp_error( $terms ) || empty( $terms ) ) {
		return;
	}
	echo '<ul class="ie-cat-grid">';
	foreach ( $terms as $term ) {
		printf(
			'<li class="ie-cat-grid__item"><a href="%s"><span class="ie-cat-grid__name">%s</span><span class="ie-cat-grid__count">%d %s</span></a></li>',
			esc_url( get_term_link( $term ) ),
			esc_html( $term->name ),
			(int) $term->count,
			esc_html( _n( 'item', 'items', (int) $term->count, 'anstelias-storefront' ) )
		);
	}
	echo '</ul>';
}
