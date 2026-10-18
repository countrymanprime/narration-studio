# Motion and animation

**Status: describes the current state.** There are no shared duration or easing tokens; the planned motion tokens and guidance are [#1456](https://github.com/countrymanprime/narration-utils/issues/1456).

## What exists

- Every transition and animation in `apps/ui/src/components/` is a `motion-safe:` utility: `ProgressBar` (fill width, indeterminate slide), `LevelMeter`, `Disclosure` (chevron), `Toast`, and the pending spinner in `Button`, `IconButton` and `ResumePrompt` ([Design system reference](design-system.md)). Each picks its own duration (`ProgressBar` `0.4s`, `LevelMeter` `150ms`).
- `components.css` declares none: `legacyCss.test.ts` fails on any `transition` or `animation` declared there, because a legacy rule beats a utility in the same layer.
- The atlas cannot prove reduced motion: the Storybook preview switches every animation and transition off for deterministic screenshots, so the guards are unit tests on the classes.

Missing feedback, as opposed to missing animation, is [interaction feedback](../architecture/interaction-feedback.md) ([The standard](../architecture/interaction-feedback.md#the-standard)).
