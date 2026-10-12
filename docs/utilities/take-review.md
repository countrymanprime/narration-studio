# Take review

**Status: Implemented.** The checks on a real chapter and in the owner's REAPER are pending (see [What is still open](#what-is-still-open)).

## User problem

A narrator records a line more than once: a restart after a stumble, a pickup of part of a line on a pickup track or later
in the session, an exact copy, a near-identical re-read. Finding the alternates by ear, lining them up against the script,
listening to them side by side and putting the chosen one in the right item is slow, and a single "best take" score would
hide why one read is better than another. Take review finds the repeated reads, lets the narrator review them with
evidence, adds a chosen read as a take, and compares the takes of one part of the script category by category. It never
makes a take active, moves or deletes audio, or ranks the reads.

## Workflow

Since the Proof swap (SN-Q9, 2026-10-12) no page starts a scan, lists a group's reads or offers Add as take: the scan
dialog and the reads list were deleted with the old Proof notes page, and the take suggestion belongs to Editing (DQ-15 in
the [Studio Next Proof and Pickups PRD](../prds/studio-next-proof-and-pickups.prd.md#decisions)). The host side below is
unchanged. A pickup read an earlier scan set beside a paragraph is one of that line's
[takes on Editing](../guides/using-the-app/editing.md#takes), where Keep take makes it the one that plays. The steps the
host supports:

1. The scan (`TakeReviewScanStart`) takes the chapter track and at most one pickup addition, a pickup track or a stretch
   of the timeline. The scan is a cancellable job with the sidecar's own progress. A track named as the
   chapter's pickup track ("Chapter 6 (pickups)") is recognised by chapter sync and carried on that chapter's row of
   `chaptersync:state` (`pickupTrackName`), so a scan can start with it. A finished scan that included
   the pickup track records it as scanned, and the row's `pickupsChanged` says when the track has changed since, so the
   scan can be offered again. A pickup track is never the chapter's link: the recording check still reads the chapter
   track only.
2. Each group of repeated reads is a finding (category `pickup` or `duplicate_read`) with its reads: range in its own file,
   whole or partial coverage of the span, match quality, exact-copy flag. Go to and Loop per read in REAPER; Audition two
   reads from their raw source over `/media`.
3. Add as take (`TakeReviewCreateTake`) on an accepted group: the target item and the read that becomes the take; REAPER
   adds it in one undo step, with provenance in the take's extension data.
4. Take comparison (`TakeComparisonStart`): a `take_comparison` finding that sets the group's reads side by side over the same words, how each
   read the script and its audio evidence per category.
5. The narrator makes the chosen take active in REAPER.

The narrator's flow before SN-Q9 is in the [recording and comping workflow](../workflows/recording-and-comping.md).

## How it works

| Step | Code | Decision |
| --- | --- | --- |
| Take-aware project model: every take of every item, its GUID, source, `SOFFS`, `PLAYRATE`, `SECTION`; `Project.ItemByGUID` | `apps/desktop/internal/tracks` ([Tracks](tracks.md)) | [ADR 0100](../adr/0100-analysis-evidence-is-two-hash-keys-one-ledger-record-per-run-and-a-narrator-confirmed-track-map.md) (parser superset) |
| Scan scope (chapter track plus one pickup track or range), manifest, thresholds from project settings | `apps/desktop/internal/takereview` (`buildManifest`, `ValidateScope`, `ResolveThresholds`, `ResolvePickupScope`) | [ADR 0124](../adr/0124-take-review-groups-are-reviewed-on-the-review-page-each-read-is-navigated-by-its-index-and-the-scan-is-a-cancellable-job.md) |
| Repeated-span detection: transcribe each read, align to the manuscript with the markers' diff, group reads whose spans overlap, flag exact copies by source identity | `compare.py --find-repeats` (`sidecars/transcript-compare/core/compare.py`) | |
| Groups to findings: `pickup` (`evidence.kind` `restart`, `pickup`, `exact_copy`) or `duplicate_read` (`near_duplicate`), stable ids and evidence versions | `apps/desktop/internal/repeats` | |
| The scan job and per-read navigation (no page calls them since SN-Q9) | `apps/desktop/takereview_job.go`, `bindings_navigation.go` | [ADR 0124](../adr/0124-take-review-groups-are-reviewed-on-the-review-page-each-read-is-navigated-by-its-index-and-the-scan-is-a-cancellable-job.md), [ADR 0121](../adr/0121-going-to-and-looping-a-finding-is-by-guid-and-source-time-makes-no-undo-point-and-stop-restores-what-the-loop-changed.md) |
| Add as take: `create_take` in REAPER, re-resolving GUIDs, active take and item length untouched, one undo step | `integrations/reaper/narration_take_review.lua`, `apps/desktop/internal/takereview/createtake.go` | [ADR 0098](../adr/0098-take-provenance-in-take-extension-data-extends-adr-0026.md) |
| Audition: two raw-source ranges with pre and post roll, one playing at a time | `apps/ui/src/components/proof/AuditionDialog.tsx`, `apps/ui/src/components/engine/useRangePlayer.ts` | |
| Take metrics: clipping, noise, level against neighbours, duration, pause profile, each measured or unavailable with a reason | `apps/desktop/internal/measure` (`MeasureTake`, `TakeSourceRange`) | [ADR 0140](../adr/0140-take-metrics-are-per-category-evidence-over-a-takes-source-range.md) |
| Per-take divergence: every span word's status and time, every divergence as words plus seconds | `compare.py --take-divergence` (`core/take_divergence.py`, `core/take_divergence_mode.py`) | [ADR 0141](../adr/0141-per-take-divergence-is-localized-by-the-markers-diff-and-asr-word-timestamps.md) |
| Take comparison: same-span checks, manifest from the saved project, one `take_comparison` finding, the view | `apps/desktop/internal/takecompare`, `apps/desktop/takecompare_job.go` (the view of a comparison went with the chapter workspace's Takes panel, SN-E9; the Editing page's takes show their own evidence) | [ADR 0165](../adr/0165-a-take-comparison-is-one-finding-per-group-over-its-one-span-built-from-the-saved-project-and-never-ranked.md) |

The wire contracts (`TakeReviewScanStart/State/Cancel`, `TakeReviewCreateTake`, `TakeComparisonStart/State/Cancel`, the
evidence of both finding kinds) are in `apps/ui/src/api/schemas/takeReview.ts`, pinned by the goldens under
`tests/fixtures/contracts/` (`takereview-*`, `takecomparison-*`, `findings-list-take-review.json`,
`findings-list-take-comparison.json`, and `take-divergence-results.json`, the sidecar's own results file that the Go parser
reads). The trust boundaries are rows 4a and 4f of the [threat model](../architecture/threat-model.md).

### Settings

Project settings, tool `TakeReview` (built-in defaults in `config/defaults.json`; an unparseable or out-of-range stored value
falls back to the default rather than failing a scan):

| Key | Default | Meaning |
| --- | --- | --- |
| `full_coverage_threshold` | `0.9` | A read covering at least this much of its group's span is a full re-read; less is a partial pickup. |
| `near_duplicate_quality_threshold` | `0.97` | A group whose reads are all full and all match the script at least this well is a near duplicate (`duplicate_read`), not a restart. |
| `pickup_track_name` | empty | The pickup track a scan starts with. |
| `pickup_range_start_seconds`, `pickup_range_end_seconds` | empty | The stretch of the timeline a scan starts with (never both a track and a range). |

## Decisions

- Scan scope, the review surface and the cancellable job: [ADR 0124](../adr/0124-take-review-groups-are-reviewed-on-the-review-page-each-read-is-navigated-by-its-index-and-the-scan-is-a-cancellable-job.md); scope is built by `takereview.buildManifest`.
- Detection is transcript-to-manuscript alignment plus exact-copy detection from source identity, in Transcript Compare's sidecar (`compare.py --find-repeats`); Go only adapts the output (`apps/desktop/internal/repeats`). Acoustic similarity (fingerprints, DTW) and a Silero VAD restart cue were not adopted; they need the local-dependency protocol first.
- Spans come from alignment and the item's own GUID is the target, so no manuscript line-identity stamp is needed (`Project.ItemByGUID`, [Tracks](tracks.md)).
- Add as take, with provenance in take `P_EXT`: [ADR 0098](../adr/0098-take-provenance-in-take-extension-data-extends-adr-0026.md).
- Go to and Loop per read: [ADR 0121](../adr/0121-going-to-and-looping-a-finding-is-by-guid-and-source-time-makes-no-undo-point-and-stop-restores-what-the-loop-changed.md).
- Take metrics are evidence per category, with no composite score: [ADR 0140](../adr/0140-take-metrics-are-per-category-evidence-over-a-takes-source-range.md).
- Divergence is localized by the markers' diff and Whisper word timestamps: [ADR 0141](../adr/0141-per-take-divergence-is-localized-by-the-markers-diff-and-asr-word-timestamps.md), [evaluation](../research/take-divergence-evaluation.md).
- A take comparison is one finding per group and is never ranked: [ADR 0165](../adr/0165-a-take-comparison-is-one-finding-per-group-over-its-one-span-built-from-the-saved-project-and-never-ranked.md).
- Take review never makes a take active; the workspace Takes panel does: [ADR 0233](../adr/0233-the-app-may-make-a-take-active-by-guid-in-one-undo-step.md), [ADR 0700](../adr/0700-the-takes-panel-lists-a-passages-takes-from-the-saved-project-and-chooses-one-by-an-id-the-host-offered.md).
- Thresholds: [Settings](#settings).

## What is still open

A scan of a real chapter with calibration, the owner's REAPER checks, timing measurements and later work are tracked in [#1455](https://github.com/countrymanprime/narration-utils/issues/1455).
