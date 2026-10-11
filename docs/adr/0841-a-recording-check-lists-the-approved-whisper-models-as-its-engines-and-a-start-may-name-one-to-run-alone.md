# 0841. A recording check lists the approved Whisper models as its engines, and a start may name one to run alone

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none. It adds to [ADR 0129](0129-the-coverage-bindings-answer-refusals-as-results-end-with-one-job-event-and-fill-recordedfraction-only-from-a-current-check.md) and leaves ADR 0107 and ADR 0414 unchanged.

## Context

The Studio Next mock's Check recordings dialog has a "Speech model" select over `engines()`, the engines the host offers to check a finished recording (`docs/research/mockups/studio-next/src/providers/speech.ts`). `WhisperCatalog()` reports the approved models but is not an engines list, and `CoverageStart` takes its model from the cascade settings or `TranscriptCompare.model_size`, never from the caller (`docs/research/studio-next-proof-audit.md`, "Wire and sidecar surface").

## Decision

1. `CoverageEngines()` answers `{engines, default}`. `engines` has one row per model in the approved Whisper catalog, in catalog order: `id`, `label` (the model's `displayName`), `family` (always `whisper`) and `installState`. The list is read from the catalog, not rebuilt from settings.
2. Moonshine is not a recording-check engine. It stays the Booth's live engine (ADR 0414), including where the Windows teleprompter ships it, so no Moonshine row exists in the answer.
3. `default` is the model a start naming none would use: the cascade's first-pass model with the cascade on, else `TranscriptCompare.model_size`. When that model is not in the catalog, `default` is the first listed engine, so it is always one of the listed ids.
4. The list reads the catalog and the settings, not the project, so it answers with no project open. A start still refuses without one.
5. `CoverageStart` reads `options["model"]`. A named model that is approved and installed runs; an unknown id is refused with "the selected Whisper model is not in the approved catalog" and nothing starts; an approved model that is not installed answers `asset_required` for that model.
6. A named model replaces the cascade for that run. It is the whole check, with no re-check pass, even with the cascade on. With no model named, behaviour is unchanged.
7. Chunk length, overlap and parallel workers are not exposed. The transcript-compare sidecar has no such parameters (`sidecars/transcript-compare/core/coverage_mode.py` mentions none). The host reports no per-engine speed factor either, so a time estimate is "Not measured yet".

## Consequences

- The Check recordings dialog lists what the host reports and does not rebuild the rule from the Whisper catalog and the cascade settings.
- The change is additive: a new read binding, a new optional start option and a `hostAPIVersion` bump.
- A new engine family is a new ADR and a change to the Go row, the schema's `family` literal and the mock together.
