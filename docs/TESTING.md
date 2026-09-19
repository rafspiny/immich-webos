# Acceptance test guide (for someone who did not write the code)

Each step lists what to do and what you should see. Stop at the first failure and use the report template at the end.

## 0. Before you start
- [ ] Immich address is reachable from the TV's network (try it in a phone browser on the same Wi-Fi).
- [ ] You created an API key in Immich (Account Settings > API Keys).
- [ ] TV is in Developer Mode and `ares-device -i tv` works (see README).
- [ ] Immich API checks: run the commands in docs/immich-api-notes.md once against your server (they are marked UNVERIFIED) — media thumbnails depend on the `apiKey` query parameter.
- [ ] (Once) install the probe app to record the TV's engine: `ares-package tools/probe -o build && ares-install -d tv build/com.immich.webos.probe_0.0.1_all.ipk && ares-launch -d tv com.immich.webos.probe`. Write down the `Chrome/NN` number and every "NO".

## 1. Install

**Legacy build (webOS 3.x+ TVs):**
`npm run package:legacy`, `ares-install -d tv build/com.immich.webos_0.2.0_all.ipk`, `ares-launch -d tv com.immich.webos`.

**Enact build (webOS 5+ only):**
`npm --prefix shell-enact run pack`, `ares-package shell-enact/dist -o build`, `ares-install -d tv build/com.immich.webos.enact_0.2.0_all.ipk`, `ares-launch -d tv com.immich.webos.enact`.

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
| 2026-09-19 | legacy + enact | not yet run | none | All automated gates pass (npm test, both .ipk packaged). Manual steps 0-8 PENDING: probe on TV, docs/immich-api-notes.md curl checks, desktop-browser smoke, TV run, Simulator run. |
