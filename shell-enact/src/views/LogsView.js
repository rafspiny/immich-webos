import {useCallback, useRef, useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import Button from '@enact/sandstone/Button';
import BodyText from '@enact/sandstone/BodyText';
import Scroller from '@enact/sandstone/Scroller';
import Spottable from '@enact/spotlight/Spottable';
import ri from '@enact/ui/resolution';
import services from '../services';

// One spottable stop for the whole log area. Sandstone's Scroller does not scroll on
// 5-way arrows (useScroll/useEvent.js handleKeyDown only records the input type), and
// spottable rows would snap scrollLeft back to 0 (Scroller/useThemeScroller.js
// calculateScrollLeft), so this wrapper steps the scroller itself from the arrow keys.
const LogArea = Spottable('div');

const STEP = 240;

const readLines = () => services.debugLog.entries().map((entry) => services.debugLog.format(entry));

const LogsView = ({nav, params, ...rest}) => {
	const [lines, setLines] = useState(readLines);
	const pos = useRef({x: 0, y: 0});
	const scrollTo = useRef(null);
	const content = useRef(null);
	// New content starts at the top-left: reset the tracked position and the real scroll position together.
	const reload = () => {
		pos.current = {x: 0, y: 0};
		if (scrollTo.current && content.current) scrollTo.current({position: {x: 0, y: 0}, animate: false});
		setLines(readLines());
	};
	const clear = () => { services.debugLog.clear(); reload(); };
	const rowStyle = {whiteSpace: 'pre', fontFamily: 'monospace', fontSize: ri.scaleToRem(24), padding: '0 12px'};
	const [focused, setFocused] = useState(false);
	const onFocus = useCallback(() => setFocused(true), []);
	const onBlur = useCallback(() => setFocused(false), []);
	const captureScrollTo = useCallback((fn) => { scrollTo.current = fn; }, []);
	const onScrollStop = useCallback((ev) => { pos.current = {x: ev.scrollLeft, y: ev.scrollTop}; }, []);

	// Scroll by (dx, dy) and swallow the key so Spotlight does not also move focus. When the
	// area is already at its start edge the key is left alone, so Up still reaches the buttons.
	const step = (dx, dy) => (ev) => {
		const inner = content.current;
		const view = inner && inner.parentElement;
		if (!scrollTo.current || !view) return;
		const maxX = Math.max(0, inner.offsetWidth - view.clientWidth);
		const maxY = Math.max(0, inner.offsetHeight - view.clientHeight);
		const x = Math.min(maxX, Math.max(0, pos.current.x + dx));
		const y = Math.min(maxY, Math.max(0, pos.current.y + dy));
		if (x === pos.current.x && y === pos.current.y) return;
		pos.current = {x, y};
		scrollTo.current({position: {x, y}, animate: true});
		ev.preventDefault();
		ev.stopPropagation();
		ev.nativeEvent.stopImmediatePropagation();
	};
	const areaStyle = {
		height: '100%',
		boxSizing: 'border-box',
		outline: focused ? ri.scaleToRem(6) + ' solid #e6e6e6' : 'none',
		outlineOffset: '-' + ri.scaleToRem(6),
		background: focused ? 'rgba(230, 230, 230, 0.1)' : 'transparent'
	};

	return (
		<Panel {...rest}>
			<Header title="Logs">
				<slotAfter>
					<Button onClick={reload}>Refresh</Button>
					<Button onClick={clear}>Clear</Button>
				</slotAfter>
			</Header>
			{lines.length === 0 ? (
				<BodyText>
					{services.debugLog.isEnabled()
						? 'No log entries yet. Use the app, then come back.'
						: 'Logging is off. Turn on "Debug logging" in Settings, use the app, then come back.'}
				</BodyText>
			) : (
				<LogArea
					style={areaStyle}
					onFocus={onFocus}
					onBlur={onBlur}
					onSpotlightUp={step(0, -STEP)}
					onSpotlightDown={step(0, STEP)}
					onSpotlightLeft={step(-STEP, 0)}
					onSpotlightRight={step(STEP, 0)}
				>
					<Scroller direction="both" cbScrollTo={captureScrollTo} onScrollStop={onScrollStop}>
						<div ref={content} style={{display: 'inline-block', minWidth: '100%'}}>
							{lines.map((line, i) => <div key={i} style={rowStyle}>{line}</div>)}
						</div>
					</Scroller>
				</LogArea>
			)}
		</Panel>
	);
};

export default LogsView;
