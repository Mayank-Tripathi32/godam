/* global d3 */
/**
 * WordPress dependencies
 */
import { useEffect, useRef } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import { formatNumber } from '../../../utils/formatters';

const SIZE = 180;
// 6px of headroom covers the +4px hover growth (the svg is also overflow: visible).
const RADIUS = ( SIZE / 2 ) - 6;

/**
 * "Label: NN%" for one slice, shown in the hover tooltip.
 *
 * @param {Object} item Panel item.
 * @return {string} Formatted text.
 */
const sliceText = ( item ) => sprintf(
	/* translators: 1: label such as a browser or site, 2: percentage of viewers. */
	__( '%1$s: %2$d%%', 'godam' ),
	item.label,
	item.displayPercent,
);

/**
 * Donut for one audience panel. Draws into its own ref with no ids. The hover
 * tooltip lives inside that container and avoids the `tooltip` class, because
 * charts.js deletes every `body div.tooltip` on each render.
 *
 * @param {Object}        props
 * @param {Array<Object>} props.items Panel items with `label`, `value`, `displayPercent`, `color`.
 * @param {number}        props.total Total viewers, shown in the centre.
 * @return {JSX.Element} The chart container.
 */
export default function AudienceDonut( { items, total } ) {
	const ref = useRef( null );

	useEffect( () => {
		const container = d3.select( ref.current );
		container.selectAll( '*' ).remove();

		const svg = container
			.append( 'svg' )
			.attr( 'viewBox', `0 0 ${ SIZE } ${ SIZE }` )
			.attr( 'width', '100%' )
			.style( 'max-width', `${ SIZE }px` )
			.style( 'overflow', 'visible' ) // Let the hovered slice grow past the viewBox.
			.append( 'g' )
			.attr( 'transform', `translate(${ SIZE / 2 },${ SIZE / 2 })` );

		// Inline styles mirror Central's DeviceBreakdown tooltip.
		const tooltip = container
			.append( 'div' )
			.attr( 'class', 'godam-audience-tooltip' )
			.style( 'position', 'absolute' )
			.style( 'pointer-events', 'none' )
			.style( 'opacity', 0 )
			.style( 'transition', 'opacity .2s' )
			.style( 'background', '#fff' )
			.style( 'border', '1px solid #ddd' )
			.style( 'border-radius', '8px' )
			.style( 'padding', '8px 12px' )
			.style( 'box-shadow', '0 4px 12px rgba(0,0,0,.15)' )
			.style( 'font-size', '13px' )
			.style( 'color', '#18181b' )
			.style( 'white-space', 'nowrap' )
			.style( 'z-index', 10 );

		const arc = d3.arc().innerRadius( RADIUS * 0.6 ).outerRadius( RADIUS );
		const arcHover = d3.arc().innerRadius( RADIUS * 0.6 ).outerRadius( RADIUS + 4 );
		const moveTooltip = ( event ) => {
			const [ x, y ] = d3.pointer( event, ref.current );
			const width = tooltip.node().offsetWidth;
			// Flip to the pointer's left when the tooltip would pass the container or viewport edge.
			const rightLimit = Math.min( ref.current.clientWidth, window.innerWidth - ref.current.getBoundingClientRect().left );
			const left = x + 12 + width > rightLimit ? Math.max( 0, x - 12 - width ) : x + 12;
			tooltip.style( 'left', `${ left }px` ).style( 'top', `${ y - 28 }px` );
		};
		svg.selectAll( 'path' )
			.data( d3.pie().value( ( d ) => d.value ).sort( null )( items ) )
			.enter()
			.append( 'path' )
			.attr( 'd', arc )
			.style( 'fill', ( d ) => d.data.color )
			.style( 'stroke', '#fff' )
			.style( 'stroke-width', 1 )
			.style( 'cursor', 'default' )
			.on( 'mouseover', function( event, d ) {
				d3.select( this ).transition().duration( 200 ).attr( 'd', arcHover );
				// .text() only: labels include untrusted referrer domains.
				tooltip.text( sliceText( d.data ) ).style( 'opacity', 1 );
				moveTooltip( event );
			} )
			.on( 'mousemove', moveTooltip )
			.on( 'mouseout', function() {
				d3.select( this ).transition().duration( 200 ).attr( 'd', arc );
				tooltip.style( 'opacity', 0 );
			} );

		// Same centre text as the Views by Source donut (.center-text-* in index.scss, scoped to that card).
		svg.append( 'text' )
			.attr( 'text-anchor', 'middle' )
			.attr( 'dy', -10 )
			.style( 'font-size', '14px' )
			.style( 'fill', '#8E8E93' )
			.text( __( 'Viewers', 'godam' ) );
		svg.append( 'text' )
			.attr( 'text-anchor', 'middle' )
			.attr( 'dy', 20 )
			.style( 'font-size', '24px' )
			.style( 'font-weight', '600' )
			.text( formatNumber( total ) );

		return () => container.selectAll( '*' ).remove();
	}, [ items, total ] );

	// The rows live in the list below; the name carries the centre total, which is otherwise only SVG text.
	const label = sprintf(
		/* translators: %s: total number of viewers. */
		_n( 'Donut chart, %s viewer in total', 'Donut chart, %s viewers in total', total, 'godam' ),
		formatNumber( total ),
	);

	// d3 draws into the inner div, hidden from assistive tech so its SVG text and hover tooltip don't leak as fragments.
	return (
		<div role="img" aria-label={ label }>
			<div ref={ ref } className="relative flex justify-center" aria-hidden="true" />
		</div>
	);
}
