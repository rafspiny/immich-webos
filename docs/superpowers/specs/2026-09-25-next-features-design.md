# Five feature plans: settings-controlled logging, video, zoom, wallpapers, sharing info

## Context
The album-loading bug is fixed and confirmed live. This is the next round: six requested changes, of which one (point 4, UI redesign) is explicitly deferred to a separate brainstorming session with the visual companion, per your answer — a visual redesign is a design decision, not something to spec blind in a text plan, and building the other five on today's visual style first isn't wasted work: the redesign will restyle a working app, not rewrite its logic.

The remaining five are independent subsystems (per the writing-plans skill's own scope-check rule: independent subsystems get their own plan, not one giant document). This document scopes and designs all five now, with confirmed facts from two research passes (Immich's real API via source + live capture from your server; Wallhaven/Pexels/Unsplash's actual CORS behavior, checked with real HTTP requests, not assumed). **Once you approve this document, I will expand each unit below into its own full `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` file** in the writing-plans skill's bite-sized TDD format (the format this document intentionally does not use yet, to keep this review scannable), then offer the Subagent-Driven vs. Inline execution choice.

Confirmed answers to the four questions I asked:
- **Zoom:** remote-key stepping shared by both builds; Enact additionally gets Magic Remote pointer/wheel support.
- **Logging:** in-app viewer only — the external `tools/log-server.js`/tail-f workflow from the debugging session is removed.
- **Wallpapers:** pluggable, provider-configurable in Settings — Immich's own library plus external services found via real APIs (not scraping); Wallhaven is one candidate.
- **UI redesign:** deferred to a separate brainstorming session with mockups.

## Research findings that shape the design (sourced; not assumed)
- **`GET /albums` (the list, not just detail) already returns `shared`, `hasSharedLink`, and `albumUsers` per album** — confirmed against Immich's source (`album.service.ts`'s `getAll()` uses the same `mapAlbum()` as `get()`). Point 6 needs **zero extra per-album fetches** for the badge; only the on-demand "who/URL" detail needs one more call.
- `albumUsers[].user` includes `name` and `email` directly — no separate user lookup needed.
- The actual share URL isn't returned inline; it comes from `GET /shared-links?albumId={id}` → response has a `key`; the URL is built client-side as `{serverUrl}/share/{key}`.
- `AssetType` enum is exactly `IMAGE | VIDEO | AUDIO | OTHER`.
- `GET /api/assets/{id}/video/playback` exists, and accepts `?apiKey=` the same way `/thumbnail` does (same auth code path in Immich's server) — no new auth mechanism needed.
- Video codec compatibility is **not guaranteed**: Immich's default Transcode Policy re-encodes to H.264 only when the source codec isn't in the server's "Accepted Video Codecs" list; an admin can change that. The app must treat playback as best-effort and show a clear error on failure, exactly as the project's own original spec already anticipated for HEVC on webOS 3.x.
- **Wallhaven has no CORS support** — confirmed by directly inspecting its live response headers (no `Access-Control-Allow-Origin` at all). A `file://`-origin TV app cannot call it directly, the same failure class as Immich's own CORS problem earlier this project. **Pexels and Unsplash both confirmed permissive CORS** (`Access-Control-Allow-Origin: *`) live, and are free with an easy/keyless tier — these are usable today; Wallhaven is not, until something relays it.

---

## Unit 1 — Settings-controlled, in-app debug logging
Replaces the temporary external log-server workflow with a proper Settings toggle and an in-app "View logs" screen, so debugging works without a PC nearby (e.g. on the real TV).

**Design:** `core/debug-log.js` changes from an `Image()`-beacon-to-a-Node-server into an in-memory ring buffer (capped ~200 entries, newest first) with `setEnabled(bool)`, `entries()` (returns a snapshot copy), and `clear()`. Every existing call site (`core/http.js`, `core/immich-client.js`, `shell-legacy/js/view-album.js`) is **unchanged** — they already just call `core.debugLog(tag, data)` unconditionally; the gate now lives inside `debugLog` itself. `core/settings.js` gets its own `getDebugEnabled()`/`setDebugEnabled()` pair (own storage key, independent of the view-prefs object — same separation-of-concerns the file already uses for credentials vs. view prefs). The composition root (`main.js` / Enact `services.js`) calls `core.debugLog.setEnabled(...)` once at startup from the persisted setting, and again whenever the Settings toggle changes.

A new "View logs" screen reuses the **existing virtualized list** (`ui.createGrid` in list mode) on the legacy side — the same component the album grid already uses, in `list` mode, rendering text rows — rather than a new one. On Enact, a plain Sandstone `Scroller` of `Item`s is enough (YAGNI: log rows are short text, not images; virtualization's real value there is avoiding per-row network fetches, which doesn't apply here, and 200 rows is trivially cheap to render un-virtualized).

**Files:** Modify `core/debug-log.js`, `core/settings.js`; delete `tools/log-server.js`; modify `package.json` (drop `debug:log-server`), `docs/DEBUG-LOGGING.md` (rewritten for the in-app flow). Legacy: create `shell-legacy/js/view-logs.js`; modify `view-settings.js` (toggle + "View logs" row), `main.js`, `index.html`, `css/app.css`. Enact: create `shell-enact/src/views/LogsView.js`; modify `SettingsView.js`, `App/App.js`.

**Tests:** new `tests/core/debug-log.test.js` (ring buffer push/cap/clear/enabled-gating); extend `tests/core/settings.test.js` for the new getter/setter pair.

## Unit 2 — Video support in albums, "All photos", and the viewer
Videos are currently excluded entirely (`onlyImages()` filters to `type === 'IMAGE'` only).

**Design:** `core/immich-client.js`'s asset filter becomes `type === 'IMAGE' || type === 'VIDEO'` (audio/other stay excluded — out of this app's stated scope), and the returned asset shape gains a `type` field so shells can tell photos from videos. Add `videoPlaybackUrl(assetId)`, mirroring the existing `thumbnailUrl`/`viewerUrl` builders exactly (same `?apiKey=` pattern, path `/assets/{id}/video/playback`). Grid tiles need no change to thumbnail loading (Immich serves a poster frame from the same `/thumbnail` endpoint for videos) — just a small "▶" badge overlay on video tiles so they're distinguishable before opening.

The viewer becomes a media viewer: on a `VIDEO` asset it shows a `<video controls>` (legacy) / Sandstone-styled `<video>` (Enact) using `videoPlaybackUrl`, instead of `<img>`; both share a new `.viewer-media` CSS class replacing today's `.viewer-img` sizing rules so image and video share identical framing. Preloading the *next* asset (currently `new Image().src=...`) only makes sense when the next item is an image — skip it for video. Error handling extends the existing `onerror` pattern with a distinct message for an unplayable codec, matching the confirmed reality that Immich doesn't guarantee transcoding.

**Files:** Modify `core/immich-client.js`, `tests/core/immich-client.test.js`. Legacy: `view-viewer.js`, `view-albums.js`/`view-album.js` (badge), `css/app.css`. Enact: `Viewer.js`, `MediaGrid.js`. The Enact task must verify the exact overlay technique against the **installed** `@enact/sandstone` (same "verify against the installed library" step that worked for the original build) rather than assuming an API.

## Unit 3 — Zoom in the photo viewer
Shell-only; no `core/` changes (this is interaction state, not Immich data). Zoom applies to **photos only** (videos have their own play/scrub controls; zooming into a playing video is out of scope — matches your own phrasing, "visualizing a picture").

**Design (legacy):** repurpose the currently-idle Up/Down keys — while not zoomed, Up/Down step zoom in/out through discrete levels (reusing the existing `ui.gridmath.stepValue` helper already used by Settings, applied to e.g. `[1, 1.5, 2, 3, 4]`); once zoomed, Left/Right/Up/Down pan instead of navigating photos, and OK resets to 1x (Left/Right's prev/next role returns once zoom is back at 1x). Rendered via `transform: translate(...) scale(...)` on `.viewer-media` with a short CSS transition, pan clamped so the image can't be dragged fully off-screen. Zoom/pan resets whenever `index` changes, so a new photo never opens pre-zoomed.

**Design (Enact):** the same step-based key handling as a baseline, plus Magic Remote pointer/wheel support layered on top (`@enact/spotlight`'s pointer-mode detection plus a wheel handler translating scroll delta into zoom steps) — the exact Sandstone/Spotlight API surface needs the same "verify against the installed library" step as Unit 2's badge, not an assumed API.

**Files:** `shell-legacy/js/view-viewer.js`, `css/app.css`; `shell-enact/src/views/Viewer.js`. Sequenced **after** Unit 2, since both touch the same viewer files and Unit 3 builds on Unit 2's shared `.viewer-media` class.

## Unit 4 — UI redesign (deferred)
Not part of this planning round. Follow-up: a separate brainstorming session using the visual companion, producing mockups/direction options for each shell before any implementation plan is written — and, per your instruction, likely **two** separate plans given the shells' fundamentally different implementation techniques (hand-rolled CSS vs. Sandstone theming).

## Unit 5 — Pluggable wallpaper backgrounds
**Design:** new `core/wallpaper.js`, a small provider registry: `{immich, pexels, unsplash}` (Wallhaven excluded for now — no CORS, would need a relay the project doesn't have; documented as a known future-work gap, the same way the README already documents the QR-pairing gap). Each provider exposes `fetchRandom(apiKey, http) -> Promise<{url}>`. The `immich` provider needs no external dependency or key — it picks a random asset from the user's own library via the existing `searchPage`, matching the project's "no third-party dependency" default and making it the sensible default provider. `pexels`/`unsplash` call their (confirmed-CORS) REST APIs directly through the existing `core/http.js` (no changes needed there — it's already generic enough) using a key the user pastes via the **same on-screen keyboard already built for the API key field** in Setup (`ui.openKeyboard`), not a new input mechanism.

`core/settings.js` gains `wallpaperEnabled`, `wallpaperProvider`, and a small per-provider key map (so switching providers doesn't lose a previously-entered key). V1 scope is deliberately minimal — enable/provider/key only, no category/purity filtering yet (each provider's fetch function picks sensible defaults server-side; filtering is an easy, non-breaking follow-up).

Where it shows: behind the Albums and Settings screens (the screens with visible chrome/empty space), fetched once per Albums-view visit and refreshed on a timer (e.g. every 10 minutes) while the app stays open — **not** a full idle/ambient screensaver mode, which is a materially larger feature the original spec already flagged as a separate future phase. Flagging this scope choice explicitly for your review at approval, since it's a judgement call I made rather than something you specified.

**Files:** create `core/wallpaper.js`, `tests/core/wallpaper.test.js`; modify `core/settings.js` (+ tests). Legacy: `view-albums.js` (apply background), `view-settings.js` (provider picker + key entry), `css/app.css`. Enact: `AlbumsView.js`, `SettingsView.js` (Sandstone `Picker`/`RadioItem` + `Input`, mirroring `SetupView.js`'s existing pattern).

## Unit 6 — Shared-album badges and sharing info
**Design:** `core/immich-client.js`'s `listAlbums()` normalizer is extended to surface `shared`, `hasSharedLink`, and a mapped `users: [{name, email}, ...]` from `albumUsers` — all already present in the response Immich sends today, so this is a pure normalization change, no new network call. Add `getShareLink(albumId)` (`GET /shared-links?albumId=...`, builds `{serverUrl}/share/{key}` from the result) — called **on demand only**, when the user actually opens the sharing-info panel for one album, not for every tile in the grid.

Grid tiles get a small badge (a plain glyph, no icon-font dependency, consistent with the project's zero-dependency approach — a proper icon set is natural follow-up work once Unit 4's redesign happens) when `shared === true`. The "who/URL" detail is reached via a new **Info button in the album view's topbar** (next to Back) rather than a new global remote-key mapping — nav.js has no Info key mapped today and I'd rather not add cross-cutting key-table changes for one feature; this reuses the topbar pattern already established for Back/title. It opens an overlay reusing the same "full-panel overlay" CSS pattern the on-screen keyboard already uses (legacy) / the same `Popup` component the photo viewer already uses (Enact) — both existing patterns, not new ones.

**Files:** Modify `core/immich-client.js`, `tests/core/immich-client.test.js`. Legacy: `view-albums.js` (badge), `view-album.js` (Info button + overlay), `css/app.css`. Enact: `AlbumsView.js` (badge), `AlbumView.js` (Info button + `Popup`).

---

## Sequencing
1. Unit 1 (logging) — independent, smallest, cleans up this session's temporary tool.
2. Unit 6 (sharing) — independent, low risk, mostly a normalization + one new small view.
3. Unit 2 (video) — independent, touches the viewer.
4. Unit 3 (zoom) — depends on Unit 2 for the shared `.viewer-media` class; touches the same files.
5. Unit 5 (wallpapers) — independent, most new infrastructure, benefits from Unit 1's settings-toggle pattern being fresh.
6. Unit 4 (UI redesign) — separate brainstorming session, not part of this execution sequence.

## Verification (applies per unit; each expanded plan will have specifics)
`npm test` (lint, ES5 gate, unit tests) after every unit; rebuild (`npm run build:legacy`, `npm --prefix shell-enact run pack`) and check in the Simulator against the live server; for Unit 1 specifically, confirm the in-app log viewer shows entries after toggling logging on and reproducing an action; for Unit 2, confirm a known video album plays and a known-incompatible one shows the new error message; for Unit 6, confirm the badge appears only on albums actually shared and the Info panel's URL matches what Immich's web UI shows for the same album's share link.

---

## Refinements made while writing the detailed plans (these supersede the text above where they differ)

**GitHub issues.** Unit 1 is issue #3 "Access logs from settings", Unit 2 is issue #2 "Enable listing of videos and their playback", Unit 3 is issue #4 "Enable zoom while viewing pictures in full screen" (both builds). Units 5 and 6 have no issue yet.

**Unit 1 additions.**
- Issue #3 asks that the on-screen log can be scrolled **vertically and horizontally**. The legacy Logs screen shows one log entry per line (no wrapping): Up/Down move between entries, Left/Right scroll every line sideways. Enact uses a Sandstone `Scroller` with `direction="both"`.
- Logging is **off by default** now that it is a user setting (the temporary developer tool defaulted to on). The console echo of the old logger is dropped: the in-app screen replaces it.
- Only the Enact build needs `core/debug-log.js` imported in `shell-enact/src/services.js`; today it was never imported there, so the Enact build logged nothing.

**Unit 2 additions.**
- `searchPage` must stop sending `type: 'IMAGE'`, otherwise the server never returns videos; the client filters to `IMAGE`/`VIDEO` itself. Known limitation: a result page made only of audio/other assets would end paging early (Immich libraries almost never contain those).
- The TV remote cannot operate a native `<video controls>` bar, so the legacy viewer draws its own tiny status line and uses OK = play/pause, Up/Down = seek ±10 s, Left/Right = previous/next item. Enact uses Sandstone's `VideoPlayer`.
- Grid tiles show a CSS-drawn play badge (no icon font, and old TV fonts may lack a ▶ glyph).

**Unit 3 changes to the design above.**
- The first sketch used Up/Down to zoom while un-zoomed and to pan once zoomed, which only ever reaches one zoom step. Final scheme (both builds): **OK zooms in one step (after the last step it wraps back to 1x), Back zooms out one step, arrows pan while zoomed, Left/Right still change photo at 1x.** Steps: 1x, 1.5x, 2x, 3x, 4x. Photos only.
- The pure zoom rules (steps, pan limits, transform string) live in a small shared module `core/zoom.js` so both builds behave identically and are unit-tested once. The earlier draft said "no `core/` changes"; duplicating the pan-clamp maths in two shells would be a maintenance trap.
- Enact adds Magic Remote support on top: mouse wheel zooms, click-and-drag pans (plain DOM mouse events; no Sandstone-specific API needed).
- Because Unit 3 edits the same viewer files Unit 2 rewrites, the Unit 3 branch is **stacked on the Unit 2 branch**.
