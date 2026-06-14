<?php
/**
 * Review queue view.
 *
 * @var array      $data    ['items','total','pages']
 * @var array      $counts  status => count
 * @var string     $status  current status filter
 * @var int        $paged
 * @var string     $search
 * @var \WP_Term[] $cats
 * @package Anstelias\EbayImporter
 */

use Anstelias\StoreTools\Utils;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
$base = admin_url( 'admin.php?page=anstelias-ebay' );
?>
<div class="wrap anstelias-eb">
	<h1><?php esc_html_e( 'eBay Import — Review Queue', 'anstelias-ebay-importer' ); ?></h1>

	<ul class="subsubsub">
		<li><a href="<?php echo esc_url( $base ); ?>" class="<?php echo '' === $status ? 'current' : ''; ?>"><?php esc_html_e( 'All', 'anstelias-ebay-importer' ); ?></a> |</li>
		<?php
		$i = 0;
		$total_statuses = count( $counts );
		foreach ( $counts as $st => $n ) :
			$i++;
			?>
			<li>
				<a href="<?php echo esc_url( add_query_arg( 'status', $st, $base ) ); ?>" class="<?php echo $status === $st ? 'current' : ''; ?>">
					<?php echo esc_html( Utils::status_label( $st ) ); ?> <span class="count">(<?php echo (int) $n; ?>)</span>
				</a><?php echo $i < $total_statuses ? ' |' : ''; ?>
			</li>
		<?php endforeach; ?>
	</ul>

	<form method="get" style="margin:8px 0">
		<input type="hidden" name="page" value="anstelias-ebay" />
		<?php if ( $status ) : ?><input type="hidden" name="status" value="<?php echo esc_attr( $status ); ?>" /><?php endif; ?>
		<input type="search" name="s" value="<?php echo esc_attr( $search ); ?>" placeholder="<?php esc_attr_e( 'Search title / SKU', 'anstelias-ebay-importer' ); ?>" />
		<?php submit_button( __( 'Search', 'anstelias-ebay-importer' ), 'secondary', '', false ); ?>
	</form>

	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" id="anstelias-review-form">
		<input type="hidden" name="action" value="anstelias_bulk" />
		<?php wp_nonce_field( 'anstelias_bulk' ); ?>

		<div class="tablenav top">
			<select name="bulk_action">
				<option value=""><?php esc_html_e( 'Bulk actions', 'anstelias-ebay-importer' ); ?></option>
				<option value="publish"><?php esc_html_e( 'Publish selected', 'anstelias-ebay-importer' ); ?></option>
				<option value="ready"><?php esc_html_e( 'Mark ready to publish', 'anstelias-ebay-importer' ); ?></option>
				<option value="needs_review"><?php esc_html_e( 'Mark needs review', 'anstelias-ebay-importer' ); ?></option>
				<option value="change_category"><?php esc_html_e( 'Change category', 'anstelias-ebay-importer' ); ?></option>
				<option value="archive"><?php esc_html_e( 'Archive', 'anstelias-ebay-importer' ); ?></option>
				<option value="delete"><?php esc_html_e( 'Delete draft (permanent)', 'anstelias-ebay-importer' ); ?></option>
			</select>
			<select name="category_id" class="anstelias-cat-select" style="display:none">
				<option value="0">— <?php esc_html_e( 'category', 'anstelias-ebay-importer' ); ?> —</option>
				<?php foreach ( $cats as $cat ) : ?>
					<option value="<?php echo esc_attr( (string) $cat->term_id ); ?>"><?php echo esc_html( $cat->name ); ?></option>
				<?php endforeach; ?>
			</select>
			<label class="anstelias-confirm-delete" style="display:none">
				<input type="checkbox" name="confirm_delete" value="1" /> <?php esc_html_e( 'Confirm permanent deletion of drafts', 'anstelias-ebay-importer' ); ?>
			</label>
			<?php submit_button( __( 'Apply', 'anstelias-ebay-importer' ), 'primary', '', false ); ?>
		</div>

		<table class="widefat striped anstelias-queue">
			<thead><tr>
				<td class="check-column"><input type="checkbox" id="anstelias-check-all" /></td>
				<th><?php esc_html_e( 'Image', 'anstelias-ebay-importer' ); ?></th>
				<th><?php esc_html_e( 'Title', 'anstelias-ebay-importer' ); ?></th>
				<th><?php esc_html_e( 'SKU', 'anstelias-ebay-importer' ); ?></th>
				<th><?php esc_html_e( 'Price', 'anstelias-ebay-importer' ); ?></th>
				<th><?php esc_html_e( 'Stock', 'anstelias-ebay-importer' ); ?></th>
				<th><?php esc_html_e( 'Condition', 'anstelias-ebay-importer' ); ?></th>
				<th><?php esc_html_e( 'Category', 'anstelias-ebay-importer' ); ?></th>
				<th><?php esc_html_e( 'Status', 'anstelias-ebay-importer' ); ?></th>
				<th><?php esc_html_e( 'Flags', 'anstelias-ebay-importer' ); ?></th>
			</tr></thead>
			<tbody>
			<?php if ( empty( $data['items'] ) ) : ?>
				<tr><td colspan="10"><?php esc_html_e( 'No imported products yet. Start with an Import.', 'anstelias-ebay-importer' ); ?></td></tr>
			<?php else : ?>
				<?php foreach ( $data['items'] as $item ) : ?>
					<tr>
						<th class="check-column"><input type="checkbox" name="ids[]" value="<?php echo esc_attr( (string) $item['id'] ); ?>" /></th>
						<td><?php if ( $item['thumb'] ) : ?><img src="<?php echo esc_url( $item['thumb'] ); ?>" alt="" width="48" height="48" style="object-fit:contain;background:#fafbfc;border-radius:4px" /><?php else : ?><span class="anstelias-noimg">—</span><?php endif; ?></td>
						<td>
							<a href="<?php echo esc_url( get_edit_post_link( $item['id'] ) ); ?>"><?php echo esc_html( $item['title'] ); ?></a>
							<?php if ( $item['source_url'] ) : ?>
								<br><a href="<?php echo esc_url( $item['source_url'] ); ?>" target="_blank" rel="noopener" class="anstelias-src"><?php esc_html_e( 'eBay source', 'anstelias-ebay-importer' ); ?> ↗</a>
							<?php endif; ?>
						</td>
						<td><?php echo esc_html( $item['sku'] ?: '—' ); ?></td>
						<td><?php echo $item['price'] ? wp_kses_post( wc_price( $item['price'] ) ) : '<span class="anstelias-flag">—</span>'; ?></td>
						<td><?php echo esc_html( null === $item['stock'] ? '—' : (string) $item['stock'] ); ?></td>
						<td><?php echo esc_html( $item['condition'] ?: '—' ); ?></td>
						<td>
							<?php echo esc_html( $item['category'] ?: '—' ); ?>
							<?php if ( $item['confidence'] && $item['confidence'] < 0.5 ) : ?>
								<span class="anstelias-flag" title="<?php esc_attr_e( 'Low confidence — verify category', 'anstelias-ebay-importer' ); ?>">⚠ <?php echo esc_html( round( $item['confidence'] * 100 ) . '%' ); ?></span>
							<?php endif; ?>
						</td>
						<td><span class="anstelias-status anstelias-status--<?php echo esc_attr( $item['status'] ); ?>"><?php echo esc_html( Utils::status_label( $item['status'] ) ); ?></span></td>
						<td>
							<?php foreach ( $item['missing'] as $m ) : ?>
								<span class="anstelias-flag">⚠ <?php echo esc_html( $m ); ?></span>
							<?php endforeach; ?>
						</td>
					</tr>
				<?php endforeach; ?>
			<?php endif; ?>
			</tbody>
		</table>
	</form>

	<?php
	// Pagination.
	if ( $data['pages'] > 1 ) {
		echo '<div class="tablenav"><div class="tablenav-pages">';
		echo wp_kses_post( paginate_links( array(
			'base'      => add_query_arg( 'paged', '%#%', $base . ( $status ? '&status=' . $status : '' ) ),
			'format'    => '',
			'current'   => $paged,
			'total'     => $data['pages'],
			'prev_text' => '«',
			'next_text' => '»',
		) ) );
		echo '</div></div>';
	}
	?>
</div>
