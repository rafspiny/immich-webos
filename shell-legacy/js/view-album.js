(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  ui.createAlbumView = function (ctx) {
    var el = dom.el('div', 'view');
    document.getElementById('root').appendChild(el);
    var bar = dom.el('div', 'topbar');
    var backBtn = dom.el('div', 'btn focusable', 'Back');
    var titleEl = dom.el('div', 'title');
    bar.appendChild(backBtn);
    bar.appendChild(titleEl);
    var msg = dom.el('div', 'msg hidden');
    var host = dom.el('div', 'grid-host');
    [bar, msg, host].forEach(function (n) { el.appendChild(n); });

    var zone = 'grid', items = [], pager = null, loadedKey = null, view = ctx.settings.getView();

    var grid = ui.createGrid({
      host: host,
      captionH: 0,
      renderTile: function (a) {
        var body = dom.el('div', 'tile-body plain');
        var box = dom.el('div', 'cap-img');
        var img = dom.el('img');
        img.src = ctx.client.thumbnailUrl(a.id, view.thumbSize);
        box.appendChild(img);
        body.appendChild(box);
        return body;
      },
      onSelect: function (a, i) { ctx.app.go('viewer', { assets: items, index: i }); },
      onNeedMore: function () {
        if (!pager || !pager.hasMore()) { return; }
        pager.loadNext().then(function () { items = pager.items(); grid.setItems(items); }, function () {});
      }
    });

    function showMsg(text, isError) { msg.textContent = text; msg.className = 'msg' + (isError ? ' error' : ''); }
    function toBar() { zone = 'bar'; grid.blur(); ui.nav.focusFirst(bar); }
    function showGrid(index) {
      dom.hide(msg);
      grid.setView(view.viewMode, view.columns);
      grid.setItems(items);
      if (!items.length) { showMsg('No photos here.', false); dom.show(msg); toBar(); return; }
      zone = 'grid';
      ui.nav.clearFocus();
      grid.focus(index);
    }
    function load(params) {
      showMsg('Loading...', false);
      var filter = params.all ? null : { albumIds: [params.albumId] };
      pager = w.ImmichCore.paging.createPager(function (n) { return ctx.client.searchPage(n, 60, filter); });
      pager.loadNext().then(function () {
        items = pager.items();
        if (w.ImmichCore && w.ImmichCore.debugLog) {
          w.ImmichCore.debugLog('view-album.load', { albumId: params.albumId, all: !!params.all, itemsLen: items.length });
        }
        showGrid(0);
      }, function (err) { showMsg(err.message, true); toBar(); });
    }

    backBtn.onclick = function () { ctx.app.back(); };

    return {
      el: el,
      enter: function (params, restore) {
        view = ctx.settings.getView();
        if (restore && loadedKey) {                    /* coming back from the viewer: reuse loaded data */
          showGrid(ctx.viewerIndex !== undefined ? ctx.viewerIndex : restore.index);
          return;
        }
        loadedKey = params.all ? 'all' : params.albumId;
        titleEl.textContent = params.title || '';
        zone = 'grid';
        load(params);
      },
      leave: function () { grid.blur(); ui.nav.clearFocus(); },
      snapshot: function () { return { index: grid.focusIndex() }; },
      onKey: function (key) {
        if (zone === 'grid') {
          var r = grid.handleKey(key);
          if (r === 'edge') { toBar(); return true; }
          return !!r;
        }
        if (key === 'down' && items.length) { zone = 'grid'; ui.nav.clearFocus(); grid.focus(); return true; }
        if (key === 'ok') { ctx.app.back(); return true; }
        return key === 'up' || key === 'left' || key === 'right' || key === 'down';
      }
    };
  };
}(window));
