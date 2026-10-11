---
name: storybook-story-author
description: Write or change a Storybook story in apps/ui (a new component, a new state, a play() interaction) so it passes the jsdom unit run, the atlas and the coverage tests. Load before adding or editing any *.stories.tsx.
---

# storybook-story-author

## Why this exists

Every story in `apps/ui` is checked three ways: as a jsdom unit test (`src/stories.test.tsx`), in a real browser by the atlas (`tests/atlas/atlas.spec.ts`: axe, `play()`, overflow, console errors, in light and dark at a wide and a narrow viewport), and as a row in `docs/ui/` ([ADR 0023](../../../docs/adr/0023-visual-suite-capture-contract-and-storybook.md), [ADR 0243](../../../docs/adr/0243-the-ui-atlas-kit-is-dissolved-into-apps-ui-which-owns-its-visual-suite-and-atlas-outright.md)). A story that passes in the dev server can still fail in either run.

## When to use this

- A new component in `src/components/primitives/` (`atlasCoverage.test.ts` fails without a `<Name>.stories.tsx`).
- A new variant or state on an existing primitive.
- A `play()` interaction for behaviour a unit test in `<Name>.test.tsx` does not already prove.
- A story for a domain component outside `primitives/`. None exist yet; follow the same rules and check the decision below first.

Skip it for a change that touches no rendering, props or states.

## Decide first: story or not

- A primitive always gets a story file, or an entry in `ATLAS_EXEMPT` (`src/atlasCoverage.test.ts`) with a reason of 10 or more characters. The list may only shrink.
- A page is not a story. Playwright's visual suite owns pages (`visual-catalog-sync`).
- A domain component earns stories when it takes props only and has three or more states that are hard to reach in the app. If it fetches or reads host state, split out the presentational part first; do not mock the host inside a story.

## Writing the story

1. **File and title.** `<Name>.stories.tsx` next to `<Name>.tsx`, `title: 'Primitives/<Name>'`, `satisfies Meta<typeof Name>`, `type Story = StoryObj<typeof meta>`. Import test helpers from `storybook/test`, not `@storybook/test`.
2. **One story per state**, named for the state (`PrimaryDisabled`, `PendingIsBusyAndFocusable`). Drive variants with `args`. Use `render` only when the story needs a wrapper or several instances side by side (`HeaderRow`).
3. **Comment the spec, not the markup.** Cite the ADR or measured value the story pins (`Button.stories.tsx` cites ADR 0595 for the 32 px and 28 px heights). Follow `docs-style`.
4. **Backdrop.** The decorator in `.storybook/preview.tsx` renders on `--bg`, applies the theme and wraps in `TooltipProvider`. A component that draws on `--surface` needs the same surface in its story, or axe measures contrast against the wrong colour (`CapabilityGate.stories.tsx` wraps in `OnSurface`).
5. **Controlled components.** Feed the new value back in with a small wrapper, as every real caller does (`Checkbox.stories.tsx`).
6. **Handlers.** Use `fn()` in `args` and assert on `args.onX` in `play()`.

## `play()` rules

- A story with `play()` is tagged `play-fn` and the atlas reloads the page for each of its four variants ([ADR 0267](../../../docs/adr/0267-the-atlas-drives-a-storys-four-variants-from-one-page-load-except-a-play-fn-story.md)). Keep `play()` for behaviour; a state that only needs to be looked at stays a plain story, which is cheaper to run.
- Query by role and accessible name through `within(canvasElement)`, as the existing stories do. No `data-testid`.
- The unit run is jsdom, which lays nothing out. A layout assertion (`getBoundingClientRect`) must bail out first when nothing is laid out, as `isLaidOut` does in `Button.stories.tsx`; the atlas then measures it for real.
- Anything jsdom cannot do (Base UI label presses build a `PointerEvent` its window rejects) goes in `<Name>.test.tsx`, with a comment in the story saying so.
- Do not click an element with `pointer-events: none`; assert its state instead.

## Gates a story must clear

| Gate | Where | What fails it |
| --- | --- | --- |
| Renders and `play()` passes | `src/stories.test.tsx` (picks up new files by glob) | a throw in render or in `play()` |
| Every primitive has a story | `src/atlasCoverage.test.ts` | a missing file with no exemption |
| axe, `a11y.test: 'error'` | atlas | any violation not named in `tests/atlas/a11y-debt.ts` |
| Overflow, broken images, console and page errors | atlas | sideways overflow at the narrow viewport, any console error |
| Same render after a theme switch | atlas | a story that differs between a switch and a fresh load: add it to `tests/atlas/reload-debt.ts` with the reason, after diffing the PNGs |

`A11Y_DEBT` is capped at 0 entries (`MAX_DEBT_ENTRIES`). Fix the component; do not add an entry. `RELOAD_DEBT` grows only when the side-by-side diff in ADR 0267 finds a real difference, never as a guess.

## Verify

Run from `apps/ui`:

```bash
pnpm exec vitest run src/stories.test.tsx src/atlasCoverage.test.ts
pnpm run atlas
```

`atlas` builds Storybook and runs every story in four variants. Open the PNGs it writes under `apps/ui/screenshots/atlas/<title>/` and look at the light and dark, wide and narrow renders of the story you changed. Then regenerate `docs/ui/` with `pnpm --dir apps/ui docs:atlas` and commit what changes. In an agent-train worker stream, run the vitest line and the atlas for your own story, and leave `docs/ui/` alone: the final sweep regenerates it once ([agent train](../../../docs/operations/agent-train.md#worker-template)).

When a primitive or `src/styles.css` changed, `design-spec-guard` and `full-verification-gate` still apply; this skill does not replace them.

## What this skill is not

It does not cover the Playwright page suite (`visual-catalog-sync`), the screenshot guide (`doc-screenshot-sync`) or a decision to change how stories are run (`adr-author`).
