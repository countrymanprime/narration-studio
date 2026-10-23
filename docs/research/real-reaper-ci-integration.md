# Real-REAPER integration testing in CI

**Researched 2026-10-18. Status: a design, plus a prototype in a separate pull request ([`claude/real-reaper-ci-workflow`](https://github.com/countrymanprime/narration-studio/tree/claude/real-reaper-ci-workflow)) that **ran green in a real REAPER 7.82 on Linux on 2026-10-19** (see [Result](#result-reaper-782-linux-under-xvfb-2026-10-19)); it has not run on a GitHub runner or on Windows.** Question: how do the bridge's actions get exercised against a real REAPER on a CI runner, with public-domain audiobook audio (decision D71), so the facts in [the REAPER reference](../reference/daw/reaper.md) are re-checked on every release instead of by the owner's hand?

## What could and could not be checked here

- The first pass of this note was written in a session that could not reach `www.reaper.fm`. It was run again on 2026-10-19 after the owner allowed the host: REAPER 7.82 (Linux x86_64 tarball, SHA-256 `a4aa961534f22ae5ae910e4ec0c200dcb4476c9f7556806fe09a9743cd582563`, verified against the download) ran under `xvfb-run` with no sound card (`/dev/snd` absent).
- **Run:** the prototype in [the workflow pull request](https://github.com/countrymanprime/narration-studio/tree/claude/real-reaper-ci-workflow), against that REAPER and against the harness's fake. Results below.
- **Not run:** anything on Windows, anything on a GitHub-hosted runner, Verification pass Part A, and every row marked "no" in the matrix that needs playback or recording.
- **Licence:** read from `REAPER/EULA.txt` in the tarball; the owner ruled on it on 2026-10-19. See [Licence](#licence).

## What already exists

| Piece | What it proves | Runs in CI? |
| --- | --- | --- |
| Bridge harness, `src/studio/integrations/reaper/tests` (`pnpm exec nx test reaper`) | The Lua's logic, refusals, events and undo labels against a fake `reaper` (Lua 5.4 under `lupa`), plus mutation checks. [`fake_fidelity_test.lua`](../../src/studio/integrations/reaper/tests/fake_fidelity_test.lua) pins the facts recorded from REAPER 7.80. | Yes, in the PR gate |
| Spikes S0, S5, S6, S7 and `run-reaper.ps1` | What REAPER itself does. Isolated `-cfgfile`, scratch project, `Audio_Quit()` first, dialogs answered by the driver. | No: run by hand on the owner's Windows machine |
| Verification pass Part A, `run-pass-part-a.ps1` + `pass_part_a.lua` ([the pass](../operations/reaper-verification-pass.md)) | Rows A1 to A14: the real bridge from the working tree, a fresh registry, the file protocol, in REAPER, with the audio device closed. Builds its own scratch project from `make_media.py` tones; no owner path is hard-coded. | **No, and it needs no change to try**: it uses only `%TEMP%` and the installed `reaper.exe` |
| [`windows-reaper-transport.yml`](../../.github/workflows/windows-reaper-transport.yml) | The only workflow that starts a real REAPER: installs the 7.80 evaluation build (hash-pinned), runs `transport_timing.lua`. Its recorded result: REAPER ran with the bridge heartbeat live, but the runner has **no audio device** ("Error opening devices") and the transport never left state 0 ([QA checklist 9.7](../operations/windows-qa-checklist.md)). | Manual only |

So the gap is not "can CI start REAPER" (it can) but that no workflow runs the command rows, and Part C (the Studio Next commands) has never run anywhere.

## What a runner without audio can and cannot prove

- **Can:** everything that is project state or API behaviour: items, takes, `P_EXT`, regions, undo labels, change counts, fixed-lane modes, FX chains, render configuration and **rendering to files** (S5 rendered three region files with the device closed).
- **Cannot:** play, record, pause, a play position that moves, `record_start`/`record_stop`/`roll`, `loop_context`, `preview_file_range` (also needs SWS), `monitor_level` (needs a hardware output). These are Part B and C2/C10, owner rows.
- **Workaround for "is it audible":** render to a file and measure it. A take hidden with `D_VOL` 0 (`hide_takes`), a lowered stretch (`reduce_range_gain`), a repaired click and a cut can each be asserted from the rendered WAV's samples with no audio device. Nobody has done this yet; it is the main idea for phase 3.

## Action-by-action matrix

"Fake" is what `src/studio/integrations/reaper/tests` already proves. "Real only" is what only REAPER can show. The last two columns say whether `windows-latest` with no audio device can prove it and which LibriVox material it needs. Fixture ids are from [`sources.json`](../../tests/fixtures/audio/librivox-alice/sources.json): `kara_01` is Kara Shallenberg's Chapter I and `leach_01` is Eric Leach's reading of the same chapter, so two real readers of one text exist for take and comping tests. The recordings are public domain (LibriVox) and downloaded at test time with their pinned SHA-256; none is committed.

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

In [the workflow pull request](https://github.com/countrymanprime/narration-studio/tree/claude/real-reaper-ci-workflow), `scripts/ci/real-reaper/` (the launcher sits under the `reaper` project so stylua lints it):

- `src/studio/integrations/reaper/spikes/ci_real_reaper_launcher.lua`, run **inside REAPER** by the `reaper.exe -cfgfile … project script` startup path of S6. It refuses to run unless the resource path is the scratch folder, closes the audio device, builds a one-track project with the LibriVox chapter as an item, loads the real `narration_ui_bridge.lua`, and adds four CI-only commands: `ci_state`, `ci_undo`, `ci_render` (action 42230, name-checked as in S5) and `ci_quit`.
- `drive.py`, a Python driver that talks the same file protocol as the Go host (`commands/NNNNNNNN.cmd` in, `events.log` out) and prints one `PASS`, `FAIL` or `SKIP` per action, `results.md` and `results.json`. It also fetches the pinned chapter. The same driver runs against the fake (`--target fake`), which is how it was tested here.
- `run-real-reaper-check.ps1` and `.github/workflows/real-reaper-bridge.yml` (`workflow_dispatch`): install the hash-pinned REAPER, fetch the chapter, start REAPER through the existing `run-reaper.ps1` (so the audio-device and save dialogs are answered as in the 9.7 run), run the driver, upload the report. The workflow is `risk:high` and needs the owner's approval.

**Proven on 2026-10-19 (Linux, REAPER 7.82):** REAPER decodes the MP3 itself; `Main_SaveProject(0, false)` writes the project opened from the command line; `ci_render` finishes before the next command is read. **Not proven:** the Windows path (`Start-Job` with `run-reaper.ps1`, action 40004 quitting with its save prompt answered by the driver) and anything on a GitHub runner.

## Result: REAPER 7.82 Linux under xvfb, 2026-10-19

`scripts/ci/real-reaper/run-linux-check.sh` (downloads the pinned tarball, fetches the pinned LibriVox chapter `kara_01`, starts REAPER under `xvfb-run -a`, runs `drive.py`) took 9 s and every real row passed. REAPER reported `7.82/linux-x86_64`, its title bar said "audio device closed", and `GetOS()` returned `Other`.

| Action | Result in real REAPER 7.82 |
| --- | --- |
| `ping` | `PONG` |
| `project_state`, heartbeat | The saved project path; `PROJECT_STATUS` every tick with unsaved `0` and a change count that rose with edits |
| `chapter_track_state`, `play_position` | Play state 0, cursor 0 |
| stale track GUID | `TRACK_STALE` |
| Chapter file as an item | `TRACK_ITEM` with the item GUID the launcher read, `kara_01.mp3` as the source and length 796.285896 s: **REAPER decoded the MP3 directly** |
| `create_regions` | 3 created; the same payload again: 0 created, 3 existing |
| Undo | `Undo_CanUndo2` read "Narration Studio: create regions"; one `Undo_DoUndo2` left 0 regions (C17's label and one-step part, for regions only) |
| `configure_chapter_render` | `RENDER_TARGETS` predicted `Chapter 1.wav`, `Chapter 2.wav`, `Chapter 3.wav` |
| Render (action 42230) | Three files of that name, 20.0 s each, 44.1 kHz stereo 24-bit WAV, 5,292,690 bytes each: S5's `$region` result holds on 7.82/Linux |

What the first run found: the launcher's `fixture.json` call had a missing argument (fixed), and at quit REAPER asks "Save project … before closing?" and shows its "REAPER IS NOT FREE" evaluation notice. The launcher now saves the scratch copy first, and the script kills REAPER at exit. Nothing else needed a dialog answered; the audio-device prompt of Windows did not appear.

Not yet shown by this run: it is one REAPER version on one OS, S0 and S7 facts were not re-run, and Linux and Windows may differ (paths, file dialogs, the `.rpp` encoding).

## Recommended CI design

- **Triggers.** `workflow_dispatch` first. Then a nightly `schedule` and a run before each release, **not** every pull request: a run takes minutes, depends on `reaper.fm` being up, and a REAPER release can break it for reasons unrelated to a change.
- **Runner.** Both, as separate jobs. **Linux** (`ubuntu-24.04`, `xvfb`, the tarball pinned by SHA-256) is fast (9 s locally, no installer, no dialog driver) and ran green on 2026-10-19, so it can be the nightly. **Windows** (`windows-latest`, pin `windows-2025` once green) is the product's platform and the only OS the repository's REAPER facts were recorded on, so it stays as the pre-release run; its driver is `run-reaper.ps1`, which answers the dialogs. Linux needs `libgtk-3-0` and `xvfb`; REAPER prints JACK warnings that do not matter.
- **REAPER install.** The silent installer pinned by SHA-256 (the `installer-sha256` input; nothing runs unless it matches), as the 9.7 workflow does. Record version and signature in the report. The Windows pin for 7.82 is `ae86dd8396673318a85275175dc8c1c9b0b8e090bf305f9cec920358e9d1e18f`, the SHA-256 of `https://www.reaper.fm/files/7.x/reaper782_x64-install.exe` (17,172,472 bytes), identical on two downloads on 2026-10-19; it matches the `reaper-version` default 7.82 (the hash input stays required). Bump the pin deliberately; the owner compares this hash with the one `reaper.fm` publishes, which has not been done. No cache: the installer is small; cache only the LibriVox MP3 (key: its SHA-256).
- **Audio.** None. The launcher calls `Audio_Quit()` and asserts `Audio_IsRunning() == 0`; on Windows the driver answers "Error opening devices", on Linux REAPER simply shows "audio device closed". Rows that need playback or recording stay owner rows.
- **Pins.** REAPER version and installer hash; the LibriVox file by SHA-256 (`sources.json`); the runner image; actions by commit SHA.
- **Timeouts.** Job 25 minutes; REAPER 240 s (`run-reaper.ps1 -TimeoutSec`); each command 30 s, the render 120 s. A hung REAPER is killed by `run-reaper.ps1`, which closes only the process it started.
- **Reporting.** Per-action rows in the job summary and in `results.md`/`results.json`; `events.log` and `fixture.json` as artifacts (14 days). A row is `PASS`, `FAIL` or `SKIP` with a reason; any `FAIL` fails the job; a skipped row names what it needs. A failing row that disagrees with the fake is a fake bug: per [reaper-api-facts](../../.claude/skills/reaper-api-facts/SKILL.md), pin the observed value in `fake_fidelity_test.lua` first, then fix the fake.
- **What a green run is worth.** It is evidence in a dated note, not a promotion: a command leaves Experimental only after the owner's pass ([the pass](../operations/reaper-verification-pass.md)).

## Licence

**Decided by the owner on 2026-10-19: using REAPER's evaluation build in CI is fine.** The owner's reasons:

- The product is AGPL and free.
- REAPER is never redistributed: each run downloads it from `www.reaper.fm` on a fresh VM.
- The runs are throwaway integration tests of the Lua bridge.
- The owner holds a personal licence, and each end user must hold their own.

The clauses below are from `REAPER/EULA.txt` in the 7.82 Linux tarball (the same file is in the installer):

- **1.1:** "You may download and use the Software for free for sixty (60) days after installation ("Trial Period")", "for evaluation purposes only". The evaluation copy "is fully functional".
- **1.2:** after the Trial Period "you are required to purchase a license": $225 USD commercial, or $60 USD discounted for an individual using it only personally and non-commercially, a business under $20,000 annual gross revenue from commercial activity, or an educational or non-profit organisation.
- **1.4:** other uses are for `licensing@cockos.com`. **1.5:** one computer at a time. **1.6:** a purchased licence covers up to version 8.99.

The EULA has no clause on automated or unattended use. Caveat: a nightly `schedule` on fresh installs relies on the evaluation terms; a purchased personal licence is the fallback (its route into an isolated `-cfgfile` run was not researched). This records the owner's decision and is not legal advice. The Linux job uploads the EULA text with the run's artifacts.

## Phased plan

| Phase | Work | Needs |
| --- | --- | --- |
| 0 | Owner approves the `risk:high` workflow and compares the recorded 7.82 installer hash (see [Recommended CI design](#recommended-ci-design)) with `reaper.fm`'s. The licence is decided ([Licence](#licence)). | Owner |
| 1 | Run **Part A as it is** on the runner: a Windows dispatch workflow around `run-pass-part-a.ps1` (about 20 lines, copied from the 9.7 workflow), or its Lua under the Linux script (`pass_part_a.lua` has not been tried on Linux). Read A1 to A14 from CI. | No new test code |
| 2 | Land the prototype after its first dispatch is fixed; add `read_line_ids`/`stamp_item_lines` (the item `P_EXT` round trip across save and reload), pickups and fixed lanes. | Phase 0 |
| 3 | Part C rows with `kara_01` and `leach_01` as two reads: takes, stacking, cuts, FX ranges. Assert audibility by rendering and measuring the WAV. Add an MP3 render with ID3 `CHAP` frames read back with `mutagen`. Capture the `RENDER_FORMAT` blob for MP3 from a real REAPER first. | Phases 1 and 2 |
| 4 | Nightly `schedule` and a pre-release run; on failure open or update one issue. Each result recorded in `reaper.md` with REAPER version and run link. | Phase 0 (the licence is decided) |
| 5 | The Linux job exists and passed locally; dispatch it on a GitHub runner, then decide whether Linux alone is enough for the nightly and Windows stays a pre-release check. Part B stays with the owner. | Phase 0 |

## Observations from reading the code

- `docs/reference/daw/reaper.md` says the bridge's Lua subset has no bit operators, but [`narration_punch.lua:55`](../../src/studio/integrations/reaper/narration_punch.lua) uses `reaper.GetPlayState() & 4 == 4`. It parses as `(state & 4) == 4` and works in Lua 5.4, which the harness and REAPER 7 run, so this is a documentation or style inconsistency, not a failing case. Not changed (the task excluded edits to the Lua).
- `drive.py` reuses `tests/fixtures/audio/librivox-alice/sources.py` for the download, so the LibriVox pin lives in one file.
