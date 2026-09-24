(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  ui.createViewerView = function (ctx) {
    var el = dom.el('div', 'view viewer');
    document.getElementById('root').appendChild(el);
    var img = dom.el('img', 'viewer-img');
    var counter = dom.el('div', 'viewer-counter');
    var error = dom.el('div', 'viewer-error hidden', 'Could not load this photo.');
    [img, counter, error].forEach(function (n) { el.appendChild(n); });
    var assets = [], index = 0, timer = null;

    function flashCounter() {
      counter.textContent = (index + 1) + ' / ' + assets.length;
      dom.show(counter);
      clearTimeout(timer);
      timer = setTimeout(function () { dom.hide(counter); }, 3000);
    }
    function show() {
      dom.hide(error);
      img.src = ctx.client.viewerUrl(assets[index].id);
      ctx.viewerIndex = index;
      flashCounter();
      if (index + 1 < assets.length) { new Image().src = ctx.client.viewerUrl(assets[index + 1].id); }
    }
    img.onerror = function () { dom.show(error); };

    return {
      el: el,
      enter: function (params) { assets = params.assets; index = params.index; show(); },
      leave: function () { clearTimeout(timer); img.removeAttribute('src'); },
      snapshot: function () { return null; },
      onKey: function (key) {
        if (key === 'left') { if (index > 0) { index--; show(); } return true; }
        if (key === 'right') { if (index < assets.length - 1) { index++; show(); } return true; }
        if (key === 'ok' || key === 'up' || key === 'down') { flashCounter(); return true; }
        return false;
      }
    };
  };
}(window));
