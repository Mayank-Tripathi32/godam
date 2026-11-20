/**
 * Pure helpers that turn the audience breakdown maps into display-ready panels.
 * No DOM, d3 or React here so the shaping stays unit-testable.
 */

/**
 * WordPress dependencies
 */
import { __ } from '@wordpress/i18n';

/**
 * Panels in display order. Strings are getters so they translate at call time.
 */
export const AUDIENCE_PANELS = [
	{
		key: 'device_views',
		get title() {
			return __( 'Device Usage', 'godam' );
		},
		get emptyText() {
			return __( 'Device usage will show up here', 'godam' );
		},
	},
	{
		key: 'browser_views',
		get title() {
			return __( 'Browser Usage', 'godam' );
		},
		get emptyText() {
			return __( 'Browser usage will show up here', 'godam' );
		},
	},
	{
		key: 'traffic_views',
		get title() {
			return __( 'Referring Sites', 'godam' );
		},
		get emptyText() {
			return __( 'Referring sites will show up here', 'godam' );
		},
	},
	{
		key: 'language_views',
		get title() {
			return __( 'Browser Language', 'godam' );
		},
		get emptyText() {
			return __( 'Browser language will show up here', 'godam' );
		},
	},
	{
		key: 'resolution_views',
		get title() {
			return __( 'Screen Size', 'godam' );
		},
		get emptyText() {
			return __( 'Screen size will show up here', 'godam' );
		},
	},
];

// Buckets that always sit after the ranked entries, in this order.
const TRAILING_KEYS = [ 'Direct / none', 'Unknown', 'Additional browsers', 'Other' ];

/**
 * Display label for a raw map key. Fixed service buckets are translated;
 * domains, locales and screen sizes are shown exactly as received.
 *
 * @param {string} panelKey Panel map key, e.g. `device_views`.
 * @param {string} rawKey   Key as sent by the service.
 * @return {string} Label to display.
 */
export function getAudienceLabel( panelKey, rawKey ) {
	if ( panelKey === 'device_views' ) {
		switch ( rawKey ) {
			case 'desktop':
				return __( 'Desktop', 'godam' );
			case 'mobile':
				return __( 'Mobile', 'godam' );
			case 'unknown':
				return __( 'Unknown', 'godam' );
		}
	}

	switch ( rawKey ) {
		case 'Unknown':
			return __( 'Unknown', 'godam' );
		case 'Other':
			return __( 'Other', 'godam' );
		case 'Internal':
			return __( 'Internal', 'godam' );
		case 'Direct / none':
			return __( 'Direct / none', 'godam' );
		case 'Additional browsers':
			return __( 'Additional browsers', 'godam' );
		default:
			return rawKey;
	}
}

// -1 for ranked entries, else the trailing position. The device map sends `unknown` lowercase.
export const trailingRank = ( key ) => TRAILING_KEYS.indexOf( key === 'unknown' ? 'Unknown' : key );

/**
 * Highest value first, then the trailing buckets in fixed order. Stable for ties.
 *
 * @param {Array<[string, number]>} entries `[ key, value ]` pairs.
 * @return {Array<[string, number]>} Sorted copy.
 */
export function sortAudienceEntries( entries ) {
	return [ ...entries ].sort(
		( [ keyA, valueA ], [ keyB, valueB ] ) =>
			trailingRank( keyA ) - trailingRank( keyB ) || valueB - valueA,
	);
}

// Ranked entries kept per panel; the rest are added to Other.
export const TOP_RANKED = 8;

/**
 * Keep the top `TOP_RANKED` ranked entries and add the rest to Other.
 *
 * @param {Array<[string, number]>} sorted Entries from `sortAudienceEntries()`.
 * @return {Array<[string, number]>} Entries with at most `TOP_RANKED` ranked keys, still sorted.
 */
export function foldIntoOther( sorted ) {
	let extra = 0;
	// Ranked entries sort first, so any ranked entry at index >= TOP_RANKED is past the top 8.
	const kept = sorted.filter( ( [ key, value ], index ) => {
		const fold = index >= TOP_RANKED && trailingRank( key ) < 0;
		extra += fold ? value : 0;
		return ! fold;
	} );
	if ( kept.length === sorted.length ) {
		return sorted;
	}
	const other = kept.find( ( [ key ] ) => key === 'Other' );
	return other
		? kept.map( ( entry ) => ( entry === other ? [ 'Other', other[ 1 ] + extra ] : entry ) )
		: sortAudienceEntries( [ ...kept, [ 'Other', extra ] ] );
}

/**
 * Exact shares plus integer shares that sum to 100 (largest-remainder rounding).
 *
 * @param {Array<[string, number]>} entries `[ key, value ]` pairs.
 * @return {Array<{key: string, value: number, percent: number, displayPercent: number}>} Rows in input order; `[]` when the total is 0.
 */
export function toPercentages( entries ) {
	const total = entries.reduce( ( sum, [ , value ] ) => sum + value, 0 );
	if ( ! total ) {
		return [];
	}

	const rows = entries.map( ( [ key, value ] ) => {
		const percent = ( value / total ) * 100;
		return { key, value, percent, displayPercent: Math.floor( percent ) };
	} );

	const missing = 100 - rows.reduce( ( sum, row ) => sum + row.displayPercent, 0 );
	[ ...rows ]
		.sort( ( a, b ) => b.percent - b.displayPercent - ( a.percent - a.displayPercent ) )
		.slice( 0, missing )
		.forEach( ( row ) => row.displayPercent++ );

	return rows;
}

/**
 * Shape one `*_views` map into a panel.
 *
 * @param {string}            panelKey Panel map key, e.g. `device_views`.
 * @param {Object|Array|null} map      Key → viewer count. PHP sends an empty map as `[]`.
 * @return {Object} `{ key, title, emptyText, total, isEmpty, items }`.
 */
export function shapeAudiencePanel( panelKey, map ) {
	const entries = Object.entries( map || {} ).map( ( [ key, value ] ) => [ key, Number( value ) || 0 ] );
	const items = toPercentages( foldIntoOther( sortAudienceEntries( entries ) ) ).map( ( row ) => ( {
		...row,
		label: getAudienceLabel( panelKey, row.key ),
	} ) );

	const panel = AUDIENCE_PANELS.find( ( { key } ) => key === panelKey );

	return {
		key: panelKey,
		title: panel?.title,
		emptyText: panel?.emptyText,
		total: items.reduce( ( sum, item ) => sum + item.value, 0 ),
		isEmpty: items.length === 0,
		items,
	};
}

/**
 * Shape the audience response into the five panels, in display order.
 *
 * @param {Object|null} data The `data` object from the audience route.
 * @return {Array<Object>} Five panels from `shapeAudiencePanel()`.
 */
export function shapeAudienceData( data ) {
	return AUDIENCE_PANELS.map( ( { key } ) => shapeAudiencePanel( key, data?.[ key ] ) );
}
