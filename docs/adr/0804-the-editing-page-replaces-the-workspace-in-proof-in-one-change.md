# 0804. The Editing page replaces the workspace in Proof in one change

**Status:** Accepted (owner ruling 2026-10-11; owner ruling SN0-Q2 and ADR row A15 in the [ADR register](../prds/studio-next-adr-register.prd.md))
**Date:** 2026-10-11
**Supersedes:** none. [ADR 0407](0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) decision 1 is kept (DQ-2) and [ADR 0470](0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md) is extended.

## Context

Editing today is a workspace inside the Proof chapter page: the word-level player, flags, the takes panel and an effect on a passage. The Studio Next mock makes Editing a page of its own (`docs/research/mockups/studio-next/src/pages/Editing.tsx`; tests `editing.test.tsx`, `c2-editing.test.tsx`): the chapter's script is the editor, set against what was heard, with takes under their lines, a timeline strip and a drawer. The owner ruled SN0-Q2 on 2026-10-11: replace, for every page including Editing, with no feature flag and no period with two versions. The [Script-Based Editing PRD](../prds/studio-next-script-based-editing.prd.md) lists the ADRs this touches.

## Decision

1. **Editing is a page with its own rail item**, and it takes the workspace out of Proof. The mock draws the item in its `NAV` (`docs/research/mockups/studio-next/src/app/Shell.tsx`); the Studio Next mock is the spec ([ADR 0760](0760-the-studio-next-mock-is-the-only-spec-for-every-page-it-covers-tokens-primitive-sizes-and-layouts-included.md)).
2. **One pull request swaps it.** The model and components land first with no route. The swap (SNE-9) adds the route and deletes the old workspace: its component files, its route redirect, its rows in the visual state catalogue and drivers, its guide and its screenshots (per the [Script-Based Editing PRD](../prds/studio-next-script-based-editing.prd.md), "Decisions"). This is decision 1 of [ADR 0407](0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) applied to Editing.
3. **There is no flag, no `studioNext` setting and no classic view.** The workspace and the page are never both reachable on `main`.
4. **Proof keeps what it had besides the workspace**: its notes, and the takes-at-a-spot lanes. This extends [ADR 0470](0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md), which draws Proof over the stored statuses and leads the chapter view with its notes; its rules on Proof's own page stand.
5. **What the page reuses is moved, not copied.** Alignment, highlighting and the peaks cache from [ADR 0212](0212-the-workspace-alignment-reuses-the-coverage-results-store-and-joins-played-ranges-from-the-saved-project-on-read.md), [ADR 0242](0242-the-recording-check-writes-the-chapters-word-alignment-as-additive-lines-and-align-again-never-transcribes.md), [ADR 0265](0265-the-workspace-highlights-by-binary-search-over-timed-tokens-and-groups-consecutive-flagged-tokens-into-one-flag.md) and [ADR 0520](0520-the-peaks-cache-holds-one-whole-source-entry-and-the-strip-reuses-timelines-backdrop.md) are kept or extended (per the PRD), not rewritten here.
6. **Other rulings that touch Editing are not decided here.** Delete range, effects on a range, stacking, trims and take suggestion have their own register rows and ADRs (A9, DQ-7, DQ-8, DQ-15, DQ-18).

## Consequences

- Proof gets lighter and Editing gets room for the script as the editor; the cost is one large swap with the old workspace gone.
- Anything that opened the workspace through Proof (links, redirects, key hints) must point at Editing in the same pull request. The Editing slice finds the consumers with `change-impact-scan` first (the PRD's audit, SNE-1).
- Where the page sits in the rail differs between sources: the PRD says the Review group, and the mock's `NAV` draws an Editing group of its own. By [ADR 0760](0760-the-studio-next-mock-is-the-only-spec-for-every-page-it-covers-tokens-primitive-sizes-and-layouts-included.md) the mock decides; the Editing slice confirms the group with the owner.
- [ADR 0407](0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) and [ADR 0470](0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md) keep their Status lines; the Editing slice edits them after the owner accepts this ADR and the swap lands.
- To change the rule, write a new ADR that supersedes this one.
