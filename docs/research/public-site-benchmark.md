# Public site benchmark: what a best-in-class software site has

**Date:** 2026-10-17. **Status:** first pass; the owner is aligning the app before the next round. **Answers:** what animations, documentation pages, live demo and Storybook a best-in-class product site carries, and what that looks like for this app. **Context:** the public site is paused (owner decision D75, [CI and releases](../operations/ci-and-releases.md#the-public-docs-site)), and its generator is chosen in [The public docs site](../operations/ci-and-releases.md#the-public-docs-site).

The mockup is [`mockups/public-site/index.html`](mockups/public-site/index.html), one self-contained file with no build step. Open it in a browser. It was reviewed as a published artifact and the owner liked it; where it differs from the real pages, the real pages win.

## How reliable this is

The findings come from web searches for design roundups and documentation write-ups, not from visiting each site. Sources agree on the qualitative patterns. Performance figures in the roundups were not verified and are left out. Items marked *not verified* below were not confirmed.

## Findings

### Animation

The sites cited most are Linear, Stripe, Vercel and Raycast ([UXPin](https://www.uxpin.com/studio/blog/good-website-designs-examples/), [Social Animal](https://socialanimal.dev/blog/best-designed-websites-2026-examples/)).

| Pattern | Seen on | Used in the mockup |
| --- | --- | --- |
| The hero animation proves the product's claim: a build log for speed, a live issue board for focus | Vercel, Linear | A read-along that highlights each word as it is heard, then flags a skipped word and drops a take marker |
| Screenshots of the real product instead of illustrations | Linear | Workflow tabs and the demo use the app's own components |
| Hover and press states that respond at once | Raycast | Button press, card spotlight, arrow nudge on links |
| Code and gradients as the visual language | Stripe | Not used; shader gradients are now common and do not fit the app's paper look |

Rules the mockup follows: one orchestrated moment (the hero), transform-only entrances so nothing waits at zero opacity, everything stops under `prefers-reduced-motion`, and the page is complete at rest.

### Documentation

[Stripe's docs](https://nordicapis.com/5-examples-of-excellent-api-documentation/) are the usual benchmark: prose beside code, runnable examples, a path from quickstart to reference. The [Diátaxis](https://ubuntu.com/blog/diataxis-a-new-foundation-for-canonical-documentation) framework splits docs into tutorials, how-to guides, reference and explanation, and warns against mixing them on one page. The mockup's docs apply that split to eight pages, with a table of contents that follows the scroll position, copy buttons, previous and next links, a helpfulness widget, an "Edit this page on GitHub" link and a Ctrl+K search over docs, demo pages and components.

Open question: the repo's guides in `docs/guides/using-the-app/` are organised by page, not by Diátaxis type. Adopting the split would mean a tutorial and explanation layer above them.

### Live demo on a mock back-end

[Mock Service Worker with Storybook](https://storybook.js.org/addons/msw-storybook-addon) is the standard stack for mocked requests in a browser. Its worker file has to be served from the static host's public folder. No public product demo built this way turned up in the search (*not verified*).

The repo already holds the pieces. `src/studio/ui` has a host API port and fixtures, and the old Pages build shipped a browser demo. The mockup does not use MSW. It puts a small mock host in the page (latency, a forced failure, a request log, state kept in the browser) so the real interface behaviours can be seen: loading skeletons, the "host not answering" state with Retry, and pages that read the same data (a pickup decided in Proof shows on Pickups and Production; waiving a note lets the Delivery build pass).

### Storybook

[Adobe Spectrum](https://storybook.js.org/showcase/projects) is a clear public example. GitHub's Primer brand Storybook is private, and no current public Storybook for Shopify Polaris was found. The mockup's Storybook view has controls, an actions log, a docs tab, a code tab, viewport and background switches, an outline toggle, an all-states grid and a contrast check measured in the current theme. In production this view would be the app's real Storybook build, which already exists (`pnpm --dir src/studio/ui run storybook`, the `ui-atlas` CI job, [`docs/ui/atlas/`](../ui/atlas/index.md)).

## What the mockup does not mirror

The mockup uses the app's colour and type tokens, but it is a reimplementation, not the real components. Known gaps, to close when the app's design is aligned:

- Primitive sizes, radii, row heights and the status shapes are approximations of the real primitives, not copies.
- The demo pages are simplified versions of Production, Proof, Pickups, Story Bible, Delivery and Settings. Booth, Editing, Schedule, Script and Master & QC are stubs that link to their guides.
- Docs copy is adapted from the guides and is shorter; the Delivery rule values are the published ACX limits as an example, not a shipped profile.
- The sample book, chapters, notes and measurements are invented.
- Where the owner prefers the mockup's demo behaviour to the real app's, that is a candidate change to the app, not to the mockup.

## Decisions this note does not make

- Whether to un-pause the site, and when (D75).
- Whether the demo is the real `src/studio/ui` build on a mock host or something lighter.
- Whether docs adopt the Diátaxis split.

## Next round

After the app is aligned: compare the mockup page by page against the real pages, fetch the benchmark sites directly instead of through roundups, and decide the demo approach. A tracking issue and an ADR come with the decision, not before.
