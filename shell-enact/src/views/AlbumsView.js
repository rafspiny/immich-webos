import {useEffect, useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import Button from '@enact/sandstone/Button';
import BodyText from '@enact/sandstone/BodyText';
import services from '../services';
import MediaGrid from './MediaGrid';

const AlbumsView = ({nav, params, ...rest}) => {
	const [albums, setAlbums] = useState([]);
	const [message, setMessage] = useState('Loading albums...');
	const view = services.settings.getView();

	useEffect(() => {
		services.client.listAlbums().then((list) => {
			setAlbums(list);
			setMessage(list.length ? '' : 'No albums yet. Use "All photos".');
		}, (err) => setMessage(err.message));
	}, []);

	return (
		<Panel {...rest}>
			<Header title="Albums">
				<slotAfter>
					<Button onClick={() => nav.push('album', {all: true, title: 'All photos'})}>All photos</Button>
					<Button onClick={() => nav.push('settings')}>Settings</Button>
				</slotAfter>
			</Header>
			{message ? <BodyText>{message}</BodyText> : null}
			<MediaGrid
				items={albums}
				view={view}
				srcOf={(a) => (a.coverId ? services.client.thumbnailUrl(a.coverId, 'thumbnail') : undefined)}
				labelOf={(a) => a.name + ' (' + a.count + ')'}
				onSelect={(i) => nav.push('album', {albumId: albums[i].id, title: albums[i].name})}
			/>
		</Panel>
	);
};

export default AlbumsView;
