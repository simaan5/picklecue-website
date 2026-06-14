<?php
/**
 * Reports view: list of generated import report CSVs.
 *
 * @var string[] $files     Absolute paths.
 * @var string   $base_url  Public base URL for the import dir.
 * @package Anstelias\EbayImporter
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="wrap anstelias-eb">
	<h1><?php esc_html_e( 'Import Reports', 'anstelias-ebay-importer' ); ?></h1>
	<p class="description"><?php esc_html_e( 'One CSV per import run: created / updated / needs-review / errors per row.', 'anstelias-ebay-importer' ); ?></p>
	<?php if ( empty( $files ) ) : ?>
		<p><?php esc_html_e( 'No reports yet.', 'anstelias-ebay-importer' ); ?></p>
	<?php else : ?>
		<table class="widefat striped">
			<thead><tr><th><?php esc_html_e( 'Report', 'anstelias-ebay-importer' ); ?></th><th><?php esc_html_e( 'Generated', 'anstelias-ebay-importer' ); ?></th><th><?php esc_html_e( 'Size', 'anstelias-ebay-importer' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( $files as $f ) :
				$name = basename( $f );
				?>
				<tr>
					<td><a href="<?php echo esc_url( $base_url . $name ); ?>" download><?php echo esc_html( $name ); ?></a></td>
					<td><?php echo esc_html( gmdate( 'Y-m-d H:i', (int) filemtime( $f ) ) ); ?> UTC</td>
					<td><?php echo esc_html( size_format( (int) filesize( $f ) ) ); ?></td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table>
		<p class="description"><?php esc_html_e( 'Note: report files live in a directory protected from public listing; download links require an admin session.', 'anstelias-ebay-importer' ); ?></p>
	<?php endif; ?>
</div>
