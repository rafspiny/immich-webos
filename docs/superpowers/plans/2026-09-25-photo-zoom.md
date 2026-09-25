# Photo Zoom in the Full-Screen Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user zoom a photo in and out (and move around it) in the full-screen viewer, with the TV remote, in both builds; the Enact build additionally supports the Magic Remote wheel and pointer drag.

**Architecture:** The rules that decide zoom steps, pan limits and the CSS transform are pure and identical for both builds, so they live in one small shared module `core/zoom.js` with unit tests. Each shell applies them to its viewer: the legacy viewer maps the remote keys, the Enact viewer maps keys, wheel and drag. Zoom applies to photos only.

**Tech Stack:** ES5 (core + legacy shell, Chromium 38), `node --test`, ESLint 9 (`ecmaVersion: 5`), Enact Sandstone (React).

**Spec:** `docs/superpowers/specs/2026-09-25-next-features-design.md` (Unit 3 and its "Refinements" section). GitHub issue: https://github.com/rafspiny/immich-webos/issues/4 ("Enable zoom while viewing pictures in full screen", both builds).

**Branch:** `issue-4-zoom-fullscreen-pictures`, **stacked on** `issue-2-list-and-play-videos` (cut it from that branch, not from `feature/first-implementation`). Both units rewrite the viewer files; this plan starts from the viewer as Unit 2 leaves it.

## Dependency on Unit 2 (video support)

This plan edits `shell-legacy/js/view-viewer.js` and `shell-enact/src/views/Viewer.js` **as rewritten by Unit 2**. It relies on these names existing there: in the legacy viewer the functions `isVideo()`, `flashInfo()`, `show()`, `stopVideo()`, the variables `assets`, `index`, `timer`, the elements `img`/`video` with class `viewer-media`, and `ui.videomath`; in the Enact viewer the props `open, items, index, onIndex, onClose`, the `isVideo` flag, `videoFailed` state and the `VideoPlayer` branch. **If those are missing (Unit 2 not merged into the branch you are on), stop and report.**

## Global Constraints

Every task's requirements include these.

- Minimum platform: **webOS TV 3.x = Chromium 38**. `core/` and `shell-legacy/` are hand-written **ES5, no build step**.
- Forbidden in `core/` and `shell-legacy/`: `fetch`, `Array.from`, `Object.assign`, arrow functions, `let`/`const`, template literals, `String.prototype.includes/startsWith/endsWith/repeat/padStart`, `Array.prototype.includes/find/findIndex/fill`, async/await, ES modules, `NodeList.forEach`, CSS variables, CSS Grid, `position: sticky`, `:focus-within`, flex `gap`, CSS `aspect-ratio`/`min()`/`max()`/`clamp()`. `npm test` enforces this. Allowed and used here: CSS `transform` and `transition`.
- Module pattern: IIFE attaching to the `ImmichCore` / `ImmichUI` namespace and setting `module.exports` under Node.
- Enact code lives in `shell-enact/` (React + `@enact/sandstone`, tabs for indentation). Verify Sandstone/Spotlight behaviour against the installed library and in the Simulator before relying on it.
- The remote has no pinch gesture. Zoom must work with a plain 5-way remote (no mouse, no colour keys).
- Commit messages: informal plain English, short subject plus a body explaining why, ending with the trailer line `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Baseline before starting: `npm test` passes on the branch.

## The key scheme (both builds)

Steps: **1x, 1.5x, 2x, 3x, 4x**. Photos only (videos keep their own controls).

| State | Left / Right | Up / Down | OK | Back |
|---|---|---|---|---|
| Not zoomed (1x) | previous / next item | show counter | zoom in to 1.5x | leave the viewer |
| Zoomed | move the view left / right | move the view up / down | zoom in one step (after 4x back to 1x) | zoom out one step |

Zoom and pan reset whenever another item is shown. Enact additionally: mouse wheel up/down zooms in/out, click-and-drag pans.

## File Structure

```
core/zoom.js                         NEW pure zoom rules (steps, fit, pan limits, css transform)
tests/core/zoom.test.js              NEW
shell-legacy/js/view-viewer.js       zoom state + keys
shell-legacy/css/app.css             transition on the photo
shell-enact/src/services.js          import core/zoom, export zoom
shell-enact/src/views/Viewer.js      zoom state, keys, wheel, drag
README.md, docs/TESTING.md           updated
```

---

### Task 1: `core/zoom` shared zoom rules

**Files:**
- Create: `core/zoom.js`, `tests/core/zoom.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces on `ImmichCore.zoom` (also `module.exports`):
  - `LEVELS: number[]` = `[1, 1.5, 2, 3, 4]`; `PAN_STEP: number` = `240` (screen pixels per arrow press).
  - `zoomIn(level)` next level, stays at the last; `zoomOut(level)` previous level, never below 1; `cycle(level)` next level, wraps from the last back to 1. An unknown level is treated as 1x.
  - `fitSize(natW, natH, boxW, boxH): {w, h}` the size an image gets with `object-fit: contain` inside a box (rounded); if a natural size is 0 it returns the box.
  - `maxPan(boxW, boxH, level, viewW, viewH): {x, y}` the largest shift (in screen pixels, each axis, `>= 0`) so no empty edge shows: `max(0, (boxW * level - viewW) / 2)` and likewise for y. `boxW/boxH` is the displayed (un-zoomed) size of the image.
  - `clampPan(pan, boxW, boxH, level, viewW, viewH): {x, y}`; `panBy(pan, dx, dy, boxW, boxH, level, viewW, viewH): {x, y}` (add then clamp).
  - `transform(level, pan): string` = `translate(Xpx, Ypx) scale(L)` with X and Y rounded. Because `translate` is written first it is applied in screen pixels after scaling about the centre.
- Sign convention: a **positive** `pan.x` moves the image to the **right** (so the user sees content further left). Callers translate keys accordingly (see Tasks 2-3).

- [ ] **Step 1: Write the failing tests**

`tests/core/zoom.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var zoom = require('../../core/zoom');

test('zoomIn steps through the levels and stays at the last one', function () {
  assert.strictEqual(zoom.zoomIn(1), 1.5);
  assert.strictEqual(zoom.zoomIn(1.5), 2);
  assert.strictEqual(zoom.zoomIn(2), 3);
  assert.strictEqual(zoom.zoomIn(3), 4);
  assert.strictEqual(zoom.zoomIn(4), 4);
});
test('cycle steps in and wraps back to 1x after the last level', function () {
  assert.strictEqual(zoom.cycle(1), 1.5);
  assert.strictEqual(zoom.cycle(3), 4);
  assert.strictEqual(zoom.cycle(4), 1);
});
test('zoomOut steps back down and never goes below 1x', function () {
  assert.strictEqual(zoom.zoomOut(4), 3);
  assert.strictEqual(zoom.zoomOut(3), 2);
  assert.strictEqual(zoom.zoomOut(2), 1.5);
  assert.strictEqual(zoom.zoomOut(1.5), 1);
  assert.strictEqual(zoom.zoomOut(1), 1);
});
test('an unknown level is treated as 1x', function () {
  assert.strictEqual(zoom.zoomIn(1.25), 1.5);
  assert.strictEqual(zoom.zoomOut(1.25), 1);
});
test('fitSize letterboxes an image into a box like object-fit: contain', function () {
  assert.deepStrictEqual(zoom.fitSize(1440, 960, 1920, 1080), { w: 1620, h: 1080 });
  assert.deepStrictEqual(zoom.fitSize(1000, 2000, 1920, 1080), { w: 540, h: 1080 });
  assert.deepStrictEqual(zoom.fitSize(0, 0, 1920, 1080), { w: 1920, h: 1080 });
});
test('maxPan is half of what the zoomed image overflows the view', function () {
  assert.deepStrictEqual(zoom.maxPan(1440, 960, 2, 1920, 1080), { x: 480, y: 420 });
  assert.deepStrictEqual(zoom.maxPan(1440, 960, 1, 1920, 1080), { x: 0, y: 0 });
  assert.deepStrictEqual(zoom.maxPan(500, 300, 1.5, 1920, 1080), { x: 0, y: 0 });
});
test('clampPan pulls a pan back inside the limits', function () {
  assert.deepStrictEqual(zoom.clampPan({ x: 9999, y: -9999 }, 1440, 960, 2, 1920, 1080), { x: 480, y: -420 });
  assert.deepStrictEqual(zoom.clampPan({ x: 100, y: 50 }, 1440, 960, 1, 1920, 1080), { x: 0, y: 0 });
});
test('panBy moves by the given amount and clamps', function () {
  assert.deepStrictEqual(zoom.panBy({ x: 0, y: 0 }, -240, 0, 1440, 960, 2, 1920, 1080), { x: -240, y: 0 });
  assert.deepStrictEqual(zoom.panBy({ x: -400, y: 0 }, -240, 0, 1440, 960, 2, 1920, 1080), { x: -480, y: 0 });
});
test('transform builds the css string with rounded pixels', function () {
  assert.strictEqual(zoom.transform(2, { x: -240.4, y: 10.6 }), 'translate(-240px, 11px) scale(2)');
  assert.strictEqual(zoom.transform(1, { x: 0, y: 0 }), 'translate(0px, 0px) scale(1)');
});
test('the shared constants are what the plan promises', function () {
  assert.deepStrictEqual(zoom.LEVELS, [1, 1.5, 2, 3, 4]);
  assert.strictEqual(zoom.PAN_STEP, 240);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/core/zoom.test.js`
Expected: FAIL (`Cannot find module '../../core/zoom'`).

- [ ] **Step 3: Create `core/zoom.js`**

```js
/*
 * zoom.js — pure zoom rules shared by both builds: the zoom steps, how far a
 * zoomed image may be moved, and the CSS transform to apply. No DOM here.
 */
(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  var LEVELS = [1, 1.5, 2, 3, 4];
  var PAN_STEP = 240;                 /* screen pixels moved per arrow press while zoomed */

  function indexOfLevel(level) {
    var i = LEVELS.indexOf(level);
    return i < 0 ? 0 : i;
  }
  function zoomIn(level) { return LEVELS[Math.min(LEVELS.length - 1, indexOfLevel(level) + 1)]; }
  function zoomOut(level) { return LEVELS[Math.max(0, indexOfLevel(level) - 1)]; }
  function cycle(level) {
    var i = indexOfLevel(level) + 1;
    return LEVELS[i >= LEVELS.length ? 0 : i];
  }

  /* Displayed size of an image letterboxed into a box (what object-fit: contain does). */
  function fitSize(natW, natH, boxW, boxH) {
    if (!natW || !natH) { return { w: boxW, h: boxH }; }
    var scale = Math.min(boxW / natW, boxH / natH);
    return { w: Math.round(natW * scale), h: Math.round(natH * scale) };
  }

  /* Farthest the image may be shifted (screen px, per axis) so no empty edge shows. */
  function maxPan(boxW, boxH, level, viewW, viewH) {
    return {
      x: Math.max(0, (boxW * level - viewW) / 2),
      y: Math.max(0, (boxH * level - viewH) / 2)
    };
  }
  function limit(v, max) { return Math.max(-max, Math.min(max, v)); }
  function clampPan(pan, boxW, boxH, level, viewW, viewH) {
    var m = maxPan(boxW, boxH, level, viewW, viewH);
    return { x: limit(pan.x, m.x), y: limit(pan.y, m.y) };
  }
  function panBy(pan, dx, dy, boxW, boxH, level, viewW, viewH) {
    return clampPan({ x: pan.x + dx, y: pan.y + dy }, boxW, boxH, level, viewW, viewH);
  }

  function transform(level, pan) {
    return 'translate(' + Math.round(pan.x) + 'px, ' + Math.round(pan.y) + 'px) scale(' + level + ')';
  }

  var api = {
    LEVELS: LEVELS, PAN_STEP: PAN_STEP,
    zoomIn: zoomIn, zoomOut: zoomOut, cycle: cycle,
    fitSize: fitSize, maxPan: maxPan, clampPan: clampPan, panBy: panBy, transform: transform
  };
  core.zoom = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
```

- [ ] **Step 4: Run the tests and the whole gate**

Run: `node --test tests/core/zoom.test.js && npm test`
Expected: 10 tests pass in the new file, lint clean, `check-es5` OK, everything passes.

- [ ] **Step 5: Commit**

```bash
git add core/zoom.js tests/core/zoom.test.js
git commit -m "Add the shared zoom rules both builds will use" -m "Pure, tested maths for zooming a photo on a TV: the zoom steps (1x to 4x), how far a zoomed photo may be moved so no empty edge shows, the size a photo really has when it is letterboxed on screen, and the CSS transform to apply. It lives in core so the legacy and Enact viewers behave identically instead of each carrying their own copy of the clamping rules." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Legacy viewer zoom (keys)

**Files:**
- Modify: `shell-legacy/js/view-viewer.js` (full replacement below; it is Unit 2's viewer plus zoom)
- Modify: `shell-legacy/css/app.css`

**Interfaces:**
- Consumes: `ImmichCore.zoom` (Task 1: `LEVELS`, `PAN_STEP`, `zoomIn/zoomOut/cycle`, `clampPan`, `panBy`, `transform`); the Unit 2 viewer structure (see "Dependency on Unit 2"). `core/zoom.js` must be loaded in the page **before** `view-viewer.js`.
- Produces: the key scheme in the table above for photos. The counter reads `3 / 40   Zoom 2x` while zoomed. Videos are unaffected (`isVideo()` paths are unchanged). Zoom and pan reset on every `show()` and are applied by setting `img.style.transform`; the reset is not animated. The image box used for the pan limits is the element's laid-out size (`img.offsetWidth/offsetHeight`), which in the legacy CSS is the un-upscaled, ratio-preserving display size.

- [ ] **Step 1: Make sure `core/zoom.js` is loaded**

In `shell-legacy/index.html` add `  <script src="core/zoom.js"></script>` on the line after `core/auth.js`. Run `npm test` (the build test proves every referenced script exists).

- [ ] **Step 2: Replace `shell-legacy/js/view-viewer.js`**

```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom, vm = ui.videomath, zm = w.ImmichCore.zoom;
  var SEEK_SECONDS = 10;
  var VIEW_W = 1920, VIEW_H = 1080;     /* the legacy build always lays out at 1920x1080 */
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
    var assets = [], index = 0, timer = null, level = 1, pan = { x: 0, y: 0 };

    function isVideo() { return assets[index].type === 'VIDEO'; }

    function applyZoom() { img.style.transform = zm.transform(level, pan); }
    function resetZoom() {
      level = 1;
      pan = { x: 0, y: 0 };
      img.style.transition = 'none';
      applyZoom();
      void img.offsetWidth;               /* force a reflow so the reset is not animated */
      img.style.transition = '';
    }
    function setLevel(next) {
      level = next;
      pan = zm.clampPan(pan, img.offsetWidth, img.offsetHeight, level, VIEW_W, VIEW_H);
      applyZoom();
    }
    function movePan(dx, dy) {
      pan = zm.panBy(pan, dx, dy, img.offsetWidth, img.offsetHeight, level, VIEW_W, VIEW_H);
      applyZoom();
    }

    function hudText() {
      return (video.paused ? 'Paused' : 'Playing') + '   ' + vm.formatClock(video.currentTime) + ' / ' +
        vm.formatClock(video.duration) + '   OK play/pause, Up/Down seek';
    }
    function flashInfo() {
      counter.textContent = (index + 1) + ' / ' + assets.length + (level > 1 ? '   Zoom ' + level + 'x' : '');
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
      resetZoom();
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
      leave: function () { clearTimeout(timer); resetZoom(); img.removeAttribute('src'); stopVideo(); },
      snapshot: function () { return null; },
      onKey: function (key) {
        var onVideo = isVideo();
        if (!onVideo && level > 1) {
          /* zoomed in: arrows move the view, OK zooms in further (then wraps to 1x), Back zooms out one step */
          if (key === 'left') { movePan(zm.PAN_STEP, 0); return true; }
          if (key === 'right') { movePan(-zm.PAN_STEP, 0); return true; }
          if (key === 'up') { movePan(0, zm.PAN_STEP); return true; }
          if (key === 'down') { movePan(0, -zm.PAN_STEP); return true; }
          if (key === 'ok') { setLevel(zm.cycle(level)); flashInfo(); return true; }
          if (key === 'back') { setLevel(zm.zoomOut(level)); flashInfo(); return true; }
          return false;
        }
        if (key === 'left') { if (index > 0) { index--; show(); } return true; }
        if (key === 'right') { if (index < assets.length - 1) { index++; show(); } return true; }
        if (onVideo) {
          if (key === 'ok') { if (video.paused) { playSafely(); } else { video.pause(); } flashInfo(); return true; }
          if (key === 'up') { video.currentTime = vm.seekTarget(video.currentTime, SEEK_SECONDS, video.duration); flashInfo(); return true; }
          if (key === 'down') { video.currentTime = vm.seekTarget(video.currentTime, -SEEK_SECONDS, video.duration); flashInfo(); return true; }
        }
        if (key === 'ok' && !onVideo) { setLevel(zm.cycle(level)); flashInfo(); return true; }
        if (key === 'ok' || key === 'up' || key === 'down') { flashInfo(); return true; }
        return false;
      }
    };
  };
}(window));
```
Note the sign convention: pressing **Left** while zoomed moves the *view* left, which means the *image* moves right, so `movePan(+PAN_STEP, 0)`; Right is the opposite; Up/Down likewise.

- [ ] **Step 3: Add the transition to `shell-legacy/css/app.css`**

Append:
```css

.viewer img.viewer-media { transition: transform 0.15s ease; }
```

- [ ] **Step 4: Run the gate**

Run: `npm test`
Expected: everything passes, ES5 gate OK (`void` and `transform`/`transition` are fine on Chromium 38).

- [ ] **Step 5: Manual check (Simulator or `npm run serve:legacy`, real server)**

Open a large photo. Expect:
1. OK: zooms to 1.5x smoothly and the counter briefly reads `... Zoom 1.5x`. OK again: 2x, 3x, 4x, then OK returns to 1x.
2. While zoomed, the arrows move around the photo (Right shows the right part) and stop at the photo's edges without showing empty black borders on the sides that are larger than the screen. Left/Right do **not** change photo while zoomed.
3. Back zooms out one step at a time; at 1x Back leaves the viewer as before. Left/Right change photo again at 1x, and the next photo opens un-zoomed.
4. Leaving the viewer and re-opening a photo starts at 1x. A small panorama or small photo zooms in place without sliding off screen.
5. A video item is not zoomable: OK still plays/pauses.

- [ ] **Step 6: Commit**

```bash
git add shell-legacy/index.html shell-legacy/js/view-viewer.js shell-legacy/css/app.css
git commit -m "Zoom photos with the remote in the legacy viewer" -m "OK zooms in one step (1.5x, 2x, 3x, 4x, then back to normal), Back zooms out one step, and while zoomed the arrows move around the photo without ever showing empty borders where the photo is bigger than the screen. At normal size everything works as before: Left and Right change photo, Back leaves. A new photo always opens un-zoomed, and videos are untouched." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Enact viewer zoom (keys, Magic Remote wheel, drag)

**Files:**
- Modify: `shell-enact/src/services.js`, `shell-enact/src/views/Viewer.js` (full replacement below; it is Unit 2's viewer plus zoom)

**Interfaces:**
- Consumes: `ImmichCore.zoom` (Task 1) through `services.zoom`; the Unit 2 viewer (see "Dependency on Unit 2"). Popup, Spottable and VideoPlayer usage is unchanged from Unit 2.
- Produces: the key scheme in the table above for photos (keys are read from `document` `keydown`, as the existing photo navigation already does), plus **mouse wheel** up = zoom in, down = zoom out (Magic Remote wheel, non-wrapping), and **click-and-drag** to move a zoomed photo (Magic Remote pointer). Back while zoomed zooms out one step instead of closing (done by wrapping the Popup's `onClose`). Zoom and pan reset when the shown item changes or the viewer opens/closes. Displayed image size for the pan limits is computed with `zoom.fitSize(naturalWidth, naturalHeight, offsetWidth, offsetHeight)`, because here the `<img>` fills the whole popup and letterboxes with `object-fit: contain`.

- [ ] **Step 1: Verify the behaviours this task assumes**

```bash
cd /data/projects/immich_webos/shell-enact/node_modules/@enact/sandstone
grep -n "onClose" Popup/Popup.js | head -8       # Popup calls onClose on Back; `open` stays controlled by the parent
grep -n "rest\b\|\.\.\.props\|delete" ../spotlight/Spottable/Spottable.js | head -10   # Spottable forwards other DOM props (onWheel, onMouse*)
```
Expected: `onClose` is invoked on Back/scrim, and the parent keeps control of `open` (so ignoring the close keeps the viewer open); `Spottable` passes unknown DOM props through. If `onWheel`/`onMouse*` are not forwarded, put them on a plain wrapping `div` inside `Photo` instead and note it in the commit body.

- [ ] **Step 2: Wire `core/zoom` into `services.js`**

Add `import './core/zoom';` after the `import './core/auth';` line, and change the export to include `zoom`:
```js
export default {settings, client, auth, paging: core.paging, zoom: core.zoom};
```
(If the export line already carries other keys from other work, only add `zoom: core.zoom`.)

- [ ] **Step 3: Replace `shell-enact/src/views/Viewer.js`**

```js
import {useEffect, useRef, useState} from 'react';
import Popup from '@enact/sandstone/Popup';
import Spottable from '@enact/spotlight/Spottable';
import VideoPlayer from '@enact/sandstone/VideoPlayer';
import {MediaControls} from '@enact/sandstone/MediaPlayer';
import BodyText from '@enact/sandstone/BodyText';
import Button from '@enact/sandstone/Button';
import services from '../services';

const Photo = Spottable('div');
const NO_PAN = {x: 0, y: 0};

const Viewer = ({open, items, index, onIndex, onClose}) => {
	const [videoFailed, setVideoFailed] = useState(false);
	const [level, setLevel] = useState(1);
	const [pan, setPan] = useState(NO_PAN);
	const imgRef = useRef(null);
	const drag = useRef(null);
	const zoom = services.zoom;

	const asset = open && index !== null ? items[index] : null;
	const isVideo = !!asset && asset.type === 'VIDEO';
	const hasPrev = index !== null && index > 0;
	const hasNext = index !== null && index < items.length - 1;

	// Size the photo really occupies (letterboxed inside the full-size <img>) and the view size.
	const measure = () => {
		const el = imgRef.current;
		if (!el) return null;
		return {
			box: zoom.fitSize(el.naturalWidth, el.naturalHeight, el.offsetWidth, el.offsetHeight),
			viewW: window.innerWidth,
			viewH: window.innerHeight
		};
	};
	const applyLevel = (next) => {
		const m = measure();
		setLevel(next);
		setPan((p) => (m ? zoom.clampPan(p, m.box.w, m.box.h, next, m.viewW, m.viewH) : NO_PAN));
	};
	const movePan = (dx, dy) => {
		const m = measure();
		if (!m) return;
		setPan((p) => zoom.panBy(p, dx, dy, m.box.w, m.box.h, level, m.viewW, m.viewH));
	};

	useEffect(() => {
		setVideoFailed(false);
		setLevel(1);
		setPan(NO_PAN);
	}, [index, open]);

	useEffect(() => {
		if (!open || isVideo) return undefined;   // for videos Left/Right belong to the player (seeking)
		const onKey = (e) => {
			if (level > 1) {
				// zoomed in: arrows move the view, OK zooms in further (then wraps to 1x)
				if (e.keyCode === 37) movePan(zoom.PAN_STEP, 0);
				else if (e.keyCode === 39) movePan(-zoom.PAN_STEP, 0);
				else if (e.keyCode === 38) movePan(0, zoom.PAN_STEP);
				else if (e.keyCode === 40) movePan(0, -zoom.PAN_STEP);
				else if (e.keyCode === 13) applyLevel(zoom.cycle(level));
				else return;
				e.preventDefault();
				return;
			}
			if (e.keyCode === 37 && index > 0) onIndex(index - 1);
			else if (e.keyCode === 39 && index < items.length - 1) onIndex(index + 1);
			else if (e.keyCode === 13) applyLevel(zoom.cycle(level));
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, isVideo, index, items, onIndex, level]);

	// Back zooms out one step while zoomed; otherwise it closes the viewer as before.
	const handleClose = () => {
		if (!isVideo && level > 1) {
			applyLevel(zoom.zoomOut(level));
			return;
		}
		onClose();
	};

	return (
		<Popup open={open} onClose={handleClose} position="fullscreen">
			{asset && !isVideo ? (
				<Photo
					style={{width: '100%', height: '100%', overflow: 'hidden'}}
					onWheel={(e) => applyLevel(e.deltaY < 0 ? zoom.zoomIn(level) : zoom.zoomOut(level))}
					onMouseDown={(e) => { if (level > 1) drag.current = {x: e.clientX, y: e.clientY}; }}
					onMouseMove={(e) => {
						if (!drag.current) return;
						movePan(e.clientX - drag.current.x, e.clientY - drag.current.y);
						drag.current = {x: e.clientX, y: e.clientY};
					}}
					onMouseUp={() => { drag.current = null; }}
					onMouseLeave={() => { drag.current = null; }}
				>
					<img
						ref={imgRef}
						alt={asset.name}
						src={services.client.viewerUrl(asset.id)}
						style={{
							width: '100%',
							height: '100%',
							objectFit: 'contain',
							transform: zoom.transform(level, pan),
							transition: 'transform 0.15s ease'
						}}
					/>
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

Run: `ares-launch -s 22 -sp ~/webOS_TV_22_Simulator_1.4.1/webOS_TV_22_Simulator_1.4.1 shell-enact/dist` (adjust the path). Open a large photo. Expect:
1. OK zooms 1.5x, 2x, 3x, 4x, then back to 1x (smooth transition). While zoomed, arrows move around the photo and stop at its edges; Left/Right do not change photo while zoomed.
2. Back zooms out one step at a time and only closes the viewer at 1x.
3. Mouse wheel up zooms in, down zooms out (no wrap); click-and-drag moves a zoomed photo, and it cannot be dragged past the edges.
4. A different photo (Left/Right at 1x) always opens un-zoomed. Videos still play with Sandstone's controls (no zoom on videos).
If Back closes the viewer while zoomed (the Popup ignores the controlled `open`), or the wheel/drag events do not arrive, record it in the commit body and stop for a decision.

- [ ] **Step 6: Commit**

```bash
git add shell-enact/src/services.js shell-enact/src/views/Viewer.js
git commit -m "Zoom photos in the Enact viewer, with remote keys and Magic Remote" -m "Same behaviour as the legacy build: OK zooms in step by step, Back zooms out, the arrows move around a zoomed photo and stop at its edges. On top of that the Magic Remote works: the wheel zooms in and out, and click-and-drag moves the photo. It shares the zoom rules with the legacy build through core, so both stay identical." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Documentation

**Files:**
- Modify: `README.md`, `docs/TESTING.md`

**Interfaces:** none.

- [ ] **Step 1: `README.md`**

Replace the "Remote keys" sentence `In the viewer: Left/Right previous/next photo.` with:
```
In the viewer: Left/Right previous/next item. Photos: OK zooms in (1.5x, 2x, 3x, 4x, then back to normal), Back zooms out one step, and while zoomed the arrows move around the photo. On the Enact build the Magic Remote wheel zooms and click-and-drag moves a zoomed photo. Videos: see below.
```
(Keep whatever Unit 2 wrote about videos; if the sentence differs slightly, keep its video part and add the photo/zoom part.) In the `core/` modules table add a row: `| \`zoom\` | pure zoom rules for the photo viewer: zoom steps, how far a zoomed photo may be moved, and the CSS transform; shared by both builds |`.

- [ ] **Step 2: `docs/TESTING.md`**

At the end of the `## 4. Photos` paragraph append: ` Zoom (photos only): OK zooms in step by step (1.5x, 2x, 3x, 4x, then back to normal); while zoomed the arrows move around the photo and stop at its edges; Back zooms out one step and only leaves the viewer at normal size; a new photo opens un-zoomed. Enact build: mouse wheel zooms, click-and-drag moves the photo.`

- [ ] **Step 3: Verify and commit**

Run: `npm test`
Expected: everything passes.
```bash
git add README.md docs/TESTING.md
git commit -m "Document how zoom works" -m "Adds the zoom keys to the README's list of remote keys, a zoom row to the module table, and zoom checks to the acceptance test guide." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (issue #4 and the design):** zoom in and out while viewing a picture full screen: Tasks 2 (legacy) and 3 (Enact). Both builds: yes. Remote-only operation: Tasks 2-3 (OK / Back / arrows). Magic Remote extras on Enact: Task 3 (wheel, drag). Shared behaviour and one set of tests: Task 1. Photos only and reset on navigation: Tasks 2-3. This intentionally refines the earlier design (Up/Down would only ever have reached one zoom step); the change is recorded in the spec's "Refinements" section.

**Placeholder scan:** no TBD/TODO; every code step shows full code; the two conditional notes (Popup `onClose`, Spottable event forwarding) each state what to check and what to do if it fails.

**Type consistency:** `zoom.zoomIn/zoomOut/cycle(level)`, `fitSize`, `clampPan`, `panBy(pan, dx, dy, boxW, boxH, level, viewW, viewH)`, `transform(level, pan)`, `PAN_STEP` are defined in Task 1 and used with the same names and argument order in Tasks 2 and 3. The pan sign convention (positive x moves the image right) is stated in Task 1 and applied consistently: Left key => `movePan(+PAN_STEP, 0)`.

**Known limits:** no zoom for videos; no double-click/pinch; `PAN_STEP` is a fixed 240 px; in the Enact build the popup size is taken from `window.innerWidth/innerHeight`.
