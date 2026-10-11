# Studio Next Agent Delivery: Slices, Lanes and a Coordinator That Never Idles

**Source:** owner requirement of 2026-10-10 for the Studio Next PRD series: "I want the design to include agents and sessions running constantly", clarified as: coordinator and worker sessions must be able to run continuously on the rebuild; this is about how the work is delivered, not an in-app feature.

**Builds on:** [The agent train](../operations/agent-train.md) (the coordinator's procedure, switches, lanes, serial points, owner standing rules, worker protocol and templates), [Tracking work on GitHub](../operations/github-workflow.md), [CLAUDE.md](../../CLAUDE.md), and the implementation plan (deleted PRD `implementation-plan`) sections 3 and 8. It does not replace the train; it fits the series into it and lists every place it would extend or change it.

**Status (2026-10-10):** draft. Every extension or deviation is a proposal in the table "Deviations from the agent train"; none is in force until the owner accepts it and the change lands in `docs/operations/agent-train.md` (SNA-3) with an ADR where it settles a decision. Until then the train runs as written.

## Problem Statement

The train already runs continuously, but it is tuned for PRDs whose phases are 1 to 3 per stream and whose tracking issue is one per PRD. The Studio Next series has about 14 PRDs and, in all, roughly 150 units of work. At that size three things fail without more structure:

1. **Work units are not sized or specified for a cold session.** A "phase" can be a week of work. A worker that dies on a usage limit loses context, and the next session has only a draft PR's `## Resume notes`.
2. **Collisions are checked by reading PRD tables.** The coordinator "doesn't read the codebase" ([The coordinator's pass](../operations/agent-train.md#the-coordinators-pass)), so file ownership has to be a machine-readable fact, not a judgement.
3. **Owner decisions arrive in chat.** The train logs them as `D<n>` rows after the fact. This series has about 40 open questions; agents need to poll one place and to know the default when the owner has not answered.

## Evidence

What the train already gives (all cited from `docs/operations/agent-train.md`):

| Need | The train today | Gap for this series |
| --- | --- | --- |
| Live state | Issue #509 "Train control" (body rewritten by the coordinator); #510 "Owner queue" ([Where state lives](../operations/agent-train.md#where-state-lives)) | One body for 8 workers is fine; for 150 slices it needs a per-program status view |
| Stop and scale | `HOLD`, `HOLD-UNTIL-RESET`, `DRAIN`, `MAX_WORKERS`, `MAX_OPUS_WORKERS`, `TARGET`, usage bands ([Switches](../operations/agent-train.md#switches-on-509), [Usage and autoscaling](../operations/agent-train.md#usage-and-autoscaling)) | No way to pause only this program |
| Territories | Lanes K, A, B, U, C, D, X with ADR blocks ([Lanes](../operations/agent-train.md#lanes)) | The new directories of this series have no lane (`apps/ui/src/studio/`, `ports/`, `overlay/`) |
| Serial points | `hostAPIVersion`, ADR numbers, index rows, append-only rows, nav, workflows, token batch, hot UI files ([Serial points](../operations/agent-train.md#serial-points)) | Fine; slices must name which they touch |
| Ready list | A phase is ready when `Status` is pending, `Depends` complete, no unmet gate, no file collision, wave reached ([step 5](../operations/agent-train.md#the-coordinators-pass)) | Computed from PRD tables the coordinator does not read in depth |
| Worker protocol | Push after every green step; checkpoints; pause or yield; own PRs until merged (D82); `send_later` check-ins ([The worker protocol](../operations/agent-train.md#the-worker-protocol)) | Resume depends on the PR body, which exists only after the first push |
| Templates | Worker, resume and fixer templates ([Templates](../operations/agent-train.md#templates)) | Name the benchmark mocks only; no slice fields |
| Quality | D43 targeted checks, D44 full gate at the end; D46 and D97 mock comparison; the Screenshots rule | CLAUDE.md step 4 and the `full-verification-gate` skill ask for the targeted checks for what changed, with the PR pipeline as the full gate; the train allows the same per phase. This series keeps that |
| Mock-first | D67: build against a mock that passes the schema; swap behind the port | Exactly the series' provider principle; used as is |
| Issue forms | `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`; blank issues off | No slice form |

## Proposed Solution

Keep the train and add four things: a **slice** (the unit of work), a **groomer** session type that cuts slices just in time, a **decisions register** the agents poll, and a **status issue**. Everything else is the train.

1. **Slices.** Every PRD in the series ends with a "Slices" table (id, scope, depends on, parallel-safe, verification). One slice is one PR by one worker in one lane, small enough to finish in one session. Each slice has one GitHub issue created by the groomer shortly before it becomes ready.
2. **Lanes and the graph.** Slices carry a lane and dependency list. The overview's graph ([Studio Next Rebuild](studio-next-rebuild.prd.md)) fixes the serial spine; the rest fans out.
3. **A coordinator that never idles.** The existing pass (merge, reconcile, launch) plus a groomer launch whenever the ready queue is shallower than twice `TARGET`, and a stall rule.
4. **Workers that can be replaced mid-slice.** A slice issue carries a `## Handoff` comment the worker updates at every checkpoint, so a fresh session resumes from the repo and the issue alone.
5. **Owner decisions by register.** One issue holds each question with options, recommendation and default date; agents poll it at checkpoints; a default applies after seven days.

## Key Hypothesis

If every unit of work is sized for one session, specified in a machine-readable header, and gated by decisions that have a default, then a coordinator running every 30 minutes can keep `TARGET` workers busy for the length of the series without the owner in the loop, and a worker lost to a usage limit costs at most one checkpoint. We are wrong if more than 15% of slices need a second worker beyond the planned resume, or if the ready list is empty while slices remain unbuilt.

## What We're NOT Building

- A new scheduler, a database or a file of live state on `main`. State stays on issues ([Where state lives](../operations/agent-train.md#where-state-lives)).
- A replacement for the coordinator Routine, the usage bands or `TARGET` scaling.
- Auto-merge, force-push or rebase (denied by `.claude/settings.json`); workers never merge.
- A way for an agent to approve its own mocks, ADRs or REAPER verification (see "Guardrails").
- Per-token billing control: the only usage signal the train can read is the account-wide `rate_limit_info` ([Usage and autoscaling](../operations/agent-train.md#usage-and-autoscaling)); per-slice budgets are session counts and wall time.
- In-app agent features.

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Utilisation | Running workers equal `TARGET` on at least 90% of passes while ready slices exist | Status issue, one line per pass |
| Ready-queue depth | At least `2 x TARGET` groomed ready slices on 90% of passes | Status issue |
| Slice lead time | Median under 1 day from launch to merge; 90th percentile under 3 days | Issue timestamps |
| Resume cost | A replaced worker loses under 1 checkpoint of work | Handoff comment age at resume |
| Collisions | No two running slices edit the same file outside declared append-only rows | Merge conflicts needing a fixer, tracked per week |
| Red `main` | 0 merges that turn `main` red; if one occurs, `HOLD` within one pass | #509 log |
| Decision latency | Questions answered or defaulted within 7 days | Decisions register |

## Open Questions

- [ ] **SNA-Q1 (gate). One issue per slice, or per PRD?** The train uses one per PRD (`Part of #<n>`). (A) One per slice plus the PRD issue as parent (sub-issues, `mcp__github__sub_issue_write`). (B) Per PRD only. Recommendation: (A), as the owner asked.
- [ ] **SNA-Q2. May the groomer be a session type?** Mockup-design sessions are the precedent ([Mockup gates](../operations/agent-train.md#mockup-gates)). Recommendation: yes; it reads the code, so the coordinator does not.
- [ ] **SNA-Q3. Daily cap.** A cap on slices launched per day (default 12) in addition to `TARGET`. Recommendation: yes, switchable, because a bad template would otherwise spend a week's allowance in a day.
- [ ] **SNA-Q4. Lane U territory.** Add `apps/ui/src/studio/**`, `ports/**`, `overlay/**` to lane U? Recommendation: yes.
- [ ] **SNA-Q5. Default after seven days.** Is applying a recommended default after 7 days silent acceptable for non-ADR questions? Recommendation: yes for questions that do not change an accepted ADR; no for A1..A17 of the overview, which stay Proposed until the owner accepts.
- [ ] **SNA-Q6. Session cap per slice.** Planned 1, plus 1 resume and 1 fixer, then escalate. Recommendation: as stated.
- [ ] **SNA-Q7. Who captures Studio Next screenshots** when a worker has no network for `npm ci`? See SN0-Q8. Recommendation: the slice is not blocked; the PR lists the missing mock image and the owner supplies it from #510.

## Users & Context

The coordinator session (30-minute Routine), worker sessions (Sonnet default), groomer sessions (Sonnet, Opus for the contract PRDs), fixer sessions, and the owner (reviews, answers questions, merges are the coordinator's under D40). Sessions are cloud sessions on `https://github.com/countrymanprime/narration-utils` with the `SessionStart` hook installing the toolchain ([Tooling](../operations/agent-train.md#the-worker-protocol)).

## Solution Detail

### What a slice is

| Property | Rule |
| --- | --- |
| Size | One PR; one lane; one reason to change; at most about 600 changed lines excluding goldens and generated bindings and at most about 25 files; finishable in one session (a few hours) |
| Entry | Every dependency merged to `main`; every gate in its PRD answered or defaulted; `Files` and `Must not touch` declared; acceptance tests named; no running slice owns an overlapping file |
| Exit | PR merged with `Closes #<slice>`; its tests exist and pass; for UI, the Screenshots section; ADR written if a decision was settled; the PRD's slice and phase status cells updated in the same PR; `feature-cleanup` done |
| Ownership | Globs in the issue header. A slice may add rows to append-only files and declare the serial point it uses; otherwise it touches only its globs |
| Independence | Leaves `pnpm check` green on its own base; never relies on a later slice to be correct |
| Kinds | `spike` (writes `docs/research/` only), `adr` (docs only), `seam` (port or registry with contract tests), `page` (UI under a feature folder), `swap` (route replacement, deletes the old page), `host` (Go), `lua` (bridge command; harness test first), `docs` |

### The slice issue

Issue title: `SN-<code><n> <verb phrase>` (for example `SN-F2 Icon vocabulary and Icon wrapper`). Body fields (an issue form, SNA-1; labels `slice`, `lane:<L>`, `prd:<code>`, `ready`, `blocked`, `owner-decision`):

```text
PRD: studio-next-<name>.prd.md, slice SN-<code><n>   Parent: #<PRD issue>
Lane / model: <K|A|B|U|C|D|X> / <Sonnet|Opus|Haiku>   Kind: <spike|adr|seam|page|swap|host|lua|docs>
Depends on: #<issues>      Blocks: #<issues>      Serial points used: <hostAPIVersion|ADR number|nav|...>
Owns (globs):          Must not touch (globs):
Spec: <mock page file and state in studio-next/>; ruling rows: <repo-compare-decisions.md bullets>
Acceptance tests (named, written first):
Ports used: <DawClient, Pronunciation, ...>      Contracts: <schema names, golden files, wire.go rows>
Verification commands:          Screenshots: <none | states x viewports>
Owner steps (to #510):          ADRs: <labels A1..A17 and numbers>
Estimate (pw): <0.1-1>   Session cap: 1 + 1 resume + 1 fixer
```

The coordinator reads only this block and the labels. A fenced block `slice-meta` (YAML: `id`, `lane`, `kind`, `depends`, `owns`, `serial`) at the top lets it compute collisions without opening code.

### Lanes, graph and the serial spine

The spine (one at a time, in order) is: ADR batch A, the design token batch, the shell navigation and header slice, each `hostAPIVersion` bump, `.github/` changes, and the cutover. Everything else is leaf work. With the overview's gates:

| Phase of the program | Parallel capacity (workers) | What runs |
| --- | --- | --- |
| G0 decide | 3 to 4 | spikes (SND, SNX), ADR drafting, SNA slices |
| G0 to G1 seams | 4 to 6 | SNF primitives (lane U), SNS core (lane U proposed), SND Go and Lua (lanes K, B), SNR registries (lane U) |
| G1 to G2 pages | 6 to 8 | SNB, SNP, SNM, SNO, SNQ at once (lane C, disjoint feature folders); SNX host and sidecar (lanes A, B); SNE after its dependencies |
| G3 cutover | 1 to 2 | parity audit, deletes, docs |

Lanes stay K, A, B, U, C, D, X; two workers share a lane only if their `Owns` globs are disjoint (D48, [Lanes](../operations/agent-train.md#lanes)).

### The coordinator loop (extending the train's pass)

The train's pass is unchanged: switches, usage, reconcile, merge, launch, housekeeping ([The coordinator's pass](../operations/agent-train.md#the-coordinators-pass)). The series adds:

1. **Pick.** The ready list is computed from labels: `slice` and `ready`, every `depends` closed by a merged PR, no open slice whose `owns` overlaps (glob intersection), no unanswered `owner-decision` blocker, the program's wave reached. Order: the train's order (contracts first, resumes, unblockers, leaf features, docs, filler).
2. **Spawn.** `create_session` exactly as step 5.3 of the pass, with the worker template plus a `SLICE:` block that holds the issue number and says "the issue is the spec; read its Handoff comment first". Title `"N-<lane><n> SN-<code><n> <scope>"`, tags `["agent-train", "lane-<L>", "studio-next"]`.
3. **Monitor.** `get_session` buckets as in step 3. New: a session in `working` with no push, no issue comment and no PR event for 3 hours is stalled (proposal D-3).
4. **Merge and queue.** The train's merge rules unchanged (not draft, mergeable, `Build (Windows)` and `ui-dist` green, no 🔴 thread, Screenshots present for UI, squash with `expectedHeadSha`). After a merge the coordinator immediately re-checks the slices that depended on it (D62) and launches in the same pass.
5. **Stalls and failures.** Stalled: `interrupt_session`, then a resume session from the Handoff comment (resume template). Failed on usage: the train's pause path. Three failed CI rounds (the train's rule): draft PR, label `blocked`, one Opus fixer; a second failure goes to #510 with the failure pasted. A slice that exhausts its session cap is relabelled `blocked` and re-groomed (it was too big: split it).
6. **Groom.** If fewer than `2 x TARGET` ready slices exist and a PRD has slices in the table without an issue, launch a groomer: it opens the issues from the PRD's table, fills the header from the code (it may read it), marks `ready` those whose dependencies are merged, and ends.
7. **Hand-off.** Every slice issue ends with a `## Handoff` comment the worker rewrites at each checkpoint: done (SHAs), next step, failing check, commands run, files touched, decisions assumed. A fresh session needs only `CLAUDE.md`, the PRD slice row, the issue and the branch.

### The worker contract

The train's worker template ([Worker template](../operations/agent-train.md#worker-template)) with these fixed steps:

1. Plan; find the slice issue and branch from latest `main`.
2. `change-impact-scan` of every consumer of what the slice edits, and for Lua the harness tests per command (CLAUDE.md step 2, [`.claude/rules/reaper-bridge.md`](../../.claude/rules/reaper-bridge.md)).
3. Tests first, named in the issue; mock-first behind the port (D67).
4. Targeted checks per D43; `full-verification-gate` when the slice ends the stream (D44); look at every viewport's PNG; atlas for primitives; aria for dialogs.
5. `design-spec-guard`, `feature-cleanup` (threat model and diagrams where a boundary moved).
6. PR title a Conventional Commit; body: `Closes #<slice>`, `Part of #<PRD>`, what changed, checks run, **Screenshots** (mock | before | after at 1440x900, the other viewports in `<details>`, images on `pr-images/<branch>`), "New ADRs for review", "Base:". Ends with the attribution lines.
7. Subscribe; stay the owner of the PR until it merges (D82): merge `main` in on conflict, never rebase; fix red checks; answer review threads; hourly `send_later`.

### PR babysitting as a standing duty

Per D82 the worker babysits its own PR. The coordinator covers the cases the worker cannot: an archived or failed session with an open PR gets a one-PR fixer; a base recovered after a squash merge of its parent: the dependent slice's branch is stacked on the parent's, so after the parent squashes, the coordinator (or the worker) merges `main` into the child and retargets the PR base to `main` ("base recovered"), then waits for green. Red CI that is not the slice's fault (flaky test, a red `main`) is recorded on #509 and not retried more than twice.

### Cadence and budget controls

| Control | Mechanism | Status |
| --- | --- | --- |
| Concurrency | `MAX_WORKERS`, `MAX_OPUS_WORKERS`, `TARGET` | Existing |
| Usage bands | GREEN, AMBER-5H, AMBER-7D, RED | Existing |
| Program pause | `SN_HOLD`: stop launching studio-next slices only | Proposal D-5 |
| Daily cap | `SN_DAILY_CAP` slices launched per day, default 12 | Proposal D-4 |
| Per-slice budget | Session cap 1 + 1 resume + 1 fixer; a `spike` or `adr` slice 1 session | Proposal D-6 |
| Model spend | Sonnet by default; Opus for lane K, new Lua commands, semantic fixers | Existing |
| Kill | `HOLD` (existing) and `DRAIN`; `SN_HOLD` for the program | Existing and D-5 |

### Guardrails: what always needs the owner

An agent never does these; it writes the proposal, marks the PR or issue, and continues with other work (D65):

- Accept an ADR that changes an accepted decision (it writes `Status: Proposed`); A1..A17 of the overview.
- Change a trust boundary without the threat-model and `SECURITY.md` edits, and never accept the change itself ([threat model](../architecture/threat-model.md)).
- Any real-REAPER or Audacity verification step, any step needing audio hardware or the owner's recordings (pending on #510).
- Anything outward-facing: releases, signing, GitHub settings, Pages, outbound network calls added to the app, new downloads (needs the consent flow and the owner).
- Editing `.claude/settings.json`, `.github/workflows/**` (serial; owner review) or the train's procedure without owner approval.
- Marking its own mock as owner-approved; merging; dismissing a review.

### Quality ratchets

Each ratchet is a test that fails when a slice regresses it, so continuous merging cannot erode quality:

- Contract tests: every provider port runs one suite against the mock and the real adapter; a port without both fails.
- Wire contracts: new binding without schema, golden, row and passing mock fails `wireContracts.test.ts`.
- Visual suite, atlas, axe-debt, aria snapshots, collapsed-control and overflow checks as in [`.claude/rules/ui-visual-verification.md`](../../.claude/rules/ui-visual-verification.md).
- Lua harness with mutation entries; a command without a harness test fails the registry test.
- `rawNatives.test.ts` ceilings only fall; `knip` at zero dead code; architecture and import-boundary tests.
- A ruling-index test (Cutover) that fails when a ruling in the decisions seed has no test mapped.

### Observability

- **Status issue** "Studio Next status" (a new issue, rewritten by the coordinator when something changed): per PRD the counts of slices ready, in progress, blocked, merged; PR states; the session count as the cost proxy; the usage band and `TARGET`; the oldest ready slice; the critical path.
- **Daily summary** is the train's existing 09:00 America/New_York comment on #509, extended with slices merged, blocked and the forecast against the estimates.
- **Weekly report** to the owner on the status issue: velocity per lane, estimate versus actual, the list of waiting decisions.

### Owner decisions arriving

A **decisions register** issue ("Studio Next decisions"), one comment per question: id (for example SN0-Q2), the options, the recommendation, the default date, and the slices it gates. The owner answers by replying `decided: A` or with text. Agents read it at every checkpoint (as they read #509). `repo-compare-decisions.md` is the seed: its rulings are indexed once into the Cutover ruling table and are not re-asked. After seven days an unanswered question takes its recommendation, unless it is one of A1..A17; the coordinator comments the default and unblocks the slices. An answer that contradicts work already merged becomes a new slice, not a revert by an agent.

### Deviations from the agent train

| # | Deviation or extension | Why | Needs |
| --- | --- | --- | --- |
| D-1 | One issue per slice under the PRD issue; `Closes #<slice>` on each PR (the train: `Part of`, last PR closes) | Owner request; makes the ready list computable | Owner and a note in the train |
| D-2 | A groomer session type | The coordinator does not read code; slices need file-level headers | Owner; precedent: mockup sessions |
| D-3 | Stall rule: 3 hours without push, comment or PR event | The train handles failure and pause, not silent stalls | Owner |
| D-4 | `SN_DAILY_CAP` switch | A bad template should not spend a week in a day | Owner; ADR if kept |
| D-5 | `SN_HOLD` switch | Pause one program | Owner |
| D-6 | Session cap per slice | There is no per-slice token API | Owner |
| D-7 | Lane U territory adds `studio/`, `ports/`, `overlay/` | New directories have no lane | Owner; train edit |
| D-8 | Decisions register issue and 7-day defaults | About 40 open questions | Owner; ADR for the default rule |
| D-9 | Status issue | 150 slices do not fit #509 | Owner |
| D-10 | Worker template names Studio Next mock files as the spec (SN0-Q1) | The template names only the benchmark | Owner ruling on A1 |
| D-11 | A `slice` issue form and labels in `.github/` | Slice header must be uniform | Owner; `.github` is serial |

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth for the rebuild; an old ADR stays in force for code not yet migrated until the superseding ADR is merged ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0028](../adr/0028-planned-work-is-specified-as-prds-and-deleted-when-built.md) | KEEP | PRDs deleted when built; the series obeys it |
| [ADR 0029](../adr/0029-work-is-tracked-on-github-and-decided-in-the-repo.md) | EXTEND | Work tracked on GitHub: one issue per slice under the PRD issue (D-1) |
| [ADR 0410](../adr/0410-the-adr-index-is-generated-from-each-adrs-heading-and-status-line-and-a-stale-index-fails-the-gate.md) | KEEP | ADR index generated; ADR numbers allocated at merge time |
| [ADR 0415](../adr/0415-while-pages-is-paused-docs-are-checked-by-lychee-and-a-changed-file-markdownlint-not-by-building-the-site.md) | KEEP | Docs checked by lychee and changed-file markdownlint |
| D40, D43, D44, D62, D67, D82, D96, D97 (train rules, not ADRs) | KEEP / EXTEND | See the deviations table; D96 is DQ-1 |

## Technical Approach

Nothing here is application code. The changes are: a `slice.yml` issue form and label rows (`.github/ISSUE_TEMPLATE/`, `.github/labels.json`), edits to `docs/operations/agent-train.md` (templates, lanes, switches, a "Studio Next" queue wave), and prompts for the groomer and the slice worker kept in the same file. The slice header is parsed by the coordinator's prompt, not by new tooling; a small checker `scripts/dev/slice-lint.mjs` validates a pasted header (required keys, glob syntax, dependency issue numbers exist) and is run by the groomer. Risks: header drift (the linter), glob over-claiming that serialises everything (the groomer is told to claim narrow globs and to split slices instead), and the coordinator's own context size (it reads labels, not bodies).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Slice contract | Issue form, labels, header spec, `slice-lint`, templates for the worker `SLICE:` block | pending | 2 | SN0-1 | 0.8 | - |
| 2 | Groomer | Prompt, rules for cutting slices, first grooming of SNF and SNS | pending | 1 | SN0-1 | 0.6 | - |
| 3 | Train amendments | The accepted deviations in `agent-train.md` | pending | - | 1, owner | 0.6 | - |
| 4 | Decisions register | Register issue, seeding, polling rule in the worker template | pending | 1 | SN0-1 | 0.4 | - |
| 5 | Status issue and reports | Status issue, daily and weekly extensions | pending | 4 | 1 | 0.5 | - |
| 6 | Dry run | Run the train on SNF and SNS slices with `TARGET` 2 for a week; measure the metrics | pending | - | 1 to 5 | 1.0 | - |
| 7 | Ratchets | The ruling-index test hook, utilisation report, retrospective edits | pending | - | 6 | 0.5 | - |

### Phase Details

- **Phase 1.** Test: `slice-lint` fails on a missing `owns`, a glob that matches nothing, a cyclic `depends`. The form is reviewed against the bug and feature forms' conventions.
- **Phase 2.** The groomer is given the PRD, the code and the template; it ends after opening at most 12 issues. Success: a worker can start from an issue without asking.
- **Phase 3.** Each accepted deviation is a short section in the train; D-4 and D-8 need ADRs because they settle rules.
- **Phase 6.** The dry run is the acceptance test of this PRD: success metrics are read from the status issue.

### Parallelism Notes

Phases 1, 2 and 4 are docs and `.github` work in different files; Phase 3 waits for the owner. Phase 6 needs real slices from SNF and SNS.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 1 | `.github/ISSUE_TEMPLATE/slice.yml`, `.github/labels.json`, `scripts/dev/slice-lint.mjs` | `.github/**` changes (serial point) |
| 2 | `docs/operations/agent-train.md` (prompt section) | Any train edit |
| 3 | `docs/operations/agent-train.md` | Every other train edit; the coordinator reads this file each pass |
| 4, 5 | issues only | none |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNA-1 | Phase 1 | SN0-1 | yes | `slice-lint` tests; markdownlint; form renders |
| SNA-2 | Phase 2 | SN0-1 | yes | A groomed issue passes `slice-lint` |
| SNA-3 | Phase 3 | SNA-1, owner | no | Docs link check; owner review |
| SNA-4 | Phase 4 | SN0-1 | yes | Register issue has every SN0 and SNA question |
| SNA-5 | Phase 5 | SNA-1 | yes | Status issue renders counts for SNF |
| SNA-6 | Phase 6 | SNA-1..5, SNF-1 | no | Metrics table filled from the dry run |
| SNA-7 | Phase 7 | SNA-6 | yes | Report script output |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Fit the train, do not replace it (proposed) | Extend with slices, groomer, register, status | A new scheduler | The train works; owner asked for continuous running |
| State on issues (existing) | Slice header in issue bodies | A file on `main` | The train's rule: state never in a file on `main` |
| Defaults after seven days (proposed) | Recommendation applies unless an ADR is involved | Block forever | Keeps workers busy; ADRs stay owner-accepted |
| Mock-first (existing D67) | Slices build on mock adapters | Wait for hosts | Keeps parallel lanes busy |

## Research Summary

Read: `docs/operations/agent-train.md` in full (state, switches, usage bands, lanes, serial points, mockup gates, owner rules, coordinator pass, worker protocol, templates, queue), `docs/operations/github-workflow.md`, `docs/prds/implementation-plan.md` sections 1 and 3, `.claude/settings.json`, `.github/` (issue forms, labels, workflows), `CLAUDE.md`, `.github/pull_request_template.md`. Not done: no session was started, nothing was measured; the thresholds (3 hours, 600 lines, 12 per day) are proposals.

## Visual Spec

None. This PRD changes no UI. The UI slices it schedules carry the Screenshots section of [UI PRs show their screenshots](../operations/agent-train.md#ui-prs-show-their-screenshots).
