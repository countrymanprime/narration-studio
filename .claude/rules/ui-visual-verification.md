---
paths:
  - "apps/ui/**"
---

# Visual bug fixes require screenshot verification

When fixing a visual/UI bug in `apps/ui`, do not consider it done from code review or a single manual screenshot alone. Before reporting a visual fix as complete:

1. Run the Playwright visual suite for the affected page/state across all viewports in `apps/ui/tests/visual/viewports.ts` (desktop, small-desktop, tablet; there is no phone viewport, ADR 0037, except that the Settings states are also captured at a 390 px `reflow` width, ADR 0061, so look at `reflow.png` for those):

   ```bash
   cd apps/ui
   npx playwright test tests/visual/app.spec.ts -g "<page>.*<state>"
   ```

2. Open and actually look at the generated PNGs under `apps/ui/screenshots/app/<page>/<state>/<viewport>.png` for every viewport — not just the one you eyeballed live in a browser pane. A fix that looks right at one width is not verified.
3. If the bug is about responsive/layout behavior specifically, check it at every viewport in that list, since "responsive" bugs routinely only reproduce below/above one specific breakpoint.

Primitives are also covered by the component atlas: every one has a `<Name>.stories.tsx`, and `pnpm --dir apps/ui atlas` builds Storybook and checks every story in light and dark at a wide and a narrow viewport (axe, `play()`, overflow, console errors). Run it too when a primitive or `styles.css` changes; `docs/ui/` is generated from it by `pnpm --dir apps/ui docs:atlas` (`apps/ui/scripts/atlas-docs.mjs`, ADR 0243).

The visual suite also runs axe on every state it captures: a violation fails the capture unless `apps/ui/tests/visual/axe-debt.ts` declares it with a reason and an issue, and a declared rule that stops being reported fails too, so fix the page and delete the entry rather than add one (`UI_AXE=1` measures without failing; ADR 0064). When a dialog, slide-over or the navigation changes, also run `pnpm --dir apps/ui run aria`: it pins their role trees (ADR 0065), and a changed tree is a changed screen-reader experience, so update a snapshot only when the change is intended and read the diff (`docs/operations/verification-tooling.md`).

`apps/ui/screenshots/` is gitignored: these are scratch verification artifacts, not committed output.

The suite is also a gate, not just a camera: each `{page, state}` is its own test (`<page> / <state>`), which loads and drives the state once and captures every viewport as its own step (a row with `reloadPerViewport` keeps a test per viewport, `<page> / <state> / <viewport>`, on a fresh page each), there are no retries, and a run fails on page errors, failed requests, sideways overflow at any viewport, a collapsed control (a text box or select under 64 px, [ADR 0060](../../docs/adr/0060-the-visual-suite-fails-a-collapsed-control-and-a-row-may-declare-one-narrow-on-purpose.md)), blank screenshots, and two states that render identically unless the catalog row declares `sameAs`. CI shards the run and judges it whole ([ADR 0244](../../docs/adr/0244-the-playwright-suites-are-sharded-in-ci-the-quick-checks-share-a-runner-per-os-and-one-check-sums-up-the-run.md)). If it goes red, fix the UI or the driver — don't add a `sameAs`/`undriven`/`narrowControls` escape without a real reason. How to reach a state lives in `apps/ui/tests/visual/app.drivers.ts`; the row's metadata (`undriven`, `sameAs`, `narrowControls`, `extraViewports`, `pointer`, `mask`) lives in `state-catalog.ts`.
