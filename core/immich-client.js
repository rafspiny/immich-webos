(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  function notConfigured() {
    var e = new Error('Not signed in.');
    e.code = 'not_configured';
    return e;
  }

  function toAsset(a) { return { id: a.id, name: a.originalFileName || a.id }; }
  function onlyImages(list) {
    return (list || []).filter(function (a) { return a.type === 'IMAGE'; }).map(toAsset);
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

    function media(assetId, size) {
      var cfg = getConfig();
      return cfg.serverUrl + '/api/assets/' + assetId + '/thumbnail?size=' + size + '&apiKey=' + encodeURIComponent(cfg.apiKey);
    }

    return {
      verify: function (serverUrl, apiKey) {
        var cfg = { serverUrl: serverUrl, apiKey: apiKey };
        return call('GET', '/users/me', undefined, cfg).then(null, function (err) {
          if (err.code === 'http' && err.status === 404) { return call('GET', '/user', undefined, cfg); }
          throw err;
        });
      },
      listAlbums: function () {
        return call('GET', '/albums').then(function (list) {
          return list.map(function (a) {
            return { id: a.id, name: a.albumName, count: a.assetCount, coverId: a.albumThumbnailAssetId };
          });
        });
      },
      getAlbum: function (id) {
        return call('GET', '/albums/' + id).then(function (a) {
          return { id: a.id, name: a.albumName, assets: onlyImages(a.assets) };
        });
      },
      searchPage: function (page, size) {
        return call('POST', '/search/metadata', { page: page, size: size, order: 'desc', type: 'IMAGE' }).then(function (d) {
          var next = d.assets.nextPage;
          return { items: onlyImages(d.assets.items), nextPage: next ? parseInt(next, 10) : null };
        });
      },
      thumbnailUrl: function (assetId, size) { return media(assetId, size); },
      viewerUrl: function (assetId) { return media(assetId, 'preview'); }
    };
  }

  var api = { create: create };
  core.immichClient = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
