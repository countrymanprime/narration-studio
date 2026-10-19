# Real Audacity 3.7.7: the foundation tests' first run

**Run 2026-10-19 in a cloud container (Ubuntu 24.04, Xvfb, a PulseAudio null sink, Audacity 3.7.7 from the hash-pinned AppImage), by `tests/audacity3/real/foundation/run.sh`. First hosted-runner run: see [On a GitHub-hosted runner](#on-a-github-hosted-runner).** The tests are A3-T1 to T13, T24 to T29 and T34 of [the capability matrix](audacity-3-capability-matrix.md#test-plan); the suite, its results format and the golden replies are described in [its README](../../tests/audacity3/real/foundation/README.md). All 20 tests passed (about 11 minutes). A row marked KNOWN LIMIT passes while a limit holds. Linux only: the product's Windows pipe and `C:/` paths were not exercised.

## Results

| Test | Result | What it showed |
| --- | --- | --- |
| A3-T1 first start | pass | One start never answered (0 of 5 cycles, 30 s each; the module is recorded as `4`). Stop, status back to `1`, stale FIFOs removed, start again: answered in 1 to 3 s, 5 of 5 |
| A3-T2 command probe | pass | `GetInfo Commands` lists 93 ids and `Menus` 257, and neither holds `Play`, `Stop` or `PlayAtSpeedLooped`, which work. **`ApplyMacro` is not a command** ("was not recognized"); macros are `Macro_<name without spaces>:` (`Macro_FadeEnds`). KNOWN LIMIT: `GetInfo: Type=Preferences` crashes Audacity (no reply, crash reporter) |
| A3-T3 reply shapes | pass | 17 replies byte for byte (golden files): body-less commands answer `\nBatchCommand finished: OK\n\n`, `Message` writes its text first, an unknown command is a message line then `Failed!`, `GetPreference` of an unset key is `\n` then `Failed!`. A command may be sent with no colon. An empty list is `[  ]`. `Import2` of a missing file gets no reply: a dialog holds it |
| A3-T4 modal dialog | pass | `SaveProject2` into a missing folder and `OpenProject2` of the open project: no reply, the 5 s timeout, a poller that reads "may be waiting on a dialog" with one request in flight. Escape or a click on the dialog's corner closes it, and the next command answers at once |
| A3-T5 poller | pass | A label, track, selection or mute change was seen within 0.6 to 0.95 s of a 1 s poll; a killed Audacity reads "not reachable" |
| A3-T6 fingerprint | pass | Selection and cursor leave the hash unchanged; label add, rename, 1 ms move, mute, gain, split, delete and track rename change it; `Amplify` and an envelope point do not (blind spots); `Undo` returned to the first hash |
| A3-T7 time precision | pass | Six significant digits on read (5.12346, 3600.12, 9999.99) in a 10,000 s project; a 0.5 s export is exactly 22,050 frames |
| A3-T8 identity | pass | The stamp label survives save and reopen; the window title is the project's name after a save, and the first track's name before one; a second Audacity process starts, and the pipe then answers for the newer project. `Close` of the last project crashed Audacity once and got no reply once |
| A3-T9 labels at scale | pass | 300 `AddMarker` calls: 61 s (about 200 ms each), the `GetInfo Labels` reply is 10 KB in 41 ms, a re-run adds none, the hard text of pass A5 round trips |
| A3-T10 pickups as labels | pass | 5 open, 2 resolved, 1 reopened (4 open), next and go-to, a hand-edited label read as it stands, positions exact |
| A3-T11 regions | pass | 3 range labels, none on the second run, a moved end keeps the text, each export has its range's length |
| A3-T12 select and go to | pass | One track by name, `Selection` reads `{t,t}`; with the view zoomed in at the start the cursor at 700 s did not scroll the view (50 differing pixels) |
| A3-T13 loop and stop | pass (KNOWN LIMIT) | Neither `PlayAtSpeedLooped` nor the menu's looped play outlived the 4.5 s range: neither looped. `Stop` ends playback, the selection is unchanged, `Message` answers during playback |
| A3-T24 import | pass | `kara_01` is 796.286 s in a 44.1 kHz and a 22.05 kHz project, imported in 1.1 to 1.7 s; the track's own sample rate is not in `GetInfo` |
| A3-T25 macro render | pass | `Macro_Narration-Test:` normalised the import to -6.0 dBFS peak, exported, `RemoveTracks`, and the fingerprint came back equal |
| A3-T26 save | pass | `SaveProject2` to its own path twice and to a new path: no dialog, 90 to 170 ms. `Save` on an unsaved project shows an in-window cloud-or-computer panel (not an X window) that holds the reply until Escape |
| A3-T27 monitor level | pass | `AudioIO/PlaybackVolume` is the playback slider's key: seeded 0.25 it lowered the sink 45 dB at the next start; `SetPreference` in a running Audacity, with or without Reload, changed nothing; an export was byte-identical |
| A3-T28 dialogs | pass | Keys absent: "App updates & usage info" (modal; `Import2` waited behind it, then "Error Importing"). `[Update] UpdateNoticeShown=1` removes it. "Automatic Crash Recovery" comes from `[ActiveProjects]` entries left by an unclean exit (a copied profile must drop them). With both fixed only the project window is open |
| A3-T29 no preview, no reveal | pass | No menu or command plays or reveals a file; `Import2` adds a track |
| A3-T34 crash and stale pipes | pass | After `kill -9` the FIFOs stay; a blocking write-open hangs, a non-blocking one is refused (ENXIO) and the client returns `ErrNotReachable` in 1.2 s; a restart answers in 1.3 s; a second client while the first holds the pipe is answered at once |

## Where Audacity disagrees with the adapter or its fake

| Finding | Evidence | Status |
| --- | --- | --- |
| The client's `ApplyMacro: MacroName=` is not a command | A3-T2, A3-T25 | Open: `macro_render` and `fx_range` cannot work against 3.7.7 until the client sends `Macro_<name>:`. Both stay Experimental |
| `SetTrackAudio` and `SetTrackStatus` ignore `Track` and act on the selected tracks | A3-T6 | Open: the stack steps mute each take track without selecting it first |
| The fake rejected a command with no colon and wrote `[]` for an empty list | A3-T3 goldens | Fixed in `audacitybridgetest`, with `golden_test.go` |
| The fake's `GetInfo Tracks` names the gain `gain`; 3.7.7 writes `volume`, and `pan`, `VZoomMin`, `VZoomMax` | A3-T3 | Open |
| `PlayAtSpeedLooped` does not loop | A3-T13 | Recorded: `navigate` keeps its Experimental level and `Loop` is not shown as working |

## On a GitHub-hosted runner

Run 39215656846 of `real-audacity3-foundation.yml` (Audacity 3.7.7 on `ubuntu-latest`, head `e067efc`): 24 of 25 tests passed, with the same facts as above (one start answered 0 of 5 times, the two-start procedure 5 of 5; the 93-id command list; `PlaybackVolume` honoured only at start; the in-window Save panel; 300 labels added in 39 s). **A3-T34 failed, and the failure was the test's.** It killed Audacity from a goroutine 20 ms after sending, then read `Alive()` and dialled the FIFO without waiting for the kill; `Send` returned after 0 s, so the process was still running and the dial succeeded (`error <nil> after 0s`, `Reachable=true`). The test now waits for the kill to finish before it checks anything. The container run passed because its timing happened to let the kill land first. No Audacity limitation was involved.

## Not exercised

Windows (named pipes, `C:/` paths); a GitHub-hosted runner; Audacity 3.7.8 or later; language other than English; a one-start first launch that works; the lone blank-line reply (no window), which the earlier note saw once and these runs did not reproduce.
