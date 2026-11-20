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
scripts/dev/real-app/rig.sh up /tmp/rig --chapters 44 --items-per-track 100 --tracks 20   # a 17 hour book: 44 linked chapters, about 155,000 words, 64 tracks, 4,400 items
scripts/dev/real-app/rig.sh up /tmp/rig --chapters 44 --checked                          # the same book with a recording check on every chapter, findings and a Story Bible
. /tmp/rig/env.sh && cd scripts/dev/real-app
/usr/bin/python3.12 rig_smoke.py
./rig.sh down /tmp/rig
```

`rig.sh` fetches REAPER's tarball and checks the hash `scripts/ci/real-reaper/run-linux-check.sh` pins, runs it on a scratch configuration with a JACK dummy device (it records silence) and the app's real bridge (`src/studio/integrations/reaper/spikes/real_app_rig_launcher.lua` adds `ns_save`, a save the host has no command for), seeds the project with `seed.py`, and starts the host with `--project-folder`, `--project-file`, `--session-dir` and `--daw reaper`. `seed.py` writes the manuscript, the project's link to `Book.rpp`, the chapter link and `Book.rpp` itself: the chapter's track (`--layout folders`: Chapter One > Narrator > Main with the takes on Main), `--tracks` extra tracks and `--items` synthetic tone takes. `--layout voices2` seeds Chapter One (linked) as a folder holding Narrator (with the takes) and Alice, the layout left Flat; the launcher also adds `ns_rename` and `ns_delete` (an unsaved rename or delete of a track by GUID), and `scripts/dev/real-app/rename_delete_scenario.py` drives the owner's rename and delete scenario of #3269 with them and takes the screenshots to read the result against. Send REAPER a command with `scripts/ci/real-reaper/drive.py`'s `Session(Path('<work>/session'))` (`s.ask('record_start', guid, until={'RECORD_STARTED'})`); `<work>/session/events.log` shows what the host sent.

Things that cost time:

- A hand-written `.rpp` track needs a `TRACKID {guid}` line next to the header. Without it REAPER gives the track its own GUID and the host's link answers `TRACK_STALE`. `seed.py` writes both.
- The project's `project.json` needs `dawProjectFile`; without it the top bar reads **REAPER: Other project**.
- The host's "unsaved changes" is relative to the baseline it took when it first saw REAPER. A host started after an edit reads the project as saved; record or edit after `rig.sh up`.
- The Booth full-screens with no navigation and the driver's key events do not leave it; restart the host (`rig.sh down`, `up`) to start from Production again.
- The Booth stops and undoes a take within about 30 ms when no speech model is installed. `ARMED` and `RECORD_STARTED` still reach REAPER, which is enough to time or check a Record press. To keep a take, send `arm_only`, `record_start` and `record_stop` yourself.
- Some text (the no-audio banner's sentence) is not in the accessibility tree. Read it from a screenshot: `XAUTHORITY=/tmp/xvfb-run.XXXX/Xauthority import -display :NN -window root x.png`, with the display and the auth folder from `pgrep -fa Xvfb`.
- Kill REAPER with `rig.sh down`; a plain kill of `xvfb-run` leaves a REAPER answering the old session folder.

## A book with a narrator's work in it

A book that `seed.py --chapters` writes holds the manuscript, the `.rpp` and the links, and the host reads it in a fraction of the time a worked-on book takes: the host evaluates every recording check on each read of the chapter list, the Production overview, the pickup list and the chapter sync state, and a book without checks skips that work. To reproduce what a narrator sees on a real book, seed one with the work in it:

```bash
node scripts/dev/host-read-bench.mjs seed /tmp/book-17h --size 17h    # 44 chapters; 1h is 3, 40h is 103, 300 is 300 short chapters
node scripts/dev/host-read-bench.mjs seed /tmp/part --chapters 44 --checked 10 --checks 2   # 10 chapters checked, twice each
scripts/dev/real-app/rig.sh up /tmp/rig --chapters 44 --checked       # the same seed under a real REAPER
```

The seed is a Go test (`TestSeedAPerfBook` in `src/studio/desktop/perfbook_test.go`) that writes the book and then, through a host built over it, runs a recording check on each chapter (the sidecar is a stand-in that hears every word; the host's own aligner, ledger and result store do the rest), builds the Story Bible, and saves findings at about 40 per 1,000 words with 45 % decided, marks at about 15 per 1,000 words, a pickup in one chapter of eight and script prep. The files are the ones the app writes, so they pass its schemas. The folder must be new or empty. `--items` sets the takes on each chapter's track (100), `--paragraphs` the paragraphs a chapter (40, of 88 words), `--tracks` the extra empty tracks. A 17 hour book seeds in about 70 s and takes 47 MB.

Every take plays its own five seconds of one shared two-second file of silence, so a real REAPER opens the project and plays nothing.

## Timing the host's reads

```bash
node scripts/dev/host-read-bench.mjs reads /tmp/book-17h --runs 3
```

prints one Markdown table a run (`TestPrintTheHostReadTable` in `perfreads_test.go`): for each read binding a page calls on opening, the first call on a host that has read nothing, the median of the calls after it, the answer's size, and the files decoded, record folders listed and allocations of a call. No window and no DAW are involved, so the numbers are the host's alone and the command also runs on Windows. Each run is a new process.

`TestTheSlowReadsStayInsideTheirBudgetsOnA44ChapterBook` in the same file runs in CI. It seeds a 44-chapter book with short chapters and caps the decodes, listings and allocations of `ManuscriptChapters`, `ProductionOverview`, `PickupsList`, `ChapterSyncState` and `FindingsSummary`. A change that makes one of them cheaper lowers its row in `readBudgets`; the test's log line gives the new numbers.

## Timing the pages

```bash
NARRATION_DEBUG=1 scripts/dev/real-app/start-host.sh /tmp/ns-host /tmp/ns-state 3000 -- --project-folder /tmp/book-17h &
cd scripts/dev/real-app
DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/ns-state/run/bus /usr/bin/python3.12 page_times.py /tmp/ns-state
```

With `NARRATION_DEBUG=1` the page logs every host call it gets an answer to, with the time it waited (`ui.call.ok` in `<state>/AppData/Roaming/narration-studio/logs/run.jsonl`). `page_times.py` reads the launch from the start of that log, then presses each page's navigation button twice over and prints, for each visit, the calls made, when the first and the last answer came, how long the app stayed busy, the summed wait and the slowest call. A visit ends when no answer has come and neither the host process nor WebKit's page process has used the processor for two seconds (`--quiet`), so a slow read in flight and the drawing after the last answer both count; "Busy until" is the last moment either process worked. `--launch-only` stops after the launch row, for timing several starts. A call's wait is the host and the bridge to the page together; `host-read-bench.mjs reads` gives the host's share, and `scripts/dev/page-bench.mjs` times the same pages on the mock, where the host costs nothing.

Keep the state folder's path short. The host's session bus is a unix socket at `<state>/run/bus`, and a socket path over 107 bytes fails with `connect: invalid argument` before the window opens; `/tmp/ns-state` is safe.

## Why the start script looks the way it does

WebKit starts a bubblewrap sandbox with a D-Bus proxy. A bare `dbus-run-session` made that step fail (`bwrap: Can't find source path .../webkitgtk/bus-proxy-...`, then SIGTRAP). A session bus at a fixed path under a private `XDG_RUNTIME_DIR`, a writable `$HOME/.cache/webkitgtk` and a fresh `$HOME` per run start it with the sandbox on. Do not turn the sandbox off (`WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS`) to make it start.

## What it cannot do

- It reads what the accessibility tree exposes: a canvas or an unnamed element has no text. A check that needs pixels is not covered here yet.
- A real REAPER: see [Real host plus real REAPER](#real-host-plus-real-reaper); the CI check that shares its start is `scripts/ci/real-reaper/run-linux-check.sh` ([REAPER verification pass](reaper-verification-pass.md#real-reaper-ci-run-linux)).
