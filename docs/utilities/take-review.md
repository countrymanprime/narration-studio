# Take review (retired)

**Status: Removed** (2026-11-03, [#2765](https://github.com/countrymanprime/narration-studio/issues/2765) to
[#2774](https://github.com/countrymanprime/narration-studio/issues/2774)). The owner chose to delete it rather than wire it
again.

Take review scanned a chapter track, plus one pickup track or stretch of the timeline, for repeated reads, saved each group
as a finding, compared a group's reads word by word and added a chosen read as a take. No page had started a scan since the
Proof swap (SN-Q9, 2026-10-12). What went with it:

- The ten host bindings: `TakeReviewScanStart`, `TakeReviewScanState`, `TakeReviewScanCancel`, `TakeReviewCreateTake`,
  `TakeComparisonStart`, `TakeComparisonState`, `TakeComparisonCancel`, `WorkspaceTakesCompareStart`, `FindingsGoToRead`
  and `FindingsLoopRead`.
- The host packages `internal/takereview`, `internal/takecompare`, `internal/takedivergence` and `internal/repeats`, and
  the grouping in `internal/comparerun` (`FindRepeats`).
- The Transcript Compare sidecar's `--find-repeats` and `--take-divergence` modes.
- The REAPER bridge's `create_take` command, its `TAKE_CREATED` and `TAKE_STALE` events and the DAW port's `take_create`
  capability. Editing's [takes](../guides/using-the-app/editing.md#takes) offer the other takes of the item and the other
  retakes on fixed lanes; they no longer offer a read from another item.
- The `TakeReview` settings tool and chapter sync's record of which pickup tracks a scan had seen (`pickupsScannedAt`,
  `pickupsChanged`). A chapter's row still names its pickup track.

Pickups are recorded in the Booth; a read on a separate pickup track is not grouped with the chapter's reads.

## Findings a project already holds

A project scanned before the removal keeps its take-review findings (analyzer `take-review`, categories `pickup` and
`duplicate_read`) and take comparisons (analyzer `take-comparison`, category `take_comparison`). They are plain findings:

- Proof lists them and the narrator decides them like any other. A group's line says what it was from its own evidence
  ("Partial pickup: 2 reads of sentences 4–8") and its type is Repeat ([`findingFormat.ts`](../../src/studio/ui/src/components/proof/findingFormat.ts),
  `findings.DefaultNoteType`). They have no time in their audio, so the In view filter always lists them, and Hear it,
  Show in the DAW and Add marker are off with that reason. Nothing acts on their reads any more: no list of reads, no
  audition, no add as take, no comparison panel.
- An open take-review pickup still counts against the chapter's pickups signal, under the label "Take review", until the
  narrator decides it ([`internal/proofing/sources.go`](../../src/studio/desktop/internal/proofing/sources.go)). A chapter
  with none is not told about take review.
- Editing does not offer their reads as takes.

`bindings_retired_findings_test.go`, `TestWorkspaceTakesOffersNoReadsFromASavedTakeReviewGroup`,
`TestSignalProviderRetiredTakeReview`, `TestARetiredTakeReviewPickupIsARepeat`, `findingFormat.test.ts`, `noteRows.test.ts`,
`NotesPanel.test.tsx` and `InspectorActions.test.tsx` pin this.
