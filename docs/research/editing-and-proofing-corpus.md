# Editing and proofing: a synthetic signal-level corpus, provisional

**Status: provisional, 2026-09-27.** The stage recommendation verdict for editing and proofing ([stage recommendations](../architecture/stage-recommendations.md)) needs validating end to end against a narrator's own stage labels (D12), and neither a real editing corpus nor a real proofing corpus exists: both need permissioned, annotated audio. The two tests below are a synthetic, signal-level stand-in, so the false-"done" invariant has some end-to-end proof; they are replaced, not extended, once a real permissioned corpus lands ([ADR 0364](../adr/0364-the-end-to-end-corpus-validation-is-synthetic-and-provisional-until-a-permissioned-project-re-runs-it.md)). The re-run on a permissioned project is pending with the owner on [#992](https://github.com/countrymanprime/narration-utils/issues/992).

## What is here

| Path | What |
| --- | --- |
| `apps/desktop/internal/editing/corpus_test.go` | `TestStageRecommendationsOverTheEditingCorpus`: 4 labeled cases over the real `stages.Service` and the real editing `SignalProvider` and `Service` (a real scan job, cache, ledger and findings store) |
| `apps/desktop/internal/proofing/corpus_test.go` | `TestStageRecommendationsOverTheProofingCorpus`: 4 labeled cases over the real `stages.Service` and the real proofing `SignalProvider` |

Each case is a Go closure that builds its own evidence (a scan job's own findings, a fake Transcript Compare run judge, a stored render measurement), the pattern `apps/desktop/internal/coverage/corpus_test.go` uses for its sidecar. Each case's `label` field says what it proves. There are no JSON fixture files and no corpus directory variable: a real editing or proofing corpus will need time-range labels over audio, not a signal input.

## Findings

- **The invariant holds on all eight cases.** Both tests assert that a case labeled anything but "done" (`not_ready` or `unknown`) never reads `recommended`, and log `N/N cases agreed ..., 0 false recommended`.
- **Under the default required set, editing never reads `recommended`.** Clicks and breaths are gated off until their detectors are validated ([ADR 0510](../adr/0510-click-and-breath-signals-open-only-on-a-recorded-permissioned-held-out-run-at-target-in-every-condition.md)) and cannot report `met`, so `clean-scan-default-required-set` reads `unknown`. Only a narrator who deselects the click and breath checks in the stage recommendation settings gets a recommendation from empty space alone (`clean-scan-clicks-and-breaths-deselected`).
- **A failed required delivery check blocks finalizing on its own** (`delivery-check-fails-even-with-clean-pickups`), and an empty delivery profile narrows proofing's required set to pickups alone through `FilterRequired`, the mechanism `apps/desktop/bindings_stages.go` wires in production.

"4/4 cases agreed" is not a calibrated result: the cases say nothing about the narration audio a real detector will see.
