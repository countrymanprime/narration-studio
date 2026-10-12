# Recording coverage: the synthetic fixture set and harness

**Status: in place, 2026-09-23.** Phase 1 of the recording-coverage PRD (delivered and deleted; the steady state is [the recording check](../utilities/recording-coverage.md)), under D12 and Q15 as amended on 2026-09-23: no coverage threshold ships until it has been scored against labeled chapters. For now the labeled chapters are synthetic. The owner chose constructed fixtures over an owner-supplied corpus, so the defaults that Phase 8 ships stay Proposed and labeled uncalibrated until a real, permissioned corpus recalibrates them. [ADR 0125](../adr/0125-recording-coverage-ground-truth-is-scripted-recordings-with-paragraph-labels-and-a-corpus-directory-variable.md) records the format choice.

The format, the labeling rules, the scoring and how to run the harness are in the fixture set's [README](../../sidecars/transcript-compare/tests/fixtures/coverage/README.md).

## Baseline: the stub analyzer

`presence_stub` treats a paragraph as present when at least 95% of its words were heard anywhere in the recording, and partial when at least 50% were. It ignores order on purpose. Its result on the committed set on 2026-09-23:

| Split | Cases | False met | False not met | Paragraph labels agreed | Regions located |
| --- | --- | --- | --- | --- | --- |
| tune | 9 | 1 (`c2-pickup-at-end`) | 1 (`c4-names-and-numbers`) | 34/41 | 3/4 |
| held_out | 7 | 1 (`c3-refrain-read-once`) | 1 (`c4-misread`) | 27/29 | 3/4 |

The stub is fooled in the cases where order matters (a pickup and a refrain), and it rejects the cases where the right words come out spelled differently (numbers, names, misreads). A real analyzer has to handle both. These numbers are a floor for comparison. They are not a target. The Phase 2 coverage model scores 0 false met, 0 false not met, 70/70 labels and 8/8 regions on the same set; see [the alignment spike](recording-coverage-alignment-spike.md).

## Limits

- The words are synthetic text, so nothing here measures how often Whisper drops or garbles words in a clean read. That rate decides the false "not met" rate. Phase 8 simulated it and measured it on Piper renders: see [the calibration](recording-coverage-calibration.md).
- One synthetic speaking rate and no ASR timing jitter. Positions are only as good as `WORD_SECONDS`.
- Sixteen cases over four short chapters is enough to exercise every condition, but too few to make a rate meaningful. Report counts, not percentages.
- The editing-readiness PRD (ER Phase 1) needs its own audio corpus for clicks and breaths. It can reuse this layout (`manuscript.json`, `cases/*.json` with a `split`, a `*_CORPUS` directory variable), but its labels are time ranges, so it cannot reuse these files.
