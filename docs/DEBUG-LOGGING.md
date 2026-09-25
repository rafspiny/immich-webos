# Debug logging

The app can keep a short log of what it is doing (requests and their results, plus a few key events) so problems can be diagnosed on the TV itself, without a PC.

## Turn it on and read it

1. Albums > Settings > **Debug logging** > On. It is off by default and the choice is remembered.
2. Use the app as normal (open an album, scroll, ...).
3. Settings > **View logs**. The newest entries are at the top, one per line.
   - Legacy build: Up/Down move between entries; Left/Right slide every line sideways so long lines can be read in full.
   - Enact build: Up (from the buttons) or Down (to the log area) puts a highlight box around the log; then Up/Down scroll it vertically and Left/Right scroll it sideways. Up at the very top of the log returns to the buttons.
   - **Refresh** loads entries recorded since you opened the screen; **Clear** empties the list.

## What is logged

- Every request to Immich: method, URL (with `apiKey=` replaced by `REDACTED`), HTTP status, size and a short preview of the reply, or the error (`network`, `timeout`).
- One-line summaries when albums and photo pages load, and what the album screen decided to show.

## Good to know

- Only the last 200 entries are kept, in memory: closing the app clears them.
- The API key is never logged.
- While logging is off, nothing is recorded.
- For developers: call `ImmichCore.debugLog(tag, data)`; in modules that may load without it, guard with `if (core.debugLog) { ... }`. Data is serialized to JSON and truncated at 2000 characters.
- The earlier `tools/log-server.js` / `tail -f build/webos-debug.log` workflow has been removed; the Logs screen replaces it. For live desktop debugging use the browser DevTools (`npm run serve:legacy`) or `ares-inspect`; the logger does not print to the console, but you can read the buffer there with `ImmichCore.debugLog.entries()`.
