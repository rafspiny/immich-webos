(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var g = ui.gridmath, dom = ui.dom;
  var OVERSCAN = 2;

  ui.createGrid = function (opts) {
    var host = opts.host;
    var inner = dom.el('div', 'grid-inner');
    host.appendChild(inner);
    var items = [], tiles = {};
    var mode = 'grid', columns = 5, lay = g.layout(mode, columns, host.clientWidth, opts.captionH || 0);
    var focusIndex = 0, hasFocus = false, scrollTop = 0;

    function removeTile(key) {
      var t = tiles[key];
      if (!t) { return; }
      var img = t.getElementsByTagName('img')[0];
      if (img) { img.removeAttribute('src'); }   /* cancel loads for tiles that scrolled away */
      inner.removeChild(t);
      delete tiles[key];
    }
    function addTile(i) {
      var t = dom.el('div', 'tile' + (mode === 'list' ? ' list' : ''));
      t.style.left = ((i % lay.cols) * lay.cellW) + 'px';
      t.style.top = (Math.floor(i / lay.cols) * lay.cellH) + 'px';
      t.style.width = lay.cellW + 'px';
      t.style.height = lay.cellH + 'px';
      t.appendChild(opts.renderTile(items[i], i, mode));
      if (hasFocus && i === focusIndex) { t.classList.add('focused'); }
      inner.appendChild(t);
      tiles[i] = t;
    }
    function render() {
      if (!lay) { return; }
      var rows = g.totalRows(items.length, lay.cols);
      var r = g.visibleRange(scrollTop, host.clientHeight, lay.cellH, rows, OVERSCAN);
      var first = r.first * lay.cols;
      var last = Math.min(items.length - 1, (r.last + 1) * lay.cols - 1);
      Object.keys(tiles).forEach(function (k) {
        var i = parseInt(k, 10);
        if (i < first || i > last) { removeTile(k); }
      });
      var i;
      for (i = first; i <= last; i++) { if (!tiles[i]) { addTile(i); } }
    }
    function relayout() {
      Object.keys(tiles).forEach(removeTile);
      lay = g.layout(mode, columns, host.clientWidth, opts.captionH || 0);
      inner.style.height = (g.totalRows(items.length, lay.cols) * lay.cellH) + 'px';
      var maxScrollTop = Math.max(0, g.totalRows(items.length, lay.cols) * lay.cellH - host.clientHeight);
      scrollTop = Math.min(scrollTop, maxScrollTop);
      if (hasFocus && items.length > 0) {
        scrollTop = g.scrollTopFor(focusIndex, lay.cols, lay.cellH, host.clientHeight, scrollTop);
      }
      host.scrollTop = scrollTop;
      render();
    }
    function setFocusIndex(i) {
      if (tiles[focusIndex]) { tiles[focusIndex].classList.remove('focused'); }
      focusIndex = i;
      var st = g.scrollTopFor(i, lay.cols, lay.cellH, host.clientHeight, scrollTop);
      if (st !== scrollTop) { scrollTop = st; host.scrollTop = st; }
      render();
      if (hasFocus && tiles[i]) { tiles[i].classList.add('focused'); }
      if (opts.onNeedMore && i >= items.length - lay.cols * 3) { opts.onNeedMore(); }
    }

    return {
      setItems: function (list) {
        items = list;
        if (focusIndex > items.length - 1) { focusIndex = Math.max(0, items.length - 1); }
        relayout();
      },
      setView: function (m, c) { mode = m; columns = c; if (lay) { relayout(); } else { lay = g.layout(mode, columns, host.clientWidth, opts.captionH || 0); } },
      focus: function (i) { hasFocus = true; if (items.length > 0) { setFocusIndex(i === undefined ? focusIndex : Math.min(i, Math.max(0, items.length - 1))); } },
      blur: function () { hasFocus = false; if (tiles[focusIndex]) { tiles[focusIndex].classList.remove('focused'); } },
      focusIndex: function () { return focusIndex; },
      handleKey: function (key) {
        if (key === 'ok') { if (items.length) { opts.onSelect(items[focusIndex], focusIndex); } return 'select'; }
        if (key !== 'left' && key !== 'right' && key !== 'up' && key !== 'down') { return false; }
        if (!items.length) { return false; }
        var n = g.moveIndex(focusIndex, key, lay.cols, items.length);
        if (n === focusIndex) { return key === 'up' ? 'edge' : 'blocked'; }
        setFocusIndex(n);
        return 'moved';
      }
    };
  };
}(window));
