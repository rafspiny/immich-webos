# Shared-album badges and sharing info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show at a glance which Immich albums are shared, and let the viewer open an Info panel listing who the album is shared with, the public-link URL and its permissions, plus the album's description, date range and photo count — in both shells.

**Architecture:** Three layers. (1) `core/immich-client.js` grows a richer `listAlbums()` normalizer (pure, no extra request — the album *list* already carries the sharing fields) and one new on-demand call `getShareLinks(albumId)`. (2) A new pure ES5 module `core/share-info.js` turns a normalized album (and a share link) into badge kinds and display strings; both shells use it, so the wording and the date format are identical and unit-tested once. (3) Each shell renders: a badge on shared album tiles, and an "Info" button in the album screen's top bar opening an overlay (legacy: a full-panel `div` in the `.kb-overlay` style; Enact: Sandstone `Popup`).

**Tech Stack:** ES5 JavaScript (`core/`, `shell-legacy/`), `node --test` + ESLint 9 (`ecmaVersion: 5`) + `tools/check-es5.js`; React 18 + `@enact/sandstone` 2.9.x with `enact test` (Jest 30 + `@testing-library/react` 16, both shipped inside `@enact/cli`) for `shell-enact/`.

**Spec:**
- `docs/superpowers/specs/2026-09-25-next-features-design.md` — approved design overview; **Unit 6 — Shared-album badges and sharing info** plus the "Research findings that shape the design" section.
- `docs/superpowers/specs/2026-09-18-immich-webos-tv-design.md` — the project's platform/architecture spec (rev 2).

## Global Constraints

Every task's requirements include these:

- Minimum platform: **webOS TV 3.x = Chromium 38**. `core/` and `shell-legacy/` are hand-written **ES5 with no build step**.
- Forbidden in `core/` and `shell-legacy/` (enforced by `npm test`): `fetch`, `Array.from`, `Object.assign`, `Object.entries/values`, arrow functions, `let`/`const`, template literals, `String.prototype.includes/startsWith/endsWith`, `Array.prototype.includes/find/findIndex/fill`, `.repeat(`, `.padStart(`, `.closest(`, `.append(`, `.finally(`, async/await, native ES modules, `NodeList.forEach` on `querySelectorAll`, `scrollIntoView({...})`. In CSS: custom properties, CSS Grid, `position: sticky`, `:focus-within`/`:focus-visible`, flex `gap`, `aspect-ratio`, `min()`/`max()`/`clamp()`.
- Allowed: `Promise`, `XMLHttpRequest`, `Array.isArray`, `Array.prototype.map/filter/forEach/indexOf/join`, unprefixed flexbox, `transform`, `object-fit`, `classList`, `dataset`, `::before`/`::after`, `border-radius`.
- Module pattern for every `core/` and `shell-legacy/js/` file: an IIFE attaching to `ImmichCore` / `ImmichUI` on `window`, plus `module.exports` when `module` exists so `node --test` can load it.
- Legacy views implement the router contract `{el, enter(params, restore), leave(), onKey(keyName) -> bool, snapshot() -> restore}`. `ui.app.back()` re-enters the previous view with `params = {}` and the saved `restore`, so a view must never depend on `params` being present on a restore.
- No new runtime dependencies in either shell. No icon font, no SVG file, no QR code.
- `npm test` (ESLint + `check-es5` + `node --test`) must pass before every commit.
- Commit messages are informal plain English and end with the trailer line:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

## Rebase awareness (other units may land first)

This plan is written against `feature/first-implementation` at commit `02ac87d`. Units 1 (in-app logging), 2 (video) and 3 (zoom) touch some of the same files. If one of them lands first, these are the only hunks that need a trivial rebase:

- `core/immich-client.js` — Unit 2 changes `onlyImages()` and adds `videoPlaybackUrl`. This plan only *adds* helper functions above `create()` and *adds* two entries to the object literal returned by `create()`. Re-apply by hand; no shared lines.
- `tests/core/immich-client.test.js` — append-only; both units add tests at the end.
- `shell-legacy/js/view-album.js` — Unit 2/3 touch `renderTile` and the viewer hand-off. This plan touches the top bar (adds `infoBtn`), `enter()`, `leave()` and the first line of `onKey()`. Overlapping file, non-overlapping hunks.
- `shell-legacy/css/app.css` — all three units append new rules at the end. Append order does not matter.
- `shell-enact/src/views/AlbumView.js` and `MediaGrid.js` — Unit 2 adds a video branch to `MediaGrid`'s `renderItem`. This plan adds new props (`sublabelOf`, `iconOf`) to the same `renderItem`. Merge both prop sets.

## Verified API facts (checked 2026-09-25, cite these in code comments and docs)

- `GET /api/albums` (the **list**) returns each album with `shared` (bool), `hasSharedLink` (bool), `albumUsers: [{user: {id, name, email, profileImagePath, avatarColor, profileChangedAt}, role}]`, `description`, `createdAt`, `updatedAt`, `startDate`, `endDate`, `assetCount`, `isActivityEnabled`, `order`, `lastModifiedAssetTimestamp`, `contributorCounts`. Source: `mapAlbum()` in <https://raw.githubusercontent.com/immich-app/immich/main/server/src/dtos/album.dto.ts>, used by both `getAll()` and `get()` in `album.service.ts`. **No extra request is needed for the badge.**
- `GET /api/albums/{id}` has the same shape and, on Immich v3.x, **no `assets` array** — already recorded in `docs/immich-api-notes.md`. This plan does not use it.
- `GET /api/shared-links` accepts `albumId` as a query parameter. Verified in `SharedLinkSearchSchema`: `albumId: z.uuidv4().optional().describe('Filter by album ID')` — <https://raw.githubusercontent.com/immich-app/immich/main/server/src/dtos/shared-link.dto.ts>. Handler: `getAllSharedLinks(@Auth() auth, @Query() dto: SharedLinkSearchDto): Promise<SharedLinkResponseDto[]>` in <https://raw.githubusercontent.com/immich-app/immich/main/server/src/controllers/shared-link.controller.ts>. It returns a **JSON array**.
- Each element (from `mapSharedLink()`, same dto file) has: `id`, `description` (string|null), `password` (string|null), `userId`, `key` (the link secret, `base64url`), `type`, `createdAt`, `expiresAt` (date|null), `assets`, `album` (optional), `allowUpload`, `allowDownload`, `showMetadata`, `slug` (string|null, "Custom URL slug").
- The URL is **not** returned by the API; it is built client-side. Two forms, both verified from the web client's route tree (<https://api.github.com/repos/immich-app/immich/contents/web/src/routes/(user)>): `web/src/routes/(user)/share/[key]` → `{serverUrl}/share/{key}`, and `web/src/routes/(user)/s/[slug]` → `{serverUrl}/s/{slug}` when a custom slug is set. The docs page <https://docs.immich.app/features/sharing/> shows only the key form, e.g. `https://my.immich.app/share/JUckRMxlgpo7F9BpyqGk_cZEwDzaU_U5LU5_oNZp1ETIBa9dpQ0b5ghNm_22QVJfn3k`, and does not mention slugs.
- **Not verified:** that `password` is returned as a non-null *hash* rather than an empty string when a password is set (the dto only says `describe('Has password')`). This plan therefore reports "password protected" from `!!link.password` — truthiness, not the value — and Task 8 adds a manual check to `docs/TESTING.md` to confirm it against a real password-protected link.
- **Not verified:** that an old Immich (v1.9x) accepts `?albumId=`. The plan's error path shows the server's own message in the panel instead of crashing, so an older server degrades to "could not load the link" rather than a broken screen.

## File Structure

```
core/share-info.js                        NEW  pure formatting: badge kinds + display strings
core/immich-client.js                     MOD  richer listAlbums(); new getShareLinks()
tests/core/share-info.test.js             NEW
tests/core/immich-client.test.js          MOD  append cases
tests/tools/build-legacy.test.js          MOD  script-tag / badge-CSS wiring guards
tests/tools/sync-core.test.js             MOD  share-info.js reaches the Enact bundle

shell-legacy/index.html                   MOD  two new <script> tags
shell-legacy/css/app.css                  MOD  .badges / .badge-* and .si-* rules
shell-legacy/js/view-albums.js            MOD  badge in renderTile; pass the album on select
shell-legacy/js/view-album.js             MOD  Info button, overlay delegation
shell-legacy/js/share-info-view.js        NEW  ui.openShareInfo(opts) overlay

shell-enact/src/services.js               MOD  import + export core.shareInfo
shell-enact/src/views/MediaGrid.js        MOD  optional iconOf / sublabelOf
shell-enact/src/views/AlbumsView.js       MOD  badge props; pass the album on select
shell-enact/src/views/AlbumView.js        MOD  Info button + Popup
shell-enact/src/views/ShareInfoPopup.js   NEW  the Popup body
shell-enact/src/views/ShareInfoPopup.test.js NEW  Jest + @testing-library/react

README.md, docs/TESTING.md, docs/immich-api-notes.md   MOD
```

---

### Task 1: `listAlbums()` returns the sharing fields

**Files:**
- Modify: `core/immich-client.js:54-62` (the `listAlbums` entry of the object returned by `create()`), and add two helpers next to `toAsset` at `core/immich-client.js:18-21`
- Test: `tests/core/immich-client.test.js` (replace the existing `listAlbums normalizes fields` test, append two more)

**Interfaces:**
- Consumes: the existing private `call(method, path, body, cfgOverride)` and `invalidResponse()` inside `core/immich-client.js`.
- Produces: `client.listAlbums() -> Promise<Array<Album>>` where
  `Album = {id: string, name: string, count: number, coverId: string|undefined, shared: boolean, hasSharedLink: boolean, description: string, startDate: string|null, endDate: string|null, users: Array<{name: string, email: string, role: string}>}`.
  `shared`/`hasSharedLink` are strictly booleans, `description` is `''` when absent, `startDate`/`endDate` are the raw ISO strings or `null`, and `users` is `[]` when `albumUsers` is missing, `null` or not an array. No extra HTTP request is made.

- [ ] **Step 1: Write the failing tests**

In `tests/core/immich-client.test.js`, replace the existing test named `listAlbums normalizes fields` (lines 36-41) with these three tests:

```js
test('listAlbums normalizes fields including the sharing fields', function () {
  var m = make([[{
    id: 'a1', albumName: 'Trip', assetCount: 3, albumThumbnailAssetId: 'x9',
    shared: true, hasSharedLink: true, description: 'Summer 2024',
    startDate: '2024-06-12T08:00:00.000Z', endDate: '2024-06-18T20:30:00.000Z',
    albumUsers: [
      { user: { id: 'u1', name: 'Ann Lee', email: 'ann@example.com' }, role: 'editor' },
      { user: { id: 'u2', name: '', email: 'bob@example.com' }, role: 'viewer' }
    ]
  }]]);
  return m.c.listAlbums().then(function (l) {
    assert.deepStrictEqual(l, [{
      id: 'a1', name: 'Trip', count: 3, coverId: 'x9',
      shared: true, hasSharedLink: true, description: 'Summer 2024',
      startDate: '2024-06-12T08:00:00.000Z', endDate: '2024-06-18T20:30:00.000Z',
      users: [
        { name: 'Ann Lee', email: 'ann@example.com', role: 'editor' },
        { name: 'bob@example.com', email: 'bob@example.com', role: 'viewer' }
      ]
    }]);
  });
});
test('listAlbums fills in defaults when the sharing fields are missing', function () {
  var m = make([[{ id: 'a1', albumName: 'Trip', assetCount: 3 }]]);
  return m.c.listAlbums().then(function (l) {
    assert.deepStrictEqual(l, [{
      id: 'a1', name: 'Trip', count: 3, coverId: undefined,
      shared: false, hasSharedLink: false, description: '',
      startDate: null, endDate: null, users: []
    }]);
  });
});
test('listAlbums survives a broken albumUsers array', function () {
  var m = make([[
    { id: 'a1', albumName: 'A', albumUsers: null },
    { id: 'a2', albumName: 'B', albumUsers: 'nonsense' },
    { id: 'a3', albumName: 'C', albumUsers: [null, {}, { user: null, role: 'editor' }] }
  ]]);
  return m.c.listAlbums().then(function (l) {
    assert.deepStrictEqual(l[0].users, []);
    assert.deepStrictEqual(l[1].users, []);
    assert.deepStrictEqual(l[2].users, [
      { name: 'Unknown', email: '', role: 'viewer' },
      { name: 'Unknown', email: '', role: 'viewer' },
      { name: 'Unknown', email: '', role: 'editor' }
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/core/immich-client.test.js`
Expected: FAIL — the first test reports a `deepStrictEqual` mismatch because the returned object has only `{id, name, count, coverId}`.

- [ ] **Step 3: Write the implementation**

In `core/immich-client.js`, add these helpers immediately after `onlyImages` (currently ends at line 21):

```js
  /* GET /api/albums already carries the sharing fields (mapAlbum() in Immich's
     album.dto.ts is shared by getAll() and get()), so this is pure normalization
     and costs no extra request. Everything here must tolerate a missing field. */
  function toAlbumUser(entry) {
    var person = (entry && entry.user) || {};
    var email = person.email || '';
    return {
      name: person.name || email || 'Unknown',
      email: email,
      role: (entry && entry.role) || 'viewer'
    };
  }
  function toAlbumUsers(list) {
    return Array.isArray(list) ? list.map(toAlbumUser) : [];
  }
  function toAlbum(a) {
    return {
      id: a.id,
      name: a.albumName,
      count: a.assetCount,
      coverId: a.albumThumbnailAssetId,
      shared: a.shared === true,
      hasSharedLink: a.hasSharedLink === true,
      description: a.description || '',
      startDate: a.startDate || null,
      endDate: a.endDate || null,
      users: toAlbumUsers(a.albumUsers)
    };
  }
```

Then replace the body of the `listAlbums` entry (lines 54-62) with:

```js
      listAlbums: function () {
        return call('GET', '/albums').then(function (list) {
          if (!Array.isArray(list)) { throw invalidResponse(); }
          if (core.debugLog) { core.debugLog('listAlbums', { count: list.length }); }
          return list.map(toAlbum);
        });
      },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/core/immich-client.test.js && npx eslint core && npm run check:es5`
Expected: every test in the file passes (14 tests), lint clean, `check-es5: N files OK`.

- [ ] **Step 5: Commit**

```bash
git add core/immich-client.js tests/core/immich-client.test.js
git commit -m "Carry the album sharing fields through listAlbums

The albums list endpoint already tells us whether an album is shared,
whether it has a public link and who it is shared with, so just keep
those fields instead of throwing them away. No extra request.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `getShareLinks(albumId)` — the on-demand public-link lookup

**Files:**
- Modify: `core/immich-client.js` (one more helper next to `toAlbum`, one more entry in the object returned by `create()`)
- Test: `tests/core/immich-client.test.js` (append)

**Interfaces:**
- Consumes: the private `call(...)`, `invalidResponse()` and `getConfig()` from Task 1's file.
- Produces: `client.getShareLinks(albumId) -> Promise<Array<ShareLink>>` where
  `ShareLink = {url: string, expiresAt: string|null, allowDownload: boolean, allowUpload: boolean, hasPassword: boolean, description: string}`.
  It issues exactly one request, `GET {serverUrl}/api/shared-links?albumId={encoded}`. `url` is `{serverUrl}/s/{slug}` when the link has a custom slug, otherwise `{serverUrl}/share/{key}`, and `''` when the payload has neither. A non-array payload rejects with `code: 'invalid_response'`. **Callers must call this only when the user opens the Info panel — never per grid tile.**

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/immich-client.test.js`:

```js
test('getShareLinks requests the album filter and builds /share/<key> urls', function () {
  var m = make([[{
    id: 'l1', key: 'AbC-_123', slug: null, description: 'For grandma',
    expiresAt: '2027-03-03T00:00:00.000Z', allowDownload: true, allowUpload: false, password: null
  }]]);
  return m.c.getShareLinks('a1/b?c').then(function (links) {
    assert.strictEqual(m.calls[0].method, 'GET');
    assert.strictEqual(m.calls[0].url, 'https://s/api/shared-links?albumId=a1%2Fb%3Fc');
    assert.deepStrictEqual(links, [{
      url: 'https://s/share/AbC-_123',
      expiresAt: '2027-03-03T00:00:00.000Z',
      allowDownload: true, allowUpload: false, hasPassword: false, description: 'For grandma'
    }]);
  });
});
test('getShareLinks prefers a custom slug and reports a password', function () {
  var m = make([[{ id: 'l1', key: 'K', slug: 'summer-trip', password: '$2b$hash', allowDownload: false, allowUpload: true }]]);
  return m.c.getShareLinks('a1').then(function (links) {
    assert.strictEqual(links[0].url, 'https://s/s/summer-trip');
    assert.strictEqual(links[0].hasPassword, true);
    assert.strictEqual(links[0].expiresAt, null);
    assert.strictEqual(links[0].description, '');
    assert.strictEqual(links[0].allowDownload, false);
    assert.strictEqual(links[0].allowUpload, true);
  });
});
test('getShareLinks returns an empty list for an album with no link', function () {
  var m = make([[]]);
  return m.c.getShareLinks('a1').then(function (links) { assert.deepStrictEqual(links, []); });
});
test('getShareLinks yields an empty url when the payload has neither key nor slug', function () {
  var m = make([[{ id: 'l1' }]]);
  return m.c.getShareLinks('a1').then(function (links) { assert.strictEqual(links[0].url, ''); });
});
test('getShareLinks rejects a non-array payload', function () {
  return assertInvalid(make([{ links: [] }]).c.getShareLinks('a1'));
});
```

(`assertInvalid` and `make` already exist in this file; `assertInvalid` is defined at line 70, so put these tests after it.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/core/immich-client.test.js`
Expected: FAIL with `TypeError: m.c.getShareLinks is not a function`.

- [ ] **Step 3: Write the implementation**

In `core/immich-client.js`, add this helper directly after `toAlbum`:

```js
  /* Immich never returns the public URL; the web client builds it from the
     route tree: /share/<key>, or /s/<slug> when a custom slug is set.
     See docs/immich-api-notes.md for the sources. */
  function shareUrl(serverUrl, link) {
    if (link && link.slug) { return serverUrl + '/s/' + encodeURIComponent(link.slug); }
    if (link && link.key) { return serverUrl + '/share/' + link.key; }
    return '';
  }
```

Then add this entry to the object returned by `create()`, immediately after `listAlbums`:

```js
      /* On demand only - called when the Info panel opens for one album,
         never once per grid tile. */
      getShareLinks: function (albumId) {
        return call('GET', '/shared-links?albumId=' + encodeURIComponent(albumId)).then(function (list) {
          if (!Array.isArray(list)) { throw invalidResponse(); }
          if (core.debugLog) { core.debugLog('getShareLinks', { albumId: albumId, count: list.length }); }
          var base = getConfig().serverUrl;
          return list.map(function (link) {
            return {
              url: shareUrl(base, link),
              expiresAt: link.expiresAt || null,
              allowDownload: link.allowDownload === true,
              allowUpload: link.allowUpload === true,
              hasPassword: !!link.password,
              description: link.description || ''
            };
          });
        });
      },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/core/immich-client.test.js && npx eslint core && npm run check:es5`
Expected: 19 tests pass, lint clean, gate clean.

- [ ] **Step 5: Commit**

```bash
git add core/immich-client.js tests/core/immich-client.test.js
git commit -m "Look up an album's public share link when asked

New getShareLinks(albumId) hits /shared-links?albumId=... and builds the
URL the way Immich's own web client does: /s/<slug> if there is a custom
slug, otherwise /share/<key>. Only called when the info panel opens.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `core/share-info.js` — badge kinds and display strings

**Files:**
- Create: `core/share-info.js`, `tests/core/share-info.test.js`

**Interfaces:**
- Consumes: the `Album` shape from Task 1 and the `ShareLink` shape from Task 2. Nothing else — no DOM, no network.
- Produces (`ImmichCore.shareInfo`, also `module.exports`):
  - `badges(album) -> Array<'people'|'link'>` — `'people'` when `album.shared === true`, `'link'` when `album.hasSharedLink === true`, in that order; `[]` for a private album or a missing album.
  - `dateRange(album) -> string` — `''`, `'12 Jun 2024'`, or `'12 Jun 2024 - 18 Jun 2024'`.
  - `summary(album) -> string` — one line, e.g. `'Private album'`, `'Shared with 1 person'`, `'Shared with 2 people, public link'`, `'Public link'`.
  - `peopleLines(album) -> Array<string>` — one line per user, `'Ann Lee  (ann@example.com)  -  editor'`.
  - `linkLines(link) -> Array<string>` — description (if any), url (if any), expiry line, permissions line.
  - `formatDate(isoString) -> string` — `'12 Jun 2024'` or `''`.

Why a manual date formatter: `toLocaleDateString` output varies by TV locale and firmware, so it cannot be asserted in a test, and Chromium 38's `Intl` support is patchy. Parsing the leading `YYYY-MM-DD` of the ISO string with a regex is deterministic and never shifts the day across a timezone boundary.

- [ ] **Step 1: Write the failing test**

`tests/core/share-info.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert');
var si = require('../../core/share-info');

var FULL = {
  id: 'a1', name: 'Trip', count: 42, description: 'Summer 2024',
  shared: true, hasSharedLink: true,
  startDate: '2024-06-12T08:00:00.000Z', endDate: '2024-06-18T20:30:00.000Z',
  users: [
    { name: 'Ann Lee', email: 'ann@example.com', role: 'editor' },
    { name: 'bob@example.com', email: 'bob@example.com', role: 'viewer' }
  ]
};
var PRIVATE = {
  id: 'a2', name: 'Mine', count: 1, description: '',
  shared: false, hasSharedLink: false, startDate: null, endDate: null, users: []
};

test('formatDate turns an ISO timestamp into a day the TV can render', function () {
  assert.strictEqual(si.formatDate('2024-06-12T08:00:00.000Z'), '12 Jun 2024');
  assert.strictEqual(si.formatDate('2024-01-01'), '1 Jan 2024');
  assert.strictEqual(si.formatDate(null), '');
  assert.strictEqual(si.formatDate('not a date'), '');
  assert.strictEqual(si.formatDate('2024-13-01'), '');
});
test('badges lists people first, then link', function () {
  assert.deepStrictEqual(si.badges(FULL), ['people', 'link']);
  assert.deepStrictEqual(si.badges(PRIVATE), []);
  assert.deepStrictEqual(si.badges({ shared: true, hasSharedLink: false }), ['people']);
  assert.deepStrictEqual(si.badges({ shared: false, hasSharedLink: true }), ['link']);
  assert.deepStrictEqual(si.badges(null), []);
});
test('dateRange collapses a single day and handles missing ends', function () {
  assert.strictEqual(si.dateRange(FULL), '12 Jun 2024 - 18 Jun 2024');
  assert.strictEqual(si.dateRange(PRIVATE), '');
  assert.strictEqual(si.dateRange({ startDate: '2024-06-12T00:00:00.000Z', endDate: '2024-06-12T23:00:00.000Z' }), '12 Jun 2024');
  assert.strictEqual(si.dateRange({ startDate: null, endDate: '2024-06-18T00:00:00.000Z' }), '18 Jun 2024');
  assert.strictEqual(si.dateRange({ startDate: '2024-06-12T00:00:00.000Z', endDate: null }), '12 Jun 2024');
});
test('summary reads as a sentence in every combination', function () {
  assert.strictEqual(si.summary(FULL), 'Shared with 2 people, public link');
  assert.strictEqual(si.summary(PRIVATE), 'Private album');
  assert.strictEqual(si.summary({ shared: true, hasSharedLink: false, users: [{ name: 'Ann' }] }), 'Shared with 1 person');
  assert.strictEqual(si.summary({ shared: false, hasSharedLink: true, users: [] }), 'Public link');
  assert.strictEqual(si.summary({ shared: true, hasSharedLink: false, users: [] }), 'Shared');
  assert.strictEqual(si.summary({}), 'Private album');
});
test('peopleLines shows name, email and role without repeating the email', function () {
  assert.deepStrictEqual(si.peopleLines(FULL), [
    'Ann Lee  (ann@example.com)  -  editor',
    'bob@example.com  -  viewer'
  ]);
  assert.deepStrictEqual(si.peopleLines(PRIVATE), []);
  assert.deepStrictEqual(si.peopleLines({ users: 'broken' }), []);
  assert.deepStrictEqual(si.peopleLines({ users: [{}] }), ['Unknown']);
});
test('linkLines spells out url, expiry and permissions', function () {
  assert.deepStrictEqual(si.linkLines({
    url: 'https://s/share/K', expiresAt: '2027-03-03T00:00:00.000Z',
    allowDownload: true, allowUpload: false, hasPassword: true, description: 'For grandma'
  }), [
    'For grandma',
    'https://s/share/K',
    'Expires 3 Mar 2027',
    'Download allowed, upload not allowed, password protected'
  ]);
  assert.deepStrictEqual(si.linkLines({
    url: 'https://s/s/trip', expiresAt: null,
    allowDownload: false, allowUpload: false, hasPassword: false, description: ''
  }), [
    'https://s/s/trip',
    'No expiry date',
    'Download not allowed, upload not allowed'
  ]);
  assert.deepStrictEqual(si.linkLines(null), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/core/share-info.test.js`
Expected: FAIL with `Cannot find module '../../core/share-info'`.

- [ ] **Step 3: Write the implementation**

`core/share-info.js`:

```js
/*
 * share-info.js - pure formatting for the sharing badges and the Info panel.
 *
 * Both shells use this so the wording and the date format stay identical,
 * and so the only thing that needs testing is testable without a DOM.
 * Input shapes: the Album returned by immich-client.listAlbums() and the
 * ShareLink returned by immich-client.getShareLinks().
 */
(function (root) {
  'use strict';
  var core = root.ImmichCore = root.ImmichCore || {};

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* Reads the leading YYYY-MM-DD out of the ISO string instead of using Date,
     so the day never shifts with the TV's timezone and the output does not
     depend on the TV's locale (Chromium 38 Intl support is patchy). */
  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) { return ''; }
    var month = MONTHS[parseInt(m[2], 10) - 1];
    if (!month) { return ''; }
    return String(parseInt(m[3], 10)) + ' ' + month + ' ' + m[1];
  }

  function users(album) {
    return (album && Array.isArray(album.users)) ? album.users : [];
  }

  function badges(album) {
    var out = [];
    if (!album) { return out; }
    if (album.shared === true) { out.push('people'); }
    if (album.hasSharedLink === true) { out.push('link'); }
    return out;
  }

  function dateRange(album) {
    var from = formatDate(album && album.startDate);
    var to = formatDate(album && album.endDate);
    if (!from) { return to; }
    if (!to || to === from) { return from; }
    return from + ' - ' + to;
  }

  function summary(album) {
    var n = users(album).length;
    var parts = [];
    if (n === 1) { parts.push('shared with 1 person'); }
    else if (n > 1) { parts.push('shared with ' + n + ' people'); }
    else if (album && album.shared === true) { parts.push('shared'); }
    if (album && album.hasSharedLink === true) { parts.push('public link'); }
    if (!parts.length) { return 'Private album'; }
    var text = parts.join(', ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function peopleLines(album) {
    return users(album).map(function (u) {
      var name = u.name || u.email || 'Unknown';
      var line = name;
      if (u.email && u.email !== name) { line += '  (' + u.email + ')'; }
      if (u.role) { line += '  -  ' + u.role; }
      return line;
    });
  }

  function linkLines(link) {
    var out = [];
    if (!link) { return out; }
    if (link.description) { out.push(link.description); }
    if (link.url) { out.push(link.url); }
    var expiry = formatDate(link.expiresAt);
    out.push(expiry ? 'Expires ' + expiry : 'No expiry date');
    out.push('Download ' + (link.allowDownload ? 'allowed' : 'not allowed') +
      ', upload ' + (link.allowUpload ? 'allowed' : 'not allowed') +
      (link.hasPassword ? ', password protected' : ''));
    return out;
  }

  var api = {
    badges: badges,
    dateRange: dateRange,
    summary: summary,
    peopleLines: peopleLines,
    linkLines: linkLines,
    formatDate: formatDate
  };
  core.shareInfo = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
}(typeof window !== 'undefined' ? window : global));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/core/share-info.test.js && npx eslint core && npm run check:es5`
Expected: 6 tests pass, lint clean, `check-es5` reports one more file and stays OK.

- [ ] **Step 5: Commit**

```bash
git add core/share-info.js tests/core/share-info.test.js
git commit -m "Add one place that turns sharing data into words

Both shells need the same badge kinds, the same "shared with 2 people"
line and the same date format, so put it in core where it can be tested
without a browser. Dates are formatted by hand because old TVs disagree
about toLocaleDateString.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Legacy shell — badge on shared album tiles

**Files:**
- Modify: `shell-legacy/index.html:12` (add one `<script>`), `shell-legacy/js/view-albums.js:21-33` (`renderTile` and `onSelect`), `shell-legacy/css/app.css` (append rules)
- Test: `tests/tools/build-legacy.test.js` (append two tests)

**Interfaces:**
- Consumes: `ImmichCore.shareInfo.badges(album)` (Task 3), `Album.shared` / `Album.hasSharedLink` (Task 1), the existing `ui.createGrid({renderTile})` contract in `shell-legacy/js/grid.js:29` (`renderTile(item, index, mode)` returns one element appended to the `.tile`).
- Produces: every album tile whose album is shared carries `<div class="badges">` holding one `<div class="badge badge-people">` and/or `<div class="badge badge-link">LINK</div>`; the badge markup is drawn entirely in CSS (two overlapping circles via `::before`/`::after`) so no font glyph or emoji is needed — old TV fonts have neither. Album selection now hands the whole normalized album to the album view: `ctx.app.go('album', {albumId, title, album})`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/tools/build-legacy.test.js`:

```js
var shareInfo = require('../../core/share-info');

test('index.html loads core/share-info.js before the views that use it', function () {
  var html = fs.readFileSync(path.join(root, 'shell-legacy', 'index.html'), 'utf8');
  var at = function (src) { return html.indexOf('src="' + src + '"'); };
  assert.ok(at('core/share-info.js') > -1, 'index.html does not load core/share-info.js');
  assert.ok(at('core/share-info.js') < at('js/view-albums.js'), 'share-info.js must load before view-albums.js');
});
test('the legacy stylesheet styles every badge kind share-info can return', function () {
  var css = fs.readFileSync(path.join(root, 'shell-legacy', 'css', 'app.css'), 'utf8');
  var kinds = shareInfo.badges({ shared: true, hasSharedLink: true });
  assert.deepStrictEqual(kinds, ['people', 'link']);
  kinds.forEach(function (kind) {
    assert.ok(css.indexOf('.badge-' + kind) > -1, 'no .badge-' + kind + ' rule in app.css');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/tools/build-legacy.test.js`
Expected: FAIL twice — `index.html does not load core/share-info.js` and `no .badge-people rule in app.css`.

- [ ] **Step 3: Load the new core module in the page**

In `shell-legacy/index.html`, add this line directly after `<script src="core/immich-client.js"></script>`:

```html
  <script src="core/share-info.js"></script>
```

- [ ] **Step 4: Draw the badges in `shell-legacy/js/view-albums.js`**

Replace the `renderTile` and `onSelect` entries of the `ui.createGrid({...})` call (lines 21-33) with:

```js
    var grid = ui.createGrid({
      host: host,
      captionH: 56,
      renderTile: function (a) {
        var body = dom.el('div', 'tile-body');
        var box = dom.el('div', 'cap-img');
        if (a.coverId) { var img = dom.el('img'); img.src = ctx.client.thumbnailUrl(a.coverId, 'thumbnail'); box.appendChild(img); }
        body.appendChild(box);
        body.appendChild(dom.el('div', 'tile-caption', a.name + ' (' + a.count + ')'));
        var kinds = w.ImmichCore.shareInfo.badges(a);
        if (kinds.length) {
          var marks = dom.el('div', 'badges');
          kinds.forEach(function (kind) {
            /* The people badge is drawn in CSS; the link badge is a text chip.
               No icon font and no emoji: old TV fonts have neither. */
            marks.appendChild(dom.el('div', 'badge badge-' + kind, kind === 'link' ? 'LINK' : ''));
          });
          body.appendChild(marks);
        }
        return body;
      },
      onSelect: function (a) { ctx.app.go('album', { albumId: a.id, title: a.name, album: a }); }
    });
```

- [ ] **Step 5: Add the badge styles to `shell-legacy/css/app.css`**

Append at the end of the file:

```css
.badges { position: absolute; right: 10px; top: 10px; text-align: right; }
.badge { display: inline-block; vertical-align: middle; height: 40px; margin-left: 8px; background: rgba(17, 24, 39, 0.85); border: 2px solid #f3f4f6; border-radius: 20px; box-sizing: border-box; }
.badge-people { position: relative; width: 58px; }
.badge-people::before, .badge-people::after { content: ''; position: absolute; top: 9px; width: 18px; height: 18px; border-radius: 9px; background: #f3f4f6; }
.badge-people::before { left: 9px; }
.badge-people::after { left: 22px; }
.badge-link { padding: 0 14px; line-height: 36px; font-size: 20px; letter-spacing: 2px; color: #f3f4f6; }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: lint clean, `check-es5` clean (no CSS variables, no grid, no `gap`, no `clamp()`), every unit test passes including the two new ones.

- [ ] **Step 7: Check it in a browser**

Run: `npm run serve:legacy` and open <http://localhost:8080> in Chrome; sign in against the Immich server.
Expected: albums that Immich's own web UI shows as shared carry a pill with two white dots at the top right of the tile; albums with a public link carry a second `LINK` pill; private albums carry nothing. Switch Settings > Layout to List and back: the badge follows the tile in both layouts.

- [ ] **Step 8: Commit**

```bash
git add shell-legacy/index.html shell-legacy/js/view-albums.js shell-legacy/css/app.css tests/tools/build-legacy.test.js
git commit -m "Mark shared albums in the legacy grid

A pill with two dots means the album is shared with other people, a LINK
pill means it has a public link. Both are drawn with CSS because TV fonts
cannot be trusted to have an icon glyph. Opening an album now hands the
whole album object to the album screen.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Legacy shell — Info button and the sharing overlay

**Files:**
- Create: `shell-legacy/js/share-info-view.js`
- Modify: `shell-legacy/index.html` (one `<script>`), `shell-legacy/js/view-album.js` (top bar, `enter`, `leave`, `onKey`), `shell-legacy/css/app.css` (append rules)
- Test: `tests/tools/build-legacy.test.js` (append one test)

**Interfaces:**
- Consumes: `ImmichCore.shareInfo.{summary, dateRange, peopleLines, linkLines}` (Task 3); `ctx.client.getShareLinks(albumId)` (Task 2); the `album` param added by Task 4's `ctx.app.go('album', {albumId, title, album})`; `ui.dom`, `ui.nav` and the router contract.
- Produces: `ui.openShareInfo({album, client, onClose}) -> {close(), onKey(keyName) -> bool}` — the same shape `ui.openKeyboard` returns (`shell-legacy/js/keyboard.js:46`), so the owning view delegates keys to it the way `view-setup.js:77` delegates to the keyboard. `onKey` always returns `true` while the overlay is open: Back and OK close it (and call `onClose`), Up/Down scroll the panel body, Left/Right are swallowed.

The overlay fetches share links **only** when `album.hasSharedLink` is true, and only once, when it opens.

- [ ] **Step 1: Write the failing test**

Append to `tests/tools/build-legacy.test.js`:

```js
test('index.html loads the share info overlay before the album view', function () {
  var html = fs.readFileSync(path.join(root, 'shell-legacy', 'index.html'), 'utf8');
  var at = function (src) { return html.indexOf('src="' + src + '"'); };
  assert.ok(at('js/share-info-view.js') > -1, 'index.html does not load js/share-info-view.js');
  assert.ok(at('js/share-info-view.js') < at('js/view-album.js'), 'share-info-view.js must load before view-album.js');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tools/build-legacy.test.js`
Expected: FAIL — `index.html does not load js/share-info-view.js`.

- [ ] **Step 3: Create `shell-legacy/js/share-info-view.js`**

```js
/*
 * share-info-view.js - the "Info" overlay for one album.
 *
 * Same shape as ui.openKeyboard: the owning view keeps the returned object
 * and forwards keys to it while it is open. The panel is a plain full-screen
 * div in the .kb-overlay style; it scrolls by setting scrollTop, exactly like
 * the grid does, so no scrollbar is ever drawn on the TV.
 */
(function (w) {
  'use strict';
  var ui = w.ImmichUI = w.ImmichUI || {};
  var dom = ui.dom;
  var SCROLL_STEP = 160;

  ui.openShareInfo = function (opts) {
    var si = w.ImmichCore.shareInfo;
    var album = opts.album;
    var overlay = dom.el('div', 'si-overlay');
    var body = dom.el('div', 'si-body');
    overlay.appendChild(dom.el('div', 'si-title', album.name || 'Album'));
    overlay.appendChild(dom.el('div', 'si-sub', si.summary(album)));
    overlay.appendChild(body);
    overlay.appendChild(dom.el('div', 'si-hint', 'Up / Down scroll    OK or Back closes'));
    document.getElementById('root').appendChild(overlay);

    function heading(text) { body.appendChild(dom.el('div', 'si-heading', text)); }
    function line(text, cls) { body.appendChild(dom.el('div', cls || 'si-line', text)); }

    heading('Album');
    line((album.count || 0) + (album.count === 1 ? ' photo' : ' photos'));
    var range = si.dateRange(album);
    if (range) { line(range); }
    if (album.description) { line(album.description); }

    heading('Shared with');
    var people = si.peopleLines(album);
    if (people.length) {
      people.forEach(function (text) { line(text); });
    } else {
      line('Nobody - this album is not shared with other Immich users.');
    }

    heading('Public link');
    var status = dom.el('div', 'si-line');
    body.appendChild(status);
    if (!album.hasSharedLink) {
      status.textContent = 'No public link for this album.';
    } else {
      status.textContent = 'Loading the link...';
      opts.client.getShareLinks(album.id).then(function (links) {
        if (!overlay.parentNode) { return; }               /* closed while loading */
        if (!links.length) {
          status.textContent = 'The album is marked as link-shared, but the server returned no link.';
          return;
        }
        status.textContent = '';
        links.forEach(function (link) {
          si.linkLines(link).forEach(function (text) {
            line(text, text === link.url ? 'si-url' : 'si-line');
          });
        });
      }, function (err) {
        if (!overlay.parentNode) { return; }
        status.className = 'si-line si-error';
        status.textContent = err.message;
      });
    }

    function close() {
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
    }

    return {
      close: close,
      onKey: function (key) {
        if (key === 'back' || key === 'ok') { close(); opts.onClose(); return true; }
        if (key === 'up') { body.scrollTop = Math.max(0, body.scrollTop - SCROLL_STEP); }
        if (key === 'down') { body.scrollTop = body.scrollTop + SCROLL_STEP; }
        return true;
      }
    };
  };
}(window));
```

- [ ] **Step 4: Load it from `shell-legacy/index.html`**

Add this line directly after `<script src="js/keyboard.js"></script>`:

```html
  <script src="js/share-info-view.js"></script>
```

- [ ] **Step 5: Add the overlay styles to `shell-legacy/css/app.css`**

Append at the end of the file:

```css
.si-overlay { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; background: #111827; z-index: 10; padding: 50px 120px; box-sizing: border-box; }
.si-title { font-size: 48px; }
.si-sub { margin-top: 8px; font-size: 28px; color: #9ca3af; }
.si-body { margin-top: 26px; height: 800px; overflow: hidden; }
.si-heading { margin: 28px 0 10px 0; font-size: 24px; letter-spacing: 3px; text-transform: uppercase; color: #9ca3af; }
.si-line { font-size: 30px; line-height: 44px; word-wrap: break-word; }
.si-url { font-size: 34px; line-height: 48px; color: #a5b4fc; word-wrap: break-word; }
.si-error { color: #f87171; }
.si-hint { position: absolute; left: 120px; bottom: 26px; font-size: 24px; color: #6b7280; }
```

`word-wrap: break-word` is what makes a 125-character share key readable instead of clipped; `.si-url` is deliberately larger than body text because nobody can copy it off a TV — they have to type it somewhere else.

- [ ] **Step 6: Wire the Info button into `shell-legacy/js/view-album.js`**

(a) In the top-bar block (lines 9-13), add the button after the title so the flexing title pushes it to the right edge:

```js
    var bar = dom.el('div', 'topbar');
    var backBtn = dom.el('div', 'btn focusable', 'Back');
    var titleEl = dom.el('div', 'title');
    var infoBtn = dom.el('div', 'btn focusable', 'Info');
    bar.appendChild(backBtn);
    bar.appendChild(titleEl);
    bar.appendChild(infoBtn);
```

(b) Extend the state line (line 18) with the album and the open overlay:

```js
    var zone = 'grid', items = [], pager = null, loadedKey = null, view = ctx.settings.getView();
    var album = null, info = null;
```

(c) Add the click handler next to `backBtn.onclick` (line 63):

```js
    backBtn.onclick = function () { ctx.app.back(); };
    infoBtn.onclick = function () {
      if (!album || info) { return; }
      info = ui.openShareInfo({
        album: album,
        client: ctx.client,
        onClose: function () { info = null; zone = 'bar'; ui.nav.setFocus(infoBtn); }
      });
    };
```

(d) Replace `enter`, `leave` and the head of `onKey` in the returned object (lines 65-90):

```js
      enter: function (params, restore) {
        view = ctx.settings.getView();
        if (restore && loadedKey) {                    /* coming back from the viewer: reuse loaded data */
          showGrid(ctx.viewerIndex !== undefined ? ctx.viewerIndex : restore.index);
          return;
        }
        loadedKey = params.all ? 'all' : params.albumId;
        album = params.album || null;                  /* absent for "All photos" */
        if (album) { dom.show(infoBtn); } else { dom.hide(infoBtn); }
        titleEl.textContent = params.title || '';
        zone = 'grid';
        load(params);
      },
      leave: function () {
        if (info) { info.close(); info = null; }
        grid.blur();
        ui.nav.clearFocus();
      },
      snapshot: function () { return { index: grid.focusIndex() }; },
      onKey: function (key) {
        if (info) { return info.onKey(key); }
        if (zone === 'grid') {
```

The rest of `onKey` is unchanged. A hidden `infoBtn` carries the `hidden` class, so `ui.nav`'s `visibleFocusables` (which filters on `offsetParent !== null`, `shell-legacy/js/nav.js:22-26`) skips it automatically on the "All photos" screen — no extra guard needed in the navigation code.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: lint clean, `check-es5` clean, all unit tests pass including the new script-order test.

- [ ] **Step 8: Check it in a browser**

Run: `npm run serve:legacy` and open <http://localhost:8080>.
Expected, with a real Immich account:
1. Open a shared album. The top bar shows `Back  <title>  Info`; pressing Up from the grid moves focus to the bar, Right reaches **Info**, OK opens the panel.
2. The panel lists the photo count, the date range, the description, every person with their email and role, and — for a link-shared album — the full `https://.../share/<key>` URL wrapping over several lines, its expiry and its permissions. Compare the URL against the one Immich's own web UI shows for the same album.
3. Up/Down scroll the panel when the content is taller than the box. Back closes it and leaves focus on **Info**; OK does the same.
4. Open **All photos**: the Info button is not shown and Right from Back does nothing.

- [ ] **Step 9: Commit**

```bash
git add shell-legacy/js/share-info-view.js shell-legacy/index.html shell-legacy/js/view-album.js shell-legacy/css/app.css tests/tools/build-legacy.test.js
git commit -m "Add an Info panel to the legacy album screen

New Info button next to Back opens a full-screen panel with who the album
is shared with, the public link and its permissions, plus the description,
date range and photo count. The link is only fetched when the panel opens.
All photos has no album behind it, so the button is hidden there.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Enact shell — badge on shared album tiles

**Files:**
- Modify: `shell-enact/src/services.js`, `shell-enact/src/views/MediaGrid.js`, `shell-enact/src/views/AlbumsView.js`
- Test: `tests/tools/sync-core.test.js` (append)

**Interfaces:**
- Consumes: `ImmichCore.shareInfo.{badges, summary}` (Task 3), the `Album` shape (Task 1).
- Produces:
  - `services.shareInfo` — the `core/share-info.js` API, re-exported next to `settings`, `client`, `auth`, `paging`.
  - `MediaGrid({items, view, srcOf, labelOf, sublabelOf, iconOf, onSelect, onNearEnd})` — two new **optional** props. `sublabelOf(item) -> string|undefined` becomes `ImageItem`'s `label` (its secondary caption). `iconOf(item) -> string|null` becomes `ImageItem`'s `imageIconSrc`, a Sandstone icon name. Omitting either prop leaves the tile exactly as it is today.
  - `AlbumsView` pushes the album object: `nav.push('album', {albumId, title, album})`.

**Why these props and not an overlay:** checked against the installed library. `@enact/sandstone/ImageItem`'s `children` and `label` are both `PropTypes.string` (`node_modules/@enact/sandstone/ImageItem/ImageItem.js:72,142`), so there is no slot that accepts a React node over the image. There *is* a documented icon slot: `imageIconSrc` (`string|object`) plus `imageIconComponent` (default `Image`), rendered as `<Cell component={imageIconComponent} className={css.imageIcon} src={imageIconSrc} />` beside the caption, and only when `orientation === 'vertical'` (`ImageItem.js:222-237`). Sandstone's `Icon` takes its icon name as **children**, not as `src`, so a three-line adapter bridges the two. `info`, `link`, `share` and `profile` are all present in `node_modules/@enact/sandstone/Icon/IconList.js`. In list mode (`orientation === 'horizontal'`) the icon is not rendered, which is why `sublabelOf` carries the same information as text.

- [ ] **Step 1: Write the failing test**

Append to `tests/tools/sync-core.test.js`:

```js
test('sync copies share-info.js, which the Enact services module imports', function () {
  var dst = fs.mkdtempSync(path.join(os.tmpdir(), 'core-'));
  sync.sync(path.join(__dirname, '..', '..', 'core'), dst);
  assert.ok(fs.existsSync(path.join(dst, 'share-info.js')), 'share-info.js was not synced');
  var services = fs.readFileSync(path.join(__dirname, '..', '..', 'shell-enact', 'src', 'services.js'), 'utf8');
  assert.ok(services.indexOf("import './core/share-info'") > -1, 'services.js does not import core/share-info');
  assert.ok(services.indexOf('shareInfo') > -1, 'services.js does not export shareInfo');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tools/sync-core.test.js`
Expected: FAIL — `services.js does not import core/share-info` (the file itself is synced already, because `sync-core.js` copies every `.js` in `core/`).

- [ ] **Step 3: Export it from `shell-enact/src/services.js`**

Replace the whole file:

```js
import './core/http';
import './core/settings';
import './core/paging';
import './core/immich-client';
import './core/share-info';
import './core/auth';

const core = window.ImmichCore;
const settings = core.settings.create(core.settings.defaultStorage());
const client = core.immichClient.create({http: core.http, getConfig: settings.getCredentials});
const auth = core.auth.create({client, settings});

export default {settings, client, auth, paging: core.paging, shareInfo: core.shareInfo};
```

- [ ] **Step 4: Give `MediaGrid` an icon and a sub-label**

Replace `shell-enact/src/views/MediaGrid.js`:

```js
import Icon from '@enact/sandstone/Icon';
import ImageItem from '@enact/sandstone/ImageItem';
import {VirtualGridList, VirtualList} from '@enact/sandstone/VirtualList';
import ri from '@enact/ui/resolution';

// ImageItem renders its icon slot as <Cell component={imageIconComponent} src={imageIconSrc} />,
// but Sandstone's Icon takes the icon name as children, so bridge the two.
const NamedIcon = ({src, ...rest}) => <Icon {...rest} size="tiny">{src}</Icon>;

const MediaGrid = ({items, view, srcOf, labelOf, sublabelOf, iconOf, onSelect, onNearEnd}) => {
	const list = view.viewMode === 'list';
	const renderItem = ({index, ...rest}) => {
		const item = items[index];
		const icon = iconOf ? iconOf(item) : null;
		return (
			<ImageItem
				{...rest}
				data-index={index}
				src={srcOf(item)}
				orientation={list ? 'horizontal' : 'vertical'}
				label={sublabelOf ? sublabelOf(item) : undefined}
				imageIconSrc={icon || undefined}
				imageIconComponent={NamedIcon}
				onClick={() => onSelect(index)}
			>
				{labelOf ? labelOf(item) : ''}
			</ImageItem>
		);
	};
	const onScrollStop = (e) => {
		if (onNearEnd && e.moreInfo && e.moreInfo.lastVisibleIndex >= items.length - 20) onNearEnd();
	};
	if (list) {
		return <VirtualList dataSize={items.length} itemRenderer={renderItem} itemSize={ri.scale(150)} spacing={ri.scale(12)} onScrollStop={onScrollStop} />;
	}
	const w = Math.floor(1700 / view.columns);
	return (
		<VirtualGridList
			dataSize={items.length}
			itemRenderer={renderItem}
			itemSize={{minWidth: ri.scale(w), minHeight: ri.scale(Math.round(w * 0.8))}}
			spacing={ri.scale(12)}
			onScrollStop={onScrollStop}
		/>
	);
};

export default MediaGrid;
```

`data-index={index}` is new: `@enact/ui`'s `VirtualListBasic` resolves each item's DOM node with `parseInt(itemNode.dataset.index) === index ? itemNode : ref.querySelector('[data-index="N"]')`, so without it neither branch matches and 5-way focus restoration has nothing to hold on to.

- [ ] **Step 5: Use it from `shell-enact/src/views/AlbumsView.js`**

Replace the `<MediaGrid .../>` element (lines 29-35) with:

```js
			<MediaGrid
				items={albums}
				view={view}
				srcOf={(a) => (a.coverId ? services.client.thumbnailUrl(a.coverId, 'thumbnail') : undefined)}
				labelOf={(a) => a.name + ' (' + a.count + ')'}
				sublabelOf={(a) => (services.shareInfo.badges(a).length ? services.shareInfo.summary(a) : undefined)}
				iconOf={(a) => {
					const kinds = services.shareInfo.badges(a);
					if (!kinds.length) return null;
					return kinds.indexOf('link') > -1 ? 'link' : 'share';
				}}
				onSelect={(i) => nav.push('album', {albumId: albums[i].id, title: albums[i].name, album: albums[i]})}
			/>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/tools/sync-core.test.js && npm --prefix shell-enact run pack`
Expected: the sync test passes; `enact pack` finishes with no errors and writes `shell-enact/dist`.

- [ ] **Step 7: Check it in the Simulator**

Run: `ares-launch -s 24 shell-enact/dist`
Expected: shared albums show a small chain-link or share icon next to the caption and a second caption line reading e.g. `Shared with 2 people, public link`; private albums show only name and count. Switch Settings > Layout to List: the icon disappears (horizontal `ImageItem` has no icon slot) but the second caption line is still there.

- [ ] **Step 8: Commit**

```bash
git add shell-enact/src/services.js shell-enact/src/views/MediaGrid.js shell-enact/src/views/AlbumsView.js tests/tools/sync-core.test.js
git commit -m "Mark shared albums in the Enact grid

Sandstone's ImageItem only takes strings for its captions, but it does
have an icon slot, so use that for the share/link icon and the secondary
caption for the wording. Also set data-index so the virtual list can find
its own item nodes again.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Enact shell — Info button and sharing Popup

**Files:**
- Create: `shell-enact/src/views/ShareInfoPopup.js`, `shell-enact/src/views/ShareInfoPopup.test.js`
- Modify: `shell-enact/src/views/AlbumView.js`

**Interfaces:**
- Consumes: `services.shareInfo` (Task 6), `services.client.getShareLinks` (Task 2), the `album` param pushed by Task 6's `AlbumsView`.
- Produces: `ShareInfoPopup({open, album, links, error, onClose})` — a presentational Sandstone `Popup`; it does no fetching of its own so it stays testable. `links` is `null` while loading, otherwise the array from `getShareLinks`; `error` is a string or `''`. `AlbumView` owns the fetch and the `open` state, and renders the Info `Button` in the header's `slotAfter` only when `params.album` exists.

Props verified against the installed library: `Popup` accepts `open`, `onClose`, `position` (`'bottom'|'center'|'fullscreen'|'left'|'right'|'top'`) and `scrimType` (`node_modules/@enact/sandstone/Popup/Popup.js:554-683`); `Header` accepts a `slotAfter` node (`Panels/Header.js:229`); `Heading` accepts `spacing` and `showLine` (`Heading/Heading.js:53-87`); `Icon` takes its name as children (`Icon/Icon.js:62`). `enact test` runs Jest 30 with `@testing-library/react` 16, both bundled inside `@enact/cli`, and matches `**/*.test.js`.

- [ ] **Step 1: Write the failing test**

`shell-enact/src/views/ShareInfoPopup.test.js`:

```js
import {FloatingLayerDecorator} from '@enact/ui/FloatingLayer';
import {render, screen} from '@testing-library/react';
import ShareInfoPopup from './ShareInfoPopup';

// Sandstone's Popup renders through a FloatingLayer, which needs a decorated
// ancestor (normally ThemeDecorator on App). Without this wrapper the popup
// renders nothing and every query below fails. `@enact/cli`'s jest setup does
// NOT load @testing-library/jest-dom, so the assertions use plain matchers:
// getByText already throws when the text is missing.
const Root = FloatingLayerDecorator('div');

const ALBUM = {
	id: 'a1', name: 'Trip', count: 42, description: 'Summer 2024',
	shared: true, hasSharedLink: true,
	startDate: '2024-06-12T08:00:00.000Z', endDate: '2024-06-18T20:30:00.000Z',
	users: [{name: 'Ann Lee', email: 'ann@example.com', role: 'editor'}]
};
const LINK = {
	url: 'https://photos.example.com/share/AbC-_123', expiresAt: '2027-03-03T00:00:00.000Z',
	allowDownload: true, allowUpload: false, hasPassword: false, description: ''
};

describe('ShareInfoPopup', () => {
	test('shows the album facts and the people it is shared with', () => {
		render(<Root><ShareInfoPopup open album={ALBUM} links={[LINK]} error="" onClose={() => {}} /></Root>);
		expect(screen.getByText('Trip')).toBeTruthy();
		expect(screen.getByText('Shared with 1 person, public link')).toBeTruthy();
		expect(screen.getByText('42 photos')).toBeTruthy();
		expect(screen.getByText('12 Jun 2024 - 18 Jun 2024')).toBeTruthy();
		expect(screen.getByText('Summer 2024')).toBeTruthy();
		expect(screen.getByText('Ann Lee  (ann@example.com)  -  editor')).toBeTruthy();
	});

	test('shows the share url, its expiry and its permissions', () => {
		render(<Root><ShareInfoPopup open album={ALBUM} links={[LINK]} error="" onClose={() => {}} /></Root>);
		expect(screen.getByText('https://photos.example.com/share/AbC-_123')).toBeTruthy();
		expect(screen.getByText('Expires 3 Mar 2027')).toBeTruthy();
		expect(screen.getByText('Download allowed, upload not allowed')).toBeTruthy();
	});

	test('says the link is loading, then that there is none', () => {
		const {rerender} = render(<Root><ShareInfoPopup open album={ALBUM} links={null} error="" onClose={() => {}} /></Root>);
		expect(screen.getByText('Loading the link...')).toBeTruthy();
		rerender(<Root><ShareInfoPopup open album={ALBUM} links={[]} error="" onClose={() => {}} /></Root>);
		expect(screen.getByText('The album is marked as link-shared, but the server returned no link.')).toBeTruthy();
	});

	test('shows the server error instead of the link', () => {
		render(<Root><ShareInfoPopup open album={ALBUM} links={null} error="The server returned an error (HTTP 500)." onClose={() => {}} /></Root>);
		expect(screen.getByText('The server returned an error (HTTP 500).')).toBeTruthy();
	});

	test('a private album says so and never mentions loading', () => {
		const priv = {id: 'a2', name: 'Mine', count: 1, description: '', shared: false, hasSharedLink: false, startDate: null, endDate: null, users: []};
		render(<Root><ShareInfoPopup open album={priv} links={null} error="" onClose={() => {}} /></Root>);
		expect(screen.getByText('Private album')).toBeTruthy();
		expect(screen.getByText('Nobody - this album is not shared with other Immich users.')).toBeTruthy();
		expect(screen.getByText('No public link for this album.')).toBeTruthy();
		expect(screen.queryByText('Loading the link...')).toBeNull();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix shell-enact test -- --watchAll=false`
Expected: FAIL — `Cannot find module './ShareInfoPopup'`.

- [ ] **Step 3: Write `shell-enact/src/views/ShareInfoPopup.js`**

```js
import BodyText from '@enact/sandstone/BodyText';
import Heading from '@enact/sandstone/Heading';
import Popup from '@enact/sandstone/Popup';
import Scroller from '@enact/sandstone/Scroller';
import services from '../services';

const URL_STYLE = {wordWrap: 'break-word', color: '#a5b4fc'};

// Presentational only: AlbumView owns the fetch, so every state this renders
// can be produced in a test by passing props.
const ShareInfoPopup = ({open, album, links, error, onClose}) => {
	if (!album) return null;
	const si = services.shareInfo;
	const people = si.peopleLines(album);
	const range = si.dateRange(album);

	const linkBody = () => {
		if (error) return <BodyText>{error}</BodyText>;
		if (!album.hasSharedLink) return <BodyText>No public link for this album.</BodyText>;
		if (links === null) return <BodyText>Loading the link...</BodyText>;
		if (!links.length) return <BodyText>The album is marked as link-shared, but the server returned no link.</BodyText>;
		return links.map((link, i) => (
			<div key={i}>
				{si.linkLines(link).map((text, j) => (
					<BodyText key={j} style={text === link.url ? URL_STYLE : undefined}>{text}</BodyText>
				))}
			</div>
		));
	};

	return (
		<Popup open={open} onClose={onClose} position="fullscreen" scrimType="translucent">
			<Scroller>
				<Heading showLine>{album.name}</Heading>
				<BodyText>{si.summary(album)}</BodyText>
				<Heading spacing="small">Album</Heading>
				<BodyText>{(album.count || 0) + (album.count === 1 ? ' photo' : ' photos')}</BodyText>
				{range ? <BodyText>{range}</BodyText> : null}
				{album.description ? <BodyText>{album.description}</BodyText> : null}
				<Heading spacing="small">Shared with</Heading>
				{people.length
					? people.map((text, i) => <BodyText key={i}>{text}</BodyText>)
					: <BodyText>Nobody - this album is not shared with other Immich users.</BodyText>}
				<Heading spacing="small">Public link</Heading>
				{linkBody()}
			</Scroller>
		</Popup>
	);
};

export default ShareInfoPopup;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix shell-enact test -- --watchAll=false`
Expected: all 5 tests in `ShareInfoPopup.test.js` pass.

- [ ] **Step 5: Add the Info button and the fetch to `shell-enact/src/views/AlbumView.js`**

Replace the whole file:

```js
import {useEffect, useRef, useState} from 'react';
import {Panel, Header} from '@enact/sandstone/Panels';
import BodyText from '@enact/sandstone/BodyText';
import Button from '@enact/sandstone/Button';
import services from '../services';
import MediaGrid from './MediaGrid';
import ShareInfoPopup from './ShareInfoPopup';
import Viewer from './Viewer';

const AlbumView = ({nav, params, ...rest}) => {
	const [items, setItems] = useState([]);
	const [message, setMessage] = useState('Loading...');
	const [viewerIndex, setViewerIndex] = useState(null);
	const [infoOpen, setInfoOpen] = useState(false);
	const [links, setLinks] = useState(null);
	const [linkError, setLinkError] = useState('');
	const pagerRef = useRef(null);
	const view = services.settings.getView();
	const album = params.album || null;          // absent for "All photos"

	useEffect(() => {
		const done = (list) => { setItems(list); setMessage(list.length ? '' : 'No photos here.'); };
		const filter = params.all ? null : {albumIds: [params.albumId]};
		const pager = services.paging.createPager((n) => services.client.searchPage(n, 60, filter));
		pagerRef.current = pager;
		pager.loadNext().then(() => done(pager.items().slice()), (err) => setMessage(err.message));
	}, [params]);

	const loadMore = () => {
		const p = pagerRef.current;
		if (p && p.hasMore()) p.loadNext().then(() => setItems(p.items().slice()), () => {});
	};

	// Fetched only here, when the panel opens, and only once per album.
	const openInfo = () => {
		setInfoOpen(true);
		if (album && album.hasSharedLink && links === null && !linkError) {
			services.client.getShareLinks(album.id).then(setLinks, (err) => setLinkError(err.message));
		}
	};

	return (
		<Panel {...rest}>
			<Header title={params.title || ''}>
				{album ? <slotAfter><Button onClick={openInfo}>Info</Button></slotAfter> : null}
			</Header>
			{message ? <BodyText>{message}</BodyText> : null}
			<MediaGrid
				items={items}
				view={view}
				srcOf={(a) => services.client.thumbnailUrl(a.id, view.thumbSize)}
				onSelect={setViewerIndex}
				onNearEnd={loadMore}
			/>
			<Viewer open={viewerIndex !== null} items={items} index={viewerIndex} onIndex={setViewerIndex} onClose={() => setViewerIndex(null)} />
			<ShareInfoPopup open={infoOpen} album={album} links={links} error={linkError} onClose={() => setInfoOpen(false)} />
		</Panel>
	);
};

export default AlbumView;
```

- [ ] **Step 6: Build and check in the Simulator**

Run: `npm --prefix shell-enact test -- --watchAll=false && npm --prefix shell-enact run pack && ares-launch -s 24 shell-enact/dist`
Expected: tests pass, `enact pack` succeeds. In the Simulator: opening a shared album shows an **Info** button at the right of the header; it opens a full-screen popup with the same facts as the legacy panel, scrollable with Up/Down, closed with Back. Opening **All photos** shows no Info button.

- [ ] **Step 7: Commit**

```bash
git add shell-enact/src/views/ShareInfoPopup.js shell-enact/src/views/ShareInfoPopup.test.js shell-enact/src/views/AlbumView.js
git commit -m "Add an Info popup to the Enact album screen

Same content as the legacy panel, in a Sandstone Popup. The popup takes
everything as props so the five states (loading, no link, links, error,
private album) can be tested without a server.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Documentation — feature line, acceptance steps, verified API facts

**Files:**
- Modify: `README.md:5` (the scope sentence) and the "Remote keys" section; `docs/TESTING.md` (new section 3b, and the results checklist); `docs/immich-api-notes.md` (new verified-facts section)

**Interfaces:**
- Consumes: everything built in Tasks 1-7. Produces no code.

- [ ] **Step 1: Update the scope sentence in `README.md`**

Replace line 5 (`The app connects to your own Immich server, ... Not yet: map, people/faces, search, video.`) with:

```markdown
The app connects to your own Immich server, lists your albums (plus an "All photos" view) and shows the photos full screen. It can display them as a grid or a list, with 3 to 8 columns per row. Shared albums are marked in the grid, and an **Info** button on the album screen shows who the album is shared with, its public-link URL and permissions, its description, date range and photo count. It runs on LG TVs from webOS TV 3.x (2016-17 models) up to current ones. Scope of this first iteration: albums and photos, sharing info, grid/list layout, 3-8 columns, photo size. Not yet: map, people/faces, search, video, creating or editing share links.
```

- [ ] **Step 2: Add the Info key to the "Remote keys" section of `README.md`**

Replace the "Remote keys" paragraph with:

```markdown
Arrows: move. OK: open/select. Back: previous screen. Back on the first screen exits the app. In the viewer: Left/Right previous/next photo. On an album screen: Up from the grid reaches the top bar, where **Info** opens the sharing panel (Up/Down scroll it, OK or Back closes it).
```

- [ ] **Step 3: Add an acceptance section to `docs/TESTING.md`**

Insert after the `## 4. Photos` section:

```markdown
## 4b. Sharing badges and the Info panel
Needs at least three albums in Immich: one private, one shared with another user, one with a public link (Immich web UI > album > Share > Create link; add a password and an expiry date to one of them).

- [ ] On the Albums screen, only the shared albums are marked. Legacy build: a pill with two dots for people-shared, a `LINK` pill for link-shared. Enact build: a share or link icon next to the caption plus a second caption line such as `Shared with 2 people, public link`.
- [ ] Switch Settings > Layout to List. Legacy: both pills are still there. Enact: the icon is gone (Sandstone draws no icon in horizontal items) but the second caption line remains.
- [ ] Open the people-shared album, press Up, move to **Info**, press OK. The panel lists every person with their email and their role (`owner` / `editor` / `viewer`), and matches the member list in Immich's web UI.
- [ ] Open the link-shared album's Info panel. The URL shown must be character-for-character the URL Immich's own web UI offers for that link (`https://<server>/share/<key>`, or `https://<server>/s/<slug>` if you gave the link a custom URL). The long key must wrap over several lines, not be cut off.
- [ ] The expiry line matches the date you set, and the permissions line matches the link's Download/Upload switches. **For the password-protected link, confirm the line ends with `password protected`** — this is the one field the plan could not verify from Immich's source; if it is missing, `password` is coming back empty rather than as a hash and `hasPassword` in `core/immich-client.js` needs a different source.
- [ ] Open the private album's Info panel: `Private album`, `Nobody - this album is not shared with other Immich users.`, `No public link for this album.`
- [ ] Open **All photos**: there is no Info button at all.
- [ ] Press Back in the panel: it closes and focus returns to the Info button, and the album grid is still where you left it.
```

- [ ] **Step 4: Add the verified facts to `docs/immich-api-notes.md`**

Append at the end of the file:

```markdown
## Sharing fields and share links (verified 2026-09-25 from Immich's source)

**The album list already carries the sharing data.** `GET /api/albums` returns, per album, `shared` (bool), `hasSharedLink` (bool), `albumUsers` (`[{user: {id, name, email, profileImagePath, avatarColor, profileChangedAt}, role}]`), `description`, `startDate`, `endDate`, `createdAt`, `updatedAt`, `assetCount`, `isActivityEnabled`, `order`, `lastModifiedAssetTimestamp` and `contributorCounts`. Source: `mapAlbum()` in <https://raw.githubusercontent.com/immich-app/immich/main/server/src/dtos/album.dto.ts>, shared by `getAll()` and `get()` in `album.service.ts`. So the shared badge in the grid costs **no extra request** — `listAlbums()` just keeps the fields.

**The public URL is not returned by the API.** `GET /api/shared-links?albumId=<uuid>` returns an array of `SharedLinkResponseDto`; the `albumId` filter is declared in `SharedLinkSearchSchema` (`albumId: z.uuidv4().optional().describe('Filter by album ID')`) and the handler is `getAllSharedLinks(@Auth() auth, @Query() dto: SharedLinkSearchDto): Promise<SharedLinkResponseDto[]>`. Each element has `id`, `description`, `password`, `userId`, `key` (base64url), `type`, `createdAt`, `expiresAt`, `assets`, `album?`, `allowUpload`, `allowDownload`, `showMetadata`, `slug`. Sources: <https://raw.githubusercontent.com/immich-app/immich/main/server/src/dtos/shared-link.dto.ts> and <https://raw.githubusercontent.com/immich-app/immich/main/server/src/controllers/shared-link.controller.ts>.

The URL is built client-side. Immich's web client has exactly two routes for it — `web/src/routes/(user)/share/[key]` and `web/src/routes/(user)/s/[slug]` (<https://api.github.com/repos/immich-app/immich/contents/web/src/routes/(user)>) — so the app builds `{serverUrl}/s/{slug}` when a link has a custom slug and `{serverUrl}/share/{key}` otherwise. The public docs at <https://docs.immich.app/features/sharing/> show only the key form, e.g. `https://my.immich.app/share/JUckRMxlgpo7F9BpyqGk_cZEwDzaU_U5LU5_oNZp1ETIBa9dpQ0b5ghNm_22QVJfn3k`, and do not mention slugs at all.

**Still UNVERIFIED against a live server:**
- Whether `password` comes back as a non-empty hash when a link is password-protected. The client reports "password protected" from `!!link.password`, so an empty string would silently hide it. Step 4b in docs/TESTING.md checks this.
- Whether pre-v2 Immich servers accept `?albumId=`. The app shows the server's own error message inside the Info panel rather than failing the screen, so an older server degrades gracefully.
- Whether the custom-slug form is reachable on the user's deployment (it depends on the server's `IMMICH_PUBLIC_URL`-style configuration rather than on the API).

**Not implemented on purpose:** creating, editing or revoking share links from the TV. The app is read-only, and typing a slug or password with a D-pad is not something anyone should have to do.
```

- [ ] **Step 5: Update the results checklist at the end of `docs/TESTING.md`**

In the "Report template", add one line under the existing entries:

```markdown
Sharing (step 4b) — badge correct / Info panel URL matches Immich's web UI: 
```

- [ ] **Step 6: Verify the docs are consistent with the code**

Run: `npm test && grep -n "getShareLinks\|share-info\|/s/" README.md docs/TESTING.md docs/immich-api-notes.md`
Expected: tests pass; the grep shows the new sections and no stale claim that sharing is out of scope.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/TESTING.md docs/immich-api-notes.md
git commit -m "Write down what sharing does and what we checked

README gets the feature line and the Info key, TESTING gets a section for
the badges and the panel (including the one check that the password flag
really works), and the API notes record where every sharing fact came
from plus what is still unverified.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

Run after Task 8. This is the plan author's own check against the spec, already applied — the notes below record what was checked and what was fixed inline.

**1. Spec coverage** (Unit 6 of `docs/superpowers/specs/2026-09-25-next-features-design.md`):

| Spec requirement | Task |
| --- | --- |
| `listAlbums()` surfaces `shared`, `hasSharedLink`, mapped `users`, no new request | 1 |
| `getShareLinks(albumId)` -> `{serverUrl}/share/{key}`, on demand only | 2 |
| Defensive mapping: missing / empty / broken `albumUsers` never throws | 1 (third test) |
| Same `invalidResponse()` validation style as the other calls | 2 |
| Badge on shared tiles, no icon-font / SVG dependency | 4 (legacy, CSS shape), 6 (Enact, built-in icon name) |
| Different visual for `hasSharedLink` | 4 (`LINK` chip), 6 (`link` vs `share` icon) |
| Info button in the album top bar next to Back | 5, 7 |
| Overlay lists people + emails + roles, link URL / expiry / permissions, description, date range, photo count | 5, 7 |
| Album object passed through navigation; "All photos" still works with Info hidden | 4 + 5 (legacy), 6 + 7 (Enact) |
| Overlay closes with Back/OK | 5 (`onKey`), 7 (`Popup onClose`) |
| Legacy reuses the `.kb-overlay` full-panel pattern and the `view-setup.js` key-delegation pattern | 5 |
| Enact uses Sandstone `Popup`, props verified against the installed library | 7 (and the `ImageItem` finding in 6) |
| Long URLs readable: wrapped, larger than body text | 5 (`.si-url` + `word-wrap`), 7 (`URL_STYLE`) |
| Docs: README line, TESTING step, verified API facts with sources | 8 |
| QR code out of scope | not implemented anywhere; stated in Task 8's API notes |

No gaps found.

**2. Placeholder scan:** no "TBD", "TODO", "similar to Task N", "add appropriate error handling" or "write tests for the above" anywhere. Every code step carries the code to paste; every error path names the exact string shown to the user. The two "unchanged" phrases (Task 5 step 6d "the rest of `onKey` is unchanged", Task 1 step 3 "add these helpers after `onlyImages`") are anchored to line numbers in files that exist today, not to other tasks.

**3. Type consistency** — checked across tasks:
- `Album` fields produced in Task 1 (`shared`, `hasSharedLink`, `description`, `startDate`, `endDate`, `users[].{name,email,role}`) are exactly the fields read in Tasks 3, 4, 5, 6, 7.
- `ShareLink` fields produced in Task 2 (`url`, `expiresAt`, `allowDownload`, `allowUpload`, `hasPassword`, `description`) are exactly the fields read by `shareInfo.linkLines` in Task 3 and asserted in Tasks 3 and 7.
- `shareInfo` is spelled `ImmichCore.shareInfo` (legacy, Tasks 4-5) and `services.shareInfo` (Enact, Tasks 6-7); both point at the same `core/share-info.js` export object. The Enact export is the subject of Task 6's failing test, so a typo there fails the suite rather than the TV.
- Badge kinds are the strings `'people'` and `'link'` everywhere: returned by `shareInfo.badges` (Task 3), turned into `.badge-people` / `.badge-link` (Task 4, guarded by a test that derives the class names from `badges()` itself), and mapped to the Sandstone icon names `share` / `link` (Task 6).
- `ui.openShareInfo({album, client, onClose}) -> {close, onKey}` is defined in Task 5 and called only in Task 5.
- `ShareInfoPopup({open, album, links, error, onClose})` is defined in Task 7 and used only in Task 7's `AlbumView`.

**Fixed inline during this review:**
- Task 7's test originally used `toBeInTheDocument()`. `@enact/cli`'s Jest setup (`config/jest/setupTests.js`) does not load `@testing-library/jest-dom`, so that matcher would not exist. Changed to plain `toBeTruthy()` / `toBeNull()`; `getByText` already throws on a miss.
- Task 7's test originally rendered `ShareInfoPopup` bare. Sandstone's `Popup` renders through a `FloatingLayer`, which needs a `FloatingLayerDecorator` ancestor — bare, it renders nothing and every assertion fails. Added the `Root` wrapper.
- Task 6 originally reused `MediaGrid`'s existing `renderItem` verbatim; while checking `@enact/ui`'s `VirtualListBasic` for where a badge could go, it turned out the list resolves item nodes through `data-index`, which the current code never sets. Added `data-index={index}` and said why in the commit message.

## Execution order and verification

Tasks are ordered so each one leaves the app working: 1 → 2 → 3 (core, fully unit-tested) → 4 → 5 (legacy, verifiable in Chrome via `npm run serve:legacy`) → 6 → 7 (Enact, verifiable in the Simulator) → 8 (docs).

After Task 8, the whole-unit check:

```bash
npm test
npm run package:legacy
npm --prefix shell-enact test -- --watchAll=false
npm --prefix shell-enact run pack
```

then install both builds on the TV / Simulator and walk through `docs/TESTING.md` step 4b. The unit is done when the Info panel's URL for a link-shared album matches, character for character, the URL Immich's own web UI shows for that album.
