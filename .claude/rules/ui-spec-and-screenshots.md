---
paths:
  - "src/studio/ui/**"
  - "docs/research/mockups/**"
---

# UI spec and screenshots

## What a page builds to

A page builds to its issue or PRD, its current guide in `docs/guides/using-the-app/`, and any mock or design draft the issue, the PRD or the agent train's coordinator names for that job. Compare light to light and dark to dark, and match layout and style, not a mock's sample data. In the PR that replaces a page, remove the old equivalent of what it replaces.

## A UI change updates its page's guide

Owner rule (2026-10-13): UI images live in the how-to guide. The rule, the commands and what the pull request says are in [UI PRs update the how-to guide](../../CONTRIBUTING.md#ui-prs-update-the-how-to-guide). Before calling a UI PR ready:

1. Name the page(s) the change touches and look at every catalogued state of them: `pnpm --dir src/studio/ui visual:page <page>...` and `pnpm --dir src/studio/ui atlas:page <page>...` (no `playwright install` in a container; the runs find the installed headless shell).
2. Update the page's guide in the same PR: the text in `docs/guides/using-the-app/<page>.md` and its images, regenerated with `node scripts/dev/guide-screenshots.mjs <page>...`. A new interaction gets a manifest entry in `src/studio/ui/tests/visual/doc-screenshots.json`, an image and a how-to step.
3. In the PR body, state the real-app (Playwright) and Storybook results and link the guide diff, or write `No guide change: <specific reason>`.

Commit no other images: no `pr-screenshots/` folder, no `pr-images/*` branch, no image links pinned to a commit.
