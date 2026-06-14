<?php
/**
 * Static page template.
 *
 * @package Anstelias\Storefront
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<div class="ie-container">
	<main id="primary" class="ie-main ie-page">
		<?php while ( have_posts() ) : the_post(); ?>
			<article <?php post_class( 'ie-page__article' ); ?>>
				<h1 class="ie-page-title"><?php the_title(); ?></h1>
				<div class="ie-page__content"><?php the_content(); ?></div>
			</article>
		<?php endwhile; ?>
	</main>
</div>
<?php
get_footer();
