# Immich webOS TV App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A webOS TV web app that browses Immich albums and photos with a remote only, running on webOS TV 3.x (Chromium 38) and up, built as two shells over one shared core.

**Architecture:** `core/` (ES5, no DOM) holds HTTP (XHR), settings, paging, the Immich client and auth. `shell-legacy/` is plain ES5 + flexbox with its own D-pad focus manager, virtualized grid and on-screen keyboard (webOS 3.x+). `shell-enact/` is Enact Sandstone (webOS 5+). Both shells call the same core; a copy script feeds `core/` into the Enact bundle.

**Tech Stack:** ES5 JavaScript, `node --test`, ESLint 9 (`ecmaVersion: 5`), a custom Chromium-38 API gate, webOS CLI (`ares-*`), Enact CLI + Sandstone (Enact shell only).

**Spec:** `docs/superpowers/specs/2026-09-18-immich-webos-tv-design.md` (rev 2)

## Global Constraints

Every task's requirements include these (copied from the spec):

- Minimum platform: **webOS TV 3.x = Chromium 38**. `core/` and `shell-legacy/` must be hand-written **ES5, no build step**.
- Forbidden in `core/` and `shell-legacy/`: `fetch`, `Array.from`, `Object.assign`, arrow functions, `let`/`const`, `String.prototype.includes/startsWith/endsWith`, `Array.prototype.includes/find/findIndex/fill`, async/await, native ES modules, `NodeList.forEach`, CSS variables, CSS Grid, `position: sticky`, `:focus-within`, flex `gap`.
- Allowed: `Promise`, `XMLHttpRequest`, unprefixed flexbox, `transform`, `object-fit`, `classList`, `dataset`.
- Two apps: `com.immich.webos` (legacy, webOS 3.x+) and `com.immich.webos.enact` (Sandstone, webOS 5+). `appinfo.json` schema-strict, icons 80x80 and 130x130, resolution 1920x1080.
- Sign-in is **server URL + API key only**. No username/password, QR pairing, search, map or people in this iteration.
- Scope: albums and photos. View settings: grid or list, columns 3-8, thumbnail size, persisted.
- Enact applies only to `shell-enact/`. The Simulator offers only webOS TV 6.0 and 22-26, so 3.x is verified on a real TV.
- Commits end with: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

## Assumptions to verify early (flagged, not guessed)

- Immich accepts the API key as query param `apiKey` on media URLs (`<img src>` cannot send headers). The prototype used `key=`, which is the *shared-link* param and likely wrong. Verified in Task 6.
- Endpoints: `GET /api/users/me`, `GET /api/albums`, `GET /api/albums/{id}`, `POST /api/search/metadata` (`{page,size,order,type}` -> `{assets:{items,nextPage}}`), `GET /api/assets/{id}/thumbnail?size=thumbnail|preview`. The prototype's `GET /api/assets?page=` is deprecated in current Immich. Verified in Task 6.
- Packaged webOS apps run from `file://`, so XHR requests carry `Origin: null`. The server must answer CORS for that. Verified in Task 6.

## File Structure

```
package.json, eslint.config.js, .gitignore
core/                  http.js settings.js paging.js immich-client.js auth.js
shell-legacy/          index.html appinfo.json icon.png largeIcon.png css/app.css
  js/                  dom.js nav.js gridmath.js grid.js keyboard-model.js keyboard.js
                       view-setup.js view-albums.js view-album.js view-viewer.js view-settings.js app.js main.js
shell-enact/           (created by enact CLI) src/core/ (generated copy), src/views/*.js, resources/appinfo.json
tools/                 check-es5.js build-legacy.js sync-core.js make-icons.js probe/
tests/                 core/*.test.js  legacy/*.test.js  tools/*.test.js  helpers.js
docs/                  TESTING.md   README.md (root)
```

Module pattern (all `core/` and `shell-legacy/js/` files): an IIFE attaching to a namespace (`ImmichCore` or `ImmichUI`), plus `module.exports` when running under Node so `node --test` can load it. Dependencies resolve as `core.x || require('./x')`, which short-circuits in the browser and is a static require for webpack.

---

### Task 1: Device probe app (confirms the real engine)

**Files:**
- Create: `tools/probe/index.html`, `tools/probe/appinfo.json`, `tools/probe/icon.png`, `tools/probe/largeIcon.png` (copied from repo root placeholders)
- Modify: `package.json` (created in Task 2; script added there)

**Interfaces:**
- Produces: a packageable app `com.immich.webos.probe` that prints `navigator.userAgent` and a feature table. Its output is pasted into `docs/TESTING.md` results and settles the Chromium baseline.

- [ ] **Step 1: Create the probe page**

`tools/probe/index.html`:
```html
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=1920">
<title>Probe</title>
<style>body{background:#111;color:#eee;font:28px sans-serif;margin:40px}td{padding:4px 24px}.ok{color:#6c6}.no{color:#e66}</style>
</head><body>
<h1>webOS engine probe</h1>
<pre id="ua"></pre>
<table id="t"></table>
<script>
(function () {
  document.getElementById('ua').textContent = navigator.userAgent;
  var css = document.createElement('div').style;
  function cssOk(prop, val) { css.cssText = ''; css[prop] = val; return css[prop] === val; }
  var tests = [
    ['Promise', typeof Promise === 'function'],
    ['XMLHttpRequest', typeof XMLHttpRequest === 'function'],
    ['fetch', typeof fetch === 'function'],
    ['Array.from', typeof Array.from === 'function'],
    ['Object.assign', typeof Object.assign === 'function'],
    ['String.includes', typeof String.prototype.includes === 'function'],
    ['NodeList.forEach', typeof NodeList.prototype.forEach === 'function'],
    ['flex (unprefixed)', cssOk('display', 'flex')],
    ['CSS grid', cssOk('display', 'grid')],
    ['CSS variables', !!(window.CSS && CSS.supports && CSS.supports('--a', '0'))],
    ['object-fit', 'objectFit' in document.body.style],
    ['position: sticky', cssOk('position', 'sticky')],
    ['WebP <img>', true]
  ];
  var rows = '';
  for (var i = 0; i < tests.length; i++) {
    rows += '<tr><td>' + tests[i][0] + '</td><td class="' + (tests[i][1] ? 'ok' : 'no') + '">' + (tests[i][1] ? 'yes' : 'NO') + '</td></tr>';
  }
  document.getElementById('t').innerHTML = rows;
}());
</script></body></html>
```

`tools/probe/appinfo.json`:
```json
{"id":"com.immich.webos.probe","version":"0.0.1","vendor":"Immich","type":"web","main":"index.html","title":"Immich Probe","icon":"icon.png","largeIcon":"largeIcon.png","resolution":"1920x1080","uiRevision":"2"}
```

- [ ] **Step 2: Copy placeholder icons and package**

Run: `cp icon.png largeIcon.png tools/probe/ && ares-package tools/probe -o build`
Expected: `build/com.immich.webos.probe_0.0.1_all.ipk` created.

- [ ] **Step 3: Run on the real TV (manual)**

Run: `ares-install -d <tv> build/com.immich.webos.probe_0.0.1_all.ipk && ares-launch -d <tv> com.immich.webos.probe`
Expected: screen shows the user agent and a yes/NO table. Record the `Chrome/NN` value and every NO. **If Chrome is not 38 or any "must work" row differs from the spec's baseline, stop and update the spec before Task 2.**

- [ ] **Step 4: Commit**

```bash
git add tools/probe
git commit -m "chore: add device probe app to confirm TV engine

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Toolchain and the Chromium 38 gate

**Files:**
- Create: `package.json`, `eslint.config.js`, `tools/check-es5.js`, `tests/tools/check-es5.test.js`

**Interfaces:**
- Produces: `require('tools/check-es5').scan(source, kind) -> [{line:number, rule:string}]` where `kind` is `'js'` or `'css'`; `npm test` runs lint + gate + unit tests.

- [ ] **Step 1: Create `package.json` and install ESLint**

```json
{
  "name": "immich-webos",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "lint": "eslint core shell-legacy/js",
    "check:es5": "node tools/check-es5.js",
    "test:unit": "node --test \"tests/**/*.test.js\"",
    "test": "npm run lint && npm run check:es5 && npm run test:unit",
    "icons": "node tools/make-icons.js",
    "build:legacy": "node tools/build-legacy.js",
    "package:legacy": "npm run build:legacy && ares-package dist/legacy -o build",
    "serve:legacy": "npm run build:legacy && python3 -m http.server 8080 --directory dist/legacy",
    "sync:core": "node tools/sync-core.js"
  },
  "devDependencies": { "eslint": "^9.0.0" }
}
```
Run: `npm install`
Expected: `node_modules/` created, exit 0.

- [ ] **Step 2: Create `eslint.config.js`**

```js
var browser = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  XMLHttpRequest: 'readonly', Promise: 'readonly', Image: 'readonly', requestAnimationFrame: 'readonly',
  module: 'writable', require: 'readonly', global: 'readonly', NodeList: 'readonly', CSS: 'readonly', fetch: 'readonly'
};
module.exports = [{
  files: ['core/**/*.js', 'shell-legacy/js/**/*.js'],
  languageOptions: { ecmaVersion: 5, sourceType: 'script', globals: browser },
  rules: { 'no-undef': 'error', 'no-redeclare': 'error' }
}];
```
`ecmaVersion: 5` makes ESLint reject arrow functions, `let`, `const`, template literals and async at parse time. (`fetch` is declared only so the probe can typeof-check it; the gate below forbids calling it.)

- [ ] **Step 3: Write the failing gate tests**

`tests/tools/check-es5.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var gate = require('../../tools/check-es5');

function rules(src, kind) { return gate.scan(src, kind).map(function (v) { return v.rule; }); }

test('flags fetch calls', function () {
  assert.deepStrictEqual(rules('fetch(url).then(f)', 'js'), ['fetch']);
});
test('flags Array.from and Object.assign', function () {
  assert.deepStrictEqual(rules('Array.from(x); Object.assign({}, y)', 'js'), ['Array.from', 'Object.assign']);
});
test('flags string and array ES6 methods', function () {
  assert.deepStrictEqual(rules('a.includes(1); s.startsWith("x"); l.find(f)', 'js'),
    ['includes', 'startsWith', 'find']);
});
test('flags NodeList forEach on querySelectorAll', function () {
  assert.deepStrictEqual(rules('document.querySelectorAll(".a").forEach(f)', 'js'), ['NodeList.forEach']);
});
test('ignores forbidden words in comments and strings', function () {
  assert.deepStrictEqual(rules('// fetch(x)\n/* Array.from */ var a = "fetch(x) https://x";', 'js'), []);
});
test('reports line numbers', function () {
  assert.strictEqual(gate.scan('var a;\nfetch(1)', 'js')[0].line, 2);
});
test('css: flags variables, grid, sticky, focus-within, gap', function () {
  var css = ':root{--a:1}\n.a{display:grid}\n.b{position:sticky}\n.c:focus-within{}\n.d{gap:4px}';
  assert.deepStrictEqual(rules(css, 'css'), ['css-var', 'css-grid', 'css-sticky', 'css-focus-within', 'css-gap']);
});
test('css: accepts flexbox', function () {
  assert.deepStrictEqual(rules('.a{display:flex;flex-wrap:wrap}', 'css'), []);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `node --test tests/tools/check-es5.test.js`
Expected: FAIL, `Cannot find module '../../tools/check-es5'`.

- [ ] **Step 5: Implement `tools/check-es5.js`**

```js
var fs = require('fs');
var path = require('path');

var JS_RULES = [
  ['fetch', /\bfetch\s*\(/],
  ['Array.from', /\bArray\.from\b/],
  ['Object.assign', /\bObject\.assign\b/],
  ['Object.entries', /\bObject\.(entries|values)\b/],
  ['includes', /\.includes\s*\(/],
  ['startsWith', /\.startsWith\s*\(/],
  ['endsWith', /\.endsWith\s*\(/],
  ['find', /\.find\s*\(/],
  ['findIndex', /\.findIndex\s*\(/],
  ['fill', /\.fill\s*\(/],
  ['repeat', /\.repeat\s*\(/],
  ['padStart', /\.pad(Start|End)\s*\(/],
  ['closest', /\.closest\s*\(/],
  ['append', /\.(append|prepend)\s*\(/],
  ['finally', /\.finally\s*\(/],
  ['NodeList.forEach', /querySelectorAll\([^)]*\)\s*\.forEach/],
  ['scrollIntoView-options', /scrollIntoView\s*\(\s*\{/]
];
var CSS_RULES = [
  ['css-var', /var\(\s*--|(^|[\s{;])--[\w-]+\s*:/],
  ['css-grid', /display\s*:\s*(inline-)?grid|grid-template/],
  ['css-sticky', /position\s*:\s*sticky/],
  ['css-focus-within', /:focus-within|:focus-visible/],
  ['css-gap', /(^|[\s{;])(row-|column-)?gap\s*:/],
  ['css-aspect-ratio', /aspect-ratio\s*:/],
  ['css-math-fn', /\b(min|max|clamp)\s*\(/]
];

function stripJs(src) {
  // Strings first (so "https://" is not read as a comment), then comments; keep newlines for line numbers.
  var s = src.replace(/'(\\.|[^'\\\n])*'|"(\\.|[^"\\\n])*"/g, '""');
  s = s.replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ''); });
  return s.replace(/\/\/.*$/gm, '');
}
function stripCss(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ''); });
}

function scan(source, kind) {
  var code = kind === 'css' ? stripCss(source) : stripJs(source);
  var rules = kind === 'css' ? CSS_RULES : JS_RULES;
  var lines = code.split('\n');
  var out = [];
  lines.forEach(function (text, i) {
    rules.forEach(function (r) {
      if (r[1].test(text)) { out.push({ line: i + 1, rule: r[0] }); }
    });
  });
  return out;
}

function walk(dir, acc) {
  if (!fs.existsSync(dir)) { return acc; }
  fs.readdirSync(dir).forEach(function (name) {
    var p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { walk(p, acc); } else { acc.push(p); }
  });
  return acc;
}

function main() {
  var root = path.join(__dirname, '..');
  var files = walk(path.join(root, 'core'), []).concat(walk(path.join(root, 'shell-legacy'), []));
  var bad = 0;
  files.forEach(function (f) {
    var kind = /\.js$/.test(f) ? 'js' : (/\.css$/.test(f) ? 'css' : null);
    if (!kind) { return; }
    scan(fs.readFileSync(f, 'utf8'), kind).forEach(function (v) {
      bad++;
      console.error(path.relative(root, f) + ':' + v.line + '  forbidden on Chromium 38: ' + v.rule);
    });
  });
  if (bad) { process.exit(1); }
  console.log('check-es5: ' + files.length + ' files OK');
}

module.exports = { scan: scan };
if (require.main === module) { main(); }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test tests/tools/check-es5.test.js`
Expected: 8 tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json eslint.config.js tools/check-es5.js tests/tools
git commit -m "chore: add ES5 lint and Chromium 38 API gate

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `core/http` — XHR wrapper with classified errors

**Files:**
- Create: `core/http.js`, `tests/helpers.js`, `tests/core/http.test.js`

**Interfaces:**
- Produces: `http.request({method?, url, headers?, body?, timeout?}) -> Promise<{status, data}>`; rejects with `Error` having `.code` in `'network' | 'timeout' | 'unauthorized' | 'http'` and `.status`. `http.create(xhrFactory)` returns an object with the same `request` (used by tests).
- Note: an XHR `onerror` cannot distinguish an untrusted certificate, a CORS block and an offline server. All three map to `code: 'network'` with one message listing the three causes.

- [ ] **Step 1: Write the failing test**

`tests/helpers.js`:
```js
function FakeXHR() { this.headers = {}; FakeXHR.last = this; }
FakeXHR.prototype.open = function (m, u) { this.method = m; this.url = u; };
FakeXHR.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
FakeXHR.prototype.send = function (b) { this.sent = b; };
FakeXHR.respond = function (status, text) { var x = FakeXHR.last; x.status = status; x.responseText = text; x.onload(); };

function memStorage() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; }
  };
}
module.exports = { FakeXHR: FakeXHR, memStorage: memStorage };
```

`tests/core/http.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var FakeXHR = require('../helpers').FakeXHR;
var http = require('../../core/http').create(function () { return new FakeXHR(); });

test('resolves parsed JSON on 200 and sends headers', function () {
  var p = http.request({ url: 'http://s/api/x', headers: { 'x-api-key': 'k' } });
  assert.strictEqual(FakeXHR.last.headers['x-api-key'], 'k');
  FakeXHR.respond(200, '{"a":1}');
  return p.then(function (r) { assert.deepStrictEqual(r, { status: 200, data: { a: 1 } }); });
});
test('POST serializes body as JSON', function () {
  var p = http.request({ method: 'POST', url: 'u', body: { page: 1 } });
  assert.strictEqual(FakeXHR.last.sent, '{"page":1}');
  assert.strictEqual(FakeXHR.last.headers['Content-Type'], 'application/json');
  FakeXHR.respond(200, '{}');
  return p;
});
test('401 and 403 reject as unauthorized', function () {
  var p = http.request({ url: 'u' });
  FakeXHR.respond(401, '');
  return p.then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'unauthorized'); assert.strictEqual(e.status, 401);
  });
});
test('500 rejects as http with status', function () {
  var p = http.request({ url: 'u' });
  FakeXHR.respond(500, '');
  return p.then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'http'); assert.match(e.message, /HTTP 500/);
  });
});
test('network error rejects as network and mentions certificate', function () {
  var p = http.request({ url: 'u' });
  FakeXHR.last.onerror();
  return p.then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'network'); assert.match(e.message, /certificate/);
  });
});
test('timeout rejects as timeout', function () {
  var p = http.request({ url: 'u', timeout: 5 });
  assert.strictEqual(FakeXHR.last.timeout, 5);
  FakeXHR.last.ontimeout();
  return p.then(function () { assert.fail('should reject'); }, function (e) { assert.strictEqual(e.code, 'timeout'); });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/core/http.test.js`
Expected: FAIL, `Cannot find module '../../core/http'`.

- [ ] **Step 3: Implement `core/http.js`**

```js
(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  var MESSAGES = {
    network: 'Cannot reach the server. Check the address and that the TV is online. For https:// addresses the TV may not trust the certificate, or the server may be blocking this app (CORS).',
    timeout: 'The server did not answer in time.',
    unauthorized: 'The server rejected the API key.',
    http: 'The server returned an error'
  };

  function makeError(code, message, status) {
    var e = new Error(message);
    e.code = code;
    e.status = status || 0;
    return e;
  }

  function create(xhrFactory) {
    function request(opts) {
      return new Promise(function (resolve, reject) {
        var xhr = xhrFactory();
        var headers = opts.headers || {};
        var payload = null;
        var name;
        xhr.open(opts.method || 'GET', opts.url, true);
        xhr.timeout = opts.timeout || 20000;
        for (name in headers) {
          if (Object.prototype.hasOwnProperty.call(headers, name)) { xhr.setRequestHeader(name, headers[name]); }
        }
        if (opts.body !== undefined) {
          payload = JSON.stringify(opts.body);
          xhr.setRequestHeader('Content-Type', 'application/json');
        }
        xhr.onload = function () {
          var data = null;
          if (xhr.responseText) {
            try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ status: xhr.status, data: data });
          } else if (xhr.status === 401 || xhr.status === 403) {
            reject(makeError('unauthorized', MESSAGES.unauthorized, xhr.status));
          } else {
            reject(makeError('http', MESSAGES.http + ' (HTTP ' + xhr.status + ').', xhr.status));
          }
        };
        xhr.onerror = function () { reject(makeError('network', MESSAGES.network)); };
        xhr.ontimeout = function () { reject(makeError('timeout', MESSAGES.timeout)); };
        xhr.send(payload);
      });
    }
    return { request: request };
  }

  var http = create(function () { return new XMLHttpRequest(); });
  http.create = create;
  core.http = http;
  if (typeof module !== 'undefined' && module.exports) { module.exports = http; }
}(typeof window !== 'undefined' ? window : global));
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/core/http.test.js && npx eslint core`
Expected: 6 tests pass, lint clean.

- [ ] **Step 5: Commit**

```bash
git add core/http.js tests/helpers.js tests/core/http.test.js
git commit -m "feat(core): XHR http wrapper with classified errors

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `core/settings` — credentials, URL normalization, view preferences

**Files:**
- Create: `core/settings.js`, `tests/core/settings.test.js`

**Interfaces:**
- Consumes: a storage object with `getItem/setItem/removeItem` (defaults to `window.localStorage`, guarded).
- Produces: `settings.create(storage) -> {getCredentials(), saveCredentials(url,key), clearCredentials(), getView(), saveView(v), getUrlHistory(), addUrlHistory(url), normalizeUrl(raw)}`. `getCredentials() -> {serverUrl, apiKey}` (empty strings when unset). `getView() -> {viewMode:'grid'|'list', columns:3..8, thumbSize:'thumbnail'|'preview'}`. `settings.normalizeUrl` is also exported statically.

- [ ] **Step 1: Write the failing test**

`tests/core/settings.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var settings = require('../../core/settings');
var memStorage = require('../helpers').memStorage;

test('normalizeUrl adds https, trims slashes and trailing /api', function () {
  assert.strictEqual(settings.normalizeUrl(' photos.example.com/ '), 'https://photos.example.com');
  assert.strictEqual(settings.normalizeUrl('http://10.0.0.5:2283/api'), 'http://10.0.0.5:2283');
  assert.strictEqual(settings.normalizeUrl('   '), '');
});
test('credentials round-trip and clear', function () {
  var s = settings.create(memStorage());
  assert.deepStrictEqual(s.getCredentials(), { serverUrl: '', apiKey: '' });
  s.saveCredentials('photos.example.com/', ' KEY ');
  assert.deepStrictEqual(s.getCredentials(), { serverUrl: 'https://photos.example.com', apiKey: 'KEY' });
  s.clearCredentials();
  assert.deepStrictEqual(s.getCredentials(), { serverUrl: '', apiKey: '' });
});
test('view defaults', function () {
  assert.deepStrictEqual(settings.create(memStorage()).getView(), { viewMode: 'grid', columns: 5, thumbSize: 'thumbnail' });
});
test('view round-trips and is clamped/validated on read', function () {
  var st = memStorage(); var s = settings.create(st);
  s.saveView({ viewMode: 'list', columns: 7, thumbSize: 'preview' });
  assert.deepStrictEqual(s.getView(), { viewMode: 'list', columns: 7, thumbSize: 'preview' });
  st.setItem('immich_columns', '99'); assert.strictEqual(s.getView().columns, 8);
  st.setItem('immich_columns', '1');  assert.strictEqual(s.getView().columns, 3);
  st.setItem('immich_columns', 'x');  assert.strictEqual(s.getView().columns, 5);
  st.setItem('immich_view_mode', 'weird'); assert.strictEqual(s.getView().viewMode, 'grid');
});
test('url history is deduped, most-recent-first, max 5', function () {
  var s = settings.create(memStorage());
  ['a', 'b', 'c', 'd', 'e', 'f', 'c'].forEach(function (u) { s.addUrlHistory('https://' + u + '.x'); });
  assert.deepStrictEqual(s.getUrlHistory(),
    ['https://c.x', 'https://f.x', 'https://e.x', 'https://d.x', 'https://b.x']);
});
test('a throwing storage never throws', function () {
  var bad = { getItem: function () { throw new Error('x'); }, setItem: function () { throw new Error('x'); }, removeItem: function () { throw new Error('x'); } };
  var s = settings.create(bad);
  s.saveCredentials('a', 'b');
  assert.deepStrictEqual(s.getCredentials(), { serverUrl: '', apiKey: '' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/core/settings.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/settings.js`**

```js
(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  var KEYS = {
    serverUrl: 'immich_server_url', apiKey: 'immich_api_key',
    viewMode: 'immich_view_mode', columns: 'immich_columns', thumbSize: 'immich_thumb_size',
    history: 'immich_url_history'
  };
  var MAX_HISTORY = 5;

  function normalizeUrl(raw) {
    var url = String(raw || '').replace(/^\s+|\s+$/g, '');
    if (!url) { return ''; }
    if (!/^https?:\/\//i.test(url)) { url = 'https://' + url; }
    url = url.replace(/\/+$/, '');
    return url.replace(/\/api$/i, '');
  }

  function create(storage) {
    function read(key) { try { return storage.getItem(key); } catch (e) { return null; } }
    function write(key, value) { try { storage.setItem(key, value); } catch (e) { /* ignore */ } }
    function remove(key) { try { storage.removeItem(key); } catch (e) { /* ignore */ } }

    function getUrlHistory() {
      try {
        var list = JSON.parse(read(KEYS.history) || '[]');
        return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
      } catch (e) { return []; }
    }

    return {
      normalizeUrl: normalizeUrl,
      getCredentials: function () {
        return { serverUrl: read(KEYS.serverUrl) || '', apiKey: read(KEYS.apiKey) || '' };
      },
      saveCredentials: function (url, key) {
        write(KEYS.serverUrl, normalizeUrl(url));
        write(KEYS.apiKey, String(key || '').replace(/^\s+|\s+$/g, ''));
      },
      clearCredentials: function () { remove(KEYS.serverUrl); remove(KEYS.apiKey); },
      getView: function () {
        var cols = parseInt(read(KEYS.columns), 10);
        if (isNaN(cols)) { cols = 5; }
        return {
          viewMode: read(KEYS.viewMode) === 'list' ? 'list' : 'grid',
          columns: Math.min(8, Math.max(3, cols)),
          thumbSize: read(KEYS.thumbSize) === 'preview' ? 'preview' : 'thumbnail'
        };
      },
      saveView: function (v) {
        write(KEYS.viewMode, v.viewMode);
        write(KEYS.columns, v.columns);
        write(KEYS.thumbSize, v.thumbSize);
      },
      getUrlHistory: getUrlHistory,
      addUrlHistory: function (url) {
        var list = [url];
        getUrlHistory().forEach(function (u) { if (u !== url) { list.push(u); } });
        write(KEYS.history, JSON.stringify(list.slice(0, MAX_HISTORY)));
      }
    };
  }

  function safeLocalStorage() {
    try { return window.localStorage; } catch (e) { return { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }; }
  }

  var api = { create: create, normalizeUrl: normalizeUrl, defaultStorage: safeLocalStorage };
  core.settings = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/core/settings.test.js && npx eslint core`
Expected: 6 tests pass, lint clean.

- [ ] **Step 5: Commit**

```bash
git add core/settings.js tests/core/settings.test.js
git commit -m "feat(core): settings store for credentials, view prefs, URL history

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `core/paging` — incremental page loader

**Files:**
- Create: `core/paging.js`, `tests/core/paging.test.js`

**Interfaces:**
- Produces: `paging.createPager(fetchPage) -> {items(), hasMore(), loadNext()}` where `fetchPage(pageNumber) -> Promise<{items:Array, nextPage:number|null}>` and `loadNext() -> Promise<number>` (count of items added; concurrent calls share one request).

- [ ] **Step 1: Write the failing test**

`tests/core/paging.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var paging = require('../../core/paging');

function source(pages) {
  var calls = [];
  return { calls: calls, fetch: function (n) { calls.push(n); return Promise.resolve(pages[n - 1]); } };
}

test('loads pages in order and stops when nextPage is null', function () {
  var s = source([{ items: [1, 2], nextPage: 2 }, { items: [3], nextPage: null }]);
  var p = paging.createPager(s.fetch);
  return p.loadNext().then(function (n) {
    assert.strictEqual(n, 2); assert.strictEqual(p.hasMore(), true);
    return p.loadNext();
  }).then(function (n) {
    assert.strictEqual(n, 1); assert.deepStrictEqual(p.items(), [1, 2, 3]);
    assert.strictEqual(p.hasMore(), false);
    return p.loadNext();
  }).then(function (n) { assert.strictEqual(n, 0); assert.deepStrictEqual(s.calls, [1, 2]); });
});
test('concurrent loadNext calls share one request', function () {
  var s = source([{ items: [1], nextPage: null }]);
  var p = paging.createPager(s.fetch);
  return Promise.all([p.loadNext(), p.loadNext()]).then(function () { assert.deepStrictEqual(s.calls, [1]); });
});
test('a failed load can be retried', function () {
  var fail = true;
  var p = paging.createPager(function () { return fail ? Promise.reject(new Error('x')) : Promise.resolve({ items: [9], nextPage: null }); });
  return p.loadNext().then(function () { assert.fail('should reject'); }, function () {
    fail = false; return p.loadNext();
  }).then(function () { assert.deepStrictEqual(p.items(), [9]); });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/core/paging.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/paging.js`**

```js
(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  function createPager(fetchPage) {
    var items = [];
    var next = 1;
    var done = false;
    var inflight = null;
    return {
      items: function () { return items; },
      hasMore: function () { return !done; },
      loadNext: function () {
        if (done) { return Promise.resolve(0); }
        if (inflight) { return inflight; }
        inflight = fetchPage(next).then(function (res) {
          inflight = null;
          items = items.concat(res.items);
          if (res.nextPage === null || res.nextPage === undefined || res.items.length === 0) { done = true; } else { next = res.nextPage; }
          return res.items.length;
        }, function (err) { inflight = null; throw err; });
        return inflight;
      }
    };
  }

  var api = { createPager: createPager };
  core.paging = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/core/paging.test.js && npx eslint core`
Expected: 3 tests pass, lint clean.

- [ ] **Step 5: Commit**

```bash
git add core/paging.js tests/core/paging.test.js
git commit -m "feat(core): paging loader

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `core/immich-client` — API calls and media URLs

**Files:**
- Create: `core/immich-client.js`, `tests/core/immich-client.test.js`, `docs/immich-api-notes.md` (results of the live checks)

**Interfaces:**
- Consumes: `http.request` (Task 3), `getConfig() -> {serverUrl, apiKey}` (Task 4 `getCredentials`).
- Produces: `client.create({http, getConfig}) -> {verify(serverUrl, apiKey)->Promise<user>, listAlbums()->Promise<[{id,name,count,coverId}]>, getAlbum(id)->Promise<{id,name,assets:[{id,name}]}>, searchPage(page,size)->Promise<{items:[{id,name}], nextPage:number|null}>, thumbnailUrl(assetId,size), viewerUrl(assetId)}`. Asset objects are `{id, name}`; only `type === 'IMAGE'` assets are returned (video is out of scope).

- [ ] **Step 1: Verify the assumptions against the user's live Immich (manual, needs an API key)**

Run (replace `URL` and `KEY`):
```bash
curl -s -H "x-api-key: KEY" URL/api/users/me | head -c 300; echo
curl -s -H "x-api-key: KEY" URL/api/albums | head -c 300; echo
curl -s -X POST -H "x-api-key: KEY" -H "Content-Type: application/json" -d '{"page":1,"size":2,"order":"desc","type":"IMAGE"}' URL/api/search/metadata | head -c 400; echo
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "URL/api/assets/<ASSET_ID>/thumbnail?size=thumbnail&apiKey=KEY"
curl -s -o /dev/null -w "%{http_code}\n" "URL/api/assets/<ASSET_ID>/thumbnail?size=thumbnail&key=KEY"
curl -s -D - -o /dev/null -H "Origin: null" -H "x-api-key: KEY" URL/api/users/me | grep -i access-control
```
Expected: user JSON; album array; `{"assets":{"items":[...],"nextPage":"2"...}}`; `200 image/...` for `apiKey=`; the `key=` call is expected to fail (401/404); an `access-control-allow-origin` header is present. Write the actual results (status codes, header) in `docs/immich-api-notes.md`. **If `apiKey=` fails or the CORS header is missing, stop and adjust: thumbnails then need XHR blob loading (`responseType='blob'` + `URL.createObjectURL`) or a CORS setting on the reverse proxy; update the plan before continuing.**

- [ ] **Step 2: Write the failing test**

`tests/core/immich-client.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var clientMod = require('../../core/immich-client');

function make(responses) {
  var calls = [];
  var http = { request: function (o) {
    calls.push(o);
    var r = responses.shift();
    return r instanceof Error ? Promise.reject(r) : Promise.resolve({ status: 200, data: r });
  } };
  var c = clientMod.create({ http: http, getConfig: function () { return { serverUrl: 'https://s', apiKey: 'K' }; } });
  return { c: c, calls: calls };
}
function httpErr(status) { var e = new Error('x'); e.code = 'http'; e.status = status; return e; }

test('verify uses the given server and key, not stored config', function () {
  var m = make([{ name: 'Ann' }]);
  return m.c.verify('http://other', 'Z').then(function (u) {
    assert.strictEqual(u.name, 'Ann');
    assert.strictEqual(m.calls[0].url, 'http://other/api/users/me');
    assert.strictEqual(m.calls[0].headers['x-api-key'], 'Z');
  });
});
test('verify falls back to /api/user on 404', function () {
  var m = make([httpErr(404), { name: 'Old' }]);
  return m.c.verify('http://o', 'Z').then(function (u) {
    assert.strictEqual(u.name, 'Old'); assert.strictEqual(m.calls[1].url, 'http://o/api/user');
  });
});
test('verify does not swallow unauthorized', function () {
  var e = new Error('no'); e.code = 'unauthorized';
  var m = make([e]);
  return m.c.verify('http://o', 'Z').then(function () { assert.fail('should reject'); }, function (err) { assert.strictEqual(err.code, 'unauthorized'); });
});
test('listAlbums normalizes fields', function () {
  var m = make([[{ id: 'a1', albumName: 'Trip', assetCount: 3, albumThumbnailAssetId: 'x9' }]]);
  return m.c.listAlbums().then(function (l) {
    assert.deepStrictEqual(l, [{ id: 'a1', name: 'Trip', count: 3, coverId: 'x9' }]);
  });
});
test('getAlbum keeps images only', function () {
  var m = make([{ id: 'a1', albumName: 'Trip', assets: [
    { id: '1', type: 'IMAGE', originalFileName: 'a.jpg' }, { id: '2', type: 'VIDEO', originalFileName: 'b.mp4' }] }]);
  return m.c.getAlbum('a1').then(function (a) {
    assert.deepStrictEqual(a, { id: 'a1', name: 'Trip', assets: [{ id: '1', name: 'a.jpg' }] });
  });
});
test('searchPage posts paging body and normalizes nextPage', function () {
  var m = make([{ assets: { items: [{ id: '1', type: 'IMAGE', originalFileName: 'a.jpg' }], nextPage: '3' } }]);
  return m.c.searchPage(2, 60).then(function (r) {
    assert.deepStrictEqual(m.calls[0].body, { page: 2, size: 60, order: 'desc', type: 'IMAGE' });
    assert.strictEqual(m.calls[0].method, 'POST');
    assert.deepStrictEqual(r, { items: [{ id: '1', name: 'a.jpg' }], nextPage: 3 });
  });
});
test('searchPage nextPage null when server sends none', function () {
  var m = make([{ assets: { items: [], nextPage: null } }]);
  return m.c.searchPage(1, 60).then(function (r) { assert.strictEqual(r.nextPage, null); });
});
test('media urls carry the api key as apiKey query param', function () {
  var m = make([]);
  assert.strictEqual(m.c.thumbnailUrl('id1', 'thumbnail'), 'https://s/api/assets/id1/thumbnail?size=thumbnail&apiKey=K');
  assert.strictEqual(m.c.viewerUrl('id1'), 'https://s/api/assets/id1/thumbnail?size=preview&apiKey=K');
});
test('calls reject when not configured', function () {
  var c = clientMod.create({ http: {}, getConfig: function () { return { serverUrl: '', apiKey: '' }; } });
  return c.listAlbums().then(function () { assert.fail('should reject'); }, function (e) { assert.strictEqual(e.code, 'not_configured'); });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test tests/core/immich-client.test.js`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `core/immich-client.js`**

```js
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/core/immich-client.test.js && npx eslint core`
Expected: 9 tests pass, lint clean.

- [ ] **Step 6: Commit**

```bash
git add core/immich-client.js tests/core/immich-client.test.js docs/immich-api-notes.md
git commit -m "feat(core): Immich REST client and media URLs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `core/auth` — connect and sign out

**Files:**
- Create: `core/auth.js`, `tests/core/auth.test.js`

**Interfaces:**
- Consumes: `client.verify` (Task 6), `settings.{normalizeUrl,saveCredentials,addUrlHistory,getCredentials,clearCredentials}` (Task 4).
- Produces: `auth.create({client, settings}) -> {connect(rawUrl, rawKey)->Promise<user>, isConfigured()->bool, signOut(), userLabel(user)->string}`. `connect` rejects with `Error` whose `.code` is `'invalid_input'` (empty URL or key) or whatever `client.verify` rejects with; credentials are saved **only** after a successful verify.

- [ ] **Step 1: Write the failing test**

`tests/core/auth.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var authMod = require('../../core/auth');
var settingsMod = require('../../core/settings');
var memStorage = require('../helpers').memStorage;

function make(verify) {
  var settings = settingsMod.create(memStorage());
  var seen = [];
  var client = { verify: function (u, k) { seen.push([u, k]); return verify(u, k); } };
  return { a: authMod.create({ client: client, settings: settings }), settings: settings, seen: seen };
}

test('connect verifies normalized url, then saves credentials and history', function () {
  var m = make(function () { return Promise.resolve({ name: 'Ann' }); });
  return m.a.connect('photos.example.com/', ' KEY ').then(function (u) {
    assert.strictEqual(u.name, 'Ann');
    assert.deepStrictEqual(m.seen[0], ['https://photos.example.com', 'KEY']);
    assert.deepStrictEqual(m.settings.getCredentials(), { serverUrl: 'https://photos.example.com', apiKey: 'KEY' });
    assert.deepStrictEqual(m.settings.getUrlHistory(), ['https://photos.example.com']);
    assert.strictEqual(m.a.isConfigured(), true);
  });
});
test('connect does not save when verification fails', function () {
  var m = make(function () { var e = new Error('bad'); e.code = 'unauthorized'; return Promise.reject(e); });
  return m.a.connect('h.x', 'K').then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'unauthorized'); assert.strictEqual(m.a.isConfigured(), false);
  });
});
test('connect rejects empty input without calling the server', function () {
  var m = make(function () { return Promise.resolve({}); });
  return m.a.connect('', 'K').then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'invalid_input'); assert.match(e.message, /address/);
    return m.a.connect('h.x', ' ');
  }).then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.code, 'invalid_input'); assert.match(e.message, /API key/); assert.strictEqual(m.seen.length, 0);
  });
});
test('signOut clears credentials; userLabel prefers name over email', function () {
  var m = make(function () { return Promise.resolve({}); });
  m.settings.saveCredentials('h.x', 'K');
  m.a.signOut();
  assert.strictEqual(m.a.isConfigured(), false);
  assert.strictEqual(m.a.userLabel({ name: 'Ann', email: 'a@x' }), 'Ann');
  assert.strictEqual(m.a.userLabel({ email: 'a@x' }), 'a@x');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/core/auth.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/auth.js`**

```js
(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  function invalid(message) {
    var e = new Error(message);
    e.code = 'invalid_input';
    return e;
  }

  function create(deps) {
    var client = deps.client;
    var settings = deps.settings;
    return {
      connect: function (rawUrl, rawKey) {
        var url = settings.normalizeUrl(rawUrl);
        var key = String(rawKey || '').replace(/^\s+|\s+$/g, '');
        if (!url) { return Promise.reject(invalid('Enter the server address.')); }
        if (!key) { return Promise.reject(invalid('Enter the API key.')); }
        return client.verify(url, key).then(function (user) {
          settings.saveCredentials(url, key);
          settings.addUrlHistory(url);
          return user;
        });
      },
      isConfigured: function () {
        var c = settings.getCredentials();
        return !!(c.serverUrl && c.apiKey);
      },
      signOut: function () { settings.clearCredentials(); },
      userLabel: function (user) { return (user && (user.name || user.email)) || 'user'; }
    };
  }

  var api = { create: create };
  core.auth = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
```

- [ ] **Step 4: Run the whole suite**

Run: `npm run test:unit && npx eslint core && npm run check:es5`
Expected: all core and gate tests pass; lint clean; `check-es5: N files OK`.

- [ ] **Step 5: Commit**

```bash
git add core/auth.js tests/core/auth.test.js
git commit -m "feat(core): auth connect/sign-out orchestration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Legacy shell skeleton, real icons, build script, router

**Files:**
- Move: `index.html`, `css/`, `appinfo.json`, `icon.png`, `largeIcon.png` -> `shell-legacy/` (`git mv`); `js/nav.js`, `js/app.js`, `js/api.js`, `js/storage.js` are **deleted** (replaced by new modules and `core/`)
- Create: `tools/make-icons.js`, `tools/build-legacy.js`, `shell-legacy/js/dom.js`, `shell-legacy/js/nav.js`, `shell-legacy/js/app.js`, `shell-legacy/js/main.js`, `shell-legacy/css/app.css`, `tests/tools/build-legacy.test.js`

**Interfaces:**
- Produces (`window.ImmichUI`):
  - `dom.el(tag, cls, text?)`, `dom.clear(node)`, `dom.toArray(nodeList)`, `dom.show(node)`, `dom.hide(node)` (toggles class `hidden`)
  - `keys.name(keyCode) -> 'left'|'right'|'up'|'down'|'ok'|'back'|null`
  - `nav.setFocus(el)`, `nav.clearFocus()`, `nav.focusFirst(scopeEl)`, `nav.move(dir, scopeEl) -> bool` (spatial move among `.focusable` in scope)
  - `app.register(name, view)`, `app.go(name, params)`, `app.back()`, `app.start(firstName)`; a **view** is `{name, el, enter(params, restore), leave(), onKey(keyName) -> bool, snapshot() -> restore}`
  - Build output: `dist/legacy/` containing `index.html`, `appinfo.json`, icons, `css/`, `js/`, `core/`.

- [ ] **Step 1: Write the failing build test**

`tests/tools/build-legacy.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var root = path.join(__dirname, '..', '..');

test('build-legacy assembles a self-contained app dir with valid appinfo', function () {
  cp.execFileSync('node', [path.join(root, 'tools', 'build-legacy.js')], { cwd: root });
  var out = path.join(root, 'dist', 'legacy');
  ['index.html', 'appinfo.json', 'icon.png', 'largeIcon.png', 'core/http.js', 'js/app.js', 'css/app.css'].forEach(function (f) {
    assert.ok(fs.existsSync(path.join(out, f)), 'missing ' + f);
  });
  var info = JSON.parse(fs.readFileSync(path.join(out, 'appinfo.json'), 'utf8'));
  assert.strictEqual(info.id, 'com.immich.webos');
  assert.strictEqual(info.type, 'web');
  assert.strictEqual(info.resolution, '1920x1080');
  var html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  var srcs = html.match(/src="([^"]+)"/g).map(function (s) { return s.slice(5, -1); });
  srcs.forEach(function (s) { assert.ok(fs.existsSync(path.join(out, s)), 'index.html references missing ' + s); });
});
test('icons have the required sizes', function () {
  cp.execFileSync('node', [path.join(root, 'tools', 'make-icons.js')], { cwd: root });
  function size(f) { var b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
  assert.deepStrictEqual(size(path.join(root, 'shell-legacy', 'icon.png')), [80, 80]);
  assert.deepStrictEqual(size(path.join(root, 'shell-legacy', 'largeIcon.png')), [130, 130]);
});
```

- [ ] **Step 2: Restructure the repo and delete obsolete prototype JS**

Run:
```bash
echo 'dist/' >> .gitignore
mkdir -p shell-legacy/js && git mv index.html css appinfo.json icon.png largeIcon.png shell-legacy/
git rm -q js/api.js js/storage.js js/app.js js/nav.js && ls js 2>/dev/null; true
```
Expected: `shell-legacy/` holds the moved files; root `js/` is gone. (Prototype behaviour remains in git history at commit `af29813` as the regression baseline.)

- [ ] **Step 3: Run to verify tests fail**

Run: `node --test tests/tools/build-legacy.test.js`
Expected: FAIL, `Cannot find module` for the tools.

- [ ] **Step 4: Implement `tools/make-icons.js` (dependency-free PNG writer)**

```js
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

function png(size, rgbAt) {
  var raw = Buffer.alloc((size * 4 + 1) * size);
  for (var y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (var x = 0; x < size; x++) {
      var c = rgbAt(x, y, size), o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255;
    }
  }
  function chunk(type, data) {
    var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    var td = Buffer.concat([Buffer.from(type), data]);
    var crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Dark tile with four coloured petals around the centre (Immich-like flower).
function flower(x, y, s) {
  var dx = x - s / 2, dy = y - s / 2, r = Math.sqrt(dx * dx + dy * dy);
  if (r < s * 0.08) { return [17, 24, 39]; }
  if (r > s * 0.42) { return [17, 24, 39]; }
  if (dx >= 0 && dy < 0) { return [250, 41, 80]; }
  if (dx >= 0 && dy >= 0) { return [255, 180, 0]; }
  if (dx < 0 && dy >= 0) { return [66, 133, 244]; }
  return [30, 200, 130];
}

var dir = path.join(__dirname, '..');
[['shell-legacy', 80, 'icon.png'], ['shell-legacy', 130, 'largeIcon.png'],
 ['tools/probe', 80, 'icon.png'], ['tools/probe', 130, 'largeIcon.png']].forEach(function (t) {
  fs.writeFileSync(path.join(dir, t[0], t[2]), png(t[1], flower));
});
console.log('icons written');
```

- [ ] **Step 5: Implement `tools/build-legacy.js`**

```js
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var out = path.join(root, 'dist', 'legacy');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'core'), path.join(out, 'core'), { recursive: true });
fs.readdirSync(path.join(root, 'shell-legacy')).forEach(function (name) {
  fs.cpSync(path.join(root, 'shell-legacy', name), path.join(out, name), { recursive: true });
});
console.log('built ' + path.relative(root, out));
```

- [ ] **Step 6: Write `shell-legacy/appinfo.json`**

```json
{
  "id": "com.immich.webos",
  "version": "0.2.0",
  "vendor": "Immich",
  "type": "web",
  "main": "index.html",
  "title": "Immich",
  "icon": "icon.png",
  "largeIcon": "largeIcon.png",
  "bgColor": "#111827",
  "resolution": "1920x1080",
  "uiRevision": "2"
}
```

- [ ] **Step 7: Write `shell-legacy/js/dom.js` and `shell-legacy/js/nav.js`**

`dom.js`:
```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  ui.dom = {
    el: function (tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) { n.className = cls; }
      if (text !== undefined) { n.textContent = text; }
      return n;
    },
    clear: function (n) { while (n.firstChild) { n.removeChild(n.firstChild); } },
    toArray: function (list) { return Array.prototype.slice.call(list); },
    show: function (n) { n.classList.remove('hidden'); },
    hide: function (n) { n.classList.add('hidden'); }
  };
}(window));
```

`nav.js` (spatial move for buttons and rows; grids handle their own keys):
```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};

  /* webOS: 37-40 arrows, 13 OK, 461 Back (27 Escape and 8 Backspace for desktop browsers) */
  ui.keys = {
    name: function (code) {
      switch (code) {
        case 37: return 'left';
        case 38: return 'up';
        case 39: return 'right';
        case 40: return 'down';
        case 13: return 'ok';
        case 461: case 27: case 8: return 'back';
        default: return null;
      }
    }
  };

  var current = null;

  function visibleFocusables(scope) {
    return ui.dom.toArray((scope || document).querySelectorAll('.focusable')).filter(function (el) {
      return el.offsetParent !== null && !el.disabled;
    });
  }

  ui.nav = {
    current: function () { return current; },
    setFocus: function (el) {
      if (!el) { return; }
      if (current) { current.classList.remove('focused'); }
      current = el;
      el.classList.add('focused');
    },
    clearFocus: function () {
      if (current) { current.classList.remove('focused'); current = null; }
    },
    focusFirst: function (scope) {
      var list = visibleFocusables(scope);
      if (list.length) { this.setFocus(list[0]); return true; }
      return false;
    },
    /* Weighted spatial move: distance along the direction + 3x the sideways offset. */
    move: function (dir, scope) {
      if (!current) { return this.focusFirst(scope); }
      var c = current.getBoundingClientRect();
      var cx = c.left + c.width / 2, cy = c.top + c.height / 2;
      var best = null, bestScore = Infinity;
      visibleFocusables(scope).forEach(function (el) {
        if (el === current) { return; }
        var r = el.getBoundingClientRect();
        var ex = r.left + r.width / 2, ey = r.top + r.height / 2;
        var primary, side, ok;
        if (dir === 'left')       { ok = ex < cx - 5; primary = cx - ex; side = Math.abs(ey - cy); }
        else if (dir === 'right') { ok = ex > cx + 5; primary = ex - cx; side = Math.abs(ey - cy); }
        else if (dir === 'up')    { ok = ey < cy - 5; primary = cy - ey; side = Math.abs(ex - cx); }
        else                      { ok = ey > cy + 5; primary = ey - cy; side = Math.abs(ex - cx); }
        if (ok && primary + side * 3 < bestScore) { bestScore = primary + side * 3; best = el; }
      });
      if (best) { this.setFocus(best); return true; }
      return false;
    }
  };
}(window));
```

- [ ] **Step 8: Write `shell-legacy/js/app.js` (router) and `shell-legacy/js/main.js` (composition root)**

`app.js`:
```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var views = {}, stack = [], current = null;

  function activate(name, params, restore) {
    if (current) { current.leave(); ui.dom.hide(current.el); }
    current = views[name];
    ui.dom.show(current.el);
    ui.nav.clearFocus();
    current.enter(params || {}, restore || null);
  }

  ui.app = {
    register: function (name, view) { views[name] = view; view.name = name; ui.dom.hide(view.el); },
    go: function (name, params) {
      if (current) { stack.push({ name: current.name, restore: current.snapshot() }); }
      activate(name, params);
    },
    /* Replace the whole stack (used after sign-in / sign-out). */
    reset: function (name, params) { stack = []; activate(name, params); },
    back: function () {
      if (!stack.length) { return; }
      var prev = stack.pop();
      activate(prev.name, null, prev.restore);
    },
    start: function (firstName) {
      document.addEventListener('keydown', function (e) {
        var key = ui.keys.name(e.keyCode);
        if (!key || !current) { return; }
        e.preventDefault();
        if (current.onKey(key)) { return; }
        if (key === 'back') { ui.app.back(); }
      });
      activate(firstName);
    }
  };
}(window));
```

`main.js`:
```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI, core = w.ImmichCore;

  var settings = core.settings.create(core.settings.defaultStorage());
  var client = core.immichClient.create({ http: core.http, getConfig: settings.getCredentials });
  var auth = core.auth.create({ client: client, settings: settings });
  var ctx = { settings: settings, client: client, auth: auth, app: ui.app };

  ui.app.register('setup', ui.createSetupView(ctx));
  ui.app.register('albums', ui.createAlbumsView(ctx));
  ui.app.register('album', ui.createAlbumView(ctx));
  ui.app.register('viewer', ui.createViewerView(ctx));
  ui.app.register('settings', ui.createSettingsView(ctx));

  ui.app.start(auth.isConfigured() ? 'albums' : 'setup');
}(window));
```

- [ ] **Step 9: Write `shell-legacy/index.html` and `shell-legacy/css/app.css`**

Task 8's `index.html` loads only what exists so far. Each later task adds its `<script>` tag (Task 13 shows the final list). `main.js` is added in Task 13.

`shell-legacy/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1920">
  <title>Immich</title>
  <link rel="stylesheet" href="css/app.css">
</head>
<body>
  <div id="root"></div>
  <script src="core/http.js"></script>
  <script src="core/settings.js"></script>
  <script src="core/paging.js"></script>
  <script src="core/immich-client.js"></script>
  <script src="core/auth.js"></script>
  <script src="js/dom.js"></script>
  <script src="js/nav.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

`shell-legacy/css/app.css` (flexbox only; the gate rejects variables, grid, gap, sticky):
```css
html, body { margin: 0; padding: 0; width: 1920px; height: 1080px; overflow: hidden; background: #111827; color: #f3f4f6; font-family: sans-serif; font-size: 28px; }
.hidden { display: none !important; }
#root { position: relative; width: 1920px; height: 1080px; }
.view { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; display: flex; flex-direction: column; }

.topbar { display: flex; align-items: center; height: 110px; padding: 0 60px; flex: none; }
.topbar .title { flex: 1; font-size: 40px; }
.btn { display: inline-block; padding: 14px 34px; margin-right: 20px; background: #374151; border: 3px solid transparent; border-radius: 10px; }
.btn.small { padding: 8px 20px; font-size: 24px; }
.btn.primary { background: #4f46e5; }
.focusable.focused { border-color: #ffffff; background: #6366f1; }
.msg { padding: 30px 60px; color: #9ca3af; }
.msg.error { color: #f87171; }

.grid-host { position: relative; flex: 1; overflow: hidden; margin: 0 30px; }
.grid-inner { position: relative; width: 100%; }
.tile { position: absolute; box-sizing: border-box; padding: 8px; }
.tile-body { position: relative; width: 100%; height: 100%; box-sizing: border-box; background: #1f2937; border: 4px solid transparent; border-radius: 10px; overflow: hidden; }
.tile.focused .tile-body { border-color: #ffffff; }
.cap-img { position: absolute; left: 0; top: 0; right: 0; bottom: 56px; }
.tile-body.plain .cap-img { bottom: 0; }
.cap-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tile-caption { position: absolute; left: 0; right: 0; bottom: 0; height: 56px; line-height: 56px; padding: 0 14px; font-size: 24px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile.list .cap-img { right: auto; width: 200px; bottom: 0; }
.tile.list .tile-caption { left: 216px; top: 0; height: 100%; line-height: 116px; font-size: 30px; }

.setup { align-items: center; justify-content: center; }
.setup-card { width: 1100px; }
.setup-logo { font-size: 72px; margin-bottom: 20px; }
.setup-hint { color: #9ca3af; margin: 0 0 30px 0; }
.field { display: block; margin: 0 0 20px 0; padding: 22px 30px; }
.history { margin: 0 0 20px 0; }

.kb-overlay { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; background: #111827; z-index: 10; padding: 60px 120px; box-sizing: border-box; }
.kb-title { font-size: 36px; color: #9ca3af; }
.kb-display { margin: 20px 0 30px 0; padding: 20px; font-size: 40px; background: #1f2937; border-radius: 10px; min-height: 56px; word-wrap: break-word; }
.kb-row { display: flex; margin-bottom: 14px; }
.kb-key { width: 120px; height: 84px; line-height: 84px; margin-right: 14px; text-align: center; background: #374151; border: 3px solid transparent; border-radius: 10px; font-size: 34px; box-sizing: border-box; }
.kb-key.wide { width: 220px; }
.kb-key.focused { border-color: #ffffff; background: #6366f1; }
.kb-native { position: absolute; left: 120px; top: 190px; width: 1500px; font-size: 40px; z-index: 11; }

.viewer { background: #000000; align-items: center; justify-content: center; }
.viewer-img { max-width: 1920px; max-height: 1080px; object-fit: contain; }
.viewer-counter { position: absolute; right: 40px; bottom: 30px; background: rgba(0, 0, 0, 0.6); padding: 8px 22px; border-radius: 8px; }
.viewer-error { position: absolute; color: #f87171; }

.option { display: flex; justify-content: space-between; width: 1200px; margin: 0 60px 18px 60px; padding: 22px 30px; }
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npm test`
Expected: lint clean, `check-es5: N files OK`, all unit tests pass (including the two build tests; `make-icons` regenerates the icons).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(legacy): restructure into shell-legacy, add router, nav, build script, real icons

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Virtualized grid/list (pure math + DOM component)

**Files:**
- Create: `shell-legacy/js/gridmath.js`, `shell-legacy/js/grid.js`, `tests/legacy/gridmath.test.js`
- Modify: `shell-legacy/index.html` (add two script tags after `js/nav.js`)

**Interfaces:**
- Produces `ui.gridmath`:
  - `layout(mode, columns, width, captionH) -> {cols, cellW, cellH}` (list mode: `cols:1, cellW:width, cellH:132`; grid: `cellW=floor(width/columns)`, `cellH=round(cellW*0.75)+captionH`)
  - `totalRows(count, cols)`, `visibleRange(scrollTop, viewportH, rowH, rows, overscan) -> {first,last}` (inclusive rows; `last=-1` when empty)
  - `moveIndex(index, 'left'|'right'|'up'|'down', cols, count) -> newIndex` (unchanged when blocked)
  - `scrollTopFor(index, cols, rowH, viewportH, scrollTop) -> newScrollTop`
  - `stepValue(list, value, delta) -> value` (clamped, no wrap)
- Produces `ui.createGrid({host, captionH?, renderTile(item,index,mode)->Element, onSelect(item,index), onNeedMore()}) -> {setItems(items), setView(mode,columns), focus(index?), blur(), focusIndex(), handleKey(key)}`. `handleKey` returns `'select'|'moved'|'blocked'|'edge'` (edge = up pressed on first row) or `false` for keys it does not handle.

- [ ] **Step 1: Write the failing test**

`tests/legacy/gridmath.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var g = require('../../shell-legacy/js/gridmath');

test('layout grid and list', function () {
  assert.deepStrictEqual(g.layout('grid', 5, 1860, 0), { cols: 5, cellW: 372, cellH: 279 });
  assert.deepStrictEqual(g.layout('grid', 5, 1860, 50), { cols: 5, cellW: 372, cellH: 329 });
  assert.deepStrictEqual(g.layout('list', 5, 1860, 50), { cols: 1, cellW: 1860, cellH: 132 });
});
test('totalRows', function () {
  assert.strictEqual(g.totalRows(10, 4), 3);
  assert.strictEqual(g.totalRows(0, 4), 0);
});
test('visibleRange includes overscan and clamps', function () {
  assert.deepStrictEqual(g.visibleRange(0, 300, 100, 50, 1), { first: 0, last: 3 });
  assert.deepStrictEqual(g.visibleRange(1000, 300, 100, 50, 2), { first: 8, last: 14 });
  assert.deepStrictEqual(g.visibleRange(4900, 300, 100, 50, 2), { first: 47, last: 49 });
  assert.deepStrictEqual(g.visibleRange(0, 300, 100, 0, 2), { first: 0, last: -1 });
});
test('moveIndex within a 4-column, 10-item grid', function () {
  assert.strictEqual(g.moveIndex(0, 'left', 4, 10), 0);
  assert.strictEqual(g.moveIndex(5, 'left', 4, 10), 4);
  assert.strictEqual(g.moveIndex(3, 'right', 4, 10), 3);
  assert.strictEqual(g.moveIndex(9, 'right', 4, 10), 9);
  assert.strictEqual(g.moveIndex(5, 'up', 4, 10), 1);
  assert.strictEqual(g.moveIndex(1, 'up', 4, 10), 1);
  assert.strictEqual(g.moveIndex(2, 'down', 4, 10), 6);
  assert.strictEqual(g.moveIndex(6, 'down', 4, 10), 9);
  assert.strictEqual(g.moveIndex(9, 'down', 4, 10), 9);
});
test('moveIndex in list mode (1 column)', function () {
  assert.strictEqual(g.moveIndex(2, 'down', 1, 5), 3);
  assert.strictEqual(g.moveIndex(0, 'up', 1, 5), 0);
  assert.strictEqual(g.moveIndex(2, 'right', 1, 5), 2);
});
test('scrollTopFor keeps the focused row fully visible', function () {
  assert.strictEqual(g.scrollTopFor(20, 4, 100, 300, 0), 300);
  assert.strictEqual(g.scrollTopFor(0, 4, 100, 300, 300), 0);
  assert.strictEqual(g.scrollTopFor(9, 4, 100, 300, 100), 100);
});
test('stepValue clamps at both ends', function () {
  assert.strictEqual(g.stepValue([3, 4, 5], 4, 1), 5);
  assert.strictEqual(g.stepValue([3, 4, 5], 5, 1), 5);
  assert.strictEqual(g.stepValue([3, 4, 5], 3, -1), 3);
  assert.strictEqual(g.stepValue([3, 4, 5], 99, 1), 4);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/legacy/gridmath.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `shell-legacy/js/gridmath.js`**

```js
(function (root) {
  'use strict';
  var ui = root.ImmichUI = root.ImmichUI || {};

  function layout(mode, columns, width, captionH) {
    if (mode === 'list') { return { cols: 1, cellW: width, cellH: 132 }; }
    var cellW = Math.floor(width / columns);
    return { cols: columns, cellW: cellW, cellH: Math.round(cellW * 0.75) + (captionH || 0) };
  }
  function totalRows(count, cols) { return Math.ceil(count / cols); }
  function visibleRange(scrollTop, viewportH, rowH, rows, overscan) {
    if (rows === 0) { return { first: 0, last: -1 }; }
    return {
      first: Math.max(0, Math.floor(scrollTop / rowH) - overscan),
      last: Math.min(rows - 1, Math.ceil((scrollTop + viewportH) / rowH) - 1 + overscan)
    };
  }
  function moveIndex(index, dir, cols, count) {
    var row = Math.floor(index / cols);
    var lastRow = Math.floor((count - 1) / cols);
    if (dir === 'left') { return index % cols === 0 ? index : index - 1; }
    if (dir === 'right') { return (index % cols === cols - 1 || index === count - 1) ? index : index + 1; }
    if (dir === 'up') { return row === 0 ? index : index - cols; }
    if (dir === 'down') {
      if (index + cols < count) { return index + cols; }
      return row < lastRow ? count - 1 : index;
    }
    return index;
  }
  function scrollTopFor(index, cols, rowH, viewportH, scrollTop) {
    var top = Math.floor(index / cols) * rowH;
    var bottom = top + rowH;
    if (top < scrollTop) { return top; }
    if (bottom > scrollTop + viewportH) { return bottom - viewportH; }
    return scrollTop;
  }
  function stepValue(list, value, delta) {
    var i = list.indexOf(value);
    if (i < 0) { i = 0; }
    return list[Math.min(list.length - 1, Math.max(0, i + delta))];
  }

  var api = { layout: layout, totalRows: totalRows, visibleRange: visibleRange, moveIndex: moveIndex, scrollTopFor: scrollTopFor, stepValue: stepValue };
  ui.gridmath = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/legacy/gridmath.test.js`
Expected: 7 tests pass.

- [ ] **Step 5: Implement `shell-legacy/js/grid.js` (DOM component, windowed rendering)**

```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var g = ui.gridmath, dom = ui.dom;
  var OVERSCAN = 2;

  ui.createGrid = function (opts) {
    var host = opts.host;
    var inner = dom.el('div', 'grid-inner');
    host.appendChild(inner);
    var items = [], tiles = {};
    var mode = 'grid', columns = 5, lay = null;
    var focusIndex = 0, hasFocus = false, scrollTop = 0;

    function removeTile(key) {
      var t = tiles[key];
      if (!t) { return; }
      var img = t.getElementsByTagName('img')[0];
      if (img) { img.removeAttribute('src'); }   /* cancel loads for tiles that scrolled away */
      inner.removeChild(t);
      delete tiles[key];
    }
    function addTile(i) {
      var t = dom.el('div', 'tile' + (mode === 'list' ? ' list' : ''));
      t.style.left = ((i % lay.cols) * lay.cellW) + 'px';
      t.style.top = (Math.floor(i / lay.cols) * lay.cellH) + 'px';
      t.style.width = lay.cellW + 'px';
      t.style.height = lay.cellH + 'px';
      t.appendChild(opts.renderTile(items[i], i, mode));
      if (hasFocus && i === focusIndex) { t.classList.add('focused'); }
      inner.appendChild(t);
      tiles[i] = t;
    }
    function render() {
      if (!lay) { return; }
      var rows = g.totalRows(items.length, lay.cols);
      var r = g.visibleRange(scrollTop, host.clientHeight, lay.cellH, rows, OVERSCAN);
      var first = r.first * lay.cols;
      var last = Math.min(items.length - 1, (r.last + 1) * lay.cols - 1);
      Object.keys(tiles).forEach(function (k) {
        var i = parseInt(k, 10);
        if (i < first || i > last) { removeTile(k); }
      });
      var i;
      for (i = first; i <= last; i++) { if (!tiles[i]) { addTile(i); } }
    }
    function relayout() {
      Object.keys(tiles).forEach(removeTile);
      lay = g.layout(mode, columns, host.clientWidth, opts.captionH || 0);
      inner.style.height = (g.totalRows(items.length, lay.cols) * lay.cellH) + 'px';
      host.scrollTop = scrollTop;
      render();
    }
    function setFocusIndex(i) {
      if (tiles[focusIndex]) { tiles[focusIndex].classList.remove('focused'); }
      focusIndex = i;
      var st = g.scrollTopFor(i, lay.cols, lay.cellH, host.clientHeight, scrollTop);
      if (st !== scrollTop) { scrollTop = st; host.scrollTop = st; }
      render();
      if (hasFocus && tiles[i]) { tiles[i].classList.add('focused'); }
      if (opts.onNeedMore && i >= items.length - lay.cols * 3) { opts.onNeedMore(); }
    }

    return {
      setItems: function (list) {
        items = list;
        if (focusIndex > items.length - 1) { focusIndex = Math.max(0, items.length - 1); }
        relayout();
      },
      setView: function (m, c) { mode = m; columns = c; if (lay) { relayout(); } else { lay = g.layout(mode, columns, host.clientWidth, opts.captionH || 0); } },
      focus: function (i) { hasFocus = true; setFocusIndex(i === undefined ? focusIndex : Math.min(i, Math.max(0, items.length - 1))); },
      blur: function () { hasFocus = false; if (tiles[focusIndex]) { tiles[focusIndex].classList.remove('focused'); } },
      focusIndex: function () { return focusIndex; },
      handleKey: function (key) {
        if (key === 'ok') { if (items.length) { opts.onSelect(items[focusIndex], focusIndex); } return 'select'; }
        if (key !== 'left' && key !== 'right' && key !== 'up' && key !== 'down') { return false; }
        var n = g.moveIndex(focusIndex, key, lay.cols, items.length);
        if (n === focusIndex) { return key === 'up' ? 'edge' : 'blocked'; }
        setFocusIndex(n);
        return 'moved';
      }
    };
  };
}(window));
```

- [ ] **Step 6: Add script tags and run the full suite**

In `shell-legacy/index.html`, after `<script src="js/nav.js"></script>` add:
```html
  <script src="js/gridmath.js"></script>
  <script src="js/grid.js"></script>
```
Run: `npm test`
Expected: everything passes.

- [ ] **Step 7: Commit**

```bash
git add shell-legacy tests/legacy
git commit -m "feat(legacy): windowed grid/list with index-based D-pad navigation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: On-screen D-pad keyboard and Setup view

**Files:**
- Create: `shell-legacy/js/keyboard-model.js`, `shell-legacy/js/keyboard.js`, `shell-legacy/js/view-setup.js`, `tests/legacy/keyboard-model.test.js`
- Modify: `shell-legacy/js/app.js` (ignore key events that originate in an `<input>`), `shell-legacy/js/nav.js` (drop Backspace=8 from the back keys), `shell-legacy/index.html`

**Interfaces:**
- Consumes: `dom`, `nav`, `keys` (Task 8), `ctx.auth.connect`, `ctx.settings.getCredentials/getUrlHistory` (Tasks 4, 7), `ctx.app.reset`.
- Produces: `ui.keyboardModel.create({initial, masked, shortcuts}) -> {rows(), cursor(), text(), setText(t), display(), move(dir)->bool, press()->action}` where `action` is `'char'|'text'|'shift'|'backspace'|'clear'|'reveal'|'native'|'done'`; `ui.openKeyboard({title, initial, masked, shortcuts, onDone(text), onCancel()}) -> {onKey(key)->true}`; `ui.createSetupView(ctx) -> view`.

- [ ] **Step 1: Write the failing keyboard-model test**

`tests/legacy/keyboard-model.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var km = require('../../shell-legacy/js/keyboard-model');

function press(m, dirs) { dirs.forEach(function (d) { m.move(d); }); return m.press(); }

test('starts on "1" and types characters', function () {
  var m = km.create({ initial: '' });
  assert.strictEqual(m.press(), 'char');
  press(m, ['down']);                 /* q */
  assert.strictEqual(m.text(), '1q');
});
test('shift toggles case for following characters', function () {
  var m = km.create({ initial: '' });
  m.move('down'); m.move('down'); m.move('down'); m.move('down');    /* row 4 = action row (no shortcuts) */
  assert.strictEqual(m.rows()[4][0].action, 'shift');
  assert.strictEqual(m.press(), 'shift');
  m.move('up'); m.move('up'); m.move('up'); m.move('up');
  m.move('down');                                                   /* row 1: q */
  assert.strictEqual(m.rows()[1][0].label, 'Q');
  m.press();
  assert.strictEqual(m.text(), 'Q');
});
test('backspace, clear and done', function () {
  var m = km.create({ initial: 'abc' });
  var act = m.rows().length - 1;
  for (var i = 0; i < act; i++) { m.move('down'); }
  m.move('right');
  assert.strictEqual(m.press(), 'backspace'); assert.strictEqual(m.text(), 'ab');
  m.move('right');
  assert.strictEqual(m.press(), 'clear'); assert.strictEqual(m.text(), '');
  for (var j = 0; j < 10; j++) { m.move('right'); }
  assert.strictEqual(m.press(), 'done');
});
test('shortcut keys append text', function () {
  var m = km.create({ initial: '', shortcuts: ['https://', '.com'] });
  for (var i = 0; i < 4; i++) { m.move('down'); }
  assert.strictEqual(m.press(), 'text');
  assert.strictEqual(m.text(), 'https://');
});
test('masked display hides text until revealed', function () {
  var m = km.create({ initial: 'secret', masked: true });
  assert.strictEqual(m.display(), '******');
  var act = m.rows().length - 1;
  for (var i = 0; i < act; i++) { m.move('down'); }
  m.move('right'); m.move('right'); m.move('right');
  assert.strictEqual(m.rows()[act][3].action, 'reveal');
  m.press();
  assert.strictEqual(m.display(), 'secret');
});
test('move reports edges and clamps the column on shorter rows', function () {
  var m = km.create({ initial: '' });
  assert.strictEqual(m.move('left'), false);
  assert.strictEqual(m.move('up'), false);
  for (var i = 0; i < 9; i++) { m.move('right'); }
  assert.deepStrictEqual(m.cursor(), { row: 0, col: 9 });
  for (var j = 0; j < 4; j++) { m.move('down'); }               /* action row is shorter */
  assert.ok(m.cursor().col <= m.rows()[4].length - 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/legacy/keyboard-model.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `shell-legacy/js/keyboard-model.js`**

```js
(function (root) {
  'use strict';
  var ui = root.ImmichUI = root.ImmichUI || {};
  var CHAR_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl-', 'zxcvbnm._:/'];

  function create(opts) {
    var text = opts.initial || '';
    var upper = false, reveal = false, r = 0, c = 0;

    function rows() {
      var out = CHAR_ROWS.map(function (s) {
        return s.split('').map(function (ch) {
          var v = upper ? ch.toUpperCase() : ch;
          return { label: v, action: 'char', value: v };
        });
      });
      if (opts.shortcuts && opts.shortcuts.length) {
        out.push(opts.shortcuts.map(function (s) { return { label: s, action: 'text', value: s }; }));
      }
      var acts = [{ label: 'Shift', action: 'shift' }, { label: 'Del', action: 'backspace' }, { label: 'Clear', action: 'clear' }];
      if (opts.masked) { acts.push({ label: reveal ? 'Hide' : 'Show', action: 'reveal' }); }
      acts.push({ label: 'TV keyboard', action: 'native' }, { label: 'Done', action: 'done' });
      out.push(acts);
      return out;
    }

    return {
      rows: rows,
      cursor: function () { return { row: r, col: c }; },
      text: function () { return text; },
      setText: function (t) { text = t; },
      display: function () { return (!opts.masked || reveal) ? text : text.replace(/./g, '*'); },
      move: function (dir) {
        var n = rows();
        var nr = r, nc = c;
        if (dir === 'left') { nc = Math.max(0, c - 1); }
        else if (dir === 'right') { nc = Math.min(n[r].length - 1, c + 1); }
        else if (dir === 'up') { nr = Math.max(0, r - 1); }
        else if (dir === 'down') { nr = Math.min(n.length - 1, r + 1); }
        var moved = nr !== r || nc !== c;
        r = nr; c = Math.min(nc, n[nr].length - 1);
        return moved;
      },
      press: function () {
        var k = rows()[r][c];
        if (k.action === 'char' || k.action === 'text') { text += k.value; }
        else if (k.action === 'backspace') { text = text.slice(0, -1); }
        else if (k.action === 'clear') { text = ''; }
        else if (k.action === 'shift') { upper = !upper; }
        else if (k.action === 'reveal') { reveal = !reveal; }
        return k.action;
      }
    };
  }

  var api = { create: create };
  ui.keyboardModel = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/legacy/keyboard-model.test.js`
Expected: 6 tests pass.

- [ ] **Step 5: Implement `shell-legacy/js/keyboard.js` (overlay, with a "TV keyboard" fallback)**

```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  ui.openKeyboard = function (opts) {
    var model = ui.keyboardModel.create(opts);
    var overlay = dom.el('div', 'kb-overlay');
    var display = dom.el('div', 'kb-display');
    var grid = dom.el('div', 'kb-grid');
    var input = dom.el('input', 'kb-native hidden');
    var nativeOpen = false;
    overlay.appendChild(dom.el('div', 'kb-title', opts.title));
    overlay.appendChild(display);
    overlay.appendChild(grid);
    overlay.appendChild(input);
    document.getElementById('root').appendChild(overlay);

    function draw() {
      var cur = model.cursor();
      display.textContent = model.display() + '_';
      dom.clear(grid);
      model.rows().forEach(function (row, ri) {
        var line = dom.el('div', 'kb-row');
        row.forEach(function (k, ci) {
          var cls = 'kb-key' + (k.action === 'char' ? '' : ' wide') + (ri === cur.row && ci === cur.col ? ' focused' : '');
          line.appendChild(dom.el('div', cls, k.label));
        });
        grid.appendChild(line);
      });
    }
    function close() { if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); } }
    /* The TV's own keyboard edits a real <input>; copy its value back when it closes. */
    function endNative() {
      if (!nativeOpen) { return; }
      nativeOpen = false;
      model.setText(input.value);
      dom.hide(input);
      draw();
    }
    input.onkeydown = function (e) { if (e.keyCode === 13) { input.blur(); } };
    input.onblur = endNative;
    draw();

    return {
      onKey: function (key) {
        if (nativeOpen) { return true; }
        if (key === 'back') { close(); opts.onCancel(); return true; }
        if (key !== 'ok') { model.move(key); draw(); return true; }
        var action = model.press();
        if (action === 'done') { close(); opts.onDone(model.text()); return true; }
        if (action === 'native') {
          nativeOpen = true;
          input.type = opts.masked ? 'password' : 'text';
          input.value = model.text();
          dom.show(input);
          input.focus();
          return true;
        }
        draw();
        return true;
      }
    };
  };
}(window));
```

- [ ] **Step 6: Implement `shell-legacy/js/view-setup.js`**

```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  ui.createSetupView = function (ctx) {
    var el = dom.el('div', 'view setup');
    document.getElementById('root').appendChild(el);
    var values = { url: '', key: '' };
    var kb = null, busy = false;

    var card = dom.el('div', 'setup-card');
    var urlBtn = dom.el('div', 'btn focusable field');
    var keyBtn = dom.el('div', 'btn focusable field');
    var connectBtn = dom.el('div', 'btn focusable primary', 'Connect');
    var history = dom.el('div', 'history');
    var msg = dom.el('div', 'msg');
    card.appendChild(dom.el('div', 'setup-logo', 'Immich'));
    card.appendChild(dom.el('p', 'setup-hint', 'In Immich open Account Settings > API Keys > New API Key, then enter the server address and the key here with the remote.'));
    [urlBtn, keyBtn, history, connectBtn, msg].forEach(function (n) { card.appendChild(n); });
    el.appendChild(card);

    function setMsg(text, isError) { msg.textContent = text; msg.className = 'msg' + (isError ? ' error' : ''); }
    function label() {
      urlBtn.textContent = 'Server address:  ' + (values.url || '(not set)');
      keyBtn.textContent = 'API key:  ' + (values.key ? '******** (' + values.key.length + ' characters)' : '(not set)');
    }
    function edit(which) {
      kb = ui.openKeyboard({
        title: which === 'url' ? 'Server address' : 'API key',
        initial: values[which],
        masked: which === 'key',
        shortcuts: which === 'url' ? ['https://', 'http://', '.com', ':2283'] : [],
        onDone: function (t) { values[which] = t; kb = null; label(); },
        onCancel: function () { kb = null; }
      });
    }
    function renderHistory() {
      dom.clear(history);
      ctx.settings.getUrlHistory().forEach(function (u) {
        var b = dom.el('div', 'btn focusable small', u);
        b.onclick = function () { values.url = u; label(); };
        history.appendChild(b);
      });
    }

    urlBtn.onclick = function () { edit('url'); };
    keyBtn.onclick = function () { edit('key'); };
    connectBtn.onclick = function () {
      if (busy) { return; }
      busy = true;
      setMsg('Connecting...', false);
      ctx.auth.connect(values.url, values.key).then(function () {
        busy = false;
        ctx.app.reset('albums');
      }, function (err) {
        busy = false;
        setMsg(err.message, true);
      });
    };

    return {
      el: el,
      enter: function () {
        var saved = ctx.settings.getCredentials();
        values.url = saved.serverUrl || ctx.settings.getUrlHistory()[0] || '';
        values.key = '';
        kb = null;
        setMsg('', false);
        label();
        renderHistory();
        ui.nav.focusFirst(el);
      },
      leave: function () { kb = null; },
      snapshot: function () { return null; },
      onKey: function (key) {
        if (kb) { return kb.onKey(key); }
        if (key === 'ok') { var cur = ui.nav.current(); if (cur) { cur.onclick(); } return true; }
        if (key === 'back') { return false; }
        ui.nav.move(key, el);
        return true;
      }
    };
  };
}(window));
```

- [ ] **Step 7: Guard native input events in the router and drop Backspace as "back"**

In `shell-legacy/js/app.js`, in the `keydown` handler, add as the first line inside the function:
```js
        if (e.target && e.target.tagName === 'INPUT') { return; }
```
In `shell-legacy/js/nav.js`, change `case 461: case 27: case 8: return 'back';` to `case 461: case 27: return 'back';` (Backspace must edit text in the TV-keyboard input).

- [ ] **Step 8: Add script tags and run the suite**

In `index.html`, after `js/grid.js`, add tags for `js/keyboard-model.js`, `js/keyboard.js`, `js/view-setup.js`.
Run: `npm test`
Expected: everything passes.

- [ ] **Step 9: Commit**

```bash
git add shell-legacy tests/legacy
git commit -m "feat(legacy): D-pad on-screen keyboard and Setup view (URL + API key)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Albums and Album (photos) views

**Files:**
- Create: `shell-legacy/js/view-albums.js`, `shell-legacy/js/view-album.js`
- Modify: `shell-legacy/index.html`

**Interfaces:**
- Consumes: `ui.createGrid` (Task 9), `ctx.client.{listAlbums,getAlbum,searchPage,thumbnailUrl}`, `ctx.settings.getView`, `ctx.app.{go,back}`, `ImmichCore.paging.createPager`.
- Produces: `ui.createAlbumsView(ctx)`, `ui.createAlbumView(ctx)` (views per the router contract). The album view is entered with `{albumId, title}` or `{all:true, title}`; it opens the viewer with `{assets, index}` and, on return, focuses `ctx.viewerIndex` (set by the viewer, Task 12).

- [ ] **Step 1: Implement `shell-legacy/js/view-albums.js`**

```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  ui.createAlbumsView = function (ctx) {
    var el = dom.el('div', 'view');
    document.getElementById('root').appendChild(el);
    var bar = dom.el('div', 'topbar');
    var allBtn = dom.el('div', 'btn focusable', 'All photos');
    var setBtn = dom.el('div', 'btn focusable', 'Settings');
    bar.appendChild(dom.el('div', 'title', 'Albums'));
    bar.appendChild(allBtn);
    bar.appendChild(setBtn);
    var msg = dom.el('div', 'msg hidden');
    var host = dom.el('div', 'grid-host');
    [bar, msg, host].forEach(function (n) { el.appendChild(n); });

    var zone = 'grid', albums = [];

    var grid = ui.createGrid({
      host: host,
      captionH: 56,
      renderTile: function (a) {
        var body = dom.el('div', 'tile-body');
        var box = dom.el('div', 'cap-img');
        if (a.coverId) { var img = dom.el('img'); img.src = ctx.client.thumbnailUrl(a.coverId, 'thumbnail'); box.appendChild(img); }
        body.appendChild(box);
        body.appendChild(dom.el('div', 'tile-caption', a.name + ' (' + a.count + ')'));
        return body;
      },
      onSelect: function (a) { ctx.app.go('album', { albumId: a.id, title: a.name }); }
    });

    function showMsg(text, isError) { msg.textContent = text; msg.className = 'msg' + (isError ? ' error' : ''); }
    function toBar() { zone = 'bar'; grid.blur(); ui.nav.focusFirst(bar); }
    function load(restore) {
      showMsg('Loading albums...', false);
      var v = ctx.settings.getView();
      ctx.client.listAlbums().then(function (list) {
        albums = list;
        dom.hide(msg);
        grid.setView(v.viewMode, v.columns);
        grid.setItems(albums);
        if (!albums.length) { showMsg('No albums yet. Use "All photos".', false); dom.show(msg); toBar(); return; }
        zone = 'grid';
        ui.nav.clearFocus();
        grid.focus(restore ? restore.index : 0);
      }, function (err) { showMsg(err.message, true); toBar(); });
    }

    allBtn.onclick = function () { ctx.app.go('album', { all: true, title: 'All photos' }); };
    setBtn.onclick = function () { ctx.app.go('settings'); };

    return {
      el: el,
      enter: function (params, restore) { zone = 'grid'; load(restore); },
      leave: function () { grid.blur(); ui.nav.clearFocus(); },
      snapshot: function () { return { index: grid.focusIndex() }; },
      onKey: function (key) {
        if (zone === 'grid') {
          var r = grid.handleKey(key);
          if (r === 'edge') { toBar(); return true; }
          return !!r;
        }
        if (key === 'down' && albums.length) { zone = 'grid'; ui.nav.clearFocus(); grid.focus(); return true; }
        if (key === 'ok') { var cur = ui.nav.current(); if (cur) { cur.onclick(); } return true; }
        if (key === 'left' || key === 'right') { ui.nav.move(key, bar); return true; }
        return key === 'up' || key === 'down';
      }
    };
  };
}(window));
```

- [ ] **Step 2: Implement `shell-legacy/js/view-album.js`**

```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  ui.createAlbumView = function (ctx) {
    var el = dom.el('div', 'view');
    document.getElementById('root').appendChild(el);
    var bar = dom.el('div', 'topbar');
    var backBtn = dom.el('div', 'btn focusable', 'Back');
    var titleEl = dom.el('div', 'title');
    bar.appendChild(backBtn);
    bar.appendChild(titleEl);
    var msg = dom.el('div', 'msg hidden');
    var host = dom.el('div', 'grid-host');
    [bar, msg, host].forEach(function (n) { el.appendChild(n); });

    var zone = 'grid', items = [], pager = null, loadedKey = null, view = ctx.settings.getView();

    var grid = ui.createGrid({
      host: host,
      captionH: 0,
      renderTile: function (a) {
        var body = dom.el('div', 'tile-body plain');
        var box = dom.el('div', 'cap-img');
        var img = dom.el('img');
        img.src = ctx.client.thumbnailUrl(a.id, view.thumbSize);
        box.appendChild(img);
        body.appendChild(box);
        return body;
      },
      onSelect: function (a, i) { ctx.app.go('viewer', { assets: items, index: i }); },
      onNeedMore: function () {
        if (!pager || !pager.hasMore()) { return; }
        pager.loadNext().then(function () { items = pager.items(); grid.setItems(items); }, function () {});
      }
    });

    function showMsg(text, isError) { msg.textContent = text; msg.className = 'msg' + (isError ? ' error' : ''); }
    function toBar() { zone = 'bar'; grid.blur(); ui.nav.focusFirst(bar); }
    function showGrid(index) {
      dom.hide(msg);
      grid.setView(view.viewMode, view.columns);
      grid.setItems(items);
      if (!items.length) { showMsg('No photos here.', false); dom.show(msg); toBar(); return; }
      zone = 'grid';
      ui.nav.clearFocus();
      grid.focus(index);
    }
    function load(params) {
      showMsg('Loading...', false);
      var p;
      if (params.all) {
        pager = w.ImmichCore.paging.createPager(function (n) { return ctx.client.searchPage(n, 60); });
        p = pager.loadNext().then(function () { return pager.items(); });
      } else {
        pager = null;
        p = ctx.client.getAlbum(params.albumId).then(function (a) { return a.assets; });
      }
      p.then(function (list) { items = list; showGrid(0); }, function (err) { showMsg(err.message, true); toBar(); });
    }

    backBtn.onclick = function () { ctx.app.back(); };

    return {
      el: el,
      enter: function (params, restore) {
        view = ctx.settings.getView();
        if (restore && loadedKey) {                    /* coming back from the viewer: reuse loaded data */
          showGrid(ctx.viewerIndex !== undefined ? ctx.viewerIndex : restore.index);
          return;
        }
        loadedKey = params.all ? 'all' : params.albumId;
        titleEl.textContent = params.title || '';
        zone = 'grid';
        load(params);
      },
      leave: function () { grid.blur(); ui.nav.clearFocus(); },
      snapshot: function () { return { index: grid.focusIndex() }; },
      onKey: function (key) {
        if (zone === 'grid') {
          var r = grid.handleKey(key);
          if (r === 'edge') { toBar(); return true; }
          return !!r;
        }
        if (key === 'down' && items.length) { zone = 'grid'; ui.nav.clearFocus(); grid.focus(); return true; }
        if (key === 'ok') { ctx.app.back(); return true; }
        return key === 'up' || key === 'left' || key === 'right' || key === 'down';
      }
    };
  };
}(window));
```

- [ ] **Step 3: Add script tags and run the suite**

In `index.html`, after `js/view-setup.js`, add tags for `js/view-albums.js` and `js/view-album.js`.
Run: `npm test`
Expected: lint clean, gate OK, all tests pass. (The DOM views are exercised in Task 13's smoke test.)

- [ ] **Step 4: Commit**

```bash
git add shell-legacy
git commit -m "feat(legacy): albums and album/all-photos views

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Photo viewer

**Files:**
- Create: `shell-legacy/js/view-viewer.js`
- Modify: `shell-legacy/index.html`

**Interfaces:**
- Consumes: `ctx.client.viewerUrl`. Entered with `{assets:[{id,name}], index}`.
- Produces: `ui.createViewerView(ctx)`. Writes `ctx.viewerIndex` on every step so the album view can focus the last viewed photo on return.

- [ ] **Step 1: Implement `shell-legacy/js/view-viewer.js`**

```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  ui.createViewerView = function (ctx) {
    var el = dom.el('div', 'view viewer');
    document.getElementById('root').appendChild(el);
    var img = dom.el('img', 'viewer-img');
    var counter = dom.el('div', 'viewer-counter');
    var error = dom.el('div', 'viewer-error hidden', 'Could not load this photo.');
    [img, counter, error].forEach(function (n) { el.appendChild(n); });
    var assets = [], index = 0, timer = null;

    function flashCounter() {
      counter.textContent = (index + 1) + ' / ' + assets.length;
      dom.show(counter);
      clearTimeout(timer);
      timer = setTimeout(function () { dom.hide(counter); }, 3000);
    }
    function show() {
      dom.hide(error);
      img.src = ctx.client.viewerUrl(assets[index].id);
      ctx.viewerIndex = index;
      flashCounter();
      if (index + 1 < assets.length) { new Image().src = ctx.client.viewerUrl(assets[index + 1].id); }
    }
    img.onerror = function () { dom.show(error); };

    return {
      el: el,
      enter: function (params) { assets = params.assets; index = params.index; show(); },
      leave: function () { clearTimeout(timer); img.removeAttribute('src'); },
      snapshot: function () { return null; },
      onKey: function (key) {
        if (key === 'left') { if (index > 0) { index--; show(); } return true; }
        if (key === 'right') { if (index < assets.length - 1) { index++; show(); } return true; }
        if (key === 'ok' || key === 'up' || key === 'down') { flashCounter(); return true; }
        return false;
      }
    };
  };
}(window));
```

- [ ] **Step 2: Add the script tag and run the suite**

In `index.html`, after `js/view-album.js`, add `<script src="js/view-viewer.js"></script>`.
Run: `npm test`
Expected: everything passes.

- [ ] **Step 3: Commit**

```bash
git add shell-legacy
git commit -m "feat(legacy): fullscreen photo viewer with prev/next and preload

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Settings view, wiring, browser smoke test

**Files:**
- Create: `shell-legacy/js/view-settings.js`
- Modify: `shell-legacy/index.html` (final script list)

**Interfaces:**
- Consumes: `ui.gridmath.stepValue` (Task 9), `ctx.settings.{getView,saveView}`, `ctx.auth.signOut`, `ctx.app.{back,reset}`.
- Produces: `ui.createSettingsView(ctx)`. Rows step with Left/Right and persist immediately.

- [ ] **Step 1: Implement `shell-legacy/js/view-settings.js`**

```js
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;

  var ROWS = [
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

    var rowEls = ROWS.map(function (row) {
      var r = dom.el('div', 'btn focusable option');
      var value = dom.el('span');
      r.appendChild(dom.el('span', '', row.label));
      r.appendChild(value);
      r.render = function () {
        var v = current[row.key];
        value.textContent = '<  ' + (row.names ? row.names[v] : v) + '  >';
      };
      r.step = function (delta) {
        current[row.key] = ui.gridmath.stepValue(row.values, current[row.key], delta);
        ctx.settings.saveView(current);
        r.render();
      };
      el.appendChild(r);
      return r;
    });
    var signOut = dom.el('div', 'btn focusable option', 'Sign out and forget the server');
    el.appendChild(signOut);

    backBtn.onclick = function () { ctx.app.back(); };
    signOut.onclick = function () { ctx.auth.signOut(); ctx.app.reset('setup'); };

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

- [ ] **Step 2: Write the final script list in `shell-legacy/index.html`**

Replace the script block with (order matters):
```html
  <script src="core/http.js"></script>
  <script src="core/settings.js"></script>
  <script src="core/paging.js"></script>
  <script src="core/immich-client.js"></script>
  <script src="core/auth.js"></script>
  <script src="js/dom.js"></script>
  <script src="js/nav.js"></script>
  <script src="js/gridmath.js"></script>
  <script src="js/grid.js"></script>
  <script src="js/keyboard-model.js"></script>
  <script src="js/keyboard.js"></script>
  <script src="js/view-setup.js"></script>
  <script src="js/view-albums.js"></script>
  <script src="js/view-album.js"></script>
  <script src="js/view-viewer.js"></script>
  <script src="js/view-settings.js"></script>
  <script src="js/app.js"></script>
  <script src="js/main.js"></script>
```
(`app.js` runs after all views are defined but before `main.js` registers them; `main.js` is the composition root written in Task 8.)

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: lint clean, gate OK (every referenced script exists), all unit and build tests pass.

- [ ] **Step 4: Desktop-browser smoke test against the real server (manual)**

Run: `npm run serve:legacy` then open `http://localhost:8080` in Chromium. Use arrow keys, Enter, Escape (Back).
Expected:
1. Setup screen. Enter the server address and API key with the on-screen keyboard (keyboard focus moves with arrows, Enter types). Connect shows "Connecting..." then the Albums screen.
2. Albums grid shows covers and names; Enter opens an album; photos load as thumbnails; Escape returns with focus on the same album.
3. "All photos" scrolls and loads more pages near the end.
4. Enter on a photo opens the viewer; Left/Right step; Escape returns focused on the last viewed photo.
5. Settings: change Layout to List and Columns to 3; go back; layout changes; reload the page and it persists.
6. DevTools console shows no errors. If thumbnails fail with 401, revisit Task 6 Step 1 (the `apiKey` query assumption).

- [ ] **Step 5: Commit**

```bash
git add shell-legacy
git commit -m "feat(legacy): settings view and final wiring

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: Enact shell scaffold, shared-core sync, Setup screen

**Files:**
- Create: `shell-enact/` (via the Enact CLI), `tools/sync-core.js`, `tests/tools/sync-core.test.js`, `shell-enact/src/services.js`, `shell-enact/src/views/SetupView.js`
- Modify: `shell-enact/src/App/App.js`, `shell-enact/webos-meta/appinfo.json`, `shell-enact/package.json` (scripts), `.gitignore`

**Interfaces:**
- Produces: `sync.sync(srcDir, dstDir)` (copies `*.js` from `core/` into `shell-enact/src/core/`); `src/services.js` default export `{settings, client, auth, paging}` built from `window.ImmichCore`; view components take `{nav, params, ...rest}` where `nav = {push(name, params), pop(), reset(name)}`.

- [ ] **Step 1: Write the failing sync test**

`tests/tools/sync-core.test.js`:
```js
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var sync = require('../../tools/sync-core');

test('sync copies core js files, adds a generated marker, removes stale files', function () {
  var dst = fs.mkdtempSync(path.join(os.tmpdir(), 'core-'));
  fs.writeFileSync(path.join(dst, 'stale.js'), 'x');
  sync.sync(path.join(__dirname, '..', '..', 'core'), dst);
  assert.ok(fs.existsSync(path.join(dst, 'http.js')));
  assert.ok(fs.existsSync(path.join(dst, 'auth.js')));
  assert.ok(!fs.existsSync(path.join(dst, 'stale.js')));
  assert.match(fs.readFileSync(path.join(dst, 'README.txt'), 'utf8'), /GENERATED/);
  assert.strictEqual(fs.readFileSync(path.join(dst, 'http.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'http.js'), 'utf8'));
});
```

- [ ] **Step 2: Run to verify it fails, then implement `tools/sync-core.js`**

Run: `node --test tests/tools/sync-core.test.js` — Expected: FAIL, module not found.

```js
var fs = require('fs');
var path = require('path');

function sync(srcDir, dstDir) {
  fs.rmSync(dstDir, { recursive: true, force: true });
  fs.mkdirSync(dstDir, { recursive: true });
  fs.readdirSync(srcDir).forEach(function (f) {
    if (/\.js$/.test(f)) { fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f)); }
  });
  fs.writeFileSync(path.join(dstDir, 'README.txt'), 'GENERATED by tools/sync-core.js from /core. Do not edit here.\n');
}

module.exports = { sync: sync };
if (require.main === module) {
  var root = path.join(__dirname, '..');
  sync(path.join(root, 'core'), process.argv[2] || path.join(root, 'shell-enact', 'src', 'core'));
  console.log('core synced');
}
```
Run: `node --test tests/tools/sync-core.test.js` — Expected: PASS.

- [ ] **Step 3: Scaffold the Enact app**

Run: `npx @enact/cli create shell-enact` and choose the **sandstone** template when prompted; then `cd shell-enact && npm install`.
Expected: `shell-enact/` with `package.json`, `src/App/App.js`, `src/index.js`, `webos-meta/appinfo.json`. If the CLI's prompts differ, pick the Sandstone starter and note the version in `docs/TESTING.md`. Delete any template sample view files under `src/views/` (they are replaced below).

- [ ] **Step 4: Configure the app, scripts and ignores**

`shell-enact/webos-meta/appinfo.json`:
```json
{
  "id": "com.immich.webos.enact",
  "version": "0.2.0",
  "vendor": "Immich",
  "type": "web",
  "main": "index.html",
  "title": "Immich (Enact)",
  "icon": "icon.png",
  "largeIcon": "largeIcon.png",
  "bgColor": "#111827",
  "resolution": "1920x1080",
  "uiRevision": "2"
}
```
Run: `cp shell-legacy/icon.png shell-legacy/largeIcon.png shell-enact/webos-meta/`
In `shell-enact/package.json` set scripts: `"serve": "node ../tools/sync-core.js && enact serve"`, `"pack": "node ../tools/sync-core.js && enact pack"` (keep the template's other scripts).
Append to root `.gitignore`: `shell-enact/node_modules/`, `shell-enact/dist/`, `shell-enact/src/core/`.

- [ ] **Step 5: Create `shell-enact/src/services.js`**

```js
import './core/http';
import './core/settings';
import './core/paging';
import './core/immich-client';
import './core/auth';

const core = window.ImmichCore;
const settings = core.settings.create(core.settings.defaultStorage());
const client = core.immichClient.create({http: core.http, getConfig: settings.getCredentials});
const auth = core.auth.create({client, settings});

export default {settings, client, auth, paging: core.paging};
```

- [ ] **Step 6: Create `shell-enact/src/views/SetupView.js`**

Sandstone's `Input` opens the platform on-screen keyboard, which is D-pad navigable on webOS 5+.
```js
import {useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import Input from '@enact/sandstone/Input';
import Button from '@enact/sandstone/Button';
import BodyText from '@enact/sandstone/BodyText';
import services from '../services';

const SetupView = ({nav, params, ...rest}) => {
	const saved = services.settings.getCredentials();
	const [url, setUrl] = useState(saved.serverUrl || services.settings.getUrlHistory()[0] || '');
	const [key, setKey] = useState('');
	const [message, setMessage] = useState('');
	const [busy, setBusy] = useState(false);

	const connect = () => {
		setBusy(true);
		setMessage('Connecting...');
		services.auth.connect(url, key).then(() => {
			setBusy(false);
			nav.reset('albums');
		}, (err) => {
			setBusy(false);
			setMessage(err.message);
		});
	};

	return (
		<Panel {...rest}>
			<Header title="Connect to Immich" subtitle="In Immich: Account Settings > API Keys > New API Key" />
			<Input value={url} placeholder="Server address, e.g. photos.example.com" onComplete={({value}) => setUrl(value)} />
			<Input type="password" value={key} placeholder="API key" onComplete={({value}) => setKey(value)} />
			<Button disabled={busy} onClick={connect}>Connect</Button>
			<BodyText>{message}</BodyText>
		</Panel>
	);
};

export default SetupView;
```

- [ ] **Step 7: Replace `shell-enact/src/App/App.js`**

```js
import {useCallback, useState} from 'react';
import ThemeDecorator from '@enact/sandstone/ThemeDecorator';
import Panels from '@enact/sandstone/Panels';
import services from '../services';
import SetupView from '../views/SetupView';
import AlbumsView from '../views/AlbumsView';
import AlbumView from '../views/AlbumView';
import SettingsView from '../views/SettingsView';

const VIEWS = {setup: SetupView, albums: AlbumsView, album: AlbumView, settings: SettingsView};

const App = (props) => {
	const [stack, setStack] = useState([{name: services.auth.isConfigured() ? 'albums' : 'setup'}]);
	const nav = {
		push: useCallback((name, params) => setStack((s) => s.concat([{name, params}])), []),
		pop: useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []),
		reset: useCallback((name) => setStack([{name}]), [])
	};
	return (
		<Panels {...props} index={stack.length - 1} onBack={nav.pop}>
			{stack.map((s, i) => {
				const View = VIEWS[s.name];
				return <View key={i} nav={nav} params={s.params || {}} />;
			})}
		</Panels>
	);
};

export default ThemeDecorator(App);
```
(`AlbumsView`, `AlbumView`, `SettingsView` are created in Task 15; until then create one-line placeholder files exporting an empty `Panel` so this step builds.)

- [ ] **Step 8: Verify the sync and the build**

Run: `npm test && npm --prefix shell-enact run pack`
Expected: root tests pass; `shell-enact/dist/` produced with `index.html`, `appinfo.json`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(enact): scaffold Sandstone shell, core sync script, Setup screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: Enact screens — Albums, Album, Viewer, Settings

**Files:**
- Create: `shell-enact/src/views/MediaGrid.js`, `AlbumsView.js`, `AlbumView.js`, `Viewer.js`, `SettingsView.js` (replace placeholders)

**Interfaces:**
- Consumes: `services` (Task 14), `nav` from `App.js`.
- Produces: `MediaGrid({items, view, srcOf, labelOf, onSelect(index), onNearEnd})` rendering `VirtualGridList` (grid mode, `view.columns` per row) or `VirtualList` (list mode).

- [ ] **Step 1: `MediaGrid.js`**

```js
import ImageItem from '@enact/sandstone/ImageItem';
import {VirtualGridList, VirtualList} from '@enact/sandstone/VirtualList';

const MediaGrid = ({items, view, srcOf, labelOf, onSelect, onNearEnd}) => {
	const list = view.viewMode === 'list';
	const renderItem = ({index, ...rest}) => (
		<ImageItem
			{...rest}
			src={srcOf(items[index])}
			orientation={list ? 'horizontal' : 'vertical'}
			onClick={() => onSelect(index)}
		>
			{labelOf ? labelOf(items[index]) : ''}
		</ImageItem>
	);
	const onScrollStop = (e) => {
		if (onNearEnd && e.moreInfo && e.moreInfo.lastVisibleIndex >= items.length - 20) onNearEnd();
	};
	if (list) {
		return <VirtualList dataSize={items.length} itemRenderer={renderItem} itemSize={150} spacing={12} onScrollStop={onScrollStop} />;
	}
	const w = Math.floor(1700 / view.columns);
	return (
		<VirtualGridList
			dataSize={items.length}
			itemRenderer={renderItem}
			itemSize={{minWidth: w, minHeight: Math.round(w * 0.8)}}
			spacing={12}
			onScrollStop={onScrollStop}
		/>
	);
};

export default MediaGrid;
```

- [ ] **Step 2: `AlbumsView.js`**

```js
import {useEffect, useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import Button from '@enact/sandstone/Button';
import BodyText from '@enact/sandstone/BodyText';
import services from '../services';
import MediaGrid from './MediaGrid';

const AlbumsView = ({nav, params, ...rest}) => {
	const [albums, setAlbums] = useState([]);
	const [message, setMessage] = useState('Loading albums...');
	const view = services.settings.getView();

	useEffect(() => {
		services.client.listAlbums().then((list) => {
			setAlbums(list);
			setMessage(list.length ? '' : 'No albums yet. Use "All photos".');
		}, (err) => setMessage(err.message));
	}, []);

	return (
		<Panel {...rest}>
			<Header title="Albums">
				<slotAfter>
					<Button onClick={() => nav.push('album', {all: true, title: 'All photos'})}>All photos</Button>
					<Button onClick={() => nav.push('settings')}>Settings</Button>
				</slotAfter>
			</Header>
			{message ? <BodyText>{message}</BodyText> : null}
			<MediaGrid
				items={albums}
				view={view}
				srcOf={(a) => (a.coverId ? services.client.thumbnailUrl(a.coverId, 'thumbnail') : undefined)}
				labelOf={(a) => a.name + ' (' + a.count + ')'}
				onSelect={(i) => nav.push('album', {albumId: albums[i].id, title: albums[i].name})}
			/>
		</Panel>
	);
};

export default AlbumsView;
```

- [ ] **Step 3: `Viewer.js`**

```js
import {useEffect} from 'react';
import Popup from '@enact/sandstone/Popup';
import Spottable from '@enact/spotlight/Spottable';
import services from '../services';

const Photo = Spottable('div');

const Viewer = ({open, items, index, onIndex, onClose}) => {
	useEffect(() => {
		if (!open) return undefined;
		const onKey = (e) => {
			if (e.keyCode === 37 && index > 0) onIndex(index - 1);
			if (e.keyCode === 39 && index < items.length - 1) onIndex(index + 1);
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, index, items, onIndex]);

	const asset = open && index !== null ? items[index] : null;
	return (
		<Popup open={open} onClose={onClose} position="fullscreen">
			{asset ? (
				<Photo style={{width: '100%', height: '100%'}}>
					<img alt={asset.name} src={services.client.viewerUrl(asset.id)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
				</Photo>
			) : null}
		</Popup>
	);
};

export default Viewer;
```

- [ ] **Step 4: `AlbumView.js`**

```js
import {useEffect, useRef, useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import BodyText from '@enact/sandstone/BodyText';
import services from '../services';
import MediaGrid from './MediaGrid';
import Viewer from './Viewer';

const AlbumView = ({nav, params, ...rest}) => {
	const [items, setItems] = useState([]);
	const [message, setMessage] = useState('Loading...');
	const [viewerIndex, setViewerIndex] = useState(null);
	const pagerRef = useRef(null);
	const view = services.settings.getView();

	useEffect(() => {
		const done = (list) => { setItems(list); setMessage(list.length ? '' : 'No photos here.'); };
		if (params.all) {
			const pager = services.paging.createPager((n) => services.client.searchPage(n, 60));
			pagerRef.current = pager;
			pager.loadNext().then(() => done(pager.items().slice()), (err) => setMessage(err.message));
		} else {
			services.client.getAlbum(params.albumId).then((a) => done(a.assets), (err) => setMessage(err.message));
		}
	}, [params]);

	const loadMore = () => {
		const p = pagerRef.current;
		if (p && p.hasMore()) p.loadNext().then(() => setItems(p.items().slice()), () => {});
	};

	return (
		<Panel {...rest}>
			<Header title={params.title || ''} />
			{message ? <BodyText>{message}</BodyText> : null}
			<MediaGrid
				items={items}
				view={view}
				srcOf={(a) => services.client.thumbnailUrl(a.id, view.thumbSize)}
				onSelect={setViewerIndex}
				onNearEnd={loadMore}
			/>
			<Viewer open={viewerIndex !== null} items={items} index={viewerIndex} onIndex={setViewerIndex} onClose={() => setViewerIndex(null)} />
		</Panel>
	);
};

export default AlbumView;
```

- [ ] **Step 5: `SettingsView.js`**

```js
import {useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import SwitchItem from '@enact/sandstone/SwitchItem';
import Slider from '@enact/sandstone/Slider';
import BodyText from '@enact/sandstone/BodyText';
import Button from '@enact/sandstone/Button';
import services from '../services';

const SettingsView = ({nav, params, ...rest}) => {
	const [view, setView] = useState(services.settings.getView());
	const update = (patch) => {
		const next = {...view, ...patch};
		services.settings.saveView(next);
		setView(next);
	};
	return (
		<Panel {...rest}>
			<Header title="Settings" />
			<SwitchItem selected={view.viewMode === 'list'} onToggle={({selected}) => update({viewMode: selected ? 'list' : 'grid'})}>List layout</SwitchItem>
			<BodyText>Columns per row (grid layout): {view.columns}</BodyText>
			<Slider min={3} max={8} step={1} value={view.columns} onChange={({value}) => update({columns: value})} />
			<SwitchItem selected={view.thumbSize === 'preview'} onToggle={({selected}) => update({thumbSize: selected ? 'preview' : 'thumbnail'})}>Large photos (sharper, slower)</SwitchItem>
			<Button onClick={() => { services.auth.signOut(); nav.reset('setup'); }}>Sign out and forget the server</Button>
		</Panel>
	);
};

export default SettingsView;
```

- [ ] **Step 6: Build, package, and run in the Simulator (manual)**

Run: `npm --prefix shell-enact run pack && ares-package shell-enact/dist -o build`
Expected: `build/com.immich.webos.enact_0.2.0_all.ipk`.
Start the Simulator as described in `README.md` (Task 16), then: `ares-launch -s 24 shell-enact/dist`
Expected: same flow as Task 13 Step 4: connect, browse albums, change layout/columns in Settings (persisted), open a photo, Back.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(enact): albums, album, viewer and settings screens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 16: Documentation — README, user test guide, reconcile stale docs

**Files:**
- Create: `README.md`, `docs/TESTING.md`
- Modify: `CLAUDE.md`, `TOOLING.md`, `PLAN.md`, `docs/superpowers/specs/2026-09-18-immich-webos-tv-design.md`

- [ ] **Step 1: Create `README.md`**

````markdown
# Immich for webOS TV

Browse your [Immich](https://immich.app) albums and photos on an LG TV with the remote only.

| Build | App id | Runs on | Engine |
|---|---|---|---|
| Legacy (plain ES5) | `com.immich.webos` | webOS TV 3.x and newer | Chromium 38+ |
| Enact Sandstone | `com.immich.webos.enact` | webOS TV 5 and newer | Chromium 68+ |

Both builds share `core/` (Immich client, settings, auth). Scope: albums and photos, grid/list layout, 3-8 columns, photo size. Not yet: map, people/faces, search, video.

## Develop

Requirements: Node 18+, `npm install -g @webos-tools/cli` (gives `ares-*`), `npm install`.

```bash
npm test                 # lint (ES5), Chromium-38 API gate, unit tests
npm run serve:legacy     # legacy build at http://localhost:8080 (desktop browser; arrows/Enter/Esc)
npm run package:legacy   # build/com.immich.webos_<version>_all.ipk
npm --prefix shell-enact run pack   # Enact build in shell-enact/dist
```
`core/` and `shell-legacy/` must stay ES5 with no build step (webOS 3.x = Chromium 38: no `fetch`, `Array.from`, arrow functions, CSS variables or grid). `npm test` enforces this.

## Run in the LG Simulator (Linux)

The Simulator offers webOS TV 6.0 and 22-26 only, so it cannot emulate webOS 3.x; use it for the Enact build and for a quick check of the legacy build.
1. Download the Simulator AppImage from https://webostv.developer.lge.com/develop/tools/simulator-installation, `chmod +x` it.
2. On Ubuntu 24+ start it directly (ares-launch cannot pass these flags): `./webOS_TV_<ver>_Simulator_*.AppImage --ozone-platform=x11 --no-sandbox`
3. Launch an app in it: `ares-launch -s 24 dist/legacy` or `ares-launch -s 24 shell-enact/dist`

## Test on a real TV

1. On the TV install the **Developer Mode** app from the LG Content Store, open it, turn **Dev Mode Status** and **Key Server** ON, note the TV's IP.
2. On your PC: `ares-setup-device` -> add device (name e.g. `tv`, IP, port `9922`, user `prisoner`), then `ares-device -i tv` to check.
3. `npm run package:legacy`
4. `ares-install -d tv build/com.immich.webos_0.2.0_all.ipk`
5. `ares-launch -d tv com.immich.webos`
6. Debug: `ares-inspect -d tv --app com.immich.webos --open` (needs a Chromium that matches the TV's engine) and `ares-log -d tv com.immich.webos -f`.
7. The Developer Mode session expires after ~50 hours; open the Developer Mode app to extend it.
Follow [docs/TESTING.md](docs/TESTING.md) for the step-by-step acceptance run.

## Connect to Immich

1. In Immich (any browser): Account Settings > API Keys > New API Key. Copy the key.
2. On the TV: Setup screen > Server address (`https://photos.example.com` or `http://192.168.1.10:2283`) and API key, entered with the on-screen keyboard (D-pad: arrows move, OK types; "TV keyboard" opens the TV's own).
3. "Cannot reach the server" means the request failed before any HTTP answer. The browser cannot tell which of these it is: wrong address, TV offline, **HTTPS certificate not trusted by the TV** (2016-17 TVs have an old certificate store; some Let's Encrypt chains fail), or the server blocking the app's `Origin: null` (CORS). Quick test: try `http://<lan-ip>:2283`; if that works the cause is certificate or proxy CORS.

## Remote keys

Arrows: move. OK: open/select. Back: previous screen. In the viewer: Left/Right previous/next photo.
````

- [ ] **Step 2: Create `docs/TESTING.md`**

````markdown
# Acceptance test guide (for someone who did not write the code)

Each step lists what to do and what you should see. Stop at the first failure and use the report template at the end.

## 0. Before you start
- [ ] Immich address is reachable from the TV's network (try it in a phone browser on the same Wi-Fi).
- [ ] You created an API key in Immich (Account Settings > API Keys).
- [ ] TV is in Developer Mode and `ares-device -i tv` works (see README).
- [ ] (Once) install the probe app to record the TV's engine: `ares-package tools/probe -o build && ares-install -d tv build/com.immich.webos.probe_0.0.1_all.ipk && ares-launch -d tv com.immich.webos.probe`. Write down the `Chrome/NN` number and every "NO".

## 1. Install
`npm run package:legacy`, `ares-install -d tv build/com.immich.webos_0.2.0_all.ipk`, `ares-launch -d tv com.immich.webos`.
Expect: the Immich icon in the launcher list and the **Setup** screen on launch.

## 2. Sign in
1. Press OK on "Server address", type your address (use the `https://` shortcut key), choose **Done**.
2. Press OK on "API key", type the key (letters via Shift), choose **Done**.
3. Select **Connect**.
Expect: "Connecting..." then the **Albums** screen.
Also check: a wrong key shows "The server rejected the API key."; a wrong address shows "Cannot reach the server...".

## 3. Albums
Scroll with the arrows; OK opens an album; Back returns to Albums with the same album highlighted.

## 4. Photos
Inside an album: thumbnails load while scrolling; OK opens a photo; Left/Right change photo; Back returns with the last viewed photo highlighted. Try **All photos** on the Albums screen and scroll to the end: more photos load.

## 5. View settings
Albums > Settings: set Layout to List, Columns to 3, Photo size to Large; Back. Expect the layout to change immediately. Close the app (Home) and reopen it: settings are kept.

## 6. Large library
Scroll quickly through "All photos" for 2 minutes. Expect: no freeze, no crash, no blank screen.

## 7. Sign out
Settings > Sign out. Expect the Setup screen; reopening the app shows Setup again.

## 8. Simulator (Enact build)
Repeat steps 2-7 with `ares-launch -s 24 shell-enact/dist` in the Simulator.

## Report template
TV model / webOS version / `navigator.userAgent` (from the probe): 
Step that failed: 
What you saw vs. expected: 
`ares-log -d tv com.immich.webos` output: 

## Results log
| Date | Build | TV / webOS | Steps passed | Notes |
|---|---|---|---|---|
````

- [ ] **Step 3: Amend `CLAUDE.md`**

Replace the line `- **Framework**: Use [Enact Framework](https://enactjs.com/) (React-based) for the UI layer.` with:
```markdown
- **Framework**: Use [Enact Framework](https://enactjs.com/) (React-based, Sandstone) for `shell-enact/` (webOS 5+).
- **Legacy shell**: `shell-legacy/` and `core/` are hand-written ES5 with no build step, because LG states "Enact is supported from webOS TV 4.0, you must retain Enyo-based apps for webOS TV 1.x to 3.x" and webOS 3.x runs Chromium 38. Forbidden there: `fetch`, `Array.from`, `Object.assign`, arrow functions, `let`/`const`, CSS variables, CSS grid. `npm test` enforces it.
```
Add at the end of `CLAUDE.md`:
```markdown
## Commands
- `npm test` — ES5 lint, Chromium-38 API gate, unit tests (run before every commit)
- `npm run package:legacy` — build the legacy `.ipk`; `npm --prefix shell-enact run pack` — Enact build
- Design: `docs/superpowers/specs/`; plans: `docs/superpowers/plans/`
```

- [ ] **Step 4: Replace stale `PLAN.md` and `TOOLING.md`**

`PLAN.md` (whole file):
```markdown
# Plan (superseded)

The original single-Enact-app plan was replaced. See:
- Design: `docs/superpowers/specs/2026-09-18-immich-webos-tv-design.md`
- Implementation plan: `docs/superpowers/plans/2026-09-19-immich-webos-tv.md`
```
`TOOLING.md` (whole file):
```markdown
# Tooling

See README.md for setup, Simulator and real-TV instructions.

| Command | Purpose |
|---|---|
| `ares-package <dir> -o build` | package an app dir into an `.ipk` |
| `ares-setup-device` / `ares-device -i <tv>` | register / inspect a TV |
| `ares-install -d <tv> <ipk>` | install |
| `ares-launch -d <tv> <app.id>` | launch on TV; `-s <ver> <dir>` launches in the Simulator |
| `ares-inspect -d <tv> --app <app.id> --open` | Web Inspector |
| `ares-log -d <tv> <app.id> -f` | live logs |

Engine per generation (LG): webOS TV 3.x = Chromium 38, 4.x = 53, 5.x = 68, 6.x = 79, 22 = 87. Increment `version` in `appinfo.json` on each reinstall.
```

- [ ] **Step 5: Record the spec deltas**

Append to the spec (`docs/superpowers/specs/2026-09-18-immich-webos-tv-design.md`) the section from the end of this plan titled "Spec deltas discovered while planning".

- [ ] **Step 6: Verify and commit**

Run: `npm test`
Expected: pass.
```bash
git add -A
git commit -m "docs: README, user test guide; reconcile CLAUDE.md, PLAN.md, TOOLING.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 17: On-TV acceptance run and release commit

**Files:**
- Modify: `docs/TESTING.md` (Results log), `shell-legacy/appinfo.json` / `shell-enact/webos-meta/appinfo.json` (version bumps only if fixes were needed)

- [ ] **Step 1: Gate and package**

Run: `npm test && npm run package:legacy`
Expected: all green; `build/com.immich.webos_0.2.0_all.ipk` exists.

- [ ] **Step 2: Run docs/TESTING.md steps 0-7 on the webOS 3.x TV (manual)**

Expected: every step's "Expect" line holds. Record each result in the Results log. For any failure: capture `ares-log`, add a failing unit test in `core/` or `tests/legacy/` where the bug is logic, fix, bump `version`, repackage, retest.

- [ ] **Step 3: Run step 8 in the Simulator (Enact build)**

Expected: steps 2-7 pass.

- [ ] **Step 4: Final verification and commit**

Run: `npm test && git status --short`
Expected: tests pass; only the Results log (and any fixes) modified.
```bash
git add -A
git commit -m "test: record first acceptance run on webOS 3.x TV and Simulator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Spec deltas discovered while planning

These refine the approved spec; none changes scope.

1. **Error messages**: the browser cannot tell an untrusted certificate, a CORS block and an offline server apart (XHR `onerror` gives no reason). The app shows one message naming all three, and the README gives the LAN-HTTP test that separates them. The spec's "specific certificate error" is not achievable in a browser.
2. **Media auth**: images use `?apiKey=` (verified against the live server in Task 6). The prototype's `?key=` is the shared-link parameter.
3. **Endpoints**: photos-of-everything uses `POST /api/search/metadata` (paged); the prototype's `GET /api/assets?page=` is deprecated.
4. **Video**: filtered out (`type === 'IMAGE'` only), consistent with "photos and albums" scope.
5. **Enact shell keyboard**: uses Sandstone's `Input` (the platform keyboard, D-pad navigable on webOS 5+) instead of a custom keyboard; the custom D-pad keyboard is legacy-only where it is the primary path.
6. **Screens**: no separate Home screen; Albums is the landing screen with an "All photos" entry.
7. **Legacy settings**: "Photo size" maps to Immich's `thumbnail` / `preview` sizes.
