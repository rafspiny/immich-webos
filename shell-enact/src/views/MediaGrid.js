import ImageItem from '@enact/sandstone/ImageItem';
import {VirtualGridList, VirtualList} from '@enact/sandstone/VirtualList';
import ri from '@enact/ui/resolution';

const MediaGrid = ({items, view, srcOf, labelOf, onSelect, onNearEnd}) => {
	const list = view.viewMode === 'list';
	const renderItem = ({index, ...rest}) => (
		<ImageItem
			{...rest}
			src={srcOf(items[index])}
			orientation={list ? 'horizontal' : 'vertical'}
			onClick={() => onSelect(index)}
		>
			{labelOf ? labelOf(items[index]) : ''}
		</ImageItem>
	);
	const onScrollStop = (e) => {
		if (onNearEnd && e.moreInfo && e.moreInfo.lastVisibleIndex >= items.length - 20) onNearEnd();
	};
	if (list) {
		return <VirtualList dataSize={items.length} itemRenderer={renderItem} itemSize={ri.scale(150)} spacing={ri.scale(12)} onScrollStop={onScrollStop} />;
	}
	const w = Math.floor(1700 / view.columns);
	return (
		<VirtualGridList
			dataSize={items.length}
			itemRenderer={renderItem}
			itemSize={{minWidth: ri.scale(w), minHeight: ri.scale(Math.round(w * 0.8))}}
			spacing={ri.scale(12)}
			onScrollStop={onScrollStop}
		/>
	);
};

export default MediaGrid;
