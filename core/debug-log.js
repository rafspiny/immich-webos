/*
 * debug-log.js — in-app debug log.
 *
 * Keeps the last MAX_ENTRIES log lines in memory so a Logs screen can show
 * them on the TV. It is silent until something calls setEnabled(true); the
 * Settings toggle owns that switch (see core/settings.js). Logging can never
 * throw, and callers must never pass secrets (URLs go through redactUrl).
 */
(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  var MAX_ENTRIES = 200;
  var MAX_TEXT = 2000;
  var enabled = false;
  var buffer = [];                    /* oldest first */

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) { s = '0' + s; }
    return s;
  }

  function stringify(data) {
    try {
      var json = JSON.stringify(data);
      return json === undefined ? '' : json;
    } catch (e) { return '[unserializable]'; }
  }

  /* Strip any apiKey=... query value before it is ever logged. */
  function redactUrl(str) {
    return String(str || '').replace(/([?&]apiKey=)[^&]*/gi, '$1REDACTED');
  }

  function debugLog(tag, data) {
    if (!enabled) { return; }
    var text = stringify(data);
    if (text.length > MAX_TEXT) { text = text.slice(0, MAX_TEXT) + '...(truncated)'; }
    buffer.push({ ts: Date.now(), tag: String(tag), text: text });
    if (buffer.length > MAX_ENTRIES) { buffer.shift(); }
  }

  debugLog.setEnabled = function (on) { enabled = !!on; };
  debugLog.isEnabled = function () { return enabled; };
  debugLog.entries = function () { return buffer.slice().reverse(); };
  debugLog.clear = function () { buffer = []; };
  debugLog.format = function (entry) {
    var d = new Date(entry.ts);
    var time = pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2) + '.' + pad(d.getMilliseconds(), 3);
    return time + '  ' + entry.tag + '  ' + entry.text;
  };
  debugLog.redactUrl = redactUrl;

  core.debugLog = debugLog;
  core.debugLogRedactUrl = redactUrl;
  if (typeof module !== 'undefined' && module.exports) { module.exports = debugLog; }
}(typeof window !== 'undefined' ? window : global));
