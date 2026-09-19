(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  var ROWS = [
    { label: 'Layout', key: 'viewMode', values: ['grid', 'list'], names: { grid: 'Grid', list: 'List' } },
    { label: 'Columns per row (grid layout)', key: 'columns', values: [3, 4, 5, 6, 7, 8], names: null },
    { label: 'Photo size', key: 'thumbSize', values: ['thumbnail', 'preview'], names: { thumbnail: 'Small (faster)', preview: 'Large (sharper)' } }
  ];

  ui.createSettingsView = function (ctx) {
    var el = dom.el('div', 'view');
    document.getElementById('root').appendChild(el);
    var bar = dom.el('div', 'topbar');
    var backBtn = dom.el('div', 'btn focusable', 'Back');
    bar.appendChild(backBtn);
    bar.appendChild(dom.el('div', 'title', 'Settings'));
    el.appendChild(bar);
    var current = ctx.settings.getView();

    var rowEls = ROWS.map(function (row) {
      var r = dom.el('div', 'btn focusable option');
      var value = dom.el('span');
      r.appendChild(dom.el('span', '', row.label));
      r.appendChild(value);
      r.render = function () {
        var v = current[row.key];
        value.textContent = '<  ' + (row.names ? row.names[v] : v) + '  >';
      };
      r.step = function (delta) {
        current[row.key] = ui.gridmath.stepValue(row.values, current[row.key], delta);
        ctx.settings.saveView(current);
        r.render();
      };
      el.appendChild(r);
      return r;
    });
    var signOut = dom.el('div', 'btn focusable option', 'Sign out and forget the server');
    el.appendChild(signOut);

    backBtn.onclick = function () { ctx.app.back(); };
    signOut.onclick = function () { ctx.auth.signOut(); ctx.app.reset('setup'); };

    return {
      el: el,
      enter: function () {
        current = ctx.settings.getView();
        rowEls.forEach(function (r) { r.render(); });
        ui.nav.focusFirst(bar);
      },
      leave: function () {},
      snapshot: function () { return null; },
      onKey: function (key) {
        var cur = ui.nav.current();
        if ((key === 'left' || key === 'right') && cur && cur.step) { cur.step(key === 'left' ? -1 : 1); return true; }
        if (key === 'ok' && cur) { if (cur.step) { cur.step(1); } else { cur.onclick(); } return true; }
        if (key === 'back') { return false; }
        ui.nav.move(key, el);
        return true;
      }
    };
  };
}(window));
