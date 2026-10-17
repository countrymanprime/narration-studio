# 0008. The UI is React and Tailwind over Base UI primitives

**Status:** Accepted
**Significance:** Structure and a dependency. Every page is composed from one primitive set; replacing the stack or letting pages bypass the primitives rewrites the interface.
**Date:** 2026-09-20

## Context

The interface had grown hand-rolled widgets and custom CSS that disagreed with each other, with inconsistent keyboard behaviour and accessibility. The design mock (Studio Next) is the visual spec for every page it covers.

**Considered options:** keep custom CSS classes (they shadowed Tailwind and drifted); use a styled component library (its look, not the mock's); hand-roll each widget (inconsistent focus, ARIA and keyboard handling).

## Decision

- `apps/ui` is **React with Tailwind**; legacy custom CSS is retired and no unlayered rule may shadow a utility.
- The widgets are **primitives** in `apps/ui/src/components/primitives/`, built on **Base UI**. Only the primitives import Base UI (a test fails any other import); app code never imports a vendor widget or writes a native button, text input or select.
- Pages compose primitives. Where a primitive cannot draw a look, the primitive changes and the page does not restyle it. Token values, sizes and component looks live in `docs/design/design-system.md`.
- Accessibility is tested: text colours meet WCAG AA, axe runs on every visual-suite state, and ARIA snapshots pin the dialogs and navigation.

## Consequences

- A new look is a primitive change plus its story, visual and atlas tests.
- The stack is coupled to Base UI's release cadence; a minor bump is gated by the atlas and the visual suite.
- Replacing React, Tailwind or Base UI is a new ADR.
