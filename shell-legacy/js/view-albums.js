(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  ui.createAlbumsView = function (ctx) {
    var el = dom.el('div', 'view');
    document.getElementById('root').appendChild(el);
    var bar = dom.el('div', 'topbar');
    var allBtn = dom.el('div', 'btn focusable', 'All photos');
    var setBtn = dom.el('div', 'btn focusable', 'Settings');
    bar.appendChild(dom.el('div', 'title', 'Albums'));
    bar.appendChild(allBtn);
    bar.appendChild(setBtn);
    var msg = dom.el('div', 'msg hidden');
    var host = dom.el('div', 'grid-host');
    [bar, msg, host].forEach(function (n) { el.appendChild(n); });

    var zone = 'grid', albums = [];

    var grid = ui.createGrid({
      host: host,
      captionH: 56,
      renderTile: function (a) {
        var body = dom.el('div', 'tile-body');
        var box = dom.el('div', 'cap-img');
        if (a.coverId) { var img = dom.el('img'); img.src = ctx.client.thumbnailUrl(a.coverId, 'thumbnail'); box.appendChild(img); }
        body.appendChild(box);
        body.appendChild(dom.el('div', 'tile-caption', a.name + ' (' + a.count + ')'));
        return body;
      },
      onSelect: function (a) { ctx.app.go('album', { albumId: a.id, title: a.name }); }
    });

    function showMsg(text, isError) { msg.textContent = text; msg.className = 'msg' + (isError ? ' error' : ''); }
    function toBar() { zone = 'bar'; grid.blur(); ui.nav.focusFirst(bar); }
    function load(restore) {
      showMsg('Loading albums...', false);
      var v = ctx.settings.getView();
      ctx.client.listAlbums().then(function (list) {
        albums = list;
        dom.hide(msg);
        grid.setView(v.viewMode, v.columns);
        grid.setItems(albums);
        if (!albums.length) { showMsg('No albums yet. Use "All photos".', false); dom.show(msg); toBar(); return; }
        zone = 'grid';
        ui.nav.clearFocus();
        grid.focus(restore ? restore.index : 0);
      }, function (err) { showMsg(err.message, true); toBar(); });
    }

    allBtn.onclick = function () { ctx.app.go('album', { all: true, title: 'All photos' }); };
    setBtn.onclick = function () { ctx.app.go('settings'); };

    return {
      el: el,
      enter: function (params, restore) { zone = 'grid'; load(restore); },
      leave: function () { grid.blur(); ui.nav.clearFocus(); },
      snapshot: function () { return { index: grid.focusIndex() }; },
      onKey: function (key) {
        if (zone === 'grid') {
          var r = grid.handleKey(key);
          if (r === 'edge') { toBar(); return true; }
          return !!r;
        }
        if (key === 'down' && albums.length) { zone = 'grid'; ui.nav.clearFocus(); grid.focus(); return true; }
        if (key === 'ok') { var cur = ui.nav.current(); if (cur) { cur.onclick(); } return true; }
        if (key === 'left' || key === 'right') { ui.nav.move(key, bar); return true; }
        return key === 'up' || key === 'down';
      }
    };
  };
}(window));
