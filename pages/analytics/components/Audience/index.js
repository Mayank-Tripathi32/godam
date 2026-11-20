/* global d3 */
/**
 * WordPress dependencies
 */
import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import { useFetchAudienceBreakdownQuery } from '../../redux/api/analyticsApi';
import { getGodamAccent } from '../../helper';
import AnalyticsSectionError from '../../../shared/AnalyticsSectionError';
import { shapeAudienceData, trailingRank } from './audienceData';
import AudiencePanel from './AudiencePanel';

// Ranked slice i is the accent mixed toward RANKED_MIX[ i ] = [ target, amount ], one per top-8 entry.
// Every step keeps at least 50% accent; `withColors()` then darkens any slice under 3:1 on white.
const RANKED_MIX = [
	[ '#ffffff', 0 ],
	[ '#1e1e1e', 0.45 ],
	[ '#ffffff', 0.25 ],
	[ '#00897b', 0.5 ],
	[ '#8e24aa', 0.5 ],
	[ '#d81b60', 0.5 ],
	[ '#2e7d32', 0.5 ],
	[ '#ef6c00', 0.5 ],
];
// WP greys, >= 3:1 against white, in trailing order (Direct / none, Unknown, Additional browsers, Other).
const TRAILING_GREYS = [ '#8c8f94', '#787c82', '#646970', '#50575e' ];

/**
 * WCAG contrast ratio of a colour against white.
 *
 * @param {string} color Any colour d3 parses.
 * @return {number} Ratio from 1 to 21.
 */
export function contrastOnWhite( color ) {
	const { r, g, b } = d3.rgb( color );
	const lin = ( v ) => ( ( v /= 255 ) <= 0.03928 ? v / 12.92 : Math.pow( ( v + 0.055 ) / 1.055, 2.4 ) );
	return 1.05 / ( ( 0.2126 * lin( r ) ) + ( 0.7152 * lin( g ) ) + ( 0.0722 * lin( b ) ) + 0.05 );
}

/**
 * Give every item of a panel its slice/swatch colour. Mixed in JS (d3 is a page
 * global) so it works without CSS color-mix() and accepts hex or rgb() accents.
 *
 * @param {Object} panel  Panel from `shapeAudienceData()`.
 * @param {string} accent Admin accent colour.
 * @return {Object} Panel with a hex `color` on each item.
 */
export function withColors( panel, accent ) {
	return {
		...panel,
		items: panel.items.map( ( item, index ) => {
			if ( trailingRank( item.key ) >= 0 ) {
				return { ...item, color: TRAILING_GREYS[ trailingRank( item.key ) ] };
			}
			// `shapeAudiencePanel()` keeps at most 8 ranked items, one per RANKED_MIX step.
			const [ target, amount ] = RANKED_MIX[ index ];
			let color = d3.color( d3.interpolateRgb( accent, target )( amount ) );
			// Light accents (Sunrise, Midnight, Ocean, Light) mix below 3:1, so step them darker.
			while ( contrastOnWhite( color.formatHex() ) < 3 ) {
				color = color.darker( 0.1 );
			}
			return { ...item, color: color.formatHex() };
		} ),
	};
}

/**
 * All-time audience breakdown for one video: five donut + list cards.
 *
 * @param {Object}  props
 * @param {number}  props.videoId    Attachment ID.
 * @param {string}  props.siteUrl    This site's origin, sent like the page's other analytics calls.
 * @param {boolean} props.shouldSkip Page-level skip (no key, key error, or primary fetch not ready).
 * @return {JSX.Element} The panels row, or only the empty status region while skipped.
 */
export default function AudiencePanels( { videoId, siteUrl, shouldSkip } ) {
	const skip = shouldSkip || ! videoId;
	const { data, isError, isLoading, isFetching, refetch } = useFetchAudienceBreakdownQuery( { videoId, siteUrl }, { skip } );

	// The route reports errors as a successful `{ errorType, message }` body.
	const hasError = isError || !! data?.errorType;

	// Memoised so the donuts only redraw when the response changes.
	const panels = useMemo( () => {
		if ( ! data || data.errorType ) {
			return [];
		}
		const accent = getGodamAccent();
		return shapeAudienceData( data ).map( ( panel ) => withColors( panel, accent ) );
	}, [ data ] );

	// Only blank the row on a first load; a retry or refetch keeps what is on screen.
	const showSkeleton = ! skip && ( isLoading || ( isFetching && ! data ) );

	// Outside the busy grid so assistive tech doesn't defer it, and mounted while skipped so the
	// loading text arrives as a change to an existing live region (announced) rather than with it.
	const status = (
		<span className="screen-reader-text" role="status">
			{ showSkeleton ? __( 'Loading audience breakdown…', 'godam' ) : '' }
		</span>
	);

	if ( skip ) {
		return status;
	}

	let content;
	if ( showSkeleton ) {
		// Height estimated from a four-row card (padding, head, 180px donut, list); not measured in a browser.
		content = [ 0, 1, 2, 3, 4 ].map( ( i ) => (
			<div key={ i } className="h-[380px] rounded-xl animate-pulse bg-zinc-100" aria-hidden="true" />
		) );
	} else if ( hasError ) {
		content = (
			<div className="col-span-full">
				<AnalyticsSectionError onRetry={ refetch } testId="godam-analytics-audience-error" />
			</div>
		);
	} else {
		content = panels.map( ( panel ) => <AudiencePanel key={ panel.key } panel={ panel } /> );
	}

	return (
		<>
			{ status }
			<div
				className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 px-10 pt-4"
				data-test-id="godam-analytics-audience"
				aria-busy={ showSkeleton }
			>
				{ content }
			</div>
		</>
	);
}
