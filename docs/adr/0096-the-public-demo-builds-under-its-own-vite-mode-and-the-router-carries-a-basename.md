# 0096. The public demo builds under its own Vite mode, and the router carries a basename

**Status:** Accepted
**Date:** 2026-09-22

## Context

The public demo publishes the existing `build:mock` bundle to
`https://countrymanprime.github.io/narration-utils/demo/`, alongside the docs site and Storybook
that `pages.yml` already builds.
`apps/ui/vite.config.ts` hardcoded `base: '/'`, which only the site root (and the desktop app, which
also serves from `/`) needs; the demo needs its own subpath. The open question of the base path
mechanism named two options without picking one: a Vite CLI `--base` flag per build
invocation, or a `demo` mode alongside the existing `mock` mode. A CLI flag on top of the existing
`mock` mode would also make the demo banner (every page of the demo must show it is a
demo) show up in the Playwright visual suite, Storybook and the component atlas, all of which build
with `--mode mock` today and must not change.

Verifying the built demo locally (a static file server under `/narration-utils/demo/`, the same way the Storybook step was
proven) surfaced a second, unrelated defect nobody had anticipated: `apps/ui/src/App.tsx`'s `<BrowserRouter>` carried no `basename`, so every
route (`/`, `/proofing`, `/story-bible`, ...) failed to match under the `/narration-utils/demo/`
prefix. The console read `No routes matched location "/narration-utils/demo/"` and every page
rendered only the app shell (banner, nav, header) with no page content - the demo's whole "navigate
the real UI" success state.

## Decision

- `apps/ui/vite.config.ts` is a mode-keyed function (`defineConfig(({ mode }) => ({...}))`) rather
  than a static object. A new `demo` mode (`apps/ui/.env.demo`: `VITE_USE_MOCK_API=1`, `VITE_DEMO=1`)
  sets `base: '/narration-utils/demo/'`; every other mode (dev, `mock`, `test`, production) keeps
  `base: '/'`. `apps/ui/package.json` gets `build:demo` (`vite build --mode demo --outDir dist/demo`)
  alongside the existing `build:mock`.
- `apps/ui/src/components/layout/DemoBanner.tsx` self-gates on `import.meta.env.VITE_DEMO === '1'`,
  not `MODE === 'mock'`, so it renders only from the `demo` build and never from the `mock` build the
  visual suite, Storybook and the atlas already rely on for pixel-stable captures.
- `apps/ui/src/App.tsx`'s `<BrowserRouter>` takes `basename={import.meta.env.BASE_URL}` - Vite's own
  env var for the configured `base`, so it is `/` (a no-op) everywhere except the demo build, where it
  matches the `base` the assets themselves resolve under.

## Consequences

- Any future build that needs a third base path (or the demo's own path ever changes) is one `mode ===
  '<name>'` branch in `vite.config.ts`, not a CLI invocation to keep in sync across `package.json`,
  `pages.yml` and local verification instructions.
- `import.meta.env.BASE_URL` must stay the single source of truth for the router's `basename`; a future
  change to how `base` is computed (for example, reading it from a URL param instead of a build mode)
  must keep this wired together, or routing breaks silently under a subpath the way it did before this
  fix - there is no automated check that the two stay in sync beyond the demo build itself resolving
  routes.
- The durable rule is that the demo mode's base and the router's basename come from the same Vite env var.
  `.github/workflows/pages.yml` runs `build:demo` and adds the result beside the docs site; no other doc
  describes the demo build, so this ADR is where the rule is recorded.
