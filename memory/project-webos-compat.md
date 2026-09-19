---
name: project-webos-compat
description: webOS compatibility notes for the Immich TV app — target versions, Chromium engines, and why two builds are needed
metadata:
  type: project
---

User has a 2017 LG TV reporting firmware 01.10.75 (webOS 3.5).
Minimum supported platform (2026-09-19): the webOS TV 3.x generation. They want it to work there and on recent TVs.

**CORRECTION:** LG's engine table says webOS 3.x = Chromium 38 (not 53), 4.x = 53, 5.x = 68, 6.x = 79. Earlier notes here had every row shifted by one generation. Verify on the TV via navigator.userAgent.

**Decision (2026-09-18, rev 2026-09-19): TWO builds over one shared ES5 core, written to the Chromium 38 baseline (no fetch, Array.from, Object.assign, arrow fns, CSS vars).**
- LG states: "Because Enact is supported from webOS TV 4.0, you must retain Enyo-based apps for webOS TV 1.x to 3.x." Enact (Moonstone) is NOT officially supported on webOS 3.5. An earlier note here claiming Moonstone covers 3.x was wrong.
- `shell-legacy/`: plain ES5 + flexbox, no build step, webOS 3.x+ (Chromium 38). XHR instead of fetch; no CSS Grid, CSS vars, async/await, ES modules.
- `shell-enact/`: Enact Sandstone, webOS 5+.
- The LG Simulator only offers webOS TV 6.0 and 22-26, so 3.x can only be verified on the real TV.
- User's Immich is HTTPS with a public cert; old TV CA store may reject it.
- Auth for this iteration: server URL + API key only.

**Chromium per webOS generation:**
| webOS | Year  | Chromium |
|-------|-------|----------|
| 3.x   | 2016-17 | 38     |
| 4.x   | 2018-19 | 53     |
| 5.x   | 2020  | 68       |
| 6.x   | 2021  | 79       |
| 22    | 2022  | 87       |
| 23/24 | 2023-24 | 94/108 |

Spec: `docs/superpowers/specs/2026-09-18-immich-webos-tv-design.md`
