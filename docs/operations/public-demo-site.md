# The public demo site

How to build and run the public site: a landing page, the real app in its mock mode as a live demo, the docs and the Storybook, in one folder that needs no backend. Nothing here is published. GitHub Pages stays paused ([The Pages workflow](ci-and-releases.md#the-pages-workflow), owner decision D75), and `pages.yml` keeps its triggers.

## Where it lives

The site is `apps/site/`, an Nx project (`narration-utils-site`) and a pnpm workspace of its own. The Studio app is `apps/ui/` and holds no site code. The site is built from the app and plugs into it at one seam; the app never imports the site.

| Folder | What |
| --- | --- |
| `apps/site/landing/`, `common/`, `docs/` | The landing page, the shell's styles and script, and the condensed docs (`docs/*.md` with the page styles and script) |
| `apps/site/build/` | The build and serve scripts and their `node:test` suites: `build-demo-site.mjs`, `shell.mjs`, `guides.mjs`, `windowPages.mjs`, `siteFiles.mjs`, `serve.mjs` |
| `apps/site/demo/` | The demo app's build: `index.html`, `vite.config.ts` (the `site` and `demo` modes), `.env.site`, `.env.demo`, and `src/` (the banner, the Simulated DAW, the window protocol, `entry.ts` and `register.ts`) |
| `apps/site/tests/`, `playwright.config.ts` | The Playwright smoke test of the built site |
| `apps/ui/` (shared, not moved) | Everything the demo shows: the app, its design tokens and `styles.css`, the primitives, the mock host and the sample project, and the Storybook (`apps/ui/.storybook/`, which the atlas also builds) |

**The boundary.** The site reaches the app through one alias, `@ui/*` (`apps/ui/src/*`; `tsconfig.json`, `demo/vite.config.ts`, `vitest.config.ts`), and `apps/site/.dependency-cruiser.mjs` lists the app modules it may use: the extension seam, `main`, `motion`, `types`, the primitives and the mock API. ESLint rejects a relative path out of `apps/site`. The app never names the site: `apps/ui/.dependency-cruiser.mjs` has the rule `app-does-not-import-the-site`. The seam is `apps/ui/src/appExtension.tsx`: `demo/src/entry.ts` imports `register.ts`, which registers an extension, and then imports `@ui/main`. The extension can add a banner above every top-level screen, hash routing, the Play animations switch, a keyboard-only input source, Experimental DAW capabilities on boot, a wrapper for the mock API, a host-chosen theme and a start hook. The Wails build registers nothing, so every field is absent there.

## What it holds

| Path in `dist-site/` | What | Built by |
| --- | --- | --- |
| `index.html` | The landing page: the Product view of the [public-site mock](../research/mockups/public-site/index.html), with **Try the live demo**, the workflow tabs, the docs, demo and Storybook cards and the install steps | `apps/site/landing/index.html`, in the [site shell](#the-site-shell) |
| `demo/index.html` | The live demo page: the site shell around a window that shows `demo/app.html` ([The demo window](#the-demo-window)) | `apps/site/build/windowPages.mjs` |
| `demo/app.html` | The real UI (`apps/ui`), built from `apps/site/demo` with `vite build --mode site` as one self-contained page (about 4.5 MB: script, styles, fonts and icon inline): the mock host (`createMockApi`) and its sample project, Alice's Adventures in Wonderland (public domain). It also opens on its own, in a tab | `pnpm --dir apps/site run build:app` |
| `docs/` | The Docs section: one static page per condensed guide in `apps/site/docs/*.md` (`index.html` is the overview), with the screenshots they use in `docs/images/` | `apps/site/build/guides.mjs`, from `build-demo-site.mjs` |
| `storybook/index.html` | The Storybook page: the same window around `storybook/sb/` ([The Storybook window](#the-storybook-window)) | `apps/site/build/windowPages.mjs` |
| `storybook/sb/` | The component Storybook | `pnpm --dir apps/ui run build-storybook` |

## Build and run it

```bash
pnpm run site:build    # builds the UI, the Storybook, the landing page and the docs into dist-site/
pnpm run site:serve    # serves dist-site/ at http://localhost:4180/
node apps/site/build/serve.mjs dist-site --base /narration-utils/ --port 4180   # the same, under a sub-path, as Pages serves it
node apps/site/build/build-demo-site.mjs --skip-storybook                        # the landing page, the docs and the demo only
```

The same through Nx: `pnpm exec nx run narration-utils-site:build-site` and `:serve-site`. The project's other targets are `lint`, `format`, `architecture` (the import rules above), `typecheck`, `test` (Vitest over `demo/src`), `test-node` (the build scripts' suites) and `test-site` (the smoke test below). `pnpm check` and the `quality / js-static` job run all of them except `test-site` and `build-site`; the site build is not part of the gate while publishing is on hold.

`dist-site/` is ignored by git. Copy it anywhere: the landing page, each docs page, the demo page and the app are each one file with nothing fetched from outside it (the demo page loads only `app.html` beside it), and the links between the pieces (`demo/index.html`, `storybook/index.html`, and the full-tab banner's **Site** and **Storybook** links back) are relative. The Storybook is a folder of files, as Storybook builds it.

## The demo window

`demo/index.html` is built in the [site shell](#the-site-shell): it keeps the site's header (Product, Docs, Live demo, Storybook, search, theme, Download) and footer, and shows the app inside a window in the design mock's style (`docs/research/mockups/public-site/index.html`): a title bar with the page's name, the demo's controls and three window dots.

- **The frame.** The window is `<iframe sandbox="allow-scripts">` of `app.html?embed=1`. Its viewport is the window, so the app's media queries answer to the window's size. The window is as wide as the content column (1280 px at most) and 800 px tall, because the app's icon rail needs about 780 px to show every page; a shorter screen scrolls the page. Narrower than the desktop app's minimum window (960 px, `apps/desktop/main.go`), the frame stays 960 px wide and is drawn smaller, with a note that the app is best on a larger screen and a link to open it in a tab. Clicking into the app scrolls the whole window into view when the screen is tall enough.
- **The title bar** holds the Simulated DAW badge, **Play animations**, **How to use this page** and **Open in a new tab**. The app draws no banner and no floating badge in the window; the badge's panel opens inside the window, under the title bar.
- **Talking across the frame.** The sandboxed frame has an opaque origin and no storage, so the page and the app exchange messages on the `narration-site` channel (`apps/site/demo/src/siteWindow.ts`, `apps/site/build/windowPages.mjs`). The page sends the site's theme, Play animations, a route to open and the panel's open state; the app sends its route (with the docs page that explains it) and what the badge says. Each side reads only messages from the other's window, and only the named fields: a route must be a path such as `/proof/ch-3`, and the page writes what it shows as text. The first theme and Play animations ride in the frame's address (`?siteTheme=dark`, `?motion=play`), so the first paint matches the page.
- **The address.** The page's hash is the app's route: `demo/index.html#/proof` opens Proof in the window, a page opened in the app updates it, and any other query on the page (`?mockDaw=live`) is passed to the frame.
- **Input.** In the window the app listens to the keyboard only: a frame without a permissions grant gets no MIDI or HID, and asking logs an error. A pedal works in the app opened in a tab. A key goes to whatever has focus, so the app takes focus when the pointer enters the window (`startSiteWindow`, `apps/site/demo/src/siteWindow.ts`), and the page gives it back after the title bar's **Play animations** or DAW badge is used. A click in the window focuses it as well. With focus on the page, outside the window, **Ctrl K** is the site's search.
- **In a tab of its own** (`demo/app.html`), the app draws the demo banner, and the Simulated DAW badge sits in the banner's row (`apps/site/demo/src/demoToolbar.ts`). A screen with no banner (the Booth) keeps the badge in its corner.

## The Storybook window

`storybook/index.html` shows the Storybook manager (`storybook/sb/index.html`) in the same window, with **Open in a new tab**. It opens with `globals=theme:<site theme>`, which the repository's Theme toolbar control reads (`apps/ui/.storybook/preview.tsx`), and `apps/ui/.storybook/manager.ts` gives Storybook's own sidebar and toolbar the dark theme when that global is dark. Switching the site's theme reopens the Storybook on the same story. The frame is not sandboxed: Storybook's manager and its story frame need the page's origin to talk to each other, and the page reads the story the visitor is on from the frame's address.

## The site shell

`apps/site/build/shell.mjs` holds what every site page shares, cut from the mock: the app's fonts and icon as data URIs, the theme applied before the first paint, the notice strip, the top bar (**Product**, **Docs**, **Live demo**, **Storybook**, search, theme, **Download**), the footer, the search palette (Ctrl K) and the toasts. Its styles and script are `apps/site/common/shell.css` and `shell.js`; the script puts its helpers on `window.Site` for a page's own script.

- `sitePage({ title, meta, css, body, script, base, current, withStorybook, search })` returns a whole page: the docs, the demo page and the Storybook page use it.
- `fillShell(template, options)` fills the `<!--shell:head-->`, `<!--shell:header-->` and `<!--shell:footer-->` markers of a page template: the landing page uses it.
- `base` is the way back to the site's root (`''` for `index.html`, `'../'` for a page in `docs/`), so every link stays relative. `current` is the top bar entry marked as the page (`home`, `docs`, `demo`, `storybook`). `search` is the palette's entries, from `searchItems()`.
- The top bar links `demo/index.html` and `storybook/index.html`; a page there is built with the same shell.
- The theme uses the app's key, `narration-ui-theme`: the site opens in the theme the demo last stored on this origin, and the toggle stores `light` or `dark`.
- The notice strip (`NOTICE` in `shell.mjs`) says the site is an unpublished preview. Remove it in the change that publishes the site.

## The docs

The Docs section is the mock's docs view, filled with a condensed copy of each page of the repository's guides (`docs/guides/using-the-app/`): what the page is for, the steps in order and one or two screenshots from `docs/images/ui/`. The full guides stay the source of truth; each docs page links its guide as **Full guide on GitHub**, and edge cases and long tables stay there.

- A page is `apps/site/docs/<page>.md`, named as its guide (`index.md` for the guide's `README.md`), with `title` and `lead` in its front matter and its sections as `##` headings, which make **On this page**. A screenshot alone in a paragraph becomes a figure, its title the caption; a quote that opens with `**Note:**` becomes a note.
- `GROUPS` in `apps/site/build/guides.mjs` is the sidebar, in the app's sidebar groups, and `DEMO_ROUTE` the demo page each docs page opens. A new page is added to both.
- The build fails on a link to a page or heading that does not exist, a repository link or screenshot that points nowhere, a page in no group, a listed page with no source, and a page with no full guide (`apps/site/build/guides.test.mjs`).
- When a guide changes, check whether its condensed page still holds; markdown-it renders the pages at build time and nothing in `dist-site/` is tracked.
- In the demo, **How to use this page** (in the window's title bar, and in the banner of the app opened in a tab) goes to the docs page for the page on screen (`apps/site/demo/src/demoGuide.ts` maps a route to its page), and to the overview for a route no page covers.

## Play animations

The app moves only when the device allows it ([Motion and animation](../design/motion-and-animation.md#reduced-motion)). A phone with Reduce Motion on shows the demo none of that, so the demo window's title bar (and the banner of the app opened in a tab) has a **Play animations** switch, off by default (the demo then follows the device, as the app does). Switched on, it sets `<html data-motion="play">`, which the `motion-ok:` variant, the `--motion-*` tokens and `reducedMotion()` treat as "motion is on", and it is kept in this browser (`narration-ui-demo-play-motion`) and applied before the first paint. It exists only in a demo build (`VITE_DEMO=1`): the app keeps following the device and Settings > Motion is unchanged.

## Why the demo is a separate Vite mode

The `site` mode (`apps/site/demo/.env.site`, `apps/site/demo/vite.config.ts`) differs from the older `demo` mode, which `pages.yml` builds under the absolute `/narration-utils/demo/`:

- **One file.** `sitePlugin` in `apps/site/demo/vite.config.ts` inlines the single script chunk and the stylesheet into `index.html` and the fonts and icon as data URIs, because a module script or a font fetched from a file beside the page needs CORS headers, which a sandboxed frame's host may not send. The page then opens from any sub-path, from a file server and inside `<iframe sandbox="allow-scripts">` with no network.
- **Hash routes.** `VITE_ROUTER=hash` makes the extension ask for `hashRouting`, so `App.tsx` uses `HashRouter`, because a static host cannot rewrite `/proof` to `index.html`. A page is `demo/app.html#/proof` (and `demo/index.html#/proof` in the window).
- **No probe for the desktop host's script.** The Wails runtime asks `/wails/custom.js` with a HEAD request; the `site` mode removes that call, so the demo makes no request outside its own folder.
- **The demo banner.** The extension registers the banner in both the `site` and the `demo` mode (`apps/site/demo/src/register.ts`), so every page says it is a demo with nothing saved (in the window, the page around it says so). The regular mock build used by Vitest, the visual suite and Storybook registers none.
- **The mock reader's pace.** The mock teleprompter (`apps/ui/src/api/teleprompterMock.ts`, every mock build) reads at `MOCK_READING_WORDS_PER_MINUTE`, 150 words a minute: it replays its recorded 100-word read-through one block after another across the chapter, so the Booth's highlight moves as a narrator reads. Play animations and reduced motion act on it as on the real app (`booth/usePacedCursor.ts`).
- **Banner links.** In the site build the demo banner also links **Site** (`../index.html`) and **Storybook** (`../storybook/index.html`), and below 860 px wide says the app is best on a larger screen (the app has no phone layout).

The build script then fails when any built HTML or CSS file loads something by an absolute path or from another host (`apps/site/build/siteFiles.mjs`), and gives Storybook's pages an empty icon so no browser asks the host's root for `/favicon.ico`. The Pages `demo` mode is untouched.

## The simulated DAW

The demo boots with the DAW's Experimental switch on (`VITE_SITE=1` makes the site's extension set `experimentalDaw`, which `apps/ui/src/main.tsx` reads; Settings > Recording & DAW shows it on), because the mock DAW refuses every DAW action while it is off. The mock host already answers the DAW port like REAPER's adapter would. Two pieces make that visible:

- **`apps/site/demo/src/simulatedDaw.ts`** wraps `NarrationApi` in the site build only (the extension's `wrapApi`). It passes every answer through unchanged and keeps a picture of what the calls did to a DAW project: the cursor `Show in REAPER` moved, the take markers `Add marker in REAPER` dropped, pickup runs, recording started and stopped, takes made current, the render setup and the cleanup tools the app opened. It depends on `NarrationApi`, never on a concrete adapter. A refused call is shown as refused and changes nothing.
- **`apps/site/demo/src/SimulatedDawPanel.tsx`** is the **Simulated DAW** badge (in the demo window's title bar, or in the banner of the app opened in a tab), which opens a small non-modal panel: connection, project, transport, cursor, a timeline with the markers, and the last actions. It can switch the demo to Audacity (which has no take markers), start it unlinked (a fresh machine whose folder holds `Alice.rpp`, so Settings > Recording & DAW offers **Link Alice.rpp**), and make the DAW stop or start answering. The mock reads its scenario once at boot (`?mockDaw=`, `?mockDawChoice=`), so a scenario choice reloads the page.

## Smoke test

```bash
pnpm --dir apps/site run test:site
```

`apps/site/playwright.config.ts` builds `dist-site/`, serves it under `/narration-utils/` and runs `apps/site/tests/site.spec.ts`: the landing page loads from the sub-path, the demo opens, every docs page exists and its screenshots load, the docs have the mock's sidebar, On this page and next links, a demo page links its docs page and back, a docs page runs inside a sandboxed frame, the **Play animations** switch turns transitions on and off under emulated reduced motion, the app and the landing page each run inside a sandboxed frame with no request but their own file, the demo page keeps the site header and shows the app in its sandboxed window with the Simulated DAW badge in the title bar and nothing of the badge's in the frame, the window follows the app's route both ways and links its docs page, the site's theme switch and Play animations reach the app in the window, real key presses reach the app when the pointer is over the window or the title bar was used and leave Ctrl K as the site's search outside it, a phone draws the 960 px window smaller with the larger-screen note, the badge sits in the banner of the app opened in a tab and covers nothing, the Storybook page opens a story in the site's theme and its Theme control, Controls and Accessibility panels work, Storybook opens from the landing page and the banner and renders a story, the landing page follows the stored app theme, a Proof note marked **Needs pickup** moves the rail's Pickups count at once and appears in Pickups and in Production's open-pickups tile, the simulated DAW shows Show in REAPER, a marker, a Booth take, the render setup, a cleanup tool and the linking of an unlinked project, and no request leaves the folder or fails. `SITE_SKIP_BUILD=1` serves the folder as it is. In a container, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the installed Chromium ([verification tooling](verification-tooling.md)).

## Build it in CI, without publishing

The manual workflow `.github/workflows/site-preview.yml` runs `pnpm run site:build` and uploads `dist-site/` as the `demo-site` artifact (14 days). It has a read-only token, no secret, no `pages: write` and no `id-token: write`.

## What the owner flips to publish

Not done by any pull request:

1. Settings > Pages > Source: **GitHub Actions** (owner-only, [repository settings](github-workflow.md#repository-settings-that-only-the-owner-can-change)).
2. Restore the triggers in `pages.yml` as its header comment lists them, or add a step that runs `pnpm run site:build` and uploads `dist-site/` with `actions/upload-pages-artifact` in place of the MkDocs output.
3. Start `pages.yml` on `main` with `publish` ticked.
