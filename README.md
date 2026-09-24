# Immich for webOS TV

Browse your [Immich](https://immich.app) albums and photos on an LG TV with the remote only.

The app connects to your own Immich server, lists your albums (plus an "All photos" view) and shows the photos full screen. It can display them as a grid or a list, with 3 to 8 columns per row. It runs on LG TVs from webOS TV 3.x (2016-17 models) up to current ones. Scope of this first iteration: albums and photos, grid/list layout, 3-8 columns, photo size. Not yet: map, people/faces, search, video.

## Why it exists

A TV is where a photo library is most pleasant to look at, but we are not aware of an official Immich app for LG webOS. A TV also has no keyboard and no touch screen: a remote with arrows, OK and Back. That shapes every decision in this project:

- **Remote-only navigation.** Every screen works with the D-pad. Long lists are windowed so a library of tens of thousands of photos stays smooth on a weak TV processor.
- **Typing is the hard part.** Signing in needs a server address and an API key, both long strings. The app ships its own on-screen D-pad keyboard with shortcut keys (`https://`, `.com`, `:2283`), remembers previous server addresses, and can hand over to the TV's own keyboard.
- **Old TVs must keep working.** Many people own a 2016-17 LG TV. webOS TV 3.x runs Chromium 38, which has no `fetch`, no CSS grid and no modern JavaScript, and LG does not support the Enact framework there. So the core of the app is written in plain ES5.

## Architecture

The app is a static web app packaged as an `.ipk` and run by the TV's Web Application Manager (WAM), the standard webOS web-app model. It has no server component of its own: the TV talks directly to your Immich server over its REST API.

```
                 +---------------------------------------------+
                 |  core/   (ES5, no DOM, no framework)         |
                 |  http | settings | paging | immich-client |  |
                 |  auth                                        |
                 +----------------------+----------------------+
                                        |  shared by both
             +--------------------------+---------------------------+
             |                                                      |
 +-----------v-------------+                        +---------------v-----------+
 | shell-legacy/           |                        | shell-enact/              |
 | plain ES5 + flexbox,    |                        | Enact Sandstone (React),  |
 | no build step           |                        | VirtualGridList/Spotlight |
 | webOS TV 3.x and newer  |                        | webOS TV 5 and newer      |
 +-------------------------+                        +---------------------------+
```

**`core/`** holds everything that talks to Immich or keeps state. It has no DOM and no framework, so both shells use it unchanged and it is unit-tested with `node --test`:

| Module | Responsibility |
|---|---|
| `http` | `XMLHttpRequest` wrapper returning Promises (there is no `fetch` on webOS 3.x); timeouts and classified errors (`network`, `timeout`, `unauthorized`, `http`) |
| `settings` | server address, API key, view mode, columns per row, photo size, remembered server addresses (stored in `localStorage`) |
| `paging` | loads "All photos" page by page so a whole library is never fetched at once |
| `immich-client` | albums, album contents, paged photo search, thumbnail and preview URLs; only photos are returned |
| `auth` | validates the server address and API key against Immich, and saves them only after a successful check |

**The shells** are thin UIs on top of the core, with the same screens: Setup, Albums, Album, Photo viewer, Settings.

- `shell-legacy/` is hand-written ES5 with flexbox and no build step. It brings its own D-pad focus handling, a windowed grid/list, and the on-screen keyboard. It is the only build that can run on webOS TV 3.x and 4.x.
- `shell-enact/` uses the [Enact](https://enactjs.com/) framework (Sandstone theme) for webOS 5 and newer, following LG's recommended stack. LG documents Enact as supported from webOS TV 4.0 and Sandstone from 5.0.

`core/` and `shell-legacy/` are checked automatically: `npm test` runs ESLint set to ES5 plus a gate that rejects APIs missing on Chromium 38. The LG Simulator has no webOS 3.x image, so this gate is what keeps the legacy build honest between real-TV tests. The design decisions are recorded in [docs/superpowers/specs/](docs/superpowers/specs/) and the implementation plan in [docs/superpowers/plans/](docs/superpowers/plans/).

## Builds

| Build | App id | Runs on | Engine |
|---|---|---|---|
| Legacy (plain ES5) | `com.immich.webos` | webOS TV 3.x and newer | Chromium 38+ |
| Enact Sandstone | `com.immich.webos.enact` | webOS TV 5 and newer | Chromium 68+ |

Both builds share `core/` (Immich client, settings, auth). If your TV is a 2016-2019 model, use the legacy build; on webOS 5 or newer either works.

How each package is produced (the installable `.ipk` files land in `build/`):

| Build | Command | Output |
|---|---|---|
| Legacy | `npm run package:legacy` | `build/com.immich.webos_0.2.0_all.ipk` |
| Enact | `npm --prefix shell-enact run pack`, then `ares-package shell-enact/dist -o build` | `build/com.immich.webos.enact_0.2.0_all.ipk` |
| Probe (diagnostics) | `ares-package tools/probe -o build` | `build/com.immich.webos.probe_0.0.1_all.ipk` |

The probe is a tiny app that shows the TV's user agent and which browser features it supports; run it first on an unfamiliar TV to confirm its engine. Installing and launching a package is described in "Test on a real TV" below.

## Develop it

### Setup and commands

Requirements: Node 22.2+, `npm install -g @webos-tools/cli` (gives `ares-*`), `npm install`.

```bash
npm test                 # lint (ES5), Chromium-38 API gate, unit tests
npm run serve:legacy     # legacy build at http://localhost:8080 (desktop browser; arrows/Enter/Esc)
npm run package:legacy   # build/com.immich.webos_<version>_all.ipk
npm --prefix shell-enact run pack   # Enact build in shell-enact/dist
```
`core/` and `shell-legacy/` must stay ES5 with no build step (webOS 3.x = Chromium 38: no `fetch`, `Array.from`, arrow functions, CSS variables or grid). `npm test` enforces this.

### Run in the LG Simulator (Linux)

The Simulator offers webOS TV 6.0 and 22-26 only, so it cannot emulate webOS 3.x; use it for the Enact build and for a quick check of the legacy build.
1. Download the Simulator AppImage from https://webostv.developer.lge.com/develop/tools/simulator-installation, `chmod +x` it.
2. On Ubuntu 24+ start it directly (ares-launch cannot pass these flags): `./webOS_TV_<ver>_Simulator_*.AppImage --ozone-platform=x11 --no-sandbox`
3. Launch an app in it: `ares-launch -s 24 dist/legacy` or `ares-launch -s 24 shell-enact/dist`

### Test on a real TV

1. On the TV install the **Developer Mode** app from the LG Content Store, open it, turn **Dev Mode Status** and **Key Server** ON, note the TV's IP.
2. On your PC: `ares-setup-device` -> add device (name e.g. `tv`, IP, port `9922`, user `prisoner`), then `ares-device -i tv` to check.

**Legacy build (webOS 3.x+ TVs):**
3. `npm run package:legacy`
4. `ares-install -d tv build/com.immich.webos_0.2.0_all.ipk`
5. `ares-launch -d tv com.immich.webos`

**Enact build (webOS 5+ TVs):**
3. `npm --prefix shell-enact run pack`
4. `ares-package shell-enact/dist -o build`
5. `ares-install -d tv build/com.immich.webos.enact_0.2.0_all.ipk`
6. `ares-launch -d tv com.immich.webos.enact`

Debug: `ares-inspect -d tv --app <app-id> --open` (needs a Chromium that matches the TV's engine) and `ares-log -d tv <app-id> -f`.
The Developer Mode session expires after ~50 hours; open the Developer Mode app to extend it.
Follow [docs/TESTING.md](docs/TESTING.md) for the step-by-step acceptance run.

### Connect to Immich

1. In Immich (any browser): Account Settings > API Keys > New API Key. Copy the key.
2. On the TV: Setup screen > Server address (`https://photos.example.com` or `http://192.168.1.10:2283`) and API key, entered with the on-screen keyboard (D-pad: arrows move, OK types; "TV keyboard" opens the TV's own).
3. "Cannot reach the server" means the request failed before any HTTP answer. The browser cannot tell which of these it is: wrong address, TV offline, **HTTPS certificate not trusted by the TV** (2016-17 TVs have an old certificate store; some Let's Encrypt chains fail), or the server blocking the app's `Origin: null` (CORS). Quick test: try `http://<lan-ip>:2283`; if that works the cause is certificate or proxy CORS.

**CORS.** The packaged app runs from `file://`, so its requests carry `Origin: null`, and they send the `x-api-key` header and JSON POSTs, which make the browser issue a CORS preflight (OPTIONS) first. The Immich server or the reverse proxy in front of it must answer that preflight and allow this origin, the methods GET/POST/OPTIONS and the headers `x-api-key` and `content-type`. Verify with Check 7 in docs/immich-api-notes.md. The old prototype docs mentioned an environment variable named `IMMICH_CORS_ALLOWED_ORIGINS`; that name is UNVERIFIED against current Immich, so confirm the correct setting in Immich's documentation for your version rather than relying on it.

### Remote keys

Arrows: move. OK: open/select. Back: previous screen. Back on the first screen exits the app. In the viewer: Left/Right previous/next photo.

## Pairing through the phone: not possible at the moment

Typing a server address and a long API key with a remote is the least pleasant part of the app. The obvious improvement is a QR code: the TV shows a code, you scan it with the phone that already has Immich, and the TV signs in without you typing anything. **This is not available today**, and the app has no pairing feature. Signing in works only as described in "Connect to Immich" above.

Two variants were considered and researched (full report with sources: [docs/research/2026-09-19-qr-pairing-feasibility.md](docs/research/2026-09-19-qr-pairing-feasibility.md)):

1. **The code carries a device name**, and the official Immich phone app uses it to fetch or create an API key for the TV. **Not possible today.** The official Immich apps have no QR scanner, no device-pairing flow and no Jellyfin-style "quick connect"; the related feature requests were closed as "not planned" or are unimplemented. It would need a change in Immich itself.
2. **The code carries the API key itself**, and scanning it on the phone "enters" the key so the TV can log in. **Not possible as stated.** At the moment the TV shows its code it has no API key, and Immich, not the TV, generates keys, so a code generated on the TV cannot contain one. The key has to be created where you are logged in to Immich (the web UI; the official phone app cannot create keys) and then travel to the TV. The workable variant turns the idea around: the TV's code carries the address of a pairing page plus a one-time secret, and the key is sent from the phone to the TV.

Why the TV side is hard:

- **The TV cannot receive anything directly.** A web app packaged for webOS cannot listen for incoming connections. An LG representative wrote in September 2024 that "webOS TV cannot be used as a server". Two community webOS apps report QR sign-in through a background JavaScript service bundled with the app, but they require webOS 5 or newer, we have not tested them, and whether such a service can work on webOS 3.x is unverified.
- **Secrets in transit need care.** Anyone in the room can photograph the code, so it must expire quickly and work only once, and any relay in the middle must not be able to read the key.

**The path we would take, when this is built** (not started; it needs the experiments listed in the report first):

1. A small static pairing page plus a small, self-hostable relay. The TV shows a QR code and waits by polling the relay with plain `XMLHttpRequest`, which works on Chromium 38.
2. The phone scans the code, opens the pairing page, and the user pastes an API key created in the Immich web UI.
3. The page encrypts the server address and key with a secret carried in the QR code's URL fragment, which is never sent to a server, so the relay only sees ciphertext. The TV decrypts it and signs in through the existing `core/auth.js`.
4. Use a separate read-only key per TV (Immich supports permission-scoped, revocable keys from v1.135.0), so it can be revoked later in Immich's settings.

The fallback is the same relay without end-to-end encryption, and below that the current on-screen keyboard, which always stays available. Open questions to test first on a real TV: whether `crypto.subtle` exists on Chromium 38, whether a QR code is readable from the couch at 1080p, the smallest set of API-key permissions this app needs, CORS from a hosted pairing page to Immich, and whether the TV accepts the relay's HTTPS certificate.

Until then, use the API-key flow above; the on-screen keyboard's shortcut keys and remembered server addresses keep it as short as possible.
