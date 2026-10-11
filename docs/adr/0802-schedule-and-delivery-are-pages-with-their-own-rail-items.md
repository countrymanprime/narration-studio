# 0802. Schedule and Delivery are pages with their own rail items

**Status:** Accepted (owner ruling 2026-10-11; register row DQ-14, owner ruling SN0-Q6 and ADR row A13 in the [ADR register](../prds/studio-next-adr-register.prd.md))
**Date:** 2026-10-11
**Supersedes:** decision 5 of [ADR 0407](0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md). Decision 1 of [ADR 0407](0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) is kept (DQ-2).

## Context

Decision 5 of [ADR 0407](0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) says a nav item exists only for a page that exists, and that "Schedule stays Production's plan panel and Delivery stays the package panel of Master & QC until either needs a page". The owner ruled DQ-14 and SN0-Q6 on 2026-10-11: Schedule and Delivery are pages with their own rail items, as in the mock. The mock's rail (`NAV` in `docs/research/mockups/studio-next/src/app/Shell.tsx`) lists both, and the pages are `docs/research/mockups/studio-next/src/pages/Schedule.tsx` and `docs/research/mockups/studio-next/src/pages/Delivery.tsx` (tests: `schedule.test.tsx`, `delivery.test.tsx`, `delivery-profile.test.tsx`).

## Decision

1. **Schedule is a page with its own rail item.** In the mock it sits under Production, above the Prep label. It replaces the plan panel's inline editing (per the [Production and Schedule PRD](../prds/studio-next-production-and-schedule.prd.md), "Proposed Solution" item 2).
2. **Delivery is a page with its own rail item.** In the mock it is the last item, under Master & QC in the Finish group. It replaces the package panel of Master & QC (per the [Master, Delivery and Settings PRD](../prds/studio-next-master-delivery-and-settings.prd.md); the panel's removal is that slice's work).
3. **The panels they replace are deleted in the swap slices**, in the same pull request that adds the route, as decision 1 of [ADR 0407](0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) requires. Production's swap (SNP-8) adds Schedule. The Master and Delivery swap adds Delivery. There is no flag and no period with both versions.
4. **Decisions 1, 2, 3 and 4 of [ADR 0407](0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) stand.** The rail stays grouped by stage and drawn with the existing `NavButton` and `NavDrawer` primitives; each new item names its group as above. Only decision 5 is replaced.

## Consequences

- The rail gains two items, one in each of two groups. Because `AppShell.tsx` navigation is a one-at-a-time serial point in the agent train, the slices that add them take it in turn.
- [ADR 0407](0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) keeps its Status line. The slice that lands the first of the two items edits decision 5's note, per the register's migration-period rule.
- Guide pages, redirects and screenshots for the replaced panels go with the swap that deletes them.
- To change the rule, write a new ADR that supersedes this one.
