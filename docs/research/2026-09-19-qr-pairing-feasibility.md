# QR pairing for the Immich webOS TV app: feasibility report

Date: 2026-09-19. Research only; no app code written. Method: repo read (README, design spec, `core/auth.js`, `core/immich-client.js`, `core/http.js`) plus web sources listed at the end. Statements not backed by a fetched source are marked UNVERIFIED. Web summaries were produced by a fetch tool that paraphrases pages, so quoted phrases should be re-checked before being relied on in code.

## 1. Summary and verdict

- **Idea A (QR carries a pairing id, the official Immich phone app scans it and mints a key for the TV): not possible today.** The official Immich apps have no QR scanner, no pairing/device-code flow and no "quick connect"; the feature requests were closed or are unimplemented. It would need an upstream Immich change.
- **Idea B (QR contains the API key itself): not possible as stated.** The TV has no key before login, and Immich (not the TV) generates keys. A TV-shown QR cannot carry a secret the TV does not have. The workable variant reverses the payload: the QR carries a *pairing address + one-time secret*, and the key travels phone -> TV.
- **What works today without Immich changes:** a phone-scanned QR that opens a pairing web page; the user pastes an existing key (or logs in so the page can mint one); the page delivers the credential to the TV through a relay (outbound-only from the TV) or, on newer TVs, through a TV-hosted service. Two existing projects already do this (Immich Android TV auth relay; Immich TV webOS with a local JS service).
- **Recommended path:** static pairing page + tiny self-hostable relay, TV long-polls over XHR, credential end-to-end encrypted with a secret carried in the QR URL fragment. Fallback: the same relay without E2E (the giejay design), then the current on-screen keyboard.
- **Key blocker for webOS 3.x:** a TV-hosted listener is contradicted by LG staff ("webOS TV cannot be used as a server"), and JS services on 3.x are unverified, so the relay design is the only one that plausibly reaches Chromium 38.

## 2. What Immich supports today

Versions: API facts below come from the `main` branch OpenAPI spec fetched 2026-09-19 (exact release number not captured in the fetch; UNVERIFIED which tag) and from the v1.135.0 release notes. Discussions cited were read in 2026-09.

| Capability | Status | Evidence |
|---|---|---|
| QR code to log in / enrol a phone | Not implemented. #655 (QR login) closed "not planned"; #6998 (QR enrolment) open to PRs, maintainer bo0tzz suggested an endpoint returning JSON config (e.g. `/api/server/enroll`) starting with just the server URL; #14763 closed as duplicate | https://github.com/immich-app/immich/issues/655 , https://github.com/immich-app/immich/discussions/6998 , https://github.com/immich-app/immich/discussions/14763 |
| Deep link that prefills server URL / login | Not implemented ("Link to login with app" #8766 is an open request with no implementation) | https://github.com/immich-app/immich/discussions/8766 |
| Deep links to content | Partial. Android manifest has deep links; `https://my.immich.app/...` universal links open albums/photos; iOS reportedly needs the app open first; a PR (#19232) was referenced in May 2026 | https://github.com/immich-app/immich/discussions/2881 , https://my.immich.app/ (surfaced in search only) |
| Custom scheme | `app.immich:///oauth-callback` is the mobile OAuth redirect; docs offer `/api/oauth/mobile-redirect` forwarding | https://docs.immich.app/administration/oauth/ |
| OAuth device authorization grant (RFC 8628) | Not mentioned in the OAuth docs; no Immich support found | https://docs.immich.app/administration/oauth/ |
| Mobile app hands a credential to another device | No. Mobile docs mention only entering the server URL at login | https://docs.immich.app/features/mobile-app/ |
| Jellyfin-style Quick Connect | None found in docs, issues or discussions searched | (absence; searches listed in Sources) |
| API keys | Yes: create/list/get/delete/rotate, plus `GET /api-keys/me` | https://raw.githubusercontent.com/immich-app/immich/main/open-api/immich-openapi-specs.json |
| Granular API-key permissions | Since v1.135.0 ("select additional permissions when creating an API key"); more endpoints scoped in v1.137 (from a news item) | https://github.com/immich-app/immich/discussions/19248 , https://alternativeto.net/news/2025/8/immich-1-137-adds-beta-timeline-improvements-shared-link-custom-url-and-large-file-finder |
| Endpoints named device/pairing/qr/oauth in the spec | The spec excerpt returned had none for pairing/QR (the excerpt may have been truncated; the OAuth endpoints exist per the docs above) | OpenAPI spec above |

`api.immich.app` (endpoint reference page for `createApiKey`) returned only the page title through the fetch tool, so the raw OpenAPI JSON was used instead.

Other TV clients:
- **giejay/Immich-Android-TV** (Android TV/Google TV): login screen offers hostname + API key or "sign in by phone". It relies on a separate relay service, giejay/Immich-Android-TV-Authentication: Express, in-memory `ExpiryMap` holding a 6-digit pairing code and its config for 180 seconds, TV polls `/config/:deviceCode`, phone uses a web portal at `immich.giejay.nl` where it submits either an API key or username/password; with a password the service logs in to Immich and generates an API key automatically. Docker self-hosting is possible. The relay therefore sees the credential in plaintext, and the summary did not confirm whether E2E encryption exists (it apparently does not). https://github.com/giejay/Immich-Android-TV , https://deepwiki.com/giejay/Immich-Android-TV-Authentication , https://immich.giejay.nl/
- **Seeky91/immich-tv-webos** (LG webOS, requires webOS 5.0+): the TV shows a QR; a JS service bundled in the .ipk (Node, zero dependencies) serves the pairing page on the LAN and performs the Immich login on the TV, so self-signed HTTPS and non-CORS servers work; password used for one login call, nothing goes through a third party. It does not create an API key; it keeps the session from that login. https://github.com/Seeky91/immich-tv-webos
- **aneeshtigga/immich-webos** (LG webOS 5.0+): implements RFC 8628 on the TV itself via a bundled `service/` JS service; QR or an 8-character code; the phone submits Immich URL + credentials to the TV; also supports API-key login with permissions `user.read`, `timeline.read`, `album.read`, `asset.read`, `asset.view`, `person.read`. https://github.com/aneeshtigga/immich-webos
- Kodi, Apple TV and Samsung Tizen clients: no relevant sign-in mechanism found in the search results (UNVERIFIED that none exist).

## 3. Analysis of idea A

Flow as proposed: TV shows QR (device name/pairing id) -> official Immich phone app scans it -> pairing id is used to retrieve or create a key for the TV.

- The official app has no scanner and no handler for such a payload (section 2). Nothing in Immich accepts a "pairing id" or maps it to a key. So the phone-side step does not exist.
- Even if a generic camera app scanned it, an `https://` URL in the QR would open a browser, not the Immich app (Immich only registers universal links for `my.immich.app`, and for content, not pairing). Hence no first-party path.
- Server-side, key creation is a plain authenticated call (section 4), and there is no server notion of "create a key on behalf of a device that is waiting". Both a device-code endpoint (RFC 8628 style) and a mobile "approve device" screen would have to be built and merged upstream.
- Upstream feasibility: maintainers are receptive to a minimal QR enrolment endpoint for *phones* (discussion #6998) but closed QR login as not planned (#655). A TV device-approval feature would be a new, security-sensitive surface; treat acceptance as unlikely in the short term (this is a judgement, not a sourced fact).
- Verdict: possible only with an Immich change (or Immich OAuth plus an IdP that itself supports device flow, see 5, alt. e).

## 4. Analysis of idea B, and API key creation

**Conceptual problem.** A TV-generated QR can only contain what the TV knows: a random pairing id/secret, maybe its own public key, and a rendezvous address. It cannot contain "the API key" because (1) the TV has none before login, and (2) Immich creates key secrets server-side; the create DTO has only `name` and `permissions`, and the secret is returned by the server (client-chosen secrets are not offered; the create response body was not inspected, UNVERIFIED that the secret is returned exactly once). The TV therefore cannot "generate a key" and have the server accept it. The data flow must be: server -> (phone) -> TV. The QR (TV -> phone) only bootstraps a channel; the secret travels phone -> TV over a channel that must exist beyond the QR.

**Closest workable variant (B'):** QR = URL to a pairing page + one-time channel id (+ secret for E2E). The phone user supplies the key (paste from a password manager, or the page mints one after login); the page sends it to the TV via the channel. This is architecture (a)/(b) below. The reverse direction (a QR containing the key, scanned by the TV) is impossible: TVs of this class have no camera.

**Key creation facts** (OpenAPI `main`):
- `POST /api-keys`, operationId `createApiKey`, security schemes bearer, cookie **and api_key**, permission `apiKey.create`. Body: `name` (string), `permissions` (array of Permission enum). https://raw.githubusercontent.com/immich-app/immich/main/open-api/immich-openapi-specs.json
- Also `GET /api-keys`, `GET /api-keys/me`, `DELETE /api-keys/{id}` (`apiKey.delete`), `POST /api-keys/{id}/rotate` (`apiKey.rotate`), `PUT /api-keys/{id}` (deprecated). Same source.
- Permission enum includes `album.read`, `assetFile.read`, `assetFile.download` among others (the excerpt listed only album/asset groups; the full list, including `asset.read`, `asset.view`, `user.read`, `timeline.read` seen in the aneeshtigga docs, was not confirmed by the spec excerpt, so verify against your server's own `/api/api-keys` docs).
- A session (bearer token or cookie) can create keys; so can an existing API key that holds `apiKey.create`. A read-only TV key must therefore *not* be given `apiKey.create`, or a stolen TV key could mint more keys. Whether Immich blocks a key from granting permissions it does not itself hold is UNVERIFIED.
- **Scoped, read-only, revocable per TV: yes, on v1.135.0+.** One key per TV (name it e.g. "webOS TV living room"), revoke in Account Settings > API Keys or with `DELETE /api-keys/{id}`. Minimal permission set for this app is UNVERIFIED: the app calls `/api/users/me`, albums, `POST /api/search/metadata`, thumbnail/original URLs with `?apiKey=` (repo `core/immich-client.js`); the aneeshtigga project lists `user.read`, `timeline.read`, `album.read`, `asset.read`, `asset.view`, `person.read` for a similar app, a good starting hypothesis. Servers older than v1.135.0 only offer all-access keys (inferred from the release note).
- Password login for minting: the giejay relay does "authenticate against Immich API, generate API key", implying the standard email+password login endpoint then `POST /api-keys`; I did not fetch the login endpoint spec (UNVERIFIED path and payload). Users on OAuth/SSO-only instances may have no password (UNVERIFIED how Immich behaves), so paste-a-key must stay supported.
- What the official phone app can do: nothing for keys. The mobile docs mention no API-key management (https://docs.immich.app/features/mobile-app/). Keys are created in the **web UI** (Account Settings > API Keys, per repo README). The phone's browser can open the Immich web UI, so "create key on the phone browser, copy, paste in pairing page" is the manual path today.
- Managing keys later: the same web settings page lists and revokes them; the TV app cannot list keys without `apiKey.read`, which we do not want to grant.

## 5. Alternative architectures

### (a) Static pairing page, phone pastes/enters key, page delivers to TV
The QR opens `https://pair.example/#<id>` on the phone. Delivery from the page to the TV still needs a channel: either the TV endpoint (c) or a relay (b); a static page alone cannot reach the TV. So (a) is a UI for (b) or (c), not a complete architecture. Mixed-content note: an HTTPS page cannot call `http://<lan-ip>` (TV endpoint or plain-HTTP Immich), and calling Immich from the page needs CORS for the page's origin (README already flags CORS as unverified). To avoid Immich calls from the page entirely, let it be paste-only: the TV validates the credential itself.

### (b) Relay/rendezvous with E2E, secret in the URL fragment
TV creates a random channel id + secret, shows `https://pair.example/#id.secret`. Fragments are not sent to servers, so the relay never sees the secret. Phone page encrypts `{url, key}` (Web Crypto is fine on a modern phone) and POSTs the ciphertext to `/channel/<id>`; TV long-polls `GET /channel/<id>` by XHR (no fetch needed) and decrypts. The giejay service proves the shape: `register-device` -> code, TV polls `config/:code`, 180 s in-memory expiry. Relay implementation options: a tiny self-hosted service (Node/Express, as giejay), a serverless function, or a pub/sub service; ntfy, PeerJS signalling and similar were NOT researched in this session (UNVERIFIED suitability). Advantages: outbound-only traffic from the TV, so it works across guest Wi-Fi/AP-isolation, no inbound listener, no mixed content problem for the TV (TV to an HTTPS relay; note old CA stores, section 6). Costs: someone must host the relay and the page; an availability dependency; crypto on the TV (see 6).

### (c) Direct LAN delivery (TV-hosted listener)
Projects Seeky91 and aneeshtigga do this with a bundled webOS JS service, on **webOS 5.0+** (their own claims). LG's docs say JS services are Node.js-based, run in the background, cannot use C/C++ addons, and "should not run for very long periods (minutes)"; Node versions: webOS 4.x and lower use v0.12.2 with no ES6 syntax (https://webostv.developer.lge.com/develop/guides/js-service-basics , https://webostv.developer.lge.com/develop/guides/js-service-usage). On the other hand an LG representative answered a developer asking whether a JS service can open a TCP port with "webOS TV cannot be used as a server. Please use it only as a client." (September 10, 2024; webOS versions not stated) (https://forum.webostv.developer.lge.com/t/open-http-server/9585). The two are in tension: community apps report it working, LG says unsupported. On 3.x: whether the legacy packaging (`services` in `appinfo.json`, Node 0.12.2 service) can bind a port reachable from the LAN is UNVERIFIED and needs an experiment. Also the TV must be on the same LAN/VLAN as the phone; the pairing page would be served over plain HTTP from the TV (no valid cert), so the password or key crosses the LAN in cleartext unless something else protects it. A key advantage is no third-party infrastructure and no CORS problem, because the TV performs the Immich request.

### (d) Immich-side change
Options: RFC 8628 device flow; a first-party "add device" screen in the mobile app; a `/api/server/enroll`-style endpoint (the direction maintainers discussed in #6998). Nothing exists (section 2). Proposal would be a GitHub feature discussion with the flow, threat model and a server PR; the aneeshtigga app's RFC 8628 implementation (on the TV side, not Immich) shows demand but not an upstream endpoint. Timeline and acceptance are unknowable; do not plan on it.

### (e) Others
- **Shared links:** grant read access to a single album or set without a key; a shared link key is used with `?key=` (the design spec notes this). Would not give account-wide browsing and does not solve delivery. Not evaluated further.
- **Immich OAuth/OIDC:** Immich acts as an OIDC client with `app.immich:///oauth-callback` for mobile (https://docs.immich.app/administration/oauth/). Immich does not use device flow; an IdP-side device flow would still need Immich to accept the resulting token, which it does not (UNVERIFIED). Not usable.
- **Prefilled query string on the Immich web UI:** no evidence of a supported URL that prefills login (#8766). UNVERIFIED for the API-key settings page.
- **Import from a file/USB:** TV apps cannot read arbitrary files reliably (LG doc: files downloaded by a service are not accessible to web apps; not the same, but indicates sandboxing). Not evaluated.
- **Wrap the existing giejay relay (self-hosted):** protocol is simple XHR polling; technically usable from ES5, but the phone portal and the relay are designed for that Android app, and it stores credentials in plaintext in memory. UNVERIFIED that it accepts a third-party client.

### Comparison

| | A: TV QR + official phone app | B (literal): key in QR | (a)+(b) relay + E2E (recommended) | (b) relay, no E2E (giejay style, fallback) | (c) TV-hosted listener | (d) Immich device flow |
|---|---|---|---|---|---|---|
| User steps | scan, approve | n/a | scan, paste key or log in, submit (about 4) | same | scan, paste/log in, submit (about 4) | scan, approve (about 2) |
| Infrastructure | none | n/a | static page + small relay (self-hostable) | relay + page | none | Immich upstream change |
| Works on webOS 3.x | n/a | n/a | plausible (XHR only; crypto needs a JS lib; TLS/CA risk) | plausible | UNVERIFIED, likely no | yes if TV can poll |
| Needs Immich changes | yes | impossible | no | no | no | yes |
| Security | good if it existed | n/a | relay cannot read key; page is trusted code | relay sees key | LAN plaintext HTTP; TV validates directly | best |
| Maintenance | n/a | n/a | run 2 small services; crypto lib; monitor page | 1-2 small services | service in every release; per-firmware quirks | upstream review |

## 6. TV-side constraints (webOS 3.x, Chromium 38, ES5)

- **Engine versions:** webOS 3.x Chromium 38, 4.x 53, 5.x 68, 6.x 79 (from repo spec, citing https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine ; that page was not re-fetched here).
- **QR generation:** `kazuhikoarase/qrcode-generator` is MIT, ES3-compatible JavaScript with canvas, table and image output (https://github.com/kazuhikoarase/qrcode-generator). Fits the no-build-step rule (drop one file in `shell-legacy/`). Not fetched here: file size (I recall roughly 20-25 KB unminified, UNVERIFIED). "QR Code" is a Denso Wave trademark (same page). Legibility (my own estimate, not measured): a pairing URL of about 80-100 characters at error correction L or M is roughly QR version 6-8 (41-49 modules); at 8 px per module plus quiet zone that is about 400 px square on a 1080p canvas, sufficient from a couch; draw dark modules on a white background with a 4-module quiet zone, avoid CSS transforms that blur. Keep the URL short (short domain, base64url secrets) to cut version. Needs an on-TV measurement.
- **Networking:** XHR works in Chromium 38 (already used by `core/http.js`). Long-poll with XHR and `xhr.timeout` is the safest channel. WebSocket and EventSource exist in Chromium 38 per general knowledge (not source-checked here, UNVERIFIED); prefer XHR long-poll for simplicity and proxy tolerance.
- **Crypto:** Chrome added Web Crypto in v37 per a search-result summary; the secure-context restriction for `crypto.subtle` arrived in Chrome 60 per caniuse (https://caniuse.com/mdn-api_crypto_subtle_secure_context_required , which shows "4-59 not supported, 60+ supported" for the secure-context flag, not for `crypto.subtle` itself). So on Chromium 38 `crypto.subtle` from `file://` is probably present but this is UNVERIFIED on the actual TV (LG builds can differ; test `window.crypto.subtle` via `ares-inspect`). On Chromium 68+ (webOS 5) the secure-context rule applies and `file://` is not a secure context in general, so `crypto.subtle` may be undefined in the Enact build (UNVERIFIED; app is loaded from `file://`; may be treated as potentially trustworthy depending on webOS packaging). Safer plan: use a small pure-JS authenticated cipher (candidate: TweetNaCl.js secretbox; not researched here, license and ES5 compatibility UNVERIFIED) so the same code runs on both builds, and use `crypto.getRandomValues` (present far earlier; UNVERIFIED on 3.x) for the channel secret.
- **TLS:** README and spec already note old CA stores and TLS 1.3 absence on 2016-17 TVs; the relay host must use a certificate chain that 3.x accepts (test), or offer a plain-HTTP relay as a last resort (weakened by E2E).
- **JS services:** listed in section 5(c). Node 0.12.2 (ES5 only) for 4.x and lower per LG. Whether webOS 3.x TVs accept packaged services and the resulting behaviour is UNVERIFIED (LG docs do not state a per-version cut-off in what was fetched).
- **Inbound HTTP into a web app:** a plain web app cannot listen. Only a service could, and LG says the TV is a client only (forum link above).
- **Network reachability:** phone and TV must be on the same segment for (c); guest Wi-Fi/AP isolation and VLANs commonly block it (general knowledge, UNVERIFIED for the user's network). The relay (b) needs only internet access from both. For a phone on cellular the relay still works, but the Immich server must be reachable from the TV, not necessarily from the phone (if the phone page never calls Immich).
- **Keyboard-less input alternatives:** Magic Remote voice input and the webOS native keyboard are already used per the design spec; no way to register a URL scheme to receive input on the TV was found in this research (UNVERIFIED).
- **Enact build (webOS 5+):** same relay design; the JS-service option (c) becomes more realistic (see the two projects above); the same code can be shared through `core/` if written in ES5.

## 7. Security and privacy

- **QR leakage:** the QR is on the TV screen and effectively public in the room. It must contain only a short-lived channel id and a secret usable exactly once for a single channel. Anyone who photographs it can race the real owner and submit their own (wrong or malicious) credentials to the TV. Mitigations: 3-5 minute expiry (giejay uses 180 s), one submission then the channel closes, show a confirmation code (4 digits or the server host name) on both TV and phone, and let the TV show "Connected to <host>, is this yours? OK" before saving.
- **Malicious channel takeover leading to a rogue server:** an attacker who wins the race can point the TV at a hostile server; the harm is limited (no secret on the TV yet) but the user might type credentials into a fake screen. Confirm-on-TV step above addresses this.
- **Relay trust:** with E2E (secret in the fragment) the relay sees only ciphertext, channel ids, sizes and IPs/timing. Without E2E (giejay), the relay sees URL and key or password in memory. The pairing *page* is code served by the operator and could exfiltrate the key: a compromised or malicious page host can read whatever the user types. Hosting the page from the user's own domain or GitHub Pages with pinned/auditable source reduces trust, but the page is always part of the trust base (state this clearly to users).
- **Key scoping and expiry:** use a per-TV, read-only key (`album.read`, `asset.read`, `asset.view`, `user.read`, `timeline.read` to be verified) and no `apiKey.*` permissions. Immich keys have no documented expiry in the spec fields seen (`name`, `permissions` only), so revocation is manual; also note the media URLs use `?apiKey=` in query strings, which land in server and proxy logs and the browser cache (repo design spec; unverified on a live server).
- **Password exposure:** if the page logs in for the user, the password crosses the phone's browser to Immich; page must never send it to the relay. Prefer "paste an API key" as default and "log in to create a TV key" as an optional mode, run in the phone browser only.
- **Transport:** HTTPS page -> HTTPS relay is fine. An HTTPS page cannot call `http://` Immich (mixed content) and Immich must allow the page origin via CORS (unverified default; README already flags Immich CORS configuration name as unverified). Design to avoid Immich calls from the page: the TV validates with `client.verify` after receiving the credential. For (c) the TV would serve HTTP on the LAN, so credentials travel unencrypted on the LAN.
- **Availability:** a hosted relay is a single point of failure for first login only (after pairing the TV talks to Immich directly). Provide a self-host Docker image and let the user set the relay base URL (using the on-screen keyboard once, or fall back to keyboard login). The user's stated need for a self-hosted option: yes, offer one; it is small (in-memory map with expiry).

## 8. Recommendation and user flow

**Recommended (one path):** static pairing page + small relay (self-hostable, default instance run by the project), E2E-encrypted payload with secret in the URL fragment, TV polling by XHR, read-only per-TV key. Works for both builds, needs no Immich change, and avoids the inbound-listener question.

**Fallback:** same relay but no E2E and giejay-compatible code entry (6-digit code, 180 s), or, below that, the existing on-screen keyboard (unchanged, always available). Optionally add (c) as an *additional* mode on webOS 5+ once proven on a real TV.

User flow:
1. TV: Setup screen -> "Sign in with phone". App requests a channel from the relay and shows a QR plus the short URL and a 4-digit check code.
2. Phone: scan with the camera; the pairing page opens (`https://pair.example/#<id>.<secret>`).
3. Phone page shows the same check code, asks for Immich URL and either (i) an API key created in Immich web (Account Settings > API Keys, with the listed read-only permissions), or (ii) email/password with "create a TV key" (only if experiments E3/E4 pass).
4. Page encrypts `{serverUrl, apiKey}` with the fragment secret and posts it to the relay.
5. TV receives, decrypts, runs `auth.connect()` (existing `core/auth.js`: `client.verify` then `settings.saveCredentials`), shows "Connected as <user> to <host>". Channel is deleted.
6. Revocation: user deletes the "webOS TV" key in Immich web settings.

Integration points in the repo (for a later iteration, not done now): `core/auth.js` `connect(url, key)` is already the single sink for credentials, so a `pairing` module in `core/` that yields `(url, key)` fits without touching Immich code.

## 9. Open questions and experiments

1. E1: On the real 3.x TV, print `navigator.userAgent`, `typeof window.crypto`, `typeof crypto.subtle`, `crypto.getRandomValues`; do the same on a webOS 5/6 TV or simulator from `file://`.
2. E2: Measure QR readability: render a 45-module code at 6/8/10 px per module on the 3.x TV and scan from 3 m with two phones (and dim rooms, glare).
3. E3: On the user's Immich version, create a key with only `user.read`, `timeline.read`, `album.read`, `asset.read`, `asset.view` and run the app's calls, including `POST /api/search/metadata` and `?apiKey=` thumbnails, to find the true minimum set (also confirms the still-unverified `?apiKey=` in `core/immich-client.js`).
4. E4: Check `POST /api-keys` with a session token and with an API key lacking `apiKey.create` (expect refusal), and whether a key can grant permissions it does not hold. Look up the login endpoint payload in the server's own OpenAPI.
5. E5: Check CORS from an HTTPS page origin (e.g. GitHub Pages) to the user's Immich (HTTPS and plain HTTP), to decide whether the page may call Immich at all.
6. E6: On the 3.x TV, test XHR long-poll (60 s) to an HTTPS relay: TLS chain acceptance, timeouts, behaviour when the TV screen sleeps.
7. E7: JS service on 3.x: package a minimal service in a legacy `.ipk`, check it starts, and whether a listener bound to `0.0.0.0` is reachable from a phone (test the LG "client only" statement on real hardware on 3.x and 5+).
8. E8: Choose and license-check a pure-JS AEAD (TweetNaCl candidate) and confirm it runs on Chromium 38 and at what speed for a ~200-byte payload.
9. E9: Relay choice: a tiny custom service vs an existing pub/sub product (not researched), plus rate limiting to prevent code guessing.
10. E10: Whether the giejay auth service can be used or forked (licence and interface), and whether it is acceptable to use its hosted portal as a default.
11. E11: Whether the official mobile app or a future Immich release adds device pairing; recheck the release notes at implementation time.

## 10. Sources

Fetched or surfaced by search on 2026-09-19 (a `search only` note means the page appeared in search results but was not fetched):

- https://github.com/immich-app/immich/issues/655 - QR login request, closed as not planned.
- https://github.com/immich-app/immich/discussions/6998 - QR enrolment request; maintainer suggests `/api/server/enroll`-style endpoint, open to PRs.
- https://github.com/immich-app/immich/discussions/14763 - server URL QR request, closed duplicate.
- https://github.com/immich-app/immich/discussions/8766 - "link to login with app" request; no implementation.
- https://github.com/immich-app/immich/discussions/2881 - deep link status (Android partial, iOS universal links, PR #19232).
- https://github.com/immich-app/immich/discussions/19248 - v1.135.0 release notes: granular API-key permissions.
- https://alternativeto.net/news/2025/8/immich-1-137-adds-beta-timeline-improvements-shared-link-custom-url-and-large-file-finder - v1.137 extends permissions (search snippet only, not fetched).
- https://raw.githubusercontent.com/immich-app/immich/main/open-api/immich-openapi-specs.json - API key endpoints, auth schemes, permissions, DTO fields.
- https://docs.immich.app/administration/oauth/ - OAuth mobile redirect; no device flow mentioned.
- https://docs.immich.app/features/mobile-app/ - mobile docs mention no QR, keys or deep-link login.
- https://my.immich.app/ - My Immich link proxy (search snippet only).
- https://github.com/giejay/Immich-Android-TV - Android TV client with "sign in by phone" (search snippet).
- https://deepwiki.com/giejay/Immich-Android-TV-Authentication - relay architecture, endpoints, 180 s expiry, phone submits key or password.
- https://immich.giejay.nl/ - hosted phone portal (code, host, API key fields).
- https://github.com/Seeky91/immich-tv-webos - webOS QR phone sign-in via bundled JS service, webOS 5+.
- https://github.com/aneeshtigga/immich-webos - webOS RFC 8628 flow via bundled JS service, permissions list, webOS 5+.
- https://webostv.developer.lge.com/develop/guides/js-service-basics - JS service Node versions and limits.
- https://webostv.developer.lge.com/develop/guides/js-service-usage - service naming, runtime constraints.
- https://forum.webostv.developer.lge.com/t/open-http-server/9585 - LG staff: webOS TV cannot be used as a server.
- https://caniuse.com/mdn-api_crypto_subtle_secure_context_required - Chrome 60 secure-context data for `crypto.subtle`.
- https://github.com/kazuhikoarase/qrcode-generator - MIT QR generator, ES3, canvas/table/img output.
- https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine - engine table, cited via the repo spec, not re-fetched.

Could not access: `https://api.immich.app/endpoints/api-keys/createApiKey` returned only the page title (no content extracted). No sources were blocked otherwise, but all fetches were summarised by a tool; treat exact wording as paraphrased.
