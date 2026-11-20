/**
 * jsdom tests for the audience donut: mounts it with react-dom so the d3 effect runs.
 *
 * @package
 */

/**
 * External dependencies
 */
import { createRoot } from 'react-dom/client';
import { act } from 'react';

/**
 * Internal dependencies
 */
import AudienceDonut from './AudienceDonut';

// The page loads d3 as a global from the vendored build.
global.d3 = require( '../../../../assets/src/libs/d3.js' );
global.IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = [
	{ label: 'Desktop', value: 75, displayPercent: 75, color: '#3858e9' },
	{ label: 'Mobile', value: 25, displayPercent: 25, color: '#1e1e1e' },
];

// jsdom has no layout, so give the card and tooltip fixed widths.
const CARD_WIDTH = 200;
const TOOLTIP_WIDTH = 80;

describe( 'AudienceDonut', () => {
	let host;
	let root;

	beforeAll( () => {
		jest.spyOn( HTMLElement.prototype, 'clientWidth', 'get' ).mockReturnValue( CARD_WIDTH );
		jest.spyOn( HTMLElement.prototype, 'offsetWidth', 'get' ).mockReturnValue( TOOLTIP_WIDTH );
	} );

	afterAll( () => jest.restoreAllMocks() );

	beforeEach( () => {
		host = document.createElement( 'div' );
		document.body.appendChild( host );
		root = createRoot( host );
	} );

	afterEach( () => host.remove() );

	const mount = ( props ) => act( () => root.render( <AudienceDonut { ...props } /> ) );

	it( 'draws one svg after a re-render', () => {
		mount( { items: ITEMS, total: 100 } );
		mount( { items: [ ...ITEMS ], total: 101 } );
		expect( host.querySelectorAll( 'svg' ) ).toHaveLength( 1 );
		expect( host.querySelectorAll( '.godam-audience-tooltip' ) ).toHaveLength( 1 );
		expect( host.querySelectorAll( 'path' ) ).toHaveLength( 2 );
		act( () => root.unmount() );
	} );

	it( 'leaves no svg or tooltip behind after unmount', () => {
		mount( { items: ITEMS, total: 100 } );
		act( () => root.unmount() );
		expect( host.querySelector( 'svg' ) ).toBeNull();
		expect( document.querySelector( '.godam-audience-tooltip' ) ).toBeNull();
	} );

	it( 'keeps the tooltip inside the card near the right edge', () => {
		mount( { items: ITEMS, total: 100 } );
		const path = host.querySelector( 'path' );
		act( () => {
			path.dispatchEvent( new MouseEvent( 'mouseover', { bubbles: true, clientX: CARD_WIDTH - 10, clientY: 50 } ) );
		} );
		const tooltip = host.querySelector( '.godam-audience-tooltip' );
		const left = parseFloat( tooltip.style.left );
		expect( tooltip.textContent ).toBe( 'Desktop: 75%' );
		expect( left ).toBeGreaterThanOrEqual( 0 );
		expect( left + TOOLTIP_WIDTH ).toBeLessThanOrEqual( CARD_WIDTH );
		act( () => root.unmount() );
	} );
} );
