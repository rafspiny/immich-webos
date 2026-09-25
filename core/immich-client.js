(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  function notConfigured() {
    var e = new Error('Not signed in.');
    e.code = 'not_configured';
    return e;
  }

  function invalidResponse() {
    var e = new Error('That address answered, but it does not look like an Immich server. Check the address (and any proxy in front of it).');
    e.code = 'invalid_response';
    return e;
  }
  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  var MEDIA_TYPES = { IMAGE: true, VIDEO: true };

  function toAsset(a) { return { id: a.id, name: a.originalFileName || a.id, type: a.type }; }
  function onlyMedia(list) {
    return (list || []).filter(function (a) { return MEDIA_TYPES[a.type] === true; }).map(toAsset);
  }

  function create(deps) {
    var http = deps.http;
    var getConfig = deps.getConfig;

    function call(method, path, body, cfgOverride) {
      var cfg = cfgOverride || getConfig();
      if (!cfg.serverUrl || !cfg.apiKey) { return Promise.reject(notConfigured()); }
      return http.request({
        method: method,
        url: cfg.serverUrl + '/api' + path,
        headers: { 'x-api-key': cfg.apiKey, 'Accept': 'application/json' },
        body: body
      }).then(function (r) { return r.data; });
    }

    function mediaUrl(assetId, path, query) {
      var cfg = getConfig();
      return cfg.serverUrl + '/api/assets/' + assetId + path + '?' + (query ? query + '&' : '') + 'apiKey=' + encodeURIComponent(cfg.apiKey);
    }

    return {
      verify: function (serverUrl, apiKey) {
        var cfg = { serverUrl: serverUrl, apiKey: apiKey };
        return call('GET', '/users/me', undefined, cfg).then(null, function (err) {
          if (err.code === 'http' && err.status === 404) { return call('GET', '/user', undefined, cfg); }
          throw err;
        }).then(function (u) {
          if (!isObject(u)) { throw invalidResponse(); }
          return u;
        });
      },
      listAlbums: function () {
        return call('GET', '/albums').then(function (list) {
          if (!Array.isArray(list)) { throw invalidResponse(); }
          return list.map(function (a) {
            return { id: a.id, name: a.albumName, count: a.assetCount, coverId: a.albumThumbnailAssetId };
          });
        });
      },
      searchPage: function (page, size, filter) {
        var body = { page: page, size: size, order: 'desc' };
        var key;
        if (filter) {
          for (key in filter) {
            if (Object.prototype.hasOwnProperty.call(filter, key)) { body[key] = filter[key]; }
          }
        }
        return call('POST', '/search/metadata', body).then(function (d) {
          if (!isObject(d) || !isObject(d.assets) || !Array.isArray(d.assets.items)) { throw invalidResponse(); }
          var next = d.assets.nextPage;
          return { items: onlyMedia(d.assets.items), nextPage: next ? parseInt(next, 10) : null };
        });
      },
      thumbnailUrl: function (assetId, size) { return mediaUrl(assetId, '/thumbnail', 'size=' + size); },
      viewerUrl: function (assetId) { return mediaUrl(assetId, '/thumbnail', 'size=preview'); },
      videoPlaybackUrl: function (assetId) { return mediaUrl(assetId, '/video/playback'); }
    };
  }

  var api = { create: create };
  core.immichClient = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
