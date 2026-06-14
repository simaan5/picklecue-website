<?php
/**
 * Settings view.
 *
 * @var array $s Settings.
 * @package Anstelias\EbayImporter
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="wrap anstelias-eb">
	<h1><?php esc_html_e( 'eBay Importer — Settings', 'anstelias-ebay-importer' ); ?></h1>
	<p class="description">
		<?php esc_html_e( 'CSV import works without any credentials. Add eBay API keys only if you want automatic API imports with full item specifics and all photos.', 'anstelias-ebay-importer' ); ?>
	</p>

	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
		<input type="hidden" name="action" value="anstelias_save_settings" />
		<?php wp_nonce_field( 'anstelias_save_settings' ); ?>

		<h2><?php esc_html_e( 'eBay API credentials', 'anstelias-ebay-importer' ); ?></h2>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><label for="ebay_app_id"><?php esc_html_e( 'App ID (Client ID)', 'anstelias-ebay-importer' ); ?></label></th>
				<td><input type="text" id="ebay_app_id" name="ebay_app_id" class="regular-text" value="<?php echo esc_attr( $s['ebay_app_id'] ); ?>" autocomplete="off" /></td>
			</tr>
			<tr>
				<th scope="row"><label for="ebay_cert_id"><?php esc_html_e( 'Cert ID (Client Secret)', 'anstelias-ebay-importer' ); ?></label></th>
				<td><input type="text" id="ebay_cert_id" name="ebay_cert_id" class="regular-text" value="<?php echo esc_attr( $s['ebay_cert_id'] ); ?>" autocomplete="off" /></td>
			</tr>
			<tr>
				<th scope="row"><label for="ebay_dev_id"><?php esc_html_e( 'Dev ID', 'anstelias-ebay-importer' ); ?></label></th>
				<td><input type="text" id="ebay_dev_id" name="ebay_dev_id" class="regular-text" value="<?php echo esc_attr( $s['ebay_dev_id'] ); ?>" autocomplete="off" /></td>
			</tr>
			<tr>
				<th scope="row"><label for="ebay_user_token"><?php esc_html_e( 'User token', 'anstelias-ebay-importer' ); ?></label></th>
				<td>
					<textarea id="ebay_user_token" name="ebay_user_token" rows="3" class="large-text" placeholder="<?php echo $s['ebay_user_token'] ? esc_attr( \Anstelias\EbayImporter\Settings::mask( $s['ebay_user_token'] ) ) . ' — ' . esc_attr__( 'leave blank to keep current', 'anstelias-ebay-importer' ) : ''; ?>" autocomplete="off"></textarea>
					<p class="description"><?php esc_html_e( 'Stored securely in the database, never displayed or logged in full. Leave blank to keep the current token.', 'anstelias-ebay-importer' ); ?></p>
				</td>
			</tr>
			<tr>
				<th scope="row"><label for="ebay_environment"><?php esc_html_e( 'Environment', 'anstelias-ebay-importer' ); ?></label></th>
				<td>
					<select id="ebay_environment" name="ebay_environment">
						<option value="production" <?php selected( $s['ebay_environment'], 'production' ); ?>><?php esc_html_e( 'Production', 'anstelias-ebay-importer' ); ?></option>
						<option value="sandbox" <?php selected( $s['ebay_environment'], 'sandbox' ); ?>><?php esc_html_e( 'Sandbox', 'anstelias-ebay-importer' ); ?></option>
					</select>
				</td>
			</tr>
		</table>

		<h2><?php esc_html_e( 'Import defaults', 'anstelias-ebay-importer' ); ?></h2>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><?php esc_html_e( 'New product status', 'anstelias-ebay-importer' ); ?></th>
				<td><strong><?php esc_html_e( 'Draft (enforced)', 'anstelias-ebay-importer' ); ?></strong>
				<p class="description"><?php esc_html_e( 'Imported products always begin as hidden drafts pending review.', 'anstelias-ebay-importer' ); ?></p></td>
			</tr>
			<tr>
				<th scope="row"><label for="markup_percent"><?php esc_html_e( 'Price markup over eBay (%)', 'anstelias-ebay-importer' ); ?></label></th>
				<td><input type="number" step="0.1" min="0" id="markup_percent" name="markup_percent" value="<?php echo esc_attr( (string) $s['markup_percent'] ); ?>" /> %</td>
			</tr>
		</table>

		<?php submit_button( __( 'Save settings', 'anstelias-ebay-importer' ) ); ?>
	</form>
</div>
