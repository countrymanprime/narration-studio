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

3. Start it: `scripts/dev/real-app/start-host.sh /tmp/ns-host /tmp/ns-state 1800 &`; the host's own arguments (`--project-folder`, `--project-file`, `--daw`, `--session-dir`) go after a `--`. It prints `DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/ns-state/run/bus`; the host's log is `/tmp/ns-state/host.log`.
4. Run a check with the system Python that has `pyatspi` (3.12 on Ubuntu 24.04, not the repo's venv):

   ```bash
   cd scripts/dev/real-app
   DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/ns-state/run/bus /usr/bin/python3.12 smoke.py
   ```

   `smoke.py` reads the first screen's heading, presses **Settings** and reads the next heading. `python3.12 real_app.py [depth]` prints the whole page as a tree.

Start a fresh host for each run: the app keeps its place, so a second `smoke.py` on the same host starts on Settings.

## Real host plus real REAPER

To reproduce a bug that crosses the DAW (a recording that lands on a track, a link, what Editing reads), start a real REAPER 7.82 on the same session folder as the host, over a seeded project:

```bash
# build the host first (Set up, step 2); also install jackd2 and libgtk-3-0
scripts/dev/real-app/rig.sh up /tmp/rig --items 3     # flat layout; add --layout folders, or --tracks 60 --items 300 for a big project
. /tmp/rig/env.sh && cd scripts/dev/real-app
/usr/bin/python3.12 rig_smoke.py
./rig.sh down /tmp/rig
```

`rig.sh` fetches REAPER's tarball and checks the hash `scripts/ci/real-reaper/run-linux-check.sh` pins, runs it on a scratch configuration with a JACK dummy device (it records silence) and the app's real bridge (`launcher.lua` adds `ns_save`, a save the host has no command for), seeds the project with `seed.py`, and starts the host with `--project-folder`, `--project-file`, `--session-dir` and `--daw reaper`. `seed.py` writes the manuscript, the project's link to `Book.rpp`, the chapter link and `Book.rpp` itself: the chapter's track (`--layout folders`: Chapter One > Narrator > Main with the takes on Main), `--tracks` extra tracks and `--items` synthetic tone takes. Send REAPER a command with `scripts/ci/real-reaper/drive.py`'s `Session(Path('<work>/session'))` (`s.ask('record_start', guid, until={'RECORD_STARTED'})`); `<work>/session/events.log` shows what the host sent.

Things that cost time:

- A hand-written `.rpp` track needs a `TRACKID {guid}` line next to the header. Without it REAPER gives the track its own GUID and the host's link answers `TRACK_STALE`. `seed.py` writes both.
- The project's `project.json` needs `dawProjectFile`; without it the top bar reads **REAPER: Other project**.
- The host's "unsaved changes" is relative to the baseline it took when it first saw REAPER. A host started after an edit reads the project as saved; record or edit after `rig.sh up`.
- The Booth full-screens with no navigation and the driver's key events do not leave it; restart the host (`rig.sh down`, `up`) to start from Production again.
- The Booth stops and undoes a take within about 30 ms when no speech model is installed. `ARMED` and `RECORD_STARTED` still reach REAPER, which is enough to time or check a Record press. To keep a take, send `arm_only`, `record_start` and `record_stop` yourself.
- Some text (the no-audio banner's sentence) is not in the accessibility tree. Read it from a screenshot: `XAUTHORITY=/tmp/xvfb-run.XXXX/Xauthority import -display :NN -window root x.png`, with the display and the auth folder from `pgrep -fa Xvfb`.
- Kill REAPER with `rig.sh down`; a plain kill of `xvfb-run` leaves a REAPER answering the old session folder.

## Why the start script looks the way it does

WebKit starts a bubblewrap sandbox with a D-Bus proxy. A bare `dbus-run-session` made that step fail (`bwrap: Can't find source path .../webkitgtk/bus-proxy-...`, then SIGTRAP). A session bus at a fixed path under a private `XDG_RUNTIME_DIR`, a writable `$HOME/.cache/webkitgtk` and a fresh `$HOME` per run start it with the sandbox on. Do not turn the sandbox off (`WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS`) to make it start.

## What it cannot do

- It reads what the accessibility tree exposes: a canvas or an unnamed element has no text. A check that needs pixels is not covered here yet.
- A real REAPER: see [Real host plus real REAPER](#real-host-plus-real-reaper); the CI check that shares its start is `scripts/ci/real-reaper/run-linux-check.sh` ([REAPER verification pass](reaper-verification-pass.md#real-reaper-ci-run-linux)).
