<?php
/**
 * Logs view.
 *
 * @var string[] $lines
 * @package Anstelias\EbayImporter
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="wrap anstelias-eb">
	<h1><?php esc_html_e( 'Import Logs', 'anstelias-ebay-importer' ); ?></h1>
	<p class="description"><?php esc_html_e( 'Most recent entries from the WooCommerce logger (source: anstelias-ebay-importer). Secrets are redacted.', 'anstelias-ebay-importer' ); ?></p>
	<?php if ( empty( $lines ) ) : ?>
		<p><?php esc_html_e( 'No log entries yet.', 'anstelias-ebay-importer' ); ?></p>
	<?php else : ?>
		<pre class="anstelias-log"><?php echo esc_html( implode( "\n", $lines ) ); ?></pre>
	<?php endif; ?>
	<p><a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=wc-status&tab=logs' ) ); ?>"><?php esc_html_e( 'Open full WooCommerce logs', 'anstelias-ebay-importer' ); ?></a></p>
</div>
