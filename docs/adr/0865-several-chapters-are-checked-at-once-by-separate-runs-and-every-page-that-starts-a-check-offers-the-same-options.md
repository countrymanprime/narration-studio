# 0865. Several chapters are checked at once by separate runs, and every page that starts a check offers the same options

**Status:** Proposed
**Significance:** An interface between parts and a construction technique: the coverage service goes from one job to several, and the Check recordings dialog and a chapter's own check panel share one component for the choices. Undoing it means returning the service to a single job and every start-time caller to its own controls.
**Date:** 2026-10-17
**Supersedes:** none. It extends [ADR 0864](0864-a-long-recording-is-checked-in-overlapping-chunks-by-parallel-whisper-processes-and-whisper-word-scores-choose-the-passages-a-larger-model-looks-at-again.md) and [ADR 0129](0129-the-coverage-bindings-answer-refusals-as-results-end-with-one-job-event-and-fill-recordedfraction-only-from-a-current-check.md) (one check runs at a time).

## Context

[ADR 0864](0864-a-long-recording-is-checked-in-overlapping-chunks-by-parallel-whisper-processes-and-whisper-word-scores-choose-the-passages-a-larger-model-looks-at-again.md) made one chapter's check parallel and gave the Check recordings dialog the choices for it. Two things were left: the chapter's own check panel on Production (also opened from Proof and Editing) started a check with no choices at all, and a run of several chapters went one chapter at a time because `coverage.Service` held one job (`busy`, `state`, `job`) and answered `busy` to a second start. The owner asked that the Production page offer the same options, as one shared component rather than a copy per page, and that chapters can be checked in parallel.

**Considered options:** one run that checks several chapters in a single sidecar process (the manifest, words files, results and ledger are all per chapter, so it would need a new sidecar mode and a new result shape); a pool of chapters inside the dialog only (the host would still refuse the second start); a copy of the controls in the panel (they would drift, which is what the owner ruled out).

## Decision

1. **The service keeps one job per run.** `coverage.Service` holds its running jobs by run id, each with its own state, and a `State()` that answers the state last sent. `Start` refuses a chapter that is already being checked and any start while `Request.Concurrent` (at least 1) runs are already in progress. A start that names no room is the old one-at-a-time rule. `Cancel` stops every run; `CancelBackground` stops the host's own background runs and waits for them, so a narrator's start no longer cancels another of the narrator's runs. `States()` lists the runs in progress.
2. **Chapters at once is a run option and a setting.** `CoverageStart` reads `options["chapters"]` (1 to 8; setting `RecordingCoverage.parallel_chapters`, default 1) and every start of the run names the same number, so the host allows that many together. When the worker count is left to the host and chapters run together, the host gives each chapter its share of the processors (`workers = max(1, cpus / chapters)`) instead of each the model's whole cap.
3. **`coverage:state` carries every run.** The event already names its run and chapter. A page that shows or starts one chapter keeps the state by chapter (`useCoverageRuns`), never the latest event of the whole stream; `coverageWatch` remembers every run it has ended. Production's chapter panel starts beside other running chapters only when Chapters at once leaves room.
4. **One component for the choices.** `RunOptions` (with `useRunChoices` for a page that does not hold the engines) is the only place the model, the larger model and its score line, chunk length, parallel processes, crossover and Chapters at once are drawn. The Check recordings dialog and the chapter's panel both use it, start from the host's `defaults`, and send every choice with `startOptions`. A new page that starts a check uses it too.

## Consequences

- Checking a book chapter by chapter is bounded by the processors, not by one chapter at a time, and the narrator's choice of how many at once is on the page that starts the check.
- Two runs that share a source file could write the same cache entry; the stores are mutex-guarded, and the worst case is a cache entry made again, never a wrong result.
- The Wails host-API contract gains optional start options and an additive `defaults.chapters`; no field is removed.
- Memory is the limit that is not enforced: each process holds a copy of the model. The model's cap applies per chapter when workers are automatic, so many chapters of a large model can still exhaust it; the dialog's help text says chapters share the processors, not memory.
- Real-speech throughput of several chapters at once is not measured.
