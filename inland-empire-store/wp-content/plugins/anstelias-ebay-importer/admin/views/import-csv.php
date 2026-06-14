<?php
/**
 * CSV import view.
 *
 * @package Anstelias\EbayImporter
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="wrap anstelias-eb">
	<h1><?php esc_html_e( 'Import from eBay CSV', 'anstelias-ebay-importer' ); ?></h1>
	<p class="description">
		<?php esc_html_e( 'Export from Seller Hub → Listings → Active → Download, then upload the CSV here. Column headers are auto-detected. Products import as hidden drafts pending review.', 'anstelias-ebay-importer' ); ?>
	</p>

	<form method="post" enctype="multipart/form-data" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
		<input type="hidden" name="action" value="anstelias_import_csv" />
		<?php wp_nonce_field( 'anstelias_import_csv' ); ?>

		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><label for="csv"><?php esc_html_e( 'eBay active-listings CSV', 'anstelias-ebay-importer' ); ?></label></th>
				<td><input type="file" id="csv" name="csv" accept=".csv,text/csv" required /></td>
			</tr>
			<tr>
				<th scope="row"><?php esc_html_e( 'Options', 'anstelias-ebay-importer' ); ?></th>
				<td>
					<label><input type="checkbox" name="dry_run" value="1" checked /> <?php esc_html_e( 'Dry run (preview, no products written)', 'anstelias-ebay-importer' ); ?></label><br>
					<label><input type="checkbox" name="skip_images" value="1" /> <?php esc_html_e( 'Skip image download (faster preview)', 'anstelias-ebay-importer' ); ?></label><br>
					<label><?php esc_html_e( 'Limit rows (0 = all):', 'anstelias-ebay-importer' ); ?> <input type="number" name="limit" value="10" min="0" style="width:90px" /></label>
				</td>
			</tr>
		</table>

		<?php submit_button( __( 'Upload &amp; import', 'anstelias-ebay-importer' ) ); ?>
	</form>

	<h2><?php esc_html_e( 'Recognized columns', 'anstelias-ebay-importer' ); ?></h2>
	<p class="description"><?php esc_html_e( 'These header names (case-insensitive) map automatically; anything else is stored as an item specific.', 'anstelias-ebay-importer' ); ?></p>
	<p><code><?php echo esc_html( implode( ', ', array_keys( \Anstelias\EbayImporter\CSV_Importer::header_aliases() ) ) ); ?></code></p>
</div>
