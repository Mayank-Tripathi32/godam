/**
 * Unit tests for the audience panels row.
 *
 * Mocks the audience query and renders with `renderToString` (effects, and so
 * the d3 donut, do not run).
 *
 * @package
 */

/**
 * External dependencies
 */
// React's server renderer runs hooks (useMemo); @wordpress/element's serializer does not.
// The node build, because jsdom has no TextEncoder for the browser build.
import { renderToString } from 'react-dom/server.node';

jest.mock( '../../redux/api/analyticsApi', () => ( {
	useFetchAudienceBreakdownQuery: jest.fn(),
} ) );

/**
 * Internal dependencies
 */
import { useFetchAudienceBreakdownQuery } from '../../redux/api/analyticsApi';
import AudiencePanels, { contrastOnWhite, withColors } from './index';
import { shapeAudiencePanel } from './audienceData';

// The page loads d3 as a global from the vendored build; colours are mixed with it.
global.d3 = require( '../../../../assets/src/libs/d3.js' );

const DATA = {
	device_views: { desktop: 75, mobile: 23, unknown: 2 },
	browser_views: { Chrome: 700, 'Additional browsers': 12 },
	traffic_views: { 'Direct / none': 384, 'google.com': 140 },
	language_views: { 'en-US': 560 },
	resolution_views: [],
};

// Strip tags so assertions read like the rendered text.
const text = ( html ) => html.replace( /<[^>]+>/g, ' ' ).replace( /\s+/g, ' ' );

const SITE = 'https://example.test';
// Kept mounted while skipped so the loading text is announced as a change.
const EMPTY_STATUS = '<span class="screen-reader-text" role="status"></span>';
const render = ( props = { videoId: 42, siteUrl: SITE, shouldSkip: false } ) => renderToString( <AudiencePanels { ...props } /> );

describe( 'AudiencePanels', () => {
	beforeEach( () => {
		useFetchAudienceBreakdownQuery.mockReset();
		useFetchAudienceBreakdownQuery.mockReturnValue( { data: DATA, isError: false, isFetching: false } );
	} );

	it( 'queries with the video ID and site URL', () => {
		render();
		expect( useFetchAudienceBreakdownQuery ).toHaveBeenCalledWith( { videoId: 42, siteUrl: SITE }, { skip: false } );
	} );

	it( 'renders the five titles in spec order', () => {
		const html = render();
		const titles = [ 'Device Usage', 'Browser Usage', 'Referring Sites', 'Browser Language', 'Screen Size' ];
		const positions = titles.map( ( title ) => html.indexOf( `<h2>${ title }</h2>` ) );
		expect( positions.every( ( pos ) => pos >= 0 ) ).toBe( true );
		expect( [ ...positions ].sort( ( a, b ) => a - b ) ).toEqual( positions );
	} );

	it( 'renders rows as label plus percentage', () => {
		const out = text( render() );
		expect( out ).toContain( 'Desktop 75%' );
		expect( out ).toContain( 'Mobile 23%' );
		expect( out ).toContain( 'google.com 27%' );
		expect( out ).toContain( 'Direct / none 73%' );
	} );

	it( 'names each donut with its total and hides the d3 drawing from assistive tech', () => {
		const html = render();
		// Device total is 75 + 23 + 2.
		expect( html ).toContain( '<div role="img" aria-label="Donut chart, 100 viewers in total"><div class="relative flex justify-center" aria-hidden="true">' );
		expect( html ).not.toContain( 'aria-label="Desktop: 75%' );
	} );

	it( 'clears aria-busy and the loading status once loaded', () => {
		const html = render();
		expect( html ).toContain( 'aria-busy="false"' );
		expect( html ).toContain( '<span class="screen-reader-text" role="status"></span>' );
	} );

	it( 'uses the singular for a single viewer', () => {
		useFetchAudienceBreakdownQuery.mockReturnValue( { data: { ...DATA, language_views: { 'en-US': 1 } }, isError: false, isFetching: false } );
		expect( render() ).toContain( 'aria-label="Donut chart, 1 viewer in total"' );
	} );

	it( 'renders the empty state for an empty map', () => {
		const out = text( render() );
		expect( out ).toContain( 'Screen size will show up here' );
		expect( out ).not.toContain( 'Device usage will show up here' );
	} );

	it( 'keeps loaded panels on screen while refetching', () => {
		useFetchAudienceBreakdownQuery.mockReturnValue( { data: DATA, isError: false, isLoading: false, isFetching: true } );
		const html = render();
		expect( html ).toContain( '<h2>Device Usage</h2>' );
		expect( html ).not.toContain( 'animate-pulse' );
	} );

	it( 'shows skeletons on the first load', () => {
		useFetchAudienceBreakdownQuery.mockReturnValue( { data: undefined, isError: false, isLoading: true, isFetching: true } );
		const html = render();
		expect( html ).toContain( 'animate-pulse' );
		expect( html ).toContain( 'aria-busy="true"' );
		// The status sits before the busy grid, not inside it.
		expect( html ).toMatch( /^<span class="screen-reader-text" role="status">Loading audience breakdown…<\/span><div[^>]*aria-busy="true"/ );
		expect( html.match( /animate-pulse bg-zinc-100" aria-hidden="true"/g ) ).toHaveLength( 5 );
	} );

	it( 'renders AnalyticsSectionError for an error envelope', () => {
		useFetchAudienceBreakdownQuery.mockReturnValue( { data: { errorType: 'microservice_error', message: 'x' }, isError: false, isFetching: false } );
		const html = render();
		expect( html ).toContain( 'godam-analytics-audience-error' );
		expect( html ).not.toContain( '<h2>' );
	} );

	it( 'renders AnalyticsSectionError for a failed request', () => {
		useFetchAudienceBreakdownQuery.mockReturnValue( { data: undefined, isError: true, isFetching: false } );
		expect( render() ).toContain( 'godam-analytics-audience-error' );
	} );

	it( 'renders only the empty status region and skips the query when videoId is missing', () => {
		useFetchAudienceBreakdownQuery.mockReturnValue( { data: undefined, isError: false, isFetching: false } );
		expect( render( { videoId: 0, siteUrl: SITE, shouldSkip: false } ) ).toBe( EMPTY_STATUS );
		expect( useFetchAudienceBreakdownQuery ).toHaveBeenCalledWith( { videoId: 0, siteUrl: SITE }, { skip: true } );
	} );

	it( 'renders only the empty status region and skips the query when the page skip condition holds', () => {
		useFetchAudienceBreakdownQuery.mockReturnValue( { data: undefined, isError: false, isFetching: false } );
		expect( render( { videoId: 42, siteUrl: SITE, shouldSkip: true } ) ).toBe( EMPTY_STATUS );
		expect( useFetchAudienceBreakdownQuery ).toHaveBeenCalledWith( { videoId: 42, siteUrl: SITE }, { skip: true } );
	} );

	// `--wp-admin-theme-color` for each core admin colour scheme, plus the `getGodamAccent()` fallback.
	const ACCENTS = {
		fresh: '#2271b1',
		light: '#0085ba',
		modern: '#3858e9',
		blue: '#096484',
		coffee: '#46403c',
		ectoplasm: '#523f6d',
		midnight: '#e14d43',
		ocean: '#627c83',
		sunrise: '#dd823b',
		fallback: '#ab3a6c',
	};

	it.each( Object.entries( ACCENTS ) )( 'gives every slice a distinct colour with at least 3:1 contrast on white (%s)', ( scheme, accent ) => {
		const map = { Internal: 900, Other: 5, Unknown: 6, 'Direct / none': 950, 'Additional browsers': 7 };
		[ 'a.com', 'b.com', 'c.com', 'd.com', 'e.com', 'f.com', 'g.com', 'h.com' ].forEach( ( site, i ) => {
			map[ site ] = 800 - ( i * 50 );
		} );
		const { items } = withColors( shapeAudiencePanel( 'traffic_views', map ), accent );
		const colors = items.map( ( item ) => item.color );

		// 8 ranked (h.com folds into Other) plus the 4 trailing buckets.
		expect( items ).toHaveLength( 12 );
		expect( new Set( colors ).size ).toBe( 12 );
		colors.forEach( ( color ) => expect( contrastOnWhite( color ) ).toBeGreaterThanOrEqual( 3 ) );
	} );
} );
