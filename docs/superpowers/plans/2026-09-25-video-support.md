# Video Listing and Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show videos next to photos in album and "All photos" grids, and let the user play them full screen with the TV remote, in both builds.

**Architecture:** `core/immich-client.js` stops excluding videos (it keeps `IMAGE` and `VIDEO`, drops audio/other), tags each asset with its `type`, and gets a `videoPlaybackUrl(assetId)` builder that mirrors the existing thumbnail URL builders. Grid tiles keep using the thumbnail endpoint (Immich serves a poster frame for videos) and add a play badge. The photo viewer becomes a media viewer: legacy draws its own small control line around a plain `<video>` element (a TV remote cannot operate the native controls bar); Enact uses Sandstone's `VideoPlayer`.

**Tech Stack:** ES5 (core + legacy shell, Chromium 38), `node --test`, ESLint 9 (`ecmaVersion: 5`), Enact Sandstone (React).

**Spec:** `docs/superpowers/specs/2026-09-25-next-features-design.md` (Unit 2 and its "Refinements" section). GitHub issue: https://github.com/rafspiny/immich-webos/issues/2 ("Enable listing of videos and their playback": show videos in the grid/list views and, if feasible, play them).

**Branch:** `issue-2-list-and-play-videos`, cut from `feature/first-implementation`.

## Global Constraints

Every task's requirements include these.

- Minimum platform: **webOS TV 3.x = Chromium 38**. `core/` and `shell-legacy/` are hand-written **ES5, no build step**.
- Forbidden in `core/` and `shell-legacy/`: `fetch`, `Array.from`, `Object.assign`, arrow functions, `let`/`const`, template literals, `String.prototype.includes/startsWith/endsWith/repeat/padStart`, `Array.prototype.includes/find/findIndex/fill`, async/await, ES modules, `NodeList.forEach`, CSS variables, CSS Grid, `position: sticky`, `:focus-within`, flex `gap`, CSS `aspect-ratio`/`min()`/`max()`/`clamp()`. `npm test` (ESLint + `tools/check-es5.js` + unit tests) enforces this. Tests under `tests/` are not scanned.
- Module pattern: IIFE attaching to the `ImmichCore` / `ImmichUI` namespace and setting `module.exports` under Node.
- Enact code lives in `shell-enact/` (React + `@enact/sandstone`, tabs for indentation). For every Sandstone component or prop used, first **verify it against the installed library** in `shell-enact/node_modules/@enact/sandstone` and adapt if the plan's code differs.
- Video is best effort: Immich only transcodes to a broadly compatible codec (H.264) according to the *server's* Transcode Policy, so some videos cannot play on some TVs. The app must never hang or crash on an unplayable video; it shows a clear message.
- Media URLs authenticate with the `?apiKey=` query parameter (Immich reads it for `/video/playback` exactly as for `/thumbnail`).
- Commit messages: informal plain English, short subject plus a body explaining why, ending with the trailer line `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Baseline before starting: `npm test` passes on the branch.

## Verified facts this plan relies on (sources in `docs/superpowers/specs/2026-09-25-next-features-design.md`)

- `AssetType` is exactly `IMAGE | VIDEO | AUDIO | OTHER` (Immich `server/src/enum.ts`).
- `GET /api/assets/{id}/video/playback` exists and uses the same `@Authenticated({ permission: AssetView, sharedLink: true })` decorator as `GET /api/assets/{id}/thumbnail`; the global auth reads `x-api-key` **or** the `apiKey` query parameter.
- Videos have no separate poster endpoint: `/thumbnail` returns a frame.
- Transcoding is server-configuration dependent (default policy `required`, accepted codec `h264`); there is no per-request switch.

## File Structure

```
core/immich-client.js               keep IMAGE+VIDEO, add `type` to assets, videoPlaybackUrl, no `type` filter in the request
tests/core/immich-client.test.js    updated + new tests
shell-legacy/js/videomath.js        NEW pure helpers: formatClock, seekTarget
tests/legacy/videomath.test.js      NEW
shell-legacy/js/view-album.js       play badge on video tiles
shell-legacy/js/view-viewer.js      rewrite: photo or video
shell-legacy/css/app.css            .viewer-media, .viewer-hud, .play-badge
shell-legacy/index.html             script tag for videomath.js
shell-enact/src/views/AlbumView.js  caption marks videos
shell-enact/src/views/Viewer.js     VideoPlayer for videos
README.md, docs/immich-api-notes.md, docs/TESTING.md   updated
```

---

### Task 1: `core/immich-client` keeps videos and builds playback URLs

**Files:**
- Modify: `core/immich-client.js`
- Modify: `tests/core/immich-client.test.js`

**Interfaces:**
- Consumes: the existing `call`, `getConfig`, `invalidResponse` helpers.
- Produces:
  - Every asset returned by `client.searchPage(page, size, filter?)` is `{id: string, name: string, type: 'IMAGE' | 'VIDEO'}`; audio/other assets are dropped client-side.
  - `searchPage` no longer sends `type: 'IMAGE'` in the request body (the body is `{page, size, order: 'desc'}` plus any filter), otherwise the server would never return videos.
  - `client.videoPlaybackUrl(assetId): string` → `<server>/api/assets/<id>/video/playback?apiKey=<key>` (key URL-encoded). `thumbnailUrl` and `viewerUrl` return exactly what they return today.
- Known limitation (document it, do not code around it): if a whole result page consists only of audio/other assets, `core/paging` sees zero items and stops early. Immich libraries almost never contain such assets.

- [ ] **Step 1: Update and add the tests**

In `tests/core/immich-client.test.js`, replace the test named `'searchPage merges an optional filter object into the request body'` with:
```js
test('searchPage merges an optional filter object into the request body', function () {
  var m = make([{ assets: { items: [{ id: '1', type: 'IMAGE', originalFileName: 'a.jpg' }], nextPage: null } }]);
  return m.c.searchPage(1, 60, { albumIds: ['a1'] }).then(function () {
    assert.deepStrictEqual(m.calls[0].body, { page: 1, size: 60, order: 'desc', albumIds: ['a1'] });
  });
});
```
Replace `'searchPage posts paging body and normalizes nextPage'` with:
```js
test('searchPage posts paging body and normalizes nextPage', function () {
  var m = make([{ assets: { items: [{ id: '1', type: 'IMAGE', originalFileName: 'a.jpg' }], nextPage: '3' } }]);
  return m.c.searchPage(2, 60).then(function (r) {
    assert.deepStrictEqual(m.calls[0].body, { page: 2, size: 60, order: 'desc' });
    assert.strictEqual(m.calls[0].method, 'POST');
    assert.deepStrictEqual(r, { items: [{ id: '1', name: 'a.jpg', type: 'IMAGE' }], nextPage: 3 });
  });
});
```
and add these new tests right after it:
```js
test('searchPage keeps images and videos and drops audio and other files', function () {
  var m = make([{ assets: { items: [
    { id: '1', type: 'IMAGE', originalFileName: 'a.jpg' },
    { id: '2', type: 'VIDEO', originalFileName: 'b.mp4' },
    { id: '3', type: 'AUDIO', originalFileName: 'c.mp3' },
    { id: '4', type: 'OTHER', originalFileName: 'd.bin' }], nextPage: null } }]);
  return m.c.searchPage(1, 60).then(function (r) {
    assert.deepStrictEqual(r.items, [
      { id: '1', name: 'a.jpg', type: 'IMAGE' },
      { id: '2', name: 'b.mp4', type: 'VIDEO' }]);
  });
});
test('video playback url carries the api key', function () {
  var m = make([]);
  assert.strictEqual(m.c.videoPlaybackUrl('v1'), 'https://s/api/assets/v1/video/playback?apiKey=K');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/core/immich-client.test.js`
Expected: FAIL (the request body still contains `type: 'IMAGE'`; videos are filtered out; `videoPlaybackUrl is not a function`).

- [ ] **Step 3: Implement in `core/immich-client.js`**

Replace `toAsset` and `onlyImages` with:
```js
  var MEDIA_TYPES = { IMAGE: true, VIDEO: true };

  function toAsset(a) { return { id: a.id, name: a.originalFileName || a.id, type: a.type }; }
  function onlyMedia(list) {
    return (list || []).filter(function (a) { return MEDIA_TYPES[a.type] === true; }).map(toAsset);
  }
```
Replace the `media` helper with:
```js
    function mediaUrl(assetId, path, query) {
      var cfg = getConfig();
      return cfg.serverUrl + '/api/assets/' + assetId + path + '?' + (query ? query + '&' : '') + 'apiKey=' + encodeURIComponent(cfg.apiKey);
    }
```
In `searchPage`: change the first line to `var body = { page: page, size: size, order: 'desc' };` and change `onlyImages(d.assets.items)` to `onlyMedia(d.assets.items)`. Replace the two URL methods at the end of the returned object with:
```js
      thumbnailUrl: function (assetId, size) { return mediaUrl(assetId, '/thumbnail', 'size=' + size); },
      viewerUrl: function (assetId) { return mediaUrl(assetId, '/thumbnail', 'size=preview'); },
      videoPlaybackUrl: function (assetId) { return mediaUrl(assetId, '/video/playback'); }
```
Check: `grep -n "onlyImages\|media(" core/immich-client.js` prints nothing.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/core/immich-client.test.js && npm test`
Expected: all pass (the existing `'media urls carry the api key as apiKey query param'` test still passes unchanged).

- [ ] **Step 5: Commit**

```bash
git add core/immich-client.js tests/core/immich-client.test.js
git commit -m "Let the Immich client return videos and build playback links" -m "Photo searches used to ask the server for images only and the client filtered again, so videos never showed up anywhere. The search now asks for everything, keeps photos and videos, drops audio and other files, and tags each asset with its type so the screens can tell them apart. There is also a builder for the video playback URL, using the same API-key-in-the-URL trick as thumbnails." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Pure video helpers for the legacy shell

The viewer needs to print `1:05 / 3:20` and to compute seek targets; both are pure and easy to test on their own.

**Files:**
- Create: `shell-legacy/js/videomath.js`, `tests/legacy/videomath.test.js`
- Modify: `shell-legacy/index.html`

**Interfaces:**
- Produces: `ui.videomath.formatClock(seconds): string` (`m:ss`, or `h:mm:ss` from one hour; NaN, Infinity, negatives and non-numbers give `'0:00'`), `ui.videomath.seekTarget(current, delta, duration): number` (current + delta, never below 0, never above a known finite positive `duration`).

- [ ] **Step 1: Write the failing tests**

`tests/legacy/videomath.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var vm = require('../../shell-legacy/js/videomath');

test('formatClock shows m:ss and h:mm:ss', function () {
  assert.strictEqual(vm.formatClock(0), '0:00');
  assert.strictEqual(vm.formatClock(5), '0:05');
  assert.strictEqual(vm.formatClock(65.9), '1:05');
  assert.strictEqual(vm.formatClock(3600), '1:00:00');
  assert.strictEqual(vm.formatClock(3725), '1:02:05');
});
test('formatClock copes with NaN, Infinity, negatives and junk', function () {
  assert.strictEqual(vm.formatClock(NaN), '0:00');
  assert.strictEqual(vm.formatClock(Infinity), '0:00');
  assert.strictEqual(vm.formatClock(-4), '0:00');
  assert.strictEqual(vm.formatClock(undefined), '0:00');
});
test('seekTarget moves by delta and stays inside the video', function () {
  assert.strictEqual(vm.seekTarget(30, 10, 100), 40);
  assert.strictEqual(vm.seekTarget(5, -10, 100), 0);
  assert.strictEqual(vm.seekTarget(95, 10, 100), 100);
});
test('seekTarget with an unknown duration only clamps at zero', function () {
  assert.strictEqual(vm.seekTarget(30, 10, NaN), 40);
  assert.strictEqual(vm.seekTarget(3, -10, NaN), 0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/legacy/videomath.test.js`
Expected: FAIL (`Cannot find module '../../shell-legacy/js/videomath'`).

- [ ] **Step 3: Create `shell-legacy/js/videomath.js`**

```js
(function (root) {
  'use strict';
  var ui = root.ImmichUI = root.ImmichUI || {};

  function formatClock(seconds) {
    var s = Math.floor(Number(seconds));
    if (!isFinite(s) || s < 0) { s = 0; }
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var ss = (sec < 10 ? '0' : '') + sec;
    if (h > 0) { return h + ':' + (m < 10 ? '0' : '') + m + ':' + ss; }
    return m + ':' + ss;
  }

  function seekTarget(current, delta, duration) {
    var t = (Number(current) || 0) + delta;
    var max = (isFinite(duration) && duration > 0) ? duration : Infinity;
    return Math.max(0, Math.min(max, t));
  }

  var api = { formatClock: formatClock, seekTarget: seekTarget };
  ui.videomath = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
```

- [ ] **Step 4: Wire the script and run the gate**

In `shell-legacy/index.html` add `  <script src="js/videomath.js"></script>` on the line before `js/view-viewer.js`.
Run: `node --test tests/legacy/videomath.test.js && npm test`
Expected: 4 tests pass, whole gate green (the build test proves the script tag resolves).

- [ ] **Step 5: Commit**

```bash
git add shell-legacy/js/videomath.js tests/legacy/videomath.test.js shell-legacy/index.html
git commit -m "Add small helpers for showing video time and seeking" -m "Two pure functions with tests: one turns seconds into 1:05 or 1:02:05 without ever printing NaN, the other works out where a seek lands without running past either end of the video. The viewer will use them." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Play badge on video tiles (legacy)

**Files:**
- Modify: `shell-legacy/js/view-album.js`, `shell-legacy/css/app.css`

**Interfaces:**
- Consumes: `asset.type` (Task 1) on the items passed to `renderTile`.
- Produces: video tiles contain a `div.play-badge` (a CSS-drawn round play symbol; no font glyph, because 2016-17 TV fonts may lack `▶`).

- [ ] **Step 1: Add the badge to the tile**

In `shell-legacy/js/view-album.js`, in `renderTile`, replace `box.appendChild(img);` with:
```js
        box.appendChild(img);
        if (a.type === 'VIDEO') { box.appendChild(dom.el('div', 'play-badge')); }
```

- [ ] **Step 2: Append the styles to `shell-legacy/css/app.css`**

```css

.play-badge { position: absolute; right: 12px; bottom: 12px; width: 56px; height: 56px; border-radius: 28px; background: rgba(0, 0, 0, 0.65); }
.play-badge:after { content: ''; position: absolute; left: 22px; top: 15px; width: 0; height: 0; border-left: 20px solid #ffffff; border-top: 13px solid transparent; border-bottom: 13px solid transparent; }
```

- [ ] **Step 3: Run the gate**

Run: `npm test`
Expected: everything passes (the CSS gate accepts these rules). The visual check is part of Task 4's manual test.

- [ ] **Step 4: Commit**

```bash
git add shell-legacy/js/view-album.js shell-legacy/css/app.css
git commit -m "Mark video tiles with a play badge in the legacy grid" -m "Videos and photos now share the same grid, so videos get a small round play symbol in the corner of their thumbnail. It is drawn with CSS instead of a glyph because older TV fonts may not have a play character." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Legacy viewer plays videos

**Files:**
- Modify: `shell-legacy/js/view-viewer.js` (full rewrite), `shell-legacy/css/app.css`

**Interfaces:**
- Consumes: `ctx.client.viewerUrl(id)`, `ctx.client.videoPlaybackUrl(id)` (Task 1); `ui.videomath.{formatClock, seekTarget}` (Task 2); items `{id, name, type}`; `ctx.viewerIndex` (unchanged contract with the album view).
- Produces: `ui.createViewerView(ctx)` (same router contract). Keys for a **photo**: Left/Right previous/next item, OK/Up/Down flash the counter (unchanged). Keys for a **video**: Left/Right previous/next item, OK play/pause, Up seek +10 s, Down seek -10 s. A status line shows `Playing|Paused  m:ss / m:ss   OK play/pause, Up/Down seek` for three seconds after any key. A failed video shows `Could not play this video. ...`; a failed photo keeps its old message. Leaving the view stops the video and clears its source so it never keeps playing or downloading in the background. Elements share the class `viewer-media`.
- Unit 3 (zoom) builds on this file: it relies on the classes `viewer-media` (photo and video) and on the helper functions `isVideo()`, `flashInfo()` and `show()` existing under these names.

- [ ] **Step 1: Rewrite `shell-legacy/js/view-viewer.js`**

```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom, vm = ui.videomath;
  var SEEK_SECONDS = 10;
  var MSG_PHOTO = 'Could not load this photo.';
  var MSG_VIDEO = 'Could not play this video. The server may not have a version this TV can decode.';

  ui.createViewerView = function (ctx) {
    var el = dom.el('div', 'view viewer');
    document.getElementById('root').appendChild(el);
    var img = dom.el('img', 'viewer-media');
    var video = dom.el('video', 'viewer-media hidden');
    var counter = dom.el('div', 'viewer-counter');
    var hud = dom.el('div', 'viewer-hud hidden');
    var error = dom.el('div', 'viewer-error hidden');
    [img, video, counter, hud, error].forEach(function (n) { el.appendChild(n); });
    video.autoplay = true;
    var assets = [], index = 0, timer = null;

    function isVideo() { return assets[index].type === 'VIDEO'; }

    function hudText() {
      return (video.paused ? 'Paused' : 'Playing') + '   ' + vm.formatClock(video.currentTime) + ' / ' +
        vm.formatClock(video.duration) + '   OK play/pause, Up/Down seek';
    }
    function flashInfo() {
      counter.textContent = (index + 1) + ' / ' + assets.length;
      dom.show(counter);
      if (isVideo()) { hud.textContent = hudText(); dom.show(hud); } else { dom.hide(hud); }
      clearTimeout(timer);
      timer = setTimeout(function () { dom.hide(counter); dom.hide(hud); }, 3000);
    }
    function playSafely() {
      var p = video.play();
      if (p && p.catch) { p.catch(function () { /* the user can press OK again */ }); }
    }
    function stopVideo() {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    function show() {
      var asset = assets[index];
      dom.hide(error);
      ctx.viewerIndex = index;
      if (asset.type === 'VIDEO') {
        img.removeAttribute('src');
        dom.hide(img);
        dom.show(video);
        video.src = ctx.client.videoPlaybackUrl(asset.id);
      } else {
        stopVideo();
        dom.hide(video);
        dom.show(img);
        img.src = ctx.client.viewerUrl(asset.id);
        if (index + 1 < assets.length && assets[index + 1].type !== 'VIDEO') {
          new Image().src = ctx.client.viewerUrl(assets[index + 1].id);
        }
      }
      flashInfo();
    }

    img.onerror = function () { error.textContent = MSG_PHOTO; dom.show(error); };
    video.onerror = function () {
      if (!video.getAttribute('src')) { return; }      /* clearing the source also raises an error event */
      error.textContent = MSG_VIDEO;
      dom.show(error);
    };
    video.addEventListener('timeupdate', function () {
      if (!hud.classList.contains('hidden')) { hud.textContent = hudText(); }
    });

    return {
      el: el,
      enter: function (params) { assets = params.assets; index = params.index; show(); },
      leave: function () { clearTimeout(timer); img.removeAttribute('src'); stopVideo(); },
      snapshot: function () { return null; },
      onKey: function (key) {
        if (key === 'left') { if (index > 0) { index--; show(); } return true; }
        if (key === 'right') { if (index < assets.length - 1) { index++; show(); } return true; }
        if (isVideo()) {
          if (key === 'ok') { if (video.paused) { playSafely(); } else { video.pause(); } flashInfo(); return true; }
          if (key === 'up') { video.currentTime = vm.seekTarget(video.currentTime, SEEK_SECONDS, video.duration); flashInfo(); return true; }
          if (key === 'down') { video.currentTime = vm.seekTarget(video.currentTime, -SEEK_SECONDS, video.duration); flashInfo(); return true; }
        }
        if (key === 'ok' || key === 'up' || key === 'down') { flashInfo(); return true; }
        return false;
      }
    };
  };
}(window));
```

- [ ] **Step 2: Update `shell-legacy/css/app.css`**

Replace the line
```css
.viewer-img { max-width: 1920px; max-height: 1080px; object-fit: contain; }
```
with
```css
.viewer-media { max-width: 1920px; max-height: 1080px; object-fit: contain; }
.viewer video.viewer-media { width: 1920px; height: 1080px; }
.viewer-hud { position: absolute; left: 40px; bottom: 30px; background: rgba(0, 0, 0, 0.6); padding: 8px 22px; border-radius: 8px; font-size: 26px; }
```
Check: `grep -rn "viewer-img" shell-legacy` prints nothing.

- [ ] **Step 3: Run the gate**

Run: `npm test`
Expected: everything passes, ES5 gate OK (note `video.play()` result is only touched through `p && p.catch`, because Chromium 38 returns `undefined`).

- [ ] **Step 4: Manual check with a real server (Simulator or `npm run serve:legacy`)**

Use an album that contains at least one video. Expect:
1. Video tiles show the round play badge; photos do not. "All photos" shows videos too.
2. OK on a video opens it and it starts playing; the status line appears for three seconds (`Playing  0:03 / 0:20   OK play/pause, Up/Down seek`) and its clock keeps updating while visible.
3. OK pauses (`Paused`), OK again resumes. Up jumps 10 s forward, Down 10 s back, never past either end.
4. Left/Right move to the neighbouring item; moving from a video to a photo stops the video (no sound continues) and shows the photo; moving from a photo to a video plays it.
5. Back returns to the grid with that item highlighted, and the video stops.
6. A video the TV cannot decode shows the red message "Could not play this video..." and the app stays responsive (Left/Right/Back still work).

- [ ] **Step 5: Commit**

```bash
git add shell-legacy/js/view-viewer.js shell-legacy/css/app.css
git commit -m "Play videos in the legacy viewer" -m "The full-screen viewer now handles both photos and videos. A TV remote cannot operate the browser's own video controls, so the viewer keeps things simple: OK plays or pauses, Up and Down jump ten seconds, Left and Right still go to the neighbouring item. A small status line shows play state and time for a few seconds after each key. Leaving a video clears its source so it stops downloading, and a video the TV cannot decode shows a clear message instead of a blank screen." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Enact build lists and plays videos

**Files:**
- Modify: `shell-enact/src/views/AlbumView.js`, `shell-enact/src/views/Viewer.js`

**Interfaces:**
- Consumes: `services.client.{videoPlaybackUrl, viewerUrl, thumbnailUrl}` and `asset.type` (Task 1; the Enact bundle gets the new core through `npm run sync:core`, which the pack scripts run).
- Produces: video tiles are labelled `▶ Video` (Sandstone's `ImageItem` has no simple overlay slot, so the badge is the caption; Enact TVs are webOS 5+ and have the glyph); the fullscreen viewer shows a Sandstone `VideoPlayer` for videos (the player handles play/pause, seeking and its own controls) with **Previous / Next** buttons in its media controls; photos behave exactly as before. A video that fails to load shows a message.

- [ ] **Step 1: Verify the Sandstone APIs against the installed library**

```bash
cd /data/projects/immich_webos/shell-enact/node_modules/@enact
sed -n 2054,2072p sandstone/VideoPlayer/VideoPlayer.js        # usage example: <source>, <MediaControls>, <leftComponents>, <rightComponents>
grep -n "MediaControls" sandstone/MediaPlayer/index.js | head -3   # exported from '@enact/sandstone/MediaPlayer'
grep -n "error" ui/Media/Media.js | head -4                       # media 'error' event is forwarded as the onError prop
```
Expected: the example shows `<VideoPlayer title=...><source src=... /><MediaControls><leftComponents>..</leftComponents><rightComponents>..</rightComponents></MediaControls></VideoPlayer>`; `MediaControls` is exported by `@enact/sandstone/MediaPlayer`; `error: 'onError'` is in the handled media events. If something differs, adapt Step 3 and say so in the commit body.

- [ ] **Step 2: Mark videos in the grid**

In `shell-enact/src/views/AlbumView.js`, give the `MediaGrid` a `labelOf` prop (next to `srcOf`):
```js
				labelOf={(a) => (a.type === 'VIDEO' ? '▶ Video' : '')}
```

- [ ] **Step 3: Rewrite `shell-enact/src/views/Viewer.js`**

```js
import {useEffect, useState} from 'react';
import Popup from '@enact/sandstone/Popup';
import Spottable from '@enact/spotlight/Spottable';
import VideoPlayer from '@enact/sandstone/VideoPlayer';
import {MediaControls} from '@enact/sandstone/MediaPlayer';
import BodyText from '@enact/sandstone/BodyText';
import Button from '@enact/sandstone/Button';
import services from '../services';

const Photo = Spottable('div');

const Viewer = ({open, items, index, onIndex, onClose}) => {
	const [videoFailed, setVideoFailed] = useState(false);
	const asset = open && index !== null ? items[index] : null;
	const isVideo = !!asset && asset.type === 'VIDEO';
	const hasPrev = index !== null && index > 0;
	const hasNext = index !== null && index < items.length - 1;

	useEffect(() => { setVideoFailed(false); }, [index, open]);

	useEffect(() => {
		if (!open || isVideo) return undefined;   // for videos Left/Right belong to the player (seeking)
		const onKey = (e) => {
			if (e.keyCode === 37 && index > 0) onIndex(index - 1);
			if (e.keyCode === 39 && index < items.length - 1) onIndex(index + 1);
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, isVideo, index, items, onIndex]);

	return (
		<Popup open={open} onClose={onClose} position="fullscreen">
			{asset && !isVideo ? (
				<Photo style={{width: '100%', height: '100%'}}>
					<img alt={asset.name} src={services.client.viewerUrl(asset.id)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
				</Photo>
			) : null}
			{asset && isVideo ? (
				<VideoPlayer key={asset.id} title={asset.name} onError={() => setVideoFailed(true)}>
					<source src={services.client.videoPlaybackUrl(asset.id)} />
					<MediaControls>
						<leftComponents>
							<Button size="small" backgroundOpacity="translucent" disabled={!hasPrev} onClick={() => onIndex(index - 1)}>Previous</Button>
						</leftComponents>
						<rightComponents>
							<Button size="small" backgroundOpacity="translucent" disabled={!hasNext} onClick={() => onIndex(index + 1)}>Next</Button>
						</rightComponents>
					</MediaControls>
				</VideoPlayer>
			) : null}
			{videoFailed ? <BodyText>Could not play this video. The server may not have a version this TV can decode.</BodyText> : null}
		</Popup>
	);
};

export default Viewer;
```

- [ ] **Step 4: Build**

Run: `cd /data/projects/immich_webos && npm test && npm --prefix shell-enact run pack`
Expected: root gate green; `Compiled successfully`.

- [ ] **Step 5: Check it in the Simulator with a real server**

Run: `ares-launch -s 22 -sp ~/webOS_TV_22_Simulator_1.4.1/webOS_TV_22_Simulator_1.4.1 shell-enact/dist` (adjust the path), then in an album with a video:
1. Video tiles show `▶ Video` under the thumbnail; "All photos" lists videos too.
2. OK opens the video; the Sandstone player plays it, Play/Pause and seeking work with the remote; **Previous/Next** in the controls move to the neighbouring item (the video stops); Back closes the viewer.
3. A photo still opens, Left/Right change photo, Back closes.
4. An undecodable video shows the red-free message text ("Could not play this video...") and Back still closes the viewer.
If the player cannot be dismissed with Back, or `onError` never fires for an undecodable video, record it in the commit body and stop; that needs a design decision.

- [ ] **Step 6: Commit**

```bash
git add shell-enact/src/views/AlbumView.js shell-enact/src/views/Viewer.js
git commit -m "List and play videos in the Enact build" -m "Videos show up in the Enact grids with a small play label, and opening one plays it in Sandstone's own video player, so play, pause and seeking work the way TV users expect. Previous and Next buttons in the player controls move to the neighbouring item. Photos behave as before, and a video the TV cannot decode shows a message instead of a blank screen." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Documentation

**Files:**
- Modify: `README.md`, `docs/immich-api-notes.md`, `docs/TESTING.md`

**Interfaces:** none.

- [ ] **Step 1: `README.md`**

In the intro paragraph (line 5) change the end `Not yet: map, people/faces, search, video.` to `Not yet: map, people/faces, search.` and change `albums and photos, grid/list layout` to `albums, photos and videos, grid/list layout`.
In the `core/` modules table change the `immich-client` row's tail `; only photos are returned` to `; photos and videos are returned (audio and other files are skipped)`.

- [ ] **Step 2: `docs/immich-api-notes.md`**

Add this section before `## If a Check Fails`:
````markdown
### Check 8: Video playback URL
**Command:**
```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "URL/api/assets/VIDEO_ASSET_ID/video/playback?apiKey=KEY"
```
**Status:** UNVERIFIED - to be run by the user
**Expected Result:** `200 video/mp4` (or `206` when a `Range` header is sent). The key needs the `asset.view` permission, the same as thumbnails.
**Purpose:** Confirms video playback authenticates with the `apiKey` query parameter, which is the only way a `<video src>` can send it.
**Note:** Whether the returned file is H.264 depends on the *server's* Transcode Policy (default `required`: transcode only when the source codec is not in the accepted list, default `h264`). A server set to `disabled`, or a video whose transcode job has not finished, can serve the original codec (for example HEVC), which older TVs cannot decode. The app shows "Could not play this video" in that case.

---

````
and in "Implementation Details" replace the `searchPage` bullet with:
```
- **searchPage(page, size, filter):** Paginated asset search. The request no longer restricts `type` (otherwise videos are never returned); the client keeps `IMAGE` and `VIDEO` assets and skips `AUDIO`/`OTHER`. Each asset is `{id, name, type}`. `filter` is an optional object merged into the request body (for example `{albumIds: [id]}`)
```
and add a bullet `- **videoPlaybackUrl(assetId):** Generates the video playback URL with the \`apiKey\` query parameter`.

- [ ] **Step 3: `docs/TESTING.md`**

At the end of the `## 4. Photos` paragraph append: ` Videos appear in the same grids with a play badge (a round play symbol on the legacy build, a "▶ Video" caption on Enact); OK opens a video and it starts playing. Legacy build: OK pauses/resumes, Up/Down jump 10 seconds, Left/Right go to the previous/next item. Enact build: use the player controls (Previous/Next buttons included). A video the TV cannot decode shows "Could not play this video..." and the app stays usable (see Check 8 in docs/immich-api-notes.md).`

- [ ] **Step 4: Verify and commit**

Run: `npm test`
Expected: everything passes.
```bash
git add README.md docs/immich-api-notes.md docs/TESTING.md
git commit -m "Document video support and its limits" -m "Updates the README scope, adds a check for the video playback URL to the API notes together with the honest caveat that playback depends on how the Immich server transcodes, and adds videos to the acceptance test guide." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (issue #2 and the design):** videos listed in grid/list views: Tasks 1 (data), 3 (legacy badge), 5 (Enact label). Playback: Tasks 4 (legacy) and 5 (Enact). Both builds: yes. Best-effort codec handling with a clear message: Tasks 4 and 5 plus Task 6 docs. Photos unaffected: Tasks 4 and 5 keep the photo paths and keys.

**Placeholder scan:** no TBD/TODO; every code step shows code. Task 5 has an explicit stop rule for two unverified behaviours (Back dismissal, `onError`), because they can only be observed in the Simulator.

**Type consistency:** asset shape `{id, name, type}` is produced in Task 1 and consumed by Tasks 3-5; `videoPlaybackUrl` is defined in Task 1 and used in Tasks 4-5; `ui.videomath.formatClock/seekTarget` defined in Task 2, used in Task 4; class `viewer-media` and the function names `isVideo`, `flashInfo`, `show` in Task 4 are the ones the zoom plan depends on.

**Known limits:** a result page consisting only of audio/other assets would end paging early; no media (Play/Pause/FF/RW) remote keys on the legacy build; the Enact grid marks videos with a caption instead of an overlay badge.
