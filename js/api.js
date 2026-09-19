/*
 * api.js — Immich REST API client.
 *
 * Compatibility notes:
 *   • Uses Promise.then() chains — NO async/await (Chrome 53 doesn't support it).
 *   • fetch() is available since Chrome 42, so it's fine on webOS 3.5.
 *   • API key is sent as the x-api-key header for JSON calls.
 *   • For media URLs (img.src, video.src) the key is appended as ?key=
 *     because browsers cannot set headers on resource loads.
 *
 * Immich endpoint compatibility:
 *   • /api/users/me  — Immich < 1.80
 *   • /api/user      — Immich ≥ 1.80
 *   Both are tried in verifyConnection().
 */

var Api = {

  /* ── internal ──────────────────────────────────────────────── */

  _request: function (path) {
    var serverUrl = Storage.getServerUrl();
    var apiKey    = Storage.getApiKey();
    if (!serverUrl || !apiKey) {
      return Promise.reject(new Error('Not configured'));
    }
    return fetch(serverUrl + '/api' + path, {
      headers: {
        'x-api-key': apiKey,
        'Accept':    'application/json'
      }
    }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    });
  },

  /* ── auth ──────────────────────────────────────────────────── */

  verifyConnection: function (serverUrl, apiKey) {
    var opts = {
      headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
    };
    // Try both endpoint paths for broad version compatibility
    return fetch(serverUrl + '/api/users/me', opts).then(function (res) {
      if (res.ok) { return res.json(); }
      return fetch(serverUrl + '/api/user', opts).then(function (res2) {
        if (!res2.ok) {
          throw new Error('Invalid credentials (HTTP ' + res2.status + ')');
        }
        return res2.json();
      });
    });
  },

  /* ── albums ────────────────────────────────────────────────── */

  getAlbums: function () {
    return this._request('/albums');
  },

  getAlbum: function (id) {
    return this._request('/albums/' + id);
  },

  /* ── assets ────────────────────────────────────────────────── */

  getRecentAssets: function (size) {
    return this._request('/assets?page=1&size=' + (size || 40) + '&order=desc');
  },

  /* ── media URLs (embedded in img.src / video.src) ──────────── */

  thumbnailUrl: function (assetId, size) {
    var key = encodeURIComponent(Storage.getApiKey());
    return Storage.getServerUrl()
      + '/api/assets/' + assetId
      + '/thumbnail?size=' + (size || 'thumbnail')
      + '&key=' + key;
  },

  originalUrl: function (assetId) {
    var key = encodeURIComponent(Storage.getApiKey());
    return Storage.getServerUrl()
      + '/api/assets/' + assetId
      + '/original?key=' + key;
  },

  /*
   * Immich transcodes videos to H.264/AAC on the fly.
   * Prefer this over originalUrl for video — guarantees
   * a format that webOS 3.5's browser can play.
   */
  videoPlaybackUrl: function (assetId) {
    var key = encodeURIComponent(Storage.getApiKey());
    return Storage.getServerUrl()
      + '/api/assets/' + assetId
      + '/video/playback?key=' + key;
  }
};
