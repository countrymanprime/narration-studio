# 0511. Click and breath sensitivity is a scan parameter, and its defaults only move toward more candidates

**Status:** Proposed (provisional until the permissioned re-run on #510)
**Date:** 2026-09-28
**Supersedes:** none

## Context

The click and breath validation asks for three things:

- decide whether click and breath sensitivity is a read-time filter or an analysis parameter;
- choose conservative defaults on the tuning half;
- persist the click and breath results so the signals can use them.

A read-time filter would be allowed only if scores separate cleanly. The detectors in `internal/measure` emit fixed
confidences (0.35, 0.5, 0.6), not a continuous score. The app passes no scan options, so every scan used
`measure.DefaultCleanupOptions()`. The editing scan wrote click and breath ledger records but persisted only
empty-space findings. A validated class signal would therefore have read `met` with its candidates unsaved.

## Decision

1. **Sensitivity is a scan parameter**, part of the parameter hash in `scanParamHash`. Changing it re-decodes, as
   before. There is no score to filter on at read time.
2. **Defaults are chosen on the tuning half by a recall-first rule**, recorded in `validationrun_test.go`:
   1. the highest recall;
   2. then only values at least as sensitive as the `measure` default;
   3. then the highest precision;
   4. then the value nearest the `measure` default.

   A precision gain measured on synthetic audio is never traded for fewer candidates on real audio.
   `editing.DefaultScanOptions()` is the result: the `measure` defaults with `BreathBelowSpeechDB` 8 (`measure` ships 12, which missed
   loud breaths). `TestShippedDefaultsAreTheTuningHalfChoice` keeps it equal to the rule's choice.
3. **Click and breath candidates are persisted** as `silence_cleanup` findings (`ClassCandidateFinding`). Each carries
   its project time, source range and class analyzer version. Its evidence version covers the source file, class and
   source range only.

## Consequences

- The editing check panel now lists click and breath candidates. Breath candidates are more numerous than at 12 dB.
  Each is still review-only.
- The first scan after this change re-decodes every item: the parameter hash and the cache version both changed, and
  the old records read stale ("the editing check settings changed").
- The cleanup findings view keeps the `measure` defaults. Only the editing check uses these defaults.
- A later continuous detector score could make a read-time filter possible. That needs a new ADR and a new run.
