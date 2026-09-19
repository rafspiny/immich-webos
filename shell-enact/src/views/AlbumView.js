import {useEffect, useRef, useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import BodyText from '@enact/sandstone/BodyText';
import services from '../services';
import MediaGrid from './MediaGrid';
import Viewer from './Viewer';

const AlbumView = ({nav, params, ...rest}) => {
	const [items, setItems] = useState([]);
	const [message, setMessage] = useState('Loading...');
	const [viewerIndex, setViewerIndex] = useState(null);
	const pagerRef = useRef(null);
	const view = services.settings.getView();

	useEffect(() => {
		const done = (list) => { setItems(list); setMessage(list.length ? '' : 'No photos here.'); };
		if (params.all) {
			const pager = services.paging.createPager((n) => services.client.searchPage(n, 60));
			pagerRef.current = pager;
			pager.loadNext().then(() => done(pager.items().slice()), (err) => setMessage(err.message));
		} else {
			services.client.getAlbum(params.albumId).then((a) => done(a.assets), (err) => setMessage(err.message));
		}
	}, [params]);

	const loadMore = () => {
		const p = pagerRef.current;
		if (p && p.hasMore()) p.loadNext().then(() => setItems(p.items().slice()), () => {});
	};

	return (
		<Panel {...rest}>
			<Header title={params.title || ''} />
			{message ? <BodyText>{message}</BodyText> : null}
			<MediaGrid
				items={items}
				view={view}
				srcOf={(a) => services.client.thumbnailUrl(a.id, view.thumbSize)}
				onSelect={setViewerIndex}
				onNearEnd={loadMore}
			/>
			<Viewer open={viewerIndex !== null} items={items} index={viewerIndex} onIndex={setViewerIndex} onClose={() => setViewerIndex(null)} />
		</Panel>
	);
};

export default AlbumView;
