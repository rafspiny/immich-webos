import {useEffect, useState} from 'react';
import Popup from '@enact/sandstone/Popup';
import Spottable from '@enact/spotlight/Spottable';
import VideoPlayer from '@enact/sandstone/VideoPlayer';
import {MediaControls} from '@enact/sandstone/MediaPlayer';
import BodyText from '@enact/sandstone/BodyText';
import Button from '@enact/sandstone/Button';
import services from '../services';

const Photo = Spottable('div');

const Viewer = ({open, items, index, onIndex, onClose}) => {
	const [failedId, setFailedId] = useState(null);
	const asset = open && index !== null ? items[index] : null;
	const isVideo = !!asset && asset.type === 'VIDEO';
	const videoFailed = !!asset && failedId === asset.id;   // per asset id, so moving to another item clears it
	const hasPrev = index !== null && index > 0;
	const hasNext = index !== null && index < items.length - 1;

	const close = () => { setFailedId(null); onClose(); };

	useEffect(() => {
		if (!open || isVideo) return undefined;   // for videos Left/Right belong to the player (seeking)
		const onKey = (e) => {
			if (e.keyCode === 37 && index > 0) onIndex(index - 1);
			if (e.keyCode === 39 && index < items.length - 1) onIndex(index + 1);
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, isVideo, index, items, onIndex]);

	return (
		<Popup open={open} onClose={close} position="fullscreen">
			{asset && !isVideo ? (
				<Photo style={{width: '100%', height: '100%'}}>
					<img alt={asset.name} src={services.client.viewerUrl(asset.id)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
				</Photo>
			) : null}
			{asset && isVideo ? (
				<VideoPlayer key={asset.id} title={asset.name} onError={() => setFailedId(asset.id)}>
					<source src={services.client.videoPlaybackUrl(asset.id)} />
					<MediaControls>
						<leftComponents>
							<Button size="small" backgroundOpacity="translucent" disabled={!hasPrev} onClick={() => onIndex(index - 1)}>Previous</Button>
						</leftComponents>
						<rightComponents>
							<Button size="small" backgroundOpacity="translucent" disabled={!hasNext} onClick={() => onIndex(index + 1)}>Next</Button>
						</rightComponents>
					</MediaControls>
				</VideoPlayer>
			) : null}
			{videoFailed ? <BodyText>Could not play this video. The server may not have a version this TV can decode.</BodyText> : null}
		</Popup>
	);
};

export default Viewer;
