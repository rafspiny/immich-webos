(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom, g = ui.gridmath;
  var H_STEP = 240;     /* pixels scrolled sideways per Left/Right press */
  var TEXT_PAD = 44;    /* tile padding + borders + row padding around the text */

  ui.createLogsView = function (ctx) {
    var debugLog = w.ImmichCore.debugLog;
    var el = dom.el('div', 'view');
    document.getElementById('root').appendChild(el);
    var bar = dom.el('div', 'topbar');
    var backBtn = dom.el('div', 'btn focusable', 'Back');
    var refreshBtn = dom.el('div', 'btn focusable', 'Refresh');
    var clearBtn = dom.el('div', 'btn focusable', 'Clear');
    bar.appendChild(backBtn);
    bar.appendChild(dom.el('div', 'title', 'Logs'));
    bar.appendChild(refreshBtn);
    bar.appendChild(clearBtn);
    var msg = dom.el('div', 'msg hidden');
    var host = dom.el('div', 'grid-host');
    var ruler = dom.el('span', 'log-text log-ruler');   /* hidden: measures the longest line */
    [bar, msg, host, ruler].forEach(function (n) { el.appendChild(n); });

    var zone = 'grid', lines = [], hOffset = 0, hMax = 0;

    var grid = ui.createGrid({
      host: host,
      rowH: 40,
      tileClass: 'log-tile',
      renderTile: function (line) {
        var body = dom.el('div', 'tile-body log-row');
        var text = dom.el('span', 'log-text', line);
        text.style.marginLeft = (-hOffset) + 'px';
        body.appendChild(text);
        return body;
      },
      onSelect: function () {}
    });

    function showMsg(text) { msg.textContent = text; msg.className = 'msg'; }
    function toBar() { zone = 'bar'; grid.blur(); ui.nav.focusFirst(bar); }
    function applyOffset() {
      var els = host.getElementsByClassName('log-text');
      var i;
      for (i = 0; i < els.length; i++) { els[i].style.marginLeft = (-hOffset) + 'px'; }
    }
    function measureLongest() {
      var longest = '', i;
      for (i = 0; i < lines.length; i++) { if (lines[i].length > longest.length) { longest = lines[i]; } }
      ruler.textContent = longest;
      hMax = Math.max(0, ruler.offsetWidth - (host.clientWidth - TEXT_PAD));
    }
    function reload(stayOnBar) {
      lines = debugLog.entries().map(debugLog.format);
      hOffset = 0;
      dom.hide(msg);
      grid.setView('list', 1);
      grid.setItems(lines);
      measureLongest();
      if (!lines.length) {
        showMsg(debugLog.isEnabled()
          ? 'No log entries yet. Use the app, then come back.'
          : 'Logging is off. Turn on "Debug logging" in Settings, use the app, then come back.');
        dom.show(msg);
        zone = 'bar';
        grid.blur();
        if (!stayOnBar) { ui.nav.focusFirst(bar); }
        return;
      }
      if (stayOnBar) { return; }
      zone = 'grid';
      ui.nav.clearFocus();
      grid.focus(0);
    }

    backBtn.onclick = function () { ctx.app.back(); };
    refreshBtn.onclick = function () { reload(true); };
    clearBtn.onclick = function () { debugLog.clear(); reload(true); };

    return {
      el: el,
      enter: function () { reload(false); },
      leave: function () { grid.blur(); ui.nav.clearFocus(); },
      snapshot: function () { return null; },
      onKey: function (key) {
        if (zone === 'grid') {
          if (key === 'left' || key === 'right') {
            hOffset = g.clampOffset(hOffset, key === 'left' ? -H_STEP : H_STEP, hMax);
            applyOffset();
            return true;
          }
          var r = grid.handleKey(key);
          if (r === 'edge') { toBar(); return true; }
          return !!r;
        }
        if (key === 'down' && lines.length) { zone = 'grid'; ui.nav.clearFocus(); grid.focus(); return true; }
        if (key === 'ok') { var cur = ui.nav.current(); if (cur) { cur.onclick(); } return true; }
        if (key === 'left' || key === 'right') { ui.nav.move(key, bar); return true; }
        return key === 'up' || key === 'down';
      }
    };
  };
}(window));
