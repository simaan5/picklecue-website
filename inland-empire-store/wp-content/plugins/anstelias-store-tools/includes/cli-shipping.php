<?php
/**
 * Idempotent shipping setup: a US flat-rate zone with per-class costs plus a
 * free Local Pickup (Upland, CA) method.
 *
 * Run:  wp eval-file wp-content/plugins/anstelias-store-tools/includes/cli-shipping.php
 *
 * Adjust the per-class dollar amounts in $class_costs to taste; these are
 * conservative starting points. You confirm real postage in Pirate Ship.
 *
 * @package Anstelias\StoreTools
 */

if ( ! defined( 'ABSPATH' ) ) {
	fwrite( STDERR, "Run via: wp eval-file <this-file>\n" );
	exit( 1 );
}
if ( ! class_exists( 'WooCommerce' ) ) {
	WP_CLI::error( 'WooCommerce is not active.' );
}

// Per shipping-class flat cost (USD). Base cost applies when no class set.
$class_costs = array(
	'small-components'  => '5.99',
	'storage-ram'       => '5.99',
	'mini-pcs'          => '12.99',
	'desktops'          => '19.99',
	'monitors'          => '24.99',
	'heavy-equipment'   => '39.99',
	'fragile-equipment' => '24.99',
);
$base_cost = '9.99';

// Find or create the "Domestic US" zone.
$target = null;
foreach ( \WC_Shipping_Zones::get_zones() as $z ) {
	if ( 'Domestic US' === $z['zone_name'] ) {
		$target = new \WC_Shipping_Zone( $z['zone_id'] );
		break;
	}
}
if ( ! $target ) {
	$target = new \WC_Shipping_Zone();
	$target->set_zone_name( 'Domestic US' );
	$target->add_location( 'US', 'country' );
	$target->save();
	WP_CLI::log( 'Created shipping zone: Domestic US' );
} else {
	WP_CLI::log( 'Shipping zone "Domestic US" already exists.' );
}

// Ensure a flat_rate method exists on the zone.
$has_flat = false;
$has_pickup = false;
foreach ( $target->get_shipping_methods() as $method ) {
	if ( 'flat_rate' === $method->id ) { $has_flat = true; $flat_instance = $method->get_instance_id(); }
	if ( 'local_pickup' === $method->id ) { $has_pickup = true; }
}
if ( ! $has_flat ) {
	$flat_instance = $target->add_shipping_method( 'flat_rate' );
	WP_CLI::log( 'Added Flat rate method.' );
}
if ( ! $has_pickup ) {
	$target->add_shipping_method( 'local_pickup' );
	WP_CLI::log( 'Added Local pickup method.' );
}

// Configure flat_rate per-class costs.
$option_key = 'woocommerce_flat_rate_' . $flat_instance . '_settings';
$settings = get_option( $option_key, array() );
$settings['title']             = 'USPS / UPS Shipping';
$settings['cost']              = $base_cost;
$settings['type']              = 'class'; // charge per shipping class
$settings['no_class_cost']     = $base_cost;
$settings['calculation_type']  = 'per_order';
foreach ( $class_costs as $slug => $cost ) {
	$term = get_term_by( 'slug', $slug, 'product_shipping_class' );
	if ( $term ) {
		$settings[ 'class_cost_' . $term->term_id ] = $cost;
	}
}
update_option( $option_key, $settings );

WP_CLI::success( 'Shipping configured: Domestic US flat-rate (per class) + Local pickup (Upland, CA).' );
