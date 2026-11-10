# Driving the real desktop app on Linux

How to start the built desktop host headless and read and press its screen, so a bug can be reproduced by the steps a narrator took, in the real app rather than the mock. It works in a Linux container with no display. Nothing here changes the product.

The host is a Wails window (WebKitGTK). WebKit's remote inspector does not speak the Chrome DevTools protocol, so Playwright cannot attach to it. `scripts/dev/real-app/real_app.py` reads the window through the accessibility bus (AT-SPI), the way a screen reader does: each node has a role and a name, and a button's default action presses it.

## Set up

1. Install the packages, once: `libgtk-4-dev libwebkitgtk-6.0-dev libsoup-3.0-dev librsvg2-dev patchelf` (to build, the same line as `.github/actions/setup-toolchain/action.yml`) and `xvfb dbus-x11 bubblewrap xdg-dbus-proxy at-spi2-core python3-pyatspi` (to run).
2. Build the UI and put it where the host embeds it, then build the host. `src/studio/desktop/cmd/app/frontend/dist` is ignored by git, so this leaves no change:

   ```bash
   pnpm --dir src/studio/ui exec vite build
   cp -r src/studio/ui/dist/. src/studio/desktop/cmd/app/frontend/dist/
   (cd src/studio/desktop && go build -o /tmp/ns-host .)
   ```

3. Start it: `scripts/dev/real-app/start-host.sh /tmp/ns-host /tmp/ns-state 1800 &`. It prints `DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/ns-state/run/bus`; the host's log is `/tmp/ns-state/host.log`.
4. Run a check with the system Python that has `pyatspi` (3.12 on Ubuntu 24.04, not the repo's venv):

   ```bash
   cd scripts/dev/real-app
   DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/ns-state/run/bus /usr/bin/python3.12 smoke.py
   ```

   `smoke.py` reads the first screen's heading, presses **Settings** and reads the next heading. `python3.12 real_app.py [depth]` prints the whole page as a tree.

Start a fresh host for each run: the app keeps its place, so a second `smoke.py` on the same host starts on Settings.

## Why the start script looks the way it does

WebKit starts a bubblewrap sandbox with a D-Bus proxy. A bare `dbus-run-session` made that step fail (`bwrap: Can't find source path .../webkitgtk/bus-proxy-...`, then SIGTRAP). A session bus at a fixed path under a private `XDG_RUNTIME_DIR`, a writable `$HOME/.cache/webkitgtk` and a fresh `$HOME` per run start it with the sandbox on. Do not turn the sandbox off (`WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS`) to make it start.

## What it cannot do

- It reads what the accessibility tree exposes: a canvas or an unnamed element has no text. A check that needs pixels is not covered here yet.
- A real REAPER needs its own start: `scripts/ci/real-reaper/run-linux-check.sh` ([REAPER verification pass](reaper-verification-pass.md#real-reaper-ci-run-linux)) shows how, with a JACK dummy device and no models.
