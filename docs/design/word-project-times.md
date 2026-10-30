# Where each word plays in the DAW project

The Editing page follows REAPER's play head word by word, plays REAPER from a word, and plays a stretch of words in REAPER. All three need one answer to "at which project second does this word play", and that answer is one table made by the host.

## Why

The follow-along used to map the play head through each item's position, trim, rate and GUID as the saved `.rpp` had them when the alignment was read. Every edit made in REAPER since (a move, a trim, a rate change, a section deleted and closed up) shifted the mapping by the size of the edit, and the page lit a sentence the narrator was not hearing, or skipped several. A split gives its right half a GUID the alignment never saw, so that half never lit. In a model of the old way, 378 to 679 of 650 to 810 samples were wrong or unlit after an edit; the table's rows for the same edits are exact against the live items (the per-word report is the PR that introduced this, and `scenarios_test.go` runs it).

## The table

`internal/wordtimes.Compute` takes the alignment's tokens (each: the alignment item, the start and end in that item's source file, in seconds) and the items on the chapter's linked track as the DAW has them now (`chapter_track_state`: GUID, position, length, source offset, play rate, source file, muted). Each word becomes a row:

| Field | Meaning |
| --- | --- |
| `i` | The alignment token's index, stable for one stored check. The page finds a word's row through its locator. |
| `state` | `placed`, `not_in_project` or `not_heard`. |
| `start`, `end` | Project seconds, only for `placed`. |
| `item` | Index into the answer's `items` list: the live item that plays the word. |
| `clipped` | A split or a trim cuts through the word; `end` is the item's end. |
| `misread` | The check heard another word; the time is where that word was said. |

A word is `placed` at `position + (source second - source offset) / play rate` of the live item that plays its start second. The item is found by the source file and the source range, never by GUID. The whole path is compared first, without regard to case or separators; the file name is used only when no item on the track has that path. When items overlap, the one that starts latest plays, as in REAPER. A muted item plays nothing. A word whose start second no item plays (cut out, trimmed off, muted, its file not on the track) is `not_in_project` with no time: it never takes a neighbour's. A word the check heard nothing for is `not_heard`. The file of an alignment item whose GUID has left the saved project is found from the live item with that GUID, else it is the track's only file; with several files it is not guessed.

The answer also carries `version` (`<stored check>@<change count>`) and `changeCount`, REAPER's `GetProjectStateChangeCount` at the read, so a page can tell its table is stale. It is `available: false` with no words when it cannot be made (no stored alignment, no DAW answering, `track_state` off, no linked track, the track gone, more items than one read lists). That is an answer, not an error; the page then follows nothing in the DAW.

## Freshness

The host's existing tick already reads the heartbeat's change counter (it makes `unsavedChanges`). When the counter differs from the last one it emits `daw_project_edited {changeCount}`. The page reads a new table on that event, on opening and when the window is shown again; a read in flight is followed by one more if another event came meanwhile. No timer polls the items. An edit that arrives between the event and the new table is followed by the old table for that moment (at most the host tick plus one read).

## The page

`follow/wordClock.ts` lays the table over the page's words (`useWordClock` is the one place that asks and builds). It maps both ways and returns null for a second no placed word covers:

- `wordAt` and `docAt`: binary search by project start, with a short look back for overlapping items; inside a word the document second moves along the word in proportion.
- `projectAt`: a document second inside a word to its project second, so Play from a word starts REAPER at the word's exact start.
- `projectEndAt`: where a play that ends at a document second ends. The end of word N is the exact end of that word; a tail up to a second past the last word is carried on at the word's own rate; more than that is not placed, and the play is open and stopped by the page.
- `end`: the project second the last placed word ends.
- `projectNear`: like `projectAt`, and for a second in a pause it gives a place between where the word before ends and the next starts (a cut made in a pause, as Stack as 2 takes makes). When the next word of the page is not placed (a word said and not in the script) the pause is carried on at the word before's own rate, for up to 15 s. A word of the page that the project does not play between the two leaves it without a place.
- `whyNotPlaced`: in the narrator's words, which check failed for a second with no place (no word there, the audio cut out or trimmed off or muted, no alignment token, nothing heard); a play that falls back to the app says it.

The follow keeps the last lit word through a gap between words and does not jump ahead. REAPER's position arrives about four times a second; between two readings the page carries the head on every 50 ms for at most 0.6 s, so the lit word advances word by word. The page's own audio still wins over the DAW's clock when it is playing.

`follow/wordClock.guard.test.ts` keeps this the only mapping: no module may map project seconds through items, playlist segments or source seconds, the sync and follow hooks take a `WordClock` and nothing else of the project, and the table is asked for and the clock built in `useWordClock` alone.

## What is not in the table

Words said that are not in the script (an extra run) have no row, so the DAW's play head does not light them and a cut made beside them is carried on from the last placed word; the page's own playback still lights them. Closing cuts need no separate handling: a cut is applied in REAPER, so the live items already lack it and its words are `not_in_project`.

## How it is checked

| Layer | Check |
| --- | --- |
| The rule | `internal/wordtimes` tests: move, trim, rate, split, a deleted section, mute, another file, overlap, a path spelled otherwise, an item whose GUID is gone. `scenarios_test.go` scores the old way and the table word by word. |
| REAPER | `scripts/ci/real-reaper/scenarios_wordtimes.py`, in a real REAPER: a source whose pitch changes every 5 s is moved, trimmed, re-rated, split and cut; `chapter_track_state` is read, and a render of the mix at the project second the rule gives must carry the pitch of that source second. The change count must rise on each edit. |
| The wire | Goldens `workspace-word-times*.json`, `daw-project-edited.json`, schema and mock rows in `wireContracts.test.ts`. |
| The page | `wordClock.test.ts`, `useWordClock.test.tsx` (refetch on an edit, extrapolation), `transportSync.test.tsx`, `follow.test.tsx`. |
| Alignment quality | `scripts/dev/word-time-error.py`: Whisper's word times against the pauses the committed sentence cuts sit in, and against `large-v3-turbo`. It needs a model and the recording, so it is not part of `pnpm check`. |
