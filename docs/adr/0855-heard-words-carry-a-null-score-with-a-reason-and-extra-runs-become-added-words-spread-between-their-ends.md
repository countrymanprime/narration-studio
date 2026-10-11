# 0855. Heard words carry a null score with a reason, and extra runs become added words spread between their ends

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none. It extends the stored alignment of [ADR 0242](0242-the-recording-check-writes-the-chapters-word-alignment-as-additive-lines-and-align-again-never-transcribes.md) and applies the null-with-a-reason rule of [ADR 0830](0830-the-recording-check-names-its-gaps-missing-extra-or-misread-and-a-confidence-is-null-with-a-reason-until-words-are-scored.md) to words.

## Context

The Studio Next mock's Editing page asks an alignment provider what was heard (`docs/research/mockups/studio-next/src/providers/alignment.ts`): `heard(req)` answers words with `text`, `off0`, `off1`, a score `conf` and an `added` flag, or null while nothing is transcribed, and `engine()` names the recogniser ("Flagged by <engine>"). The PRD (`docs/prds/studio-next-script-based-editing.prd.md`, slice SNE-2) puts this behind an `AlignmentPort` read from the stored alignment.

The stored alignment (`WorkspaceAlignment`, `apps/desktop/internal/coverage/workspace.go`) already times every heard token in its item's source, but the Editing audit (`docs/research/studio-next-editing-audit.md`, finding 3) found two things missing: a score per word and an added flag. The coverage sidecar never reads Whisper word probabilities, so no code path can produce a score. A stored extra run (`COVERAGE_EXTRA`) keeps its text and its two ends, not a time per word. The cached words file does time each word, but the extra line does not say which of those words it covers, and the read binding never opens the evidence cache.

## Decision

The `WorkspaceAlignment` payload grows, additively, in `apps/desktop/internal/coverage/workspace.go` (`AlignmentView.MarshalJSON`):

- Each token carries `conf: null` and `confReason: "no_word_scores"`. The UI schema (`apps/ui/src/api/schemas/workspace.ts`) accepts a number only beside no reason and null only with one, so a later score needs no wire change. `workspace_test.go` fails when `coverage_mode.py` starts carrying probabilities, so scoring words is a deliberate change.
- Each extra run carries `words`: one per whitespace word, `added: true`, scored like a token. On one item they are spread evenly between the run's ends and marked `timing: "spread"`; a run whose ends are on two items has no one source timeline, so its words sit at its start with no duration, `timing: "unplaced"`. Nothing claims a recogniser time.
- The view carries `engine {id, name}` (`whisper:<model>`, `Whisper <model>`) from the first pass's model when the report holds an alignment, and omits it otherwise.

`apps/ui/src/ports/alignment.ts` is the `AlignmentPort`. `heard(chapterId)` reads `workspaceAlignment` and answers the words in reading order: each heard token with its paragraph id, ordinal, item and source seconds (`off0`, `off1`), the misread word where one was said, and each run's added words after the token it follows. It answers null with a reason for a chapter never checked, one that needs aligning again, or a payload with no engine. The port never starts a check or an alignment (the PRD's "A second alignment run" exclusion).

`snap`, the cut point moved to a zero crossing, is a host rule: the nearest zero crossing within 2 ms of the asked time, computed by the host from the item's audio. SN-E222 adds it to this port.

## Consequences

- The Editing page reads words with times from real data, and shows no low-confidence mark until a sidecar scores words: its legend count is 0, which is true.
- Added words have honest but approximate times. A cut placed on one lands inside the run, not on the word's own edge; reading the cached words file for the run's span would fix that and is a host change behind the same wire.
- `HeardWord.conf` is `number | null` on the port, while the Editing model's `HeardWord` (`components/editing/model/align.ts`) takes a number. The slice that feeds the model from this port decides what a null score means there.
- `hostAPIVersion` does not change: every new field is optional on the wire, and the four existing goldens only gained fields.
- Scoring words supersedes this ADR's score rule: bump `WORDS_SCHEMA_VERSION`, invalidate the cache and amend the guard in `workspace_test.go`.
