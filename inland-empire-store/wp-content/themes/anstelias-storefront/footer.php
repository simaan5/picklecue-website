<?php
/**
 * Theme footer.
 *
 * @package Anstelias\Storefront
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
</div><!-- #content -->

<footer class="ie-footer">
	<div class="ie-container ie-footer__top">
		<?php anstelias_trust_badges(); ?>
	</div>

	<div class="ie-container ie-footer__cols">
		<div class="ie-footer__col">
			<h4 class="widget-title">Inland Empire Electronics</h4>
			<p>ANSI Corporation dba Anstelias Technology<br>
			1302 Monte Vista Ave Suite 1<br>
			Upland, CA 91786</p>
			<p><a href="<?php echo esc_url( home_url( '/contact/' ) ); ?>"><?php esc_html_e( 'Contact &amp; support', 'anstelias-storefront' ); ?></a></p>
		</div>
		<div class="ie-footer__col">
			<?php
			if ( has_nav_menu( 'footer' ) ) {
				wp_nav_menu( array( 'theme_location' => 'footer', 'container' => false, 'menu_class' => 'ie-footer__menu', 'depth' => 1 ) );
			} else {
				dynamic_sidebar( 'footer-widgets' );
			}
			?>
		</div>
	</div>

	<div class="ie-container ie-footer__bottom">
		<p>&copy; <?php echo esc_html( gmdate( 'Y' ) ); ?> ANSI Corporation dba Anstelias Technology. <?php esc_html_e( 'All rights reserved.', 'anstelias-storefront' ); ?></p>
	</div>
</footer>

<?php wp_footer(); ?>
</body>
</html>
