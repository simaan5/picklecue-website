<?php
/**
 * Generic fallback template (blog/archive/home when no front-page).
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
		<?php if ( have_posts() ) : ?>
			<?php if ( ! is_front_page() && ( is_home() || is_archive() ) ) : ?>
				<h1 class="ie-page-title"><?php echo esc_html( wp_get_document_title() ); ?></h1>
			<?php endif; ?>
			<?php while ( have_posts() ) : the_post(); ?>
				<article id="post-<?php the_ID(); ?>" <?php post_class( 'ie-entry' ); ?>>
					<h2 class="ie-entry__title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
					<div class="ie-entry__content"><?php the_excerpt(); ?></div>
				</article>
			<?php endwhile; ?>
			<?php the_posts_pagination(); ?>
		<?php else : ?>
			<p><?php esc_html_e( 'Nothing found.', 'anstelias-storefront' ); ?></p>
		<?php endif; ?>
	</main>
</div>
<?php
get_footer();
