# Tooling Guide — Immich webOS App

This app is plain HTML/CSS/JS — no build step, no framework, no `npm install`.
The only external tools needed are the LG webOS CLI (`ares-*` commands).

---

## Requirements snapshot

| Tool | Version tested | Purpose |
|------|----------------|---------|
| Node.js | 18 LTS or later | JavaScript runtime for the CLI |
| npm | 9+ | Installing the CLI globally |
| `@webos-tools/cli` (`ares-*`) | 3.x | Package, deploy, inspect on TV |

---

## Install the webOS CLI

```bash
npm install -g @webos-tools/cli

# Verify
ares --version          # 3.x
ares-package --version
```

That's it for tooling. No other packages needed.

---

## ares command reference

| Command | What it does |
|---------|-------------|
| `ares-generate -t basic <dir>` | Scaffold a new basic web app (reference only) |
| `ares-package <dir> -o <outdir>` | Pack the app directory into an `.ipk` |
| `ares-setup-device` | Interactively register a TV or emulator |
| `ares-device -i <device>` | Show info about a registered device |
| `ares-install -d <device> <pkg.ipk>` | Push an `.ipk` to the device |
| `ares-launch -d <device> <app.id>` | Launch the app on the device |
| `ares-launch --hosted <dir> -d <device>` | Hosted-mode test — no install needed |
| `ares-inspect -d <device> --app <app.id> --open` | Open Web Inspector (DevTools) |
| `ares-log -d <device> <app.id> -f` | Stream live logs |
| `ares-launch -d <device> --listApp` | List installed apps on the TV |

---

## Set up the TV for developer mode

### On the TV

1. *Settings → Support → TV Information* — note your webOS version.
2. Open the **Content Store**, search for **"Developer Mode"**, install it.
3. Open the Developer Mode app:
   - Toggle **Dev Mode Status: ON**
   - Toggle **Key Server: ON**
   - Note the **passphrase** shown (needed once).

### On your Linux machine

```bash
ares-setup-device
# Choose: Add device
#   Name:    myLGTV            (any label)
#   IP:      <TV's IP>         (Settings → Network → Wi-Fi → Advanced)
#   Port:    9922              (default webOS dev-mode port)
#   SSH user: prisoner         (always "prisoner" on webOS)

# Verify the connection
ares-device -i myLGTV
# Prints OS version, model, screen size, etc.
```

---

## Development workflow

### Quick browser test (no TV required)

```bash
# Immich must have CORS enabled — see section below
cd /data/projects/immich_webos
python3 -m http.server 8080
# Open http://localhost:8080 in a browser
```

### Hosted test on TV (no packaging, fast iteration)

```bash
ares-launch --hosted /data/projects/immich_webos --device myLGTV
```

The TV fetches the files directly from your machine over the local network.
Reload the app after each file change.

### Package → install → launch (full deploy)

```bash
# Package
ares-package /data/projects/immich_webos -o ./build/

# Install
ares-install --device myLGTV build/com.immich.webos_0.1.0_all.ipk

# Launch
ares-launch --device myLGTV com.immich.webos
```

### Debug with Web Inspector

```bash
ares-inspect --device myLGTV --app com.immich.webos --open
# Opens a Chromium DevTools session connected to the TV
# Use Chromium 87+ on your dev machine
```

### Stream logs

```bash
ares-log --device myLGTV com.immich.webos -f
```

---

## CORS on the Immich server

The TV browser enforces CORS. Add this to your Immich `.env` before testing:

```env
IMMICH_CORS_ALLOWED_ORIGINS=*
```

Then restart: `docker compose restart immich-server`.

For production, restrict to your TV's IP or the hosted-mode origin.

---

## Icon requirements (before submission)

| File | Size | Notes |
|------|------|-------|
| `icon.png` | 80×80 px | App grid icon |
| `largeIcon.png` | 130×130 px | Detail / launch icon |

The repo currently has 1×1 placeholder PNGs. Replace them before packaging for the TV store or submitting to LG.

---

## App IDs and `appinfo.json`

The `id` field must be in reverse-domain format and unique:

```json
{
  "id": "com.immich.webos",
  "version": "0.1.0",
  "vendor": "Immich",
  "type": "web",
  "main": "index.html",
  "title": "Immich",
  "icon": "icon.png",
  "largeIcon": "largeIcon.png",
  "resolution": "1920x1080",
  "uiRevision": "2"
}
```

Increment `version` each time you re-install (the TV caches by version).
