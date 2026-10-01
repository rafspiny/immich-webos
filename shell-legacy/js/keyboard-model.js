(function (root) {
  'use strict';
  var ui = root.ImmichUI = root.ImmichUI || {};
  var CHAR_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl-', 'zxcvbnm._:/'];

  function create(opts) {
    var text = opts.initial || '';
    var upper = false, reveal = false, r = 0, c = 0;

    function rows() {
      var out = CHAR_ROWS.map(function (s) {
        return s.split('').map(function (ch) {
          var v = upper ? ch.toUpperCase() : ch;
          return { label: v, action: 'char', value: v };
        });
      });
      if (opts.shortcuts && opts.shortcuts.length) {
        out.push(opts.shortcuts.map(function (s) { return { label: s, action: 'text', value: s }; }));
      }
      var acts = [{ label: 'Shift', action: 'shift' }, { label: 'Del', action: 'backspace' }, { label: 'Clear', action: 'clear' }];
      if (opts.masked) { acts.push({ label: reveal ? 'Hide' : 'Show', action: 'reveal' }); }
      acts.push({ label: 'TV keyboard', action: 'native' }, { label: 'Done', action: 'done' });
      out.push(acts);
      return out;
    }

    return {
      rows: rows,
      cursor: function () { return { row: r, col: c }; },
      text: function () { return text; },
      setText: function (t) { text = t; },
      display: function () { return (!opts.masked || reveal) ? text : text.replace(/./g, '*'); },
      move: function (dir) {
        var n = rows();
        var nr = r, nc = c;
        if (dir === 'left') { nc = Math.max(0, c - 1); }
        else if (dir === 'right') { nc = Math.min(n[r].length - 1, c + 1); }
        else if (dir === 'up') { nr = Math.max(0, r - 1); }
        else if (dir === 'down') { nr = Math.min(n.length - 1, r + 1); }
        var moved = nr !== r || nc !== c;
        r = nr; c = Math.min(nc, n[nr].length - 1);
        return moved;
      },
      press: function () {
        var k = rows()[r][c];
        if (k.action === 'char' || k.action === 'text') { text += k.value; }
        else if (k.action === 'backspace') { text = text.slice(0, -1); }
        else if (k.action === 'clear') { text = ''; }
        else if (k.action === 'shift') { upper = !upper; }
        else if (k.action === 'reveal') { reveal = !reveal; }
        return k.action;
      }
    };
  }

  var api = { create: create };
  ui.keyboardModel = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
