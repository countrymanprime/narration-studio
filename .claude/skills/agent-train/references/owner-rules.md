# Owner rules file

Loaded from [the index](../SKILL.md). The coordinator and every worker are bound by these.

## Owner standing rules

Decisions the owner made while the train ran (logged on issue #509 of the 2026-09-24 train). D67, D69 and D70 to D72 are product rules and live in [`.claude/rules/product-rules.md`](../../../rules/product-rules.md), which loads when the code is edited. The rest bind the coordinator and every worker, and the worker template repeats the ones a worker needs.

| Rule | What it says |
| --- | --- |
| **D63** | `WARNING_POLICY: ignore`. A weekly warning counts as GREEN. On 2026-09-27 the owner restated it: ignore the weekly warning until the band is RED |
| **D64** | The coordinator resolves mechanical items itself: branch updates, index rows, status cells, bookkeeping |
| **D65** | Owner-only, hardware and REAPER checks are owner items on the train's owner board and in its Owner queue, marked pending. They never block a merge or a launch |
| **D66** | Check the lane count on every pass, including passes spent mostly on merges or fixers, and launch before babysitting in-flight PRs |
| **D67** | Mock-first behind every port. Now in [product rules](../../../rules/product-rules.md). For the train: a UI phase blocked only by an unbuilt backend phase is ready once that contract is pinned; serial points, nav entries among them, still land one at a time |
| **D68** | A concept mock never blocks. Build against the PRD's recommended concept and pivot later if the owner asks. |
| **D69** | One app-wide theme. Now in [product rules](../../../rules/product-rules.md) |
| **D70** | Development data, results provisional. Now in [product rules](../../../rules/product-rules.md) |
| **D71** | LibriVox as the default speech source. Now in [product rules](../../../rules/product-rules.md) |
| **D72** | Outbound data. Now in [product rules](../../../rules/product-rules.md) |
| **D73** | A PR need not contain `main`'s tip to merge (2026-09-27). The merge is a squash, so GitHub refuses it when the PR conflicts with `main`; then, and only then, the coordinator merges `main` into the PR (a fixer when the conflict isn't mechanical) and waits for its checks. The green run must still be on the PR's current head |
| **D74** | Windows is the supported platform (2026-09-27), and `Build (Windows)` is the build gate. Linux CI runners host the platform-neutral checks: docs, the Lua harness, the browser-based UI suites |
| **D75** | The public site builds from `src/web` (landing page, guides, demo, Storybook) on a push to `main` and on a pull request that touches it, and deploys from `main` ([CI and releases](../../../../docs/operations/ci-and-releases.md#the-pages-workflow)). Workers keep the docs link-clean (`Docs / Links (offline)`, `Docs / Markdown lint (changed files)`) |
| **D99** | Sessions are one-shot (2026-10-18): conversation is what burns credits, so no session lives for several back-and-forths. A worker does its task, pushes, opens the PR (draft or not, as soon as it is pushed), reports in one short message and ends; the coordinator archives it. It does not subscribe to its PR, wait for CI or answer review rounds. CI is the source of truth for testing, so a worker runs only the one or two fastest targeted checks, not the whole set. A red check, a conflict or a review comment gets a **new** one-PR fixer session (Sonnet by default) with `source_url`, the PR number and the failing check, which fixes, pushes, reports and ends. The coordinator is the only long-lived session; it watches PRs and launches fixers. Batch several fixes for one PR into one fixer, and never send follow-up messages into a finished session |
| **D97** | Match % is a diagnostic (2026-09-29). It scores features and styles, not pixel-exact text or sample data (the tool paints glyphs out of both images first). The work is to finish building the pages; the owner does a fix-up pass afterwards. Screenshots live in the how-to guide, by the rule below |
| **D98** | Each job builds to the references its prompt names, chosen by the coordinator (2026-11-06; [References for a job](coordinator.md#references-for-a-job)) |
| **Guide** | UI images live in the how-to guide (2026-10-13). A PR that changes what a page draws or how it is used updates that page's guide text and screenshots in the same PR and commits no other images ([UI PRs update the how-to guide](worker.md#ui-prs-update-the-how-to-guide)) |
