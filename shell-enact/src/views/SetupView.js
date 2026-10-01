import {useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import Input from '@enact/sandstone/Input';
import Button from '@enact/sandstone/Button';
import BodyText from '@enact/sandstone/BodyText';
import services from '../services';

const SetupView = ({nav, params, ...rest}) => {
	const saved = services.settings.getCredentials();
	const [url, setUrl] = useState(saved.serverUrl || services.settings.getUrlHistory()[0] || '');
	const [key, setKey] = useState('');
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);

	const connect = () => {
		setBusy(true);
		setMessage('Connecting...');
		services.auth.connect(url, key).then(() => {
			setBusy(false);
			nav.reset('albums');
		}, (err) => {
			setBusy(false);
			setMessage(err.message);
		});
	};

	return (
		<Panel {...rest}>
			<Header title="Connect to Immich" subtitle="In Immich: Account Settings > API Keys > New API Key" />
			<Input value={url} placeholder="Server address, e.g. photos.example.com" onComplete={({value}) => setUrl(value)} />
			<Input type="password" value={key} placeholder="API key" onComplete={({value}) => setKey(value)} />
			<Button disabled={busy} onClick={connect}>Connect</Button>
			<BodyText>{message}</BodyText>
		</Panel>
	);
};

export default SetupView;
