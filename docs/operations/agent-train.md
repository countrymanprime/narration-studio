# The agent train

How parallel Claude Code sessions build the planned work around the clock: one **coordinator** and up to eight **workers**. The coordinator starts workers, scales their number to the usage left, merges green pull requests and fixes mechanical conflicts. Each worker delivers one stream of one to three PRD phases, one pull request per phase. This file is the coordinator's procedure. Its Routine prompt only says "read `docs/operations/agent-train.md` on `main` and run one pass", so changing the procedure is a normal pull request.

It replaces the scheduling rules of the lane train of 2026-09-24:

- **Kept:** D40 (the coordinator merges), D43 (the light merge gate), D44 (the visual suite and atlas run in full once, at the end) and D46 (built UI is compared with its mock, amended by D97); all are in [Owner standing rules](#owner-standing-rules).
- **Replaced:** D41 (three lanes) and D45 (hold on credits), by [Lanes](#lanes) and [Usage and autoscaling](#usage-and-autoscaling) below.

The work it schedules comes from the PRDs in `docs/prds/`: the Studio Next series, delivered as [slices](#studio-next-slices). The Studio Next mock is the only spec for the pages it covers ([Which mocks are the spec](#which-mocks-are-the-spec)).

## Where state lives

| What | Where |
| --- | --- |
| The procedure (this file) | `docs/operations/agent-train.md` on `main` |
| What to build | The PRDs in `docs/prds/`: phase tables, `Depends`, and the Parallel-session compatibility tables |
| Live state: switches, target concurrency, lanes and their sessions, the log | Issue [#989, Train control](https://github.com/countrymanprime/narration-utils/issues/989). The coordinator rewrites its body |
| Steps only the owner can take | Issue [#992, Owner queue](https://github.com/countrymanprime/narration-utils/issues/992) |
| Owner decisions and their defaults | Issue [#993, Studio Next decisions](https://github.com/countrymanprime/narration-utils/issues/993), one comment per decision |
| Slice counts per PRD, the oldest ready slice, the critical path | The "Studio Next status" issue, which the coordinator rewrites |
| Pipeline repairs after merges that did not wait for CI | Issue [#1119](https://github.com/countrymanprime/narration-utils/issues/1119) |
| A paused stream's progress | Its draft PR's `## Resume notes` block |

State never lives in a file on `main`, so recording state can't cause merge conflicts.

Issues #509 (Train control) and #510 (Owner queue) of the 2026-09-24 train, and #52, are retired: #989 and #992 replace them, and nothing in them is an instruction. The two checks in the [Safety net](#safety-net) that name them still read #509 and #510 until the owner moves them to #989 and #992.

## Switches on #989

Only the owner or the coordinator edits these. The last three rows are the Studio Next switches. #989's body names the daily cap `DAILY_CAP`; that row is the switch, and `SN_DAILY_CAP` here is the same switch.

| Switch | Default | Meaning |
| --- | --- | --- |
| `HOLD` | off | The owner's stop. Nothing launches; merges and fixes continue |
| `HOLD-UNTIL-RESET` | off | Set by the coordinator on RED. Cleared by the first tick where usage is not RED |
| `DRAIN` | off | Set by the coordinator on AMBER-7D or RED. Running workers pause at their next checkpoint (see [the worker protocol](#the-worker-protocol)). Lane K is exempt unless the band is RED |
| `MAX_WORKERS` | 8 | Hard ceiling on concurrent workers, the coordinator not counted |
| `MAX_OPUS_WORKERS` | 2 | Of those, how many may run Opus |
| `WARNING_POLICY` | `throttle` | What a weekly warning does: `throttle`, `hold` or `ignore`. The owner's cloud credit is used up (2026-09-26), so warnings count |
| `ALLOW_OVERAGE` | off | While off, a session that reports `isUsingOverage: true` is treated as RED |
| `TARGET` | 4 | Target concurrent workers, adjusted by the coordinator (below) |
| `WEEK_START_TARGET` | 4 | The `TARGET` the first tick after the weekly reset starts from |
| `WEEKLY_RESET` | from `resetsAt` | The next weekly reset. The coordinator fills it from the first `seven_day` `resetsAt` it sees; until then, 22:00 America/New_York (D45) |
| `SN_HOLD` | off | Stops launching Studio Next slices only (D-5). Merges, fixes and other work continue |
| `SN_DAILY_CAP` | 12 | Slices launched per UTC day (D-4). A resume or a fixer for a launched slice doesn't count. At the cap, nothing new launches until the next UTC day |
| Session cap per slice | 1 + 1 resume + 1 fixer | D-6. A `spike` slice, or an `adr` slice already open, gets 1 session. A slice that uses its cap is relabelled `blocked` and re-groomed; it was too big |

## Usage and autoscaling

**Read usage.** `get_session` with no `session_id`, then read `external_metadata.rate_limit_info`: `{rateLimitType, status, resetsAt, isUsingOverage}`. This is account-wide, so the coordinator's own reading covers every worker. Map it to a band:

| Band | When | Launching | Running workers |
| --- | --- | --- | --- |
| **GREEN** | `status: allowed` | Up to `TARGET` | Continue |
| **AMBER-5H** | `allowed_warning` and `rateLimitType: five_hour` | None until `resetsAt` (the five-hour window), then GREEN again | Continue. They check at their next checkpoint |
| **AMBER-7D** | `allowed_warning` and `rateLimitType: seven_day`, with `WARNING_POLICY: throttle` | Only lane K and resumes of paused lane-K streams, at most 1, on Sonnet unless the phase is a contract | Tick `DRAIN`. The others finish their current PR and end |
| **RED** | `status: rejected`; or a worker ended on a usage limit; or `isUsingOverage` with `ALLOW_OVERAGE` off; or `WARNING_POLICY: hold` and any warning | None. Tick `HOLD-UNTIL-RESET` and `DRAIN` | Pause at their next checkpoint |

With `WARNING_POLICY: ignore`, warnings count as GREEN.

**Adjust `TARGET`.** Each tick, apply the first rule that fits, then log the change in one line:

1. **First tick after the weekly reset:**
   - set `TARGET` = `WEEK_START_TARGET`;
   - clear `DRAIN` and `HOLD-UNTIL-RESET` if the band is GREEN;
   - update `WEEKLY_RESET`.
2. **The first AMBER-7D of the week:**
   - Let `f` be the fraction of the week elapsed at that moment.
   - If `f < 0.85`, the train ran too fast: set `WEEK_START_TARGET = max(1, round(TARGET × f))`.
   - If `f ≥ 0.85`, the pace was right or too slow: set `WEEK_START_TARGET = min(MAX_WORKERS, WEEK_START_TARGET + 1)`.
   - Then set `TARGET = 1`.
3. **AMBER-5H:** `TARGET = max(2, TARGET − 1)`.
4. **GREEN with no warning in the last 4 hours, and ready work that filled every slot at the last tick:** `TARGET = min(MAX_WORKERS, TARGET + 1)`.

**The rationale:**
- The owner allows the whole weekly allowance to be used.
- The aim is to reach the weekly warning late in the week (`f` near 0.85–1.0), not to stall on day four.
- A five-hour warning means bursts were too tight.
- `TARGET` grows slowly while there's headroom and drops fast when a warning comes.

**Choosing which streams to run.** When fewer slots exist than ready streams, or when scaling down, keep them in this order:

1. lane K (the contracts every other stream waits on);
2. resumes of paused streams;
3. the stream whose PRD phases unblock the most other phases;
4. leaf features;
5. documentation;
6. filler: any pending phase of a PRD in `docs/prds/` that collides with nothing running.

## Safety net

Nobody watches the train live, so these checks run without a person and none of them relies on a worker's own report. Each one closes a failure the train has had or the [research behind it](../adr/0758-the-agent-train-is-watched-from-outside-and-gated-by-checks-a-worker-cannot-edit.md) found: a stopped coordinator that nobody noticed for eleven days, regressions that sit on `main` between full sweeps, a worker weakening its own tests, and a stream relaunched forever.

| Check | Where | What it does |
| --- | --- | --- |
| **Train health** | `.github/workflows/train-health.yml`, `scripts/ci/train-health.mjs` | Hourly. Warns on #510 once per stall when #509's `Last pass:` line is more than two hours old and `HOLD` is not ticked |
| **Main health** | `.github/workflows/main-health.yml` | Nightly. Runs the whole of `ci.yml` on `main` (quality, every visual shard, UI bundle, Windows build). On a red run, ticks `HOLD` on #509 and says why. The owner or the coordinator clears it once `main` is green |
| **Test ratchet** | `.github/workflows/test-ratchet.yml`, `scripts/ci/test-ratchet.mjs` | Fails a PR that deletes a test file, adds a skip or focus marker to one, or lowers a coverage floor in `scripts/ci/coverage-floors.json`. The owner clears a deliberate change with the `ratchet-approved` label. Runs the base branch's copy of the script |
| **PR risk** | `.github/workflows/pr-risk.yml`, `scripts/ci/pr-risk.mjs` | Labels a PR `risk:high` when it touches a trust boundary or a file that decides what runs unattended: the workflows, agent config, the threat model, the REAPER bridge, the update and sidecar launch, the release scripts, the pinned toolchain and lockfiles, and these checks. Runs the base branch's copy of the script |
| **Intent review** | the coordinator, below | A fresh session, not the worker, traces each merge-ready PR back to its issue or PRD phase |
| **Launch limit** | the coordinator, below | Stops a stream that keeps being relaunched without delivering |

**Intent review.** Before merging a PR that passes the other conditions in step 4, start one reviewer session for it: `create_session` on Sonnet with `tags: ["agent-train", "intent-review"]`, `title` `"review #<n>"` and a prompt that names the PR, its head SHA and its tracking issue or PRD phase, and says to run the `intent-reviewer` agent in a fresh context, not to edit anything, and to comment on the PR either `Intent review: pass at <sha>` or a list of findings, each starting with 🔴. Pass the agent the branch and the issue, not the worker's account of what it built. The review counts toward `TARGET` while it runs. Merge only on a `pass` for the PR's current head; a push after the pass needs a new review.

**A `risk:high` PR.** Do not merge it. Comment on #992 with the PR number, its head SHA and the reasons the label's workflow printed, then carry on with other PRs. The owner approves by approving the PR on its current head or by replying `approved #<n> <sha>` on #992. A push after that approval needs a new one.

**A failed ratchet.** Do not merge it and do not add the label yourself. Comment on #992 with the violations the check printed. Only the owner adds `ratchet-approved`.

**The launch limit.** The Launches table in #989's body has one row per stream: ID, PRD phases, launches, last launch, PRs merged. A stream's count goes up on every `create_session` for it, resumes and fixers included. At three launches with no PR of the stream merged, mark the stream **blocked**: do not launch it again, comment on #992 with its Resume notes and the last failure, and take the next stream in priority order. The owner unblocks it by resetting its count on #989. A stream that merges a PR resets its own count to zero.

**Permissions.** `.claude/settings.json` denies `git push origin main` and `git push origin HEAD:main`, so a worker cannot push to `main` even where a ruleset would let its token. Merging goes through the coordinator's `merge_pull_request`, never `git`.

## Lanes

A lane is a territory of files. Two workers may share a lane only when their slice issues' `owns` (or, for an older PRD, its Parallel-session table) show they touch disjoint files. D48 on the retired #509 records the check: verify file by file before pairing.

| Lane | Owns | Model |
| --- | --- | --- |
| **K: contracts** | `apps/desktop/internal/port/**`, `internal/dawport/**`, the provider-port packages, `libs/python/narration_common/ports/**`, contract bindings and their schemas, goldens and mocks, `hostAPIVersion` bumps for contract bindings | Opus |
| **A: host features** | root `apps/desktop/*.go` feature bindings, `internal/<feature>` packages outside the ports | Sonnet (Opus for tricky concurrency) |
| **B: adapters and sidecars** | `integrations/reaper/**`, `internal/bridge`, `internal/daw*`, `internal/dawport/reaper`, `internal/dawport/audacity`, the consumer migrations, `sidecars/**`, the rest of `libs/python/**` | Sonnet (Opus for new Lua commands) |
| **U: primitives and input** | `apps/ui/src/components/primitives/**`, `apps/ui/src/input/**`, `apps/ui/src/studio/**`, `apps/ui/src/ports/**`, `apps/ui/src/overlay/**`, `apps/ui/src/registries/**` (D-7), design tokens (in one PR, running alone) | Sonnet |
| **C: UI features** | `apps/ui/src/components/<feature>/**`, `hooks/**`, `tests/visual/**` rows of its pages, `docs/guides/using-the-app/**` | Sonnet |
| **D: documents** | PRDs, steady-state docs, ADR bookkeeping, PRD close-outs | Sonnet for PRDs, Haiku for bookkeeping |
| **X: exclusive** | Refactors of shared files (see [Serial points](#serial-points)) | Opus |

A lane-X stream runs with no other stream that touches the same files. Lanes have no ADR blocks: an ADR takes the next free number (see [Serial points](#serial-points)).

## Serial points

- **`hostAPIVersion`:**
  - It lives in `apps/desktop/app.go`, `app_test.go` and `apps/ui/src/hostApi.ts`, and the bindings `Host.*` are regenerated from it.
  - A PR that adds a binding takes `main`'s value + 1.
  - On a collision, whoever merges `main` in second takes the higher value + 1 and regenerates. Use the bump script once lane X has added it.
- **ADR numbers:** the next free number in `docs/adr/`. Check it again at merge time, not only at write time; D52 on the retired #509 records an earlier collision.
- **The ADR index and PRD index rows:** add-only. The coordinator resolves conflicts in them mechanically.
- **Append-only rows:** `config/defaults.json`, `internal/settings/store.go` field rows, `Settings.tsx` rows, `internal/bridge/wire.go` event rows.
- **One at a time, train-wide:**
  - the `AppShell.tsx` navigation or header;
  - `.github/workflows/**`;
  - the design token batch (`src/styles.css` token blocks and `paletteContrast.test.ts` `PAIRS`);
  - any lane-X refactor.
- **Hot UI files,** until lane X splits them: `api/mockApi.ts`, `wailsClient.ts`, `wireContracts.test.ts`, `tests/visual/state-catalog.ts`, `tests/visual/app.drivers.ts`, `interactionFeedback.catalog.ts`, `App.tsx`. Two streams may both touch one only when each adds rows in a separate place, and the coordinator merges `main` into the second before it merges.

## Studio Next slices

The [Studio Next series](../prds/studio-next-rebuild.prd.md) is delivered as slices, one PR by one worker each. This section is the operating rule. [Agent Delivery](../prds/studio-next-agent-delivery.prd.md#deviations-from-the-agent-train) holds the deviations D-1 to D-11 and the reasons, and [the slice issue](../prds/studio-next-agent-delivery.prd.md#the-slice-issue) holds the header's fields.

- **One issue per slice (D-1).** It is a sub-issue of its PRD's issue, titled `SN-<code><n> <verb phrase>`. The PR body says `Closes #<slice>`.
- **The header.** A fenced `slice-meta` block with `id`, `lane`, `kind`, `depends`, `owns` and `serial`, checked by `scripts/dev/slice-lint.mjs`. The issue form is `.github/ISSUE_TEMPLATE/slice.yml`. The coordinator reads the header and the labels, never the code.
- **Labels:** `slice`, `lane:<L>`, `prd:<code>`, and one of `ready`, `blocked` or `owner-decision`.
- **Ready.** A slice is ready when every issue in its `depends` is closed and no other slice in progress has an overlapping `owns`. A slice waiting on an unanswered `owner-decision` is not ready.
- **Slice kinds.** The groomer cuts no new `adr` slices: an ADR is written by the slice that settles the decision, numbered per [Serial points](#serial-points). An `adr` slice already open runs as groomed.
- **A spike slice** writes a research note in `docs/research/` only when its findings outlast the slice. The note carries a date, the question, the method and the findings, and no slice, stream or lane header; the slice issue links the note, not the other way round. Findings that only the slice needs go in the slice issue.
- **An audit or checklist for one PR** is a comment on that PR or its issue, not a file.
- **A swap slice** replaces its page and deletes the old page and what only it used, in the same PR with no flag (D98). Its `owns` lists the files it deletes.
- **Handoff.** Every slice issue has a `## Handoff` comment that the worker rewrites at each checkpoint: done, next step, failing check, files touched, decisions assumed. A resume session starts from it and the branch.
- **The groomer (D-2).** A session type for cutting slices, like the mockup-drafting session. It opens issues from a PRD's slice table (a PRD without one, under the [PRD template](../prds/README.md#prd-template), is cut from its phases, and its slices exist only as issues), fills each header from the code (it may read the code; the coordinator doesn't), runs `slice-lint`, marks `ready` the slices whose dependencies are merged, and ends. The coordinator launches one when fewer than 2 x `TARGET` ready slices exist and a PRD has slice rows, or phases, with no issue.
- **A stalled worker (D-3).** A session in `working` with no push, no issue comment and no PR event for 3 hours is stalled. `interrupt_session`, then start one resume session from the Handoff comment.
- **A session stuck on a permission prompt** follows the fallback on #989, unchanged: relaunch up to two more times, then the coordinator runs the slice itself with a background agent under the same session cap.
- **An idle worker** can't be messaged. Idle with no PR gets its one resume session from the pushed branch. Idle with a conflicted or red PR gets a fixer straight away.
- **Merges that don't wait for CI.** On 2026-10-11 the owner directed the coordinator to merge train PRs without waiting for CI and to reconcile `main` in batches of four or five merges. A reconciliation session reproduces the red checks locally, fixes them in one PR, and logs on #1119 what it fixed and what it could not run; the next `main-health` run is the check for those. This is the owner's direction on #1119, not one of the merge conditions in step 4 of [the pass](#the-coordinators-pass).
- **The decisions register (D-8).** #993 holds one comment per decision. A later question is a comment with the options, the recommendation and the default date; the owner answers `decided: A` or with text. After seven days an unanswered question takes its recommendation, and the coordinator comments the default and unblocks the slices that waited. The rule never applies to a question that would change an accepted ADR or to A1..A17 of the overview. Those stay Proposed until the owner accepts them. Workers read the register at every checkpoint.
- **The status issue (D-9).** "Studio Next status", which the coordinator rewrites when something changed: per PRD the counts of slices ready, in progress, blocked and merged, the oldest ready slice, and the critical path.

## Mockup gates

Some PRDs gate a phase on **owner-approved mockups** in prose (its Phase Details or its Visual Spec section), not just in the `Depends` column. That gate never shows up in the phase table, so before adding a phase to the ready list, check its Phase Details paragraph and the PRD's Visual Spec section, not only `Depends`.

Since D68 and D69 (see [Owner standing rules](#owner-standing-rules)), an existing concept mock no longer gates a phase: build against it. The rules below still apply when a phase has **no** mockup at all.

When a phase is otherwise ready (`Depends` complete, no file collision) but blocked solely on mockups that don't exist yet or haven't been approved (D61, owner-directed):

- **Don't launch it as a normal worker,** and don't guess at a design to route around the gate.
- **Launch a mockup-drafting session instead**, as its own lane entry, not a phase worker: `create_session` with `tags: ["agent-train", "mockup-design"]`, a model picked like any other lane (Opus for a screen with real interaction states — a recorder, conflict or error messaging, anything with more than static layout; Sonnet for a mostly-static screen), and a prompt that:
  - names the exact states the PRD's Phase Details and Visual Spec section describe;
  - points it at `docs/design/design-system.md` and the real tokens/primitives, never a generic style;
  - points it at the Studio Next mock in `docs/research/mockups/studio-next/` for tone and format precedent ([D98](#which-mocks-are-the-spec));
  - says explicitly: **drafts only**, no product code for the gated phase, and the PRD's Visual Spec section is updated to list the new files as drafts pending the owner's approval — the session never marks its own work owner-approved;
  - tells it to open its own tracking issue and a normal PR, same as any worker, and never merge itself.
- **Record it on #989** as its own lane entry. It counts toward `TARGET` like any running session, but is tracked separately from the phase queue until the owner approves it.
- **Subscribe to its PR** (`subscribe_pr_activity`). The owner may leave review comments to iterate on the design directly with that session (or a follow-up fixer) before approving — treat that like any other reviewer round: implement the requested visual changes and push, rather than closing the PR out after one draft.
- The gated phase itself joins the normal ready list only once the owner approves the mockups (a comment or review saying so, or the PRD's Visual Spec section no longer reads "pending"). Approval is the owner's call, never the coordinator's.

## Which mocks are the spec

Owner ruling D98, 2026-10-11 (it replaces D96, 2026-09-29).

- **The spec is the Studio Next mock: `docs/research/mockups/studio-next/`.** Layout, tokens, primitive sizes and behaviour of every page it covers are built to it. Where an older ADR, a benchmark mock, an existing page or a measured value differs, the mock wins and the older thing is superseded.
- **If it is not in the mock, it is not built.** A worker does not add a control, state or feature the mock lacks, and does not widen a page beyond it.
- **If the repo already has an equivalent of something in the mock, the old one is removed.** The slice that swaps a page in deletes the old page and anything only it used, in the same PR ([ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) decision 1).
- **Existing features with no equivalent in the mock are left as built:** the series voice bible and Series tab, the companion mode, and the stage timer, PFH and effective rate. They are not extended, removed or restyled.
- **The benchmark mocks (`docs/research/mockups/audiobook-studio-benchmark/`) are no longer a build target for any page the Studio Next mock covers.** They remain only as the reference for the two pages it lacks (06 Series voice bible, 07 companion), and are deleted at cutover with the old pages.
- **Theme is one app-wide setting.** Capture a state in the theme the mock page is drawn in and compare like with like: light against light, dark against dark.
- **Layout and style are the spec, not the sample data.** Don't seed demo data to make a capture look closer, and don't change a real title or subtitle to the mock's wording.
- **No other mock is a spec.** The per-PRD mock sets were deleted (D96) and are not recreated from `git log`. A new mock is added only for work being built now and is deleted in the PR that merges that work.

## UI PRs show their screenshots

Permanent owner rule, 2026-09-29. A PR that changes what `apps/ui` draws must show the change as images in its body. Without them the work has failed: the owner rejects the PR, and the coordinator neither merges it nor counts it ready. The owner has to see that it looks better and will not trust a number.

- **What to show.** A "Screenshots" section, one row per changed state at 1440×900: the Studio Next mock page | before (`main`) | after (the branch). Same state, viewport and fixture in the before and after captures, and the mock cropped or scaled to match. There is no match percentage for Studio Next pages; the owner looks at the images.
- **Other viewports.** Small-desktop and tablet (and `reflow` at 390 px for Settings) as before/after pairs in a collapsed `<details>`.
- **Where the images live.** On a branch named `pr-images/<the PR's branch>`, never on the PR's own branch, so they don't reach `main`. Embed with `https://github.com/countrymanprime/narration-utils/blob/pr-images/<branch>/<file>.png?raw=true`. Regenerate them after every push that changes the UI. The coordinator (whoever merges the PR) deletes `pr-images/<branch>` right after the merge (step 4 of [the pass](#the-coordinators-pass)), so the screenshots in a merged PR's body stop rendering; the Playwright visual suite and the mock are the lasting record.
- **How to capture.** `cd apps/ui && npx playwright test tests/visual/app.spec.ts -g "<page>.*<state>"` writes `apps/ui/screenshots/app/<page>/<state>/<viewport>.png` (gitignored). The mock runs from `docs/research/mockups/studio-next/` (`npm ci` there, then its Playwright scripts in `e2e/`); a worker without network lists the missing mock image in the PR and the owner supplies it.
- **Who checks.** The worker adds them before it says the PR is ready. The coordinator checks the PR body for the images at every sweep, and does not merge a UI PR without them, whatever the score or the CI result.

## Owner standing rules

Decisions the owner made while the train ran (logged on the retired #509). They bind the coordinator and every worker, and the worker template repeats the ones a worker needs.

| Rule | What it says |
| --- | --- |
| **D63** | `WARNING_POLICY: ignore`. A weekly warning counts as GREEN. On 2026-09-27 the owner restated it: ignore the weekly warning until the band is RED |
| **D64** | The coordinator resolves mechanical items itself (branch updates, index rows, status cells, bookkeeping) instead of queueing them for the owner |
| **D65** | Owner-only, hardware and REAPER checks are flagged on #992 and marked pending. They never block a merge or a launch |
| **D66** | Check the lane count on every pass, including passes spent mostly on merges or fixers, and launch before babysitting in-flight PRs |
| **D67** | Mock-first behind every port. A feature builds against a mock that passes the schema; going to production is a swap behind the port; the mocks stay for the demo build and the tests. A UI phase blocked only by an unbuilt backend phase is ready once that contract is pinned. Serial points, nav entries among them, still land one at a time |
| **D68** | A concept mock never blocks. Build against the PRD's recommended concept and pivot later if the owner asks. |
| **D69** | *(Superseded by D98 for every page the Studio Next mock covers.)* The audiobook studio benchmark's concept mocks are owner-approved as the build spec. **Dark mode is one app-wide theme,** on or off: no page or surface forces light or dark, and a dark mock shows the dark theme, not a per-page look. This supersedes ADR 0360 Q1's forced-dark booth surface |
| **D70** | Features still in development use public-domain or synthetic data instead of waiting for the owner's recordings. Results calibrated on it are **provisional**, and a re-run on the owner's own material goes on #992 as a QA item before it ships to users |
| **D71** | **LibriVox** is the default source for real speech audio: public domain, many readers, and solo readings where one reader voices several characters. Record the source URL, reader, book and the public-domain statement; keep the audio out of git as ignored local data. Synthetic audio is the fallback |
| **D72** | The privacy line is outbound user data, not inbound reference data. The app may call external APIs to **fetch** dictionary or pronunciation data (local first, online optional), but never sends the narrator's or authors' data out. An online lookup sends a single word, never passages, file names or project identifiers; it is narrator-initiated, or opt-in with a notice for a batch; results are cached locally; there is no telemetry and no project-run proxy. A service that needs a key uses the narrator's own key, stored locally and never logged |
| **D73** | A PR need not contain `main`'s tip to merge (supersedes that D40 condition, 2026-09-27). The merge is a squash, so GitHub refuses it when the PR no longer merges cleanly; then, and only then, the coordinator merges `main` into the PR (a fixer when the conflict isn't mechanical) and waits for its checks. The green run must still be on the PR's current head |
| **D74** | Windows only, for now (2026-09-27). Linux and macOS support is removed until the app is in a steadier state or someone uses those systems; `Build (Windows)` stays the build gate. Linux CI runners remain as hosts for platform-neutral checks (docs, the Lua harness, the browser-based UI suites), which is not Linux support |
| **D75** | The public GitHub Pages site (docs, Storybook, demo) is paused until the main app's development is done (2026-09-27): `pages.yml` no longer deploys on a push to `main`, and (narrowed 2026-09-27, [ADR 0415](../adr/0415-while-pages-is-paused-docs-are-checked-by-lychee-and-a-changed-file-markdownlint-not-by-building-the-site.md)) no longer runs on a pull request either. Workers keep the docs link-clean through `Docs / Links (offline)` (lychee, every pull request) and `Docs / Markdown lint (changed files)` (markdownlint-cli2 on the Markdown files a pull request adds or changes), not by building the site, and don't add work that only serves the published site |
| **D82** | Every worker owns its PRs until they merge or close (2026-09-27): it stays subscribed, and on a merge-conflict notice or a red check it merges `main` into its own branch (never rebase), fixes, re-runs its targeted checks and pushes. It keeps an hourly `send_later` check-in while a PR is open. The coordinator launches no cascade fixers; a one-PR fixer only for a PR whose own session is archived or failed. The coordinator archives the session once all its PRs are merged or closed (D78) |
| **D91** | *(Amended by D97 below; superseded by D98 for every page the Studio Next mock covers.)* The approved mocks win, measured (2026-09-28): a screen an approved mock covers is built to that mock, captured at the mock's own size and theme with the app driven to the mock's state ([the seven benchmark mocks](#which-mocks-are-the-spec); `pnpm --dir apps/ui mock-match`, [verification tooling](verification-tooling.md#mock-match)). New primitives, tokens and style changes are in scope, and "the existing style is close enough" is not a reason: a difference a primitive causes is fixed in the primitive, so every consumer inherits it, never restyled locally. The 90% bar and the "reason the owner accepts" it required are gone (D97) |
| **D96** | *(Superseded by D98.)* Only `docs/research/mockups/audiobook-studio-benchmark/` counted (2026-09-29). Every other mock is deleted from the repo and so is anything pointing at it. Keep only mocks for work actively in development, plus the current-state screenshots in `docs/images/ui/` ([Which mocks are the spec](#which-mocks-are-the-spec)) |
| **D97** | The 90% bar is no longer a gate (2026-09-29). Match % is a diagnostic, and it scores features and styles, not pixel-exact text or sample data (the tool paints glyphs out of both images first). No D91 reasons, no region-attribution tables, no Mockup check table. Finish building the pages; the owner does a fix-up pass afterwards. The screenshots-in-PR rule stands unchanged |
| **D98** | The Studio Next mock (`docs/research/mockups/studio-next/`) is the only spec (2026-10-11). "The mocks are the gold standard and if it is not in the mock it doesn't get built. If it exists already and has an equivalent somewhere in the Studio Next mocks then get rid of the old." A page the mock covers is built to it, replacing its old counterpart in one PR with no flag; where an older ADR, benchmark mock, page or measured value differs, the mock wins; existing features with no equivalent (series voice bible, companion, stage timer / PFH) are left as built. Match % is not used for Studio Next pages. See [Which mocks are the spec](#which-mocks-are-the-spec) |

## The coordinator's pass

The Routine fires every 30 minutes (two hourly Routines, 30 minutes apart; D50). Each firing is one pass. Be brief and cheap: don't read the codebase, and don't run builds or tests yourself. Use the `mcp__github__*` tools for GitHub and `mcp__Claude_Code_Remote__*` for sessions (load them with ToolSearch). There is no `gh` CLI.

1. **Switches.**
   - Read #989.
   - If `HOLD` is ticked, run step 4 (merge) only, then end.
2. **Usage.** Read `rate_limit_info`, pick the band and adjust `TARGET` ([above](#usage-and-autoscaling)).
3. **Reconcile sessions.** For each session listed on #989, call `get_session` and read its `status_bucket`:
   - `working` or `blocked`: running. It counts toward `TARGET`.
   - `completed`, `review_ready`, or idle after commenting `<ID>: … green` on #989: done. Free its slot.
   - `failed`, with a usage or rate-limit reason (see `list_events`): paused. Set RED. The stream goes on the resume list.
   - `failed` for any other reason: blocked. Read its last events, note the cause on #989, and queue a fixer if the PR exists.
   - The worker commented `<ID>: PAUSED at <step>` or `<ID>: yielded after pN`: paused or yielded. Put it on the resume list, or queue its next phase.
4. **Merge (D40).** Take bottom PRs (base `main`), oldest first. Merge one only when all of these hold:
   - it is not a draft;
   - it merges cleanly into `main` (D73: it need not contain `main`'s tip). If GitHub reports a conflict, merge `main` into it with `update_pull_request_branch`, or start a fixer when that fails, and wait for its checks on the next pass;
   - `Build (Windows)` and `ui-dist` succeeded on the head. A docs-only PR needs `Docs / Links (offline)` instead;
   - there is no `CHANGES_REQUESTED` review and no unresolved thread whose first comment starts with 🔴;
   - a Claude Approvals check, if present, passes;
   - a UI PR carries its Screenshots section ([UI PRs show their screenshots](#ui-prs-show-their-screenshots)). There is no match % bar to check (D97);
   - the `Test ratchet` check succeeded on the head ([Safety net](#safety-net));
   - it has no `risk:high` label, or the owner has approved it on #992 for the current head ([Safety net](#safety-net));
   - an independent intent review passed on the current head ([Safety net](#safety-net)).

   Merge with `squash` and `expectedHeadSha`, then delete the branch, and its `pr-images/<branch>` if one exists ([UI PRs show their screenshots](#ui-prs-show-their-screenshots)). Don't update the other bottom PRs' branches after a merge (D73); only a PR that no longer merges cleanly gets `main` merged in.
   - **A conflict:** start one **fixer**. Use Sonnet for mechanical files (`hostAPIVersion`, ADR or PRD index rows, status cells, regenerated `Host.*`) and Opus otherwise.
   - **A merge turns `main` red:** tick `HOLD`, start an Opus fixer aimed at `main`, and log it.
   - **A merge just unblocked other phases (D62, owner-directed):** don't wait for the next scheduled Routine firing to act on it. The moment a merge lands, re-check every PRD whose `Depends` named the phase that just completed, and if step 5 below would now add something to the ready list, run step 5 immediately, in the same pass. A phase sitting ready while nothing launches until the next tick is exactly the latency this rule removes.
5. **Launch.** Skip this step on `HOLD`, `HOLD-UNTIL-RESET`, AMBER-5H before its `resetsAt`, or when running ≥ `TARGET`.
   1. **Build the ready list.** A PRD phase is ready when:
      - its `Status` is `pending`;
      - every phase in its `Depends` is `complete` on `main`;
      - its Phase Details paragraph and the PRD's Visual Spec section carry no unmet owner-approval gate (see [Mockup gates](#mockup-gates) — if one exists and isn't met, the phase isn't ready, but its mockup drafting is its own lane entry);
      - its Parallel-session row collides with no running stream's files;
      - its PRD is in the [queue](#queue) at or above the current wave.
   2. **Group phases into streams** of 1–3 consecutive phases of one PRD in one lane. Phases that each need their own worker (marked parallel in the PRD) become separate streams.
   3. **Launch in priority order** until running = `TARGET`. Keep Opus workers ≤ `MAX_OPUS_WORKERS`. Skip a stream that has hit the [launch limit](#safety-net). Use `create_session` with:
      - `source_url` `https://github.com/countrymanprime/narration-utils`;
      - `permission_mode` `"auto"`;
      - a model from the lane table: Sonnet by default, Opus only for lane K, lane X, new Lua commands and semantic fixers, Haiku for bookkeeping;
      - `title` `"<ID> <scope>"` and `tags` `["agent-train", "lane-<L>"]`;
      - the [worker template](#worker-template) as the prompt. Use the resume template for a paused stream.
   4. **Record each launch on #989:** ID, lane, session id, PRD phases and model, and add one to that stream's count in the Launches table.
6. **Housekeeping.**
   - **Last, on every pass, even one that did nothing else,** set the `Last pass: <UTC time, ISO 8601>` line in #989's body. The [train health check](#safety-net) warns the owner when it goes more than two hours stale.
   - Rewrite the rest of #989's body only when something changed, with one log line per event: started, merged, paused, resumed, blocked, band change, `TARGET` change.
   - On the first pass after 09:00 America/New_York, post one short comment on #989: merged, in flight, paused, blocked, band, `TARGET`.
   - End every comment with a blank line, `---`, then `_Generated by [Claude Code](https://claude.ai/code)_`.

**IDs** are `N-<lane><n>`, for example `N-K1` or `N-B5a`. The `N-` prefix keeps them apart from the 2026-09-24 train's IDs in #989's history.

## The worker protocol

A worker is one cloud session for one stream. It opens one PR per phase, stacked on the previous one, and never merges.

- **Commit and push after every green step,** not just at the end. A session that dies on a usage limit loses only the work since its last push.
- **Checkpoints:** before each phase, and before any expensive step (the visual states of a page, a full Go race run, the atlas). At each checkpoint:
  1. Read #989's switches and the decisions register #993, and call `get_session` for your own `rate_limit_info` if the tool is available.
  2. On `HOLD`, `HOLD-UNTIL-RESET`, or RED in your own reading, or `DRAIN` unless you are lane K and the band is not RED: **pause.**
     - Commit your work in progress as `chore(<scope>): wip, paused at <step>` and push.
     - Open or update the phase's PR as a **draft** with a `## Resume notes` block:
       - Stream `<ID>`, PRD and phase
       - Done: the steps finished, with commit SHAs
       - Next: the exact next step
       - Failing: any failing check, with its output
       - Checks run: the local checks already passed
     - Comment `<ID>: PAUSED at <step>, PR #<n>` on #989, then end the session.
  3. On AMBER in your own reading (`allowed_warning`), **unless #989's `WARNING_POLICY` is `ignore`** (then a warning counts as GREEN, D63): **yield.** Finish the current PR to green, don't start the next phase, comment `<ID>: yielded after p<N>` on #989, and end.
  4. Otherwise, continue.
- **Finishing:**
  - Subscribe to your PRs, and drive `Build (Windows)` and `ui-dist` to green.
  - Answer every red-circle thread.
  - Comment `<ID>: PRs #… green` on #989, then end the turn, **staying subscribed** (D82).
  - **Until each PR merges or closes, you own it (D82).** On a merge-conflict notice, a red check or a review comment: merge `main` into your branch (never rebase or force-push), resolve keeping both sides' intent (the rules in the fixer template), re-run your targeted checks, push, and end the turn again. Schedule a `send_later` check-in about an hour out whenever a PR is still open, and re-check merge state and CI when it fires. Stop once every PR is merged or closed.
  - After three failed CI rounds on one PR: mark it draft, paste the failure into it, comment on #989, and end.
- **No resume-in-place:** there is no tool to send a follow-up task into a session that has already finished and gone idle. A stream's next PRD phase (D62) is always a **new** session, branched fresh off the current `main` tip — never a message into the old one. The gain from D62 is launching that new session the moment the phase is ready, not batching it to the next tick; it is not session reuse.
- **Owner steps:** anything needing the owner, REAPER, audio hardware or owner input goes on #992 as a comment and is marked pending in the PR. Never wait for a human.
- **Tooling:** the repo's `SessionStart` hook (`scripts/cloud/session-start.sh`, registered in `.claude/settings.json`) installs the pinned toolchain. `.claude/settings.json` allows the build, test and git commands and denies force-pushes and rebases. Workers never edit `.claude/settings.json`; auto mode refuses that as self-modification, so any change to it goes on #992 for the owner.

## Templates

### Worker template

Fill in the `<>` fields.

```text
You are worker stream <ID> (lane <L>: <lane name>) in the narration-utils agent train. Repo countrymanprime/narration-utils.
No human is watching live; never wait for answers. Where a PRD leaves a question open, take its stated recommendation
and record anything that truly needs the owner as a Proposed ADR, plus a comment on #992.

READ FIRST: CLAUDE.md; docs/operations/agent-train.md ("The worker protocol", "Serial points", "Lanes"); then each PRD in
scope, in full.
SCOPE: <PRD path> phases <N…>: <one line each>.
SLICE: #<slice issue>, for a Studio Next slice. The issue is the spec; read its Handoff comment first, and rewrite it at every checkpoint.
MOCKUPS (D46, D98): <per phase: the exact docs/research/mockups/studio-next/src/pages/... file and its state, or "none">. Open it
and the running mock before coding and build to match. The Studio Next mock is the only spec (D98): if it is not in the mock, don't build it; if the repo
already has an equivalent of something in it, the old one is removed in the swap. Compare light to light and dark to dark by the theme the mock page is
drawn in. Layout and style are the spec, never the mock's sample data.
Drive the app to the mock's state and data, capture at the mock's own size and theme, and look at it beside the mock. There is no match % for Studio Next
pages: build the features and styles the mock shows and look at the images.
No reasons to write, no region tables, no Mockup check table. New primitives and tokens are in scope; existing styles are not a reason: when a
primitive, token or style doesn't draw what the mock shows, change the primitive (its <Name>.stories.tsx too, with
design-spec-guard and an ADR for a changed design decision), don't restyle it locally on the page. The spec per
primitive is docs/design/design-system.md.
YOUR FILES: <the slice issue's owns, or for an older PRD the phases' rows from its Parallel-session table>. NEVER TOUCH: files owned by other lanes or listed for
a running stream on #989. If you need another lane's change, comment on #989.
ADR NUMBERS: an ADR takes the next free number in docs/adr/; check it at write time and again before your last push.
DOCS: do not write agent vocabulary (coordinator, worker, slice, session, skill) into files under docs/, except
docs/operations/ runbooks that a person follows. A spike's research note has a date and a question and no slice, stream
or lane header; an audit or checklist for one PR is a comment on the PR or its issue, not a file.
BRANCHES AND PRS: first PR based on the latest main; one PR per phase, each based on the previous branch; branch
<type>/<prd-slug>-p<N>-<slug>; PR title a Conventional Commit; body = goal, what changed, local checks run with results,
Screenshots (any UI change; see "UI PRs show their screenshots": the PR is not ready without them), "Base: <branch>", "Closes #<slice>" for a slice,
else "Part of #<PRD issue>" (find it or create it per docs/operations/github-workflow.md; the PRD's last phase says "Closes #<n>"), "New ADRs for review". Set each phase's
Status cell in its own PR. The PR delivering a PRD's last phase writes the steady-state docs and deletes the PRD.
METHOD: impact scan before touching shared code (list every consumer of what you change and its tests); tests first;
SOLID: depend on the ports (internal/dawport roles, provider ports, NarrationApi), never on concrete adapters.
TESTING (D43, D44): targeted checks only: Go tests of changed packages plus go vet, the Lua harness for Lua, Vitest of
changed UI, pytest of changed sidecars, lint and typecheck of touched projects, and the visual states of pages you
changed (cd apps/ui && npx playwright test tests/visual/app.spec.ts -g "<page>.*<state>"), looking at every viewport's
PNG. Not the full pnpm check, the full visual suite or the atlas (a primitive's own atlas story is fine), and never
regenerate docs/images/ui or docs/ui.
WIRE CONTRACTS: a new binding or event gets a Zod schema, a golden (UPDATE_CONTRACTS=1), a wireContracts row and a mock
that passes it, plus a hostAPIVersion bump to main + 1. New REAPER commands: harness tests first, wire.go row,
threat-model and SECURITY.md rows, declared as Experimental capabilities.
OWNER RULES ("Owner standing rules" in this file): D67 mock-first behind every port; D69 one app-wide theme, never force
light or dark on a page; D70/D71 development audio from LibriVox (provenance recorded, audio kept out of git) or
synthetic, results provisional; D72 fetch reference data freely, but never send the narrator's or authors' data out.
USAGE: follow "The worker protocol" exactly: push after every green step, check #989 and your rate_limit_info at every
checkpoint, pause or yield as it says.
FINISH: subscribe to your PRs; drive Build (Windows) and ui-dist green; answer every red-circle thread; comment
"<ID>: PRs #… green" on #989; end the turn but stay subscribed. D82: you own your PRs until they merge or close: on a
merge conflict or red check, merge main into your branch (never rebase), fix, re-check, push; keep an hourly send_later
check-in while any PR is open. NEVER merge. End every GitHub comment with a blank line, "---", then
"_Generated by [Claude Code](https://claude.ai/code)_".
```

### Resume template

The worker template, with this paragraph first:

```text
RESUME: stream <ID> was paused. Its work is on branch <branch>, draft PR #<n>. Read the PR's "## Resume notes" and its
diff, check out the branch, merge main into it (never rebase), re-run the checks listed there, then continue from "Next".
Mark the PR ready for review when its phase is done.
```

### Fixer template

```text
You are a fixer in the narration-utils agent train. PR #<n> (branch <b>) <has a merge conflict with main | fails <check> |
turned main red>. Merge main into the branch (never rebase or force-push). Resolve keeping both sides' intent: for
hostAPIVersion take the higher value + 1 and regenerate Host.*; for ADR or PRD index rows keep both rows; for an ADR number
clash renumber the later one to the next free number and fix its links. Run targeted checks for the touched areas, push,
confirm Build (Windows) and ui-dist go green, comment on #989 with what you did, then end. Don't merge. End every GitHub
comment with a blank line, "---", then "_Generated by [Claude Code](https://claude.ai/code)_".
```

## Queue

Waves order the work, and the coordinator doesn't start a wave until everything it depends on has merged. Inside a wave, the ready-list rules above decide.

The waves that ordered the earlier PRDs (the DAW port, the studio UI primitives, input commands and pedals, the booth, proofing, production and delivery PRDs, and the filler) are retired: those PRDs are deleted ([ADR 0028](../adr/0028-planned-work-is-specified-as-prds-and-deleted-when-built.md)) and the Studio Next series in `docs/prds/` is the plan. The series' dependency order is the graph in [Studio Next Rebuild](../prds/studio-next-rebuild.prd.md#technical-approach); no wave has been accepted for it yet.

**Rules for PRD writers:**
- Use the template in `docs/prds/README.md`.
- Add a **Ports used** column to the phase table, naming the capabilities and roles of the DAW port, the provider ports and the UI primitives each phase needs. That column is how the coordinator knows when a phase is unblocked.
- Link the Studio Next mock page the PRD builds to from `docs/research/mockups/studio-next/src/pages/`; don't copy it into the PRD (D98). A PRD never asks for something the mock lacks.
- Give every open question a recommendation.
