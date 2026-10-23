---
paths:
  - 'src/studio/ui/**'
---

# Visual bug fixes require screenshot verification

When fixing a visual/UI bug in `src/studio/ui`, do not consider it done from code review or a single manual screenshot alone. Before reporting a visual fix as complete:

0. For a PR, run the whole page, not one state: `pnpm --dir src/studio/ui visual:page <page>` (both themes, every catalogued state, into `src/studio/ui/screenshots/targeted/<theme>/<page>/<state>/<viewport>.png`) and `pnpm --dir src/studio/ui atlas:page <page-or-component>` for its stories. The PR states both results; the images it commits are the page's guide screenshots, never a `pr-screenshots/` folder ([UI PRs update the how-to guide](../../CONTRIBUTING.md#ui-prs-update-the-how-to-guide)). The steps below are the quick loop on one state.
1. Run the Playwright visual suite for the affected page/state across all viewports in `src/studio/ui/tests/visual/viewports.ts` (desktop, small-desktop, tablet; there is no phone viewport, `src/studio/ui/tests/visual/viewports.ts`, except that the Settings states are also captured at a 390 px `reflow` width, `docs/design/design-system.md`, so look at `reflow.png` for those):

   ```bash
   cd src/studio/ui
   npx playwright test tests/visual/app.spec.ts -g "<page>.*<state>"
   ```

2. Open and actually look at the generated PNGs under `src/studio/ui/screenshots/app/<page>/<state>/<viewport>.png` for every viewport — not just the one you eyeballed live in a browser pane. A fix that looks right at one width is not verified.
3. If the bug is about responsive/layout behavior specifically, check it at every viewport in that list, since "responsive" bugs routinely only reproduce below/above one specific breakpoint.

Primitives are also covered by the component atlas: every one has a `<Name>.stories.tsx`, and `pnpm --dir src/studio/ui atlas` builds Storybook and checks every story in light and dark at a wide and a narrow viewport (axe, `play()`, overflow, console errors). Run it too when a primitive or `styles.css` changes; `docs/ui/` is generated from it by `pnpm --dir src/studio/ui docs:atlas` (`src/studio/ui/scripts/atlas-docs.mjs`).

The visual suite also runs axe on every state it captures: a violation fails the capture unless `src/studio/ui/tests/visual/axe-debt.ts` declares it with a reason and an issue, and a declared rule that stops being reported fails too, so fix the page and delete the entry rather than add one (`UI_AXE=1` measures without failing). When a dialog, slide-over or the navigation changes, also run `pnpm --dir src/studio/ui run aria`: it pins their role trees (`docs/operations/verification-tooling.md`), and a changed tree is a changed screen-reader experience, so update a snapshot only when the change is intended and read the diff (`docs/operations/verification-tooling.md`).

A container whose Chromium is not the pinned build runs all of these unchanged: `visual:page` and `atlas:page` pick the installed headless shell, and for a plain `playwright test` set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to it (`src/studio/ui/playwright.launch.ts`). Never run `playwright install` there.

The visual suite also holds the overlay guard (`tests/visual/overlays.spec.ts`, [verification tooling](../../docs/operations/verification-tooling.md#overlay-guard)): every menu, popover, hint, dialog and drawer of a page must be the topmost element at its own points and fully on screen, opened at each window edge and corner, beside the sidebar and the top bar, over scrolled content, at 360x500 and 320x300 and over another overlay. A new overlay goes in the page's list in `tests/visual/overlays/`; a new page with the sidebar is added to `tests/visual/overlays/pages.ts` (it then runs the shell's page-relative overlays and its own list; the top bar's overlays run on three representative pages, [verification tooling](../../docs/operations/verification-tooling.md#overlay-guard)). It captures no screenshots.

`src/studio/ui/screenshots/` is gitignored: these are scratch verification artifacts, not committed output.

The suite is also a gate, not just a camera: each `{page, state}` is its own test (`<page> / <state>`), which loads and drives the state once and captures every viewport as its own step (a row with `reloadPerViewport` keeps a test per viewport, `<page> / <state> / <viewport>`, on a fresh page each), there are no retries, and a run fails on page errors, failed requests, sideways overflow at any viewport, a collapsed control (a text box or select under 64 px), blank screenshots, and two states that render identically unless the catalog row declares `sameAs`. CI shards the run and judges it whole ([What the repository enforces, and what CI is for](../../docs/operations/ci-and-releases.md#what-the-repository-enforces-and-what-ci-is-for)). If it goes red, fix the UI or the driver — don't add a `sameAs`/`undriven`/`narrowControls` escape without a real reason. How to reach a state lives in `src/studio/ui/tests/visual/app.drivers.ts`; the row's metadata (`undriven`, `sameAs`, `narrowControls`, `extraViewports`, `pointer`, `mask`) lives in `state-catalog.ts`.
