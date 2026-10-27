# Playing a range through the DAW, and the tail of a word

Status: design, before code. Covers owner items #5 (a play cuts a word off), #22 (the app sounds different from REAPER) and #24 (a pickup "has no time"), issue #2251.

## What is wrong, and why

**#5, the cut.** `heardWindow` (`editing/model/runway.ts`) ends a play at the aligner's word end plus a fixed tail: 0.2 s inside a line, 0.35 s after a paragraph's last word, and only 0.12 s when the next word's aligned start touches this word's end. The recognizer's word end is early (a word like "statues" is ended near "stat" + the start of "u"), so a fixed tail cannot reach the real end of the word; only the audio can say where it dies away. The DAW path adds a second error: the stop is decided in the page from a position stream (about four a second) and then a `stop_play` round trip, so the stop is late by an unknown amount and never at the planned time.

**#22, the sound.** Editing already plays through the DAW's transport (`play_from`) when REAPER is linked, but it starts an open-ended play and stops it from the page. Everything else that plays a range (Proof's Hear it, Pickups) plays the app's own decoded audio when the DAW's `navigate` loop is not available, which is the muted version without the FX chain.

**#24, the pickup with no time.** Proof's Hear it is disabled with "This note has no time in its audio to play" when `finding.time_range` is absent. `repeats.groupFinding` (the finding behind every pickup and duplicate read from a take-review scan) never sets `TimeRange`, although every member carries its item GUID, source file and source offset. Its doc comment leaves "per-member Source/TimeRange resolution" to the scan service, and `takereview.Scanner.Scan` never did it. The time is dropped at the source, so the fix is there.

## Decisions

1. **One bridge command, `play_range(run, start, end)`, the DAW plays a range and stops itself.** The Lua script sets the cursor, starts the transport and, from the defer loop, stops at `end` (project seconds) and restores nothing else. It answers `RANGE_PLAYING|run|start|end` and, when it stops itself, `RANGE_STOPPED|run|position`. It is refused while recording (the existing sentence). A new `play_range` or `stop_play` replaces the one running. Capability: `transport_sync`, as `play_from`.
2. **Every range play goes through it:** Editing's play of words or a selection (the end is the audio-derived end below), Proof's Hear it and the Pickups page (project range of the note plus the roll). The app's own audio stays the fallback only when the DAW is not linked or cannot play, and says so through the existing result line or toast, as `playThrough` does today.
3. **The tail comes from the audio.** A pure function over the chapter's peaks (50 per second, already read for the ribbon) takes the aligner's end and finds where the envelope falls below a fraction of the word's own level and stays there for a short hold, bounded above by the next word's start (a pause) or the middle of a touching next word, and below by the current minimum tail. The fixed constants become the fallback when no peaks are loaded.
4. **A pickup finding carries a time.** `Scan` resolves the primary member's item in `req.Project` and sets `TimeRange` (project seconds from the item's position, trim and rate; source offsets from the member). Findings already saved without a time are filled on the next scan; the evidence version does not change.
5. **Contract:** new `play_range` row in the bridge wire table and `actions.go`, a `transportsync` action `play_range`, `hostAPIVersion` bump, contract rows and mock.

## Design check

| Principle | Check |
| --- | --- |
| One reason to change | The tail rule lives in `runway.ts` only; the stop timing lives in Lua only. |
| Depend on the port | Pages call the transport-sync port; the Lua details stay in the bridge. |
| No new fallback behaviour | `playThrough` order is unchanged. |

## What a fake cannot prove (pending, owner's REAPER)

That `reaper.defer` stops within a frame of `end` on a real project, that a play started this way keeps the project's FX chain audible, and that a stop at `end` does not clip the tail on the real output latency. Recorded in the pull request.
