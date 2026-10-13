---
paths:
  - "apps/ui/**"
  - "docs/research/mockups/**"
---

# UI spec and screenshots

## Which mocks are the spec

The rule is the rebuild PRD's [Which mocks are the spec](../../docs/prds/studio-next-rebuild.prd.md#which-mocks-are-the-spec) (owner ruling D98, 2026-10-11; [ADR 0760](../../docs/adr/0760-the-studio-next-mock-is-the-only-spec-for-every-page-it-covers-tokens-primitive-sizes-and-layouts-included.md)). Read it before building or changing a page. In short:

- Build every page the Studio Next mock (`docs/research/mockups/studio-next/`) covers to it, and build nothing it lacks.
- In the PR that swaps a page in, remove the repo's old equivalent of anything in the mock.
- Leave the features with no equivalent in the mock as built (the PRD lists them).
- Do not target the benchmark mocks for a page the Studio Next mock covers.
- Compare light to light and dark to dark by the mock's theme, and match layout and style, not the mock's sample data.

## A UI change updates its page's guide

Owner rule (2026-10-13): UI images live in the how-to guide, not in a pull request. The rule, the commands and what the pull request says are in [UI PRs update the how-to guide](../../CONTRIBUTING.md#ui-prs-update-the-how-to-guide). Before calling a UI PR ready:

1. Name the page(s) the change touches and look at every catalogued state of them: `pnpm --dir apps/ui visual:page <page>...` and `pnpm --dir apps/ui atlas:page <page>...` (no `playwright install` in a container; the runs find the installed headless shell).
2. Update the page's guide in the same PR: the text in `docs/guides/using-the-app/<page>.md` and its images, regenerated with `node scripts/dev/guide-screenshots.mjs <page>...`. A new interaction gets a manifest entry in `apps/ui/tests/visual/doc-screenshots.json`, an image and a how-to step.
3. In the PR body, state the real-app (Playwright) and Storybook results and link the guide diff, or write `No guide change: <specific reason>`.

Commit no other images: no `pr-screenshots/` folder, no `pr-images/*` branch, no image links pinned to a commit.
