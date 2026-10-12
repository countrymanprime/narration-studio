---
paths:
  - "apps/ui/**"
  - "docs/research/mockups/**"
---

# UI spec and screenshots

## Which mocks are the spec

The Studio Next mock, `docs/research/mockups/studio-next/`, is the only spec (owner ruling D98, 2026-10-11). Build every page it covers to it, and build nothing it lacks. If the repo already has an equivalent of something in the mock, remove the old one in the PR that swaps the page in. Existing features with no equivalent in the mock (series voice bible, companion, stage timer and PFH) stay as built. The benchmark mocks in `docs/research/mockups/audiobook-studio-benchmark/` are no longer a target for any page the Studio Next mock covers. Compare light to light and dark to dark by the mock's theme, and match layout and style, not the mock's sample data. See [Which mocks are the spec](../../docs/operations/agent-train.md#which-mocks-are-the-spec).

## A UI change ships with screenshots of the change

Permanent owner rule (2026-09-29). If a PR changes what `apps/ui` draws and its body has no screenshots of the change, the work has failed and the owner rejects the PR until it has them. The owner has to see that it looks better.

- Add a **Screenshots** section to the PR body with one row per changed state at desktop (1440×900): the Studio Next mock page, before (`main`) and after (the branch), captured in the same state, viewport and fixture. There is no match percentage for Studio Next pages.
- Add the other viewports (small-desktop, tablet, and `reflow` for Settings) as before/after pairs in a collapsed `<details>`.
- Host the images on a branch named `pr-images/<the PR's branch>`, never on the PR's own branch (they must not reach `main`), and embed them as `https://github.com/<owner>/<repo>/blob/pr-images/<branch>/<file>.png?raw=true`. Regenerate them after every push that changes the UI. The coordinator (whoever merges the PR) deletes `pr-images/<branch>` right after the merge, so the screenshots in a merged PR's body stop rendering; the Playwright visual suite and the mock are the lasting record.
- The coordinator does not merge, and no worker calls a UI PR ready, without them. See [UI PRs show their screenshots](../../docs/operations/agent-train.md#ui-prs-show-their-screenshots).
