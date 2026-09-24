# Immich API Verification Notes

This document contains the curl commands used to verify Immich API assumptions for the webOS TV client. These checks should be run by the user against their Immich server to ensure compatibility.

## Verification Checklist

### Check 1: User API (Current Endpoint)
**Command:**
```bash
curl -s -H "x-api-key: KEY" URL/api/users/me | head -c 300; echo
```
**Status:** UNVERIFIED - to be run by the user
**Expected Result:** JSON object with user information (e.g., `{"id":"...", "name":"Ann", ...}`)
**Purpose:** Verify the user authentication works and returns user details

---

### Check 2: Albums API
**Command:**
```bash
curl -s -H "x-api-key: KEY" URL/api/albums | head -c 300; echo
```
**Status:** UNVERIFIED - to be run by the user
**Expected Result:** JSON array of album objects (e.g., `[{"id":"a1", "albumName":"Trip", "assetCount":3, "albumThumbnailAssetId":"x9"}, ...]`)
**Purpose:** Verify album listing endpoint returns properly formatted album data

---

### Check 3: Search Metadata API (Paginated Assets)
**Command:**
```bash
curl -s -X POST -H "x-api-key: KEY" -H "Content-Type: application/json" -d '{"page":1,"size":2,"order":"desc","type":"IMAGE"}' URL/api/search/metadata | head -c 400; echo
```
**Status:** UNVERIFIED - to be run by the user
**Expected Result:** JSON object with structure: `{"assets":{"items":[...],"nextPage":"2"...}}` containing only IMAGE type assets
**Purpose:** Verify search/pagination endpoint works and returns IMAGE type assets with nextPage for pagination

---

### Check 4: Thumbnail URL with apiKey Query Parameter
**Command:**
```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "URL/api/assets/ASSET_ID/thumbnail?size=thumbnail&apiKey=KEY"
```
**Status:** UNVERIFIED - to be run by the user
**Expected Result:** `200 image/...` (HTTP 200 with image content type)
**Purpose:** Verify thumbnail endpoint accepts `apiKey` as a query parameter (not just header)

---

### Check 5: Invalid Key Parameter (Expected Failure)
**Command:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" "URL/api/assets/ASSET_ID/thumbnail?size=thumbnail&key=KEY"
```
**Status:** UNVERIFIED - to be run by the user
**Expected Result:** `401` or `404` (should fail - not the correct parameter name)
**Purpose:** Verify that the incorrect parameter name `key=` does not work

---

### Check 6: CORS Support (Access-Control Header)
**Command:**
```bash
curl -s -D - -o /dev/null -H "Origin: null" -H "x-api-key: KEY" URL/api/users/me | grep -i access-control
```
**Status:** UNVERIFIED - to be run by the user
**Expected Result:** An `access-control-allow-origin` header is present in the response
**Purpose:** Verify CORS headers are present for cross-origin requests

---

### Check 7 — CORS preflight
**Command:**
```bash
curl -s -D - -o /dev/null -X OPTIONS -H "Origin: null" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: x-api-key,content-type" URL/api/search/metadata
```
**Status:** UNVERIFIED - to be run by the user
**Expected Result:** The response contains `access-control-allow-origin`, `access-control-allow-methods` and `access-control-allow-headers` (allow-headers must include `x-api-key` and `content-type`)
**Purpose:** The app's requests always force a preflight (x-api-key header, JSON POST); Check 6 (plain GET) cannot detect a missing preflight answer.
**If it fails:** fix the proxy / Immich CORS configuration; the app cannot work without it.

---

## If a Check Fails

### If Check 4 (`apiKey=` query parameter) fails (401/404):
The thumbnail endpoint may not accept API keys as query parameters. In this case, `core/immich-client.js` must be reworked to use one of the following approaches:

1. **XHR Blob Loading:** Use `XMLHttpRequest` with `responseType='blob'` and create object URLs using `URL.createObjectURL()` for display
2. **Proxy Server:** Use a CORS-enabling reverse proxy that adds `apiKey` to the request header before forwarding to Immich

The current implementation assumes query parameter authentication is available.

**Effort differs by cause.** If a different query-param name or path shape is needed, it is a ~3-line change confined to `media()` in `core/immich-client.js`. If `apiKey=` on media URLs fails and the server requires header auth for media, it is NOT a three-line change: the media URL builders (`thumbnailUrl`/`viewerUrl` in `core/immich-client.js`) would have to become async (XHR blob + `URL.createObjectURL` with revocation), touching `shell-legacy/js/view-albums.js`, `view-album.js`, `view-viewer.js` and `shell-enact/src/views/MediaGrid.js`, `Viewer.js`.

### If Check 6 or Check 7 (CORS) fails:
The reverse proxy or Immich server must be configured to:
1. Allow `Origin: null` (for TV app context)
2. Return `Access-Control-Allow-Origin` header in responses
3. Return `Access-Control-Allow-Methods` header listing POST, GET
4. Return `Access-Control-Allow-Headers` header including x-api-key and Content-Type

If CORS cannot be enabled, the XHR blob loading approach mentioned above should be used.

---

## Known Immich v3.x behaviour

**`GET /albums/{id}` has no `assets` field on Immich v3.x.** Confirmed live (not just from the OpenAPI spec) via the debug logging in `docs/DEBUG-LOGGING.md` against the user's own v3.x server on 2026-09-24: the response is `200 OK` and includes `assetCount`, but no `assets` array at all — `hasAssets:false`, `assetsType:"undefined"`. Earlier assumptions in this app relied on the response including `assets`; that assumption was wrong for v3.x and is not just a permissions issue (a missing permission returns 401/403, not a 200 with a smaller body).

A single album's photos are fetched the same way as "All photos": `POST /api/search/metadata` with an `albumIds: [id]` filter (see Check 3 above for the general shape). There is no separate album-assets endpoint.

## Implementation Details

The `core/immich-client.js` module implements:
- **verify(serverUrl, apiKey):** Authenticates using `/api/users/me` (fallback to `/api/user` on 404)
- **listAlbums():** Fetches albums with normalization (name/count/cover only — no per-album detail fetch needed)
- **searchPage(page, size, filter):** Paginated asset search with IMAGE type filter; `filter` is an optional object merged into the request body (e.g. `{albumIds: [id]}` to list one album's photos, omitted for "All photos")
- **thumbnailUrl(assetId, size):** Generates thumbnail URL with `apiKey` query parameter
- **viewerUrl(assetId):** Generates preview URL with `apiKey` query parameter

All URLs use the format: `{serverUrl}/api/assets/{assetId}/thumbnail?size={size}&apiKey={apiKey}`
