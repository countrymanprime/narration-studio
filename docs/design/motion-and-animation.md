# Motion and animation

**Status: describes the current state.** The tokens and the reduced-motion gate below are slices 1 and 2, the overlay behaviour slice 4, and the Motion setting slice 3, of [#1456](https://github.com/countrymanprime/narration-utils/issues/1456). Where to animate next, and why, is the motion research note in [PR 1914](https://github.com/countrymanprime/narration-utils/pull/1914) and the owner's decisions recorded on that issue.

## Tokens

Defined once on `html` in `apps/ui/src/styles.css` (not `:root`, which `paletteContrast.test.ts` reads as a colour theme):

| Token | Value | Used by |
| --- | --- | --- |
| `--motion-fast` | 120 ms | Every bare `transition` (Tailwind's `--default-transition-duration`), popovers and menus, the icon rail, `LevelMeter`, `Toast`, the tooltip |
| `--motion-base` | 200 ms | `SlideOver`, `NavDrawer`, the Script drawers, the `ProgressBar` fill |
| `--motion-slow` | 300 ms | The Booth text column only |
| `--motion-highlight` | 600 ms | Reserved for a one-shot background fade on what changed; nothing uses it yet |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Every bare `transition` (`--default-transition-timing-function`), `LevelMeter`, the `ProgressBar` fill |
| `--ease-enter` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | Popovers and menus arriving, `SlideOver`, `NavDrawer`, `Toast` and the tooltip arriving |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | `Toast`'s fade, popovers and menus leaving |
| `--motion-shift` | 4 px | How far a tooltip, toast, popover or menu moves as it arrives |

A utility reads a token by name: `motion-ok:duration-(--motion-base)`, `motion-ok:ease-(--ease-enter)`. Under reduced motion every token is `0ms` (and `--motion-shift` `0px`), for anything that reads one outside a utility.

## Reduced motion

Motion stops when Windows asks for reduced motion (`prefers-reduced-motion: reduce`) or when `<html data-motion="reduce">` is set. The **Motion** row in Settings, Appearance & keys (`look.motion`) sets the attribute: **Reduce** sets it and **Follow Windows** clears it. The owner first chose to follow Windows only (#1456, Q1), then asked for the setting. The choice is kept in this window's storage (`narration-ui-motion`, `apps/ui/src/motion.ts`), and `index.html`'s inline script applies it before the first paint, as it does the theme.

- **CSS.** Every transition and animation is a `motion-ok:` utility. `styles.css` defines the variant with `@custom-variant`: it applies only under `prefers-reduced-motion: no-preference` and without `data-motion="reduce"`. Tailwind's own `motion-safe:` reads only the media query, so it is not used.
- **Script.** Code that moves things itself asks `reducedMotion()` (`apps/ui/src/motion.ts`), which checks the same two conditions. The Booth's paced cursor (`booth/usePacedCursor.ts`) and its follow scroll (`booth/useFollowCursor.ts`) jump instead of moving.
- **`components.css` declares none**: `legacyCss.test.ts` fails on any `transition` or `animation` there, because a legacy rule beats a utility in the same layer.

## What moves

All under `motion-ok:`, in `apps/ui/src/components/`:

- `Popover`, `Menu`, `ContextMenu` and `ChapterStepper`'s menu fade in while moving `--motion-shift` away from their anchor, and fade out, on the fast token. They share one class list, `primitives/overlayMotion.ts`, which uses Base UI's `data-starting-style` and `data-ending-style`.
- `SlideOver` slides in from the right and `NavDrawer` from the left, on the base token, and the drawer's scrim fades. `Toast` fades and rises in (`toast-in`) and fades out. The tooltip (`primitives/hintLayer.ts`) fades and rises in.
- The icon rail widens on hover below 1360 px (`layout/AppShell.tsx`); the Script drawers slide (`script/page/layout/ScriptColumns.tsx`).
- The Booth text column slides 300 ms on each scroll step, and its words change colour (`booth/reading/BoothText.tsx`).
- `ProgressBar` eases its fill, and slides while nothing is measured (`work-progress-slide`); `LevelMeter` eases its fill and peak tick.
- `Button`, `Switch`, `Disclosure` and the Booth's resume choices ease their colours or position; the pending spinner in `Button`, `IconButton` and `ResumePrompt` spins.
- `Skeleton`, the loading placeholder on Booth and Editing, sweeps a band across itself every 1.4 s (`skeleton-shimmer`) while a page reads. Settings: the per-row "Saved" fades (`settings-saved`), and its loading placeholders pulse. Script: a bookmark or paragraph a jump lands on pulses while it is lit.

Dialogs appear and disappear at once (#1456, Q3), and so does the Jump menu, which is a dialog.

## How it is checked

- `apps/ui/src/motion.test.ts` scans every source file's class lists. It fails on a `transition`, `animate-`, `duration-`, `ease-` or `delay-` utility not gated on `motion-ok:` (or `motion-reduce:`), on `motion-safe:`, and on a duration or easing that is not a token.
- `apps/ui/tests/visual/motion.spec.ts` runs with motion on, which no other run does. It checks that the rail and a context menu ease on the fast token and the navigation drawer on the base token, that nothing loops on eight pages at rest, that both ways of asking for reduced motion stop it, and that the Settings Motion row does and survives a reload.
- The rest of the visual suite, the atlas and Storybook freeze motion for deterministic screenshots (`tests/visual/helpers/settle.ts`, `playwright.atlas.config.ts`, `.storybook/preview-head.html`), so they cannot show it.

Missing feedback, as opposed to missing animation, is [interaction feedback](../architecture/interaction-feedback.md) ([The standard](../architecture/interaction-feedback.md#the-standard)).
