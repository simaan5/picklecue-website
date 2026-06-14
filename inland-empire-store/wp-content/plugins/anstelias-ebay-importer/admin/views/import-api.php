<?php
/**
 * API import view.
 *
 * @var bool $has_creds
 * @package Anstelias\EbayImporter
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="wrap anstelias-eb">
	<h1><?php esc_html_e( 'Import from eBay API', 'anstelias-ebay-importer' ); ?></h1>

	<?php if ( ! $has_creds ) : ?>
		<div class="notice notice-warning inline"><p>
			<?php esc_html_e( 'No eBay API credentials configured. Add them in Settings, or use CSV import (no credentials needed).', 'anstelias-ebay-importer' ); ?>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=anstelias-ebay-settings' ) ); ?>"><?php esc_html_e( 'Go to Settings', 'anstelias-ebay-importer' ); ?></a>
		</p></div>
	<?php else : ?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="margin-bottom:1em">
			<input type="hidden" name="action" value="anstelias_test_api" />
			<?php wp_nonce_field( 'anstelias_test_api' ); ?>
			<?php submit_button( __( 'Test connection', 'anstelias-ebay-importer' ), 'secondary', 'submit', false ); ?>
		</form>
	<?php endif; ?>

	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
		<input type="hidden" name="action" value="anstelias_import_api" />
		<?php wp_nonce_field( 'anstelias_import_api' ); ?>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><?php esc_html_e( 'Options', 'anstelias-ebay-importer' ); ?></th>
				<td>
					<label><input type="checkbox" name="dry_run" value="1" checked /> <?php esc_html_e( 'Dry run (preview only)', 'anstelias-ebay-importer' ); ?></label><br>
					<label><input type="checkbox" name="skip_images" value="1" /> <?php esc_html_e( 'Skip image download', 'anstelias-ebay-importer' ); ?></label><br>
					<label><?php esc_html_e( 'Limit listings (0 = all):', 'anstelias-ebay-importer' ); ?> <input type="number" name="limit" value="10" min="0" style="width:90px" /></label>
				</td>
			</tr>
		</table>
		<?php submit_button( __( 'Fetch &amp; import active listings', 'anstelias-ebay-importer' ), 'primary', 'submit', true, $has_creds ? array() : array( 'disabled' => 'disabled' ) ); ?>
	</form>
</div>
