(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var views = {}, stack = [], current = null;

  function activate(name, params, restore) {
    if (current) { current.leave(); ui.dom.hide(current.el); }
    current = views[name];
    ui.dom.show(current.el);
    ui.nav.clearFocus();
    current.enter(params || {}, restore || null);
  }

  ui.app = {
    register: function (name, view) { views[name] = view; view.name = name; ui.dom.hide(view.el); },
    go: function (name, params) {
      if (current) { stack.push({ name: current.name, restore: current.snapshot() }); }
      activate(name, params);
    },
    /* Replace the whole stack (used after sign-in / sign-out). */
    reset: function (name, params) { stack = []; activate(name, params); },
    back: function () {
      if (!stack.length) { return; }
      var prev = stack.pop();
      activate(prev.name, null, prev.restore);
    },
    start: function (firstName) {
      document.addEventListener('keydown', function (e) {
        if (e.target && e.target.tagName === 'INPUT') { return; }
        var key = ui.keys.name(e.keyCode);
        if (!key || !current) { return; }
        e.preventDefault();
        if (current.onKey(key)) { return; }
        if (key === 'back') { ui.app.back(); }
      });
      activate(firstName);
    }
  };
}(window));
