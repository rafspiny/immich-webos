(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  ui.dom = {
    el: function (tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) { n.className = cls; }
      if (text !== undefined) { n.textContent = text; }
      return n;
    },
    clear: function (n) { while (n.firstChild) { n.removeChild(n.firstChild); } },
    toArray: function (list) { return Array.prototype.slice.call(list); },
    show: function (n) { n.classList.remove('hidden'); },
    hide: function (n) { n.classList.add('hidden'); }
  };
}(window));
