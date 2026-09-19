/*
 * storage.js — localStorage helpers.
 *
 * Uses window.localStorage explicitly (plain `localStorage` is not
 * declared as a global in some linters used for webOS dev tools).
 * All calls are wrapped in try/catch — webOS localStorage is always
 * available on a real device, but this guards against any edge case.
 */

var Storage = {
  KEYS: {
    SERVER_URL: 'immich_server_url',
    API_KEY:    'immich_api_key'
  },

  getServerUrl: function () {
    try { return window.localStorage.getItem(this.KEYS.SERVER_URL) || ''; }
    catch (e) { return ''; }
  },

  getApiKey: function () {
    try { return window.localStorage.getItem(this.KEYS.API_KEY) || ''; }
    catch (e) { return ''; }
  },

  saveCredentials: function (serverUrl, apiKey) {
    try {
      window.localStorage.setItem(this.KEYS.SERVER_URL, serverUrl.replace(/\/$/, '').trim());
      window.localStorage.setItem(this.KEYS.API_KEY, apiKey.trim());
    } catch (e) { /* ignore — nothing we can do */ }
  },

  clearCredentials: function () {
    try {
      window.localStorage.removeItem(this.KEYS.SERVER_URL);
      window.localStorage.removeItem(this.KEYS.API_KEY);
    } catch (e) { /* ignore */ }
  }
};
