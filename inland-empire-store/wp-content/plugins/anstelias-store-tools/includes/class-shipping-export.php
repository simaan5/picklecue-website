<?php
/**
 * Unshipped-order CSV export — the free fallback for the Pirate Ship workflow.
 *
 * Pirate Ship normally pulls orders through its own WooCommerce integration.
 * This export exists so you are never blocked: it produces a CSV of unshipped
 * (processing) orders with everything needed to buy a label, and marks each
 * exported order so you can avoid double-handling.
 *
 * @package Anstelias\StoreTools
 */

namespace Anstelias\StoreTools;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Shipping_Export {

	const ACTION = 'anst_export_unshipped';

	public function register(): void {
		add_action( 'admin_post_' . self::ACTION, array( $this, 'handle_export' ) );
	}

	/**
	 * Column headers for the export.
	 *
	 * @return string[]
	 */
	public static function columns(): array {
		return array(
			'order_number', 'date', 'customer_name', 'email', 'phone',
			'address1', 'address2', 'city', 'state', 'postcode', 'country',
			'shipping_method', 'product_skus', 'product_titles', 'quantity',
			'weight_lbs', 'dimensions_in', 'order_total', 'notes',
		);
	}

	/**
	 * Handle the admin-post download request.
	 */
	public function handle_export(): void {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'anstelias-store-tools' ) );
		}
		check_admin_referer( self::ACTION );

		$mark = isset( $_GET['mark_exported'] ) && '1' === $_GET['mark_exported'];

		$orders = wc_get_orders(
			array(
				'status' => array( 'wc-processing' ),
				'limit'  => 500,
				'return' => 'objects',
				'meta_query' => array( // phpcs:ignore WordPress.DB.SlowDBQuery
					'relation' => 'OR',
					array( 'key' => Utils::META_PS_EXPORTED, 'compare' => 'NOT EXISTS' ),
					array( 'key' => Utils::META_PS_EXPORTED, 'value' => '1', 'compare' => '!=' ),
				),
			)
		);

		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=unshipped-orders-' . gmdate( 'Ymd-His' ) . '.csv' );

		$out = fopen( 'php://output', 'w' );
		fputcsv( $out, self::columns() );

		foreach ( $orders as $order ) {
			fputcsv( $out, $this->order_to_row( $order ) );
			if ( $mark ) {
				$order->update_meta_data( Utils::META_PS_EXPORTED, '1' );
				$order->update_meta_data( Utils::META_PS_EXPORTED_AT, current_time( 'mysql' ) );
				$order->save();
			}
		}
		fclose( $out ); // phpcs:ignore
		exit;
	}

	/**
	 * Flatten an order into a single export row.
	 *
	 * @param \WC_Order $order Order.
	 * @return array
	 */
	private function order_to_row( \WC_Order $order ): array {
		$skus = $titles = array();
		$qty = 0;
		$weight = 0.0;
		$dims = array();

		foreach ( $order->get_items() as $item ) {
			/** @var \WC_Order_Item_Product $item */
			$product = $item->get_product();
			$skus[]   = $product ? $product->get_sku() : '';
			$titles[] = $item->get_name();
			$qty     += (int) $item->get_quantity();
			if ( $product ) {
				$weight += (float) $product->get_weight() * (int) $item->get_quantity();
				$d = array_filter( array( $product->get_length(), $product->get_width(), $product->get_height() ) );
				if ( $d ) {
					$dims[] = implode( 'x', $d );
				}
			}
		}

		return array(
			$order->get_order_number(),
			$order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d' ) : '',
			trim( $order->get_shipping_first_name() . ' ' . $order->get_shipping_last_name() ) ?: $order->get_formatted_billing_full_name(),
			$order->get_billing_email(),
			$order->get_billing_phone(),
			$order->get_shipping_address_1(),
			$order->get_shipping_address_2(),
			$order->get_shipping_city(),
			$order->get_shipping_state(),
			$order->get_shipping_postcode(),
			$order->get_shipping_country(),
			$order->get_shipping_method(),
			implode( ' | ', array_filter( $skus ) ),
			implode( ' | ', $titles ),
			$qty,
			$weight ?: '',
			implode( ' | ', $dims ),
			$order->get_total(),
			$order->get_customer_note(),
		);
	}
}
