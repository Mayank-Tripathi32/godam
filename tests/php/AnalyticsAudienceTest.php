<?php
/**
 * Unit tests for the Analytics audience breakdown proxy (fetch_audience_breakdown).
 *
 * The handler forwards to the analytics microservice's all-time
 * /processed-analytics/device-breakdown/ endpoint and returns only the five
 * *_views maps. The site-origin case is covered by SiteOriginTest's
 * analytics_reads provider.
 *
 * The method is exercised on a constructor-less instance (Base's constructor
 * registers WP hooks we don't want here); the WP HTTP / REST surface is stubbed
 * in tests/bootstrap.php and tests/stubs/wp-http-functions.php, and driven per-case via $GLOBALS['rtgodam_stub'].
 *
 * @package GoDAM
 */

namespace RTGODAM\Tests;

use PHPUnit\Framework\TestCase;
use RTGODAM\Inc\REST_API\Analytics;

/**
 * @covers \RTGODAM\Inc\REST_API\Analytics::fetch_audience_breakdown
 */
class AnalyticsAudienceTest extends TestCase {

	const VIEW_KEYS = array( 'device_views', 'browser_views', 'traffic_views', 'language_views', 'resolution_views' );

	/**
	 * Reset the per-test stub state, with a verified account so the handler
	 * reaches the HTTP call rather than returning early on the API-key check.
	 */
	protected function setUp(): void {
		parent::setUp();

		$GLOBALS['rtgodam_translated'] = array();
		$GLOBALS['rtgodam_stub']       = array(
			'options' => array(
				'rtgodam-account-token' => 'verified-account',
				'rtgodam-api-key'       => 'test-key',
			),
		);
	}

	/**
	 * Call the handler for video 7.
	 *
	 * @param array<string, mixed> $params Extra request params.
	 * @return array<string, mixed> The response data.
	 */
	private function call( $params = array() ) {
		$analytics = ( new \ReflectionClass( Analytics::class ) )->newInstanceWithoutConstructor();
		$response  = $analytics->fetch_audience_breakdown( new \WP_REST_Request( array_merge( array( 'video_id' => 7 ), $params ) ) );

		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$this->assertSame( 200, $response->get_status() );

		return $response->get_data();
	}

	/**
	 * Set the fake upstream HTTP response the wp_remote_* stubs return.
	 *
	 * @param int    $code HTTP status code.
	 * @param string $body Response body.
	 */
	private function set_http_response( $code, $body ) {
		$GLOBALS['rtgodam_stub']['http'] = array(
			'code' => $code,
			'body' => $body,
		);
	}

	/**
	 * @return array<string, array{0: array<string, string>}>
	 */
	public function missing_credentials() {
		return array(
			'no account token' => array( array( 'rtgodam-api-key' => 'test-key' ) ),
			'no api key'       => array( array( 'rtgodam-account-token' => 'verified-account' ) ),
		);
	}

	/**
	 * @dataProvider missing_credentials
	 *
	 * @param array<string, string> $options The stored options.
	 */
	public function test_missing_token_or_key_returns_missing_key_without_http_call( $options ) {
		$GLOBALS['rtgodam_stub']['options'] = $options;

		$data = $this->call();

		$this->assertSame( 'error', $data['status'] );
		$this->assertSame( 'missing_key', $data['errorType'] );
		$this->assertArrayNotHasKey( 'last_remote_url', $GLOBALS['rtgodam_stub'], 'no request should reach the microservice' );
	}

	public function test_requests_device_breakdown_path_with_video_and_site_and_no_dates() {
		$this->set_http_response( 200, wp_json_encode( array() ) );

		// Sent on purpose: the breakdown is all-time, so the handler must not forward them.
		$this->call(
			array(
				'start_date' => '2026-01-01',
				'end_date'   => '2026-01-31',
			)
		);

		$url = $GLOBALS['rtgodam_stub']['last_remote_url'];
		$this->assertSame( '/processed-analytics/device-breakdown/', wp_parse_url( $url, PHP_URL_PATH ) );

		parse_str( (string) wp_parse_url( $url, PHP_URL_QUERY ), $query );
		$this->assertSame( '7', (string) $query['video_id'] );
		$this->assertSame( 'https://example.test', $query['site_url'] );
		$this->assertArrayNotHasKey( 'start_date', $query );
		$this->assertArrayNotHasKey( 'end_date', $query );
		$this->assertArrayNotHasKey( 'timeout', $GLOBALS['rtgodam_stub']['last_remote_args'], 'uses the default HTTP timeout' );
	}

	/**
	 * The breakdown is all-time, so the route must not be in $range_routes.
	 *
	 * @covers \RTGODAM\Inc\REST_API\Analytics::get_rest_routes
	 */
	public function test_audience_route_takes_no_date_range_args() {
		$analytics = ( new \ReflectionClass( Analytics::class ) )->newInstanceWithoutConstructor();
		$routes    = array_column( $analytics->get_rest_routes(), 'args', 'route' );

		$this->assertArrayHasKey( '/analytics/audience', $routes );
		$this->assertArrayNotHasKey( 'start_date', $routes['/analytics/audience']['args'] );
		$this->assertArrayNotHasKey( 'end_date', $routes['/analytics/audience']['args'] );
	}

	public function test_wp_error_returns_microservice_error() {
		$GLOBALS['rtgodam_stub']['http'] = new \WP_Error( 'http_request_failed', 'timed out' );

		$data = $this->call();

		$this->assertSame( 'error', $data['status'] );
		$this->assertSame( 'microservice_error', $data['errorType'] );
	}

	/**
	 * @return array<string, array{0: int}>
	 */
	public function invalid_key_codes() {
		return array(
			'400' => array( 400 ),
			'404' => array( 404 ),
		);
	}

	/**
	 * @dataProvider invalid_key_codes
	 *
	 * @param int $code Upstream HTTP status.
	 */
	public function test_upstream_400_and_404_return_invalid_key( $code ) {
		$this->set_http_response( $code, wp_json_encode( array( 'detail' => 'Invalid video.' ) ) );

		$data = $this->call();

		$this->assertSame( 'error', $data['status'] );
		$this->assertSame( 'invalid_key', $data['errorType'] );
		$this->assertSame( 'Invalid video.', $data['message'] );
	}

	/**
	 * Upstream statuses that must map to microservice_error.
	 *
	 * @return array<string, array{0: int}>
	 */
	public function other_error_codes() {
		return array(
			'401' => array( 401 ),
			'403' => array( 403 ),
			'422' => array( 422 ),
			'500' => array( 500 ),
		);
	}

	/**
	 * A revoked key (401/403) must not look like "no viewers yet".
	 *
	 * @dataProvider other_error_codes
	 *
	 * @param int $code Upstream HTTP status.
	 */
	public function test_other_non_2xx_returns_microservice_error( $code ) {
		$this->set_http_response( $code, wp_json_encode( array( 'detail' => 'Boom.' ) ) );

		$data = $this->call();

		$this->assertSame( 'error', $data['status'] );
		$this->assertSame( 'microservice_error', $data['errorType'] );
	}

	public function test_200_non_json_body_returns_microservice_error() {
		$this->set_http_response( 200, '<html><body>502 Bad Gateway</body></html>' );

		$data = $this->call();

		$this->assertSame( 'error', $data['status'] );
		$this->assertSame( 'microservice_error', $data['errorType'] );
	}

	public function test_success_returns_only_five_view_maps() {
		$this->set_http_response(
			200,
			wp_json_encode(
				array(
					'device_views'     => array(
						'desktop' => 812,
						'mobile'  => 240,
						'unknown' => 32,
					),
					'browser_views'    => array(
						'Chrome'              => 700,
						'Edge'                => 245,
						'Additional browsers' => 12,
					),
					'traffic_views'    => array(
						'Internal'      => 520,
						'google.com'    => 140,
						'Direct / none' => 384,
					),
					'language_views'   => array(
						'en-US' => 560,
						'Other' => 214,
					),
					'resolution_views' => array(
						'1400x800' => 190,
						'Unknown'  => 8,
					),
					'video_id'         => 7,
					'job_id'           => null,
					'account_token'    => 'verified-account',
					'api_key'          => 'test-key',
					'site_url'         => 'https://example.test',
				)
			)
		);

		$data = $this->call();

		$this->assertSame( 'success', $data['status'] );
		$this->assertSame( self::VIEW_KEYS, array_keys( $data['data'] ) );
		$this->assertSame( 240, $data['data']['device_views']['mobile'] );
		$this->assertSame( 384, $data['data']['traffic_views']['Direct / none'] );

		$encoded = wp_json_encode( $data );
		$this->assertStringNotContainsString( 'verified-account', $encoded );
		$this->assertStringNotContainsString( 'test-key', $encoded );
	}

	/**
	 * @return array<string, array{0: string}>
	 */
	public function empty_bodies() {
		return array(
			'all maps empty' => array( '{"device_views":{},"browser_views":{},"traffic_views":{},"language_views":{},"resolution_views":{},"video_id":7}' ),
			'maps missing'   => array( '{}' ),
		);
	}

	/**
	 * @dataProvider empty_bodies
	 *
	 * @param string $body Upstream JSON body.
	 */
	public function test_empty_or_missing_maps_return_five_empty_maps( $body ) {
		$this->set_http_response( 200, $body );

		$data = $this->call();

		$this->assertSame( 'success', $data['status'] );
		$this->assertSame( array_fill_keys( self::VIEW_KEYS, array() ), $data['data'] );
	}
}
