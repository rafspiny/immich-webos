import {useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import SwitchItem from '@enact/sandstone/SwitchItem';
import Slider from '@enact/sandstone/Slider';
import BodyText from '@enact/sandstone/BodyText';
import Button from '@enact/sandstone/Button';
import services from '../services';

const SettingsView = ({nav, params, ...rest}) => {
	const [view, setView] = useState(services.settings.getView());
	const update = (patch) => {
		const next = {...view, ...patch};
		services.settings.saveView(next);
		setView(next);
	};
	return (
		<Panel {...rest}>
			<Header title="Settings" />
			<SwitchItem selected={view.viewMode === 'list'} onToggle={({selected}) => update({viewMode: selected ? 'list' : 'grid'})}>List layout</SwitchItem>
			<BodyText>Columns per row (grid layout): {view.columns}</BodyText>
			<Slider min={3} max={8} step={1} value={view.columns} onChange={({value}) => update({columns: value})} />
			<SwitchItem selected={view.thumbSize === 'preview'} onToggle={({selected}) => update({thumbSize: selected ? 'preview' : 'thumbnail'})}>Large photos (sharper, slower)</SwitchItem>
			<Button onClick={() => { services.auth.signOut(); nav.reset('setup'); }}>Sign out and forget the server</Button>
		</Panel>
	);
};

export default SettingsView;
