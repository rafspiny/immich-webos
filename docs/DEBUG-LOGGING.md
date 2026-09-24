# Debug logging (dev only)

A temporary, file-backed logger for diagnosing app behaviour in the Simulator or on a
device, since the packaged app has no console you can casually watch. It logs every
API call's method, URL (with `apiKey=` redacted), status and a short response preview,
plus a few targeted events around album loading.

## Use it

```bash
node tools/log-server.js          # terminal 1 — or: npm run debug:log-server
tail -f build/webos-debug.log     # terminal 2
npm run build:legacy
ares-launch -s 22 -sp <simulator path> dist/legacy
```

Sign in and use the app; log lines appear as you go.

## What it logs

- Every `core/http.js` request: method, redacted URL, HTTP status, response length, a
  short body preview. Covers `verify`, `listAlbums`, `getAlbum`, `searchPage` — they
  all go through the same `http.request()`.
- `core/immich-client.js`: one-line summaries for `getAlbum`, `listAlbums`, `searchPage`
  (e.g. whether the album response actually contains an `assets` field).
- `shell-legacy/js/view-album.js`: the item count the album view ends up with, right
  before it decides whether to show photos or "No photos here."

## Notes

- Logging is fire-and-forget (`new Image()` beacon) and wrapped in `try/catch`; it can
  never break the app or block the UI, even if the log server isn't running.
- It never logs the API key itself; only URLs with `apiKey=` stripped out.
- **On by default.** Turn it off with `localStorage.setItem('immich_debug', '0')` in
  devtools, or set `DEFAULT_ENABLED = false` in `core/debug-log.js` before any real
  deployment.
- To point it at a log server on another machine (e.g. testing from a real TV on the
  LAN instead of the Simulator on this machine): `localStorage.setItem('immich_debug_url',
  'http://<this-machine-LAN-IP>:8899/log')`, and start `log-server.js` with
  `PORT`/`LOG_FILE` env vars if you need to change those too.
