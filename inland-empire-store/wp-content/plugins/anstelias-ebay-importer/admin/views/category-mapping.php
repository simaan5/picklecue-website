<?php
/**
 * Category mapping view: eBay category name -> WooCommerce category.
 *
 * @var array      $map  Saved mapping (ebay cat => wc term id).
 * @var \WP_Term[] $cats WooCommerce product categories.
 * @package Anstelias\EbayImporter
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
$rows = array_merge( $map, array( '' => 0 ) ); // trailing blank row to add new
?>
<div class="wrap anstelias-eb">
	<h1><?php esc_html_e( 'Category Mapping', 'anstelias-ebay-importer' ); ?></h1>
	<p class="description">
		<?php esc_html_e( 'Map exact eBay category names to your WooCommerce categories. These overrides win over automatic keyword categorization.', 'anstelias-ebay-importer' ); ?>
	</p>

	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
		<input type="hidden" name="action" value="anstelias_save_catmap" />
		<?php wp_nonce_field( 'anstelias_save_catmap' ); ?>

		<table class="widefat striped" id="catmap-table">
			<thead><tr>
				<th><?php esc_html_e( 'eBay category name', 'anstelias-ebay-importer' ); ?></th>
				<th><?php esc_html_e( 'WooCommerce category', 'anstelias-ebay-importer' ); ?></th>
			</tr></thead>
			<tbody>
			<?php foreach ( $rows as $ebay_cat => $wc_id ) : ?>
				<tr>
					<td><input type="text" name="ebay_cat[]" class="regular-text" value="<?php echo esc_attr( (string) $ebay_cat ); ?>" placeholder="e.g. PC Desktops &amp; All-In-Ones" /></td>
					<td>
						<select name="wc_cat[]">
							<option value="0">— <?php esc_html_e( 'select', 'anstelias-ebay-importer' ); ?> —</option>
							<?php foreach ( $cats as $cat ) : ?>
								<option value="<?php echo esc_attr( (string) $cat->term_id ); ?>" <?php selected( (int) $wc_id, (int) $cat->term_id ); ?>><?php echo esc_html( $cat->name ); ?></option>
							<?php endforeach; ?>
						</select>
					</td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table>
		<p><button type="button" class="button" id="catmap-add-row"><?php esc_html_e( '+ Add row', 'anstelias-ebay-importer' ); ?></button></p>
		<?php submit_button( __( 'Save mapping', 'anstelias-ebay-importer' ) ); ?>
	</form>
</div>
