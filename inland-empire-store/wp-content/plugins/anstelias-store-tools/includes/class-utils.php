<?php
/**
 * Shared constants and helper functions for Anstelias plugins.
 *
 * This is the single source of truth for:
 *   - meta key names
 *   - import status values
 *   - the product attribute list
 *   - the category tree
 *   - the rule-based categorization keyword map
 *
 * Both Store Tools and the eBay Importer read from here so the two plugins
 * never drift apart.
 *
 * @package Anstelias\StoreTools
 */

namespace Anstelias\StoreTools;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Utils {

	/* ---- Meta keys (underscore-prefixed = hidden custom fields) ---------- */
	const META_IMPORT_SOURCE   = '_anstelias_import_source';
	const META_IMPORT_STATUS   = '_anstelias_import_status';
	const META_IMPORTED_AT     = '_anstelias_imported_at';
	const META_LAST_SYNCED_AT  = '_anstelias_last_synced_at';
	const META_SYNC_STATUS     = '_anstelias_sync_status';
	const META_EBAY_ITEM_ID    = '_ebay_item_id';
	const META_EBAY_URL        = '_ebay_listing_url';
	const META_PAYLOAD_HASH    = '_ebay_raw_payload_hash';
	const META_PS_EXPORTED     = '_anstelias_pirateship_exported';
	const META_PS_EXPORTED_AT  = '_anstelias_pirateship_exported_at';

	/* ---- Import status values ------------------------------------------- */
	const STATUS_IMPORTED_DRAFT   = 'imported_draft';
	const STATUS_NEEDS_REVIEW     = 'needs_review';
	const STATUS_READY_TO_PUBLISH = 'ready_to_publish';
	const STATUS_PUBLISHED        = 'published';
	const STATUS_SYNC_ERROR       = 'sync_error';
	const STATUS_ARCHIVED         = 'archived';

	/**
	 * Custom (non-taxonomy) product attributes shown on the spec table.
	 * Order here is the display order on the product page.
	 *
	 * @return string[]
	 */
	public static function attributes(): array {
		return array(
			'Brand',
			'Model',
			'MPN',
			'Condition',
			'Tested Status',
			'Cosmetic Condition',
			'Included Accessories',
			'Storage Capacity',
			'RAM',
			'CPU',
			'GPU',
			'Form Factor',
			'Interface',
			'Part Number',
			'Warranty/Return Window',
			'Notes',
		);
	}

	/**
	 * Category tree: top-level => [subcategories].
	 *
	 * @return array<string,string[]>
	 */
	public static function categories(): array {
		return array(
			'Electronics'                  => array(),
			'Computers & Workstations'     => array( 'Laptops', 'Desktops', 'Mini PCs', 'Workstations', 'Servers' ),
			'Networking'                   => array( 'Switches', 'Routers', 'Access Points' ),
			'Storage & Memory'             => array( 'SSDs', 'Hard Drives', 'RAM / Memory' ),
			'Components'                   => array( 'CPUs / Processors', 'GPUs / Graphics Cards' ),
			'Monitors & Displays'          => array(),
			'Printers & Scanners'          => array(),
			'POS Equipment'                => array(),
			'Cameras & Security'           => array(),
			'Audio Equipment'              => array(),
			'Video Equipment'              => array(),
			'Apple Mac Pro'                => array(),
			'Film / Camera Equipment'      => array(),
			'Musical / Pro Audio Equipment' => array(),
			'Vintage Electronics'          => array(),
			'Radio / Vacuum Tubes'         => array(),
			'Power & Accessories'          => array( 'Computer Cables & Connectors', 'Power Supplies & Adapters', 'Power Protection & Distribution' ),
			'Test Equipment'               => array(),
			'Used Business Equipment'      => array(),
			'Miscellaneous'                => array(),
		);
	}

	/**
	 * Rule-based categorization map.
	 * Each rule: keywords (lowercase) => [Top, Sub|null].
	 * Earlier (more specific) rules win. Returns the slug path to assign.
	 *
	 * @return array<int,array{keywords:string[],path:array{0:string,1:?string},score:float}>
	 */
	public static function category_rules(): array {
		return array(
			array( 'keywords' => array( 'mac pro', 'apple mac pro' ), 'path' => array( 'Apple Mac Pro', null ), 'score' => 0.95 ),
			array( 'keywords' => array( 'ddr4', 'ddr5', 'ddr3', 'sodimm', 'dimm', 'rdimm', 'udimm' ), 'path' => array( 'Storage & Memory', 'RAM / Memory' ), 'score' => 0.9 ),
			array( 'keywords' => array( 'nvme', 'm.2', 'sata ssd', 'ssd' ), 'path' => array( 'Storage & Memory', 'SSDs' ), 'score' => 0.85 ),
			array( 'keywords' => array( 'hard drive', 'hdd', 'sas drive', 'sata hdd', '7200rpm', '5400rpm' ), 'path' => array( 'Storage & Memory', 'Hard Drives' ), 'score' => 0.85 ),
			array( 'keywords' => array( 'access point', 'unifi ap', 'wireless ap' ), 'path' => array( 'Networking', 'Access Points' ), 'score' => 0.85 ),
			array( 'keywords' => array( 'switch', 'catalyst', 'sfp', 'poe switch' ), 'path' => array( 'Networking', 'Switches' ), 'score' => 0.8 ),
			array( 'keywords' => array( 'router', 'firewall', 'edgerouter' ), 'path' => array( 'Networking', 'Routers' ), 'score' => 0.8 ),
			array( 'keywords' => array( 'cisco', 'unifi', 'ubiquiti', 'mikrotik', 'netgear' ), 'path' => array( 'Networking', null ), 'score' => 0.7 ),
			array( 'keywords' => array( 'precision', 'z4', 'z6', 'z8', 'threadripper', 'workstation' ), 'path' => array( 'Computers & Workstations', 'Workstations' ), 'score' => 0.85 ),
			array( 'keywords' => array( 'poweredge', 'proliant', 'rack server', 'server' ), 'path' => array( 'Computers & Workstations', 'Servers' ), 'score' => 0.8 ),
			array( 'keywords' => array( 'optiplex', 'elitedesk', 'thinkcentre', 'prodesk', 'mini pc', 'micro pc', 'tiny' ), 'path' => array( 'Computers & Workstations', 'Mini PCs' ), 'score' => 0.8 ),
			array( 'keywords' => array( 'desktop', 'tower pc' ), 'path' => array( 'Computers & Workstations', 'Desktops' ), 'score' => 0.7 ),
			array( 'keywords' => array( 'laptop', 'notebook', 'thinkpad', 'latitude', 'elitebook', 'macbook' ), 'path' => array( 'Computers & Workstations', 'Laptops' ), 'score' => 0.8 ),
			array( 'keywords' => array( 'cpu', 'processor', 'xeon', 'core i7', 'core i5', 'core i9', 'ryzen' ), 'path' => array( 'Components', 'CPUs / Processors' ), 'score' => 0.75 ),
			array( 'keywords' => array( 'gpu', 'graphics card', 'geforce', 'radeon', 'quadro', 'rtx', 'gtx' ), 'path' => array( 'Components', 'GPUs / Graphics Cards' ), 'score' => 0.8 ),
			array( 'keywords' => array( 'monitor', 'display', 'lcd panel' ), 'path' => array( 'Monitors & Displays', null ), 'score' => 0.8 ),
			array( 'keywords' => array( 'printer', 'scanner', 'toner', 'laserjet' ), 'path' => array( 'Printers & Scanners', null ), 'score' => 0.8 ),
			array( 'keywords' => array( 'pos', 'barcode', 'receipt printer', 'cash drawer', 'point of sale' ), 'path' => array( 'POS Equipment', null ), 'score' => 0.85 ),
			array( 'keywords' => array( 'nvr', 'dvr', 'poe camera', 'security camera', 'ip camera', 'cctv' ), 'path' => array( 'Cameras & Security', null ), 'score' => 0.85 ),
			array( 'keywords' => array( 'projector', 'capture card', 'broadcast', 'sdi', 'hdmi matrix' ), 'path' => array( 'Video Equipment', null ), 'score' => 0.75 ),
			array( 'keywords' => array( 'microphone', 'mixer', 'pro audio', 'instrument', 'synthesizer' ), 'path' => array( 'Musical / Pro Audio Equipment', null ), 'score' => 0.75 ),
			array( 'keywords' => array( 'amplifier', 'receiver', 'speaker', 'audio' ), 'path' => array( 'Audio Equipment', null ), 'score' => 0.65 ),
			array( 'keywords' => array( 'film camera', 'lens', 'photography', 'dslr', 'mirrorless' ), 'path' => array( 'Film / Camera Equipment', null ), 'score' => 0.75 ),
			array( 'keywords' => array( 'vacuum tube', 'radio tube', 'nos tube' ), 'path' => array( 'Radio / Vacuum Tubes', null ), 'score' => 0.85 ),
			array( 'keywords' => array( 'vintage', 'retro', 'antique' ), 'path' => array( 'Vintage Electronics', null ), 'score' => 0.6 ),
			array( 'keywords' => array( 'oscilloscope', 'multimeter', 'signal generator', 'test equipment' ), 'path' => array( 'Test Equipment', null ), 'score' => 0.8 ),
			array( 'keywords' => array( 'ups', 'pdu', 'surge protector', 'power distribution' ), 'path' => array( 'Power & Accessories', 'Power Protection & Distribution' ), 'score' => 0.8 ),
			array( 'keywords' => array( 'power supply', 'psu', 'ac adapter', 'power adapter', 'charger' ), 'path' => array( 'Power & Accessories', 'Power Supplies & Adapters' ), 'score' => 0.75 ),
			array( 'keywords' => array( 'cable', 'connector', 'adapter cable', 'patch cable' ), 'path' => array( 'Power & Accessories', 'Computer Cables & Connectors' ), 'score' => 0.6 ),
		);
	}

	/**
	 * Normalize a title for fuzzy duplicate matching.
	 */
	public static function normalize_title( string $title ): string {
		$title = strtolower( wp_strip_all_tags( $title ) );
		$title = preg_replace( '/[^a-z0-9 ]+/', ' ', $title );
		$title = preg_replace( '/\s+/', ' ', $title );
		return trim( (string) $title );
	}

	/**
	 * Human label for an import status value.
	 */
	public static function status_label( string $status ): string {
		$labels = array(
			self::STATUS_IMPORTED_DRAFT   => 'Imported (draft)',
			self::STATUS_NEEDS_REVIEW     => 'Needs review',
			self::STATUS_READY_TO_PUBLISH => 'Ready to publish',
			self::STATUS_PUBLISHED        => 'Published',
			self::STATUS_SYNC_ERROR       => 'Sync error',
			self::STATUS_ARCHIVED         => 'Archived',
		);
		return $labels[ $status ] ?? ucfirst( str_replace( '_', ' ', $status ) );
	}
}
