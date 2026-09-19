Check whether the webOS development tooling is correctly installed and, if a device
name is supplied, verify that the TV is reachable. Fix anything that is missing.

## Steps to follow

### 1. Node.js
Run `node -v`.
- If the command fails: tell the user to install Node.js 18 LTS or later and stop.
- If the version is below 18: warn but continue (the CLI may still work).

### 2. ares CLI
Run `ares --version`.
- If the command is not found: run `npm install -g @webos-tools/cli` and then
  verify again. If install fails, surface the full error to the user and stop.
- Report the installed version.

### 3. Individual ares binaries
Run each of these and report which ones are present / missing:
- `ares-package --version`
- `ares-install --version`
- `ares-launch --version`
- `ares-inspect --version`
- `ares-log --version`

If any are missing after the CLI install succeeded, something is wrong with the
`@webos-tools/cli` install — tell the user to try `npm install -g @webos-tools/cli`
with `sudo` or via `nvm`.

### 4. appinfo.json
Check that `/data/projects/immich_webos/appinfo.json` exists and contains a
valid `id` field. Read the file and confirm.

### 5. Device check (optional)
If the user passed a device name as an argument (e.g. `/webos-check myLGTV`):
- Run `ares-device -i <device>` and report the TV model, webOS version, and IP.
- If it fails, remind the user to:
  1. Ensure Developer Mode is ON on the TV.
  2. Run `ares-setup-device` to register the device.

### 6. Summary
Print a concise table:

| Check | Status |
|-------|--------|
| Node.js version | ✓ v24.x / ✗ not found |
| ares CLI | ✓ 3.2.3 / ✗ not installed |
| ares-package | ✓ / ✗ |
| ares-install | ✓ / ✗ |
| ares-launch | ✓ / ✗ |
| ares-inspect | ✓ / ✗ |
| ares-log | ✓ / ✗ |
| appinfo.json | ✓ valid / ✗ missing |
| Device (if supplied) | ✓ connected / ✗ unreachable |

End with the next suggested action (e.g. "Run `/webos-runner package` to build the .ipk").
