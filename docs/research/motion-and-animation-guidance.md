# Where the app should animate, and what to take from the mock site

**Date:** 2026-10-18. **Status:** evidence and a proposal for the owner; nothing here is decided or built. **Question:** where should the app have animations, and which of the [mock product site](mockups/public-site/index.html)'s animations should inform them? What does the owner still need to address on that site? **Tracking:** [#1456](https://github.com/countrymanprime/narration-utils/issues/1456) (shared motion tokens and guidance on when to animate).

## Method

Every finding is labelled:

- **Measured:** a number from a script run on 2026-10-18.
- **Observed:** seen in a capture or read from code, with a file and line.
- **Estimated:** reasoning, not measured.

Runs:

- **Mock site, run.** `docs/research/mockups/public-site/index.html` is one file with no build step. It ran in headless Chromium 141.0.7390.37 (the container's Playwright build) at 1440 × 900 from `file://`, with Google Fonts blocked, so the frames use fallback fonts.
  - A Playwright script read `document.getAnimations()` at load, during a scroll, on hover over each interactive class, on press, on each workflow tab, on each view change, in the Ctrl+K palette, after a Proof decision and during a Delivery build. Each animation's target, animated properties, duration, delay, iterations and easing are recorded.
  - The same script ran a second time with `reducedMotion: 'reduce'`.
  - 12 frames of the hero were captured at 330 ms intervals, with a Playwright video beside them. Both stay in the session scratchpad and are not committed.
- **CPU cost, measured.** For 10 s per scenario, the script read three things:
  - Chromium's `SystemInfo.getProcessInfo` CPU time across all processes;
  - `Performance.getMetrics` for main-thread task time, style recalculations and layouts;
  - a `devtools.timeline` trace for paint and frame counts.
  The scenarios were: the mock site's hero, its Record tab, and its demo Proof page; and five pages of the real UI's mock build (`pnpm --dir apps/ui run build:mock`, served locally). This is Linux headless with software compositing, not WebView2 on Windows with a GPU. The absolute numbers are higher than a narrator's machine would show. The ratios are the finding.
- **Real app, read.** Read from `apps/ui/src`, the visual and atlas Playwright configs, `.storybook/preview-head.html`, the [page guides](../guides/using-the-app/README.md), [the motion reference](../design/motion-and-animation.md), [interaction feedback](../architecture/interaction-feedback.md) and the [latency baseline](interaction-latency-baseline.md).
- **Issues, read.** Read on GitHub on 2026-10-18: [#1456](https://github.com/countrymanprime/narration-utils/issues/1456), and #1844 to #1848.
- **Studio Next mock:** not consulted for motion. It is frozen ([#1860](https://github.com/countrymanprime/narration-utils/issues/1860)) and is the spec for what pages draw, not for how they move.
- **Not run:** WebView2 itself, a GPU machine, REAPER recording at the same time, and the real desktop host.

## Findings

### 1. Every animation on the mock site

Measured with `getAnimations()` unless marked. "Compositor" means only `transform` or `opacity` animate, which Chromium can run off the main thread. "Paint" and "layout" mean the main thread repaints or re-lays out on every frame.

| # | Trigger | Element | Property (cost class) | Duration, easing, delay | Loop | Technique | Marketing-only or reusable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Load, always | Brand mark, 4 bars in the sticky header | `transform: scaleY(.55)` (compositor) | 1800 ms ease-in-out, staggered 0/200/400/600 ms | Infinite, on every view | CSS `@keyframes mark` (line 102) | Marketing. Never in the app |
| M2 | Load | Hero `h1`, 3 lines | `transform` 22 px up, `opacity` .35 to 1 (compositor) | 800 ms `cubic-bezier(.2,.7,.2,1)`, stagger 80 ms | Once | CSS `rise` (line 133) | Marketing |
| M3 | Hero in view (IntersectionObserver) | Read-along words | `background-color`, `color` (paint) | 200 ms ease. JS steps one word every 230 ms, holds 3.6 s, repeats | Loops while in view; the JS loop stops when out of view | `setTimeout` loop plus CSS transition (lines 676-689) | Pattern reusable: Booth already lights the current word. The loop is marketing |
| M4 | Load, always | Hero waveform, 46 bars | `transform: scaleY(.35)` (compositor) | 1400 ms ease-in-out, negative delays for a wave | Infinite, keeps running out of view | CSS `bar` (line 154) | Marketing. Decorative: the lit bars do not follow the lit word (observed in the frames) |
| M5 | Skipped word reached | "Skipped word" take note | `opacity`, `transform` 8 px (compositor) | 350 ms ease | Once per loop | CSS transition on a `.hide` class | Reusable: a new failure arriving beside the thing it is about |
| M6 | Load, always | REC dot | `opacity` (compositor), `steps(2)` blink | 1200 ms | Infinite | CSS `blink` (line 160) | Do not take: the app's REC pill is static, and a blink is attention for no new event |
| M7 | Scroll into view, threshold .12 | Section heads, stats, tabs, cards (`.reveal`) | `transform` 14 px up (compositor); never opacity, so content is readable at rest | 700 ms `cubic-bezier(.2,.7,.2,1)` | Once | IntersectionObserver plus a CSS transition | Marketing |
| M8 | Stats scroll into view | Four figures | Text count-up, cubic ease-out | 900 ms | Once | `requestAnimationFrame` (line 691) | Do not take: a changing number reads as live data |
| M9 | View change (`#home`, `#docs`, `#demo`, `#storybook`) | Whole view | `opacity` .4 to 1, `transform` 8 px (compositor) | 400 ms `cubic-bezier(.2,.7,.2,1)` | Once | CSS `viewIn` on `.view.on` (line 119) | Do not take for page navigation (see section 2). The curve is worth keeping |
| M10 | Workflow tab picked | Tab preview card | `opacity`, `transform` (compositor) | 450 ms ease | Once | `viewIn` | Marketing |
| M11 | Record tab | Level meter fill | `width` (layout), set every 130 ms by `setInterval`, transition 120 ms linear | Random values | While shown | JS plus a CSS transition | Already in the app: `LevelMeter` animates `width` 150 ms, motion-safe |
| M12 | Edit and Finish tabs | Take and progress fills | `width` 0 to `--w` (layout) | 1800 ms ease-out, 200 ms delay | Once | CSS `grow` | Do not take: fake progress. The app's bars show real progress only ([latency baseline](interaction-latency-baseline.md), "nothing here needs a fake or padded indicator") |
| M13 | Review tab and demo Proof | Cleared ring | Declares `transition: --p .6s` | None in practice | — | CSS | Broken. `--p` is not registered with `@property`, so it jumps. After a demo decision no ring animation ran (measured) |
| M14 | Hover, press | `.btn` | `background-color`, `box-shadow` (paint) 150 ms; `transform: translateY(1px)` on `:active`, 120 ms | ease | — | CSS transition | Reusable: press feedback. The app's `Button` has a bare `transition` with no guard (see section 2) |
| M15 | Pointer move | Three feature cards | Radial-gradient spotlight that follows the pointer (`--mx`, `--my`); `::before` opacity 250 ms | ease | — | `pointermove` plus a CSS variable | Marketing |
| M16 | Hover | Tour cards, arrow icons | `transform` −3 px with a shadow; arrow +4 px (compositor plus paint) | 200 ms ease | — | CSS | Marketing |
| M17 | Ctrl+K | Palette scrim and panel | `viewIn` | 180 ms ease | Once | CSS | Reusable: an overlay that enters fast. The app's Jump menu (Ctrl+K) is instant |
| M18 | Toast shown | Toast | `viewIn` | 250 ms ease. Exit is instant (`t.remove()`) | Once | CSS | Reusable on enter. The app does the reverse: instant enter, a 150 ms fade on exit |
| M19 | Demo page load, docs cards | Skeleton bars | `background-position` shimmer (paint) | 1200 ms ease | Infinite | CSS `shimmer` | Do not take: every app call is tier 1, under 10 ms ([latency baseline](interaction-latency-baseline.md)) |
| M20 | Delivery Build | Three build steps | Shimmer dot, then text colour per step | 350 ms per step (`wait`) | Once | JS | Do not take: fixed delays invent progress. The app's build has a real bar |
| M21 | Docs contents link | Scroll to a heading | `scroll-behavior: smooth`, or `auto` under reduced motion | Browser | — | `scrollIntoView` | Reusable for long jumps (Booth already does this, guarded) |
| M22 | Storybook view, viewport switch | Canvas | `max-width` (layout) | 300 ms | — | CSS | Tooling only |

**Reduced motion (measured).** The site's blanket rule (line 419) cuts every duration to 0.001 ms with one iteration, and turns off the reveal offset. The read-along JS jumps to its final frame ("Heard 16 of 17 words", the skip shown). The meter interval does not start. With `reducedMotion: 'reduce'` no animation was running after load, and the hero cost the same as a blank page (table below).

**Mistakes in the motion itself** (measured or observed; these are in addition to the mock site fixes below):

1. `.tour a.card`'s `transition: transform .2s` overrides `.reveal`'s 700 ms transition, so the three tour cards reveal in 200 ms ease while their neighbours take 700 ms. Measured: `a.card.reveal.in` transform 200 ms.
2. The ring's `--p` transition does nothing (M13).
3. The CSS loops M1, M4 and M6 keep running when the hero is off screen; only the JS word loop stops. M1 runs on every view, including the demo and the docs.
4. M11 and M12 animate `width`, which costs a layout on every frame. Measured: 643 layouts in 10 s on the Record tab, against 31 on the hero.

### 2. What the app has today

All observed in code. Paths are under `apps/ui/src/`.

**Durations are scattered.** Three things set no duration and get Tailwind's default of 150 ms with its default curve: `primitives/Button.tsx:28` (a bare `transition` on every property), `primitives/Switch.tsx:24,26` and `primitives/Disclosure.tsx:37`.

| Where | Duration and easing |
| --- | --- |
| `primitives/ProgressBar.tsx:47` fill | 400 ms ease-in-out |
| `primitives/LevelMeter.tsx:107,115` | 150 ms ease-out |
| `primitives/Toast.tsx:41` exit | 150 ms. The `ease` class there is not a Tailwind utility, so it does nothing |
| `primitives/hintLayer.ts:8` tooltip | 120 ms ease (`tooltip-in`) |
| `primitives/SlideOver.tsx:61` | 200 ms ease-out |
| `layout/AppShell.tsx:227` rail widening | `width` 150 ms |
| `script/page/layout/ScriptColumns.tsx:14` drawers | 200 ms |
| `booth/reading/BoothText.tsx:205` text column | `transform` 300 ms |
| `settings/row/SettingRowView.tsx:193` "Saved" | 2.5 s fade |

There are no `--motion-*` tokens.

**Unguarded motion.** [The motion reference](../design/motion-and-animation.md) says every transition is a `motion-safe:` utility. That is not true. These run under `prefers-reduced-motion: reduce`:

- `SlideOver` (slide);
- the icon rail (`width`);
- the Booth text column, which slides the teleprompter text 300 ms on every scroll step. A browse view sets `transition: none` in `useBrowseView.ts:63,87`, but nothing checks reduced motion;
- `BoothText`'s word and unit colours (`:85`, `:111`);
- `Switch`, `Button`, the tooltip (`hintLayer.ts:8`) and `ResumePrompt.tsx:198`.

The Booth column is the one that matters. It is the most motion-heavy surface, and a narrator reads it for hours.

**No suite can see this.**

- The visual suite injects CSS that zeroes every duration and emulates reduced motion (`tests/visual/helpers/settle.ts:3-19`), and captures with `animations: 'disabled'` (`tests/visual/lib/capture.ts`).
- The atlas runs with `reducedMotion: 'reduce'` (`playwright.atlas.config.ts`).
- Storybook's `preview-head.html` sets `animation: none; transition: none` on everything, so even a person using Storybook never sees motion.

Only unit tests on class names guard the reduced-motion path, and only for some components. Screenshots are deterministic; motion is untested.

**What appears instantly.** Dialogs (`Dialog.tsx:61-62`: "no exit animation exists to wait for"), Popover, Menu, ContextMenu, NavDrawer, the Jump menu and toasts on entry. Only SlideOver and tooltips move in. Five kinds of overlay, three behaviours.

**No in-app setting.** Reduced motion follows Windows only. Nothing in Settings changes it.

**Long-running work already shows real progress.** The Recording check, Editing check, Compare run, Measure, Master to spec, Build, model and update downloads use `ProgressBar`, with an indeterminate slide only at 0 %. Jobs are polled every 250 ms (`hooks/useWorkJob.ts:8`). This matches tier 4 of the [latency baseline](interaction-latency-baseline.md); motion adds nothing here beyond the existing fill.

**Booth already does the motion the mock site's hero advertises.**

- The current word is lit.
- Forward jumps are paced one step every 45 ms (`booth/usePacedCursor.ts`).
- The page scrolls smoothly when the word leaves the 25 to 70 % band (`booth/useFollowCursor.ts`).
- Under reduced motion it jumps instead.

### 3. CPU cost (measured)

Ten-second windows, after a 1.5 s settle, in headless Linux Chromium with software compositing. "CPU" is all Chromium processes as a percentage of one core.

| Scenario | Running animations | CPU | Main-thread tasks | Style recalcs | Layouts | Paints | Frames drawn |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Blank page (baseline) | 0 | 2.2 % | 0.3 % | 0 | 0 | 0 | 0 |
| Mock site, hero in view | 55 | **64.1 %** | 10.6 % | 644 | 31 | 1586 | 601 |
| Mock site, hero, reduced motion | 0 | 2.2 % | 0.3 % | 0 | 0 | 0 | 0 |
| Mock site, Record tab (meter) | 57 | 73.0 % | 14.6 % | 674 | 643 | 1790 | 602 |
| Mock site, demo Proof idle (only M1 runs) | 4 | **19.1 %** | 0.6 % | 121 | 0 | 0 | 601 |
| App, Production idle | 0 | 2.2 % | 0.5 % | 0 | 0 | 0 | 0 |
| App, Proof idle | 0 | 1.7 % | 0.3 % | 0 | 0 | 0 | 0 |
| App, Editing idle | 0 | 1.9 % | 0.4 % | 0 | 0 | 0 | 0 |
| App, Booth idle | 0 | 3.4 % | 0.9 % | 0 | 11 | 20 | 10 |
| App, Story Bible idle | 0 | 2.1 % | 0.3 % | 0 | 0 | 0 | 0 |

What this shows:

- **An infinite loop is never free, even when it is compositor-only.** Four 3 px bars in the header (M1) kept Chromium drawing 60 frames a second and cost about 17 points of CPU over a blank page. Most of that is compositing, not main-thread work (0.6 %). On a GPU the cost is lower (estimated), but the frame rate stays at 60: the compositor and the GPU process wake every 16 ms while REAPER and the audio driver need the CPU.
- **The app is at rest when idle.** Every page sampled is at baseline. Booth's 11 layouts are its 1 s take clock and timer chip. That is the budget to protect: **zero frames when nothing is happening**.
- **Width animations cost layouts.** On the Record tab, layouts went from 31 to 643 in 10 s.
- **One-shot transitions are cheap (estimated).** A 200 ms transition draws about 12 frames once. At a few per minute they do not register next to an idle loop's 600 frames per 10 s.

### 4. Page by page: where motion helps and where it hurts

**Helps** means one of four things:

- **orientation:** where something came from;
- **continuity:** what changed after an action;
- **feedback:** saved, undone, in progress;
- **attention:** something new went wrong.

**Hurts** means motion on something the narrator does hundreds of times an hour, motion that delays what they need, or motion in a field of view they read for hours. Moments are from the [page guides](../guides/using-the-app/README.md) and the components they cite.

| Page | Moment | Helps or hurts | Recommendation |
| --- | --- | --- | --- |
| Rail and nav | Icon rail widens on hover (860 to 1359 px) | Orientation, but it also fires on every pass of the pointer to the left edge | Keep it short (fast token), animate `transform` or `clip-path` rather than `width` if it is reworked, and guard it. No delay on keyboard focus |
| Rail and nav | NavDrawer below 860 px | Orientation: it comes from the left | Slide in with the same token as SlideOver. Today it is instant while SlideOver slides |
| Rail and nav | Proof and Pickups count badges | Continuity, but the badge changes on page change, not on decision (A3, below) | No motion. Fix the update first |
| Rail and nav | Page navigation | Hurts: the narrator moves between Proof, Editing and Pickups all day | Never animate. M9 is not for the app |
| Header | Jump menu (Ctrl+K), History panel, engine slide-over | Orientation | Popover enter on the fast token; History and engine follow SlideOver |
| Getting started | Remove a recent project: the row goes, toast with Undo | Continuity | A one-shot highlight on a restored row after Undo. No collapse animation |
| Production | Confirm readiness moves a chapter's stage; Remove from recording moves the row | Continuity: which cell changed | A one-shot highlight on the changed cell or row. No movement between groups |
| Production | Import WorkDialog, Recording check | Long-running | Already a real bar. Keep it |
| Production | DAW stale line, LoadError | Attention | Appears once with an opacity fade on the base token. No loop |
| Schedule | Every change: toast with Undo; re-read every 60 s | A re-read must not move anything | No motion on re-reads. Toasts as everywhere |
| Script | Floating selection toolbar, mark composer, menus | Orientation, but a frequent action | Fast token, opacity plus 4 px from the anchor. Appears with no delay |
| Script | Rail and chapter drawers (≤ 1280 px, < 1180 px) | Orientation | Already 200 ms and guarded. Move to the base token |
| Script | Jump-target pulse (`Para.tsx:125`, `BookmarkRibbon.tsx:42`) | Orientation: where the jump landed | Keep the idea. Replace Tailwind's `animate-pulse` (a 2 s infinite loop while the flag is on) with one highlight fade. Delete the unused `jump-target-pulse` keyframe |
| Script | ↑↓ scroll, ←→ prep state, Alt+↑↓ chapter | High-frequency | Instant |
| Story Bible | Entry detail slide-over; Edit to Save | Orientation | SlideOver as is, tokenised |
| Story Bible | Scan, Build and model download | Long-running | Real bars. Keep them |
| Story Bible | Accept or reject a suggestion | Continuity | A one-shot highlight on the entry the accept changed |
| Booth | Teleprompter follow, paced cursor, text column | Must not hurt: hours of reading at a fixed gaze | Keep the follow scroll. **Guard the 300 ms column transform** (unguarded today). Make "Reduce" in the in-app setting turn both off |
| Booth | Level meter | Feedback on a real signal | Keep 150 ms smoothing. It is data, not decoration. Prefer `transform: scaleX` over `width` when the primitive is next touched (estimated saving: layout per update) |
| Booth | REC pill, take clock | Feedback | Static pill, 1 s text tick. No blink (M6) |
| Booth | "Take saved" toast with Undo | Feedback | Toast enter, as everywhere |
| Editing | Playhead, `timeupdate`, DAW poll every 250 ms | High-frequency | Instant position updates. Never ease the playhead or word highlight between samples, since that draws them behind the audio |
| Editing | Select word, Shift or drag, held arrows (#1878) | High-frequency | Instant. A held arrow must step at the repeat rate |
| Editing | Takes inline, cleanup drawer (Ctrl+Shift+C) | Orientation | Drawer on the base token. Takes appear instantly (frequent) |
| Editing | Delete, Add FX, Voice sample dialogs | Orientation, low value | A dialog opacity fade on the fast token, or none. Owner choice (Q3) |
| Proof | P/E/W/D decision: saved, next note selected, Undo toast | Feedback, and very high frequency | **No motion on the queue.** The selection moves instantly; the toast is the feedback. A one-shot highlight on the decided row is acceptable only if it does not delay the next key |
| Proof | J/K, ←→, waveform follow and zoom | High-frequency | Instant |
| Proof | "The evidence changed" Before/Now panel; Recording check stale banner | Attention | One opacity fade on the base token |
| Proof | Cleared ring and "N of M cleared" | Continuity | Optional: animate the ring arc on the base token after a decision (a registered `@property`, so the mock site's M13 bug does not repeat). Text updates instantly |
| Pickups | Include or exclude (Space), Mark recorded | High-frequency | Instant |
| Pickups | Remove: the row leaves; Undo for added lines | Continuity | Restored-row highlight after Undo, as on Getting started |
| Master and QC | Check files, Master to spec, export | Long-running | Real bars. Keep them. A one-shot completion mark when a job finishes off-page is a candidate (tier 4) |
| Master and QC | "Why it fails" panel | Orientation | SlideOver behaviour |
| Delivery | Build: busy, bar, Cancel; result list | Long-running, then attention | Keep the bar. "Built" or a failure sentence appears with one fade |
| Delivery | Re-read every 2 s | Must not move | No motion on re-reads |
| Settings | Row "Saved" fade; deep-link highlight | Feedback | Keep. Under reduce, the word stays and does not fade |
| Settings | Skeleton `animate-pulse` | An infinite loop for a tier-1 load | Static placeholder, or nothing |
| All | Toasts | Feedback | Enter on the fast token (opacity plus 4 px up). Exit on the fast token. Under reduce, no movement |
| All | Dialogs, ConfirmDialog, WorkDialog | Orientation, low | Opacity only on the fast token, or instant (Q3). Never scale a dialog the narrator types into |
| All | Menus, context menus, popovers, tooltips | Orientation | One token and one behaviour: opacity plus 4 px from the anchor side, fast token. Exit faster than entry or instant |
| All | Empty, loading, error states | Attention for errors only | Errors fade in once. Empty and loading states are static |

### 5. Ranked: the highest-value places for motion

1. **Make the motion that exists safe and testable.**
   - **What:** guard the Booth column, SlideOver, rail, Button, Switch and tooltip, and add an in-app reduce setting.
   - **Why:** this is the only item that removes harm. A narrator who asked Windows for less motion still gets a 300 ms slide of the text they are reading.
2. **One enter behaviour for every overlay** (popover, menu, context menu, Jump menu, NavDrawer, toast, dialog).
   - **Why:** orientation, at the moments the narrator asked for something to appear.
   - **Cost:** 12 frames once. Today five overlay kinds behave three ways.
3. **A one-shot "this changed" highlight.**
   - **What:** a background-colour fade, about 600 ms, on the row, cell or entry an action or Undo changed: Production stage, restored rows, accepted suggestions, Script jump targets.
   - **Why:** continuity without movement. It replaces the infinite `animate-pulse` loops.
4. **New failures arrive once.**
   - **What:** stale banners, LoadError, "evidence changed", Delivery failure sentences fade in on the base token and then stay still.
   - **Why:** attention without a loop. The mock site's M5 is the model.
5. **A completion signal for long jobs.**
   - **What:** the Settings "Saved" pattern applied to a measure, build or transcription that finishes, while the bar stays real.
   - **Why:** feedback at tier 4.

Decided against animating:

- page navigation;
- data re-reads;
- anything driven by keys, play, seek or select;
- skeletons;
- count-ups;
- decorative loops.

### 6. The mock site: what is still to address

Mock-site rows are from [the comparison](public-site-demo-vs-app-comparison.md). Issue states were read on GitHub on 2026-10-18. The mockup file has not changed since [#1825](https://github.com/countrymanprime/narration-utils/pull/1825) (`git log`), so all 14 of the comparison's [mock site fixes](public-site-demo-vs-app-comparison.md#mock-site-fixes) still apply to it. It sits under `docs/research/mockups/`, which this work does not edit.

| Item | State on 2026-10-18 | Still to address? |
| --- | --- | --- |
| A1 Retry when Proof or Production cannot load | [#1844](https://github.com/countrymanprime/narration-utils/issues/1844) closed by [#1875](https://github.com/countrymanprime/narration-utils/pull/1875) (`ProofPage.tsx:386`, `ProductionPage.tsx:345` use `LoadError`). [#1888](https://github.com/countrymanprime/narration-utils/pull/1888), a follow-up capture fix, is open | Done in the app |
| A2 Retry on a failed action's toast | [#1845](https://github.com/countrymanprime/narration-utils/issues/1845) open | Yes |
| A3 Rail counts move as you decide | No issue found. `layout/useNavCounts.ts:47` still re-reads on `pathname` | Yes. No tracking issue |
| A4 All-states and docs page per primitive in Storybook | No issue found. `.storybook/main.ts` has no `addon-docs` or `autodocs` | Unclear whether the owner wants it |
| A5 "Edit this page" on the docs site | No issue found. `mkdocs.yml` has no `edit_uri`; the site is paused (D75) | Unclear while the site is paused |
| S1 Edit a pronunciation in place | [#1847](https://github.com/countrymanprime/narration-utils/issues/1847) closed as not planned: the owner wants no edits outside Edit or an explicit action | No. The mock site's always-editable field (fix 9) now contradicts a decision, not just the app |
| S2 Labelled "Open Proof" in the Pickups empty state | No issue found. `PickupsTable.tsx:299` is still the icon-only "Go to Proof" | Unclear: needs the Studio mock first |
| S3 Delivery names the failing rule and value | [#1846](https://github.com/countrymanprime/narration-utils/issues/1846) closed on 2026-10-18 | Done in the app. The mock site's waive-to-pass (fix 10) is still wrong |
| S4 A word in pipeline cells | No issue found; not checked in code | Unclear |
| S5 Accepting a failing chapter | Needs an owner decision; no issue found | Unclear |
| Demo host carries Proof decisions | [#1848](https://github.com/countrymanprime/narration-utils/issues/1848) closed by #1880 | Done on the mock host |
| Motion mistakes 1 to 4 in section 1 | New in this note | Yes, if the mockup is kept as a reference: tour-card timing, the ring's dead `--p` transition, loops running off screen and on every view, and width animations |

## Recommendations

### Proposed motion section for the design system

This is a proposal for `docs/design/design-system.md` and `apps/ui/src/styles.css`. It is not edited into either.

> ## Motion
>
> Motion in this app explains a change; it never decorates. A narrator works in it for hours beside a DAW, so the defaults are: nothing moves when nothing changes, nothing moves on a key, play, seek or select, and every motion has a reduced form.
>
> **Tokens** (in `:root`, `apps/ui/src/styles.css`):
>
> | Token | Value | Use |
> | --- | --- | --- |
> | `--motion-fast` | 120ms | Hover and press colour, tooltip, menu and popover enter, toast enter and exit, dialog fade |
> | `--motion-base` | 200ms | Slide-over, drawers, a banner or error arriving, the Proof ring |
> | `--motion-slow` | 300ms | Booth text column and long smooth scrolls only |
> | `--motion-highlight` | 600ms | The one-shot "this changed" background fade |
> | `--ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | Anything that changes in place |
> | `--ease-enter` | `cubic-bezier(.2, .7, .2, 1)` | Things arriving (the mock site's curve) |
> | `--ease-exit` | `cubic-bezier(.4, 0, 1, 1)` | Things leaving; use the fast token or none |
> | `--motion-shift` | 4px | Distance a menu, popover, tooltip or toast travels |
>
> Nothing exceeds 300 ms except the highlight fade, which does not move anything. Exit is never slower than enter.
>
> **Rules.**
>
> 1. Animate only `transform` and `opacity`. A highlight may fade `background-color` once. Never `width`, `height`, `top` or `left` on something that animates more than once a second.
> 2. No infinite animation except a real indeterminate progress bar. No blink, shimmer, pulse loop or decorative loop.
> 3. Never animate in response to a key repeat, play, pause, seek, the playhead, word selection, J/K or a decision key, page navigation, or a data re-read.
> 4. Never delay input: an animating element is interactive from its first frame, and focus moves immediately.
> 5. Motion carries no information on its own. The end state says it all (WCAG 1.3.3, 2.2.2, 2.3.3).
> 6. Every transition uses the `motion-ok:` variant (below). A `motion-reduce` form either has no movement or is an instant state change.
>
> **Reduced motion.** `<html data-motion="reduce">` is set when Windows asks for reduced motion or when Settings → Appearance & keys → Motion is **Reduce**. The Settings choices are Follow Windows (the default) and Reduce. A Tailwind custom variant `motion-ok:` applies only when `prefers-reduced-motion: no-preference` and `data-motion` is not `reduce`. Under reduce, the tokens are `0ms`, the Booth follows by jumping, and highlights show as a static state that clears on the next action.
>
> **Technique.** CSS transitions and keyframes through Tailwind utilities that read the tokens. Overlays use Base UI's `data-starting-style` and `data-ending-style`, as `SlideOver` does. No animation library. The View Transitions API is not used.

### Technique: why CSS and Base UI, not a library or View Transitions

- **CSS transitions plus Base UI's starting and ending style attributes cover every recommended moment.** The app already uses them (`SlideOver.tsx:61`), and Base UI already wires Popover, Menu, Dialog and Drawer to them (observed in `SlideOver`; assumed for the others from the same library, not checked per component). Exit animations need no code beyond the attribute.
- **No library.** `apps/ui` has no animation dependency. A new one costs a three-day `minimumReleaseAge`, Knip, a licence check and a dependency-cruiser fence (`.claude/skills/nx-pnpm-workspace/SKILL.md`; `docs/operations/verification-tooling.md`). The bundle cost of a React animation library (estimated: tens of kB gzipped) buys spring physics and layout animation, which the rules above forbid.
- **No View Transitions API.** The container's Chromium 141 has `document.startViewTransition` (measured). WebView2 is the Evergreen runtime (`docs/operations/ci-and-releases.md`), so it should have it too (estimated). It is not recommended:
  - its main use is page navigation, which should not animate;
  - it snapshots the page, which can hold input for a frame;
  - it would add a third motion technique to test.
- **WAAPI (`element.animate`)** only for a case CSS cannot express. None was found.
- **`@property`** is available (Chromium 85+, measured as `CSS.registerProperty` present). Register any custom property that animates, such as the ring's arc.

### Testing and Storybook

- **Keep screenshots frozen.** `settle.ts` and the atlas already freeze motion. Keep that, and add the `data-motion` attribute to the frozen state so both mechanisms are exercised.
- **Add tests for what screenshots cannot show** (proposal):
  1. A Vitest test in the `legacyCss.test.ts` style. It scans `apps/ui/src` for `transition`, `animate-` and `duration-` utilities with no `motion-ok:` or `motion-reduce:` partner, and for raw millisecond durations instead of a token. That turns today's unguarded list into a failing test.
  2. One Playwright spec with motion **on**, which `settle.ts` does not run. It opens a slide-over, a menu and a toast and asserts:
     - `getAnimations()` is empty within 400 ms;
     - no animation has `iterations: Infinity` on any page at rest;
     - the same with `reducedMotion: 'reduce'` and with `data-motion="reduce"`, where none run at all.
  3. An idle check per page: no running animation and no frames for 2 s at rest. This holds the zero-frames budget measured in section 3.
- **Storybook.** `preview-head.html` turns motion off for everyone, including a person reviewing a primitive. Move the kill rule behind a toolbar toggle, defaulting off for the atlas (which also sets reduced motion), so a reviewer can watch the motion of a primitive.

## Phased plan

Each slice is small, follows the CLAUDE.md workflow, and owes the [motion reference](../design/motion-and-animation.md) and design-system updates.

| # | Slice | Pages | Files likely touched | How to test | Size |
| --- | --- | --- | --- | --- | --- |
| 1 | **Tokens and the reduce mechanism.** Tokens in `:root`, the `motion-ok:` custom variant, `data-motion` from `matchMedia`, the guard test, the motion-on Playwright spec | All | `styles.css`, a small hook in `main.tsx` or `layout/`, `legacyCss.test.ts` or a new sibling test, a `tests/` spec, `docs/design/motion-and-animation.md`, `design-system.md` | Vitest guard test red on today's list; the Playwright motion spec; `pnpm --dir apps/ui atlas` unchanged | M |
| 2 | **Guard and tokenise what exists.** Booth column, SlideOver, rail, Button (`transition` to `transition-colors`), Switch, tooltip, ResumePrompt, Toast's dead `ease`, the dead `jump-target-pulse` | Booth, all overlays | `booth/reading/BoothText.tsx`, `booth/reading/useBrowseView.ts`, `primitives/SlideOver.tsx`, `layout/AppShell.tsx`, `primitives/Button.tsx`, `primitives/Switch.tsx`, `primitives/hintLayer.ts`, `booth/ResumePrompt.tsx`, `styles.css` | Slice 1's guard test goes green; Booth visual states unchanged; a Booth unit test that the column has no transition under reduce | S |
| 3 | **In-app setting** (not started: owner decision Q1). Settings → Appearance & keys → Motion: Follow Windows or Reduce, persisted | Settings | `components/settings/`, the settings schema and its Go side (a persisted setting, so `wire-contract-change` applies), the Settings guide and screenshot | Settings visual states; a unit test that Reduce sets `data-motion`; the guide | M |
| 4 | **One overlay behaviour.** Popover, Menu, ContextMenu, Jump menu, NavDrawer, Toast enter, via starting and ending style. Dialogs stay instant (Q3) | All | `primitives/Popover.tsx`, `Menu.tsx`, `ContextMenu.tsx`, `NavDrawer.tsx`, `Toast.tsx`, `layout/JumpMenu.tsx` | The overlay guard and aria runs (`pnpm --dir apps/ui run aria`), the motion spec (settles within 400 ms), atlas | M |
| 5 | **"This changed" highlight and failure arrival.** One highlight utility; used on Production stage changes, restored rows after Undo, accepted Story Bible suggestions and Script jump targets (replacing `animate-pulse`); errors and stale banners fade in once. Not on Proof decisions (Q5) | Production, Getting started, Pickups, Story Bible, Script, Proof, Delivery | A primitive or utility in `primitives/`, the call sites, `styles.css` | Unit tests on the class; the motion spec (no infinite animations); visual states unchanged under freeze | M |
| 6 | **Optional: Proof ring arc and job completion mark** | Proof, Master and QC, Delivery | The ring component, `@property` in `styles.css`, the completion sites | As slice 5 | S |

Slices 1 and 2 land as one PR (owner decision, 2026-10-18). Slice 3 is not started (Q1).

## Questions for the owner

| # | Question | Recommendation | Default if no answer |
| --- | --- | --- | --- |
| Q1 | Should Settings get its own motion control, or should the app follow Windows only? | A two-choice setting: Follow Windows or Reduce. A narrator may want calm in the app but not across Windows | Follow Windows only (slices 1, 2, 4 and 5 still land) |
| Q2 | Should the Booth text column keep its 300 ms slide on each scroll step? | Keep it under normal motion, as it helps the eye follow the text; turn it off under reduce | Keep, guarded |
| Q3 | Should dialogs fade in, or stay instant? | A 120 ms opacity fade with no scale or movement | Instant |
| Q4 | Should the icon rail keep widening on hover? | Keep it, on the fast token, guarded. Whether to add a hover delay is a separate behaviour question | Keep, guarded |
| Q5 | Should a decision on Proof highlight the decided row? | No. The toast and the selection move are enough at that frequency | No highlight |
| Q6 | Should the mock site be corrected for its motion mistakes and the 14 fixes, or left as a frozen reference? | Leave it frozen and treat this note and the comparison as the record. Fix it only if the public site is un-paused (D75) | Leave it |

## Owner decisions (2026-10-18)

Recorded on [#1456](https://github.com/countrymanprime/narration-utils/issues/1456#issuecomment-6251946598).

| # | Decision |
| --- | --- |
| Q1 | No in-app motion setting for now: the app follows Windows `prefers-reduced-motion` only. The `data-motion="reduce"` mechanism is still built. Slice 3 is not started |
| Q2 | The Booth text column keeps its 300 ms slide, guarded so it does not move under reduce |
| Q3 | Dialogs stay instant |
| Q4 | The icon rail keeps widening on hover, on the fast token, guarded |
| Q5 | A Proof decision does not highlight the decided row |
| Q6 | The mock public site stays frozen |

## Caveats

- **Measurement conditions.** CPU numbers are from headless Chromium on Linux with software compositing, not WebView2 with a GPU. They were not taken while REAPER recorded. Ratios and frame counts carry over; percentages do not. A run on the narrator's Windows machine with REAPER recording is pending; the owner owns it.
- **Fonts.** Google Fonts were blocked, so the frames use fallback fonts. Timings do not depend on fonts.
- **Page-by-page moments** come from the guides and code, not from driving every state of the real desktop host.
- **Base UI's starting and ending style support** was confirmed in `SlideOver` only, and assumed for Popover, Menu, Dialog and NavDrawer.
- **Mock site items** marked "unclear" have no issue and no code evidence either way.
