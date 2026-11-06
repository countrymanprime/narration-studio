# Owner rules file

Loaded from [the index](../SKILL.md). The coordinator and every worker are bound by these.

## Owner standing rules

Decisions the owner made while the train ran (logged on the retired #509). D67, D69 and D70 to D72 are product rules and live in [`.claude/rules/product-rules.md`](../../../rules/product-rules.md), which loads when the code is edited. The rest bind the coordinator and every worker, and the worker template repeats the ones a worker needs.

| Rule | What it says |
| --- | --- |
| **D63** | `WARNING_POLICY: ignore`. A weekly warning counts as GREEN. On 2026-09-27 the owner restated it: ignore the weekly warning until the band is RED |
| **D64** | The coordinator resolves mechanical items itself (branch updates, index rows, status cells, bookkeeping) instead of queueing them for the owner |
| **D65** | Owner-only, hardware and REAPER checks are owner items on the train's owner board and in its Owner queue, marked pending. They never block a merge or a launch |
| **D66** | Check the lane count on every pass, including passes spent mostly on merges or fixers, and launch before babysitting in-flight PRs |
| **D67** | Mock-first behind every port. Now in [product rules](../../../rules/product-rules.md). For the train: a UI phase blocked only by an unbuilt backend phase is ready once that contract is pinned; serial points, nav entries among them, still land one at a time |
| **D68** | A concept mock never blocks. Build against the PRD's recommended concept and pivot later if the owner asks. |
| **D69** | One app-wide theme. Now in [product rules](../../../rules/product-rules.md) |
| **D70** | Development data, results provisional. Now in [product rules](../../../rules/product-rules.md) |
| **D71** | LibriVox as the default speech source. Now in [product rules](../../../rules/product-rules.md) |
| **D72** | Outbound data. Now in [product rules](../../../rules/product-rules.md) |
| **D73** | A PR need not contain `main`'s tip to merge (supersedes that D40 condition, 2026-09-27). The merge is a squash, so GitHub refuses it when the PR no longer merges cleanly; then, and only then, the coordinator merges `main` into the PR (a fixer when the conflict isn't mechanical) and waits for its checks. The green run must still be on the PR's current head |
| **D74** | Windows only, for now (2026-09-27). Linux and macOS support is removed until the app is in a steadier state or someone uses those systems; `Build (Windows)` stays the build gate. Linux CI runners remain as hosts for platform-neutral checks (docs, the Lua harness, the browser-based UI suites), which is not Linux support |
| **D75** | *(Lifted 2026-10-21.)* The Pages hold is gone; see [CI and releases](../../../../docs/operations/ci-and-releases.md#the-pages-workflow) for what builds and deploys. Workers keep the docs link-clean (`Docs / Links (offline)`, `Docs / Markdown lint (changed files)`) |
| **D82** | *(Superseded by D99, 2026-10-18: workers no longer stay subscribed. The coordinator archives a session once its PRs are merged or closed, D78.)* |
| **D99** | Sessions are one-shot (2026-10-18): conversation is what burns credits, so no session lives for several back-and-forths. A worker does its task, pushes, opens the PR (draft or not, as soon as it is pushed), reports in one short message and ends; the coordinator archives it. It does not subscribe to its PR, wait for CI or answer review rounds. CI is the source of truth for testing, so a worker runs only the one or two fastest targeted checks, not the whole set. A red check, a conflict or a review comment gets a **new** one-PR fixer session (Sonnet by default) with `source_url`, the PR number and the failing check, which fixes, pushes, reports and ends. The coordinator is the only long-lived session; it watches PRs and launches fixers. Batch several fixes for one PR into one fixer, and never send follow-up messages into a finished session |
| **D91** | *(Superseded by D97 and D98.)* |
| **D96** | *(Superseded by D98.)* |
| **D97** | The 90% mock-match bar is no longer a gate (2026-09-29). Match % is a diagnostic. No D91 reasons, no region-attribution tables, no Mockup check table. Finish building the pages; the owner does a fix-up pass afterwards |
| **D98** | *(Retired 2026-11-06.)* The rebuild mock was the only spec for the pages it covered. No standing mock replaces it: the coordinator names each job's references ([References for a job](coordinator.md#references-for-a-job)) |
| **Build all** | Standing order (2026-11-03): build everything on the list; do not stop to ask; do not re-ask a question the owner has answered. Every request is an issue and is closed when its PR merges ([GitHub workflow](../../../../docs/operations/github-workflow.md)) |
| **Guide** | UI images live in the how-to guide, not per pull request (2026-10-13). A PR that changes what a page draws or how it is used updates that page's guide text and screenshots in the same PR; no `pr-screenshots/` folder, no image set per PR ([UI PRs update the how-to guide](worker.md#ui-prs-update-the-how-to-guide)) |
