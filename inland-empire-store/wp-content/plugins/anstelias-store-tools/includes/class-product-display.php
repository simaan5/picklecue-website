<?php
/**
 * Front-end product display hooks: badges, summary grid, specs table,
 * shipping/warranty notices, and the admin-only eBay source link.
 *
 * These hook into WooCommerce templates so the custom theme stays thin and
 * the same behavior works under any WooCommerce-compatible theme.
 *
 * @package Anstelias\StoreTools
 */

namespace Anstelias\StoreTools;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Product_Display {

	public function register(): void {
		// Condition badge on shop/category loop cards.
		add_action( 'woocommerce_before_shop_loop_item_title', array( $this, 'loop_condition_badge' ), 9 );

		// Summary grid + badges on the single product page (after price).
		add_action( 'woocommerce_single_product_summary', array( $this, 'single_badges' ), 6 );
		add_action( 'woocommerce_single_product_summary', array( $this, 'single_summary_grid' ), 21 );
		add_action( 'woocommerce_single_product_summary', array( $this, 'single_notices' ), 31 );

		// Specs table + admin source link added as product tabs / after content.
		add_filter( 'woocommerce_product_tabs', array( $this, 'add_specs_tab' ) );
		add_action( 'woocommerce_product_meta_end', array( $this, 'admin_source_link' ) );

		// Shortcodes for theme templates.
		add_shortcode( 'ie_specs_table', array( $this, 'sc_specs_table' ) );
		add_shortcode( 'ie_summary_grid', array( $this, 'sc_summary_grid' ) );
	}

	public function loop_condition_badge(): void {
		global $product;
		if ( $product instanceof \WC_Product ) {
			echo wp_kses_post( Condition_Badges::render( $product ) );
		}
	}

	public function single_badges(): void {
		global $product;
		if ( ! $product instanceof \WC_Product ) {
			return;
		}
		$badges = Condition_Badges::render( $product ) . Condition_Badges::render_tested( $product );
		if ( $badges ) {
			echo '<div class="ie-badges-row">' . wp_kses_post( $badges ) . '</div>';
		}
	}

	public function single_summary_grid(): void {
		global $product;
		if ( $product instanceof \WC_Product ) {
			echo wp_kses_post( Specs_Table::render_summary( $product ) );
		}
	}

	public function single_notices(): void {
		echo wp_kses_post( self::shipping_notice() );
		echo wp_kses_post( self::warranty_notice() );
	}

	/**
	 * Add a dedicated "Specifications" product tab.
	 *
	 * @param array $tabs Existing tabs.
	 * @return array
	 */
	public function add_specs_tab( array $tabs ): array {
		global $product;
		if ( $product instanceof \WC_Product && '' !== Specs_Table::render_full( $product ) ) {
			$tabs['ie_specs'] = array(
				'title'    => __( 'Specifications', 'anstelias-store-tools' ),
				'priority' => 5,
				'callback' => function () {
					global $product;
					echo wp_kses_post( Specs_Table::render_full( $product ) );
				},
			);
		}
		return $tabs;
	}

	/**
	 * Admin-only link back to the source eBay listing (never shown publicly).
	 */
	public function admin_source_link(): void {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		global $product;
		if ( ! $product instanceof \WC_Product ) {
			return;
		}
		$url = $product->get_meta( Utils::META_EBAY_URL );
		$id  = $product->get_meta( Utils::META_EBAY_ITEM_ID );
		if ( $url ) {
			printf(
				'<span class="ie-admin-source">%s <a href="%s" target="_blank" rel="noopener noreferrer">eBay #%s</a></span>',
				esc_html__( 'Source (admin only):', 'anstelias-store-tools' ),
				esc_url( $url ),
				esc_html( $id ?: '' )
			);
		}
	}

	public static function shipping_notice(): string {
		$text = get_option(
			'anst_shipping_notice',
			__( 'Ships from Upland, CA via USPS/UPS. Most orders ship within 1–2 business days.', 'anstelias-store-tools' )
		);
		return '<p class="ie-notice ie-notice--shipping">🚚 ' . esc_html( $text ) . '</p>';
	}

	public static function warranty_notice(): string {
		$text = get_option(
			'anst_warranty_notice',
			__( '30-day return window on tested items unless otherwise stated. Sold by ANSI Corporation dba Anstelias Technology.', 'anstelias-store-tools' )
		);
		return '<p class="ie-notice ie-notice--warranty">🛡️ ' . esc_html( $text ) . '</p>';
	}

	public function sc_specs_table(): string {
		global $product;
		return $product instanceof \WC_Product ? Specs_Table::render_full( $product ) : '';
	}

	public function sc_summary_grid(): string {
		global $product;
		return $product instanceof \WC_Product ? Specs_Table::render_summary( $product ) : '';
	}
}
