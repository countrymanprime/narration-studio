# REAPER startup bridge: `__startup.lua`, `AddRemoveReaScript` and a forwarded script

**Date: 2026-10-23. REAPER 7.82, Linux x86_64. Windows and macOS were not run.**

## What it settles

Whether the app can make REAPER run its bridge every time REAPER opens, with no action for the narrator to load or run (#2251, items 38 to 40):

| Question | Answer |
| --- | --- |
| Does REAPER run `<resource path>/Scripts/__startup.lua` at start, and with the project already open? | Yes. `EnumProjects(-1, '')` already returned the project given on the command line |
| Is the resource path the folder of `-cfgfile`? | Yes: `GetResourcePath()` returned that folder |
| Does a `reaper.defer` loop started from `__startup.lua` keep running? | Yes: 200 ticks, then the script quit REAPER itself (action 40004) |
| Does `AddRemoveReaScript(true, 0, path, true)` add an action, and what does a second call do? | The first call adds it and writes one line to `reaper-kb.ini`: `SCR 4 0 RS<sha1> "Custom: <file>" <path relative to Scripts>`. The second call for the same path answers the same command id (53004 both times) and adds nothing |
| Does `reaper <script.lua>` (no `-newinst`) run in an open REAPER? | Yes. A value the first instance set with `SetExtState(…, false)` was read by the script, so the script ran inside it; the second process exited in 0.04 s |
| Does the whole chain work from the app's own installer? | Yes (below) |

## Method

- REAPER 7.82 for Linux x86_64 is the tarball `scripts/ci/real-reaper/run-linux-check.sh` pins, with its SHA-256 checked before unpacking. It ran under Xvfb.
- Each run had its own scratch folder with `-cfgfile <scratch>/cfg/reaper.ini`, and `promptendrec=0`. Probe scripts called `reaper.Audio_Quit()` first. Nothing was armed, recorded or played.
- Each project was a new, empty `.rpp` written for the run, not a copy of the narrator's.
- **End to end.** The scratch `Scripts/__startup.lua` held one line of its own, standing in for the narrator's. `reaperinstall.Install` (`apps/desktop/internal/reaperinstall`) then wrote the checkout's `integrations/reaper/*.lua` into it, and REAPER was started with only the project, no script argument:
  - The narrator's line ran.
  - One `NarrationStudio/sessions/hub_<id>/` appeared, holding `commands/`, `events.log` with `PROJECT_STATUS` lines, and `bridge-running.txt`.
  - `reaper-kb.ini` gained `SCR 4 0 RS… "Custom: NarrationStudio_Launcher.lua" NarrationStudio/NarrationStudio_Launcher.lua`.
  - `1|ping|run42` written into `commands/` was answered `PONG|run42|1|0|0`.
  - Running the launcher in that open REAPER, as `reaper <installed launcher>`, left one `hub_*` folder: it reused the startup bridge. The app path it was given did not exist, so it showed its setup message instead of starting an app.
  - `1|close` ended the loop and removed `bridge-running.txt`.

## Pending

- **Windows** (owner):
  - `%APPDATA%\REAPER\Scripts\__startup.lua` on a real install.
  - A portable install (`reaper.ini` beside `reaper.exe`).
  - Whether a second `reaper.exe <script.lua>` reaches the open REAPER. This depends on REAPER's "allow multiple instances" preference, and matters only for a REAPER opened before the app installed the bridge.
  - The packaged app's start of REAPER on a linked project.
- **macOS**: `~/Library/Application Support/REAPER` is REAPER's documented default, not run.
- **Order:** when REAPER is started with both a project and a script argument, whether that script or `__startup.lua` runs first was not checked. The app passes no script argument once the block is installed, and the launcher reuses a live bridge either way.
