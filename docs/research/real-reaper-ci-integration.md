# Real-REAPER integration testing in CI

**Researched 2026-10-18. Status: a design, plus a prototype in a separate pull request ([`claude/real-reaper-ci-workflow`](https://github.com/countrymanprime/narration-utils/tree/claude/real-reaper-ci-workflow)) that has not run in a real REAPER.** Question: how do the bridge's actions get exercised against a real REAPER on a CI runner, with public-domain audiobook audio (decision D71), so the facts in [the REAPER reference](../reference/daw/reaper.md) are re-checked on every release instead of by the owner's hand?

## What could and could not be checked here

- The cloud session this note was written in cannot reach `www.reaper.fm` or `librivox.org` (the egress proxy answers 403; `archive.org` works). REAPER could not be downloaded, so **nothing in this note was run in REAPER.** A runner that can reach `reaper.fm` is required (the existing [`windows-reaper-transport.yml`](../../.github/workflows/windows-reaper-transport.yml) shows `windows-latest` can).
- **Run here:** the prototype's driver (`drive.py`) against the harness's fake `reaper`, through `scripts/research/bridge-fake-driver.py`: 6 rows pass (ping, project, heartbeat, transport, stale track, regions create then idempotent) and 7 are skipped as needing a real REAPER. The pinned LibriVox download (`drive.py fetch`) ran here and its SHA-256 matched.
- **Not read:** REAPER's licence text (`reaper.fm` unreachable). See [Licence](#licence).

## What already exists

| Piece | What it proves | Runs in CI? |
| --- | --- | --- |
| Bridge harness, `integrations/reaper/tests` (`pnpm exec nx test reaper`) | The Lua's logic, refusals, events and undo labels against a fake `reaper` (Lua 5.4 under `lupa`), plus mutation checks. [`fake_fidelity_test.lua`](../../integrations/reaper/tests/fake_fidelity_test.lua) pins the facts recorded from REAPER 7.80. | Yes, in the PR gate |
| Spikes S0, S5, S6, S7 and `run-reaper.ps1` | What REAPER itself does. Isolated `-cfgfile`, scratch project, `Audio_Quit()` first, dialogs answered by the driver. | No: run by hand on the owner's Windows machine |
| Verification pass Part A, `run-pass-part-a.ps1` + `pass_part_a.lua` ([the pass](../operations/reaper-verification-pass.md)) | Rows A1 to A14: the real bridge from the working tree, a fresh registry, the file protocol, in REAPER, with the audio device closed. Builds its own scratch project from `make_media.py` tones; no owner path is hard-coded. | **No, and it needs no change to try**: it uses only `%TEMP%` and the installed `reaper.exe` |
| [`windows-reaper-transport.yml`](../../.github/workflows/windows-reaper-transport.yml) | The only workflow that starts a real REAPER: installs the 7.80 evaluation build (hash-pinned), runs `transport_timing.lua`. Its recorded result: REAPER ran with the bridge heartbeat live, but the runner has **no audio device** ("Error opening devices") and the transport never left state 0 ([QA checklist 9.7](../operations/windows-qa-checklist.md)). | Manual only |

So the gap is not "can CI start REAPER" (it can) but that no workflow runs the command rows, and Part C (the Studio Next commands) has never run anywhere.

## What a runner without audio can and cannot prove

- **Can:** everything that is project state or API behaviour: items, takes, `P_EXT`, regions, undo labels, change counts, fixed-lane modes, FX chains, render configuration and **rendering to files** (S5 rendered three region files with the device closed).
- **Cannot:** play, record, pause, a play position that moves, `record_start`/`record_stop`/`roll`, `loop_context`, `preview_file_range` (also needs SWS), `monitor_level` (needs a hardware output). These are Part B and C2/C10, owner rows.
- **Workaround for "is it audible":** render to a file and measure it. A take hidden with `D_VOL` 0 (`hide_takes`), a lowered stretch (`reduce_range_gain`), a repaired click and a cut can each be asserted from the rendered WAV's samples with no audio device. Nobody has done this yet; it is the main idea for phase 3.

## Action-by-action matrix

"Fake" is what `integrations/reaper/tests` already proves. "Real only" is what only REAPER can show. The last two columns say whether `windows-latest` with no audio device can prove it and which LibriVox material it needs. Fixture ids are from [`sources.json`](../../tests/fixtures/audio/librivox-alice/sources.json): `kara_01` is Kara Shallenberg's Chapter I and `leach_01` is Eric Leach's reading of the same chapter, so two real readers of one text exist for take and comping tests. The recordings are public domain (LibriVox) and downloaded at test time with their pinned SHA-256; none is committed.

| Action | Command / event | Fake proves | Real only | CI, no device | LibriVox |
| --- | --- | --- | --- | --- | --- |
| Link / identify the project | `project_state` → `PROJECT_STATE`; heartbeat `PROJECT_STATUS` | Payload shape, empty path for unsaved | `EnumProjects(-1,'')` returns the saved path and `''` for unsaved ([S6](reaper-spike-s6-daw-reachability.md)); a launch with `reaper.exe -cfgfile … project script` runs the script with the project open | **Yes** (prototype, A1) | none |
| Reachability / version | `ping` → `PONG` | Reply and navigation version | The script loads in REAPER's Lua (feature files, `dofile`) | **Yes** (prototype) | none |
| Chapter audio as items | no import command: the narrator imports or records, the bridge reads `chapter_track_state` → `TRACK_ITEM`; the Go `tracks` package reads the `.rpp` | Row shapes from a fake item | `GetMediaSourceFileName`, take offset and rate, source length of a **real decoded MP3**; `.rpp` as REAPER saves it | **Yes** (prototype builds the item; asserts file name and length) | `kara_01` |
| Chapters / credits as regions | `create_regions` → `REGIONS_CREATED` | Plan (add, exist, move, ambiguous), one undo block | Region numbering and bounds as REAPER stores them; colour; one Undo removes them | **Yes** (prototype; A9) | `kara_01` (bounds from the committed alignment markers) |
| Markers on a take | `add_finding_marker`, compare markers, pickups (`import_pickups`, `resolve_pickup`, `reopen_pickup`, …) | Logic | `SetTakeMarker` source-time vs project-time; marker text round trip | Yes (Part A + C8/C9 scripts to write) | `kara_01` |
| Read transport and position | `play_position`, `chapter_track_state` → `PLAY_POSITION`, `TRACK_STATE` | Fields from fake state | State 0 and cursor read as REAPER reports them; **moving** play position and the heard/processed gap need a device | Stopped state **yes** (prototype, A2); playing **no** (9.7 run: transport never moved) | none |
| Record and arming | `arm_only`, `record_start`, `record_stop`, `roll`, `punch_to` | Refusals, arm bookkeeping | Real recording, `GetPlayState` bit 4, auto-punch, the overlap setting | Refusals and `punch_to` cursor: **yes** (A4, A5, A9c). Recording: **no** | none (needs an input) |
| Fixed lanes / retakes | `pick_retake_lane` → `RETAKE_LANE_PICKED`, `create_take` | Logic | Lane semantics `C_LANEPLAYS`, `I_FREEMODE` ([S7](reaper-spike-s7-fixed-lanes.md)) | **Yes**, API only (`spike_s7_fixed_lanes.lua` already scripts it) | two reads from `kara_01` and `leach_01` |
| Takes and comping | `set_active_take`, `hide_takes`, `split_take`, `stack_takes`, `unstack_takes` | Logic, undo count | Take `D_VOL`/`P_EXT` survive save and reload; `SetItemStateChunk` removes only the named take; one Undo gives every read back (rows C1, C6, C7, C12) | **Yes**; audibility via render-and-measure | `kara_01` + `leach_01` |
| Cut / range edits | `delete_range`, `apply_fx_range`, `remove_fx_range`, `reduce_range_gain`, `repair_click` | Logic | Splits, Cuts-track move, fades REAPER gives a split, `TakeFX_AddByName` on a `.RfxChain`, envelope point times (C3 to C5, C13 to C15) | **Yes**; the result measured in a render | `kara_01` (committed word timings give real cut points) |
| FX chains | `list_fx_chains`, `apply_fx_chain`, `master_chain_read` | Name checks, refusals | The listing REAPER gives, the chain loads | **Yes** (A7, A8) | none |
| Render configuration | `configure_chapter_render` → `RENDER_CONFIGURED` | Keys set | `$region` with "all regions" names one file per region and `RENDER_TARGETS` predicts them ([S5](reaper-spike-s5-render-details.md)) | **Yes** (prototype) | `kara_01` |
| Render / export | Action 42230 (the narrator presses Render); `render_with_fx` → `FX_RENDER_FILE`, `FX_RENDERED` | Plan and events | Files exist, are non-empty and have the predicted names | **Yes** (prototype renders three region WAVs) | `kara_01` |
| ID3 chapter titles | none in the bridge yet; `CHAP=` marker names ([S5](reaper-spike-s5-render-details.md) left it "TBD") | n/a | Whether an MP3 render carries `CHAP`/`CTOC` frames with the region titles | **Probably yes**: render an MP3, read tags with `mutagen`. The `RENDER_FORMAT` blob is opaque and must be captured from a real REAPER setup first | `kara_01` |
| Undo | `last_action`, `undo_last`; every command's undo label | Labels, counts, refusal to undo past a foreign point | `Undo_CanUndo2` text, one `Undo_DoUndo2` per block, change count after an undo (C17, not run anywhere) | **Yes** (prototype checks the region undo) | none |
| Events the app consumes | `PROJECT_STATUS` (every 1.5 s or on a play-state change), `RECORD_ENDED`, `PLAY_POSITION`, `*_STALE` | Event shapes against `wire.go` | The heartbeat cadence under a real `defer` loop; the unsaved flag | Heartbeat **yes** (prototype); `RECORD_ENDED` **no** | none |
| Files and preview | `preview_file_range`, `stop_file_preview`, `reveal_file` | Refusals | SWS preview; Media Explorer opens | **No** (SWS, a device, a UI window) | none |
| Monitor level | `monitor_level` | Logic | Send volume scale | **No** unless the project has a hardware output; untested | none |

## Prototype

In [the workflow pull request](https://github.com/countrymanprime/narration-utils/tree/claude/real-reaper-ci-workflow), `scripts/ci/real-reaper/`:

- `launcher.lua`, run **inside REAPER** by the `reaper.exe -cfgfile … project script` startup path of S6. It refuses to run unless the resource path is the scratch folder, closes the audio device, builds a one-track project with the LibriVox chapter as an item, loads the real `narration_ui_bridge.lua`, and adds four CI-only commands: `ci_state`, `ci_undo`, `ci_render` (action 42230, name-checked as in S5) and `ci_quit`.
- `drive.py`, a Python driver that talks the same file protocol as the Go host (`commands/NNNNNNNN.cmd` in, `events.log` out) and prints one `PASS`, `FAIL` or `SKIP` per action, `results.md` and `results.json`. It also fetches the pinned chapter. The same driver runs against the fake (`--target fake`), which is how it was tested here.
- `run-real-reaper-check.ps1` and `.github/workflows/real-reaper-bridge.yml` (`workflow_dispatch`): install the hash-pinned REAPER, fetch the chapter, start REAPER through the existing `run-reaper.ps1` (so the audio-device and save dialogs are answered as in the 9.7 run), run the driver, upload the report. The workflow is `risk:high` and needs the owner's approval.

**Not proven, and why:** that REAPER decodes the MP3 itself (nothing in the repository records a REAPER run on MP3 input; the fallback is to decode to WAV with PyAV, as `audio.py` does); that `Main_SaveProject(0, false)` writes to the project opened from the command line; that action 40004 quits without a dialog the driver does not answer; that Start-Job and `run-reaper.ps1` cooperate as written; that `ci_render` finishes synchronously. The first dispatch is expected to find at least one of these wrong.

## Recommended CI design

- **Triggers.** `workflow_dispatch` first. Then a nightly `schedule` and a run before each release, **not** every pull request: a run takes minutes, depends on `reaper.fm` being up, and a REAPER release can break it for reasons unrelated to a change.
- **Runner.** `windows-latest` (pin `windows-2025` once a run is green), because it is the product's platform, it is the only runner a REAPER run is recorded on, and `run-reaper.ps1` handles its dialogs. A Linux runner is a later experiment: REAPER ships a Linux build, an X server such as `xvfb` would be needed for its windows and a dialog answerer would replace `run-reaper.ps1`; none of it was tried, and the Lua bridge paths, the `.rpp` and the file dialogs would differ from the product's.
- **REAPER install.** The silent installer pinned by SHA-256 (the `installer-sha256` input; nothing runs unless it matches), as the 9.7 workflow does. Record version and signature in the report. Bump the pin deliberately; the owner compares the first hash with the one `reaper.fm` publishes. No cache: the installer is small; cache only the LibriVox MP3 (key: its SHA-256).
- **Audio.** None. Each script calls `Audio_Quit()` and asserts `Audio_IsRunning() == 0`; the driver answers "Error opening devices". Rows that need playback or recording stay owner rows.
- **Pins.** REAPER version and installer hash; the LibriVox file by SHA-256 (`sources.json`); the runner image; actions by commit SHA.
- **Timeouts.** Job 25 minutes; REAPER 240 s (`run-reaper.ps1 -TimeoutSec`); each command 30 s, the render 120 s. A hung REAPER is killed by `run-reaper.ps1`, which closes only the process it started.
- **Reporting.** Per-action rows in the job summary and in `results.md`/`results.json`; `events.log` and `fixture.json` as artifacts (14 days). A row is `PASS`, `FAIL` or `SKIP` with a reason; any `FAIL` fails the job; a skipped row names what it needs. A failing row that disagrees with the fake is a fake bug: per [reaper-api-facts](../../.claude/skills/reaper-api-facts/SKILL.md), pin the observed value in `fake_fidelity_test.lua` first, then fix the fake.
- **What a green run is worth.** It is evidence in a dated note, not a promotion: a command leaves Experimental only after the owner's pass ([the pass](../operations/reaper-verification-pass.md)).

## Licence

Not read. `reaper.fm` could not be reached from the session that wrote this note, and I did not rely on memory of the terms. The repository's existing workflow installs the **evaluation** build, and the driver already dismisses a "REAPER IS NOT FREE" notice, so the nag screen appears. Before a nightly run is scheduled, the owner reads the licence agreement and the evaluation terms for these points: automated or unattended use of the evaluation build, how long the evaluation lasts and whether a fresh runner counts as a fresh evaluation each night, whether CI use counts as commercial use for a licence purchase, and any bar on redistributing the installer or its output. If a licence is needed, how a key reaches an isolated `-cfgfile` run was not researched.

## Phased plan

| Phase | Work | Needs |
| --- | --- | --- |
| 0 | Owner approves the `risk:high` workflow, reads the licence, and pins the installer hash (run once to see the hash; compare with `reaper.fm`'s). | Owner |
| 1 | Run **Part A as it is** on the runner: add a dispatch workflow around `run-pass-part-a.ps1` (about 20 lines, copied from the 9.7 workflow) and read A1 to A14 from CI. | No new test code |
| 2 | Land the prototype after its first dispatch is fixed; add `read_line_ids`/`stamp_item_lines` (the item `P_EXT` round trip across save and reload), pickups and fixed lanes. | Phase 0 |
| 3 | Part C rows with `kara_01` and `leach_01` as two reads: takes, stacking, cuts, FX ranges. Assert audibility by rendering and measuring the WAV. Add an MP3 render with ID3 `CHAP` frames read back with `mutagen`. Capture the `RENDER_FORMAT` blob for MP3 from a real REAPER first. | Phases 1 and 2 |
| 4 | Nightly `schedule` and a pre-release run; on failure open or update one issue. Each result recorded in `reaper.md` with REAPER version and run link. | Licence answer |
| 5 | Try Linux under `xvfb` for speed; keep Windows as the reference. Part B stays with the owner. | Optional |

## Observations from reading the code

- `docs/reference/daw/reaper.md` says the bridge's Lua subset has no bit operators, but [`narration_punch.lua:55`](../../integrations/reaper/narration_punch.lua) uses `reaper.GetPlayState() & 4 == 4`. It parses as `(state & 4) == 4` and works in Lua 5.4, which the harness and REAPER 7 run, so this is a documentation or style inconsistency, not a failing case. Not changed (the task excluded edits to the Lua).
- `drive.py` reuses `tests/fixtures/audio/librivox-alice/sources.py` for the download, so the LibriVox pin lives in one file.
