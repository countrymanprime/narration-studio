# The public demo site

How to build and run the public site: a landing page, the real app in its mock mode as a live demo, the docs and the Storybook, in one folder that needs no backend. Nothing here is published. GitHub Pages stays paused ([The Pages workflow](ci-and-releases.md#the-pages-workflow), owner decision D75), and `pages.yml` is unchanged.

## What it holds

| Path in `dist-site/` | What | Built by |
| --- | --- | --- |
| `index.html` | The landing page: the Product view of the [public-site mock](../research/mockups/public-site/index.html), with **Try the live demo**, the workflow tabs, the docs, demo and Storybook cards and the install steps | `scripts/site/landing/index.html`, in the [site shell](#the-site-shell) |
| `demo/index.html` | The real UI (`apps/ui`), built with `vite build --mode site` as one self-contained page (about 4.5 MB: script, styles, fonts and icon inline): the mock host (`createMockApi`) and its sample project, Alice's Adventures in Wonderland (public domain) | `pnpm --dir apps/ui run build:site` |
| `docs/` | The Docs section: one static page per condensed guide in `scripts/site/docs/*.md` (`index.html` is the overview), with the screenshots they use in `docs/images/` | `scripts/site/guides.mjs`, from `build-demo-site.mjs` |
| `storybook/` | The component Storybook | `pnpm --dir apps/ui run build-storybook` |

## Build and run it

```bash
pnpm run site:build    # builds the UI, the Storybook, the landing page and the docs into dist-site/
pnpm run site:serve    # serves dist-site/ at http://localhost:4180/
node scripts/site/serve.mjs dist-site --base /narration-utils/ --port 4180   # the same, under a sub-path, as Pages serves it
node scripts/site/build-demo-site.mjs --skip-storybook                        # the landing page, the docs and the demo only
```

`dist-site/` is ignored by git. Copy it anywhere: the landing page, each docs page and the demo are each one file with nothing fetched from outside it, and the links between the pieces (`demo/index.html`, `storybook/index.html`, and the banner's **Site** and **Storybook** links back) are relative. The Storybook is a folder of files, as Storybook builds it.

## The site shell

`scripts/site/shell.mjs` holds what every site page shares, cut from the mock: the app's fonts and icon as data URIs, the theme applied before the first paint, the notice strip, the top bar (**Product**, **Docs**, **Live demo**, **Storybook**, search, theme, **Download**), the footer, the search palette (Ctrl K) and the toasts. Its styles and script are `scripts/site/shell/shell.css` and `shell.js`; the script puts its helpers on `window.Site` for a page's own script.

- `sitePage({ title, meta, css, body, script, base, current, withStorybook, search })` returns a whole page: the docs use it.
- `fillShell(template, options)` fills the `<!--shell:head-->`, `<!--shell:header-->` and `<!--shell:footer-->` markers of a page template: the landing page uses it.
- `base` is the way back to the site's root (`''` for `index.html`, `'../'` for a page in `docs/`), so every link stays relative. `current` is the top bar entry marked as the page (`home`, `docs`, `demo`, `storybook`). `search` is the palette's entries, from `searchItems()`.
- The top bar links `demo/index.html` and `storybook/index.html`; a page there is built with the same shell.
- The theme uses the app's key, `narration-ui-theme`: the site opens in the theme the demo last stored on this origin, and the toggle stores `light` or `dark`.
- The notice strip (`NOTICE` in `shell.mjs`) says the site is an unpublished preview. Remove it in the change that publishes the site.

## The docs

The Docs section is the mock's docs view, filled with a condensed copy of each page of the repository's guides (`docs/guides/using-the-app/`): what the page is for, the steps in order and one or two screenshots from `docs/images/ui/`. The full guides stay the source of truth; each docs page links its guide as **Full guide on GitHub**, and edge cases and long tables stay there.

- A page is `scripts/site/docs/<page>.md`, named as its guide (`index.md` for the guide's `README.md`), with `title` and `lead` in its front matter and its sections as `##` headings, which make **On this page**. A screenshot alone in a paragraph becomes a figure, its title the caption; a quote that opens with `**Note:**` becomes a note.
- `GROUPS` in `scripts/site/guides.mjs` is the sidebar, in the app's sidebar groups, and `DEMO_ROUTE` the demo page each docs page opens. A new page is added to both.
- The build fails on a link to a page or heading that does not exist, a repository link or screenshot that points nowhere, a page in no group, a listed page with no source, and a page with no full guide (`scripts/site/guides.test.mjs`).
- When a guide changes, check whether its condensed page still holds; markdown-it renders the pages at build time and nothing in `dist-site/` is tracked.
- In the demo, the banner's **How to use this page** link goes to the docs page for the page on screen (`apps/ui/src/components/layout/demoGuide.ts` maps a route to its page), and to the overview for a route no page covers.

## Play animations

The app moves only when the device allows it ([Motion and animation](../design/motion-and-animation.md#reduced-motion)). A phone with Reduce Motion on shows the demo none of that, so the demo banner has a **Play animations** switch, off by default (the demo then follows the device, as the app does). Switched on, it sets `<html data-motion="play">`, which the `motion-ok:` variant, the `--motion-*` tokens and `reducedMotion()` treat as "motion is on", and it is kept in this browser (`narration-ui-demo-play-motion`) and applied before the first paint. It exists only in a demo build (`VITE_DEMO=1`): the app keeps following the device and Settings > Motion is unchanged.

## Why the demo is a separate Vite mode

The `site` mode (`apps/ui/.env.site`, `apps/ui/vite.config.ts`) differs from the older `demo` mode, which `pages.yml` builds under the absolute `/narration-utils/demo/`:

- **One file.** `sitePlugin` in `vite.config.ts` inlines the single script chunk and the stylesheet into `index.html` and the fonts and icon as data URIs, because a module script or a font fetched from a file beside the page needs CORS headers, which a sandboxed frame's host may not send. The page then opens from any sub-path, from a file server and inside `<iframe sandbox="allow-scripts">` with no network.
- **Hash routes.** `VITE_ROUTER=hash` makes `App.tsx` use `HashRouter`, because a static host cannot rewrite `/proof` to `index.html`. A page is `demo/index.html#/proof`.
- **No probe for the desktop host's script.** The Wails runtime asks `/wails/custom.js` with a HEAD request; the `site` mode removes that call, so the demo makes no request outside its own folder.
- **The demo banner.** `VITE_DEMO=1`, as in the `demo` mode, so every page says it is a demo with nothing saved.

- **Banner links.** In the site build the demo banner also links **Site** (`../index.html`) and **Storybook** (`../storybook/index.html`), and below 860 px wide says the app is best on a larger screen (the app has no phone layout).

The build script then fails when any built HTML or CSS file loads something by an absolute path or from another host (`scripts/site/siteFiles.mjs`), and gives Storybook's pages an empty icon so no browser asks the host's root for `/favicon.ico`. The Pages `demo` mode is untouched.

## The simulated DAW

The demo boots with the DAW's Experimental switch on (`VITE_SITE=1`, read in `apps/ui/src/main.tsx`; Settings > Recording & DAW shows it on), because the mock DAW refuses every DAW action while it is off. The mock host already answers the DAW port like REAPER's adapter would. Two pieces make that visible:

- **`apps/ui/src/api/mockHost/simulatedDaw.ts`** wraps `NarrationApi` in the site build only. It passes every answer through unchanged and keeps a picture of what the calls did to a DAW project: the cursor `Show in REAPER` moved, the take markers `Add marker in REAPER` dropped, pickup runs, recording started and stopped, takes made current, the render setup and the cleanup tools the app opened. It depends on `NarrationApi`, never on a concrete adapter. A refused call is shown as refused and changes nothing.
- **`apps/ui/src/components/devtools/SimulatedDawPanel.tsx`** is the **Simulated DAW** badge at the bottom right of every page, which opens a small non-modal panel: connection, project, transport, cursor, a timeline with the markers, and the last actions. It can switch the demo to Audacity (which has no take markers), start it unlinked (a fresh machine whose folder holds `Alice.rpp`, so Settings > Recording & DAW offers **Link Alice.rpp**), and make the DAW stop or start answering. The mock reads its scenario once at boot (`?mockDaw=`, `?mockDawChoice=`), so a scenario choice reloads the page.

## Smoke test

```bash
pnpm --dir apps/ui run test:site
```

`apps/ui/playwright.site.config.ts` builds `dist-site/`, serves it under `/narration-utils/` and runs `apps/ui/tests/site/site.spec.ts`: the landing page loads from the sub-path, the demo opens, every docs page exists and its screenshots load, the docs have the mock's sidebar, On this page and next links, a demo page links its docs page and back, a docs page runs inside a sandboxed frame, the **Play animations** switch turns transitions on and off under emulated reduced motion, the demo and the landing page each run inside a sandboxed frame with no request but their own file, Storybook opens from the landing page and the banner and renders a story, the landing page follows the stored app theme, a Proof note marked **Needs pickup** moves the rail's Pickups count at once and appears in Pickups and in Production's open-pickups tile, the simulated DAW shows Show in REAPER, a marker, a Booth take, the render setup, a cleanup tool and the linking of an unlinked project, and no request leaves the folder or fails. `SITE_SKIP_BUILD=1` serves the folder as it is. In a container, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the installed Chromium ([verification tooling](verification-tooling.md)).

## Build it in CI, without publishing

The manual workflow `.github/workflows/site-preview.yml` runs `pnpm run site:build` and uploads `dist-site/` as the `demo-site` artifact (14 days). It has a read-only token, no secret, no `pages: write` and no `id-token: write`.

## What the owner flips to publish

Not done by any pull request:

1. Settings > Pages > Source: **GitHub Actions** (owner-only, [repository settings](github-workflow.md#repository-settings-that-only-the-owner-can-change)).
2. Restore the triggers in `pages.yml` as its header comment lists them, or add a step that runs `pnpm run site:build` and uploads `dist-site/` with `actions/upload-pages-artifact` in place of the MkDocs output.
3. Start `pages.yml` on `main` with `publish` ticked.
