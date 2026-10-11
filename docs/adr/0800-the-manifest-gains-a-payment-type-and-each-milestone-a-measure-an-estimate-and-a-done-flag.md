# 0800. The manifest gains a payment type, and each milestone a measure, an estimate and a done flag

**Status:** Accepted (owner ruling 2026-10-11; ADR row A12 in the [ADR register](../prds/studio-next-adr-register.prd.md))
**Date:** 2026-10-11
**Supersedes:** none. It extends [ADR 0323](0323-production-deadlines-and-milestones-are-calendar-dates-on-the-project-manifest.md). [ADR 0320](0320-pfh-and-the-effective-rate-come-only-from-logged-hours-and-measured-recorded-time.md) is kept untouched (register row DQ-3).

## Context

[ADR 0323](0323-production-deadlines-and-milestones-are-calendar-dates-on-the-project-manifest.md) puts the deadline, the contracted amount and dated milestones (`Name`, `DueDate`, `Note`) on the project manifest. It treats the ACX 15-minute checkpoint as a milestone like any other and validates nothing else about a milestone. The Studio Next mock's Schedule page goes further (`docs/research/mockups/studio-next/src/pages/Schedule.tsx`, tests in `docs/research/mockups/studio-next/tests/schedule.test.tsx` and `batch-b.test.tsx`): the narrator says how the book pays, and each milestone says what it measures, has an estimate and can be done. The [Production and Schedule PRD](../prds/studio-next-production-and-schedule.prd.md)'s "Evidence" table lists the milestone measure, estimate, done flag and templates as absent from the repo, and the payment type as only a `contractedAmount`.

## Decision

1. **The manifest records how the book pays.** A `payment` field takes `per_finished_hour`, `royalty_share` or `none` (per PRD, "Proposed Solution" item 1). The mock names the same three values `pfh`, `royalty` and `none` (`PaymentKind` in `docs/research/mockups/studio-next/src/domain/schemas.ts`); the wire names are the PRD's.
2. **The payment type decides what figure shows.** A per-finished-hour rate shows an effective figure only when the payment type is per finished hour and hours exist. A royalty share carries no figure: the type is a label and removes the rate figure (SNP-Q4, default taken).
3. **A milestone gains a measure, an estimate, a done flag and a template id.** The measures offered are the mock's list (`MEASURES` in `docs/research/mockups/studio-next/src/selectors/progress.ts`): custom, all recorded, all edited, all proofed, all edited and proofed, first N chapters edited and proofed, first N finished minutes, the 15-minute checkpoint, and the whole book. A custom milestone has no estimate and is marked done by hand. The measure is written with its value (`measureText` in `docs/research/mockups/studio-next/src/selectors/milestones.ts`).
4. **A delivery profile's capabilities decide which measures and templates are offered.** The checkpoint is offered only where the profile has the capability (`platformHas`; SNP-Q5, default taken), and a stored value is always kept as an option.
5. **The change is additive.** The new fields are `omitempty` beside the ones in [ADR 0323](0323-production-deadlines-and-milestones-are-calendar-dates-on-the-project-manifest.md); a manifest written before this change reads the missing fields as defaults. The schema, golden file and `wire-contract-change` steps belong to the Production slice (SNP-2), not to this ADR.
6. **Everything else in [ADR 0323](0323-production-deadlines-and-milestones-are-calendar-dates-on-the-project-manifest.md) stands**: calendar-date strings, the save-whole-or-refuse checks, and the limits on count and length. [ADR 0320](0320-pfh-and-the-effective-rate-come-only-from-logged-hours-and-measured-recorded-time.md) is untouched: the timer, PFH and effective rate stay as built, and Production slices neither read nor extend them (DQ-3).

## Consequences

- A milestone can say "first 15 finished minutes" and be tracked, where today it is a name and a date.
- [ADR 0323](0323-production-deadlines-and-milestones-are-calendar-dates-on-the-project-manifest.md) keeps its Status line. The Production slice edits it after the owner accepts this ADR and the fields land, per the register's migration-period rule.
- Every reader of a milestone or of the contracted amount must tolerate the new fields. The Production slice finds them with `change-impact-scan`.
- The rule that decides the effective figure is the one in decision 2. Whether a royalty share also stores an amount is left to the slice (the mock's Schedule page edits one; SNP-Q4 shows none).
- To change the rule, write a new ADR that supersedes this one.
