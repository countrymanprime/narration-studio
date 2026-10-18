# Motion and animation

**Status: describes the current state.** The tokens, the `motion-ok:` variant and the rules are in [Motion](design-system.md#motion); this page lists what moves today, and what does not. Tracking: [#1456](https://github.com/countrymanprime/narration-utils/issues/1456). Evidence and the pages still to do: the research note `docs/research/motion-and-animation-guidance.md` (PR #1914).

## What moves

Every transition and animation in `apps/ui/src` is a `motion-ok:` utility, enforced by `apps/ui/src/motion.test.ts`. Under reduced motion (Windows, or `data-motion="reduce"` on `<html>`) none of them runs.

| Where | What | Duration |
| --- | --- | --- |
| `Button`, `Switch`, `ResumePrompt` choices, Booth word and unit colour | Colour | `--motion-fast` |
| `Switch` thumb, `Disclosure` chevron | `transform` | `--motion-fast` |
| Tooltip and info-icon popup (`hintLayer.ts`) | Opacity and a `--motion-shift` rise | `--motion-fast` |
| Icon rail (`AppShell`) | `width` and shadow on hover or keyboard focus | `--motion-fast` |
| `Toast` | Leaving: opacity and a `--motion-shift` drop | `--motion-fast` |
| `SlideOver`, the Script drawers | `transform` | `--motion-base` |
| Booth text column (`BoothText`) | `transform` on every scroll step | `--motion-slow` |
| Script jump target, bookmark ribbon | One `changed-highlight` fade (a static tint under reduce) | `--motion-highlight` |
| `ProgressBar` fill, indeterminate slide; `LevelMeter` | Real progress and a live level, with literal durations (400 ms, 150 ms) listed as exemptions in `motionScan.ts` | |
| Settings "Saved" | One fade after a 2.5 s dwell | |
| Pending `Button`, `IconButton`, `ResumePrompt` | A spinner, only while the action is in flight | |

## What does not move

Dialogs, menus, context menus, popovers, the nav drawer and the Jump menu appear at once (owner decision Q3), and a toast appears at once. Page navigation, re-reads, the playhead, word selection and decision keys never animate. There is no skeleton pulse: the Settings and Models placeholders are still. The Booth's follow scroll jumps under reduced motion (`useFollowCursor`, `usePacedCursor`), and so does the text column. The `jump-target-pulse` keyframe and Tailwind's `animate-pulse` are gone.

## Testing

- `components.css` declares none: `legacyCss.test.ts` fails on any `transition` or `animation` declared there, because a legacy rule beats a utility in the same layer.
- `motion.test.ts` scans the source; each guarded component's test checks its rendered classes with `unguardedMotion` and `guardedMotion` (`motionScan.ts`). jsdom has no stylesheet, so those tests prove the classes, not the pixels.
- `tests/visual/motion.spec.ts` proves the browser's behaviour with motion on: the slide-over's `transform` transition runs, nothing runs for more than 300 ms, no page has an infinite animation at rest, and under `reducedMotion: 'reduce'` or `data-motion="reduce"` no transition or animation starts.
- The atlas cannot prove reduced motion: the Storybook preview switches every animation and transition off for deterministic screenshots, and the visual suite's `settle.ts` does the same.

Missing feedback, as opposed to missing animation, is [interaction feedback](../architecture/interaction-feedback.md) ([The standard](../architecture/interaction-feedback.md#the-standard)).
