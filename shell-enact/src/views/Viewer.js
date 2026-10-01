import {useEffect} from 'react';
import Popup from '@enact/sandstone/Popup';
import Spottable from '@enact/spotlight/Spottable';
import services from '../services';

const Photo = Spottable('div');

const Viewer = ({open, items, index, onIndex, onClose}) => {
	useEffect(() => {
		if (!open) return undefined;
		const onKey = (e) => {
			if (e.keyCode === 37 && index > 0) onIndex(index - 1);
			if (e.keyCode === 39 && index < items.length - 1) onIndex(index + 1);
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, index, items, onIndex]);

	const asset = open && index !== null ? items[index] : null;
	return (
		<Popup open={open} onClose={onClose} position="fullscreen">
			{asset ? (
				<Photo style={{width: '100%', height: '100%'}}>
					<img alt={asset.name} src={services.client.viewerUrl(asset.id)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
				</Photo>
			) : null}
		</Popup>
	);
};

export default Viewer;
