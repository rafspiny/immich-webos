# Immich webOS TV App — Design Spec (iteration 1, rev 2)

Rev 2 (2026-09-19): minimum supported platform is **webOS TV 3.x (Chromium 38)**. Rev 1 wrongly assumed Chromium 53 for webOS 3.5.

## Context
A webOS TV **web app** that browses Immich photos and albums with a TV remote only. It must run from webOS TV 3.x (2016-17) up to current TVs. The repo holds a plain-JS prototype (`index.html`, `js/{app,api,nav,storage}.js`, `css/app.css`, `appinfo.json`, a built `.ipk`), but CLAUDE.md, PLAN.md and the old memory note assumed Enact.

## Findings that drive the design
- LG engine table (webostv.developer.lge.com/develop/specifications/web-api-and-web-engine): webOS TV 3.x = **Chromium 38**, 4.x = 53, 5.x = 68, 6.x = 79, 22 = 87. LG's docs list no "3.9.x" version; the user confirmed the minimum is the **3.x generation**. Verify the real engine on the TV first (`navigator.userAgent` via `ares-inspect`).
- LG: "Because Enact is supported from webOS TV 4.0, you must retain Enyo-based apps for webOS TV 1.x to 3.x." Enact is **not supported on 3.x**; Sandstone is supported from webOS TV 5.0.
- The LG Simulator offers webOS TV **6.0 and 22-26 only**. The 3.x build can only be verified on a real TV.
- **Chromium 38 baseline** (applies to `core/` and `shell-legacy/`): no `fetch` (42), no `Array.from`/`Object.assign`/arrow functions/`Array.prototype.find` (45), no `let`/`const` in sloppy mode or CSS variables (49), no `String.prototype.includes/startsWith` (41), no `Array.prototype.includes` (47), no async/await (55), no CSS Grid (57), no `position: sticky` (56), no `:focus-within` (60), no IntersectionObserver (51), no native ES modules (61). Available: `Promise` (32), XMLHttpRequest, unprefixed flexbox, `transform`, `object-fit`, `classList`, `dataset`, WebP.
- Weak 2016-17 TV CPU/RAM: keep the DOM small (windowed lists), avoid layout thrash, cap in-memory thumbnails.
- 2016-17 firmware has an old CA store and no TLS 1.3. The user's Immich is **HTTPS with a public cert**, so certificate or protocol rejection is a real risk.
- Video: HEVC is not decodable on 3.x; use Immich's transcoded stream (`/video/playback`). Photos are the primary scope.

## Decisions (from the user)
1. **Two builds** over one shared core: plain-JS legacy shell (webOS 3.x+) and an Enact Sandstone shell (webOS 5+), **developed together per feature**.
2. **Legacy shell: no build step, hand-written ES5** (XHR wrapper + `Promise`, flexbox, no CSS variables, no polyfill bundle).
3. **Sign-in**: server URL + **API key only** (username/password dropped for now). Input via native webOS keyboard, Magic Remote voice (where present), and our own D-pad keyboard fallback. 2016-17 remotes may have no pointer, so the D-pad keyboard is the primary path.
4. **Scope**: photos and albums only. Map, people/faces, search, QR pairing come later.
5. **View settings**: grid or list, N columns per row (3-8), thumbnail size, persisted.

## Architecture
```
core/            ES5 to the Chromium 38 baseline; no DOM, no framework; shared by both shells
  http           XMLHttpRequest wrapper returning Promises (replaces fetch); timeout + error classification
  immich-client  albums, album detail, timeline, thumbnail/original/video URLs (port of js/api.js, fetch removed)
  auth           validate via /api/users/me (fallback /api/user); store URL+key; classify TLS/cert/CORS/401/unreachable
  settings       viewMode, columns, thumbSize; persisted (port of js/storage.js)
  paging         server-side pagination; never load a whole library
shell-legacy/    plain JS + flexbox, no build; own D-pad focus manager + windowed grid/list  -> webOS 3.x and up
shell-enact/     Enact Sandstone, VirtualGridList + Spotlight                                -> webOS 5+ (simulator-testable from 6.0)
```
- Screens in both shells: Setup, Albums, Album detail, Photo viewer (prev/next), Settings.
- Focus: remember last focused item per screen so Back restores it. BACK key pops the navigation stack.
- Setup keyboard: on-screen D-pad keyboard with shortcut keys (`https://`, `.com`, `:2283`), remembered URL history, masked key with a show toggle.
- Errors: connection test reports specific causes (certificate rejected, unreachable, CORS, invalid key). README documents a LAN-HTTP fallback for the certificate case.
- CORS: Immich needs `IMMICH_CORS_ALLOWED_ORIGINS` set for the TV app origin (document it). Images/video use `?key=` query auth and need no CORS.
- Packaging: two apps via `ares-package` — `com.immich.webos` (legacy) and `com.immich.webos.enact`. Keep `appinfo.json` schema-strict, real icons (80x80, 130x130), 1920x1080.

## Repo changes
- Amend CLAUDE.md: Enact applies to `shell-enact`; `shell-legacy` is plain ES5 because webOS 3.x lacks Enact support (cite the LG statement).
- Reconcile PLAN.md and TOOLING.md with this design (TOOLING.md says Chrome 53 / `fetch` is fine: not true for 3.x).
- Migrate existing `js/` into `core/` + `shell-legacy/`. **Prototype code that breaks on Chromium 38** and must be rewritten: `fetch` in `js/api.js`, `Array.from` in `js/app.js`; audit `nav.js` and `css/app.css` for the same class of issue.
- Automated ES5 gate for `core/` and `shell-legacy/` (ESLint `ecmaVersion: 5`, plus a check that forbids the Chromium 38 missing APIs listed above) in an `npm test` script, since the simulator cannot cover 3.x.
- Core unit tests (Node) with a mocked XHR.

## README additions
- Simulator dev env on Linux: download the 6.0/22-26 Simulator AppImage; on Ubuntu 24+ run it directly with `--ozone-platform=x11 --no-sandbox` (ares-launch cannot pass these flags); then `ares-launch -s <version> <dir>`.
- Real TV test: install "Developer Mode" app, enable Dev Mode Status + Key Server, `ares-setup-device` (port 9922, user `prisoner`), `ares-package`, `ares-install -d <tv>`, `ares-launch -d <tv> <id>`, `ares-inspect -d <tv> --app <id> --open`, `ares-log`. Note the 3.x caveats: Chromium 38, no simulator, old CA store, inspector needs a compatible Chromium on the dev machine.

## User test steps (delivered after the first implementation)
A `docs/TESTING.md` (linked from the README) that a non-developer can follow, written and validated once the first working build exists. Each step has an expected result.
1. **Prerequisites checklist**: Immich URL reachable from the TV network, an API key created in Immich (Account Settings > API Keys), CORS env set, TV in Developer Mode.
2. **Install**: `ares-package`, `ares-install`, `ares-launch` for the legacy build (and Enact build on webOS 5+ TVs); expected: app icon appears in the launcher and the Setup screen opens.
3. **Sign-in**: enter URL and API key with the remote only; expected: "Connected as <name>"; wrong key shows "invalid key"; unreachable URL shows "cannot reach server"; a rejected certificate shows the certificate message.
4. **Albums**: list appears, scroll with D-pad, OK opens an album, Back returns with focus restored on the same album.
5. **Photos**: album grid loads thumbnails, OK opens the viewer, Left/Right steps photos, Back returns to the same tile.
6. **View settings**: change grid/list and columns 3-8; expected: layout changes immediately and persists after closing and relaunching the app.
7. **Large library**: scroll a 10k+ asset library quickly; expected: no freeze, no crash.
8. **Simulator run** (Enact build): same flow in the LG Simulator.
9. **Report template**: TV model, webOS version, `navigator.userAgent`, step number that failed, `ares-log` output.

## Future iteration (not in this plan)
Map of photo locations; people/faces and per-person photos; username/password login; QR pairing; search.

## Verification
0. **First task**: on the real TV, print `navigator.userAgent` and feature-probe (`fetch`, `Array.from`, flexbox, CSS variables) via `ares-inspect`, to confirm the Chromium 38 baseline.
1. `npm test`: core unit tests pass; ES5/API gate passes on `core/` and `shell-legacy/`.
2. Enact shell: run in the webOS 6.0/22+ Simulator; browse albums, change grid/list and columns, open a photo, Back restores focus.
3. Legacy shell: `ares-package` + `ares-install` + `ares-launch` on a webOS 3.x TV; complete the same flow with the remote only; check `ares-inspect` for console errors.
4. Connect to the HTTPS Immich instance from the TV; confirm either success or the specific certificate error message.
5. Large library (10k+ assets): scrolling stays smooth, memory stable on the 3.x TV.
