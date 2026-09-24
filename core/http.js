(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  var MESSAGES = {
    network: 'Cannot reach the server. Check the address and that the TV is online. For https:// addresses the TV may not trust the certificate, or the server may be blocking this app (CORS).',
    timeout: 'The server did not answer in time.',
    unauthorized: 'The server rejected the API key.',
    http: 'The server returned an error'
  };

  function makeError(code, message, status) {
    var e = new Error(message);
    e.code = code;
    e.status = status || 0;
    return e;
  }

  function create(xhrFactory) {
    function request(opts) {
      return new Promise(function (resolve, reject) {
        var xhr = xhrFactory();
        var headers = opts.headers || {};
        var payload = null;
        var name;
        xhr.open(opts.method || 'GET', opts.url, true);
        xhr.timeout = opts.timeout || 20000;
        for (name in headers) {
          if (Object.prototype.hasOwnProperty.call(headers, name)) { xhr.setRequestHeader(name, headers[name]); }
        }
        if (opts.body !== undefined) {
          payload = JSON.stringify(opts.body);
          xhr.setRequestHeader('Content-Type', 'application/json');
        }
        function logHttp(extra) {
          if (!core.debugLog) { return; }
          var safeUrl = core.debugLogRedactUrl ? core.debugLogRedactUrl(opts.url) : opts.url;
          var info = { method: opts.method || 'GET', url: safeUrl };
          var k;
          for (k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { info[k] = extra[k]; } }
          core.debugLog('http', info);
        }
        xhr.onload = function () {
          var data = null;
          if (xhr.responseText) {
            try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
          }
          logHttp({ status: xhr.status, len: xhr.responseText ? xhr.responseText.length : 0, preview: (xhr.responseText || '').slice(0, 300) });
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ status: xhr.status, data: data });
          } else if (xhr.status === 401 || xhr.status === 403) {
            reject(makeError('unauthorized', MESSAGES.unauthorized, xhr.status));
          } else {
            reject(makeError('http', MESSAGES.http + ' (HTTP ' + xhr.status + ').', xhr.status));
          }
        };
        xhr.onerror = function () { logHttp({ status: 0, error: 'network' }); reject(makeError('network', MESSAGES.network)); };
        xhr.ontimeout = function () { logHttp({ status: 0, error: 'timeout' }); reject(makeError('timeout', MESSAGES.timeout)); };
        xhr.send(payload);
      });
    }
    return { request: request };
  }

  var http = create(function () { return new XMLHttpRequest(); });
  http.create = create;
  core.http = http;
  if (typeof module !== 'undefined' && module.exports) { module.exports = http; }
}(typeof window !== 'undefined' ? window : global));
