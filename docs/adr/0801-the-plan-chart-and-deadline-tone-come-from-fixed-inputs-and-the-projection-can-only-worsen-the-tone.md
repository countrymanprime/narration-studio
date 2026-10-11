# 0801. The plan chart and deadline tone come from fixed inputs, and the projection can only worsen the tone

**Status:** Accepted (owner ruling 2026-10-11; register row DQ-4 and ADR row A12 in the [ADR register](../prds/studio-next-adr-register.prd.md))
**Date:** 2026-10-11
**Supersedes:** [ADR 0404](0404-production-next-up-ranks-chapters-by-held-back-readiness-then-stage-and-the-deadline-is-shown-not-projected.md) to the extent that its "the deadline is shown, not projected" part yields (register row DQ-4). [ADR 0015](0015-real-progress-only.md) is kept.

## Context

[ADR 0404](0404-production-next-up-ranks-chapters-by-held-back-readiness-then-stage-and-the-deadline-is-shown-not-projected.md) shows the due date and the whole days left, sets the tone from the days left alone, and says "No finish date is projected from the pace so far." The owner ruled DQ-4 on 2026-10-11: the mock's plan chart and deadline tone from fixed inputs are the spec. The mock works a projected finish out of the work left: `calc` and `deadlineTone` in `docs/research/mockups/studio-next/src/selectors/progress.ts`, over the inputs in `docs/research/mockups/studio-next/src/config/estimates.ts`. The Production page is `docs/research/mockups/studio-next/src/pages/Production.tsx`, and the tests are `f-production.test.tsx` and `production.test.tsx`.

## Decision

1. **The chart and the tone are worked out from fixed inputs.** They are the standard words per finished hour (9,300), the work-hours per finished hour for each stage (record 3.0, edit 2.1, proof 0.94), the narrator's work-hours per day (1.5), the work-hours to redo one pickup (0.06) and the warning window (7 days). They are values in one config module (`docs/research/mockups/studio-next/src/config/estimates.ts` is the model), and nothing derives them from a time log.
2. **The projection is hours left over the daily pace.** The work left is each stage's share of the unfinished words at its ratio, plus the open pickups. The projected finish is today plus those days. The slack is the days left to the due date minus the days of work; it is ok at 3 days or more, tight from 0 to under 3, and behind below 0 (`calc` in the mock).
3. **The days left set the tone first.** Neutral beyond a week, a warning at a week or less while the book is unfinished, danger once the date has passed, and success when every chapter is delivered and none fails (`deadlineTone`). These are the tones [ADR 0404](0404-production-next-up-ranks-chapters-by-held-back-readiness-then-stage-and-the-deadline-is-shown-not-projected.md) already names.
4. **The projection can only worsen the tone, and only when work is left.** A behind projection makes it danger. A tight projection makes a neutral tone a warning. It never improves a tone and never touches success.
5. **The next-up order and the rest of [ADR 0404](0404-production-next-up-ranks-chapters-by-held-back-readiness-then-stage-and-the-deadline-is-shown-not-projected.md) are not decided here.** This ADR supersedes only "shown, not projected". Next up's order and the "Not available" columns are for the Production slice, per the [Production and Schedule PRD](../prds/studio-next-production-and-schedule.prd.md) "Supersedes / depends on ADRs" row for [ADR 0404](0404-production-next-up-ranks-chapters-by-held-back-readiness-then-stage-and-the-deadline-is-shown-not-projected.md).
6. **[ADR 0015](0015-real-progress-only.md) is kept.** The projection reads the chapters' real progress and adds none. The timer, PFH and effective rate stay as built (DQ-3, [ADR 0320](0320-pfh-and-the-effective-rate-come-only-from-logged-hours-and-measured-recorded-time.md)).

## Consequences

- The chart can show a finish date and a risk the narrator has not logged.
- The figures rest on fixed inputs that stand in for the narrator's own pace until it is measured. A narrator whose pace differs sees a projection that differs from theirs. Own pace needs three measured chapters (SNP-Q6) and is for the Production slice.
- [ADR 0404](0404-production-next-up-ranks-chapters-by-held-back-readiness-then-stage-and-the-deadline-is-shown-not-projected.md) keeps its Status line. The Production slice edits it after the owner accepts this ADR and the swap lands.
- The Go overview counts the days left and sets the tone today. Where the projection is computed, in the host or in a UI selector, is for the Production slice (per PRD, "Technical Approach").
- To change the rule, write a new ADR that supersedes this one.
