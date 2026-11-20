/**
 * WordPress dependencies
 */
import { __, sprintf } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import AudienceDonut from './AudienceDonut';

/**
 * One audience card: donut plus a labelled percentage list. Labels are
 * service strings (referrer domains included), so they render as React text only.
 *
 * @param {Object} props
 * @param {Object} props.panel Panel from `shapeAudienceData()`, items carrying `color`.
 * @return {JSX.Element} The card.
 */
export default function AudiencePanel( { panel } ) {
	return (
		<div className="godam-card min-w-0" data-test-id={ `godam-audience-${ panel.key }` }>
			<div className="godam-card__head">
				<h2>{ panel.title }</h2>
			</div>
			{ panel.isEmpty ? (
				<p className="text-center text-[13px] text-[#757575] py-7 px-2 m-0">{ panel.emptyText }</p>
			) : (
				<>
					<AudienceDonut items={ panel.items } total={ panel.total } />
					{ /* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics when list-style is none. */ }
					<ul className="m-0 mt-4 p-0 list-none flex flex-col gap-2" role="list">
						{ panel.items.map( ( item ) => (
							<li key={ item.key } className="flex items-center gap-2 text-sm m-0">
								<span
									className="w-2.5 h-2.5 rounded-full shrink-0"
									style={ { background: item.color } }
									aria-hidden="true"
								/>
								<span className="flex-1 min-w-0 break-words xl:truncate text-[#3f3f46]" title={ item.label }>{ item.label }</span>
								<span className="font-medium text-[#1e1e1e]">
									{ sprintf(
										/* translators: %d: percentage of viewers. */
										__( '%d%%', 'godam' ),
										item.displayPercent,
									) }
								</span>
							</li>
						) ) }
					</ul>
				</>
			) }
		</div>
	);
}
