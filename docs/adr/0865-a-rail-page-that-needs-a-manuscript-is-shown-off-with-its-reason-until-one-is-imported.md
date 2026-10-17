# 0865. A rail page that needs a manuscript is shown off with its reason until one is imported

**Status:** Accepted (owner ruling 2026-10-17, [#1823](https://github.com/countrymanprime/narration-utils/issues/1823)); it amends the rail's behaviour in decision 1 of [ADR 0760](0760-the-studio-next-mock-is-the-only-spec-for-every-page-it-covers-tokens-primitive-sizes-and-layouts-included.md)
**Significance:** An interface between parts and a quality attribute (accessibility): one availability table that the rail, the drawer, the jump menu and the route guards all read, and a disabled-control pattern (focusable, named, explained) every later gated control follows. Reversing it means rewriting every consumer of the table and the aria snapshots that pin the rail.
**Date:** 2026-10-17
**Supersedes:**

## Context

With no manuscript imported, the rail offered nine pages that can do nothing yet: Schedule, Script, Story Bible, Booth, Editing, Proof, Pickups, Master & QC and Delivery. Each page drew its own "Import a manuscript" state. Issue [#1720](https://github.com/countrymanprime/narration-utils/issues/1720) (fixed by [#1741](https://github.com/countrymanprime/narration-utils/pull/1741)) removed an earlier, inconsistent set of disabled items and made none disabled, because the Studio Next mock's rail drew none ([ADR 0760](0760-the-studio-next-mock-is-the-only-spec-for-every-page-it-covers-tokens-primitive-sizes-and-layouts-included.md): the mock is the only spec). The owner ruled on 2026-10-17 that the rail should gate these pages, with the mock updated first so it still holds the real cases.

The disabled path the app already had is also wrong. `NavButton` set the native `disabled` and `TooltipTarget` wrapped it in `<span tabIndex=0 role="group" aria-label={reason}>`, so a screen reader heard the reason with no page name, and the real button was out of the tab order.

The accessibility and design guidance this decision follows: keep an item the narrator can unlock later visible rather than hide it; say why it is off; keep it focusable with `aria-disabled` rather than the native `disabled` ([MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-disabled); W3C APG minutes of 2022-03-01), so it stays discoverable and keeps focus when it turns off.

**Considered options:** (A) show the pages off with a reason (chosen); (B) leave every page enabled and let each draw its own import state, which is the state after #1741 and leaves nine dead-end destinations; (C) hide the nine pages, which leaves a rail of Production and Settings and removes the map of the work.

## Decision

1. A page that needs the manuscript is shown in the rail, the drawer and the jump menu, **off with a reason**, until a manuscript is imported. The nine pages above are off; Production (where the import lives), the theme item and Settings are never off. The reason is "Import a manuscript to unlock this page."
2. **One table decides it.** The app reads a single path-to-preconditions table (`apps/ui/src/navigation/navAvailability.ts`); the rail, the drawer, the jump menu and the route guards all call it, and no item carries its own condition. The mock's equivalent is `docs/research/mockups/studio-next/src/selectors/nav.ts`.
3. **An off item is a focusable button with `aria-disabled="true"`**, not the native `disabled`. It keeps its own name, carries the reason as its description, shows it as a tooltip on hover and keyboard focus ([ADR 0049](0049-hints-are-base-ui-tooltips-that-meet-wcag-1-4-13-and-info-icons-are-buttons.md)), and a press, click or Enter opens a small popover anchored to the item with the reason ([ADR 0172](0172-popover-is-an-interactive-layer-above-the-dialog-and-escape-defers-to-the-topmost-one.md)). It never navigates, and nothing on the page moves. Its text keeps the muted AA colour; a small lock and the absence of a hover fill set it apart.
4. **The jump menu lists the nine pages off** with the same reason as a tooltip; Enter or a click on one runs nothing and keeps the menu open.
5. **A page reached any other way still draws its own "import a manuscript" state**: a typed address, Back, a link. Nothing redirects. An item whose page is open when the manuscript goes keeps its current marker and turns off, and keeps keyboard focus.
6. **The count badges are absent while there is no manuscript**, as before.
7. **The mock changes first.** The Studio Next mock draws these states (its rail, the jump menu, the removed-while-open case), so the app is still built to it.

## Consequences

- The rail teaches the order of the work and says what each step needs; a narrator with no manuscript can see every destination and what unlocks it.
- Adding a gated page or a new precondition (a linked DAW file, a chapter count) is one row in the table, not a condition per consumer.
- Off items join the tab order, so the rail has more tab stops with no manuscript; the aria snapshots for the sidebar, the rail and the drawer change ([ADR 0065](0065-aria-snapshots-pin-the-role-trees-of-the-dialogs-the-slide-over-and-the-navigation.md)).
- The popover is a new overlay in the rail's overlay-guard list.
- The mock and the guide `docs/guides/using-the-app/navigation.md` stop saying "No page is locked".
- The app follows the mock in the pull requests tracked by #1823; until they land, `AppShell.tsx` still draws no off item.
- To change this, write a new ADR that supersedes this one.
