# Audacity 3 capability matrix: what the app needs from a DAW against what Audacity 3 can do

**Researched 2026-10-19. Status: desk research plus the repository's earlier observed run; nothing new was run in Audacity for this note.** Question: for every DAW-dependent action a narrator can trigger in the app, can Audacity 3.x do it natively, through a workaround, or not at all, how does that compare with REAPER today, and which of it can a machine check on a GitHub-hosted runner? The note ends with a prioritised implementation list and an ordered test plan (A3-T1 to A3-T34) for a real Audacity 3 in CI.

## Method

- **Half A, what Audacity 3 can do.** Read the published scripting manual from its GitHub source (`audacity/audacity-manual`, `manual/man/scripting.html` and `scripting_reference.html`, fetched 2026-10-19; `manual.audacityteam.org` itself does not resolve from a cloud container). Read what the repository already holds: [the 4.x and 3.x spec research](audacity-4-scripting-spec.md) (source-level reading of `mod-script-pipe`), [real-Audacity 3 integration testing](real-audacity3-ci-integration.md) (the only run in a real Audacity: 3.7.7, Linux, Xvfb, a PulseAudio null sink), [launcher feasibility](audacity-launcher-feasibility.md), [Audacity 3.x: what the app relies on](../reference/daw/audacity-3.md), the adapter under `src/studio/desktop/internal/dawport/audacity` and [the verification pass](../operations/audacity-verification-pass.md).
- **Half B, what the app needs.** Took the capability catalogue ([capabilities](../reference/daw/capabilities.md), generated [matrix](../reference/daw/matrix.md)), the guides in `docs/guides/using-the-app/` (booth, editing, pickups, proof, production, master-and-qc, navigation, settings, getting-started), the Studio Next mock's DAW selectors (`docs/research/mockups/studio-next/src/selectors/daw.ts`) and REAPER's reference ([REAPER](../reference/daw/reaper.md)). How REAPER was assessed is in [the REAPER spike results](studio-next-daw-spike-results-reaper.md): question, setup, observed, not proved, consequence. The same shape is used for Audacity here.
- **Evidence grades.** Every Audacity statement carries one of three grades:
  - **Observed**: seen in the Audacity 3.7.7 run of [real-Audacity 3 integration testing](real-audacity3-ci-integration.md) (its finding number is given).
  - **Published**: stated by the manual or read in Audacity's source by the [spec research](audacity-4-scripting-spec.md). Not run.
  - **Untested**: an inference from the command list or from how Audacity's menus behave. The test plan exists to turn these into Observed or refuted.
- **Not done.** No Audacity was started for this note, so no row below is newly observed. Windows and macOS behaviour is Published or Untested throughout. The Audacity forum and wiki were not reachable.

## What Audacity 3 can drive

All of it goes through `mod-script-pipe`. The module is shipped with Audacity on Windows and macOS and was present in the Linux AppImage (Published: manual; Observed: finding 4). Anything a menu does can be asked for by its scripting id (Published: manual, "Most commands in Audacity that are in the Audacity menus can be accessed via Scripting"); the exceptions are the ones that open a file dialog or have no id.

### Transport and reply facts the whole matrix rests on

| Fact | Grade | Source |
| --- | --- | --- |
| Pipes: Windows `\\.\pipe\ToSrvPipe` and `\\.\pipe\FromSrvPipe`, line end `\r\n\0`; Linux and macOS `/tmp/audacity_script_pipe.to.<uid>` and `.from.<uid>`, line end `\n` | Published (Windows, macOS, from `pipe_test.py`); Observed (Linux, finding 4) | [spec research](audacity-4-scripting-spec.md#pipes) |
| One client, one project at a time; the pipe serves the active project. No window open: the reply is a lone blank line | Published; Observed for the lone blank line (finding 1) | [manual, Known Issues](https://github.com/audacity/audacity-manual/blob/master/manual/man/scripting.html), [audacity#11471](https://github.com/audacity/audacity/issues/11471) |
| One command per read, at most 1024 bytes; CR and LF in a command are deleted | Published | spec research, "Command intake" |
| A reply is body lines, `BatchCommand finished: OK` or `Failed!`, then an empty line. Commands with no body of their own start the reply with an empty line | Observed (finding 1) | real-Audacity 3 note |
| The terminator text is never localised | Published (source comment "deliberately not localised") | spec research, "Reply framing" |
| No server-side timeout; any modal dialog holds the reply | Published; Observed (finding 5) | real-Audacity 3 note |
| Reply times carry six significant digits | Published (audacity#4220); Observed (finding 6 kept the digit count) | spec research, "GetInfo JSON caveats" |
| The first start on a profile never seen records the module as failed; a stop, a status fix and a second start gave a working pipe | Observed in the container, not on a hosted runner | finding 4 |
| FIFO ends on Linux are removed and recreated after each client disconnect; a write-open with no reader blocks | Observed (finding 4: a write-open failed for 133 s) | finding 4 |
| `GetInfo: Type=Selection` exists since 3.6; there is no play position and no play-state read | Observed (finding 6) | finding 6 |
| Audacity 4.0.x has no scripting pipe | Published (4.0.1 `CHANGELOG.txt`) | [real-Audacity 3 note](real-audacity3-ci-integration.md#audacity-3-against-4) |

### The command surface, grouped by what the app uses it for

Parameter lists are verbatim from the manual's scripting reference unless marked.

| Group | Commands | What they give | What is missing |
| --- | --- | --- | --- |
| Read | `GetInfo: Type=Tracks`, `Clips`, `Labels`, `Selection` (3.6+), `Commands`, `Menus`, `Preferences`, `Boxes`; `Format=JSON`; `Message`; `Help` | Track names, selected flag, start, end, channels, mute, solo, gain, pan; clip start, end, name, colour; labels as nested arrays; the selection; the full command list | Play position, play state, recording state, project name or path, undo history, dirty flag, zoom and scroll, a version string, track ids |
| Selection and cursor | `SelectTime` (Start, End, RelativeTo), `SelectTracks` (Track, TrackCount, Mode), `Select`, `SelectAll`, `SelectNone`, `CursSelStart`, `CursProjectStart`, other `Curs*` | A cursor is a zero-length `SelectTime`; tracks are chosen by 0-based index | No `SetCursor`; no track ids, so tracks are named by index or by name |
| Transport | `Play`, `Stop`, `Pause`, `PlayStop`, `PlayAtSpeedLooped`, `PlayOneSec`, `Record1stChoice` (at the end of the selected tracks), `Record2ndChoice` (new track at the cursor or selection start), `PunchAndRoll`, `TimerRecord` (opens a dialog), `AddLabelPlaying` | Start, stop, loop, record, roll, and a label at the live play or record position | No read of the position or state; `TogglePlayRegion` misbehaves when scripted (audacity#3326); no input-device chooser (a preference) |
| Labels | `AddLabel` (no parameters: labels the selection on the selected label track, or makes a track), `SetLabel` (Label index, Text, Start, End, Selected), `NewLabelTrack`, `ImportLabels` and `ExportLabels` (both open file dialogs) | Point and range labels, edited by index across all label tracks | No delete-label command in the reference (a label goes with `SelectTime` over it and `Delete`, Untested); no label import or export by path |
| Tracks and clips | `NewMonoTrack`, `NewStereoTrack`, `SetTrackStatus` (Name, Selected, Focused), `SetTrackAudio` (Mute, Solo, Gain, Pan), `SetTrackVisuals`, `SetClip` (At, Color, Start), `RemoveTracks`, `Duplicate`, `Join`, `Disjoin`, `SyncLock` | Make, name, mute and remove tracks; move a clip | No clip rename; no per-clip gain; no extension data on anything |
| Edit | `Copy`, `Cut`, `Paste`, `Delete`, `SplitDelete`, `Split`, `Silence`, `Trim`, `Undo`, `Redo` | Every edit the adapter uses | `Undo` has no readable label or depth |
| Effects | `Amplify` (Ratio), `Normalize`, `Fade`, `ClickRemoval` (Threshold, Width), `Compressor`, `SetEnvelope` (Time, Value, Delete), built-in and Nyquist effects by id | Destructive processing of the selection; an envelope on a track | No live, removable, per-range effect; no VST/AU chain control that the reference lists |
| Macros | `Macro_<name>:` ids appear in the manual's table (examples `Macro_FadeEnds`, `Macro_MP3Conversion`); the adapter sends `ApplyMacro: MacroName=...` | Run a saved Macro Manager chain on the selection | A macro's steps cannot be read back; whether `ApplyMacro` or `Macro_<name>` is the working spelling in 3.7.7 is Untested (A3-T20) |
| Project | `Import2` (Filename), `Export2` (Filename, NumChannels), `OpenProject2`, `SaveProject2` (Filename, AddToHistory, Compress), `Save`, `SaveCopy`, `Close`, `New`, `SetProject`, `GetPreference`, `SetPreference` (Reload) | Import audio, export the selected tracks' selection, open and save by path, read and set preferences | `Export2` writes only selected tracks and takes its format options from saved preferences (Observed, finding 2; Published, manual); `SetProject` with a size crashed Audacity once (finding 8) |
| Not scriptable, as far as the reference shows | `ExportMultiple`, Nyquist prompt output, plug-in dialogs without applying, Audio Setup (device choice) | | Untested whether a menu id exists for Export Multiple: `scripting_reference.html` has none |

**Not available through scripting at all (the short list):** play position and play state; recording state; project path, name and dirty flag; undo history; any identity for a track, clip or label other than its index and its text; live, removable effects; takes and lanes; per-item metadata; an "open this file in the viewer without importing it" action; a version string.

**Nyquist** (a built-in LISP; `;type tool` plugins can run from the Tools menu) can compute on the selected audio and, in a tool script, drive menu commands. It cannot reach a clock or the transport either, and the app has no need of it that macros and `Amplify` do not cover, so it is not used in the matrix. **Macros** are fixed command chains, run on the selection by name.

## What the app needs from a DAW

Derived from the capability catalogue, the guides and the mock. Each row below is an interaction a narrator can cause, on the page named. "REAPER" is the level the adapter declares today ([matrix](../reference/daw/matrix.md)); every REAPER capability that is Experimental is off until the narrator turns it on, and none has been through the owner's pass.

| # | Interaction | Pages | Capability |
| --- | --- | --- | --- |
| N1 | Link a project, unlink it, know which project the DAW has open | Settings, engine panel, header chip | `heartbeat`, `project_read`, `project_state` |
| N2 | Launch the DAW on the linked project; connect or reconnect | Settings, Production, Booth | (launcher) |
| N3 | Heartbeat: is it answering, which project, any changes since the last save, change count | header chip, Booth chip, Proof "as of last save" | `heartbeat`, `project_state` |
| N4 | Read the saved project offline (tracks, items, chapter links) | engine panel, Production, Proof, Editing | `project_read` |
| N5 | Read a track's items, selection, arm state and the transport | Production, Booth, Editing | `track_state` |
| N6 | Select a chapter's track; follow the narrator's track and cursor; take the DAW to a chapter and word | Production, Booth, Editing | `track_select`, `follow_position` |
| N7 | Link chapters to tracks (stamp identity); read the stamps | engine panel | `line_identity` |
| N8 | Review: compare a recording with the manuscript, mark findings, jump to a finding | Proof | `review`, `markers`, `navigate` |
| N9 | Add one marker for an accepted note; go to a note and loop around it; stop the loop | Proof, Editing | `markers`, `navigate` |
| N10 | Pickups: import, export, next, resolve, reopen, count, list markers | Pickups, Booth companion | `pickups` |
| N11 | Create chapter and credits regions | engine panel | `regions` |
| N12 | Arm a track, record, stop, learn when the narrator stopped it in the DAW | Booth | `record` |
| N13 | Punch in (cursor a pre-roll before a word); read the play position; roll | Booth | `punch` |
| N14 | Follow the DAW's play position in the read-along | Editing, Booth | `heartbeat`, `punch` |
| N15 | Monitor level, input level | Booth | `monitor_level`, `input_level` |
| N16 | Takes: make a take, set the active take, hide the others, pick a retake lane, cut a take in two | Editing, Proof | `take_create`, `takes`, `retake_lanes` |
| N17 | Stack the later reads of a passage on the first read; move them back | Editing | `stack_takes` |
| N18 | Cut a range of words with their audio (close or gap, pad, fade, room tone); trim a gap | Editing, Proof | `cut_range` |
| N19 | Put an FX chain on a range of words; take it off; read, change and bypass it; A/B it | Editing | `fx_chains`, `fx_range` |
| N20 | Lower stretches (breaths, plosives, noise); repair clicks | Proof, Editing (Clean up) | `range_gain`, `click_repair` |
| N21 | Level-match items | Editing | `item_gain` |
| N22 | Open a cleanup dialog on the selected items | Proof | `cleanup_tools` |
| N23 | Undo the app's own last cut in the DAW | Editing | `undo_last` |
| N24 | Backups before a destructive edit; restore | Editing (Backups tab) | `backups` |
| N25 | Configure chapter render; render chapters; render through the project's FX; read the master chain; render through a macro | engine panel, Delivery, Master & QC | `render_config`, `render_with_fx`, `master_chain_read`, `macro_render` |
| N26 | Play a stretch of a file on disk without touching the project; show a file in the DAW | Master & QC | `file_preview`, `file_reveal` |
| N27 | Save the project so "as of last save" is current | Proof, Production | (save) |

## The matrix

Columns:

- **REAPER**: the declared level today (S Supported, E Experimental, N Not yet available, U Unsupported).
- **Audacity 3**: **Native** (one or a short fixed run of scripting commands does what the capability's section says), **Workaround** (reachable only through something the app adds: labels as records, track mutes, a backup, an app-side clock), **Cannot** (no route). The adapter's current level is in brackets where it has one.
- **Commands / workaround**: the exact scripting commands, or the construction.
- **Risk**: what could make the row fail, with its evidence grade.
- **CI**: **Hosted** is `real-audacity3.yml` on `ubuntu-24.04` (Xvfb, PulseAudio null sink, no hardware), **Hosted Win** is a `windows-latest` job (named pipes, no audio device), **Owner** needs a person, a real device, an ear or an installed Windows desktop. Test ids are in the plan below.
- **Fallback**: what the app does when the row fails or cannot be had. The rule from [Definition of done](../../.claude/rules/definition-of-done.md), "Talking to an integration", applies to all of them: a control that cannot work is off with the reason in the DAW's own words, an unknown answer is never shown as fact, and nothing is sent that the resolver refused.

### Connection and project

| # | REAPER | Audacity 3 | Commands / workaround | Risk | CI | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| N1 link | S (`project_read`, `heartbeat`) | **Workaround** [N] | The app links a file it chose: it launches Audacity on that `.aup3` path (command-line argument, Untested), and writes one label `[nu:project <id>]` on the "Narration Studio" label track. "Matches" is that label being present in `GetInfo: Type=Labels`. The window title carries the project name after `SaveProject2` (Observed, finding 8) and is a Linux side channel only. Scripting has no path or name read. | A narrator who deletes the label, or opens another project without the label, reads as "different project". Two projects open: the pipe serves one, which is Untested. An unsaved project has no file. | Hosted (T8); Owner for the Windows launch argument | "Not linked" chip with the cause; offer Link again, which re-stamps. Never claim "Linked" without the label. |
| N2 launch | S | **Workaround** | App starts `Audacity.exe <project>`; first start needs the module enabled, which the narrator does in Preferences, Modules, then a restart (Published). On a fresh profile the first start marks the module failed (Observed in the container, finding 4); the second start works. The app can pre-seed `audacity.cfg` only with the narrator's consent (it edits another program's config: threat model). | First-start trap on a hosted runner not yet shown (Not proven in the CI note). Welcome and update dialogs hold the pipe (finding 5). | Hosted (T1, T28); Owner (real first run on Windows) | A setup box with the exact steps and "Last checked N s ago", as the REAPER box does; the Audacity chip reads "Scripting is off" not "Not running" when Audacity runs but the pipe is absent. |
| N3a heartbeat reachable | S | **Native** [N] | `Message: Text=...` echo every 1 s while no other request runs (the client serialises). Lone blank line: no project open. Timeout: a modal dialog may be open. Pipe absent: not running or module off. | Round trip 16 to 60 ms (Observed, finding 8). Stale FIFO after a crash: a write-open can block; the Go client must dial with a deadline (finding 4). | Hosted (T3, T4, T5, T34); Hosted Win (T30) | The chip says "can't tell, last heard N s ago" on timeout, "No project open" on the blank line, and keeps the last good value greyed. |
| N3b change count / unsaved changes | S | **Workaround** [N] | No dirty flag, no change counter. Fingerprint = hash of `GetInfo` Tracks (without `selected` and `focused`), Clips and Labels. A change count is the number of fingerprint changes since the first read; "unsaved" is the fingerprint differing from the one taken right after the app's own `SaveProject2`. | Edits that change nothing in those three reads (a plug-in setting? an envelope point?) are invisible; selection keys must be excluded or every click counts. Six-digit times may hide a sub-millisecond move. | Hosted (T6) | `unsavedChanges` null (unknown) rather than false; Proof's "as of last save" note says "Audacity does not report unsaved changes", never "no changes". |
| N3c transport state / play position | S (`heartbeat` carries it) | **Cannot** (no read; `PlayPosition` stays `ErrNotAvailable`, Observed finding 6) | Workaround for the Booth only: the app starts every record and play itself, so it keeps its own state and a wall clock from the reply to `Record1stChoice`/`Play`. `AddLabelPlaying` labels the true live position. | The app's clock drifts against the device clock and cannot see a transport started or stopped in Audacity. | Hosted measures the drift (T14, T15); Owner by ear (T31) | `playState` reads "unknown" when the app did not start it. Read-along follows the app's own clock only while the app started the take; otherwise it does not move and says why. |
| N4 project_read (offline) | S (`.rpp` parsed in Go) | **Cannot** natively; **Workaround** | `.aup3` is a SQLite file the app does not parse (Untested). Workaround: whenever the app saves or exports, it writes `narration-studio/audacity-snapshot.json` (tracks, clips, labels from `GetInfo`) and the exported chapter WAVs; offline reads use the snapshot. | The snapshot is only as fresh as the last time Audacity was running and answering. | Hosted (T8, T24) | Pages that read the saved project say "as of the last time Audacity was connected, <date>"; with no snapshot the page offers the standalone path (import audio files) instead of tracks. |
| N5 track_state | E | **Native** [N] | `GetInfo: Type=Tracks` (name, selected, start, end, channels, mute, solo, gain) and `Type=Clips` (track index, start, end, name, colour). Items = clips, at most 1000. No arm flag, no record input: Audacity has no arming; "armed" = the track is selected. | A clip has no id: identity is (track index, start). Track names are not unique; indices shift when a track is removed. | Hosted (T6, T8) | Item ids are synthesised (`track name`, `start`) and re-read before every edit; a mismatch is `stale`. |
| N6a select track | E | **Native** [N] | `SelectTracks: Track=<i> TrackCount=1 Mode=Set` after re-reading `Tracks` to find the index by name. | Name collisions (two chapters with one name); the link must be by name plus a stamped label. | Hosted (T12) | Refuse as `stale` when the name is gone or ambiguous. |
| N6b follow position (read place) | E | **Native** [N] | Selected track from `Tracks` `selected`; cursor from `GetInfo: Type=Selection` (Start, End; Start == End is a cursor). | Selection and cursor are one thing: a range selected by the narrator reads as "cursor at Start". Six digits. | Hosted (T12) | `ReadPlace` returns the track empty when none or several are selected (as the role says) and the cursor at Start. |
| N6c go to chapter, word | E | **Native** [N] | `SelectTracks` then `SelectTime: Start=t End=t RelativeTo=ProjectStart` (end of track: the last clip's end from `Clips`). | The view may not scroll to the cursor (Untested: a Linux screenshot decides). | Hosted (T12) | If the view does not follow, the sentence says "Moved the cursor in Audacity" and does not claim it is on screen. |
| N7 line identity (stamp, read) | S | **Workaround** [N] | No extension data. Stamp = a range label `[nu:line <id>]` on the "Narration Studio" label track spanning the read; read = `GetInfo: Type=Labels`. | Labels move with audio only when Sync-Lock is on (`SyncLock` exists; the default is off in 3.x, Untested). A narrator's manual cut shifts audio under labels that did not follow. Duplicate or paste does not copy labels. | Hosted (T18, T11) | Identity carries a drift check: if the label's range no longer lies inside a clip, the stamp reads "stale" and the page offers Re-stamp; never silently trusted. |

### Review, navigate, markers, pickups, regions

| # | REAPER | Audacity 3 | Commands / workaround | Risk | CI | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| N8 review (prepare, inspect, export markers, jump) | S | **Workaround** [N: "not available yet"] | Prepare: the app exports each chapter's audio (`SelectTracks`, `SelectTime`, `Export2` to the project folder) and builds the manifest itself; the compare runs on the exported WAV. Export markers = `AddLabel`+`SetLabel` per finding (as `markers`); inspect = `GetInfo: Type=Labels`; jump = N9. | `Export2` only writes selected tracks (finding 2, fixed in `ExportChapter`). A recorded take is the track's audio at export time, so a later edit invalidates the manifest (compare the fingerprint). | Hosted (T23, T24, T9) | Review button reads "needs the exported audio"; if export fails, the page keeps the old result marked stale. |
| N9a add marker | S | **Native** [E] | `SelectNone`, `SelectTime`, `AddLabel`, `GetInfo: Labels` (find the new empty label), `SetLabel: Label=<i> Text="..."`; skips a same-text label within 0.15 s. Text rules: no `"`, no backslash, no control characters (the encoder refuses). | Label found by text, not by time (six digits). 300 labels in one reply is Untested (T9). | Hosted (T9) | Marker refused with the sentence naming the text rule. |
| N9b go to / loop / stop loop | S | **Native** [E] | `Navigate`: `Stop`, `SelectTime`. `Loop`: `SelectTime` then `PlayAtSpeedLooped`. `StopLoop`: `Stop` (restores nothing: Audacity keeps no loop state). | Whether the loop is audible and at normal pitch is by ear; a loop request while recording must be refused (no recording-state read, so the app uses its own). | Hosted for command order and sink activity (T13); Owner for pitch (T31) | A finding that names an item is refused (Audacity has none) and the app goes to the time instead. |
| N10 pickups | S (all six commands) | **Workaround** (labels) [N] | A pickup is a label `[nu:pickup open] <line>` / `[nu:pickup done] <line>` on the "Narration Studio" track. Import: add missing; resolve and reopen: `SetLabel` the prefix; next: smallest open label time then N9b; count and list: `GetInfo: Labels`; export: written by the app from the read. | Same prefix rule as markers; only labels carrying the app's prefix are edited; a label the narrator edits by hand is read as it stands. Labels have no colour. | Hosted (T10) | "Not in the DAW yet" state exists already in the guide: the app keeps the change and writes the label on the next successful read. |
| N11 regions | S (`create_regions`) | **Workaround** [N] | Range labels: `SelectTime Start End` then `AddLabel`, `SetLabel`; update with `SetLabel: Label=<i> Start= End=`. Chapter render can later use them as export ranges. | A region is a label, so it is not a render target in Audacity (no region render). | Hosted (T11) | Counts as REAPER (created, existing, updated, invalid); ambiguous when two labels share text. |

### Recording and transport

| # | REAPER | Audacity 3 | Commands / workaround | Risk | CI | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| N12a arm only | E | **Workaround** [N] | Audacity has no arm. The Booth selects the chapter's track alone (`SelectTracks Mode=Set`), which is the target of `Record1stChoice`. | None beyond N6a. | Hosted (T12) | Message "ARMED" is replaced by "Track selected". |
| N12b record start / stop | E | **Native** [N] | `Stop` (if the app believes it is playing), `SelectTracks`, `SelectTime` at the track end, `Record1stChoice` (records at the end of the selected track); `Stop` ends it. Device and rate come from Audacity's preferences, not from the command. | The sample-rate modal: `Record1stChoice` raised "Too few tracks are selected for recording at this sample rate" with a 22.05 kHz track in a 44.1 kHz project (Observed, finding 5). Recording needs a clocked input (Observed, finding 7: ALSA `null` ran 3 s as 10,767 s; a Pulse null sink is paced). On Windows the hosted runner has no device. | Hosted (T14); Owner with a real device (T31) | If the reply times out within 5 s of `Record1stChoice` the Booth shows "Audacity may be showing a dialog" and does not claim recording; Record stays off while the sample rate of the track and project differ (read from `GetInfo` and `GetPreference`). |
| N12c recording ended in the DAW | E (`RECORD_ENDED`) | **Cannot** natively; **Workaround** (poll) | Poll `GetInfo: Type=Tracks`: whether `end` of the recording track moves while recording, and stops moving after a narrator stop, is Untested. | If the track end only updates on stop, the app cannot see a stop made in Audacity until the next read after it. | Hosted (T15) | The Booth treats "no growth for 3 polls" as "stopped (inferred)" and says so; Stop in the app is always authoritative. |
| N13a punch in | E | **Native** [N: "not available yet"] | `SelectTime: Start=max(0, t-preroll) End=same`. | Same as N6c. | Hosted (T12) | Pre-roll applies to the cursor only. |
| N13b roll | E (`native`, non-destructive) | **Native but destructive without a backup** [E, requires `backups`] | `Stop`, backup (clone of the track from the roll point), `SelectTracks`, `SelectTime` at the roll point, `PunchAndRoll`. Pre-roll length is a preference (Untested which key). | Where `PunchAndRoll` leaves the earlier audio, how many undo points it adds, the pre-roll preference name and the sample-rate modal are all Untested (Part C, C6, never run). | Hosted for the effect on audio (T16); Owner for undo history by eye (T31) | With backups unavailable the page asks first ("This will replace the audio from here on. Confirm to continue."); with the roll refused the Booth offers Record again from the end. |
| N14 play position / follow | E | **Cannot** (no read); **Workaround** | As N3c. For a marker taken while recording, `AddLabelPlaying` places a label at the live position without the app knowing it. | Clock drift. | Hosted measures (T14) | Read-along does not follow Audacity's transport; the lit word moves only for the app's own playback. |
| N15a monitor level | E | **Workaround** (Untested) [N] | The playback gain is a preference/slider, not a track gain; `GetPreference`/`SetPreference` with the right name and `Reload`. Track gain (`SetTrackAudio: Gain`) must not be used: Export applies it and the delivery file would change. | The preference name is not in the reference; unknown whether a running Audacity honours the change without a reload. | Hosted (T27) | Slider off with "Audacity cannot set the monitoring level from here. Use its playback slider." until T27 passes. |
| N15b input level | U | **Cannot** [U] | Same as REAPER: set in the interface's control panel. | n/a | none | Declared Unsupported on both; sentence already written. |

### Takes, stacking, cuts, effects

Audacity keeps no takes, items or FX on a range; the app's design is that these exist only with `backups` on ([Audacity 3.x](../reference/daw/audacity-3.md#what-needs-backups), PRD decision DQ-18). The rows state what each costs.

| # | REAPER | Audacity 3 | Commands / workaround | Risk | CI | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| N16a take_create | S | **Workaround** [N] | A take is a muted track: `NewMonoTrack`/`NewStereoTrack`, `SetTrackStatus: Name=...`, `Copy` the read, `Paste` at the spot, `SetTrackAudio: Mute=1`. This is the stack's take track. | `Paste` position and rate rules (Untested, C4). Track names are the only identity. | Hosted (T19) | "Keeping takes needs Audacity backups. Turn on Audio backups in Settings." |
| N16b set active take | E | **Workaround** [N] | Swap `SetTrackAudio: Mute` between the chapter track and the take track named by id. | A narrator's own mute changes read as a different active take. | Hosted (T19) | Refuse with the take's name when the tracks are gone. |
| N16c hide others | E | **Native** (a mute) [N] | `SetTrackAudio: Mute=1` on each other take track. | As above. | Hosted (T19) | as N16b |
| N16d retake lanes | E | **Cannot** | Audacity has no lanes. The take tracks of N16a are the nearest thing; there is no lane value to set. | None: absent by design. | none | Capability stays Not yet available / hidden; the review page hides lane controls for an Audacity launch (already the rule). |
| N16e split a take in two | E | **Cannot** natively | Would be `Split` plus `Duplicate`/`Paste` into a take track; not built, high undo cost. | Untested. | Hosted if built | Refused: "Audacity cannot cut a take in two." |
| N17 stack / unstack | E (`native`) | **Workaround** [E, steps] | The five steps and undo counts in [Audacity 3.x](../reference/daw/audacity-3.md#edits-made-in-steps); at most three later reads per call. | `Paste` into a gap may or may not move the clips after it; `Delete` close-up; undo counts per macro. All Untested (C4, C5). | Hosted (T19) | Refuse without backups; never half-apply: every check precedes the backup, the backup precedes the first edit. |
| N18 cut range | E (`native`) | **Workaround** [E, steps] | Backup; `SelectTracks`; `SelectTime`; `SplitDelete` (gap) or `SplitDelete` then `Delete` (close). Pad is taken off the range by the app. Cuts track is the backup track. No fade, no room tone. | Does `Delete` close the gap and shift labels after it (Sync-Lock)? Untested (C1, C2). Labels after the cut drift if not (N7). | Hosted (T18) | Room tone refused with the existing sentence; fade ignored and said so. |
| N19a FX on a range, remove | E (`native`, take FX) | **Workaround** [E] | Backup; `Split` at both ends; `ApplyMacro: MacroName=<name>` on the middle piece. Remove: refused, points to the backup. Read, change, bypass, compare: refused (the effect is baked in). | `ApplyMacro` vs `Macro_<name>` spelling (T20); a macro that exports or opens a dialog. | Hosted (T20) | The Editing page shows chains as "Macros" for an Audacity project and the inspector's live controls are hidden with the reason. |
| N19b list FX chains | E | **Workaround** | List macros: read the profile's `Macros` folder, or the `Macro_` entries of `GetInfo: Type=Commands` (Untested which works). Plug-ins (VST, AU) are not listed. | The data folder path differs by OS and by portable mode. | Hosted (T20) | Empty list with "Create a macro in Tools, Macro Manager" in the box. |
| N20a range_gain | E | **Workaround** [E, with backups] | `SelectTracks`, `SelectTime`, `Amplify: Ratio=10^(-dB/20)` per stretch. Alternative to test: `SetEnvelope: Time= Value=` on the track for a non-destructive ramp. | `Amplify` has no edge ramp and clicks at the joins; the envelope route is Untested. | Hosted (T21) | Needs backups; otherwise refused with the standard sentence. |
| N20b click_repair | E | **Workaround** [E, with backups] | `SelectTime` 0.1 s either side, `ClickRemoval` (Threshold 200, Width 20 defaults). | It repairs any click in the window, not the one named. | Hosted (T21) | As N20a. |
| N21 item_gain | E | **Cannot** per item; **Workaround** destructive | No clip gain in scripting. `Amplify` on the clip's range after a backup; `SetTrackAudio: Gain` is a track-wide gain that Export applies. | Level matching on a track-gain basis alters the whole chapter. | Hosted (T21) | Not offered; the Level-match page says "Audacity changes the audio itself; back up first". |
| N22 cleanup_tools (open a dialog) | E | **Cannot** | A scripted effect runs; there is no command that opens its dialog without applying. | Untested whether a command with no parameters opens the dialog. | Hosted (T2: list `Commands`) | Button hidden. |
| N23 undo_last | E | **Workaround** [N] | `Undo`. The app cannot read the top label. Guard: take the fingerprint after the app's own edit; allow `Undo` only while the current fingerprint equals it, then require the fingerprint to equal the one from before the edit. | Selection changes are excluded from the fingerprint, but a narrator's edit that leaves it unchanged is invisible. | Hosted (T22) | `LastAction` answers `unknown`; the button is off and the backup is offered. |
| N24 backups | N | **Native-ish** [E] | The commands in [Audacity 3.x](../reference/daw/audacity-3.md#backups) (`Copy`, `NewMonoTrack`, `SetTrackStatus`, `Paste`, `SetTrackAudio: Mute=1`) and `backups.json`. | Paste starts where the cursor is, not at 0 (Untested); a deleted or renamed backup track is unrestorable (reported). | Hosted (T17) | If a backup fails the edit stops. |

### Render, files, save

| # | REAPER | Audacity 3 | Commands / workaround | Risk | CI | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| N25a render_config | S | **Workaround** (the app's plan) | There is no render setup in Audacity. The app keeps the plan (folder, one file per chapter, names) and executes it at render time. | n/a | Hosted (T23) | "Prepare chapter render" becomes "Plan chapter files"; it reports what will be written and writes nothing. |
| N25b render a chapter | S (a REAPER render) | **Native** | `SelectNone`, `SelectTracks` (the chapter's audio track, then the others off), `SelectTime` of the range, `Export2: Filename=<abs path> NumChannels=<1|2>`. Format options come from saved preferences. WAV, FLAC, MP3, OGG, AIFF accepted; LAME is bundled in the AppImage (Observed, finding 8). | `Export2` writes only the selected tracks (Observed, finding 2); the bit depth and sample rate are the last-saved preferences, not an argument (Published; Untested whether `SetPreference` fixes it); export resamples to the project rate (finding 8). | Hosted (T23); Owner for Windows paths (T30) | If the exported WAV has no samples the render is reported failed and the file removed (the A6 bug class). |
| N25c render_with_fx / master_chain_read | E | **Cannot** (read) / **Workaround** (render) | The master chain cannot be read: macro steps are not readable, so the approval sheet lists only "the macro `<name>`". Render with the project's FX is not applicable (no live FX); the mastering row uses `macro_render`. | n/a | none | Capability not offered for Audacity; the approval row shows the macro name. |
| N25d macro_render | U (no macro manager) | **Native** [E] | `Import2` the rendered WAV, `SelectTracks` only that track, `SelectAll`/`SelectTime`, `ApplyMacro: MacroName=<name>`, `Export2`, `RemoveTracks`. | The project must come back unchanged (fingerprint check); a macro that opens a dialog hangs the pipe; the exported format comes from preferences. | Hosted (T25) | Fingerprint mismatch after the run: report and offer Undo through N23 guard. |
| N26a file_preview | E | **Cannot** | `Import2` adds tracks; there is no play-a-file command and a second project cannot be driven (one project at a time). | n/a | Hosted (T29: confirm by `Commands` list) | The app plays the stretch through its own audio output (as with the built-in recorder) and says "Played in the app". |
| N26b file_reveal | E | **Cannot** | None; `Import2` changes the project. | n/a | Hosted (T29) | Offer the operating system's file manager instead and say so. |
| N27 save | n/a (the project is the narrator's) | **Native** | `SaveProject2: Filename=<abs path>` on a project that already has the path; for a never-saved project, `Save:` shows a dialog (Untested) so the app asks the narrator to save. | `SaveProject2` into a missing folder raised a modal (Observed, finding 5); `OpenProject2` of an open project raised a modal. | Hosted (T26) | If the project is unsaved the app says "Save the project in Audacity first" and stays on the last snapshot. |

## Findings that change the design

1. **Audacity 3 does most of the file and label work and none of the live-state work.** Import, export, labels, selection, selection of tracks, mute, record start/stop and the edit set are all scriptable. Transport state, play position, recording state, dirty flag, undo history, project identity and any id are not. Every row that needs one of those is a Workaround or Cannot above, and each workaround is either a label the app owns or a fingerprint the app computes.
2. **Labels are the record-keeping medium.** Project link, line identity, pickups, regions and markers all become labels on one label track named "Narration Studio". That makes them visible to the narrator in Audacity, undoable with `Undo`, and cheap, but it ties all of them to one rule set (prefixes, text sanitising, six-digit times, Sync-Lock drift). A test class for label drift (T18) protects all five.
3. **A fingerprint stands in for the missing change counter.** Hash `GetInfo` Tracks (minus `selected`/`focused`), Clips and Labels. It gives the heartbeat a change count, "as of last save", and the Undo guard. Whether it is stable and sensitive enough is T6.
4. **Modal dialogs are the dominant failure mode and are not rare** (finding 5): first-run, welcome, a bad save path, a sample-rate mismatch at record, crash recovery. The client's 5 s timeout is the only detector; the app must show "Audacity may be waiting on a dialog" and refuse to queue further commands behind it.
5. **The first start is a trap and the second start works** (finding 4). It is a setup-box concern for the narrator and a CI concern for the runner (T1).
6. **Six significant digits** make time resolution 1 ms below 1000 s, 10 ms from 1000 to 9999 s and 0.1 s from 10,000 s (Published). Chapters in the fixture run 796 s; a long chapter does not break matching by text, but anything that matches by time does. T7 measures it.
7. **There is no Linux or macOS adapter path yet** (finding 3: `Command.Path` and `PipeTransport`). The product is Windows; CI is Linux. A platform seam and a FIFO transport are the first implementation item.

## Prioritised implementation list

Ordered by what unblocks the most pages per unit of work, and by what a hosted run can then prove.

1. **Platform seam and a safe FIFO transport** (finding 3, T34): path rule by platform, a FIFO `Transport` that dials with a deadline, `ExportChapter` free of `filepath.IsAbs`. Unblocks every hosted test below. Lane B.
2. **Heartbeat, fingerprint and state reads** (N3a, N3b, N5, N6b): a 1 s poller with the states "answering", "no project", "may be waiting on a dialog", "not reachable", and a fingerprint-based change count. Gives the header chip, the Booth chip and Proof's "as of last save" an honest answer. Lane B, then A.
3. **Project identity by label and launch** (N1, N2): the `[nu:project <id>]` label, a launch with the project path, a setup box for the module. Gives Settings, the engine panel and the chip something to link to.
4. **Track select, follow position, go to** (N6, N13a): all Native and small. Gives Production's "Select in the DAW", the Booth's "open where the narrator is", and Editing's "Show in the DAW".
5. **Record, stop, punch-in and `AddLabelPlaying` marker** (N12, N13a, N14): the Booth works with Audacity. Includes the sample-rate guard and the dialog timeout state. The record-ended inference waits for T15.
6. **Labels as records: pickups, regions, line identity, review markers** (N7, N8, N10, N11): one label service with the prefix rules and a drift check. Gives Pickups and Proof and the engine panel's chapter links.
7. **Edits in steps, verified** (N17, N18, N19a, N20, N24): the code exists; the work is the test plan (T16 to T21) and fixing what it shows, then Part C of the owner's pass.
8. **Render and macro render** (N25): the chapter export with the selected-track rule, the plan-only "render config", `macro_render` with a fingerprint check.
9. **Monitor level, undo guard, offline snapshot** (N15a, N23, N4): each depends on a Untested fact (T27, T22, T8).
10. **Fallbacks for what cannot be done** (N16d, N16e, N21, N22, N26): hide or refuse with sentences; the file-preview fallback plays through the app's own audio.

What is not on the list: retake lanes, cutting a take in two, live FX on a range, the master chain read, input level. Audacity has no route to them; the capability stays Not yet available or Unsupported and the page says so.

## Test plan

Run against Audacity 3.7.7 (the pin in `scripts/research/real-audacity3-ci/run.sh`; SHA-256 `45c4445f…01ef0`) with `.github/workflows/real-audacity3.yml` on `ubuntu-24.04`, Xvfb, PulseAudio null sink, the `kara_01` LibriVox fixture where audio is needed and generated tones where a known signal is better. "Hosted" tests run in that job (extended with the new modes); "Hosted Win" needs the Windows job of phase 4 of the CI note; "Owner" tests cannot run on a hosted runner and go on the owner's pass. Each test records the Audacity version, the runner image and a pass, fail or skip line per step. A failure that disagrees with the fake corrects `audacitybridgetest` first, as the pass already requires. A green run is evidence, not a promotion: every Audacity capability stays Experimental until the owner's pass.

Every test starts from a fresh profile and project unless it says so. Dialog hygiene (T28) applies to all: after each step the harness lists windows with `xdotool`; any window other than the project is a failure that names its title.

### Foundation

**A3-T1 First start and the module (Hosted).** Steps: fresh `HOME`; seed `audacity.cfg` with the module enabled; start Audacity; for 30 s send `Message` once a second; record whether any echo arrives. Stop it; set the module status to enabled in the config; start again; send `Message`. Repeat the whole cycle five times. Expected: the second start answers within 5 s every time. Record the one-start outcome (all four earlier attempts failed). If the one-start succeeds on a hosted runner, record it and keep the two-start procedure anyway.

**A3-T2 Version and command probe (Hosted).** Steps: `GetInfo: Type=Commands Format=JSON`; check for these ids: `Message`, `GetInfo`, `SelectTime`, `SelectTracks`, `AddLabel`, `AddLabelPlaying`, `SetLabel`, `Record1stChoice`, `Record2ndChoice`, `PunchAndRoll`, `PlayAtSpeedLooped`, `Import2`, `Export2`, `SaveProject2`, `OpenProject2`, `ApplyMacro`, `SetEnvelope`, `Amplify`, `ClickRemoval`, `SplitDelete`, `SyncLock`, and any `Macro_` entries; `GetInfo: Type=Selection`; `Help: Command=ApplyMacro`. Expected: every id the adapter sends exists; the result lists the ids that do not and the `Macro_`/`ApplyMacro` spelling that is present. This is the version probe the app can use, since there is no version string.

**A3-T3 Reply shapes (Hosted).** Steps: send 14 commands (`Message`, `GetInfo` four types, `SelectTime`, `SelectNone`, `AddLabel`, `SetLabel`, `Undo`, `Play`, `Stop`, `SaveProject2`, `Import2`) and capture the raw bytes of each reply. With the Welcome dialog open and no project, send `Message`. Expected: each reply matches the shapes in finding 1; the no-project reply is a lone blank line; the client returns `ErrNoProject` only for that. Keep the raw bytes as golden files for the fake.

**A3-T4 Modal dialog handling (Hosted).** Steps: `SaveProject2` into a folder that does not exist; wait; measure the client's timeout and the state the poller reports; dismiss with `xdotool` clicking the dialog's button (never `Return`); send `Message`. Repeat for `OpenProject2` of the open project. Expected: timeout at 5 s ±0.5; the state reads "may be waiting on a dialog"; no later request is queued behind it; after the dismiss the first command on a new connection is answered at once; the screenshot artifact shows the dialog.

**A3-T5 Heartbeat poller (Hosted).** Steps: run the poller (1 s `Message`, `GetInfo` Tracks and Labels diff, `Selection`) for 60 s while a script changes a label with `SetLabel`, adds a track, changes the selection, and mutes a track. Expected: each change is seen within two polls; CPU of the harness stays low; no request is sent while another is in flight; a closed pipe is "not reachable", not an error loop.

**A3-T6 Fingerprint (Hosted).** Steps: import a tone; take F0 = hash(Tracks minus `selected`/`focused`, Clips, Labels). Perform, one at a time, and take the fingerprint after each: change selection; move the cursor; add a label; rename a label; move a label by 1 ms; mute a track; change track gain; split a clip; delete 1 s; apply `Amplify`; add an envelope point; change a track name; `Undo` each edit. Expected: selection and cursor steps leave F unchanged; every other step changes it; `Undo` returns each to the earlier F. Record which edits do not change F (these are the blind spots written into the note).

**A3-T7 Time precision (Hosted).** Steps: generate a 10,000 s silent WAV plus a tone at 3600 s; import; `AddLabel` at 3600.123, 9999.987 and 5.123456; read them with `GetInfo: Labels`; `SelectTime` 3600.5 to 3601.0 and read `Selection`; export that selection and measure its length with `ffprobe`. Expected: reads show six significant digits (3600.12, 9999.99, 5.12346); the exported length is 0.5 s ±1 sample; `SelectTime` accepts more digits than `GetInfo` shows. Writes down the resolution as a function of project time.

### Identity, labels, pickups, regions

**A3-T8 Project identity (Hosted).** Steps: stamp `[nu:project abc]` on a "Narration Studio" label track; `SaveProject2` to `a.aup3`; read the window title with `xdotool`; `Close`, start Audacity on `a.aup3` via the command line, read Labels; then start a second Audacity process on `b.aup3` and send `GetInfo` to find which project answers. Expected: the label survives save and reopen; the title equals `a`; the command line opens the project; the two-project case is recorded (which project answers, whether a second instance starts at all).

**A3-T9 Labels at scale (Hosted).** Steps: 300 markers through the adapter's `AddMarker`; time it; `GetInfo: Labels` and measure the reply size and time; re-run the import and assert 0 added; round-trip the hardest accepted text (pass A5's `’ ‘ — “ ” ∖ é % & < > { } ' =`). Expected: all 300 present; text round trips unchanged; the idempotent run adds none; reply under the reader's buffer; per-label cost recorded. If the count of labels slows `AddLabel`, a batch limit is added.

**A3-T10 Pickups as labels (Hosted).** Steps: import 5 open pickups; resolve two with `SetLabel` prefix change; reopen one; count; next; list; hand-edit one label text with `SetLabel`, then list. Expected: counts 3 open then 2 then 3; only labels with the app's prefix change; the edited label is read as it stands and not overwritten; positions within 1 ms.

**A3-T11 Regions as range labels (Hosted).** Steps: create 3 chapter ranges with `SelectTime` + `AddLabel` + `SetLabel`; send the same list again; move one end with `SetLabel Start End`; export each range with `Export2`. Expected: 3 created then 0; the moved end updates the label and keeps its text; each export has the range's length.

### Selection, navigate, follow, loop

**A3-T12 Select, go to, read place (Hosted).** Steps: with two audio tracks, `SelectTracks` by name-derived index; read `Tracks` `selected`; `SelectTime` t,t; read `Selection`; a screenshot with the cursor placed at 700 s of an 800 s clip (view at the start). Expected: only the named track is selected; Selection reads `{t,t}` at six digits; the screenshot says whether the view followed the cursor (decides the "on screen" wording in N6c).

**A3-T13 Loop and stop (Hosted).** Steps: `SelectTime` 3 to 7.5, `PlayAtSpeedLooped`; `pactl list sink-inputs` shows an input; wait 12 s (longer than the range) and check the input is still present; `Stop`; the input is gone; read `Selection`. Also send `TogglePlayRegion` once and record what it does. Expected: the loop outlives the range; `Stop` ends it; the selection is unchanged by `Stop`. The pitch is not tested here.

### Record, punch, roll

**A3-T14 Record and live label (Hosted).** Steps: project rate 44.1 kHz with a 44.1 kHz track; play a known clip into the null sink with `paplay`; `Record1stChoice`; after 2.0 s of wall clock send `AddLabelPlaying`; at 5.0 s `Stop`; read the track end and the label time. Repeat with a 22.05 kHz imported track in the 44.1 kHz project. Expected: the track length is within 0.1 s of wall time; the label time is within 0.2 s of 2.0 s; the second run reproduces or avoids the sample-rate modal and the harness names the dialog. This measures the app-clock drift against the true position (N3c, N14).

**A3-T15 Recording end detection (Hosted).** Steps: during a recording, poll `GetInfo: Tracks` and `Clips` every 250 ms for 6 s and log `end`; stop with `xdotool` clicking the Stop button (not scripting); keep polling 3 s; also send `Message` during the recording. Expected: the log shows whether `end` grows live; `Message` answers during a recording; the poller flags "stopped (inferred)" within 3 polls of a stop made in the UI. If `end` does not grow live the Booth keeps only the app-side clock and the inference is dropped.

**A3-T16 Punch and Roll (Hosted for audio; Owner for undo history).** Steps: record a 6 s clip; `Stop`; back up the track from 3 s; `SelectTime` 3 s; `PunchAndRoll` with the pre-roll preference set (find the key with `GetInfo: Type=Preferences`); play new audio into the sink for 3 s; `Stop`; export 0 to the end. Compare with `ffmpeg`: the first (3 s - pre-roll) is unchanged, the rest is the new audio. Then `Undo` repeatedly, comparing the fingerprint to the pre-roll one, and count the steps. Expected: earlier audio kept to the pre-roll point; the number of `Undo`s to return is recorded and compared with the adapter's `undoSteps` 0; the sample-rate modal is handled as in T14. The owner compares the Undo History list by eye.

### Edits

**A3-T17 Backups (Hosted).** Steps: a 300 s tone (mono, then stereo); `BackupAround` 150 s with a 120 s window; damage the original with `Silence`; `RestoreBackup`; export both ranges and compare PCM hashes. Then delete the backup track and restore. Expected: restored equals original; the backup track is muted and holds 30 to 270 s; the stereo backup is stereo; the missing-track restore is refused and nothing changes. Also checks that `Paste` starts at the window start.

**A3-T18 Cut, close and gap, and label drift (Hosted).** Steps: tone with labels at 1, 5, 9 s and a line label spanning 4 to 6 s; cut 2 to 3 s closing up, and 4 to 4.5 s as a gap; run once with `SyncLock` on and once off. Expected: the track ends at 11 s after the close; the gap is silent (`astats` below -90 dB); the labels after the cut move with the audio only when Sync-Lock is on; the harness records which. This decides whether the drift check of N7 can be satisfied by turning Sync-Lock on at link time.

**A3-T19 Stack and un-stack, takes by mute (Hosted).** Steps: C4 and C5 of the pass on `kara_01` with two reads of paragraph 1 (the second a time-shifted copy); then `SetTrackAudio Mute` swaps for active take and hide. Expected: the track ends where C4 says; the take track is named per the adapter; un-stack restores the length; the swap leaves exactly one take track audible (export and compare).

**A3-T20 Macros: spelling, listing, apply (Hosted).** Steps: write a `Macros/Narration-Test.txt` into the profile (a `Fade` and a `Normalize` step); `GetInfo: Type=Commands` for `Macro_`; apply it three ways (`ApplyMacro: MacroName=Narration-Test`, `Macro_Narration-Test:`, and neither); count `Undo`s to return. Expected: the working spelling is recorded; a missing name returns `Failed!` quickly, not a dialog; the undo count is recorded against the adapter's 2.

**A3-T21 Gain and click repair (Hosted).** Steps: `Amplify: Ratio=0.5` over 2 to 3 s of a tone, then a version with `SetEnvelope` points 10 ms outside each edge; `ClickRemoval` over a 0.2 s window around a synthetic 3 ms click (ffmpeg-generated). Measure with `astats`. Expected: the level drop is within 0.5 dB of the request; `Amplify` leaves a step at the edges (measure the peak difference); the envelope route (if it works) ramps; `ClickRemoval` lowers the click peak. Decides whether the envelope replaces `Amplify`.

**A3-T22 Undo guard (Hosted).** Steps: make an edit through the adapter and record F1; `Undo` through the guard (allowed); make a second edit, then a hand edit through a separate script (`SetLabel`), then ask the guard to undo the first. Expected: the guarded undo works when nothing intervened and refuses when the fingerprint moved; `LastAction` answers `unknown` when it cannot tell.

### Render, export, import

**A3-T23 Export (Hosted; Hosted Win for paths).** Steps: export a chapter range three times: with the audio track selected, with only the label track selected, with no track selected; with `NumChannels` 1 and 2; to a path with spaces and a non-ASCII letter; a path of 240 characters (Windows). Then set the WAV format preference to 16-bit and 24-bit through `SetPreference` (or the saved options) and export each; check with `ffprobe`. Expected: only the first yields samples (A6/A9 of the earlier run); channel count follows `NumChannels`; the bit depth follows the preference or the test names the key that controls it; the long path either works or is refused before sending.

**A3-T24 Import and fixture facts (Hosted).** Steps: import `kara_01` (22.05 kHz MP3) into a 44.1 kHz project and a 22.05 kHz project; read `Clips`; compare to the alignment's 796.286 s; time the import. Expected: the clip length equals the alignment's duration; the import takes under 2 s; the sample-rate difference between track and project is visible in `GetInfo` and `GetPreference` so the Booth can guard it (T14).

**A3-T25 Macro render (Hosted).** Steps: fingerprint F0; `Import2` a rendered WAV; select only that track; `ApplyMacro`; `Export2` to a new path; `RemoveTracks`; fingerprint F1. Expected: F1 = F0; the exported file differs from the source by the macro's effect (loudness measured); no stray dialog; the destination path is new and not the source.

**A3-T26 Save (Hosted).** Steps: `SaveProject2` to the project's own path twice; to a new path; on a never-saved project send `Save`; read the title after each. Expected: the overwrite works without a dialog; the title changes after the save to a new path; `Save` on an unsaved project shows a dialog (the harness names it) and the app's rule "ask the narrator to save" is the fallback.

**A3-T27 Monitor level (Hosted).** Steps: `GetInfo: Type=Preferences` and `GetPreference` for the playback volume key; `SetPreference` to two values with and without `Reload`; play a tone into the sink and record the sink monitor with `parec`; export the same tone. Expected: the monitor level drops by the set amount while the export is byte-identical. If no key exists or the level does not change without a reload, `monitor_level` stays Not yet available.

**A3-T28 Dialog inventory (Hosted).** Steps: from a fresh profile with only `HOME` seeded, run T3's commands with the config keys of finding 5 absent, then present; after each step list the windows. Expected: the table of dialogs (update notice, welcome, crash recovery, sample-rate) and the config key that suppresses each, written into the setup box and the harness.

**A3-T29 No file-preview, no reveal (Hosted).** Steps: search `GetInfo: Type=Commands` and `Menus` for a command that plays or reveals a file without importing; send `Import2` of a file and read the track count. Expected: none found; `Import2` adds tracks. This pins the "Cannot" for `file_preview` and `file_reveal` and turns red if a later Audacity adds one.

### Windows, language, other platforms, failure modes

**A3-T30 Windows named pipes (Hosted Win).** Steps: `windows-latest`, `audacity-win-3.7.7-64bit.zip` (pin in the CI note), module enabled by the two-start procedure; run T1, T3, T4, T6, T8, T9 and T23 with `Command.Path` forms `C:/...`; record the reply bytes. Expected: the same reply shapes as Linux (the lone blank line and the blank first line are the open question); the EOL `\r\n\0` works; no audio device, so recording rows skip. If the module will not load on the hosted image, the failure is recorded and the Windows pass stays with the owner.

**A3-T31 Owner pass (Owner).** Steps: Part B and the by-ear and undo-history parts of Part C of [the verification pass](../operations/audacity-verification-pass.md) on a Windows machine with a real microphone: record, stop, roll, loop pitch, view following, Edit > Undo History counts for C1 to C6, the first-run wizard, the Record button's sample-rate dialog. Expected: as the pass table; any difference goes to the fake and to this note.

**A3-T32 Language (Hosted).** Steps: set the interface language to German with the profile's language preference; repeat T2, T3 and T8. Expected: the terminator stays English (Published); track default names and menu names are localised, so no logic may depend on them; the app's own names (track "Narration Studio", the label prefixes) are unaffected.

**A3-T33 Audacity 4 guard (Hosted, optional).** Steps: start an Audacity 4.x build when one is downloadable and pinned; wait 30 s for the pipe. Expected: no pipe; the app reports "not reachable" and names Audacity 4; the check turns red when a pipe appears.

**A3-T34 Crash and stale pipes (Hosted; Hosted Win).** Steps: send a command, `kill -9` Audacity mid-command, then start the client and dial with the deadline; start Audacity again; send `Message`; with two clients, connect a second while the first holds the pipe. Expected: on Linux the dial returns `ErrNotReachable` within the deadline instead of blocking on the stale FIFO (finding 4); after the restart the next request connects; the second client waits or is refused without breaking the first.

### Order of execution

1. A3-T34, T1, T2, T3, T28: the transport and the first-start behaviour, because every later test depends on them.
2. A3-T4, T5, T6, T7, T8: heartbeat, fingerprint, time, identity.
3. A3-T9, T10, T11, T12, T13: labels, navigation.
4. A3-T24, T23, T26, T25: import, export, save, macro render.
5. A3-T14, T15, T16: recording, with the null sink (Linux only).
6. A3-T17, T18, T19, T20, T21, T22: backups and the edits in steps.
7. A3-T27, T29, T32: the Untested capabilities that decide Cannot or Workaround.
8. A3-T30, T33: the other runners.
9. A3-T31: the owner's pass, after the hosted results are in.

A hosted run needs the Phase 3 seam of the CI note first; until then T1 to T3, T14, T15 and T23 can run with the test-only FIFO transport the prototype already carries.

## What this note does not settle

- No Audacity was started for it. Every Untested grade is a prediction.
- Audacity 3.7.8 and later may change a command (an open issue, audacity#11471, was filed against 3.7.8); the pin is 3.7.7.
- The macOS pipe path is from `pipe_test.py` (Published); the product targets Windows and no macOS runner is in the plan.
- Whether Sync-Lock can be set from scripting at link time, and what it does to labels, is T18.
- Whether `Macro_<name>` or `ApplyMacro` is the working spelling is T20.
