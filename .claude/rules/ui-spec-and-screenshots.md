---
paths:
  - "apps/ui/**"
  - "docs/research/mockups/**"
---

# UI spec and screenshots

## Which mocks are the spec

Build UI towards `docs/research/mockups/audiobook-studio-benchmark/` only. Older mocks are deleted (owner ruling D96, 2026-09-29), so there is nothing else to score against or build towards; a new mock is added only for work being built now and is deleted when that work merges. Compare light to light and dark to dark by the mock's theme, and match layout and style, not the mock's sample data. See [Which mocks are the spec](../../docs/operations/agent-train.md#which-mocks-are-the-spec).

## A UI change ships with screenshots of the change

Permanent owner rule (2026-09-29). If a PR changes what `apps/ui` draws and its body has no screenshots of the change, the work has failed and the owner rejects the PR until it has them. A match percentage is not evidence: the owner has to see that it looks better.

- Add a **Screenshots** section to the PR body with one row per changed state at desktop (1440×900): the benchmark mock, before (`main`) and after (the branch), captured in the same state, viewport and fixture, with the match % for before and after. If the score fell, say so.
- Add the other viewports (small-desktop, tablet, and `reflow` for Settings) as before/after pairs in a collapsed `<details>`.
- Host the images on a branch named `pr-images/<the PR's branch>`, never on the PR's own branch (they must not reach `main`), and embed them as `https://github.com/<owner>/<repo>/blob/pr-images/<branch>/<file>.png?raw=true`. Regenerate them after every push that changes the UI.
- The coordinator does not merge, and no worker calls a UI PR ready, without them. See [UI PRs show their screenshots](../../docs/operations/agent-train.md#ui-prs-show-their-screenshots).
