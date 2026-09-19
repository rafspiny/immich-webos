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
