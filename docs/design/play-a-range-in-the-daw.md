# Playing a range through the DAW, and the tail of a word

Status: built (harness, Go and UI tests; not yet run in a real REAPER, see the end). Covers owner items #5 (a play cuts a word off), #22 (the app sounds different from REAPER) and #24 (a pickup "has no time"), issue #2251.

## What is wrong, and why

**#5, the cut.** `heardWindow` (`editing/model/runway.ts`) ends a play at the aligner's word end plus a fixed tail: 0.2 s inside a line, 0.35 s after a paragraph's last word, and only 0.12 s when the next word's aligned start touches this word's end. The recognizer's word end is early (a word like "statues" is ended near "stat" + the start of "u"), so a fixed tail cannot reach the real end of the word; only the audio can say where it dies away. The DAW path adds a second error: the stop is decided in the page from a position stream (about four a second) and then a `stop_play` round trip, so the stop is late by an unknown amount and never at the planned time.

**#22, the sound.** Editing already plays through the DAW's transport (`play_from`) when REAPER is linked, but it starts an open-ended play and stops it from the page. Everything else that plays a range (Proof's Hear it, Pickups) plays the app's own decoded audio when the DAW's `navigate` loop is not available, which is the muted version without the FX chain.

**#24, the pickup with no time.** Proof's Hear it is disabled with "This note has no time in its audio to play" when `finding.time_range` is absent. `repeats.groupFinding` (the finding behind every pickup and duplicate read from a take-review scan) never sets `TimeRange`, although every member carries its item GUID, source file and source offset. Its doc comment leaves "per-member Source/TimeRange resolution" to the scan service, and `takereview.Scanner.Scan` never did it. The time is dropped at the source, so the fix is there.

## Decisions

1. **One bridge command, `play_range(run, start, end)`, the DAW plays a range and stops itself.** The Lua script sets the cursor, starts the transport and, from the defer loop, stops at `end` (project seconds) and restores nothing else. It answers `RANGE_PLAYING|run|start|end`; the stop is seen on the `TRANSPORT` stream (play state 0) the page already watches, so there is no second event. It is refused while recording (the existing sentence), and an empty, backwards or longer than 600 s stretch is refused before anything is sent. The play head must first be read inside the stretch before the end counts (a reading at or past the end is never an arrival: REAPER reports the old head for a moment after a seek, which for the same stretch played twice sits just past its end), a play another feature starts drops the stretch (the cursor is away from its start and the head nowhere near it), and a deadline of the stretch plus two seconds stops it if the head never arrives. A new `play_range` or `stop_play` replaces the one running. Capability: `transport_sync`, as `play_from`.
2. **Range plays go through it:** Editing's play of words or a selection (the end is the audio-derived end below; the page maps it to a project second past the paragraph's last word with `projectEndAt`) and the Pickups page's Hear the original (project range of the line plus three seconds either side). Proof's Hear it already plays in the DAW (the `navigate` loop, `FindingsLoop`) and keeps doing so; what stopped it was the missing time (decision 4). The app's own audio stays the fallback only when the DAW is not linked or cannot play, and says so through the existing result line or toast, as `playThrough` does today.
3. **The tail comes from the audio.** A pure function over the chapter's peaks (50 per second, already read for the ribbon) takes the aligner's end and finds where the word's sound is gone: 36 dB under the word's own peak (and above the chapter's room level) for 100 ms, so a closure inside a word is not taken for its end. When the next word starts within 0.3 s it finds the join instead: the quietest moment between this end and the loudest point of the next word, because the recognizer's start for that word is as early as its end for this one. A play never ends less than `MIN_TAIL_SECONDS` past the aligner's end. The fixed constants are the fallback when no peaks are loaded.
4. **A pickup finding carries a time.** `Scan` resolves the primary member's item in `req.Project` and sets `TimeRange` (project seconds from the item's position, trim and rate; source offsets from the member). Findings already saved without a time are filled on the next scan; the evidence version does not change.
5. **Contract:** `RANGE_PLAYING` in the bridge wire table, `play_range` in `actions.go`, `DawTransportSync(action, seconds, until)` with the action `playRange` (`hostAPIVersion` 146), a contract row and the mock, which stops itself when its head passes the end as the script does.

## Design check

| Principle | Check |
| --- | --- |
| One reason to change | The tail rule lives in `runway.ts` only; the stop timing lives in Lua only. |
| Depend on the port | Pages call the transport-sync port; the Lua details stay in the bridge. |
| No new fallback behaviour | `playThrough` order is unchanged. |

## The app's own stop, and the log line

When the app plays (the range is not placed in the DAW, or the DAW cannot play), the audio element runs on past the planned stop: it fades out over the last 12 ms before it (`bar/playbackStop.ts`) and is paused 60 ms after it, because the element's clock counts what it has handed to the output, and pausing drops what the output device still holds. Every play of words writes one `play_stop` line to `logs/host.log` (`docs/reference/data-files.md` says where the folder is): the word, the aligner's end, the planned stop, the stop seen, and the path (`app` or `daw`). For the DAW the stop seen is the last play head it sent (about four a second), so it is only good to a quarter of a second.

## What a fake cannot prove (pending, owner's REAPER)

That `reaper.defer` stops within a frame of `end` on a real project, that a play started this way keeps the project's FX chain audible, and that a stop at `end` does not clip the tail on the real output latency. Recorded in the pull request.

## The "statues" fixture

`realSpeechTail.test.ts` measures the end of a play on real speech: four LibriVox readings (public domain; `editing/model/fixtures/realSpeech/README.md` says how they were made) aligned with the app's recognizer settings, with the host's peaks for the play and a separate 5 ms level track for the measure. A word is clipped when sound within 30 dB of its peak still plays more than 30 ms after the planned stop. The first rule here (a made-up envelope in `audioTail.test.ts`) passed while the owner still heard "statue" for "statues": on the real readings it clipped 20.7% of the last words of a line and 35% of the words before a pause. `audioTail.test.ts` keeps the shapes of the two failures (a closure inside the word, a final "s" 25 dB under the vowel).
