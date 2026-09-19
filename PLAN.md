# Immich webOS TV App — Architecture & Implementation Plan

## 1. Project Overview

A native webOS TV application (Enact / React) that connects to a self-hosted
[Immich](https://immich.app) instance, allowing users to browse photos and videos
from the couch using a standard LG TV remote — **no keyboard required after
initial setup**.

---

## 2. Authentication Strategy (no email/password on TV)

Entering credentials with a TV remote is painful. Two options are proposed;
**Option A is the recommended starting point**.

### Option A — API Key (simplest, no extra infrastructure)

1. User opens the Immich **web UI on any browser** → *Account Settings → API Keys → New Key*.
2. User opens the TV app for the first time → a setup screen asks for:
   - Server URL  (e.g. `https://photos.myhome.net`)
   - API Key     (a long token, pasted via on-screen keyboard or companion below)
3. Both values are stored in `localStorage` (persists across sessions on webOS).
4. Every subsequent API call sends `x-api-key: <key>` header.

> **UX tip**: provide a tiny companion page (a static HTML file served from the
> same Immich box, or bundled in the app) reachable at e.g.
> `http://<tv-ip>:9998/setup` that lets the user fill the form from a phone
> browser and POST the values to the TV app via a tiny local HTTP server
> (Node.js service packaged with the app).

### Option B — Device Code Flow / QR pairing (future enhancement)

Immich does not natively implement OAuth device-code flow, but you can layer it:

1. TV app generates a random pairing token and shows it as a **QR code** on screen.
2. User scans QR with phone → opens a small companion web app.
3. Companion web app authenticates against Immich (full keyboard available on phone),
   receives an API key, and pushes it to the TV via a local relay (WebSocket or
   simple REST endpoint the TV app listens on).

This is a "nice to have" Phase 2 feature.

---

## 3. App Architecture

```
immich-webos/
├── src/
│   ├── App/
│   │   └── App.jsx              # Root; routing + global context
│   ├── views/
│   │   ├── SetupView/           # First-run: server URL + API key entry
│   │   ├── HomeView/            # Landing: recent photos grid + quick links
│   │   ├── AlbumsView/          # Scrollable album grid
│   │   ├── AlbumDetailView/     # Photos inside one album
│   │   ├── TimelineView/        # All assets sorted by date
│   │   ├── PhotoViewer/         # Full-screen photo + slideshow
│   │   └── VideoPlayer/         # HTML5 <video> full-screen
│   ├── components/
│   │   ├── MediaGrid/           # Reusable spotlightable thumbnail grid
│   │   ├── AlbumCard/           # Album cover + title + count
│   │   ├── AssetTile/           # Single photo/video thumbnail
│   │   ├── ProgressBar/         # Slideshow / video scrubber
│   │   └── StatusOverlay/       # Loading / error banners
│   ├── services/
│   │   ├── immich.js            # All Immich REST API calls (fetch wrappers)
│   │   └── storage.js           # localStorage helpers (server URL, API key)
│   ├── hooks/
│   │   ├── useImmichAssets.js
│   │   └── useImmichAlbums.js
│   └── store/
│       └── AppContext.jsx        # React Context: auth state, server config
├── resources/
│   └── appinfo.json             # webOS app metadata
├── webos-meta/                  # Icons (80×80, 130×130, 430×246 banner)
├── package.json
└── webpack.config.js            # Enact CLI handles this automatically
```

---

## 4. Screen & Navigation Flow

```
[SetupView]
    │  (first launch or settings reset)
    ▼
[HomeView]  ─────────────────────────────────────────────────────┐
    │                                                             │
    ├──► [AlbumsView] ──► [AlbumDetailView] ──► [PhotoViewer]    │
    │                                                             │
    ├──► [TimelineView] ──────────────────────► [PhotoViewer]    │
    │                                                  │          │
    └──► [VideoPlayer] ◄────────────────────────────── ┘          │
                                                                  │
    ◄─────────────────────────────────── (Back button / BACK key) ┘
```

**Remote control mapping**:

| Key         | Action                                       |
|-------------|----------------------------------------------|
| D-pad       | Navigate grid / player controls              |
| OK / Enter  | Open item / Play / Pause                     |
| Back        | Go to previous screen                        |
| Play/Pause  | Slideshow or video toggle                    |
| FF / RW     | Next / Previous in slideshow or video seek   |
| Red         | Toggle favourite                             |
| Info (i)    | Show metadata overlay (date, camera, GPS…)   |
| Home        | Exit to webOS launcher                       |

---

## 5. Immich API Surface (used by the app)

All calls go to `<SERVER_URL>/api/*` with header `x-api-key: <KEY>`.

| Feature                | Endpoint                                    |
|------------------------|---------------------------------------------|
| Verify connection      | `GET /api/users/me`                         |
| List albums            | `GET /api/albums`                           |
| Album detail           | `GET /api/albums/{id}`                      |
| Timeline (all assets)  | `GET /api/assets?page=N&size=50`            |
| Asset info             | `GET /api/assets/{id}`                      |
| Thumbnail              | `GET /api/assets/{id}/thumbnail?size=preview` |
| Original / playback    | `GET /api/assets/{id}/original`             |
| Video stream           | `GET /api/assets/{id}/video/playback`       |
| Favourites             | `PUT /api/assets` with `{isFavorite: true}` |
| Search                 | `GET /api/search/metadata?query=…`          |
| Shared albums          | `GET /api/albums?shared=true`               |

> All thumbnail/original requests must include the API key either in the header
> or as a query param `?key=<KEY>` (useful for `<img src>` tags).

---

## 6. Key Technical Decisions

### 6.1 Thumbnail loading strategy
- Show placeholder while loading.
- Load thumbnails lazily as tiles scroll into the Spotlight viewport.
- Cache already-fetched blobs in a `Map` (in-memory) to avoid re-fetching during
  the same session. Do not persist blobs to `localStorage` (too large).
- Use `?size=thumbnail` (low-res, ~200px) in grids; `?size=preview` in the
  detail / fullscreen transition.

### 6.2 Video playback
- Use native HTML5 `<video>` element — webOS's Chromium supports H.264 / HEVC
  hardware decode.
- For HEVC/H.265 and VP9, test on target firmware; fall back to Immich's
  transcoded stream (`/video/playback`) if the original codec is unsupported.
- Use `crossorigin="use-credentials"` so cookie-based auth also works if you
  later switch auth method.

### 6.3 Navigation (Spotlight)
- Use `@enact/spotlight` `SpotlightContainerDecorator` to define focus regions.
- Use `VirtualList` from `@enact/moonstone` / `@enact/sandstone` for the
  photo grid — it renders only visible tiles (critical for large libraries).
- Remember last focused item per screen so Back returns focus correctly.

### 6.4 Resolution & performance
- Target 1920×1080 first; add `@media` scaling or `rem`-based layout for 4K.
- Use CSS `will-change: transform` on animated elements.
- Avoid heavy blur effects — webOS GPU is modest.

---

## 7. Phased Delivery

### Phase 1 — MVP (3–4 weeks solo)
- [x] Enact project scaffold
- [x] SetupView: server URL + API key, persisted to localStorage
- [x] HomeView: last 20 assets + Albums shortcut
- [x] AlbumsView: album grid (VirtualList)
- [x] AlbumDetailView: photo grid
- [x] PhotoViewer: fullscreen + basic slideshow (Next/Prev)
- [x] Package and sideload to TV

### Phase 2 — Enriched browsing (2–3 weeks)
- [ ] TimelineView with date group headers
- [ ] VideoPlayer with seek bar
- [ ] Metadata overlay (EXIF, map pin)
- [ ] Favourite toggle
- [ ] Loading skeletons / error states

### Phase 3 — Quality of life (ongoing)
- [ ] QR-code pairing setup flow
- [ ] Search view (text entry via on-screen keyboard)
- [ ] People/Faces album
- [ ] Screensaver mode (ambient slideshow when idle)
- [ ] 4K / HDR optimisation

---

## 8. appinfo.json (required by webOS)

```json
{
  "id": "com.yourname.immich",
  "version": "1.0.0",
  "vendor": "YourName",
  "type": "web",
  "main": "index.html",
  "title": "Immich",
  "icon": "icon.png",
  "largeIcon": "icon-large.png",
  "bgImage": "splash.png",
  "bgColor": "#1a1a2e",
  "iconColor": "#4CAF50",
  "splashBackground": "#1a1a2e",
  "resolution": "1920x1080",
  "uiRevision": "2",
  "requiredPermissions": ["time.query", "applications.launch"]
}
```

---

## 9. Open Questions / Risks

| Risk | Mitigation |
|------|-----------|
| Immich API changes between versions | Pin the Immich server version; use OpenAPI spec to regenerate types |
| Large library performance (10k+ assets) | Use server-side pagination (`page` + `size`); never load all assets |
| CORS headers on Immich | Immich allows CORS by default from same-origin; for TV app (different origin) add `IMMICH_CORS_ALLOWED_ORIGINS=*` or your TV's IP to Immich's env |
| HEVC video decode on older webOS | Detect codec; switch to Immich transcoded stream automatically |
| API key security | Store in localStorage (acceptable for a personal TV app); document the risk |
