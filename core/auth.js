(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  function invalid(message) {
    var e = new Error(message);
    e.code = 'invalid_input';
    return e;
  }

  function create(deps) {
    var client = deps.client;
    var settings = deps.settings;
    return {
      connect: function (rawUrl, rawKey) {
        var url = settings.normalizeUrl(rawUrl);
        var key = String(rawKey || '').replace(/^\s+|\s+$/g, '');
        if (!url) { return Promise.reject(invalid('Enter the server address.')); }
        if (!key) { return Promise.reject(invalid('Enter the API key.')); }
        return client.verify(url, key).then(function (user) {
          settings.saveCredentials(url, key);
          settings.addUrlHistory(url);
          return user;
        });
      },
      isConfigured: function () {
        var c = settings.getCredentials();
        return !!(c.serverUrl && c.apiKey);
      },
      signOut: function () { settings.clearCredentials(); },
      userLabel: function (user) { return (user && (user.name || user.email)) || 'user'; }
    };
  }

  var api = { create: create };
  core.auth = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
