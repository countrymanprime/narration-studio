# Owner rules file

Loaded from [the index](../SKILL.md). The coordinator and every worker are bound by these.

## Owner standing rules

Decisions the owner made while the train ran (logged on the retired #509). D69 and D98 are product rules and live in the product docs the rows link. The rest bind the coordinator and every worker, and the worker template repeats the ones a worker needs.

| Rule | What it says |
| --- | --- |
| **D63** | `WARNING_POLICY: ignore`. A weekly warning counts as GREEN. On 2026-09-27 the owner restated it: ignore the weekly warning until the band is RED |
| **D64** | The coordinator resolves mechanical items itself (branch updates, index rows, status cells, bookkeeping) instead of queueing them for the owner |
| **D65** | Owner-only, hardware and REAPER checks are flagged on #992 and marked pending. They never block a merge or a launch |
| **D66** | Check the lane count on every pass, including passes spent mostly on merges or fixers, and launch before babysitting in-flight PRs |
| **D67** | Mock-first behind every port. A feature builds against a mock that passes the schema; going to production is a swap behind the port; the mocks stay for the demo build and the tests. A UI phase blocked only by an unbuilt backend phase is ready once that contract is pinned. Serial points, nav entries among them, still land one at a time |
| **D68** | A concept mock never blocks. Build against the PRD's recommended concept and pivot later if the owner asks. |
| **D69** | One app-wide theme: no page or surface forces light or dark. A product rule, in [the design system](../../../../docs/design/design-system.md#theme) and the rebuild PRD's Which mocks are the spec |
| **D70** | Features still in development use public-domain or synthetic data instead of waiting for the owner's recordings. Results calibrated on it are **provisional**, and a re-run on the owner's own material goes on #992 as a QA item before it ships to users |
| **D71** | **LibriVox** is the default source for real speech audio: public domain, many readers, and solo readings where one reader voices several characters. Record the source URL, reader, book and the public-domain statement; keep the audio out of git as ignored local data. Synthetic audio is the fallback |
| **D72** | The privacy line is outbound user data, not inbound reference data. The app may call external APIs to **fetch** dictionary or pronunciation data (local first, online optional), but never sends the narrator's or authors' data out. An online lookup sends a single word, never passages, file names or project identifiers; it is narrator-initiated, or opt-in with a notice for a batch; results are cached locally; there is no telemetry and no project-run proxy. A service that needs a key uses the narrator's own key, stored locally and never logged |
| **D73** | A PR need not contain `main`'s tip to merge (supersedes that D40 condition, 2026-09-27). The merge is a squash, so GitHub refuses it when the PR no longer merges cleanly; then, and only then, the coordinator merges `main` into the PR (a fixer when the conflict isn't mechanical) and waits for its checks. The green run must still be on the PR's current head |
| **D74** | Windows only, for now (2026-09-27). Linux and macOS support is removed until the app is in a steadier state or someone uses those systems; `Build (Windows)` stays the build gate. Linux CI runners remain as hosts for platform-neutral checks (docs, the Lua harness, the browser-based UI suites), which is not Linux support |
| **D75** | *(Lifted 2026-10-21.)* The Pages hold is gone; see [CI and releases](../../../../docs/operations/ci-and-releases.md#the-pages-workflow) for what builds and deploys. Workers keep the docs link-clean (`Docs / Links (offline)`, `Docs / Markdown lint (changed files)`) |
| **D82** | *(Superseded by D99, 2026-10-18: workers no longer stay subscribed. The coordinator archives a session once its PRs are merged or closed, D78.)* |
| **D99** | Sessions are one-shot (2026-10-18): conversation is what burns credits, so no session lives for several back-and-forths. A worker does its task, pushes, opens the PR (draft or not, as soon as it is pushed), reports in one short message and ends; the coordinator archives it. It does not subscribe to its PR, wait for CI or answer review rounds. CI is the source of truth for testing, so a worker runs only the one or two fastest targeted checks, not the whole set. A red check, a conflict or a review comment gets a **new** one-PR fixer session (Sonnet by default) with `source_url`, the PR number and the failing check, which fixes, pushes, reports and ends. The coordinator is the only long-lived session; it watches PRs and launches fixers. Batch several fixes for one PR into one fixer, and never send follow-up messages into a finished session |
| **D91** | *(Superseded by D97 and D98.)* |
| **D96** | *(Superseded by D98.)* |
| **D97** | The 90% mock-match bar is no longer a gate (2026-09-29). Match % is a diagnostic. No D91 reasons, no region-attribution tables, no Mockup check table. Finish building the pages; the owner does a fix-up pass afterwards |
| **D98** | The Studio Next mock is the only spec for every page it covers (2026-10-11). A product rule, now in the rebuild PRD's Which mocks are the spec and [the design system](../../../../docs/design/design-system.md#which-mocks-are-the-spec) |
| **Build all** | Standing order (2026-11-03): build everything on the list; do not stop to ask; do not re-ask a question the owner has answered. Every request is an issue and is closed when its PR merges ([GitHub workflow](../../../../docs/operations/github-workflow.md)) |
| **Guide** | UI images live in the how-to guide, not per pull request (2026-10-13). A PR that changes what a page draws or how it is used updates that page's guide text and screenshots in the same PR; no `pr-screenshots/` folder, no image set per PR ([UI PRs update the how-to guide](worker.md#ui-prs-update-the-how-to-guide)) |
