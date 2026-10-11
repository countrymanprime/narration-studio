---
name: reaper-api-facts
description: Writing or reviewing Lua that calls the ReaScript API in integrations/reaper, or deciding what REAPER does for a call? The behaviours this repo has recorded from a real REAPER 7.80 (item GUIDs and pointers, P_EXT, undo, markers and regions, fixed lanes, render keys, transport reads), how to guard a newer call, and how to check a new one in an isolated REAPER run. Load before using a ReaScript call the bridge does not use yet, or before changing a fake in integrations/reaper/tests.
---

# reaper-api-facts

## Why this exists

The bridge harness runs against a fake `reaper` table under `lupa` Lua 5.4 ([ADR 0066](../../../docs/adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md)). The fake proves the bridge's logic, not REAPER, and an agent that guesses a ReaScript return value writes a fake that agrees with the guess. `reaper-command-add` gives the steps for a command; this skill holds what REAPER was seen to do, so a call is not guessed twice.

## When to use this

- A bridge command needs a ReaScript call that no `integrations/reaper/*.lua` file uses yet.
- A fake in `integrations/reaper/tests/fake_reaper.lua` or a `fake_fidelity_test.lua` case changes.
- You are about to write "REAPER does X" in a comment, doc or PR.

## Recorded behaviour

Every row was observed in **REAPER 7.80/x64 on Windows**, scripted, in an isolated resource directory; a different version may differ. The source note holds the method and the fixture. The fake must agree with these rows (`fake_fidelity_test.lua`); when a run shows the fake is wrong, correct it there first.

| Area | What REAPER does | Source |
| --- | --- | --- |
| Item identity | `GetSetMediaItemInfo_String(item, 'GUID', '', false)` returns the item's GUID, upper case in braces. In a saved `.rpp` the item's own GUID is `IGUID`; each take has a `GUID`. | [S0](../../../docs/research/reaper-spike-s0-item-extension-data.md) |
| Stale pointers | Undo and redo replace REAPER's item objects, so look an item up by GUID again afterwards. Never hold a `MediaItem` across an undo, or find an item by position or time. | S0 |
| `P_EXT` | A missing key reads `false, ''`. A set returns `true, value`. It is stored in the `.rpp` (`<EXTI` on an item, `<EXT` on a take, key without the `P_EXT:` prefix) and survives save and reload. Split: both halves keep it (the right half gets a new GUID). Duplicate and a state-chunk copy keep it. Undo removes a stamp exactly and redo restores it. | S0 |
| Not exercised | REAPER's clipboard actions (copy and paste items) do nothing when driven headless, so a real paste is a manual check on the owner's list. | S0 |
| Undo | A change wrapped in `Undo_BeginBlock2(0)` / `Undo_EndBlock2(0, label, -1)` is one undo step. A read makes none. A command that finds nothing to change opens no block. | [fixed lanes](../../../docs/research/reaper-spike-s7-fixed-lanes.md), [planned commands](../../../docs/research/reaper-api-for-planned-commands.md) |
| Markers and regions | Numbered separately. `EnumProjectMarkers3` is enumerated by time and returns index plus one as its first value. A region is two `MARKER` lines in the file. | S0, `fake_fidelity_test.lua` |
| Fixed lanes | `I_FREEMODE=2` turns lanes on, but the API alone leaves the track half set up; a new item lands in lane 0; `I_FIXEDLANE=N` grows the track to N+1 lanes and it never shrinks. `C_LANEPLAYS:N` is 0 silent, 1 plays exclusively, 2 plays with others. `I_FREEMODE=0` puts every retake in one lane and **plays them all at once**. | S7 |
| Lanes and line ids | Converting takes to lanes and adding comp areas copy the item's `P_EXT` onto new items, so a line id no longer names one item on a lane track. The app never sets `I_FREEMODE` or converts takes and lanes ([ADR 0147](../../../docs/adr/0147-retakes-on-fixed-lanes-are-chosen-by-lane-play-state-and-the-app-never-converts-takes-and-lanes.md)). | S7 |
| Render | `$region` in `RENDER_PATTERN` with "all regions" bounds names one file per region, and `RENDER_TARGETS` read before rendering predicts the same paths. `Render_Execute` and `Render_EnumerateOutputMode` do not exist (`APIExists` is false). The `RENDER_STATS` getter is not safe to poke with an arbitrary action ID. Fifteen cited action IDs resolved (1013, 1016, 40044, 42230, 42437 and others; the table is in S5). | [S5](../../../docs/research/reaper-spike-s5-render-details.md) |
| Transport | `GetPlayState()` is a bit field: 1 playing, 2 paused, 4 recording. Read it with arithmetic (`math.floor(state / 4) % 2`), since the Lua subset has no bit operators. `GetPlayPosition()` moves while recording and answers 0 just after Stop. A `defer` loop ticks about 30 times a second. This one is desk research, not a REAPER run. | [transport timing](../../../docs/research/reaper-transport-timing.md) |
| Active project | `EnumProjects(-1, '')` returns the active tab's `.rpp`, and the exact empty string for an unsaved project. | [S6](../../../docs/research/reaper-spike-s6-daw-reachability.md) |
| Startup | `reaper.exe -cfgfile <cfg> "<project.rpp>" "<script.lua>"` runs the script at startup with the project already open. | S6 |

## What to do

1. **Look in the table, then in the sources, before you write the call.** `docs/research/reaper-api-for-planned-commands.md` lists the reference text for the calls behind the planned commands. It is desk research (REAPER 7.38 reference through the Ultraschall copy, since `reaper.fm` is not reachable from a cloud session) and nothing in it has been run.
2. **Mark what you did not see.** A call not in the table is "pending" in your comment, test and PR, with who owns the check. Never write that something "works in REAPER" unless a recorded run says so (`docs-style` rule 9).
3. **Guard anything newer than REAPER 6.** The Lua is imported by the narrator, so it can run on an older REAPER than the app expects. Check `reaper.APIExists('Name')` before a call that may be missing, as the bridge does (43 uses today), and answer with an error event rather than a nil call.
4. **Stay on the shared Lua subset.** Lua 5.4 as `lupa` runs it and REAPER's embedded build both accept: no `goto`, integer division or bit operators ([ADR 0066](../../../docs/adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md)).
5. **Check a new behaviour in an isolated run, and record it.** Follow [the verification pass](../../../docs/operations/reaper-verification-pass.md) rules and the spikes in `integrations/reaper/spikes/` (README there, driver `run-reaper.ps1`):
   - Open only a **copy** of a project, with `reaper.exe -cfgfile <temp>\reaper.ini -nosplash -newinst -noactivate`, so the owner's settings and projects are never read or written.
   - Call `reaper.Audio_Quit()` first and assert `Audio_IsRunning() == 0`; assert that `GetResourcePath()` is the scratch folder before anything else runs.
   - Name each action by ID **and** expected text (`kbd_getTextFromCmd` against `SectionFromUniqueID(0)`) and stop if the text differs, so a renumbered action cannot run something else.
   - Write the report after every stage, so a later step that hangs on a dialog does not lose the earlier findings.
   - Never arm, record or play. Anything that needs an audio device, a mouse-driven action or the owner's ears is pending and goes on the owner's list.
6. **Write the result down, then correct the fake.** Add a dated `docs/research/` note (the S0, S5 and S7 notes are the model: what it settles, method, findings, pending), add a case to `fake_fidelity_test.lua` that pins the observed value, and only then change `fake_reaper.lua`.
7. `reaper-command-add` for the command itself, `lua-reviewer` for the review, then `full-verification-gate`.

## What this skill is not

It is not the ReaScript reference: read REAPER's own help (Help, ReaScript documentation) for a signature. It does not replace the harness, the owner's verification pass or the recorded in-REAPER checks. It does not promote a command from Experimental; only the owner's pass does.
