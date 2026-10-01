(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  ui.createSetupView = function (ctx) {
    var el = dom.el('div', 'view setup');
    document.getElementById('root').appendChild(el);
    var values = { url: '', key: '' };
    var kb = null, busy = false;

    var card = dom.el('div', 'setup-card');
    var urlBtn = dom.el('div', 'btn focusable field');
    var keyBtn = dom.el('div', 'btn focusable field');
    var connectBtn = dom.el('div', 'btn focusable primary', 'Connect');
    var history = dom.el('div', 'history');
    var msg = dom.el('div', 'msg');
    card.appendChild(dom.el('div', 'setup-logo', 'Immich'));
    card.appendChild(dom.el('p', 'setup-hint', 'In Immich open Account Settings > API Keys > New API Key, then enter the server address and the key here with the remote.'));
    [urlBtn, keyBtn, history, connectBtn, msg].forEach(function (n) { card.appendChild(n); });
    el.appendChild(card);

    function setMsg(text, isError) { msg.textContent = text; msg.className = 'msg' + (isError ? ' error' : ''); }
    function label() {
      urlBtn.textContent = 'Server address:  ' + (values.url || '(not set)');
      keyBtn.textContent = 'API key:  ' + (values.key ? '******** (' + values.key.length + ' characters)' : '(not set)');
    }
    function edit(which) {
      kb = ui.openKeyboard({
        title: which === 'url' ? 'Server address' : 'API key',
        initial: values[which],
        masked: which === 'key',
        shortcuts: which === 'url' ? ['https://', 'http://', '.com', ':2283'] : [],
        onDone: function (t) { values[which] = t; kb = null; label(); },
        onCancel: function () { kb = null; }
      });
    }
    function renderHistory() {
      dom.clear(history);
      ctx.settings.getUrlHistory().forEach(function (u) {
        var b = dom.el('div', 'btn focusable small', u);
        b.onclick = function () { values.url = u; label(); };
        history.appendChild(b);
      });
    }

    urlBtn.onclick = function () { edit('url'); };
    keyBtn.onclick = function () { edit('key'); };
    connectBtn.onclick = function () {
      if (busy) { return; }
      busy = true;
      setMsg('Connecting...', false);
      ctx.auth.connect(values.url, values.key).then(function () {
        busy = false;
        ctx.app.reset('albums');
      }, function (err) {
        busy = false;
        setMsg(err.message, true);
      });
    };

    return {
      el: el,
      enter: function () {
        var saved = ctx.settings.getCredentials();
        values.url = saved.serverUrl || ctx.settings.getUrlHistory()[0] || '';
        values.key = '';
        kb = null;
        setMsg('', false);
        label();
        renderHistory();
        ui.nav.focusFirst(el);
      },
      leave: function () { kb = null; },
      snapshot: function () { return null; },
      onKey: function (key) {
        if (kb) { return kb.onKey(key); }
        if (key === 'ok') { var cur = ui.nav.current(); if (cur) { cur.onclick(); } return true; }
        if (key === 'back') { return false; }
        ui.nav.move(key, el);
        return true;
      }
    };
  };
}(window));
