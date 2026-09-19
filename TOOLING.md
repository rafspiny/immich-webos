# Tooling

See README.md for setup, Simulator and real-TV instructions.

| Command | Purpose |
|---|---|
| `ares-package <dir> -o build` | package an app dir into an `.ipk` |
| `ares-setup-device` / `ares-device -i <tv>` | register / inspect a TV |
| `ares-install -d <tv> <ipk>` | install |
| `ares-launch -d <tv> <app.id>` | launch on TV; `-s <ver> <dir>` launches in the Simulator |
| `ares-inspect -d <tv> --app <app.id> --open` | Web Inspector |
| `ares-log -d <tv> <app.id> -f` | live logs |

Engine per generation (LG): webOS TV 3.x = Chromium 38, 4.x = 53, 5.x = 68, 6.x = 79, 22 = 87. Increment `version` in `appinfo.json` on each reinstall.
