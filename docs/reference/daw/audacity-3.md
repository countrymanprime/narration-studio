# Audacity 3.x: what the app relies on

Engine facts the Audacity adapter depends on, as of 2026-10-19. The protocol below is the published `mod-script-pipe` of Audacity 3. The adapter was built from that spec and has not been through the owner's verification pass ([The DAW port](../../architecture/daw-integration.md#the-daw-port)). The protocol facts, the 1024-byte limit, the escaping rules and the behaviour table below come from the published manual and Audacity's source ([research, "Not verified"](../../research/audacity-4-scripting-spec.md#not-verified)). The sections [Measured in Audacity 3.7.7](#measured-in-audacity-377) and [Edits made in steps](#edits-made-in-steps) were observed in a running Audacity 3.7.7 on Linux (2026-10-19; [results](../../research/audacity-3-real-edits-results.md)), never on Windows. The foundation suite's first run is in [Audacity 3 real run: foundation](../../research/audacity-3-real-run-foundation.md).

## How the app reaches Audacity

- **Over the scripting pipe**, which the narrator must enable (Preferences, Modules). The client is `apps/desktop/internal/audacitybridge`; the adapter is `apps/desktop/internal/dawport/audacity`.
- **Two fixed Windows named pipes**, opened `ToSrvPipe` first then `FromSrvPipe`. Names and the `\r\n\0` line ending are fixed in code, never taken from a setting.
- **One command per read, at most 1024 bytes.** The client refuses a line over 1020 bytes and a text value over 900.
- **A reply is lines, a terminator, then an empty line.** The terminator is exactly `BatchCommand finished: OK` or `Failed!`; anything else drops the connection.
- **No project window answers with a bare empty line.** The client reports "no project" and keeps the connection.
- **No server-side timeout.** A modal dialog holds the answer, so the client times out at 5 s (60 s for an export, an import or a macro, which Audacity answers when it has finished), closes the connection and reconnects on the next request.

## Linking

Audacity has no project path, play state or version over the pipe, so "linked" is built from three things the app can see: what is installed, Audacity's own settings file, and what answers on the pipe. The host reads them every 2 s while the project records with Audacity (`audacitylink.Classify`, `apps/desktop/bindings_audacity_link.go`) and shows one state, with a sentence that says what to do next, in Settings > Recording & DAW, the engine panel and the header chip.

| State | What it means | What the narrator does |
| --- | --- | --- |
| `unsupported` | Not Windows: the app has no scripting pipe there | Record with the built-in recorder or REAPER |
| `not_installed` | No Audacity found | Install Audacity 3 |
| `module_off` | Scripting is off, or Audacity has never started so it has no settings yet | The first-start steps below |
| `not_running` | Scripting is on, Audacity is closed | **Start Audacity** (on the linked `.aup3` when one is linked) |
| `needs_restart` | Scripting is on, Audacity is open and does not answer | Close Audacity and start it from the app |
| `audacity4` | The install looks like Audacity 4 (by its folder name), which has no scripting pipe | Install Audacity 3.7 |
| `dialog` | The pipe took a command and did not answer in 5 s: a modal dialog | Close the dialog in Audacity; the app reconnects by itself |
| `no_project` | Audacity answers with a bare empty line: no project window | Open the project |
| `answering` | Audacity echoes the app's probe | Link the open project if it is not linked |

**The first-start steps.** On a profile Audacity has never seen, the first start records the module as failed (`mod-script-pipe=4`) whatever the file said, and a second start after setting it to `1` works every time ([the real-Audacity run](../../research/real-audacity3-ci-integration.md), finding 4). So the app walks: start Audacity once, close it, **Turn on scripting** (sets `[Module] mod-script-pipe=1` in `%APPDATA%\audacity\audacity.cfg`, refused while Audacity runs because Audacity writes the file when it closes), start Audacity again. The checklist on the card is done from the facts, not from a remembered step, so a narrator who does part of it by hand lands on the right line. Which dialogs a first start shows (updates notice, welcome) and the settings keys that suppress them are the owner's pass (matrix test A3-T28); the app does not write those keys.

**The link.** Audacity scripting reports no project path, so the app writes one label, `[nu:project <id>]`, at the start of the "Narration Utils" label track of the project the narrator chooses (**Link the open Audacity project**) and keeps the same id in the project's `Recording.audacity_link` row. The open project is `linked` when the label's id is the row's, `other` when it is another id, `unlabelled` when there is none. **Choose Audacity project file** records the `.aup3` path (`Recording.audacity_file`) so **Start Audacity** can open it. **Unlink** deletes both rows and leaves the label in the Audacity project, where it is one line the narrator can delete.

**What is Experimental.** The link itself reads and writes nothing in the audio. Every capability behind it keeps its level from [the matrix](matrix.md); nothing here is promoted before the owner's pass.

## The snapshot

The `.aup3` is a SQLite file the app does not read, and scripting reports no project path, so everything the app reads from a saved project offline (the track list, the chapter links, the recorded lengths, the regions, the pickup counts) comes from a snapshot. While Audacity answers, the host reads `GetInfo` Tracks, Clips and Labels (three commands) every 10 s and writes `narration-utils/audacity-snapshot.json` when the project changed (a selection change does not count), and at once after a narrator's action (Check again, linking the project). The offline readers take that file where REAPER's take the `.rpp`:

- an audio track is a track with the id `audacity:<name>` (`#2`, `#3` for a repeated name); a clip is an item with its track's id and its start in milliseconds, so an id goes stale (never to another track or clip) when the track is renamed or the clip moves;
- a range label `[nu:region] <title>` is a region, and a pickup label is a `PICKUP:` or `PICKUP_DONE:` marker;
- a clip has no source file the app can open, so a reader that needs the audio itself (the recording check) says so rather than guessing.

The panel and the readers say that tracks are "as of the last time Audacity answered". A project that chose another engine ignores a snapshot left from when it was Audacity.

## Behaviour the adapter works around

| Audacity behaviour | What the adapter does |
| --- | --- |
| Carriage returns and line feeds are deleted, and quote and backslash escaping is not safe | A text value with a double quote, a backslash or a control character is refused; label text is cleaned first; paths use forward slashes |
| `AddLabel` takes no parameters: it labels the selection on the selected label track, or makes a track | The adapter selects its own track and the time, adds, reads the labels again to find the new empty one, and names it with `SetLabel` |
| `GetInfo` times carry six significant digits | A label is found by the finding identity in its text, never by exact time |
| `TogglePlayRegion` misbehaves when scripted | Loop is `SelectTime` then `PlayAtSpeedLooped`; Stop is `Stop` |
| `Export2` picks the exporter by file extension, and `CL` runs an external program | Export accepts only `.wav`, `.flac`, `.mp3`, `.ogg`, `.aiff` and `.aif` |
| Anyone who can write to the pipe can make Audacity read and write files | Remote clients are rejected; see the Audacity rows of [the threat model](../../architecture/threat-model.md) |

The full table, with the commands and their reply shapes, is [the Audacity 4 spec research](../../research/audacity-4-scripting-spec.md#what-this-means-for-the-build).

## What the app has no Audacity equivalent for

Audacity has no items, takes or extension data. Take creation, line identity and render setup are REAPER-only (pickups are labels, [Snapshot](#the-snapshot)), and the review page hides REAPER's take management for an Audacity launch instead of showing it disabled.

## Not yet available

Sixteen capabilities are not yet available ([matrix](matrix.md)): `line_identity`, `render_config`, `cleanup_tools`, `retake_lanes`, `project_state`, `take_create`, `heartbeat`, `record`, `fx_chains`, `item_gain`, `render_with_fx`, `master_chain_read`, `file_preview`, `file_reveal`, `undo_last` and `monitor_level`. Each refuses with the resolver's sentence naming it ("Record is not available with Audacity yet."); the comparison sentence in `audacity.ErrNotAvailable` is only the review workflow's answer on a launch with no pipe.

## What needs backups

Audacity keeps no takes and its edits change the audio itself, so `takes`, `punch`, `stack_takes`, `cut_range` and `fx_range` exist in Audacity only while `backups` is available ([PRD decision DQ-18](../../prds/studio-next-daw-ports-and-capabilities.prd.md#decisions); the Studio Next mock's [`capabilitiesFor`](../../research/mockups/studio-next/src/selectors/daw.ts)). The adapter declares the five Experimental, each requiring `backups` (`apps/desktop/internal/dawport/audacity/audacity.go`):

- While backups are turned off, takes, stacking, cutting and an effect on words are refused with backups' reason and one sentence, for example "Stacking takes needs Audacity backups. Turn on Audio backups in Settings."
- A roll stays usable without backups and is destructive, so the page asks first; with backups available it is not destructive.
- `stack_takes`, `cut_range` and `fx_range` are made in `steps`.

## Edits made in steps

Each edit is a series of scripting commands sent after `BackupAround` has cloned the audio around it (`apps/desktop/internal/dawport/audacity/steps*.go`). Every check comes before the backup and the backup before the first edit: a request out of shape is refused, a track name Audacity no longer lists is `stale`, and a backup that is refused or fails stops the edit. The `Result` lists the edits in `Steps`, in the order sent, and counts in `undoSteps` the ones that add an undo point; selecting and copying add none. The roles treat backups as unavailable when the adapter has no project folder for them: then the cut, the effect and the stack refuse with the capability's sentence and send nothing, and a roll records over the audio.

| Edit | Commands after the backup | Undo points |
| --- | --- | --- |
| Roll | `Stop` (before the backup), `SelectTracks`, `SelectTime` at the roll point, `PunchAndRoll` | 0 at the call; the recording adds 1 when it stops |
| Cut, close | `SelectTracks`, `SelectTime`, one `Delete`, with "Editing a clip can move other clips" on for the edit | 1 |
| Cut, gap | `SelectTracks`, `SelectTime`, `SplitDelete`; the gap stays silent | 1 |
| Effect on a range | `SelectTracks`, `SelectTime`, `Split`, the macro's menu command `Macro_<name>` | 2 (a macro adds 1 however many steps it has) |
| Stack | per later read: `NewMonoTrack` or `NewStereoTrack`, `SelectTracks` and `SetTrackStatus` (name), `Copy` the read, `Paste` it at the first read's spot; then, with clips able to move other clips, `Split` and `Delete` from where the first read ends to where the reads end; `SelectTracks` and `SetTrackAudio` mute on each take track | 2 per read, plus 2 (a mute adds none) |
| Un-stack | `Copy` the stretch the stack took out from the stack's own backup track, `Paste` it where the first read ends (with clips able to move other clips); `RemoveTracks` for each take track | 1, plus 1 per take |
| Lowered stretches | `SelectTracks`, `SelectTime`, `Amplify` per stretch | 0: `Amplify` adds no undo point |
| Repaired clicks | `SelectTracks`, `SelectTime`, `ClickRemoval` per selection | 0: `ClickRemoval` adds no undo point |

A stack's take track is named `Narration Utils take {take} from {seconds} s, backup {ID}`: the read's take id, where it was recorded and the backup the stack made, which holds what the stack took out of the chapter track. An un-stack refuses (`stale`) when a take track is gone or has moved, and when the stack's backup track is gone. A stack moves one passage per call, at most three later reads, because the request's `Shift` is summed over passages and Audacity has no item to read each first read's length from. Taking an effect off, setting the active take and hiding takes are not made in Audacity: the way back is the backup, on the Editing page's Backups tab.

Paste, Delete and Punch and Roll move audio by Audacity's own rules, which the Linux run measured ([Measured in Audacity 3.7.7](#measured-in-audacity-377)); the owner checks each edit on [the verification pass](../../operations/audacity-verification-pass.md), Part C, on Windows. A command that adds no undo point (the effects, a rename, a mute) rides into the next undo point: the next `Undo` takes back the edit before it as well, so the app reports 0 for those and never offers an Undo it cannot account for.

## Measured in Audacity 3.7.7

Each line was seen in a running Audacity 3.7.7 (AppImage, Ubuntu 24.04, Xvfb, a PulseAudio null sink) by `tests/audacity3/real/edits`, test ids in brackets, and is a fact about that build on Linux. None ran on Windows or on a GitHub-hosted runner yet ([results](../../research/audacity-3-real-edits-results.md)).

- **Which commands exist.** `GetInfo: Type=Commands` lists 93 batch commands (`Message`, `GetInfo`, `SelectTime`, `SetLabel`, the effects) and no menu command. Menu commands (`AddLabel`, `Record1stChoice`, `PunchAndRoll`, `Undo`, `SyncLock`, each saved macro as `Macro_<name>`) are listed by `GetInfo: Type=Menus` and scripted by their id with no parameters. **`ApplyMacro` is not a command** ("was not recognized"); a macro runs as `Macro_<name>:`, the name with its spaces taken out (`Narration Spaced Name` is `Macro_NarrationSpacedName`). A macro runs on the selected tracks and adds one undo point; with no track selected it opens a modal box and holds the pipe. [T20]
- **`SetTrackStatus` and `SetTrackAudio` take no `Track`.** A `Track=` parameter is ignored without an error and the command acts on the selected track, so the client selects the track first (`SetTrackName`, `SetTrackMute`). Sent after a `Split` and `Delete`, the old call muted the chapter. [T17, T19]
- **A batch command ends a recording.** Any batch command sent during a recording (`Message`, `GetInfo`, `SelectTime`, `SetLabel`) ends it; the menu commands `AddLabelPlaying`, `SelectNone` and `Stop` do not. So the app cannot poll or ping Audacity while it records, and cannot see a stop made in Audacity's own window. [T15]
- **A recording starts late.** Capture began 1.5 to 2.1 s after the reply to `Record1stChoice`, so the app's own clock overshoots by that much; `AddLabelPlaying` puts a label at the true position. [T14]
- **Where a recording lands.** `Record1stChoice` with a mono 44.1 kHz track selected and a stereo input made a new stereo track at the cursor; with a stereo 44.1 kHz track selected it appended to it; with a 22.05 kHz track in a 44.1 kHz project it opened the modal "Too few tracks are selected for recording at this sample rate". [T14]
- **`PunchAndRoll`.** With the cursor at the roll point it keeps the earlier audio sample-for-sample, replaces everything after the point with the new recording from exactly that point, splits the clip there, and adds one undo point when it stops. The pre-roll is the saved preference `/AudioIO/PreRoll` in seconds; `GetPreference` answers Failed! for it until something has set it. [T16]
- **Closing a gap.** A single `Delete` closes up. `SplitDelete` then `Delete` closes only while clips may move other clips; `SplitDelete` alone leaves a silent gap. A `Delete` inside one clip of a split track moves only that clip's own audio, and the clips after it stay where they were, unless the preference `/GUI/EditClipCanMove` is 1 (a fresh profile behaves as 0; `SetPreference` with `Reload=1` applies it at once). Sync-Lock starts off, `SetPreference` of `/GUI/SyncLockTracks` is stored but does not change the open project, and only the `SyncLock` menu command toggles it (the preference then mirrors the state). With it off, labels do not move with a close-up cut; with it on they move up with the audio. [T18]
- **Undo points.** `Split`, `SplitDelete`, `Delete`, `Paste`, `NewMonoTrack`, `AddLabel`, `SetEnvelope`, `RemoveTracks`, `Import2` and a macro add one each. **`Amplify`, `ClickRemoval`, `Silence`, `SetTrackStatus` and `SetTrackAudio` add none**: the next `Undo` takes back the edit before it, and the change with it. `Undo` with nothing to undo opens the modal "Nothing to undo" and holds the pipe (twice in hand probes Audacity then crashed, with a crash report window, which a test did not reproduce). [T22, T22b, T22c]
- **Gain and clicks.** `Amplify` is exact (6.00 dB for ratio 0.501) and leaves a step at its edges, about 8 times the tone's own largest sample-to-sample jump; envelope points set with `SetEnvelope` (10 ms either side) give the same 6.00 dB, ramp at the edges, are applied by `Export2`, and add one undo point. `ClickRemoval` with its defaults removed an 8-sample spike and, on a click 3 ms wide, opened the modal "Algorithm not effective on this audio. Nothing changed." and held the pipe. [T21]
- **Export.** `Export2` writes only the selected tracks that are not muted: with only a label track or no track selected it answers OK and writes no samples. The default is 16-bit PCM at the project rate; `/FileFormats/ExportFormat_SF1` and the other format keys tried did not change it. Dither is controlled by `/Quality/DitherAlgorithmChoice` and `/Quality/HQDitherAlgorithmChoice` (the words `None`, `Rectangle`, `Triangle`, `Shaped`) with `Reload=1`; the numeric `DitherAlgorithm` keys are not read. A path with spaces, a non-ASCII name and about 330 characters all exported. [T23]
- **Language.** In the German interface every batch and menu id the adapter sends is unchanged, the terminator and `Failed!` stay English, and a name the app sets is kept; the default label track name is translated (`Textmarken 1`), so the app finds its own label track by the name it gave it. A command's id in `GetInfo: Type=Commands` can be translated for a plug-in and hold a raw newline, so that JSON needs the client's repair. [T32]
- **`GetInfo: Type=Preferences Format=JSON`** got no reply and Audacity crashed once; it is not used. [hand probe]

## Backups

`backups` is Experimental: a backup is a muted track in the Audacity project named `Narration Utils backup {ID}`, and a row in `narration-utils/backups.json` in the app's project folder ([capabilities](capabilities.md#backups)). Scripting reports no track ids, so the adapter names a source track by its name and finds a backup track only by its exact name. Deleting or renaming either track in Audacity makes the backup unrestorable, and the app reports it rather than guessing.

## Checking a capability in Audacity

[The Audacity verification pass](../../operations/audacity-verification-pass.md): Part A runs unattended against Audacity 3 with the module enabled and records the installed version first; Part B is by eye and ear; Part C runs each edit made in steps after a backup. Its tables give the expected result of each step, and its Backups table lists the backup checks no part runs yet. **Checked:** the owner's pass has not run (2026-10-19), and the QA pass ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)) holds the owner's run. The hosted-runner tests ran the backups and the edits in steps against Audacity 3.7.7 on Linux ([results](../../research/audacity-3-real-edits-results.md)); no capability is promoted by that. On Audacity 4.0, step A1 fails with "not reachable" and the run stops.
