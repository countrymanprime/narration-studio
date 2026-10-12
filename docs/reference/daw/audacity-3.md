# Audacity 3.x: what the app relies on

Engine facts the Audacity adapter depends on, as of 2026-10-10. The protocol below is the published `mod-script-pipe` of Audacity 3; the adapter was built from that spec and has not yet been through the owner's verification pass ([ADR 0355](../../adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md)). Nothing on this page was observed in a running Audacity 3: the protocol facts, the 1024-byte limit, the escaping rules and the behaviour table below come from the published manual and Audacity's source ([research, "Not verified"](../../research/audacity-4-scripting-spec.md#not-verified)).

## How the app reaches Audacity

- **Over the scripting pipe**, which the narrator must enable (Preferences, Modules). The client is `apps/desktop/internal/audacitybridge`; the adapter is `apps/desktop/internal/dawport/audacity`.
- **Two fixed Windows named pipes**, opened `ToSrvPipe` first then `FromSrvPipe`. Names and the `\r\n\0` line ending are fixed in code, never taken from a setting.
- **One command per read, at most 1024 bytes.** The client refuses a line over 1020 bytes and a text value over 900.
- **A reply is lines, a terminator, then an empty line.** The terminator is exactly `BatchCommand finished: OK` or `Failed!`; anything else drops the connection.
- **No project window answers with a bare empty line.** The client reports "no project" and keeps the connection.
- **No server-side timeout.** A modal dialog holds the answer, so the client times out at 5 s, closes the connection and reconnects on the next request.

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

Audacity has no items, takes or extension data. Take creation, pickups, line identity and render setup are REAPER-only, and the review page hides REAPER's take management for an Audacity launch instead of showing it disabled ([ADR 0660](../../adr/0660-audacitys-finding-detail-hides-reapers-take-management-instead-of-disabling-it-through-capabilitygate.md)).

## Not yet available

Every capability except navigate, markers, `macro_render`, `backups` and the five below is not yet available ([matrix](matrix.md)).

## What needs backups

Audacity keeps no takes and its edits change the audio itself, so `takes`, `punch`, `stack_takes`, `cut_range` and `fx_range` exist in Audacity only while `backups` is available ([PRD decision DQ-18](../../prds/studio-next-daw-ports-and-capabilities.prd.md#decisions); the Studio Next mock's [`capabilitiesFor`](../../research/mockups/studio-next/src/selectors/daw.ts)). The adapter declares the five Experimental, each requiring `backups` (`apps/desktop/internal/dawport/audacity/audacity.go`):

- While backups are turned off, takes, stacking, cutting and an effect on words are refused with backups' reason and one sentence, for example "Stacking takes needs Audacity backups. Turn on Audio backups in Settings."
- A roll stays usable without backups and is destructive, so the page asks first; with backups available it is not destructive.
- `stack_takes`, `cut_range` and `fx_range` are made in `steps`.

## Edits made in steps

Each edit is a series of scripting commands sent after `BackupAround` has cloned the audio around it (`apps/desktop/internal/dawport/audacity/steps*.go`). Every check comes before the backup and the backup before the first edit: a request out of shape is refused, a track name Audacity no longer lists is `stale`, and a backup that is refused or fails stops the edit. The `Result` lists the edits in `Steps`, in the order sent, and counts in `undoSteps` the ones that add an undo point; selecting and copying add none. The roles treat backups as unavailable when the adapter has no project folder for them: then the cut, the effect and the stack refuse with the capability's sentence and send nothing, and a roll records over the audio.

| Edit | Commands after the backup | Undo points |
| --- | --- | --- |
| Roll | `Stop` (before the backup), `SelectTracks`, `SelectTime` at the roll point, `PunchAndRoll` | 0; the recording's is Audacity's |
| Cut, close | `SelectTracks`, `SelectTime`, `SplitDelete`, then `Delete` on the emptied stretch to close it up | 2 |
| Cut, gap | `SelectTracks`, `SelectTime`, `SplitDelete`; the gap stays silent | 1 |
| Effect on a range | `SelectTracks`, `SelectTime`, `Split`, `ApplyMacro` with the narrator's macro | 2 |
| Stack | per later read: `NewMonoTrack` or `NewStereoTrack`, `SetTrackStatus` (name), `Copy` the read, `Paste` it at the first read's spot; then `Split` and `Delete` from where the first read ends to where the reads end; `SetTrackAudio` mute on each take track | 3 per read, plus 2 |
| Un-stack | `Copy` the stretch the stack took out from the stack's own backup track, `Paste` it where the first read ends; `RemoveTracks` for each take track | 1, plus 1 per take |

A stack's take track is named `Narration Utils take {take} from {seconds} s, backup {ID}`: the read's take id, where it was recorded and the backup the stack made, which holds what the stack took out of the chapter track. An un-stack refuses (`stale`) when a take track is gone or has moved, and when the stack's backup track is gone. A stack moves one passage per call, at most three later reads, because the request's `Shift` is summed over passages and Audacity has no item to read each first read's length from. Taking an effect off, setting the active take and hiding takes are not made in Audacity: the way back is the backup, on the Editing page's Backups tab.

Paste, Delete and Punch and Roll move audio by Audacity's own rules (whether a paste into a gap moves the clips after it, how many undo points a macro adds), so each edit is checked on [the verification pass](../../operations/audacity-verification-pass.md), Part C.

## Backups

`backups` is Experimental: a backup is a muted track in the Audacity project named `Narration Utils backup {ID}`, and a row in `narration-utils/backups.json` in the app's project folder ([ADR 0863](../../adr/0863-an-audacity-backup-is-a-muted-track-in-the-project-and-a-row-in-a-table-beside-it-and-a-restore-never-deletes.md), [capabilities](capabilities.md#backups)). Scripting reports no track ids, so the adapter names a source track by its name and finds a backup track only by its exact name. Deleting or renaming either track in Audacity makes the backup unrestorable, and the app reports it rather than guessing.

## Checking a capability in Audacity

[The Audacity verification pass](../../operations/audacity-verification-pass.md): Part A runs unattended against Audacity 3 with the module enabled and records the installed version first; Part B is by eye and ear; Part C runs each edit made in steps after a backup. Its tables give the expected result of each step, and its Backups table lists the backup checks no part runs yet. **Checked:** not checked; no part has run in Audacity (2026-10-12), and the QA pass ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)) holds the owner's run. On Audacity 4.0, step A1 fails with "not reachable" and the run stops.
