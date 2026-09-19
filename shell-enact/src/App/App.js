import {useCallback, useState} from 'react';
import ThemeDecorator from '@enact/sandstone/ThemeDecorator';
import Panels from '@enact/sandstone/Panels';
import services from '../services';
import SetupView from '../views/SetupView';
import AlbumsView from '../views/AlbumsView';
import AlbumView from '../views/AlbumView';
import SettingsView from '../views/SettingsView';

const VIEWS = {setup: SetupView, albums: AlbumsView, album: AlbumView, settings: SettingsView};

const App = (props) => {
	const [stack, setStack] = useState([{name: services.auth.isConfigured() ? 'albums' : 'setup'}]);
	const nav = {
		push: useCallback((name, params) => setStack((s) => s.concat([{name, params}])), []),
		pop: useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []),
		reset: useCallback((name) => setStack([{name}]), [])
	};
	return (
		<Panels {...props} index={stack.length - 1} onBack={nav.pop}>
			{stack.map((s, i) => {
				const View = VIEWS[s.name];
				return <View key={i} nav={nav} params={s.params || {}} />;
			})}
		</Panels>
	);
};

export default ThemeDecorator(App);
