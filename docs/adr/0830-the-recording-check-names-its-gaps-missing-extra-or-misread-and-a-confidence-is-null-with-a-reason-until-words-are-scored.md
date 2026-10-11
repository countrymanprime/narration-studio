# 0830. The recording check names its gaps missing, extra or misread, and a confidence is null with a reason until words are scored

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none. It adds to the stored report of [ADR 0129](0129-the-coverage-bindings-answer-refusals-as-results-end-with-one-job-event-and-fill-recordedfraction-only-from-a-current-check.md) and uses the alignment lines of [ADR 0242](0242-the-recording-check-writes-the-chapters-word-alignment-as-additive-lines-and-align-again-never-transcribes.md).

## Context

The Studio Next mock (`docs/research/mockups/studio-next/src/selectors/gaps.ts`) sorts what the recording check found into three kinds of gap: a stretch of script not said is `missing`, words said that are not in the script are `extra`, and other words in place of the script's are a `misread`. Only gaps inside the read part are lines to redo; paragraphs unread at the start or the end are unfinished recording. Each pickup carries a confidence that is a number or null with a reason.

The stored report has none of this by name. It has typed regions (`head`, `tail`, `skip`, `short_read`, `different_text`), per-token lines and extra runs. The audit (`docs/research/studio-next-proof-audit.md`, "Wire and sidecar surface") found that the coverage sidecar never reads Whisper word probabilities, so any confidence the UI showed would be made up.

## Decision

The host derives the taxonomy from the stored report on read (`apps/desktop/internal/coverage/gaps.go`, `ClassifyGaps`). The sidecar, `WORDS_SCHEMA_VERSION` and the cached results do not change. `ReportView` gains `gaps` and `unfinished`, both additive.

| Region kind | Gap kind |
| --- | --- |
| `skip` | `missing` |
| `different_text`, `short_read` | `misread` |
| `head`, `tail` | not a gap: `unfinished` |
| any other kind | `other`, carried and never dropped |

- An `extra` gap is each extra run that sits between the first and last read word.
- A region is a gap only when all its paragraphs lie between the first and last read paragraph. `unfinished.start` and `unfinished.end` count the unread paragraphs at either end; a chapter with nothing read has `start` set to every paragraph.
- **Unfinished is not a pickup.** It is recording still to do.
- A gap id is its kind, first paragraph and first token, so Proof can key a note to it. Gaps come in reading order.
- Every gap has `confidence: null` and `confReason: "no_word_scores"`. No code path produces a number.

## Consequences

- Proof can list pickups and unfinished recording without a sidecar change, and a result stored before this ADR reads as no gaps.
- A real score needs the sidecar to read `word.probability`, a `WORDS_SCHEMA_VERSION` bump and invalidation of every cached words file. A test fails if the sidecar starts carrying probabilities, so that change is deliberate. Calibration would need synthetic or public-domain audio and stays provisional.
- A misread inside a read paragraph that no region records is not a gap. If one matters, it needs a sidecar tag (ADR 0127: additive) and a new ADR.
- The schema accepts a number for `confidence` only with a reason beside it, so a later score needs no wire change.
