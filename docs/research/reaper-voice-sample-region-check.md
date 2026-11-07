# In-REAPER check: the voice sample region commands

**Status: not run.** The harness (`src/studio/integrations/reaper/tests/voice_sample_region_test.lua`) proves the logic of `keep_voice_sample`, `delete_voice_sample_region` and `read_voice_samples` against the fake. This page lists what the fake cannot prove, so the owner's run (REAPER isolated on a copy of a project with its own `-cfgfile`, [the rules](../operations/reaper-verification-pass.md#rules)) knows what to read back. It builds on [spike S8](reaper-spike-s8-voice-sample-labels.md), which asks the same questions about the saved file and the item; run both in one session. Nothing here needs audio hardware. The commands stay Experimental until the table has results (`voice_sample_region` in [the capability reference](../reference/daw/capabilities.md#voice_sample_region)).

## What the fake assumes

| # | Assumption in the fake or the Lua | What to read in REAPER | Result |
| --- | --- | --- | --- |
| V1 | `AddProjectMarker2(0, true, first, last, name, -1, 0)` returns the new region's number, and that number is the sixth value of `EnumProjectMarkers3` for it. | The returned number equals the enumerated `markrgnindexnumber` after adding to a project that already has chapter regions and a plain marker. | pending |
| V2 | A region name with `|`, `%`, quotes, non-ASCII text and an emoji reads back from `EnumProjectMarkers3` exactly as written, and a name with a line break is turned into a space by the Lua before it is sent. | Add `Voice sample: Zoë \| 100% "why?" <emoji>`; read it back; save and read the `.rpp`'s two `MARKER` lines. | pending |
| V3 | `SetProjectMarker4(0, number, true, first, last, name, 0, 0)` renames and moves the region, keeping its number and colour (the chapter regions' update already relies on this, [REAPER facts](../reference/daw/reaper.md)). | Move and rename a coloured sample region; compare number and colour. | pending |
| V4 | One `Undo_BeginBlock2` / `Undo_EndBlock2(..., -1)` pair around the add (or move) is one undo point, and a block around a refused add (`AddProjectMarker2` returns -1) makes none. The fake always makes a point for a closed block, so the refused-add case is not modelled. | Undo once after an add, after a move; try an add REAPER refuses if one can be provoked; read the undo label. | pending |
| V5 | `GetProjectStateChangeCount(0)` rises on an add and on a move, so the host can tell that the live project has a region the saved file lacks. | Read it before and after each; save and read the saved `.rpp`. | pending |
| V6 | `GetPlayState()` bit 4 is set while recording, so both commands refuse then. Already read by `track_create` and `record_*`; nothing new, listed so the run does not skip the refusal. | Start a recording on a copy with a silent input and send `keep_voice_sample`. Needs Part B's set-up and the owner. | pending, owner |
| V7 | A project with 500 or more sample regions answers 500 and the host treats it as a failed read. | Add 520 regions by script and read. | pending |
| V8 | A region does not follow its item (project time). | Spike S8, question C. | pending |
| V9 | The region's GUID is only in the saved `.rpp`. | Spike S8, question A. | pending |
| V10 | `DeleteProjectMarker(0, number, true)` removes the region that number names, returns true, and does not renumber the regions after it (the fake removes it and keeps the others' numbers, and the host holds numbers across a removal). | Delete the middle of three sample regions and a chapter region's neighbour; re-enumerate; read the numbers and the saved `.rpp`'s `MARKER` lines. | pending |
| V11 | One `Undo_BeginBlock2` / `Undo_EndBlock2(..., -1)` pair around the delete is one undo point, and the undo brings the region back with its name, bounds, colour and number. The fake makes a point for a closed block and does not model the undo of a delete. | Undo once after a delete; read the label and the region. | pending |
| V12 | `DeleteProjectMarker` with a plain marker's number and `isrgn` true removes nothing (the Lua enumerates regions only, so it never asks, but a number shared by a marker and a region must pick the region). | Add a marker and a region that share a number; delete the region's number. | pending |

## What it does not cover

The host's use of these commands (the store, the settings control, the dialog line, `/media`) is not built in this change. Anything the owner checks above that differs from the fake changes `fake_reaper.lua` in the same PR.
