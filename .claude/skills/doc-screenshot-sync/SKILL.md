---
name: doc-screenshot-sync
description: After the Playwright visual suite output changes, refresh docs/images/ui/ and docs/guides/using-the-app/*.md so the user-facing screenshot guide doesn't silently go stale.
---

# doc-screenshot-sync

## Why this exists

`docs/guides/using-the-app/*.md` embeds screenshots of the real UI so users don't have to imagine
what a page looks like. Those screenshots are copies, not live references — `apps/ui/screenshots/`
is gitignored scratch output (see `.claude/rules/ui-visual-verification.md`), so committed doc images in `docs/images/ui/` only
stay accurate if something re-copies them after the UI changes. Without this skill, the natural
failure mode is: the UI changes, `pnpm check` still passes, and the docs keep showing last month's
screenshot with nobody noticing until a user asks why it doesn't match.

## When to use this

After `apps/ui` changed and the Playwright visual suite has been (re)run — ideally right after
`visual-catalog-sync` if that skill also ran, so the suite itself reflects current reality first.

## In an agent-train worker stream

A worker never regenerates `docs/images/ui/` ([worker template](../../../docs/operations/agent-train.md#worker-template)); the final sweep regenerates the screenshots once. Do steps 1, 3, 4 and 5 for the manifest and the guide's prose, skip the sync script in step 2, and list in the PR body the manifest entries whose screenshots changed so the sweep refreshes them.

## What to do

1. Check whether the change affected any `{page, state}` listed in
   `apps/ui/tests/visual/doc-screenshots.json` (the curated manifest backing the guide). If
   nothing in that list was touched, there's nothing to sync — say so and stop.
2. If an entry's source screenshot changed, regenerate it and run the sync script:

   ```bash
   cd apps/ui
   npx playwright test tests/visual -g "<page> / <state>"
   node scripts/sync-doc-screenshots.mjs
   ```

   The script compresses each screenshot to WebP into `docs/images/ui/` and reports the size
   before/after — a large jump in output size for an unrelated entry is worth a second look
   before committing.
3. Re-read the surrounding prose in the `docs/guides/using-the-app/*.md` page that embeds it for each updated image. If the UI
   change altered what the screenshot shows in a way the caption or body text no longer describes
   accurately, update the text too — a correct picture next to stale prose is still stale
   documentation.
4. If the UI change removed a page/state that's in `doc-screenshots.json`, remove that manifest
   entry, delete its `docs/images/ui/<docName>.webp`, and remove or replace its section in the
   guide — don't leave a broken image reference or a description of a feature that no longer
   exists.
5. If the UI change is significant enough to warrant showing a *new* state that isn't
   documented, add an entry to `doc-screenshots.json` (validated automatically by
   `src/docScreenshots.test.ts` against `STATE_CATALOG` — it must already exist there, so run
   `visual-catalog-sync` first if it doesn't), then follow step 2 and add a section to the guide.
6. Run `pnpm --dir apps/ui test` to confirm `docScreenshots.test.ts` still passes — it fails
   loudly if a manifest entry points at a `STATE_CATALOG` row or viewport that no longer exists.

## What this skill is not

It doesn't decide whether the visual suite itself is accurate — that's `visual-catalog-sync`,
which should run first when a change is visual enough to need it. It also doesn't replace
`feature-cleanup`'s general docs-staleness check for `docs/utilities/*.md` and
`docs/workflows/*.md` — this one is specifically about the screenshot guide and its images.
