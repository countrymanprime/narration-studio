# REAPER spike S8: a region as the record of a voice sample

**Status: written, not run.** `integrations/reaper/spikes/spike_s8_voice_label.lua` is ready, and syntax-checked and formatted, but it has not been run: it needs a real REAPER, and the container this was written in has none. Every answer in the table below is a **question**, with what the design assumes until the run says otherwise. Do not build on a cell until it carries a result.

Phase 6 of the [character voice samples PRD](../prds/character-voice-samples.prd.md#where-a-sample-is-kept) ([#1963](https://github.com/countrymanprime/narration-utils/issues/1963)) keeps a sample as a REAPER region whose name carries the character and label, and reads it back from the saved project. This spike answers the "DAW region" open question there.

## How to run it

On a Windows machine with REAPER installed ([spike rules](../../integrations/reaper/spikes/README.md#rules)):

```powershell
$out = Join-Path $env:TEMP "narration-s8-$(Get-Date -Format yyyyMMdd-HHmmss)"
python integrations/reaper/spikes/make_media.py "$out\media"
pwsh integrations/reaper/spikes/run-reaper.ps1 -Cfg "$out\cfg" -Out $out -Script integrations/reaper/spikes/spike_s8_voice_label.lua -Done "$out\done.txt"
```

Then paste `voice-label-report.txt` (paths removed) into this page and replace each assumption with the result.

## Questions

| # | Question | The design assumes | Result |
| --- | --- | --- | --- |
| A | What does the saved `.rpp` hold for a region added by `AddProjectMarker2`: two `MARKER` lines with the name, range, colour and a GUID? Do a name with quotes, a pipe, a backslash, non-ASCII text and an emoji read back whole through `tracks.Parse`? Does the GUID survive a re-save? | Two `MARKER` lines, the GUID kept, the name escaped as `tracks.Parse` already reads chapter regions | pending |
| B | Does the live project have the region before the narrator saves, and does the saved file lack it until then? Does `GetProjectStateChangeCount` rise on the add? | Yes to all three, so "not saved in REAPER yet" is the label the host wrote while `DawProjectState.UnsavedChanges` is true | pending |
| C | What does a region do when its item is moved, shortened, ripple-edited or split? | It stays where it is (project time), so the sample's audio is whatever now lies under it; the record keeps the source range so the app can tell "moved" from "same" | pending |
| D | Is the add one undo step, and do Undo and Redo remove and restore the region with its GUID? | One step; the GUID is restored | pending |
| E | Does `SetProjectMarker4` keep the number and the GUID when the name or the bounds change? | Yes, as the chapter regions' update already assumes (`regions` capability) | pending |
| F | For an item with a take offset, and one at another playback rate, does `(region - item position) * rate + D_STARTOFFS` give the source range heard there? | Yes at rate 1; at another rate the formula above, unverified | pending |

## What the answers decide

- **A** fixes how the host finds a sample's region again (by GUID, by name prefix, or by range) and whether the name can carry the label at all.
- **B** fixes the "not saved in REAPER yet" state without a new command.
- **C** decides whether a DAW-kept sample stores its source range beside the region (so a moved region reads `label_moved`) or trusts the region alone.
- **D** and **E** decide whether the new bridge command is one command or add, move and read-back.
- **F** decides whether playing a labelled range from its source is exact or approximate.
