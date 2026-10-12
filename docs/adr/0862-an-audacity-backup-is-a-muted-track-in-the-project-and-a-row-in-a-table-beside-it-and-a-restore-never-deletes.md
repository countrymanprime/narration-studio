# 0862. An Audacity backup is a muted track in the project and a row in a table beside it, and a restore never deletes

**Status:** Proposed
**Date:** 2026-10-12
**Supersedes:** none. It settles the `backups` capability's Audacity row that [ADR 0860](0860-a-roll-keeps-the-earlier-audio-as-a-take-and-a-range-cut-a-chain-on-a-range-and-stacking-move-audio-and-never-delete-it.md) and the DAW PRD left to spike SND-S7.

## Context

Audacity keeps no takes, so an edit there changes the narrator's audio in place. The DAW PRD (`studio-next-daw-ports-and-capabilities.prd.md`, Proposed Solution item 6) asks for backups: before an edit, clone a window of audio around it (about two minutes either side, a setting), keep it for a number of days (seven, a setting) and restore it on request. Audacity is driven over its scripting pipe from the published spec ([ADR 0355](0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md)). Spike 1g ([run sheet](../operations/daw-spike-run-sheet.md#1g-audacity-backups-snd-s7)) clones with `Copy`, `NewMonoTrack` and `Paste` and restores with `Copy` and `Paste`; its result is pending with the owner. Scripting reports no track ids and no project file path.

## Decision

1. **The backup's audio lives in the Audacity project.** `BackupAround` (`apps/desktop/internal/dawport/audacity/backups.go`) copies the window of the source track to a new track named `Narration Utils backup {ID}` at the same project time, and mutes it (`SetTrackAudio: Mute=1`), with spike 1g's commands. A stereo source gets a stereo track. The narrator's audio is not changed, so the result is `changed: false`, `undoSteps: 0`, "Backed up N s of audio in Audacity."
2. **The table is `narration-utils/backups.json` in the app's project folder.** Format version 1: `{schemaVersion, backups: [{id, guid, chapterId, start, end, createdAt}]}` (`backups_store.go`, `dawBackupsFileSchema`). It is narrator data read through `apps/desktop/internal/persist`, as the bookmarks file is ([ADR 0820](0820-a-bookmark-is-a-spot-kept-in-a-project-sidecar-checked-on-read-and-cleared-when-the-manuscript-is-replaced.md)): a corrupt file or a row that breaks a rule is kept aside as `backups.json.corrupt-<time>` and an empty table starts; a newer version is refused and never overwritten; a write goes through a temporary file and a rename. Its only path input is the host's project folder.
3. **Audacity's track id is the track's name.** The request's `guid` names the source track as `GetInfo: Type=Tracks` lists it; a name that matches no audio track is `stale`, and one that matches two is refused. The backup's own `id` is a GUID the host makes, and the adapter finds the backup track again only by its exact name. A row whose track is gone reads back `missing` and is never restored from a guess.
4. **Window and retention.** The window is 120 s either side of the edit, clamped to the project's start and its audio's end; retention is 7 days. Both become narrator settings in SN-D82; until then the window is `DefaultBackupWindow` and the retention is the caller's argument to `Prune`.
5. **A restore never deletes.** `RestoreBackup` copies the backup track's window over the same window of the source track and keeps the backup track and its row, `changed: true`. Only `Prune` removes anything: the rows older than the retention and the tracks they name, re-reading the tracks before each removal.
6. **Experimental.** Audacity declares `backups` Experimental with this role until the owner's Audacity pass ([verification pass](../operations/audacity-verification-pass.md)); Audacity 4.0, which has no pipe, answers the not-reachable sentence.

## Consequences

- A backup survives an app restart and a project save in Audacity, since it is a track of the project; it is lost if the narrator closes Audacity without saving or deletes the track, which `missing` reports.
- Renaming the source track in Audacity makes its backups unrestorable until the name is put back (`stale`).
- The table holds at most 500 rows; a backup past that is refused until a prune.
- What the fake pipe cannot prove (that `Paste` into an empty track lands at the cursor, that a restore matches the original sample for sample, the undo points Audacity adds, and the cost of a two-minute window) is checked by the owner's pass and spike 1g, and recorded on the QA pass ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)).
