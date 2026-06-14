<?php
/**
 * Store Tools admin page view.
 *
 * @var string $export_url Nonced export URL.
 * @package Anstelias\StoreTools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="wrap">
	<h1><?php esc_html_e( 'Anstelias Store Tools', 'anstelias-store-tools' ); ?></h1>

	<h2><?php esc_html_e( 'Pirate Ship — Unshipped Order Export', 'anstelias-store-tools' ); ?></h2>
	<p>
		<?php esc_html_e( 'Pirate Ship normally pulls orders automatically through its WooCommerce integration. Use this CSV only as a fallback or for bulk handling.', 'anstelias-store-tools' ); ?>
	</p>
	<p>
		<a class="button button-primary" href="<?php echo esc_url( $export_url ); ?>">
			<?php esc_html_e( 'Download unshipped orders (CSV)', 'anstelias-store-tools' ); ?>
		</a>
		<a class="button" href="<?php echo esc_url( add_query_arg( 'mark_exported', '1', $export_url ) ); ?>">
			<?php esc_html_e( 'Download &amp; mark as exported', 'anstelias-store-tools' ); ?>
		</a>
	</p>

	<hr>

	<h2><?php esc_html_e( 'Product Notices', 'anstelias-store-tools' ); ?></h2>
	<form method="post" action="options.php">
		<?php settings_fields( 'anst_store_tools' ); ?>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><label for="anst_shipping_notice"><?php esc_html_e( 'Shipping notice', 'anstelias-store-tools' ); ?></label></th>
				<td><textarea id="anst_shipping_notice" name="anst_shipping_notice" rows="2" class="large-text"><?php echo esc_textarea( get_option( 'anst_shipping_notice', 'Ships from Upland, CA via USPS/UPS. Most orders ship within 1–2 business days.' ) ); ?></textarea></td>
			</tr>
			<tr>
				<th scope="row"><label for="anst_warranty_notice"><?php esc_html_e( 'Warranty / returns notice', 'anstelias-store-tools' ); ?></label></th>
				<td><textarea id="anst_warranty_notice" name="anst_warranty_notice" rows="2" class="large-text"><?php echo esc_textarea( get_option( 'anst_warranty_notice', '30-day return window on tested items unless otherwise stated.' ) ); ?></textarea></td>
			</tr>
		</table>
		<?php submit_button(); ?>
	</form>
</div>
