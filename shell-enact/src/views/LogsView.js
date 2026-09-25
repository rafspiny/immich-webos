import {useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import Button from '@enact/sandstone/Button';
import BodyText from '@enact/sandstone/BodyText';
import Scroller from '@enact/sandstone/Scroller';
import Spottable from '@enact/spotlight/Spottable';
import ri from '@enact/ui/resolution';
import services from '../services';

const Row = Spottable('div');

const readLines = () => services.debugLog.entries().map((entry) => services.debugLog.format(entry));

const LogsView = ({nav, params, ...rest}) => {
	const [lines, setLines] = useState(readLines);
	const reload = () => setLines(readLines());
	const clear = () => { services.debugLog.clear(); reload(); };
	const rowStyle = {whiteSpace: 'pre', fontFamily: 'monospace', fontSize: ri.scaleToRem(24), padding: '0 12px'};

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
				<Scroller direction="both" focusableScrollbar>
					<div style={{display: 'inline-block', minWidth: '100%'}}>
						{lines.map((line, i) => <Row key={i} style={rowStyle}>{line}</Row>)}
					</div>
				</Scroller>
			)}
		</Panel>
	);
};

export default LogsView;
