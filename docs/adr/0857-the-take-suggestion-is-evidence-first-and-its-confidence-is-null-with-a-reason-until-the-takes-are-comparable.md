# 0857. The take suggestion is evidence first, and its confidence is null with a reason until the takes are comparable

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** [ADR 0165](0165-a-take-comparison-is-one-finding-per-group-over-its-one-span-built-from-the-saved-project-and-never-ranked.md), to the extent that it says takes are never ranked. A take comparison stays one finding per group over its one span.

## Context

The Studio Next mock (`docs/research/mockups/studio-next/src/selectors/takes.ts`) suggests a take from what can be measured: the words read as written, clarity and the noise floor. Takes recorded at different levels cannot be compared by loudness, noise or clarity, so the mock gives no confidence for them, says why and offers the preparation steps first. ADR 0165 forbade ranking; the owner's decision DQ-15 allows a suggestion when it shows its evidence and decides nothing.

The mock's `clarity` has no host measure today, so a score that counted it would invent a figure.

## Decision

The suggestion is a pure function in `apps/ui/src/components/editing/model/takes.ts` of the take list, each take's measurement (a value or a reason) and the prep steps already applied.

- **Evidence first.** The suggestion is a chip that shows its evidence. It is never preselected and never applies anything; the narrator decides.
- **Confidence is null until the takes are level-comparable.** Takes more than `LEVEL_TOLERANCE_DB` apart give `confidence: null`, a reason naming the spread in dB and saying to normalise first, and the steps listed first. Takes with nothing measured fall back to the words read, with `confidence: null` and the measurement's own reason. One take gives no suggestion.
- **Confidence rises as prep steps are applied.** With levels matched it is the margin over the runner-up scaled to `SUGGEST_MARGIN_FULL`, times `1 - UNTRIMMED_PENALTY` per trim step still needed, rounded to two places. Applying a trim never lowers it.
- **A figure the host cannot measure is left out.** The score shares its weight among the figures that were measured, the evidence names it "Not measured", and a missing figure is never counted as zero. Clarity counts only when every measured take has it, so scores stay comparable.
- Hidden takes are not in the evidence, the ranking or the spread.

## Consequences

- The suggestion can be built and reviewed with no host and no UI; the host half and the UI wire it from the take port and the document.
- A host that later measures clarity changes the evidence and the score with no change to this module.
- ADR 0165 still governs how a comparison is built from the saved project; only its "never ranked" is replaced.
