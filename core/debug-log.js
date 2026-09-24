/*
 * debug-log.js — optional file-backed debug logging.
 *
 * Fires a GET "beacon" (new Image().src = ...) at a local log server
 * (see tools/log-server.js) so a developer can `tail -f` a file while
 * the app runs in the Simulator or on a device. Never throws, never
 * blocks, and does nothing if disabled.
 *
 * Toggle: localStorage.setItem('immich_debug', '0') turns it off.
 * Redirect: localStorage.setItem('immich_debug_url', 'http://<ip>:8899/log')
 * points it at a log server reachable from a real TV instead of the
 * Simulator's own machine (127.0.0.1 only reaches the Simulator itself).
 */
(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  var DEFAULT_ENABLED = true;         /* flip to false before any real deployment */
  var DEFAULT_URL = 'http://127.0.0.1:8899/log';
  var MAX_LEN = 1500;

  function readFlag() {
    try {
      var v = root.localStorage && root.localStorage.getItem('immich_debug');
      if (v === '0') { return false; }
      if (v === '1') { return true; }
      return DEFAULT_ENABLED;
    } catch (e) { return DEFAULT_ENABLED; }
  }

  function readUrl() {
    try {
      var v = root.localStorage && root.localStorage.getItem('immich_debug_url');
      return v || DEFAULT_URL;
    } catch (e) { return DEFAULT_URL; }
  }

  /* Strip any apiKey=... query value before it is ever logged. */
  function redactUrl(str) {
    return String(str || '').replace(/([?&]apiKey=)[^&]*/i, '$1REDACTED');
  }

  function debugLog(tag, data) {
    try { root.console && root.console.log && root.console.log('[debug]', tag, data); } catch (e0) { /* ignore */ }
    if (!readFlag()) { return; }
    try {
      var json = JSON.stringify(data);
      if (json && json.length > MAX_LEN) { json = json.slice(0, MAX_LEN) + '...(truncated)'; }
      var qs = 'tag=' + encodeURIComponent(tag) + '&d=' + encodeURIComponent(json || '') + '&_=' + Date.now();
      var img = new Image();
      img.src = readUrl() + '?' + qs;
    } catch (e1) { /* logging must never break the app */ }
  }

  var api = { log: debugLog, redactUrl: redactUrl };
  core.debugLog = debugLog;
  core.debugLogRedactUrl = redactUrl;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
