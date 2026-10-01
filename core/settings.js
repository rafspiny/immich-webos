(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  var KEYS = {
    serverUrl: 'immich_server_url', apiKey: 'immich_api_key',
    viewMode: 'immich_view_mode', columns: 'immich_columns', thumbSize: 'immich_thumb_size',
    history: 'immich_url_history'
  };
  var MAX_HISTORY = 5;

  function normalizeUrl(raw) {
    var url = String(raw || '').replace(/^\s+|\s+$/g, '');
    if (!url) { return ''; }
    if (!/^https?:\/\//i.test(url)) { url = 'https://' + url; }
    url = url.replace(/\/+$/, '');
    return url.replace(/\/api$/i, '');
  }

  function create(storage) {
    function read(key) { try { return storage.getItem(key); } catch (e) { return null; } }
    function write(key, value) { try { storage.setItem(key, value); } catch (e) { /* ignore */ } }
    function remove(key) { try { storage.removeItem(key); } catch (e) { /* ignore */ } }

    function getUrlHistory() {
      try {
        var list = JSON.parse(read(KEYS.history) || '[]');
        return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
      } catch (e) { return []; }
    }

    return {
      normalizeUrl: normalizeUrl,
      getCredentials: function () {
        return { serverUrl: read(KEYS.serverUrl) || '', apiKey: read(KEYS.apiKey) || '' };
      },
      saveCredentials: function (url, key) {
        write(KEYS.serverUrl, normalizeUrl(url));
        write(KEYS.apiKey, String(key || '').replace(/^\s+|\s+$/g, ''));
      },
      clearCredentials: function () { remove(KEYS.serverUrl); remove(KEYS.apiKey); },
      getView: function () {
        var cols = parseInt(read(KEYS.columns), 10);
        if (isNaN(cols)) { cols = 5; }
        return {
          viewMode: read(KEYS.viewMode) === 'list' ? 'list' : 'grid',
          columns: Math.min(8, Math.max(3, cols)),
          thumbSize: read(KEYS.thumbSize) === 'preview' ? 'preview' : 'thumbnail'
        };
      },
      saveView: function (v) {
        write(KEYS.viewMode, v.viewMode);
        write(KEYS.columns, v.columns);
        write(KEYS.thumbSize, v.thumbSize);
      },
      getUrlHistory: getUrlHistory,
      addUrlHistory: function (url) {
        var list = [url];
        getUrlHistory().forEach(function (u) { if (u !== url) { list.push(u); } });
        write(KEYS.history, JSON.stringify(list.slice(0, MAX_HISTORY)));
      }
    };
  }

  function safeLocalStorage() {
    try { return window.localStorage; } catch (e) { return { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }; }
  }

  var api = { create: create, normalizeUrl: normalizeUrl, defaultStorage: safeLocalStorage };
  core.settings = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
