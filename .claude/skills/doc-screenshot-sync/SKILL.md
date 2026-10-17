---
name: doc-screenshot-sync
description: A change alters what an app page draws or how it is used? Update that page's how-to guide in the same change, its text in docs/guides/using-the-app/<page>.md and its screenshots in docs/images/ui/, with scripts/dev/guide-screenshots.mjs.
---

# doc-screenshot-sync

## Why this exists

`docs/guides/using-the-app/` is the how-to guide: one page per app page, showing how to use it with screenshots of its
states and interactions. The screenshots are the only UI images the repository keeps; a pull request carries no image
set of its own ([UI PRs update the how-to guide](../../../CONTRIBUTING.md#ui-prs-update-the-how-to-guide)). They are copies
of the real app, so they stay true only if the change that moves the page also regenerates them.

## When to use this

Any change to what a page draws or how it is used, after `visual-catalog-sync` if the state catalog changed.

## What to do

1. Find the guide images of the pages you changed: the entries of `apps/ui/tests/visual/doc-screenshots.json` whose
   `page` is the state-catalog page, embedded in `docs/guides/using-the-app/<page>.md`.
2. Regenerate them from the real app:

   ```bash
   node scripts/dev/guide-screenshots.mjs <page>...
   ```

   `<page>` is a guide page (`booth`, `master-and-qc`) or a state-catalog page (`storybible`). It runs the targeted
   real-app run in the light theme, converts each listed state to WebP and replaces the file in place; an image whose
   pixels did not change is left alone. Open every image it updated or added and check it shows what its caption says.
3. Re-read the guide text around each changed image. A correct picture beside stale text is still a stale guide.
4. A new interaction or state: add a manifest entry (`page`, `state`, `viewport`, `docName`, `caption`; the state must
   be in `STATE_CATALOG`), embed `../../images/ui/<docName>.webp` on its guide page with a short how-to step, and run
   step 2.
5. A removed state or interaction: delete its manifest entry, its image and its text. The command lists images the
   manifest no longer names.
6. Run `pnpm --dir apps/ui exec vitest run src/docScreenshots.test.ts src/docsGuide.test.ts`: every entry must be a
   catalogued state and embedded on exactly one page.
7. Link the guide diff from the PR description, or write `No guide change: <specific reason>` there; the
   `Docs / Guide impact` check (`scripts/ci/guide-impact.mjs`) fails a page change with neither.

## The sweep

`node scripts/dev/guide-screenshots.mjs --all` regenerates the whole guide. Run it periodically, and after a change to
a shared component or the theme, to catch an image that moved on a page no change named.

## What this skill is not

It doesn't decide whether the visual suite is accurate (`visual-catalog-sync`), and it doesn't cover
`docs/utilities/*.md` or `docs/workflows/*.md` (`doc-impact-check`).
