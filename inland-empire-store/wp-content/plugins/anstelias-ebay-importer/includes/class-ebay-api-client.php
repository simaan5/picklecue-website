<?php
/**
 * Minimal eBay Trading API client (GetSellerList) using the official
 * XML endpoint + a user token. No paid SDK required.
 *
 * Free to use with a standard eBay developer account. Falls back gracefully:
 * if no credentials are configured, callers should use CSV import instead.
 *
 * @package Anstelias\EbayImporter
 */

namespace Anstelias\EbayImporter;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Ebay_API_Client {

	const COMPAT_LEVEL = '1193';
	const SITE_ID      = '0'; // US

	/** @var Logger */
	private $log;

	public function __construct( Logger $log ) {
		$this->log = $log;
	}

	private function endpoint(): string {
		return 'sandbox' === Settings::get( 'ebay_environment', 'production' )
			? 'https://api.sandbox.ebay.com/ws/api.dll'
			: 'https://api.ebay.com/ws/api.dll';
	}

	/**
	 * Test connectivity with GeteBayOfficialTime (cheap call).
	 *
	 * @return array{ok:bool,message:string}
	 */
	public function test_connection(): array {
		if ( ! Settings::has_api_creds() ) {
			return array( 'ok' => false, 'message' => 'Missing eBay App ID or user token.' );
		}
		$xml = '<?xml version="1.0" encoding="utf-8"?>'
			. '<GeteBayOfficialTimeRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
			. '<RequesterCredentials><eBayAuthToken>' . esc_html( Settings::get( 'ebay_user_token' ) ) . '</eBayAuthToken></RequesterCredentials>'
			. '</GeteBayOfficialTimeRequest>';
		$resp = $this->call( 'GeteBayOfficialTime', $xml );
		if ( is_wp_error( $resp ) ) {
			return array( 'ok' => false, 'message' => $resp->get_error_message() );
		}
		$time = (string) ( $resp->Timestamp ?? '' );
		return $time
			? array( 'ok' => true, 'message' => 'Connected. eBay time: ' . $time )
			: array( 'ok' => false, 'message' => 'Unexpected response: ' . substr( wp_json_encode( $resp ), 0, 200 ) );
	}

	/**
	 * Fetch active listings as normalized records.
	 *
	 * @param int $limit     Max records to return (0 = all).
	 * @param int $per_page  Page size (max 200).
	 * @return array{records:array<int,array>,errors:string[]}
	 */
	public function fetch_active_listings( int $limit = 0, int $per_page = 100 ): array {
		$records = array();
		$errors  = array();
		$per_page = min( 200, max( 1, $per_page ) );
		$page    = 1;
		$token   = Settings::get( 'ebay_user_token' );

		do {
			$xml = '<?xml version="1.0" encoding="utf-8"?>'
				. '<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
				. '<RequesterCredentials><eBayAuthToken>' . esc_html( $token ) . '</eBayAuthToken></RequesterCredentials>'
				. '<GranularityLevel>Fine</GranularityLevel>'
				. '<IncludeVariations>false</IncludeVariations>'
				. '<DetailLevel>ReturnAll</DetailLevel>'
				. '<EndTimeFrom>' . gmdate( 'Y-m-d\TH:i:s\Z' ) . '</EndTimeFrom>'
				. '<EndTimeTo>' . gmdate( 'Y-m-d\TH:i:s\Z', strtotime( '+120 days' ) ) . '</EndTimeTo>'
				. '<Pagination><EntriesPerPage>' . $per_page . '</EntriesPerPage><PageNumber>' . $page . '</PageNumber></Pagination>'
				. '</GetSellerListRequest>';

			$resp = $this->call( 'GetSellerList', $xml );
			if ( is_wp_error( $resp ) ) {
				$errors[] = 'Page ' . $page . ': ' . $resp->get_error_message();
				break;
			}

			$ack = (string) ( $resp->Ack ?? 'Failure' );
			if ( ! in_array( $ack, array( 'Success', 'Warning' ), true ) ) {
				$errors[] = 'eBay Ack=' . $ack . ' ' . $this->extract_errors( $resp );
				break;
			}

			$items = $resp->ItemArray->Item ?? array();
			foreach ( $items as $item ) {
				$records[] = $this->item_to_record( $item );
				if ( $limit && count( $records ) >= $limit ) {
					return array( 'records' => array_slice( $records, 0, $limit ), 'errors' => $errors );
				}
			}

			$total_pages = (int) ( $resp->PaginationResult->TotalNumberOfPages ?? 1 );
			$page++;
		} while ( $page <= $total_pages );

		return array( 'records' => $records, 'errors' => $errors );
	}

	/**
	 * Convert a Trading-API Item node to a normalized record.
	 */
	private function item_to_record( \SimpleXMLElement $item ): array {
		$specifics = array();
		if ( isset( $item->ItemSpecifics->NameValueList ) ) {
			foreach ( $item->ItemSpecifics->NameValueList as $nv ) {
				$name = (string) $nv->Name;
				$val  = (string) $nv->Value;
				if ( $name ) {
					$specifics[ $name ] = $val;
				}
			}
		}
		$images = array();
		if ( isset( $item->PictureDetails->PictureURL ) ) {
			foreach ( $item->PictureDetails->PictureURL as $u ) {
				$images[] = (string) $u;
			}
		}
		return array(
			'ebay_item_id'  => (string) $item->ItemID,
			'listing_url'   => (string) ( $item->ListingDetails->ViewItemURL ?? '' ),
			'title'         => (string) $item->Title,
			'description'   => (string) ( $item->Description ?? '' ),
			'price'         => (string) ( $item->SellingStatus->CurrentPrice ?? $item->StartPrice ?? '' ),
			'quantity'      => (int) ( $item->Quantity ?? 1 ) - (int) ( $item->SellingStatus->QuantitySold ?? 0 ),
			'sku'           => (string) ( $item->SKU ?? '' ),
			'condition'     => (string) ( $item->ConditionDisplayName ?? '' ),
			'brand'         => $specifics['Brand'] ?? '',
			'mpn'           => $specifics['MPN'] ?? '',
			'ebay_category' => (string) ( $item->PrimaryCategory->CategoryName ?? '' ),
			'images'        => $images,
			'specifics'     => $specifics,
		);
	}

	/**
	 * Perform a Trading API XML call with retries.
	 *
	 * @return \SimpleXMLElement|\WP_Error
	 */
	private function call( string $call_name, string $body ) {
		$args = array(
			'headers' => array(
				'X-EBAY-API-COMPATIBILITY-LEVEL' => self::COMPAT_LEVEL,
				'X-EBAY-API-DEV-NAME'            => Settings::get( 'ebay_dev_id' ),
				'X-EBAY-API-APP-NAME'            => Settings::get( 'ebay_app_id' ),
				'X-EBAY-API-CERT-NAME'           => Settings::get( 'ebay_cert_id' ),
				'X-EBAY-API-CALL-NAME'           => $call_name,
				'X-EBAY-API-SITEID'              => self::SITE_ID,
				'Content-Type'                   => 'text/xml',
			),
			'body'    => $body,
			'timeout' => 45,
		);

		$attempts = 0;
		$max = 3;
		do {
			$attempts++;
			$resp = wp_remote_post( $this->endpoint(), $args );
			if ( ! is_wp_error( $resp ) && 200 === wp_remote_retrieve_response_code( $resp ) ) {
				$raw = wp_remote_retrieve_body( $resp );
				$prev = libxml_use_internal_errors( true );
				$xml = simplexml_load_string( $raw );
				libxml_use_internal_errors( $prev );
				if ( false === $xml ) {
					return new \WP_Error( 'ebay_parse', 'Could not parse eBay XML response' );
				}
				return $xml;
			}
			$wait = 2 ** $attempts; // 2,4,8s backoff
			if ( $attempts < $max ) {
				sleep( $wait );
			}
		} while ( $attempts < $max );

		$msg = is_wp_error( $resp ) ? $resp->get_error_message() : 'HTTP ' . wp_remote_retrieve_response_code( $resp );
		$this->log->error( 'eBay API call failed', array( 'call' => $call_name, 'reason' => $msg ) );
		return new \WP_Error( 'ebay_http', $msg );
	}

	private function extract_errors( \SimpleXMLElement $resp ): string {
		$msgs = array();
		if ( isset( $resp->Errors ) ) {
			foreach ( $resp->Errors as $e ) {
				$msgs[] = (string) $e->ShortMessage;
			}
		}
		return implode( '; ', $msgs );
	}
}
