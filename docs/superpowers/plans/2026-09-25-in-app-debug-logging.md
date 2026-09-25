# In-App Debug Logging (Settings-Controlled) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user switch debug logging on or off in Settings and read the recent log entries on the TV screen, scrolling vertically and horizontally, in both builds.

**Architecture:** `core/debug-log.js` becomes a small in-memory ring buffer (last 200 entries, newest first) that is silent until enabled; its on/off state is persisted by `core/settings.js`. Every existing call site (`core/http.js`, `core/immich-client.js`, `view-album.js`) keeps calling `ImmichCore.debugLog(tag, data)` unchanged. Each shell adds a Settings toggle, a "View logs" entry and a Logs screen. The external log-server workflow from the debugging session is removed.

**Tech Stack:** ES5 (core + legacy shell, Chromium 38), `node --test`, ESLint 9 (`ecmaVersion: 5`), Enact Sandstone (React) for the Enact shell.

**Spec:** `docs/superpowers/specs/2026-09-25-next-features-design.md` (Unit 1 and its "Refinements" section). GitHub issue: https://github.com/rafspiny/immich-webos/issues/3 ("Access logs from settings": show the logs on screen and let the user scroll vertically and horizontally).

**Branch:** `issue-3-access-logs-from-settings`, cut from `feature/first-implementation`.

## Global Constraints

Every task's requirements include these.

- Minimum platform: **webOS TV 3.x = Chromium 38**. `core/` and `shell-legacy/` are hand-written **ES5, no build step**.
- Forbidden in `core/` and `shell-legacy/`: `fetch`, `Array.from`, `Object.assign`, arrow functions, `let`/`const`, template literals, `String.prototype.includes/startsWith/endsWith/repeat/padStart`, `Array.prototype.includes/find/findIndex/fill`, async/await, ES modules, `NodeList.forEach`, CSS variables, CSS Grid, `position: sticky`, `:focus-within`, flex `gap`, CSS `aspect-ratio`/`min()`/`max()`/`clamp()`. `npm test` (ESLint + `tools/check-es5.js` + unit tests) enforces this. Tests under `tests/` are not scanned and may use modern syntax, but keep them simple.
- Module pattern: IIFE that attaches to the `ImmichCore` (core) or `ImmichUI` (legacy shell) namespace and sets `module.exports` under Node.
- Enact code lives in `shell-enact/` (React + `@enact/sandstone`, tabs for indentation). For every Sandstone component or prop used, first **verify it against the installed library** in `shell-enact/node_modules/@enact/sandstone` (grep the component source), and adapt if the plan's code differs.
- Logging must never break the app and must never record secrets (no API key; URLs pass through `redactUrl`).
- Commit messages: informal plain English, a short subject line plus a body explaining why, ending with the trailer line `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Baseline before starting: `npm test` passes on the branch.

## File Structure

```
core/debug-log.js                    rewrite: ring buffer, setEnabled/isEnabled/entries/clear/format/redactUrl
core/settings.js                     add getDebugEnabled / setDebugEnabled (own storage key)
shell-legacy/js/gridmath.js          layout() gets an optional list row height; new clampOffset()
shell-legacy/js/grid.js              createGrid options: rowH, tileClass
shell-legacy/js/view-logs.js         NEW legacy Logs screen (grid in list mode + horizontal scroll)
shell-legacy/js/view-settings.js     refactor to optionRow/actionRow helpers; Debug logging toggle; View logs entry
shell-legacy/js/main.js              register 'logs'; apply the saved on/off state at startup
shell-legacy/index.html              script tag for view-logs.js
shell-legacy/css/app.css             log row styles
shell-enact/src/services.js          import core/debug-log, apply saved state, export debugLog
shell-enact/src/views/LogsView.js    NEW Enact Logs screen (Scroller, both directions)
shell-enact/src/views/SettingsView.js toggle + View logs button
shell-enact/src/App/App.js           register 'logs'
tools/log-server.js                  DELETE
package.json                         drop the debug:log-server script
docs/DEBUG-LOGGING.md, README.md, docs/TESTING.md   updated
tests/core/debug-log.test.js         NEW
tests/core/settings.test.js          extended
tests/legacy/gridmath.test.js        extended
```

---

### Task 1: `core/debug-log` becomes an in-memory ring buffer

**Files:**
- Modify: `core/debug-log.js` (full rewrite)
- Create: `tests/core/debug-log.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (all on the function `ImmichCore.debugLog`, also `module.exports` under Node):
  - `debugLog(tag: string, data: any): void` — records `{ts, tag, text}`; does nothing while disabled.
  - `debugLog.setEnabled(on: boolean): void`, `debugLog.isEnabled(): boolean` (default `false`).
  - `debugLog.entries(): Array<{ts: number, tag: string, text: string}>` — a **copy**, newest first, at most 200.
  - `debugLog.clear(): void`.
  - `debugLog.format(entry): string` — `HH:MM:SS.mmm  tag  text` (local time), safe to pass to `Array.prototype.map`.
  - `debugLog.redactUrl(url: string): string`; the alias `ImmichCore.debugLogRedactUrl` stays (used by `core/http.js`).

- [ ] **Step 1: Write the failing tests**

`tests/core/debug-log.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var debugLog = require('../../core/debug-log');

function reset(on) { debugLog.clear(); debugLog.setEnabled(on); }

// Keep this first: the module starts in its default state.
test('logging is off until something switches it on', function () {
  assert.strictEqual(debugLog.isEnabled(), false);
});
test('nothing is recorded while disabled', function () {
  reset(false);
  debugLog('http', { a: 1 });
  assert.deepStrictEqual(debugLog.entries(), []);
});
test('entries come back newest first with tag and text', function () {
  reset(true);
  debugLog('one', { n: 1 });
  debugLog('two', 'plain');
  var e = debugLog.entries();
  assert.strictEqual(e.length, 2);
  assert.strictEqual(e[0].tag, 'two');
  assert.strictEqual(e[0].text, '"plain"');
  assert.strictEqual(e[1].tag, 'one');
  assert.strictEqual(e[1].text, '{"n":1}');
  assert.strictEqual(typeof e[0].ts, 'number');
});
test('keeps at most 200 entries and drops the oldest', function () {
  reset(true);
  for (var i = 0; i < 250; i++) { debugLog('t', { n: i }); }
  var e = debugLog.entries();
  assert.strictEqual(e.length, 200);
  assert.strictEqual(e[0].text, '{"n":249}');
  assert.strictEqual(e[199].text, '{"n":50}');
});
test('clear empties the buffer', function () {
  reset(true);
  debugLog('t', 1);
  debugLog.clear();
  assert.deepStrictEqual(debugLog.entries(), []);
});
test('entries() is a snapshot that later logging does not change', function () {
  reset(true);
  debugLog('a', 1);
  var snap = debugLog.entries();
  debugLog('b', 2);
  assert.strictEqual(snap.length, 1);
});
test('very long data is truncated', function () {
  reset(true);
  debugLog('big', new Array(5001).join('x'));
  var text = debugLog.entries()[0].text;
  assert.ok(text.length < 2100);
  assert.match(text, /\.\.\.\(truncated\)$/);
});
test('data that cannot be serialized never throws', function () {
  reset(true);
  var loop = {};
  loop.self = loop;
  debugLog('loop', loop);
  assert.strictEqual(debugLog.entries()[0].text, '[unserializable]');
});
test('format renders local time, tag and text on one line', function () {
  var ts = new Date(2026, 8, 25, 13, 5, 9, 7).getTime();
  assert.strictEqual(debugLog.format({ ts: ts, tag: 'http', text: '{"a":1}' }), '13:05:09.007  http  {"a":1}');
});
test('redactUrl hides the api key', function () {
  assert.strictEqual(
    debugLog.redactUrl('https://s/api/assets/1/thumbnail?size=thumbnail&apiKey=SECRET&x=1'),
    'https://s/api/assets/1/thumbnail?size=thumbnail&apiKey=REDACTED&x=1');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/core/debug-log.test.js`
Expected: FAIL (`debugLog is not a function`: the current module exports a plain object).

- [ ] **Step 3: Rewrite `core/debug-log.js`**

```js
/*
 * debug-log.js — in-app debug log.
 *
 * Keeps the last MAX_ENTRIES log lines in memory so a Logs screen can show
 * them on the TV. It is silent until something calls setEnabled(true); the
 * Settings toggle owns that switch (see core/settings.js). Logging can never
 * throw, and callers must never pass secrets (URLs go through redactUrl).
 */
(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  var MAX_ENTRIES = 200;
  var MAX_TEXT = 2000;
  var enabled = false;
  var buffer = [];                    /* oldest first */

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) { s = '0' + s; }
    return s;
  }

  function stringify(data) {
    try {
      var json = JSON.stringify(data);
      return json === undefined ? '' : json;
    } catch (e) { return '[unserializable]'; }
  }

  /* Strip any apiKey=... query value before it is ever logged. */
  function redactUrl(str) {
    return String(str || '').replace(/([?&]apiKey=)[^&]*/i, '$1REDACTED');
  }

  function debugLog(tag, data) {
    if (!enabled) { return; }
    var text = stringify(data);
    if (text.length > MAX_TEXT) { text = text.slice(0, MAX_TEXT) + '...(truncated)'; }
    buffer.push({ ts: Date.now(), tag: String(tag), text: text });
    if (buffer.length > MAX_ENTRIES) { buffer.shift(); }
  }

  debugLog.setEnabled = function (on) { enabled = !!on; };
  debugLog.isEnabled = function () { return enabled; };
  debugLog.entries = function () { return buffer.slice().reverse(); };
  debugLog.clear = function () { buffer = []; };
  debugLog.format = function (entry) {
    var d = new Date(entry.ts);
    var time = pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2) + '.' + pad(d.getMilliseconds(), 3);
    return time + '  ' + entry.tag + '  ' + entry.text;
  };
  debugLog.redactUrl = redactUrl;

  core.debugLog = debugLog;
  core.debugLogRedactUrl = redactUrl;
  if (typeof module !== 'undefined' && module.exports) { module.exports = debugLog; }
}(typeof window !== 'undefined' ? window : global));
```

- [ ] **Step 4: Run the new tests and the whole gate**

Run: `node --test tests/core/debug-log.test.js`
Expected: 10 tests pass, no other output.
Run: `npm test`
Expected: lint clean, `check-es5: N files OK`, every test passes.

- [ ] **Step 5: Commit**

```bash
git add core/debug-log.js tests/core/debug-log.test.js
git commit -m "Turn the debug logger into an in-app log buffer" -m "The logger no longer fires requests at a local log server. It keeps the last 200 entries in memory, newest first, and stays completely silent until something switches it on. That is what an on-screen log viewer needs, and it means debugging works on a real TV with no PC around. The old console echo is gone too, since the Logs screen replaces it. Every existing call site keeps working untouched." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Persist the debug on/off choice in `core/settings`

**Files:**
- Modify: `core/settings.js`
- Modify: `tests/core/settings.test.js`

**Interfaces:**
- Consumes: the file's existing `read`, `write` helpers and `KEYS` object.
- Produces on the object returned by `settings.create(storage)`: `getDebugEnabled(): boolean` (default `false`), `setDebugEnabled(on: boolean): void`. Storage key `immich_debug_enabled`, value `'1'` or `'0'`. It is deliberately **not** part of `getView()`/`saveView()` (view preferences and debugging are unrelated concerns).

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/settings.test.js`:
```js
test('debug logging is off by default and remembers the choice', function () {
  var st = memStorage();
  var s = settings.create(st);
  assert.strictEqual(s.getDebugEnabled(), false);
  s.setDebugEnabled(true);
  assert.strictEqual(s.getDebugEnabled(), true);
  assert.strictEqual(settings.create(st).getDebugEnabled(), true);
  s.setDebugEnabled(false);
  assert.strictEqual(s.getDebugEnabled(), false);
});
test('debug flag ignores junk values and a throwing storage', function () {
  var st = memStorage();
  st.setItem('immich_debug_enabled', 'maybe');
  assert.strictEqual(settings.create(st).getDebugEnabled(), false);
  var bad = { getItem: function () { throw new Error('x'); }, setItem: function () { throw new Error('x'); }, removeItem: function () { throw new Error('x'); } };
  var s = settings.create(bad);
  s.setDebugEnabled(true);
  assert.strictEqual(s.getDebugEnabled(), false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/core/settings.test.js`
Expected: FAIL (`s.getDebugEnabled is not a function`).

- [ ] **Step 3: Implement**

In `core/settings.js`, extend `KEYS` (add a comma after the `history` entry):
```js
    history: 'immich_url_history',
    debug: 'immich_debug_enabled'
  };
```
and replace the end of the returned object (the `addUrlHistory` method) so it also carries the two new methods:
```js
      addUrlHistory: function (url) {
        var list = [url];
        getUrlHistory().forEach(function (u) { if (u !== url) { list.push(u); } });
        write(KEYS.history, JSON.stringify(list.slice(0, MAX_HISTORY)));
      },
      getDebugEnabled: function () { return read(KEYS.debug) === '1'; },
      setDebugEnabled: function (on) { write(KEYS.debug, on ? '1' : '0'); }
    };
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/core/settings.test.js && npm test`
Expected: the settings file passes (8 tests), full gate green.

- [ ] **Step 5: Commit**

```bash
git add core/settings.js tests/core/settings.test.js
git commit -m "Remember whether debug logging is switched on" -m "Adds a separate on/off setting for debug logging, off by default. It lives next to the other settings but has its own storage key, because it has nothing to do with the grid/list preferences." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Let the legacy grid draw compact rows and let lists scroll sideways

The Logs screen wants one thin line per entry, not the 132 px rows the album list uses, plus a horizontal offset that Left/Right can clamp. Both are small, general additions to the existing grid helpers.

**Files:**
- Modify: `shell-legacy/js/gridmath.js`
- Modify: `shell-legacy/js/grid.js`
- Modify: `tests/legacy/gridmath.test.js`

**Interfaces:**
- Consumes: the existing `ui.gridmath.layout(mode, columns, width, captionH)` and `ui.createGrid(opts)`.
- Produces:
  - `ui.gridmath.layout(mode, columns, width, captionH, listRowH)` — new optional 5th argument; in `'list'` mode `cellH` is `listRowH || 132` (unchanged default).
  - `ui.gridmath.clampOffset(offset, delta, max): number` — `offset + delta` limited to `0..max`.
  - `ui.createGrid` options `rowH` (number, passed to `layout`) and `tileClass` (string, appended to every tile's class list).

- [ ] **Step 1: Write the failing tests**

Append to `tests/legacy/gridmath.test.js`:
```js
test('layout accepts a custom list row height', function () {
  assert.deepStrictEqual(g.layout('list', 1, 1860, 0, 40), { cols: 1, cellW: 1860, cellH: 40 });
  assert.deepStrictEqual(g.layout('list', 1, 1860, 0), { cols: 1, cellW: 1860, cellH: 132 });
});
test('clampOffset keeps a horizontal scroll inside 0..max', function () {
  assert.strictEqual(g.clampOffset(0, 240, 1000), 240);
  assert.strictEqual(g.clampOffset(900, 240, 1000), 1000);
  assert.strictEqual(g.clampOffset(100, -240, 1000), 0);
  assert.strictEqual(g.clampOffset(0, 240, 0), 0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/legacy/gridmath.test.js`
Expected: FAIL (`g.layout(...)` returns `cellH: 132` for the custom height; `g.clampOffset is not a function`).

- [ ] **Step 3: Implement in `gridmath.js`**

Replace the head of `layout`:
```js
  function layout(mode, columns, width, captionH, listRowH) {
    if (mode === 'list') { return { cols: 1, cellW: width, cellH: listRowH || 132 }; }
```
Add next to `stepValue`:
```js
  function clampOffset(offset, delta, max) {
    return Math.min(max, Math.max(0, offset + delta));
  }
```
and add `clampOffset: clampOffset` to the exported `api` object.

- [ ] **Step 4: Implement in `grid.js`**

Replace every `g.layout(mode, columns, host.clientWidth, opts.captionH || 0)` with `g.layout(mode, columns, host.clientWidth, opts.captionH || 0, opts.rowH)` (three places: initial `lay`, `relayout`, and the `else` branch of `setView`). Check: `grep -c "opts.rowH" shell-legacy/js/grid.js` prints `3`.

In `addTile`, replace the first line with:
```js
      var t = dom.el('div', 'tile' + (mode === 'list' ? ' list' : '') + (opts.tileClass ? ' ' + opts.tileClass : ''));
```

- [ ] **Step 5: Run the gate**

Run: `npm test`
Expected: everything passes (the two new gridmath tests included), ES5 gate OK.

- [ ] **Step 6: Commit**

```bash
git add shell-legacy/js/gridmath.js shell-legacy/js/grid.js tests/legacy/gridmath.test.js
git commit -m "Let the grid draw thin rows and lists scroll sideways" -m "Small, general additions the log screen needs: a custom row height for list mode, an extra CSS class on tiles, and a helper that keeps a horizontal scroll offset inside its limits. Album screens behave exactly as before." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Legacy Logs screen (vertical + horizontal scrolling)

**Files:**
- Create: `shell-legacy/js/view-logs.js`
- Modify: `shell-legacy/css/app.css`, `shell-legacy/index.html`, `shell-legacy/js/main.js`

**Interfaces:**
- Consumes: `ImmichCore.debugLog.{entries,format,isEnabled,clear}` (Task 1); `ui.createGrid` with `rowH`/`tileClass` and `ui.gridmath.clampOffset` (Task 3); `ui.dom`, `ui.nav`; `ctx.app.back()`.
- Produces: `ui.createLogsView(ctx)`, a router view (`{el, enter, leave, onKey, snapshot}`) registered as `'logs'`. Behaviour: one log line per row, newest first. Up/Down move between rows (the grid scrolls vertically), Left/Right scroll **every** line sideways by 240 px (clamped to the longest line), Up from the first row goes to the top bar (Back / Refresh / Clear), Back leaves.

- [ ] **Step 1: Create `shell-legacy/js/view-logs.js`**

```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom, g = ui.gridmath;
  var H_STEP = 240;     /* pixels scrolled sideways per Left/Right press */
  var TEXT_PAD = 44;    /* tile padding + borders + row padding around the text */

  ui.createLogsView = function (ctx) {
    var debugLog = w.ImmichCore.debugLog;
    var el = dom.el('div', 'view');
    document.getElementById('root').appendChild(el);
    var bar = dom.el('div', 'topbar');
    var backBtn = dom.el('div', 'btn focusable', 'Back');
    var refreshBtn = dom.el('div', 'btn focusable', 'Refresh');
    var clearBtn = dom.el('div', 'btn focusable', 'Clear');
    bar.appendChild(backBtn);
    bar.appendChild(dom.el('div', 'title', 'Logs'));
    bar.appendChild(refreshBtn);
    bar.appendChild(clearBtn);
    var msg = dom.el('div', 'msg hidden');
    var host = dom.el('div', 'grid-host');
    var ruler = dom.el('span', 'log-text log-ruler');   /* hidden: measures the longest line */
    [bar, msg, host, ruler].forEach(function (n) { el.appendChild(n); });

    var zone = 'grid', lines = [], hOffset = 0, hMax = 0;

    var grid = ui.createGrid({
      host: host,
      rowH: 40,
      tileClass: 'log-tile',
      renderTile: function (line) {
        var body = dom.el('div', 'tile-body log-row');
        var text = dom.el('span', 'log-text', line);
        text.style.marginLeft = (-hOffset) + 'px';
        body.appendChild(text);
        return body;
      },
      onSelect: function () {}
    });

    function showMsg(text) { msg.textContent = text; msg.className = 'msg'; }
    function toBar() { zone = 'bar'; grid.blur(); ui.nav.focusFirst(bar); }
    function applyOffset() {
      var els = host.getElementsByClassName('log-text');
      var i;
      for (i = 0; i < els.length; i++) { els[i].style.marginLeft = (-hOffset) + 'px'; }
    }
    function measureLongest() {
      var longest = '', i;
      for (i = 0; i < lines.length; i++) { if (lines[i].length > longest.length) { longest = lines[i]; } }
      ruler.textContent = longest;
      hMax = Math.max(0, ruler.offsetWidth - (host.clientWidth - TEXT_PAD));
    }
    function reload(stayOnBar) {
      lines = debugLog.entries().map(debugLog.format);
      hOffset = 0;
      dom.hide(msg);
      grid.setView('list', 1);
      grid.setItems(lines);
      measureLongest();
      if (!lines.length) {
        showMsg(debugLog.isEnabled()
          ? 'No log entries yet. Use the app, then come back.'
          : 'Logging is off. Turn on "Debug logging" in Settings, use the app, then come back.');
        dom.show(msg);
        toBar();
        return;
      }
      if (stayOnBar) { return; }
      zone = 'grid';
      ui.nav.clearFocus();
      grid.focus(0);
    }

    backBtn.onclick = function () { ctx.app.back(); };
    refreshBtn.onclick = function () { reload(true); };
    clearBtn.onclick = function () { debugLog.clear(); reload(true); };

    return {
      el: el,
      enter: function () { reload(false); },
      leave: function () { grid.blur(); ui.nav.clearFocus(); },
      snapshot: function () { return null; },
      onKey: function (key) {
        if (zone === 'grid') {
          if (key === 'left' || key === 'right') {
            hOffset = g.clampOffset(hOffset, key === 'left' ? -H_STEP : H_STEP, hMax);
            applyOffset();
            return true;
          }
          var r = grid.handleKey(key);
          if (r === 'edge') { toBar(); return true; }
          return !!r;
        }
        if (key === 'down' && lines.length) { zone = 'grid'; ui.nav.clearFocus(); grid.focus(); return true; }
        if (key === 'ok') { var cur = ui.nav.current(); if (cur) { cur.onclick(); } return true; }
        if (key === 'left' || key === 'right') { ui.nav.move(key, bar); return true; }
        return key === 'up' || key === 'down';
      }
    };
  };
}(window));
```

- [ ] **Step 2: Append the styles to `shell-legacy/css/app.css`**

```css

.log-tile { padding: 2px 8px; }
.log-tile .tile-body { border-width: 2px; }
.log-row { padding: 0 12px; font-family: monospace; font-size: 22px; line-height: 32px; white-space: nowrap; overflow: hidden; }
.log-text { display: inline-block; white-space: pre; }
.log-ruler { position: absolute; left: -99999px; top: 0; visibility: hidden; font-family: monospace; font-size: 22px; }
```

- [ ] **Step 3: Wire the script and the view**

`shell-legacy/index.html`: add `  <script src="js/view-logs.js"></script>` on the line after `js/view-settings.js` (before `js/app.js`).
`shell-legacy/js/main.js`: add after the `'settings'` registration:
```js
  ui.app.register('logs', ui.createLogsView(ctx));
```

- [ ] **Step 4: Run the gate**

Run: `npm test`
Expected: everything passes. The build test asserts every script tag in `index.html` exists in `dist/legacy`, so a typo in the tag fails here. The visual check of this screen happens at the end of Task 5, once Settings can open it.

- [ ] **Step 5: Commit**

```bash
git add shell-legacy/js/view-logs.js shell-legacy/css/app.css shell-legacy/index.html shell-legacy/js/main.js
git commit -m "Add a Logs screen to the legacy build" -m "Shows the recent log entries one per line, newest first. Up and Down move between entries and scroll the list, Left and Right slide every line sideways so long lines can be read in full. There are Refresh and Clear buttons in the top bar, and a hint when logging is off or nothing has been recorded yet. It is not reachable from Settings yet; that comes next." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Legacy Settings: Debug logging toggle and "View logs"

**Files:**
- Modify: `shell-legacy/js/view-settings.js` (full rewrite, same behaviour plus two rows)
- Modify: `shell-legacy/js/main.js`

**Interfaces:**
- Consumes: `ctx.settings.{getView,saveView,getDebugEnabled,setDebugEnabled}` (Task 2); `ImmichCore.debugLog.setEnabled` (Task 1); the `'logs'` view (Task 4); `ui.gridmath.stepValue`.
- Produces: inside `view-settings.js` two small private helpers that later units reuse: `optionRow(label, getText, onStep)` (a `btn focusable option` row showing `<  value  >`; returns the element with `.render()` and `.step(delta)`; it is also pushed onto the `rowEls` array that `enter()` re-renders) and `actionRow(label, onClick)` (a plain row whose `onclick` runs on OK).

- [ ] **Step 1: Rewrite `shell-legacy/js/view-settings.js`**

```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  var VIEW_ROWS = [
    { label: 'Layout', key: 'viewMode', values: ['grid', 'list'], names: { grid: 'Grid', list: 'List' } },
    { label: 'Columns per row (grid layout)', key: 'columns', values: [3, 4, 5, 6, 7, 8], names: null },
    { label: 'Photo size', key: 'thumbSize', values: ['thumbnail', 'preview'], names: { thumbnail: 'Small (faster)', preview: 'Large (sharper)' } }
  ];

  ui.createSettingsView = function (ctx) {
    var el = dom.el('div', 'view');
    document.getElementById('root').appendChild(el);
    var bar = dom.el('div', 'topbar');
    var backBtn = dom.el('div', 'btn focusable', 'Back');
    bar.appendChild(backBtn);
    bar.appendChild(dom.el('div', 'title', 'Settings'));
    el.appendChild(bar);
    var current = ctx.settings.getView();
    var rowEls = [];

    /* A "<  value  >" row: Left/Right (or OK) call onStep(delta); getText() supplies the shown value. */
    function optionRow(label, getText, onStep) {
      var r = dom.el('div', 'btn focusable option');
      var value = dom.el('span');
      r.appendChild(dom.el('span', '', label));
      r.appendChild(value);
      r.render = function () { value.textContent = '<  ' + getText() + '  >'; };
      r.step = function (delta) { onStep(delta); r.render(); };
      el.appendChild(r);
      rowEls.push(r);
      return r;
    }

    /* A plain row: OK runs onClick. */
    function actionRow(label, onClick) {
      var r = dom.el('div', 'btn focusable option', label);
      r.onclick = onClick;
      el.appendChild(r);
      return r;
    }

    VIEW_ROWS.forEach(function (row) {
      optionRow(row.label,
        function () { var v = current[row.key]; return row.names ? row.names[v] : v; },
        function (delta) {
          current[row.key] = ui.gridmath.stepValue(row.values, current[row.key], delta);
          ctx.settings.saveView(current);
        });
    });

    optionRow('Debug logging',
      function () { return ctx.settings.getDebugEnabled() ? 'On' : 'Off'; },
      function () {
        var on = !ctx.settings.getDebugEnabled();
        ctx.settings.setDebugEnabled(on);
        w.ImmichCore.debugLog.setEnabled(on);
      });
    actionRow('View logs', function () { ctx.app.go('logs'); });
    actionRow('Sign out and forget the server', function () { ctx.auth.signOut(); ctx.app.reset('setup'); });

    backBtn.onclick = function () { ctx.app.back(); };

    return {
      el: el,
      enter: function () {
        current = ctx.settings.getView();
        rowEls.forEach(function (r) { r.render(); });
        ui.nav.focusFirst(bar);
      },
      leave: function () {},
      snapshot: function () { return null; },
      onKey: function (key) {
        var cur = ui.nav.current();
        if ((key === 'left' || key === 'right') && cur && cur.step) { cur.step(key === 'left' ? -1 : 1); return true; }
        if (key === 'ok' && cur) { if (cur.step) { cur.step(1); } else { cur.onclick(); } return true; }
        if (key === 'back') { return false; }
        ui.nav.move(key, el);
        return true;
      }
    };
  };
}(window));
```

- [ ] **Step 2: Apply the saved choice at startup**

In `shell-legacy/js/main.js`, right after `var settings = core.settings.create(core.settings.defaultStorage());` add:
```js
  core.debugLog.setEnabled(settings.getDebugEnabled());
```

- [ ] **Step 3: Run the gate**

Run: `npm test`
Expected: everything passes.

- [ ] **Step 4: Check it in a browser (no Immich server needed)**

Run: `npm run serve:legacy`, open http://localhost:8080 with DevTools. In the console run
`localStorage.setItem('immich_server_url','http://127.0.0.1:1'); localStorage.setItem('immich_api_key','x');` and reload. The app opens on Albums and shows a "Cannot reach the server" error, but the top bar still has **Settings**.
Expected, using the arrow keys, Enter and Esc:
1. Settings shows six rows; **Debug logging** reads `<  Off  >`. Left/Right or Enter flips it to `On`; reload the page: it stays `On`.
2. Back to Albums (it retries the request and logs an `http` entry with `"error":"network"`), then Settings > **View logs**: one line, newest first.
3. Press Right: the line slides left only if it is longer than the screen; use the console `ImmichCore.debugLog('long', new Array(400).join('abcdefghij'))` then Refresh to get a very long line and confirm Right/Left scroll it and stop at both ends. Log 30 more entries the same way and confirm Down scrolls the list vertically.
4. **Clear** empties the list and shows the "No log entries yet" message. With Debug logging `Off` the message says logging is off.
5. Back returns to Settings.

- [ ] **Step 5: Commit**

```bash
git add shell-legacy/js/view-settings.js shell-legacy/js/main.js
git commit -m "Add a Debug logging switch and a View logs entry to Settings" -m "Settings now has a Debug logging toggle (off by default, remembered between runs) and a View logs row that opens the new Logs screen. The rows are built by two small helpers instead of one hard-coded loop, which also makes it easy to add more rows later. The saved choice is applied as soon as the app starts." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Enact build: Settings toggle, Logs screen (both scroll directions)

Until now the Enact build never imported `core/debug-log.js`, so it logged nothing at all. This task fixes that and adds the same feature as the legacy build.

**Files:**
- Modify: `shell-enact/src/services.js`, `shell-enact/src/views/SettingsView.js`, `shell-enact/src/App/App.js`
- Create: `shell-enact/src/views/LogsView.js`

**Interfaces:**
- Consumes: `ImmichCore.debugLog` and `settings.{getDebugEnabled,setDebugEnabled}` (Tasks 1-2, delivered to the Enact bundle by `npm run sync:core`, which the pack scripts run).
- Produces: `services.debugLog` (the `ImmichCore.debugLog` function) for views; a `'logs'` entry in the `VIEWS` map so `nav.push('logs')` works.

- [ ] **Step 1: Verify the Sandstone APIs against the installed library**

Run and read the output:
```bash
cd /data/projects/immich_webos/shell-enact/node_modules/@enact/sandstone
grep -n "direction:\|focusableScrollbar:\|horizontalScrollbar:\|verticalScrollbar:" Scroller/Scroller.js | head
grep -n "scaleToRem" ../ui/resolution/resolution.js | head -3
grep -n "onToggle" SwitchItem/SwitchItem.js | head -3
```
Expected: `Scroller` has `direction` (`'both'|'horizontal'|'vertical'`), `focusableScrollbar` (`bool|'byEnter'`), `horizontalScrollbar`/`verticalScrollbar`; `ri.scaleToRem` exists; `SwitchItem` has `onToggle`. If anything differs, adapt Steps 3-4 and note it in the commit body.

- [ ] **Step 2: Wire the logger into `services.js`**

Replace the file with:
```js
import './core/debug-log';
import './core/http';
import './core/settings';
import './core/paging';
import './core/immich-client';
import './core/auth';

const core = window.ImmichCore;
const settings = core.settings.create(core.settings.defaultStorage());
core.debugLog.setEnabled(settings.getDebugEnabled());
const client = core.immichClient.create({http: core.http, getConfig: settings.getCredentials});
const auth = core.auth.create({client, settings});

export default {settings, client, auth, paging: core.paging, debugLog: core.debugLog};
```

- [ ] **Step 3: Create `shell-enact/src/views/LogsView.js`**

Rows are spottable so the remote can move between them (vertical scrolling), the scroller is `direction="both"` with a focusable scrollbar so long lines can be scrolled sideways, and rows never wrap.
```js
import {useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import Button from '@enact/sandstone/Button';
import BodyText from '@enact/sandstone/BodyText';
import Scroller from '@enact/sandstone/Scroller';
import Spottable from '@enact/spotlight/Spottable';
import ri from '@enact/ui/resolution';
import services from '../services';

const Row = Spottable('div');

const readLines = () => services.debugLog.entries().map(services.debugLog.format);

const LogsView = ({nav, params, ...rest}) => {
	const [lines, setLines] = useState(readLines);
	const reload = () => setLines(readLines());
	const clear = () => { services.debugLog.clear(); reload(); };
	const rowStyle = {whiteSpace: 'pre', fontFamily: 'monospace', fontSize: ri.scaleToRem(24), padding: '0 12px'};

	return (
		<Panel {...rest}>
			<Header title="Logs">
				<slotAfter>
					<Button onClick={reload}>Refresh</Button>
					<Button onClick={clear}>Clear</Button>
				</slotAfter>
			</Header>
			{lines.length === 0 ? (
				<BodyText>
					{services.debugLog.isEnabled()
						? 'No log entries yet. Use the app, then come back.'
						: 'Logging is off. Turn on "Debug logging" in Settings, use the app, then come back.'}
				</BodyText>
			) : (
				<Scroller direction="both" focusableScrollbar>
					<div style={{display: 'inline-block', minWidth: '100%'}}>
						{lines.map((line, i) => <Row key={i} style={rowStyle}>{line}</Row>)}
					</div>
				</Scroller>
			)}
		</Panel>
	);
};

export default LogsView;
```

- [ ] **Step 4: Settings toggle and "View logs" button**

In `shell-enact/src/views/SettingsView.js` add a state line next to the existing `view` state:
```js
	const [debugOn, setDebugOn] = useState(services.settings.getDebugEnabled());
```
and, just above the **Sign out** `Button`, add:
```js
			<SwitchItem
				selected={debugOn}
				onToggle={({selected}) => {
					services.settings.setDebugEnabled(selected);
					services.debugLog.setEnabled(selected);
					setDebugOn(selected);
				}}
			>
				Debug logging
			</SwitchItem>
			<Button onClick={() => nav.push('logs')}>View logs</Button>
```

- [ ] **Step 5: Register the view**

In `shell-enact/src/App/App.js` add `import LogsView from '../views/LogsView';` and change the map to:
```js
const VIEWS = {setup: SetupView, albums: AlbumsView, album: AlbumView, settings: SettingsView, logs: LogsView};
```

- [ ] **Step 6: Build**

Run: `cd /data/projects/immich_webos && npm test && npm --prefix shell-enact run pack`
Expected: root gate green; `Compiled successfully`, `shell-enact/dist/` produced.

- [ ] **Step 7: Check it in the Simulator**

Run: `ares-launch -s 22 -sp ~/webOS_TV_22_Simulator_1.4.1/webOS_TV_22_Simulator_1.4.1 shell-enact/dist` (adjust the path to your Simulator folder), sign in, then:
1. Settings > **Debug logging** on; back to Albums, open an album; Settings > **View logs**: entries such as `http` and `searchPage`, newest first.
2. With the remote (Simulator arrows/Enter): Up/Down move between lines and scroll the list. **Long lines can be scrolled sideways** (move focus to the horizontal scrollbar, or Left/Right on a row). If neither works, switch the `Scroller` to `focusableScrollbar="byEnter"` or make rows non-spottable and rely on the focusable scrollbars; the requirement is only that both directions are reachable with the remote alone. Record which variant was needed in the commit body.
3. **Clear** empties the list; **Refresh** reloads it. Turn logging off, use the app: nothing new appears. Close and reopen the app: the toggle keeps its state.

- [ ] **Step 8: Commit**

```bash
git add shell-enact/src/services.js shell-enact/src/views/LogsView.js shell-enact/src/views/SettingsView.js shell-enact/src/App/App.js
git commit -m "Add the Debug logging switch and Logs screen to the Enact build" -m "Same feature as the legacy build: a Debug logging toggle in Settings, a View logs button, and a Logs screen you can scroll up and down and sideways. The Enact build never actually loaded the logger before, so it was silently logging nothing; that is fixed too." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Remove the external log server and update the docs

**Files:**
- Delete: `tools/log-server.js`
- Modify: `package.json`, `README.md`, `docs/TESTING.md`
- Rewrite: `docs/DEBUG-LOGGING.md`

**Interfaces:** none (documentation and cleanup).

- [ ] **Step 1: Delete the old tool and its script**

```bash
git rm tools/log-server.js
```
In `package.json`, delete the line `"debug:log-server": "node tools/log-server.js"` and remove the trailing comma from the `"sync:core": "node tools/sync-core.js"` line above it so the JSON stays valid. Check: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` prints nothing.

- [ ] **Step 2: Rewrite `docs/DEBUG-LOGGING.md`**

```markdown
# Debug logging

The app can keep a short log of what it is doing (requests and their results, plus a few key events) so problems can be diagnosed on the TV itself, without a PC.

## Turn it on and read it

1. Albums > Settings > **Debug logging** > On. It is off by default and the choice is remembered.
2. Use the app as normal (open an album, scroll, ...).
3. Settings > **View logs**. The newest entries are at the top, one per line.
   - Legacy build: Up/Down move between entries; Left/Right slide every line sideways so long lines can be read in full.
   - Enact build: Up/Down move between lines; use the horizontal scrollbar (or Left/Right) to scroll sideways.
   - **Refresh** loads entries recorded since you opened the screen; **Clear** empties the list.

## What is logged

- Every request to Immich: method, URL (with `apiKey=` replaced by `REDACTED`), HTTP status, size and a short preview of the reply, or the error (`network`, `timeout`).
- One-line summaries when albums and photo pages load, and what the album screen decided to show.

## Good to know

- Only the last 200 entries are kept, in memory: closing the app clears them.
- The API key is never logged.
- While logging is off, nothing is recorded.
- For developers: call `ImmichCore.debugLog(tag, data)`; in modules that may load without it, guard with `if (core.debugLog) { ... }`. Data is serialized to JSON and truncated at 2000 characters.
- The earlier `tools/log-server.js` / `tail -f build/webos-debug.log` workflow has been removed; the Logs screen replaces it. For live desktop debugging use the browser DevTools (`npm run serve:legacy`) or `ares-inspect`.
```

- [ ] **Step 3: Update `README.md`**

In the `core/` modules table add a row after the `auth` row:
```
| `debug-log` | optional in-app log: the last 200 entries in memory, switched on in Settings and read on the Logs screen; never records the API key |
```
Change the `Debug:` line (just before "The Developer Mode session expires...") to end with: ` In-app: Settings > Debug logging, then Settings > View logs (see [docs/DEBUG-LOGGING.md](docs/DEBUG-LOGGING.md)).`

- [ ] **Step 4: Add a manual test step to `docs/TESTING.md`**

Insert before the `## Report template` heading:
```markdown
## 9. Debug logs (both builds)
Albums > Settings: set **Debug logging** to On. Go back, open an album, then Settings > **View logs**.
Expect: entries such as `http` (status, size) and `searchPage` (item counts), newest first. Up/Down move between entries; long lines scroll sideways (Left/Right on the legacy build, the horizontal scrollbar on Enact). **Clear** empties the list. Set Debug logging to Off, use the app, open View logs again: nothing new is recorded. Close and reopen the app: the On/Off choice is kept.

```
and add this line at the end of the report template: `Logs (Settings > View logs, with Debug logging On):`.

- [ ] **Step 5: Verify nothing still refers to the removed tool**

Run: `grep -rn "log-server\|debug:log-server\|webos-debug.log" --include=*.md --include=*.json --include=*.js . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=superpowers`
Expected: only the historical sentence in `docs/DEBUG-LOGGING.md` matches. Then `npm test` passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Drop the external log server; document the in-app logs" -m "The Logs screen does the job the tail-a-file workflow did, and works on a real TV, so the small Node log server and its npm script go away. The debugging doc is rewritten for the new flow, and the README and the acceptance test guide mention the switch and the screen." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (issue #3 and the design):** a Settings switch that decides whether to log: Tasks 2, 5, 6. Logs visible in the app's Settings area: Tasks 4, 6 ("View logs"). Scroll vertically **and horizontally**: Task 4 (row focus + Left/Right offset), Task 6 (`Scroller direction="both"`). Both builds: Tasks 4-5 (legacy), 6 (Enact). Replace the external server: Task 7. Default off: Tasks 1-2. Existing call sites unchanged: nothing in `core/http.js`, `core/immich-client.js`, `view-album.js` is touched. Enact logging fixed (service import): Task 6 Step 2.

**Placeholder scan:** no TBD/TODO; every code step shows code; the only conditional wording is in Task 6 Step 7, where the acceptance criterion and the two fallbacks are stated.

**Type consistency:** `debugLog.entries()` returns `{ts, tag, text}`, consumed by `debugLog.format(entry)` (Tasks 1, 4, 6); `getDebugEnabled/setDebugEnabled` (Task 2) are used by Tasks 5 and 6 with the same names; `optionRow(label, getText, onStep)` and `actionRow(label, onClick)` (Task 5) keep the signatures that later units rely on; `ui.gridmath.clampOffset(offset, delta, max)` and `createGrid` options `rowH`/`tileClass` (Task 3) are used by Task 4 with the same names.

**Known limits:** entries live in memory only (cleared when the app closes); the legacy horizontal scroll moves all lines together by a fixed 240 px step.
