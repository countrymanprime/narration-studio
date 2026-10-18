# Motion and animation

**Status: describes the current state.** The tokens and the reduced-motion gate below are slices 1 and 2 of [#1456](https://github.com/countrymanprime/narration-utils/issues/1456). Where to animate next, and why, is the motion research note in [PR 1914](https://github.com/countrymanprime/narration-utils/pull/1914) and the owner's decisions recorded on that issue.

## Tokens

Defined once on `html` in `apps/ui/src/styles.css` (not `:root`, which `paletteContrast.test.ts` reads as a colour theme):

| Token | Value | Used by |
| --- | --- | --- |
| `--motion-fast` | 120 ms | Every bare `transition` (Tailwind's `--default-transition-duration`), the icon rail, `LevelMeter`, `Toast`, the tooltip |
| `--motion-base` | 200 ms | `SlideOver`, the Script drawers, the `ProgressBar` fill |
| `--motion-slow` | 300 ms | The Booth text column only |
| `--motion-highlight` | 600 ms | Reserved for a one-shot background fade on what changed; nothing uses it yet |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Every bare `transition` (`--default-transition-timing-function`), `LevelMeter`, the `ProgressBar` fill |
| `--ease-enter` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | `SlideOver`, the tooltip |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | `Toast`'s fade |
| `--motion-shift` | 4 px | How far the tooltip rises in (`tooltip-in`) |

A utility reads a token by name: `motion-ok:duration-(--motion-base)`, `motion-ok:ease-(--ease-enter)`. Under reduced motion every token is `0ms` (and `--motion-shift` `0px`), for anything that reads one outside a utility.

## Reduced motion

Motion stops when Windows asks for reduced motion (`prefers-reduced-motion: reduce`) or when `<html data-motion="reduce">` is set. Nothing in the app sets the attribute yet: the owner chose to follow Windows only for now (#1456, Q1). Tests use it, and a later setting would.

- **CSS.** Every transition and animation is a `motion-ok:` utility. `styles.css` defines the variant with `@custom-variant`: it applies only under `prefers-reduced-motion: no-preference` and without `data-motion="reduce"`. Tailwind's own `motion-safe:` reads only the media query, so it is not used.
- **Script.** Code that moves things itself asks `reducedMotion()` (`apps/ui/src/motion.ts`), which checks the same two conditions. The Booth's paced cursor (`booth/usePacedCursor.ts`) and its follow scroll (`booth/useFollowCursor.ts`) jump instead of moving.
- **`components.css` declares none**: `legacyCss.test.ts` fails on any `transition` or `animation` there, because a legacy rule beats a utility in the same layer.

## What moves

All under `motion-ok:`, in `apps/ui/src/components/`:

- `SlideOver` slides in and out; `Toast` fades on exit; the tooltip (`primitives/hintLayer.ts`) fades and rises in.
- The icon rail widens on hover below 1360 px (`layout/AppShell.tsx`); the Script drawers slide (`script/page/layout/ScriptColumns.tsx`).
- The Booth text column slides 300 ms on each scroll step, and its words change colour (`booth/reading/BoothText.tsx`).
- `ProgressBar` eases its fill, and slides while nothing is measured (`work-progress-slide`); `LevelMeter` eases its fill and peak tick.
- `Button`, `Switch`, `Disclosure` and the Booth's resume choices ease their colours or position; the pending spinner in `Button`, `IconButton` and `ResumePrompt` spins.
- Settings: the per-row "Saved" fades (`settings-saved`), and the loading placeholders pulse. Script: a bookmark or paragraph a jump lands on pulses while it is lit.

Dialogs, popovers, menus and the navigation drawer appear and disappear at once.

## How it is checked

- `apps/ui/src/motion.test.ts` scans every source file's class lists. It fails on a `transition`, `animate-`, `duration-`, `ease-` or `delay-` utility not gated on `motion-ok:` (or `motion-reduce:`), on `motion-safe:`, and on a duration or easing that is not a token.
- `apps/ui/tests/visual/motion.spec.ts` runs with motion on, which no other run does. It checks that the rail eases on the fast token, that nothing loops on eight pages at rest, and that both ways of asking for reduced motion stop it.
- The rest of the visual suite, the atlas and Storybook freeze motion for deterministic screenshots (`tests/visual/helpers/settle.ts`, `playwright.atlas.config.ts`, `.storybook/preview-head.html`), so they cannot show it.

Missing feedback, as opposed to missing animation, is [interaction feedback](../architecture/interaction-feedback.md) ([The standard](../architecture/interaction-feedback.md#the-standard)).
