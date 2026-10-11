# 0125. Recording-coverage ground truth is scripted recordings with paragraph labels, and a real corpus plugs in through a directory variable

**Status:** Proposed
**Date:** 2026-09-23

## Context

No recording-coverage threshold should ship until it has been scored against labeled chapters. On 2026-09-23 the owner decided to use synthetic fixtures for now instead of an owner-supplied corpus, to ship the defaults as Proposed and labeled uncalibrated, and to let a real permissioned corpus replace the fixtures later. Piper-rendered audio was one way to build them. Audio in the repo is large, and Piper is not installed in CI. It would also add a text-to-speech model's own errors to every measurement before the analyzer existed.

## Decision

The committed ground truth is text-only: scripted recordings plus labels, and no audio. `sidecars/transcript-compare/tests/fixtures/coverage/` holds a canonical `manuscript.json` (public-domain *Alice* excerpts plus one chapter written for this repo) and one JSON case per recording. A case lists the chapter's items in position order. Each item is a list of `read`, `say` and `pause` segments with an optional played range. Each case has a `present | partial | missing` label for every paragraph, typed regions, a `textComplete` verdict and a `tune | held_out` split. `sidecars/transcript-compare/tests/coverage_harness.py` validates the labels (`textComplete` holds exactly when every paragraph is present, and every paragraph that is not present is in a region). It renders each script into timed transcript words and scores any `analyzer(chapter, items)` for verdict, paragraph labels and region location. A permissioned corpus with the same layout, whose items may name audio files inside it, joins through the `NARRATION_COVERAGE_CORPUS` directory variable. The pytest check on that corpus is skipped when the variable is unset. The format and the labeling rules are in `docs/research/recording-coverage-fixtures.md`.

## Consequences

- The harness and every committed case run in `pnpm check` on any machine, with no model, no audio and no owner data. The whole set is under 64 KiB.
- Labels describe what was read, not what an analyzer can detect, so the same cases score the alignment ([ADR 0126](0126-recording-coverage-reads-the-take-markers-sequencematcher-alignment-and-folds-chance-matches-into-gaps.md)), the sidecar mode (the rendered words have the shape of its words files, [ADR 0127](0127-the-coverage-sidecar-mode-reads-a-json-manifest-keeps-one-words-file-per-item-and-writes-tagged-json-lines.md)) and the thresholds ([ADR 0132](0132-the-recording-check-ships-0-8-3-8-3-chosen-on-synthetic-fixtures-and-labelled-uncalibrated.md)).
- A perfect transcript does not measure transcriber error. The false "not met" rate on real speech is still unknown, and the default thresholds stay uncalibrated until audio is scored: rendered audio outside the repo, or the permissioned corpus through the variable.
- Four short chapters give counts, not rates. Growing the set means adding case files. Changing the case schema means bumping `schemaVersion` in the harness and in every case.
- Rendering audio into the repo, or making the corpus mandatory, would take a new ADR that supersedes this one.
