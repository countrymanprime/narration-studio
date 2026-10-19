# The public demo site

How to build and run the public site: a landing page, the real app in its mock mode as a live demo, and the Storybook, in one folder that needs no backend. Nothing here is published. GitHub Pages stays paused ([The Pages workflow](ci-and-releases.md#the-pages-workflow), owner decision D75), and `pages.yml` is unchanged.

## What it holds

| Path in `dist-site/` | What | Built by |
| --- | --- | --- |
| `index.html` | The landing page: a short intro, **Try the live demo**, **Storybook**, download and guide links. It reads the app's stored theme (`narration-ui-theme`) and otherwise follows the system | `scripts/site/landing/index.html` |
| `demo/` | The real UI (`apps/ui`), built with `vite build --mode site`: the mock host (`createMockApi`) and its sample project, Alice's Adventures in Wonderland (public domain) | `pnpm --dir apps/ui run build:site` |
| `storybook/` | The component Storybook | `pnpm --dir apps/ui run build-storybook` |
| `assets/` | The landing page's fonts and icon, copied from the app's own bundle | `scripts/site/build-demo-site.mjs` |

## Build and run it

```bash
pnpm run site:build    # builds the UI, the Storybook and the landing page into dist-site/
pnpm run site:serve    # serves dist-site/ at http://localhost:4180/
node scripts/site/serve.mjs dist-site --base /narration-utils/ --port 4180   # the same, under a sub-path, as Pages serves it
node scripts/site/build-demo-site.mjs --skip-storybook                        # the landing page and the demo only
```

`dist-site/` is ignored by git. Copy it anywhere: every URL in it is relative.

## Why the demo is a separate Vite mode

The `site` mode (`apps/ui/.env.site`, `apps/ui/vite.config.ts`) differs from the older `demo` mode, which `pages.yml` builds under the absolute `/narration-utils/demo/`:

- **Relative base.** Assets resolve beside `index.html`, so the folder opens from any sub-path and from a sandboxed frame.
- **Hash routes.** `VITE_ROUTER=hash` makes `App.tsx` use `HashRouter`, because a static host cannot rewrite `/proof` to `index.html`. A page is `demo/index.html#/proof`.
- **No probe for the desktop host's script.** The Wails runtime asks `/wails/custom.js` with a HEAD request; the `site` mode removes that call, so the demo makes no request outside its own folder. The site plugin also strips `crossorigin` from the built page.
- **The demo banner.** `VITE_DEMO=1`, as in the `demo` mode, so every page says it is a demo with nothing saved.

The build script then fails when any built HTML or CSS file loads something by an absolute path or from another host (`scripts/site/siteFiles.mjs`). The Pages `demo` mode is untouched.

## The simulated DAW

The demo boots with the DAW's Experimental switch on (`VITE_SITE=1`, read in `apps/ui/src/main.tsx`; Settings > Recording & DAW shows it on), because the mock DAW refuses every DAW action while it is off. The mock host already answers the DAW port like REAPER's adapter would. Two pieces make that visible:

- **`apps/ui/src/api/mockHost/simulatedDaw.ts`** wraps `NarrationApi` in the site build only. It passes every answer through unchanged and keeps a picture of what the calls did to a DAW project: the cursor `Show in REAPER` moved, the take markers `Add marker in REAPER` dropped, pickup runs, recording started and stopped, takes made current, the render setup and the cleanup tools the app opened. It depends on `NarrationApi`, never on a concrete adapter. A refused call is shown as refused and changes nothing.
- **`apps/ui/src/components/devtools/SimulatedDawPanel.tsx`** is the **Simulated DAW** badge at the bottom right of every page, which opens a small non-modal panel: connection, project, transport, cursor, a timeline with the markers, and the last actions. It can switch the demo to Audacity (which has no take markers), start it unlinked (a fresh machine whose folder holds `Alice.rpp`, so Settings > Recording & DAW offers **Link Alice.rpp**), and make the DAW stop or start answering. The mock reads its scenario once at boot (`?mockDaw=`, `?mockDawChoice=`), so a scenario choice reloads the page.

## Smoke test

```bash
pnpm --dir apps/ui run test:site
```

`apps/ui/playwright.site.config.ts` builds `dist-site/`, serves it under `/narration-utils/` and runs `apps/ui/tests/site/site.spec.ts`: the landing page loads from the sub-path, the demo opens, a Proof note marked **Needs pickup** moves the rail's Pickups count at once and appears in Pickups and in Production's open-pickups tile, the simulated DAW shows Show in REAPER, a marker, a Booth take, the render setup, a cleanup tool and the linking of an unlinked project, and no request leaves the folder or fails. `SITE_SKIP_BUILD=1` serves the folder as it is. In a container, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the installed Chromium ([verification tooling](verification-tooling.md)).

## Build it in CI, without publishing

The manual workflow `.github/workflows/site-preview.yml` runs `pnpm run site:build` and uploads `dist-site/` as the `demo-site` artifact (14 days). It has a read-only token, no secret, no `pages: write` and no `id-token: write`.

## What the owner flips to publish

Not done by any pull request:

1. Settings > Pages > Source: **GitHub Actions** (owner-only, [repository settings](github-workflow.md#repository-settings-that-only-the-owner-can-change)).
2. Restore the triggers in `pages.yml` as its header comment lists them, or add a step that runs `pnpm run site:build` and uploads `dist-site/` with `actions/upload-pages-artifact` in place of the MkDocs output.
3. Start `pages.yml` on `main` with `publish` ticked.
