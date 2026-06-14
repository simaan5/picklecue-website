<?php
/**
 * Search results. Product searches route through WooCommerce archive styling.
 *
 * @package Anstelias\Storefront
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<div class="ie-container">
	<main id="primary" class="ie-main">
		<header class="ie-search-header">
			<h1 class="ie-page-title">
				<?php
				/* translators: %s: search query */
				printf( esc_html__( 'Results for: %s', 'anstelias-storefront' ), '<span>' . esc_html( get_search_query() ) . '</span>' );
				?>
			</h1>
			<?php anstelias_search_bar(); ?>
		</header>

		<?php if ( have_posts() ) : ?>
			<div class="ie-search-results">
				<?php while ( have_posts() ) : the_post(); ?>
					<article <?php post_class( 'ie-search-result' ); ?>>
						<h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
						<?php
						if ( 'product' === get_post_type() ) {
							$p = wc_get_product( get_the_ID() );
							if ( $p ) {
								echo '<div class="ie-search-result__price">' . wp_kses_post( $p->get_price_html() ) . '</div>';
							}
						}
						?>
						<div class="ie-search-result__excerpt"><?php the_excerpt(); ?></div>
					</article>
				<?php endwhile; ?>
			</div>
			<?php the_posts_pagination(); ?>
		<?php else : ?>
			<p><?php esc_html_e( 'No results. Try a brand, model, or part number.', 'anstelias-storefront' ); ?></p>
		<?php endif; ?>
	</main>
</div>
<?php
get_footer();
