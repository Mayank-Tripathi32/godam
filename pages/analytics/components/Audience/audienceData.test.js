/**
 * WordPress dependencies
 */
import { __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import {
	AUDIENCE_PANELS,
	getAudienceLabel,
	sortAudienceEntries,
	toPercentages,
	shapeAudiencePanel,
	shapeAudienceData,
	foldIntoOther,
} from './audienceData';
import { transformAudienceResponse } from '../../redux/api/analyticsApi';

// Identity `__` so labels read as English and calls can be asserted.
jest.mock( '@wordpress/i18n', () => ( { __: jest.fn( ( text ) => text ) } ) );

// Sample maps from the spec.
const SAMPLE = {
	device_views: { desktop: 812, mobile: 240, unknown: 32 },
	browser_views: { Chrome: 700, Edge: 245, Safari: 96, Firefox: 61, 'Additional browsers': 12 },
	traffic_views: { Internal: 520, 'google.com': 140, 'Direct / none': 384, Other: 40 },
	language_views: { 'en-US': 560, 'en-GB': 210, 'en-IN': 60, Other: 214 },
	resolution_views: { '1400x800': 190, '1900x1000': 140, '400x800': 96, Other: 260, Unknown: 8 },
};

const sumDisplay = ( rows ) => rows.reduce( ( sum, row ) => sum + row.displayPercent, 0 );

describe( 'getAudienceLabel', () => {
	beforeEach( () => __.mockClear() );

	it( 'maps lowercase device keys and passes unknown device keys through', () => {
		expect( getAudienceLabel( 'device_views', 'desktop' ) ).toBe( 'Desktop' );
		expect( getAudienceLabel( 'device_views', 'mobile' ) ).toBe( 'Mobile' );
		expect( getAudienceLabel( 'device_views', 'unknown' ) ).toBe( 'Unknown' );
		expect( getAudienceLabel( 'device_views', 'tablet' ) ).toBe( 'tablet' );
	} );

	it( 'translates fixed labels with the godam domain', () => {
		[ 'Desktop', 'Mobile' ].forEach( ( label ) => {
			getAudienceLabel( 'device_views', label.toLowerCase() );
			expect( __ ).toHaveBeenCalledWith( label, 'godam' );
		} );
		[ 'Unknown', 'Other', 'Internal', 'Direct / none', 'Additional browsers' ].forEach( ( label ) => {
			expect( getAudienceLabel( 'traffic_views', label ) ).toBe( label );
			expect( __ ).toHaveBeenCalledWith( label, 'godam' );
		} );
	} );

	it( 'passes domains, locales and sizes through untranslated', () => {
		expect( getAudienceLabel( 'traffic_views', 'google.com' ) ).toBe( 'google.com' );
		expect( getAudienceLabel( 'language_views', 'en-GB' ) ).toBe( 'en-GB' );
		expect( getAudienceLabel( 'resolution_views', '1400x800' ) ).toBe( '1400x800' );
		// Lowercase `desktop` is only a device bucket.
		expect( getAudienceLabel( 'traffic_views', 'desktop' ) ).toBe( 'desktop' );
		expect( getAudienceLabel( 'traffic_views', 'constructor' ) ).toBe( 'constructor' );
		expect( __ ).not.toHaveBeenCalled();
	} );
} );

describe( 'sortAudienceEntries', () => {
	const keys = ( entries ) => sortAudienceEntries( entries ).map( ( [ key ] ) => key );

	it( 'puts the highest value first and trailing buckets last in fixed order', () => {
		expect(
			keys( [
				[ 'Other', 900 ],
				[ 'Additional browsers', 800 ],
				[ 'a.com', 10 ],
				[ 'Unknown', 700 ],
				[ 'Direct / none', 600 ],
				[ 'b.com', 50 ],
			] ),
		).toEqual( [ 'b.com', 'a.com', 'Direct / none', 'Unknown', 'Additional browsers', 'Other' ] );
	} );

	it( 'trails Direct / none even when it is the largest value', () => {
		expect( keys( Object.entries( { ...SAMPLE.traffic_views, 'Direct / none': 9999 } ) ) ).toEqual( [
			'Internal',
			'google.com',
			'Direct / none',
			'Other',
		] );
	} );

	it( 'trails the lowercase device unknown bucket', () => {
		expect( keys( [ [ 'unknown', 999 ], [ 'mobile', 1 ] ] ) ).toEqual( [ 'mobile', 'unknown' ] );
	} );

	it( 'keeps input order for ties and does not mutate the input', () => {
		const input = [ [ 'b', 5 ], [ 'a', 5 ], [ 'c', 9 ] ];
		expect( keys( input ) ).toEqual( [ 'c', 'b', 'a' ] );
		expect( input[ 0 ][ 0 ] ).toBe( 'b' );
	} );
} );

describe( 'toPercentages', () => {
	it.each( Object.keys( SAMPLE ) )( 'display percents sum to 100 for the %s sample', ( key ) => {
		const rows = toPercentages( Object.entries( SAMPLE[ key ] ) );
		expect( sumDisplay( rows ) ).toBe( 100 );
		rows.forEach( ( row ) => expect( Number.isInteger( row.displayPercent ) ).toBe( true ) );
	} );

	it( 'splits 1/1/1 into integers summing to 100 and keeps exact shares', () => {
		const rows = toPercentages( [ [ 'a', 1 ], [ 'b', 1 ], [ 'c', 1 ] ] );
		expect( rows.map( ( row ) => row.displayPercent ) ).toEqual( [ 34, 33, 33 ] );
		expect( rows[ 0 ].percent ).toBeCloseTo( 33.333, 3 );
	} );

	it( 'gives extra points to the largest remainders', () => {
		// 1/8 = 12.5, 7/8 = 87.5: tie on remainder, first row wins.
		expect( toPercentages( [ [ 'a', 7 ], [ 'b', 1 ] ] ).map( ( row ) => row.displayPercent ) ).toEqual( [ 88, 12 ] );
		// 2/3 = 66.67 has the larger remainder over 1/3 = 33.33.
		expect( toPercentages( [ [ 'a', 1 ], [ 'b', 2 ] ] ).map( ( row ) => row.displayPercent ) ).toEqual( [ 33, 67 ] );
	} );

	it( 'returns [] for empty or all-zero input', () => {
		expect( toPercentages( [] ) ).toEqual( [] );
		expect( toPercentages( [ [ 'a', 0 ] ] ) ).toEqual( [] );
	} );
} );

describe( 'shapeAudiencePanel', () => {
	it( 'shapes a map into sorted, labelled rows', () => {
		const panel = shapeAudiencePanel( 'device_views', SAMPLE.device_views );
		expect( panel ).toMatchObject( { key: 'device_views', title: 'Device Usage', total: 1084, isEmpty: false } );
		expect( panel.items.map( ( item ) => [ item.label, item.value, item.displayPercent ] ) ).toEqual( [
			[ 'Desktop', 812, 75 ],
			[ 'Mobile', 240, 22 ],
			[ 'Unknown', 32, 3 ],
		] );
	} );

	it.each( [
		[ 'an empty object', {} ],
		[ 'an empty PHP array', [] ],
		[ 'null', null ],
		[ 'undefined', undefined ],
	] )( 'treats %s as an empty panel with no NaN', ( label, map ) => {
		const panel = shapeAudiencePanel( 'browser_views', map );
		expect( panel ).toEqual( { key: 'browser_views', title: 'Browser Usage', emptyText: 'Browser usage will show up here', total: 0, isEmpty: true, items: [] } );
	} );
} );

describe( 'foldIntoOther', () => {
	// Ten ranked sites worth 100, 90, ... 10.
	const ranked = [ ...Array( 10 ) ].map( ( _, i ) => [ `site${ i }.com`, 100 - ( i * 10 ) ] );

	it( 'leaves eight or fewer ranked entries alone', () => {
		const sorted = sortAudienceEntries( [ ...ranked.slice( 0, 8 ), [ 'Unknown', 3 ] ] );
		expect( foldIntoOther( sorted ) ).toBe( sorted );
	} );

	it( 'adds ranked entries past the top 8 to a new Other bucket', () => {
		const out = foldIntoOther( sortAudienceEntries( [ ...ranked, [ 'Unknown', 3 ] ] ) );
		expect( out.map( ( [ key ] ) => key ) ).toEqual( [ ...ranked.slice( 0, 8 ).map( ( [ key ] ) => key ), 'Unknown', 'Other' ] );
		expect( out.at( -1 ) ).toEqual( [ 'Other', 30 ] );
	} );

	it( 'adds them to an existing Other bucket and keeps the total', () => {
		const out = foldIntoOther( sortAudienceEntries( [ [ 'Other', 5 ], ...ranked ] ) );
		expect( out ).toHaveLength( 9 );
		expect( out.at( -1 ) ).toEqual( [ 'Other', 35 ] );
		expect( out.reduce( ( sum, [ , value ] ) => sum + value, 0 ) ).toBe( 555 );
	} );

	it( 'is applied by shapeAudiencePanel', () => {
		const panel = shapeAudiencePanel( 'traffic_views', Object.fromEntries( ranked ) );
		expect( panel.items ).toHaveLength( 9 );
		expect( panel.items.at( -1 ) ).toMatchObject( { key: 'Other', label: 'Other', value: 30 } );
		expect( sumDisplay( panel.items ) ).toBe( 100 );
	} );
} );

describe( 'shapeAudienceData', () => {
	it( 'returns the five panels in spec order', () => {
		expect( AUDIENCE_PANELS.map( ( panel ) => panel.title ) ).toEqual( [
			'Device Usage',
			'Browser Usage',
			'Referring Sites',
			'Browser Language',
			'Screen Size',
		] );
		expect( shapeAudienceData( SAMPLE ).map( ( panel ) => panel.key ) ).toEqual( [
			'device_views',
			'browser_views',
			'traffic_views',
			'language_views',
			'resolution_views',
		] );
	} );

	it( 'marks a missing map key as an empty panel', () => {
		const rest = { ...SAMPLE };
		delete rest.traffic_views;
		const panels = shapeAudienceData( rest );
		expect( panels[ 2 ] ).toMatchObject( { key: 'traffic_views', isEmpty: true, total: 0, items: [] } );
		expect( panels[ 0 ].isEmpty ).toBe( false );
	} );

	it( 'returns five empty panels for null data', () => {
		expect( shapeAudienceData( null ).every( ( panel ) => panel.isEmpty ) ).toBe( true );
	} );
} );

describe( 'transformAudienceResponse', () => {
	it( 'turns an error envelope into { errorType, message }', () => {
		expect(
			transformAudienceResponse( { status: 'error', errorType: 'invalid_key', message: 'Bad key' } ),
		).toEqual( { errorType: 'invalid_key', message: 'Bad key' } );
		expect( transformAudienceResponse( { status: 'error', message: 'x' } ).errorType ).toBe( 'unknown_error' );
	} );

	it( 'returns data on success', () => {
		expect( transformAudienceResponse( { status: 'success', data: SAMPLE } ) ).toBe( SAMPLE );
	} );

	it( 'throws on any other status', () => {
		expect( () => transformAudienceResponse( { message: 'boom' } ) ).toThrow( 'boom' );
	} );
} );
