(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  ui.openKeyboard = function (opts) {
    var model = ui.keyboardModel.create(opts);
    var overlay = dom.el('div', 'kb-overlay');
    var display = dom.el('div', 'kb-display');
    var grid = dom.el('div', 'kb-grid');
    var input = dom.el('input', 'kb-native hidden');
    var nativeOpen = false;
    overlay.appendChild(dom.el('div', 'kb-title', opts.title));
    overlay.appendChild(display);
    overlay.appendChild(grid);
    overlay.appendChild(input);
    document.getElementById('root').appendChild(overlay);

    function draw() {
      var cur = model.cursor();
      display.textContent = model.display() + '_';
      dom.clear(grid);
      model.rows().forEach(function (row, ri) {
        var line = dom.el('div', 'kb-row');
        row.forEach(function (k, ci) {
          var cls = 'kb-key' + (k.action === 'char' ? '' : ' wide') + (ri === cur.row && ci === cur.col ? ' focused' : '');
          line.appendChild(dom.el('div', cls, k.label));
        });
        grid.appendChild(line);
      });
    }
    function close() { if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); } }
    /* The TV's own keyboard edits a real <input>; copy its value back when it closes. */
    function endNative() {
      if (!nativeOpen) { return; }
      nativeOpen = false;
      model.setText(input.value);
      dom.hide(input);
      draw();
    }
    input.onkeydown = function (e) { if (e.keyCode === 13) { input.blur(); } };
    input.onblur = endNative;
    draw();

    return {
      onKey: function (key) {
        if (nativeOpen) { return true; }
        if (key === 'back') { close(); opts.onCancel(); return true; }
        if (key !== 'ok') { model.move(key); draw(); return true; }
        var action = model.press();
        if (action === 'done') { close(); opts.onDone(model.text()); return true; }
        if (action === 'native') {
          nativeOpen = true;
          input.type = opts.masked ? 'password' : 'text';
          input.value = model.text();
          dom.show(input);
          input.focus();
          return true;
        }
        draw();
        return true;
      }
    };
  };
}(window));
