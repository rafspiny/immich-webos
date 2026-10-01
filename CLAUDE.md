# CLAUDE.md - webOS Development Guide (Linux)

## Project Goals
- Build a modular, high-performance webOS TV application.
- Adhere to Enact framework standards for UI/UX.
- Ensure seamless deployment to LG webOS TV / Emulator.

## Dev Environment Setup (Linux)
1. **Install Node.js & NPM**: Essential for the webOS CLI.
2. **webOS TV CLI**: Install via `npm install -g @webos-tools/cli`.
3. **VS Code Extension**: Use the [webOS Studio Extension](https://webostv.developer.lge.com/develop/tools/vsce-dev-guide) for integrated commands.
4. **Developer Mode**: 
   - Install 'Developer Mode' app on the TV.
   - Enable 'Dev Mode Status' and 'Key Server'.
   - Connect via CLI: `ares-setup-device` to add the TV's IP.

## Architectural Standards
- **Framework**: Use [Enact Framework](https://enactjs.com/) (React-based, Sandstone) for `shell-enact/` (webOS 5+).
- **Legacy shell**: `shell-legacy/` and `core/` are hand-written ES5 with no build step, because LG states "Enact is supported from webOS TV 4.0, you must retain Enyo-based apps for webOS TV 1.x to 3.x" and webOS 3.x runs Chromium 38. Forbidden there: `fetch`, `Array.from`, `Object.assign`, arrow functions, `let`/`const`, CSS variables, CSS grid. `npm test` enforces it.
- **Modularity**: Keep components independent and loosely coupled.
- **Resolution**: Optimize for 1920x1080 (2K) or 3840x2160 (4K) as per LG standards.
- **App Configuration**: Strictly follow `appinfo.json` schema requirements.

## Debugging Workflow
- **Web Inspector**: Launch debugging using `ares-inspect --device <DEVICE_NAME> --app <APP_ID>`.
- **Chromium**: Use a compatible Chromium version for the [Web Inspector](https://webostv.developer.lge.com/develop/getting-started/app-debugging) to view console logs and inspect elements.
- **GDB (for Native)**: If using C/C++ services, use [GDB Debugging](https://www.webosose.org/docs/guides/setup/setting-up-debugging/) on the target device.

## Commands
- `npm test` — ES5 lint, Chromium-38 API gate, unit tests (run before every commit)
- `npm run package:legacy` — build the legacy `.ipk`; `npm --prefix shell-enact run pack` — Enact build
- Design: `docs/superpowers/specs/`; plans: `docs/superpowers/plans/`
