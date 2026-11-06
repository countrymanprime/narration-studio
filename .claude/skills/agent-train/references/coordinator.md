# The coordinator's procedure

Read by the coordinator only. A worker needs [worker.md](worker.md).

How parallel Claude Code sessions build the planned work around the clock: one **coordinator** and up to eight **workers**. The coordinator starts workers, scales their number to the usage left, merges green pull requests and fixes mechanical conflicts. Each worker delivers one stream of one to three PRD phases, one pull request per phase. This file is the coordinator's procedure. Its Routine prompt says to read the agent-train skill on `main` and run one pass; `docs/operations/agent-train.md` points here, so a prompt that still names that path keeps working. Changing the procedure is a normal pull request (`risk:high`, because it is under `.claude/`).

The worker, resume and fixer prompts are in [templates.md](templates.md). The Studio Next delivery model (slices, the groomer, the decisions register, deviations D-1 to D-11) is in [studio-next-delivery.md](studio-next-delivery.md).

It replaces the scheduling rules of the lane train of 2026-09-24:

- **Kept:** D40 (the coordinator merges), D43 (the light merge gate), D44 (the visual suite and atlas run in full once, at the end) and D46 (built UI is compared with its mock, amended by D97); all are in [Owner standing rules](owner-rules.md#owner-standing-rules).
- **Replaced:** D41 (three lanes) and D45 (hold on credits), by [Lanes](worker.md#lanes) and [Usage and autoscaling](#usage-and-autoscaling) below.

The work it schedules comes from the PRDs in `docs/prds/`: the Studio Next series, delivered as [slices](groomer.md#studio-next-slices). The Studio Next mock is the only spec for the pages it covers ([Which mocks are the spec](worker.md#which-mocks-are-the-spec)).

## Where state lives

| What | Where |
| --- | --- |
| The procedure (this file) | `.claude/skills/agent-train/SKILL.md` on `main`; `docs/operations/agent-train.md` is a pointer to it |
| What to build | The PRDs in `docs/prds/`: phase tables, `Depends`, and the Parallel-session compatibility tables |
| Live state: switches, target concurrency, lanes and their sessions, the log | Issue [#989, Train control](https://github.com/countrymanprime/narration-studio/issues/989). The coordinator rewrites its body |
| Steps only the owner can take | Issue [#992, Owner queue](https://github.com/countrymanprime/narration-studio/issues/992) |
| Owner decisions and their defaults | Issue [#993, Studio Next decisions](https://github.com/countrymanprime/narration-studio/issues/993), one comment per decision |
| Slice counts per PRD, the oldest ready slice, the critical path | The "Studio Next status" issue, which the coordinator rewrites |
| Pipeline repairs after merges that did not wait for CI | Issue [#1119](https://github.com/countrymanprime/narration-studio/issues/1119) |
| A paused stream's progress | Its draft PR's `## Resume notes` block |

State never lives in a file on `main`, so recording state can't cause merge conflicts.

Issues #509 (Train control) and #510 (Owner queue) of the 2026-09-24 train, and #52, are retired: #989 and #992 replace them, and nothing in them is an instruction. The two checks in the [Safety net](#safety-net) that name them still read #509 and #510 until the owner moves them to #989 and #992.

## Switches on #989

Only the owner or the coordinator edits these. The last three rows are the Studio Next switches. #989's body names the daily cap `DAILY_CAP`; that row is the switch, and `SN_DAILY_CAP` here is the same switch.

| Switch | Default | Meaning |
| --- | --- | --- |
| `HOLD` | off | The owner's stop. Nothing launches; merges and fixes continue |
| `HOLD-UNTIL-RESET` | off | Set by the coordinator on RED. Cleared by the first tick where usage is not RED |
| `DRAIN` | off | Set by the coordinator on AMBER-7D or RED. Running workers pause at their next checkpoint (see [the worker protocol](worker.md#the-worker-protocol)). Lane K is exempt unless the band is RED |
| `MAX_WORKERS` | 8 | Hard ceiling on concurrent workers, the coordinator not counted |
| `MAX_OPUS_WORKERS` | 2 | Of those, how many may run Opus |
| `WARNING_POLICY` | `throttle` | What a weekly warning does: `throttle`, `hold` or `ignore`. The owner's cloud credit is used up (2026-09-26), so warnings count |
| `ALLOW_OVERAGE` | off | While off, a session that reports `isUsingOverage: true` is treated as RED |
| `TARGET` | 4 | Target concurrent workers, adjusted by the coordinator (below) |
| `WEEK_START_TARGET` | 4 | The `TARGET` the first tick after the weekly reset starts from |
| `WEEKLY_RESET` | from `resetsAt` | The next weekly reset. The coordinator fills it from the first `seven_day` `resetsAt` it sees; until then, 22:00 America/New_York (D45) |
| `SN_HOLD` | off | Stops launching Studio Next slices only (D-5). Merges, fixes and other work continue |
| `SN_DAILY_CAP` | 12 | Slices launched per UTC day (D-4). A resume or a fixer for a launched slice doesn't count. At the cap, nothing new launches until the next UTC day |
| Session cap per slice | 1 + 1 resume + 1 fixer | D-6. A `spike` slice gets 1 session. A slice that uses its cap is relabelled `blocked` and re-groomed; it was too big |

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

Nobody watches the train live, so these checks run without a person and none of them relies on a worker's own report. Each one closes a failure the train has had or the [research behind it](../../../../docs/operations/ci-and-releases.md) found: a stopped coordinator that nobody noticed for eleven days, regressions that sit on `main` between full sweeps, a worker weakening its own tests, and a stream relaunched forever.

| Check | Where | What it does |
| --- | --- | --- |
| **Train health** | `.github/workflows/train-health.yml`, `scripts/ci/train-health.mjs` | Hourly. Warns on #510 once per stall when #509's `Last pass:` line is more than two hours old and `HOLD` is not ticked |
| **Main health** | `.github/workflows/main-health.yml` | Nightly. Runs the whole of `ci.yml` on `main` (quality, every visual shard, UI bundle, Windows build). On a red run, ticks `HOLD` on #509 and says why. The owner or the coordinator clears it once `main` is green |
| **Test ratchet** | `.github/workflows/test-ratchet.yml`, `scripts/ci/test-ratchet.mjs` | Advisory. Prints, and raises a warning for, a PR that deletes a test file, adds a skip or focus marker to one, or lowers a coverage floor in `scripts/ci/coverage-floors.json`; it never fails. Runs the base branch's copy of the script |
| **PR risk** | `.github/workflows/pr-risk.yml`, `scripts/ci/pr-risk.mjs` | Labels a PR `risk:high` when it touches a trust boundary or a file that decides what runs unattended: the workflows, agent config, the threat model, the REAPER bridge, the update and sidecar launch, the release scripts, the pinned toolchain and lockfiles, and these checks. Runs the base branch's copy of the script |
| **Intent review** | the coordinator, below | A fresh session, not the worker, traces each merge-ready PR back to its issue or PRD phase |
| **Launch limit** | the coordinator, below | Stops a stream that keeps being relaunched without delivering |

**Intent review.** Before merging a PR that passes the other conditions in step 4, start one reviewer session for it: `create_session` on Sonnet with `tags: ["agent-train", "intent-review"]`, `title` `"review #<n>"` and a prompt that names the PR, its head SHA and its tracking issue or PRD phase, and says to run the `intent-reviewer` agent in a fresh context, not to edit anything, and to comment on the PR either `Intent review: pass at <sha>` or a list of findings, each starting with 🔴. Pass the agent the branch and the issue, not the worker's account of what it built. The review counts toward `TARGET` while it runs. Merge only on a `pass` for the PR's current head; a push after the pass needs a new review.

**A `risk:high` PR.** Do not merge it. Comment on #992 with the PR number, its head SHA and the reasons the label's workflow printed, then carry on with other PRs. The owner approves by approving the PR on its current head or by replying `approved #<n> <sha>` on #992. A push after that approval needs a new one.

**A ratchet warning.** The check is advisory and needs no label or approval. Read the violations it printed and expect the PR body to say why each is intended; if it does not, ask the worker for that before merging.

**The launch limit.** The Launches table in #989's body has one row per stream: ID, PRD phases, launches, last launch, PRs merged. A stream's count goes up on every `create_session` for it, resumes and fixers included. At three launches with no PR of the stream merged, mark the stream **blocked**: do not launch it again, comment on #992 with its Resume notes and the last failure, and take the next stream in priority order. The owner unblocks it by resetting its count on #989. A stream that merges a PR resets its own count to zero.

**Permissions.** `.claude/settings.json` denies `git push origin main` and `git push origin HEAD:main`, so a worker cannot push to `main` even where a ruleset would let its token. Merging goes through the coordinator's `merge_pull_request`, never `git`.

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
   - `Build (Windows)` and `ui-dist` succeeded on the head. A docs-only PR needs `Docs / Docs checks` (the link check and the other four docs checks, which run on every PR) instead;
   - there is no `CHANGES_REQUESTED` review and no unresolved thread whose first comment starts with 🔴;
   - a Claude Approvals check, if present, passes;
   - a UI PR updates its pages' guide text and images, or carries a specific `No guide change:` reason, and states the real-app and Storybook results ([UI PRs update the how-to guide](worker.md#ui-prs-update-the-how-to-guide)). There is no match % bar to check (D97);
   - the `Test ratchet` check has run on the head and its warnings were read ([Safety net](#safety-net));
   - it has no `risk:high` label, or the owner has approved it on #992 for the current head ([Safety net](#safety-net));
   - an independent intent review passed on the current head ([Safety net](#safety-net)).

   Merge with `squash` and `expectedHeadSha`, then delete the branch. Don't update the other bottom PRs' branches after a merge (D73); only a PR that no longer merges cleanly gets `main` merged in.
   - **After a merge, verify its issues are closed.** Read the PR body's `Closes`/`Fixes`/`Resolves #<n>` lines (read it again after the merge; the worker may have edited it). For each issue, `issue_read` it. If it is still open, close it with `issue_write` (`state` `closed`, `state_reason` `completed`) and an `add_issue_comment` that says `Fixed by #<pr>, merged at <sha>.` and the Claude Code footer. This is the normal case for a PR whose base was not `main` and for a missing keyword. A `Refs` or `Part of` issue stays open, unless the PR's diff plainly resolves it and the body says so: then close it the same way. If the PR resolved an issue but the body names none, find it with `gh api -X GET search/issues` and close it the same way. Log any issue you had to close by hand on #989, so a worker that keeps missing the keyword shows up.
   - **After a merge or a close, cancel the PR's unfinished runs yourself.** No workflow does it: a workflow that cancels runs needs a runner itself, queued behind the runs it was meant to stop, and was removed on 2026-10-19. List the runs of the PR's branch with `status` `queued` and `in_progress` (`actions_list` `list_workflow_runs`, `workflow_runs_filter`), keep only those whose `head_sha` is the PR's head and whose event is `pull_request` or `pull_request_target`, and cancel each with `actions_run_trigger` `cancel_workflow_run`. Never cancel a `push` run on `main`.
   - **A conflict:** start one **fixer**. Use Sonnet for mechanical files (`hostAPIVersion`, PRD index rows, status cells, regenerated `Host.*`) and Opus otherwise.
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
      - `source_url` `https://github.com/countrymanprime/narration-studio`;
      - `permission_mode` `"auto"`;
      - a model from the lane table: Sonnet by default, Opus only for lane K, lane X, new Lua commands and semantic fixers, Haiku for bookkeeping;
      - `title` `"<ID> <scope>"` and `tags` `["agent-train", "lane-<L>"]`;
      - the [worker template](templates.md#worker-template) as the prompt. Use the resume template for a paused stream.
   4. **Record each launch on #989:** ID, lane, session id, PRD phases and model, and add one to that stream's count in the Launches table.
6. **Housekeeping.**
   - **Last, on every pass, even one that did nothing else,** set the `Last pass: <UTC time, ISO 8601>` line in #989's body. The [train health check](#safety-net) warns the owner when it goes more than two hours stale.
   - Rewrite the rest of #989's body only when something changed, with one log line per event: started, merged, paused, resumed, blocked, band change, `TARGET` change.
   - On the first pass after 09:00 America/New_York, post one short comment on #989: merged, in flight, paused, blocked, band, `TARGET`.
   - End every comment with a blank line, `---`, then `_Generated by [Claude Code](https://claude.ai/code)_`.

**IDs** are `N-<lane><n>`, for example `N-K1` or `N-B5a`. The `N-` prefix keeps them apart from the 2026-09-24 train's IDs in #989's history.

## Mockup gates

Some PRDs gate a phase on **owner-approved mockups** in prose (its Phase Details or its Visual Spec section), not just in the `Depends` column. That gate never shows up in the phase table, so before adding a phase to the ready list, check its Phase Details paragraph and the PRD's Visual Spec section, not only `Depends`.

Since D68 and D69 (see [Owner standing rules](owner-rules.md#owner-standing-rules)), an existing concept mock no longer gates a phase: build against it. The rules below still apply when a phase has **no** mockup at all.

When a phase is otherwise ready (`Depends` complete, no file collision) but blocked solely on mockups that don't exist yet or haven't been approved (D61, owner-directed):

- **Don't launch it as a normal worker,** and don't guess at a design to route around the gate.
- **Launch a mockup-drafting session instead**, as its own lane entry, not a phase worker: `create_session` with `tags: ["agent-train", "mockup-design"]`, a model picked like any other lane (Opus for a screen with real interaction states — a recorder, conflict or error messaging, anything with more than static layout; Sonnet for a mostly-static screen), and a prompt that:
  - names the exact states the PRD's Phase Details and Visual Spec section describe;
  - points it at `docs/design/design-system.md` and the real tokens/primitives, never a generic style;
  - points it at the Studio Next mock in git history ([Reading the deleted mock](../../../../docs/operations/verification-tooling.md#reading-the-deleted-studio-next-mock)) for tone and format precedent ([D98](worker.md#which-mocks-are-the-spec));
  - says explicitly: **drafts only**, no product code for the gated phase, and the PRD's Visual Spec section is updated to list the new files as drafts pending the owner's approval — the session never marks its own work owner-approved;
  - tells it to open its own tracking issue and a normal PR, same as any worker, and never merge itself.
- **Record it on #989** as its own lane entry. It counts toward `TARGET` like any running session, but is tracked separately from the phase queue until the owner approves it.
- **Subscribe to its PR** (`subscribe_pr_activity`). The owner may leave review comments to iterate on the design directly with that session (or a follow-up fixer) before approving — treat that like any other reviewer round: implement the requested visual changes and push, rather than closing the PR out after one draft.
- The gated phase itself joins the normal ready list only once the owner approves the mockups (a comment or review saying so, or the PRD's Visual Spec section no longer reads "pending"). Approval is the owner's call, never the coordinator's.

## Queue

Waves order the work, and the coordinator doesn't start a wave until everything it depends on has merged. Inside a wave, the ready-list rules above decide.

The waves that ordered the earlier PRDs (the DAW port, the studio UI primitives, input commands and pedals, the booth, proofing, production and delivery PRDs, and the filler) are retired: those PRDs are deleted ([Lifecycle of a PRD](../../../../docs/prds/README.md#lifecycle-of-a-prd)) and the Studio Next series in `docs/prds/` is the plan. The series' dependency order is the graph in Studio Next Rebuild; no wave has been accepted for it yet.

**Rules for PRD writers:**
- Use the template in `docs/prds/README.md`.
- Add a **Ports used** column to the phase table, naming the capabilities and roles of the DAW port, the provider ports and the UI primitives each phase needs. That column is how the coordinator knows when a phase is unblocked.
- Name the Studio Next mock page the PRD builds to by its path in history; don't copy it into the PRD (D98). A PRD never asks for something the mock lacks.
- Give every open question a recommendation.
