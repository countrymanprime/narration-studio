# 0793. Proof's percent is the cleared share of its notes, beside decided and cleared counters, and a note is open until fixed, waived or dismissed

**Status:** Accepted (owner ruling 2026-10-11; register row DQ-16 and ADR row A18 in the [ADR register](../prds/studio-next-adr-register.prd.md))
**Date:** 2026-10-11
**Supersedes:** [ADR 0525](0525-proofing-is-met-by-a-current-zero-open-pickup-source-and-every-required-delivery-check-confirmed-through-the-shared-stage-engine.md) to the extent the register states, and the "open means anything not dismissed" part of [ADR 0470](0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md).

## Context

[ADR 0525](0525-proofing-is-met-by-a-current-zero-open-pickup-source-and-every-required-delivery-check-confirmed-through-the-shared-stage-engine.md) defines a chapter's `proofing.pickups` signal. Any pickup item that is `unreviewed`, `deferred` or `accepted` is open; only `dismissed` is not. [ADR 0470](0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md) draws the Proof page over the same stored statuses. Under that definition a deferred or accepted-but-not-redone note is open, but the counts the page, the rail and Production show are not tied to one definition of "cleared" (see the [Proof and Pickups PRD](../prds/studio-next-proof-and-pickups.prd.md), "Proposed Solution" item 1).

The owner ruled DQ-16 on 2026-10-11: the mock's Proof percent is the spec, "together with its two counters, decided and cleared". In the mock, `docs/research/mockups/studio-next/src/selectors/proof.ts` has `isCleared` and `noteProgress`. A note is cleared when it is waived, fixed or a take was kept, or when its pickup was recorded or removed. A deferred note, a note decided "Fix in edit" until it is fixed, and a note that needs a pickup nobody has redone are open. `noteProgress` returns `decided` (notes with a resolution), `cleared` and a percent that is the cleared share of all notes, so it cannot read 100 while a pickup is open.

## Decision

1. **A note is open until it is fixed, waived or dismissed.** "Cleared" is the one definition: waived, fixed, dismissed, a take kept, or a pickup recorded or removed. "Open" is every other note, including a deferred one. This replaces "open means anything not dismissed" in [ADR 0470](0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md).
2. **Proof shows two counters, decided and cleared.** Decided is the notes that have a resolution. Cleared is the notes that meet decision 1. A deferred note counts as decided and open. A dismissed note counts as both.
3. **The Proof percent is the cleared share of the notes**, as `noteProgress` computes it in the mock. It cannot read 100 while a pickup is open. No other percent is shown.
4. **One selector holds the definition.** The Proof page, the rail badge and Production read the same selector, so they cannot disagree (per the PRD, "Proposed Solution" item 1). The findings summary gains a `cleared` field beside the decided count; how the host computes it, and the contract change, belong to the Proof slice (SNQ).
5. **Stored statuses are not migrated.** Cleared is derived from the existing statuses (per the PRD's Risks section).
6. **[ADR 0525](0525-proofing-is-met-by-a-current-zero-open-pickup-source-and-every-required-delivery-check-confirmed-through-the-shared-stage-engine.md)'s other rules stand**, until the owner decides otherwise: `not_met` wins, `unknown` when no source is current and covering, and delivery checks confirmed through the shared stage engine. The PRD names a divergence between "proofing met" and the new counters for one chapter as the way it would be wrong. This ADR does not settle which one the stage engine uses; the Proof slice states it with a contract test over the shared selector.

## Consequences

- The Proof percent is honest: finishing a decision is not finishing the work.
- [ADR 0525](0525-proofing-is-met-by-a-current-zero-open-pickup-source-and-every-required-delivery-check-confirmed-through-the-shared-stage-engine.md) and [ADR 0470](0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md) keep their Status lines. The Proof slice edits them after the owner accepts this ADR and the counters land, per the register's migration-period rule.
- The summary gains an additive field, so the Proof slice follows the `wire-contract-change` steps.
- A rail badge or Production figure computed from the old open definition is wrong once this lands. The Proof slice must find those readers (`change-impact-scan`).
- To change the rule, write a new ADR that supersedes this one.
