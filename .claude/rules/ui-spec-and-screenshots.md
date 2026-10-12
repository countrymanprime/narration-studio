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

## A UI change ships with screenshots of the change

Permanent owner rule (2026-09-29): a PR that changes what `apps/ui` draws and has no screenshots of the change has failed, and the owner rejects it until it has them. What to show, the viewports, where the images live and how to capture them are in [UI PRs show their screenshots](../../CONTRIBUTING.md#ui-prs-show-their-screenshots). Before calling a UI PR ready:

1. Add the **Screenshots** section to the PR body: per changed state at 1440×900, the Studio Next mock page, before (`main`) and after (the branch), in the same state, viewport and fixture; the other viewports in a collapsed `<details>`. There is no match percentage.
2. Commit the images on the PR's own branch under `pr-screenshots/<slice or branch>/` and embed them by commit SHA. Create no `pr-images/*` branch.
3. After every push that changes the UI, regenerate them and update the SHA in the body.
4. Make the last commit before merge delete `pr-screenshots/`, so the squash brings no images to `main`.

The coordinator does not merge, and no worker calls a UI PR ready, without them.
