# Shared Findings Contract

**Status: delivered.** This contract is the interoperability boundary for all analyzers and the Review page (Proof's book-level notes), which reads and decides every analyzer's findings (see "Reading and deciding findings"). The Go record, validation, stable IDs, review state, and the project-sidecar `Store` are in [`src/studio/desktop/internal/findings`](../../src/studio/desktop/internal/findings). Producers:

`<app>` stands for values in `config/brand.json` ([Product and technical names](codebase-map.md#product-and-technical-names)).

- The measurement analyzer ([Codebase map](codebase-map.md)).
- Transcript Compare's Go adapter ([`src/studio/desktop/internal/transcript/findings_adapter.go`](../../src/studio/desktop/internal/transcript/findings_adapter.go)). It reads `results_<run>.txt` directly for `confidence`/`timing_gap_seconds` (never forwarded by the Lua bridge) and joins those to the bridge-built rows by the same `<item_index>@<srcpos>` id the bridge uses, saving on `COMPARE_INSPECTED`. Each row also carries the item, take and track GUIDs the bridge appends to `COMPARE_MARKER`, which the adapter puts in `source`.
- Manuscript Guide's Go adapter ([`src/studio/desktop/internal/guide/findings_adapter.go`](../../src/studio/desktop/internal/guide/findings_adapter.go)): `entity` and `pronunciation` findings from the Story Bible.
- The read-aloud dialog's live flags ([`src/studio/desktop/internal/liveflags`](../../src/studio/desktop/internal/liveflags), analyzer `teleprompter`): suspected, `confidence: null` except a misread's, which is scored by how alike the script's and the heard words sound (`internal/soundalike`), anchored to the manuscript span until a take is known.
- The delivery profile's adapter ([`src/studio/desktop/internal/deliveryprofile/findings_adapter.go`](../../src/studio/desktop/internal/deliveryprofile/findings_adapter.go), analyzer `measure`): `delivery_qc` findings, one per rule a measured file did not meet or could not be measured for, saved per file (one scope each) when a measurement ends or the project's profile changes, with no manuscript position or time. Their `evidence_version` is the audio's fingerprint and the rule's bound, and the Review page opens them on Master & QC instead of the manuscript.
- Take review, take comparison, diagnostics and character continuity (analyzers `take-review`, `take-comparison`, `diagnostics`, `character-continuity`), described under the categories below.

## Required finding shape

Each analyzer writes a versioned JSON finding record (schema v1) with these fields:

| Field | Purpose |
| --- | --- |
| `schema_version`, `id`, `analyzer` | Stable format, identity, and producer. |
| `project` | Project path/identity plus the sidecar-relative output location. |
| `source` | DAW-neutral audio source identity and optional REAPER track, item, and take GUIDs. |
| `time_range` | Start/end seconds in project time, plus optional `source_start`/`source_end` source-relative offsets. |
| `manuscript` | Chapter ID/title, expected text, recorded text, and an optional `span` (paragraph id, character offsets, and an ordinal for repeated matches within a paragraph). |
| `category`, `severity`, `confidence` | Filterable classification; `confidence` is nullable (an analyzer that cannot produce a numeric score reports `null`, never a fabricated one), and `confidence_reason` is always required, explaining the score or its absence. |
| `evidence` | Measurements, transcript alignment, reference IDs, excerpts, or file references supporting the claim. |
| `evidence_version` | A hash of the audio-side evidence a decision was made against (recorded text, source file identity, timing beyond a tolerance). The store keeps a decision only while `id` and `evidence_version` both match; a changed `evidence_version` returns the finding to `unreviewed` but keeps the narrator's earlier note. |
| `suggested_action` | A reversible proposed operation, its parameters, and whether explicit confirmation is required. |
| `review` | `unreviewed`, `accepted`, `dismissed`, or `deferred`, with optional narrator note and timestamp, and an optional `type`: the one of ten words (`misread`, `skip`, `mouth`, `pron`, `pacing`, `repeat`, `plosive`, `noise`, `takes`, `breath`) the narrator chose for the kind of problem, absent until chosen. |
| `not_in_latest_run` | Set only by the store's merge, never by an analyzer: true when the latest run did not reproduce this finding. It is kept, not deleted, for audit. |

### What the review states mean for "is anything still open"

`accepted` means "this is real and needs fixing", not "resolved". A reader that asks whether a chapter has work left (the stage recommendation signals: the editing empty-space signal, `src/studio/desktop/internal/editing`, and the proofing pickups roll-up, `src/studio/desktop/internal/proofing`) counts `unreviewed`, `deferred` and `accepted` as open; only `dismissed` is not ([stage recommendations](stage-recommendations.md)). Deferring a finding therefore never clears a chapter. A finding marked `not_in_latest_run` counts as resolved only when the run that did not reproduce it was complete and covered its audio: take review's scans save only after a successful scan of the whole chapter scope, so their absences resolve; a Transcript Compare run covers only the items the narrator selected, so its absences resolve only for findings on an item that a recorded, complete run compared (a run with no ledger record resolves nothing). Otherwise the finding stays open.

## Identity

A finding's `id` is manuscript-anchored: chapter, paragraph, kind, expected span text, and an ordinal for repeats (`findings.StableID`), so it survives a different ASR model or timing jitter that an audio-anchored id would not. `evidence_version` is a separate value carried alongside the id for exactly the case an id-only scheme cannot express: the same line, re-recorded to say something different.

## Sidecar layout

Only the Go host writes to the project's findings sidecar; REAPER Lua and the Python sidecars never touch it. Every write is temp-file-then-rename (`findings.Store`, mirroring `transcript.Service.SaveHints`):

- `<project>/<app>/findings/<analyzer>/<scope>.json` — one analyzer's findings for one scope (typically a chapter id), fully regenerated on each `Store.SaveAnalyzerFindings` call. Findings absent from the fresh set are kept, marked `not_in_latest_run`, rather than deleted. An analyzer whose runs each cover only part of a scope (a live read-aloud session) calls `Store.MergeAnalyzerFindings` instead, which writes the fresh findings over the stored ones by id and keeps the rest unchanged, never marked `not_in_latest_run`.
- `<project>/<app>/findings/review.json` — one append-only decision history shared by every analyzer, written by `Store.RecordDecision`. Later entries for the same finding id supersede earlier ones; nothing is edited or pruned. Deciding what is already decided, against the same evidence and with the same note, adds no entry. Its `types` list holds the narrator's retypes, written by `Store.RecordType` the same way; a retype is not a decision and changes no status or count. Its `thread` list holds the notes on each finding (`Store.RecordThread`): an `add`, `edit`, `delete` or `restore` entry per change, by message id, replayed into the finding's `review.thread`. The thread is not a decision and does not follow the evidence version, so a re-check keeps it.

`resetDerived` (`src/studio/desktop/internal/manuscript/service.go`) removes the whole `<app>/findings` directory on a confirmed manuscript replace and on Clear, because findings are anchored to chapter and paragraph ids that no longer mean the same thing afterward.

## Reading and deciding findings

The UI reads and decides every analyzer's findings through six bindings in `src/studio/desktop/bindings_findings.go`; none of them names an analyzer, so an analyzer that saves into the store needs no binding of its own:

- `FindingsList(query)` answers `{findings, total}`: one page of the matches, filtered, sorted and paged in Go by `findings.Query` (`src/studio/desktop/internal/findings/query.go`). Filters are analyzer, category, severity, review status, chapter id, a minimum confidence and whether to include findings not in the latest run; sort keys are `chapter` (the default), `time`, `confidence` and `severity`, and a finding with no value for the key sorts last either way. A filter the store cannot answer fails the call.
- `FindingsGet(id)` answers one finding, or fails when the project no longer has it.
- `FindingsReview(id, evidenceVersion, status, note)` appends the decision and answers the finding as stored. It is refused, and nothing is recorded, when `evidenceVersion` is not the stored finding's (the analyzer ran again since the page showed it) or the finding is gone. `unreviewed` reopens a decision; the host stamps the time.
- `FindingsSetType(id, evidenceVersion, type)` appends the narrator's chosen type and answers the finding as stored, refused like `FindingsReview` for a stale `evidenceVersion` or a gone finding, and for a word outside the ten. Choosing the analyzer's own word (`findings.DefaultNoteType`) leaves `review.type` absent.
- `FindingsThread(id, op, messageId, who, text)` changes the finding's thread of notes (`add` with `who` `you` or `proofer` and the text, `edit` with the message id and the new text, `delete` or `restore` with the message id) and answers the finding as stored, with `review.thread`. Empty text, an unknown author or op, and a message the thread does not have are refused and nothing is written. The page's Undo of a change is the opposite change.
- `FindingsSummary()` answers the latest run's counts by review status, `decided` (accepted, dismissed or deferred) and `cleared` (dismissed, which includes a waive), how many findings the latest run did not reproduce, and the analyzers, categories and chapters present. The navigation badge is the open count, `total - cleared`, read through `proofProgress`. An accepted finding is decided and still open: the store records no fix or kept take that would clear it.

The finding itself crosses the boundary in this document's snake_case; the envelopes around it are camelCase like every other binding. The UI's schema is `src/studio/ui/src/api/schemas/findings.ts`, the golden payloads are `tests/fixtures/contracts/findings-{list,review,summary,retype,thread}.json`.

A finding that carries a REAPER item GUID can also be gone to and looped in REAPER through `FindingsGoTo(id)`, `FindingsLoop(id)` and `FindingsStopLoop()`, with `FindingsReaperStatus()` saying whether REAPER is there (`src/studio/desktop/bindings_navigation.go`; [going to and looping a finding](reaper-navigation.md#from-the-review-page)). They too take only the id: the host reads `source` and `time_range`'s source times from the store. A finding whose `evidence.members` lists several reads, each with its own `item_guid`, `take_guid`, `source_start` and `source_length` (take review's pickup and duplicate_read groups), is gone to and looped one read at a time with `FindingsGoToRead(id, read)` and `FindingsLoopRead(id, read)`, `read` being the index in `members` ([Take review](../utilities/take-review.md)); the page checks `members` against `takeReviewEvidenceSchema` (`src/studio/ui/src/api/schemas/takeReview.ts`), and `tests/fixtures/contracts/findings-list-take-review.json` pins it. A `take_comparison` finding (analyzer `take-comparison`, [Codebase map](codebase-map.md)) keeps its group's reads in the same `members` order, so the same two bindings go to and loop its reads; each member adds whether it was compared (or why not), its word statuses and divergences over the group's span, and its per-category take metrics. It has `confidence: null` and no suggested action: a comparison ranks nothing. The page checks it against `takeComparisonEvidenceSchema`, and `tests/fixtures/contracts/findings-list-take-comparison.json` pins it. `FindingsAddMarker(id)` adds one take marker in REAPER for a finding, whatever its decision (SD-4), named like Transcript Compare's markers, in one undo point ([adding the approved marker](reaper-navigation.md#adding-the-approved-marker), [Adding the approved marker](reaper-navigation.md#adding-the-approved-marker)).

## Rules

- Audio and manuscript paths remain local and are never embedded in a report intended for sharing unless the user asks.
- REAPER navigation uses GUIDs only: a finding is found by its `source.item_guid` (and `take_guid`) and its source-relative time. Project-time data is kept for sorting and display, never as a navigation fallback: a finding whose GUID no longer resolves is reported stale and nothing is moved ([going to and looping a finding](reaper-navigation.md), [Going to and looping a finding in REAPER](reaper-navigation.md)).
- A finding can suggest one action but cannot execute it. The REAPER adapter owns execution and undo blocks, and the narrator confirms each action: the marker is sent when the narrator presses Add marker on a note, in one click (SD-4 left out the accepted-only gate and the confirm).
- An analyzer creates findings without importing a DAW API; only the DAW adapter talks to the DAW.
- An analyzer must identify uncertain or unavailable evidence rather than fabricate a score.
- Dismissed findings remain auditable and are not regenerated as new IDs unless source evidence materially changes.

## Initial categories

`transcript_discrepancy`, `pronunciation`, `entity`, `pickup`, `duplicate_read`, `take_comparison`, `character_continuity`, `pacing`, `audio_quality`, `delivery_qc`, `silence_cleanup`, and `level_consistency`. `silence_cleanup` is raised by the silence cleanup classifier (`measure.Diagnostics.CleanupFindings`, [cleanup.go](../../src/studio/desktop/internal/measure/cleanup.go)). Each is an info candidate classed silence, breath or click, with `suggested_action` `{kind: "split_and_trim", parameters: {class, cut_start_seconds, cut_end_seconds}, requires_confirmation: true}` in source-file seconds. `character_continuity` is raised by `internal/continuity` ([baseline.go](../../src/studio/desktop/internal/continuity/baseline.go)) for a dialogue line that measures outside its character's approved reference distribution. It is a `warning`, or an `info` when the recording chain may differ, never an `error`. Its evidence holds the reference ids, a per-feature table (value, reference median, min, max and sample size), the distance and threshold, the distance to the narration reference, and the chain check. Its `suggested_action` is `{kind: "audition_reference", parameters: {reference_ids}, requires_confirmation: false}`. No analyzer raises `level_consistency` yet ([#1477](https://github.com/countrymanprime/narration-studio/issues/1477)).
