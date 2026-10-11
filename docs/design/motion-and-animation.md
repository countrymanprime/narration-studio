# Motion & animation strategy

**Status: Planned. Motion is guarded for reduced motion where it exists; there are no shared duration tokens yet.**

## Problem

Most state changes and page loads have no transition: colours and values change abruptly. This was noticed while fixing the chapter progress bar's segment ordering ([ADR 0006](../adr/0006-chapter-progress-bar-ordering.md)).

## What exists

- Every transition and animation in `apps/ui/src/components/` is a `motion-safe:` utility: `ProgressBar` (fill width, indeterminate slide), `LevelMeter`, `Disclosure` (chevron), `Toast`, and the pending spinner in `Button`, `IconButton` and `ResumePrompt` ([ADR 0057](../adr/0057-a-running-job-that-cannot-be-cancelled-keeps-its-dialog-blocking-and-says-so.md)).
- `components.css` declares none: `legacyCss.test.ts` fails on any `transition` or `animation` declared there, because a legacy rule beats a utility in the same layer.
- The atlas cannot prove reduced motion: the Storybook preview switches every animation and transition off for deterministic screenshots, so the guards are unit tests on the classes.

## Proposed lightweight motion system (not built)

1. **Duration/easing tokens**: a small, fixed set (e.g. `--motion-fast: 150ms`, `--motion-base: 300ms`, `--motion-slow: 450ms`, one easing curve) added to `styles.css`'s `:root` alongside the existing color/spacing tokens, so future transitions reference the same values instead of picking arbitrary numbers per component (`ProgressBar` uses `0.4s` and `LevelMeter` `150ms` today).
2. **Guidance on when to animate**: state changes that are the *direct result of a user action in the same view* (expanding a chapter, a progress bar updating) are good animation candidates; page-level navigation and data reloads generally should not be forced into a transition just for polish, since a slow "in the way" animation on a workflow-critical action (import, build) reads as latency, not polish.
3. **Respect `prefers-reduced-motion`**: any new transition is a `motion-safe:` utility (done for every transition in `components/` today), never a rule in `components.css`.

## Out of scope for this doc

Actually building the token set or auditing every existing interaction for missing transitions — this is a proposal, not a design system yet. See [interaction feedback](../architecture/interaction-feedback.md) ([ADR 0075](../adr/0075-every-action-that-leaves-the-interface-acknowledges-within-100-ms-cannot-be-fired-twice-and-tells-the-narrator-when-it-ends.md) and the call-site catalog) for the related (but distinct) concern of missing *feedback*, as opposed to missing *animation*.
