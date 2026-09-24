(function (root) {
  'use strict';
  var ui = root.ImmichUI = root.ImmichUI || {};

  function layout(mode, columns, width, captionH) {
    if (mode === 'list') { return { cols: 1, cellW: width, cellH: 132 }; }
    var cellW = Math.floor(width / columns);
    return { cols: columns, cellW: cellW, cellH: Math.round(cellW * 0.75) + (captionH || 0) };
  }
  function totalRows(count, cols) { return Math.ceil(count / cols); }
  function visibleRange(scrollTop, viewportH, rowH, rows, overscan) {
    if (rows === 0) { return { first: 0, last: -1 }; }
    return {
      first: Math.max(0, Math.floor(scrollTop / rowH) - overscan),
      last: Math.min(rows - 1, Math.ceil((scrollTop + viewportH) / rowH) - 1 + overscan)
    };
  }
  function moveIndex(index, dir, cols, count) {
    if (count === 0) { return index; }
    var row = Math.floor(index / cols);
    var lastRow = Math.floor((count - 1) / cols);
    if (dir === 'left') { return index % cols === 0 ? index : index - 1; }
    if (dir === 'right') { return (index % cols === cols - 1 || index === count - 1) ? index : index + 1; }
    if (dir === 'up') { return row === 0 ? index : index - cols; }
    if (dir === 'down') {
      if (index + cols < count) { return index + cols; }
      return row < lastRow ? count - 1 : index;
    }
    return index;
  }
  function scrollTopFor(index, cols, rowH, viewportH, scrollTop) {
    var top = Math.floor(index / cols) * rowH;
    var bottom = top + rowH;
    if (top < scrollTop) { return top; }
    if (bottom > scrollTop + viewportH) { return bottom - viewportH; }
    return scrollTop;
  }
  function stepValue(list, value, delta) {
    var i = list.indexOf(value);
    if (i < 0) { i = 0; }
    return list[Math.min(list.length - 1, Math.max(0, i + delta))];
  }

  var api = { layout: layout, totalRows: totalRows, visibleRange: visibleRange, moveIndex: moveIndex, scrollTopFor: scrollTopFor, stepValue: stepValue };
  ui.gridmath = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
