# Agent train and context findings, November 2026

**Date:** 2026-11-03. **Refs:** #2251.

**Question.** What has Anthropic published about running many agents and about keeping context small, and where does our train fall short of it?

**Method.** Primary Anthropic pages fetched on 2026-11-03 (engineering posts, Claude Code and API docs). Sizes of our own files measured with `wc` and estimated at 4 bytes per token, so token figures are ±20%. Nothing in `.claude/` or `CLAUDE.md` was changed.

## 1. Findings

Docs pages carry no publication date; they are cited as "docs, fetched 2026-11-03". No secondary summaries are used below.

| # | Finding | Source, date | What it says | Applies to us? |
| - | - | - | - | - |
| F1 | Orchestrator-worker pays off for breadth | [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system), 2025-06-13 | Lead Opus 4 with Sonnet 4 subagents beat single-agent Opus 4 by 90.2% on an internal eval. Agents use about 4× the tokens of chat, multi-agent systems about 15×. | Yes. Our train is that shape; the 15× is the cost to manage. |
| F2 | Tokens explain most quality | Same | On BrowseComp, token use alone explained 80% of variance. | Partly. It argues against starving workers of context, so cut repeated text, not needed reading. |
| F3 | Brief each worker fully | Same | Each subagent needs an objective, output format, tool and source guidance, and task boundaries. Vague briefs caused duplicated work. | Yes. Our brief has all four; the problem is volume, not content. |
| F4 | Scale effort to the query | Same | Rules of 1 agent for simple facts, 2–4 for comparisons, 10+ for complex work; early versions spawned 50 for simple queries. | Yes. `TARGET` does this for load; nothing scales a worker's reading to its slice size. |
| F5 | Save the plan outside the window | Same | The lead saves its plan to memory because context past 200,000 tokens is truncated. Agents summarise finished work and start fresh subagents with handoffs. | Yes. Slice `## Handoff` comments and `## Resume notes` already do this for workers. |
| F6 | Parallel calls cut time | Same | Lead launches 3–5 subagents in parallel; subagents use 3+ tools in parallel; up to 90% less time. | Partly. Workers are parallel already. The coordinator's per-session `get_session` calls are serial. |
| F7 | Context is finite; aim for the smallest high-signal set | [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), 2025-09-29 | Recall falls as the window grows (context rot). Prompts should sit between brittle logic and vague guidance; start minimal and add on observed failure. | Yes. Basis for sections 2 and 3. |
| F8 | Just-in-time retrieval | Same | Keep identifiers (paths, queries) and load data with tools at run time. | Yes. Our workers read whole PRDs and a whole procedure file up front. |
| F9 | Tool-result clearing and compaction | Same; [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing), docs, fetched 2026-11-03 | Clearing old tool results is the "safest, lightest" compaction. API defaults: trigger at 100,000 input tokens, keep 3 tool uses. Clearing invalidates the cache, so `clear_at_least` should justify it. | Partly. These are API features; Claude Code compacts on its own. Applies to how we shape sessions (section 3), not to a setting we control. |
| F10 | Notes outside the window | Same | The agent writes notes to files and reads them back later. | Yes. #989 and the slice Handoff are our notes; #989's body is not used that way now (section 2). |
| F11 | Subagent isolation | Same | A subagent may spend "tens of thousands of tokens" and return a summary of "often 1,000–2,000". | Yes. The summary size is a good cap for fixer and reviewer reports. |
| F12 | Subagents start clean | [Subagents](https://code.claude.com/docs/en/sub-agents), docs, fetched 2026-11-03 | A subagent does not see the parent's history. It gets its own prompt, the delegation message, CLAUDE.md (unless `omitClaudeMd`), git status and listed skills. `model:` takes `haiku`, `sonnet`, `opus` or `inherit`. Use a subagent for high-volume output, the main thread for iterative work. | Yes. All seven of our agent definitions set `model: sonnet` already. |
| F13 | One feature per session, files as handoff | [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), 2025-11-26 | Compaction alone did not keep long projects on track. A progress file, a JSON feature list that agents may only flip, and git commits carried state. Sessions start by reading the log and running a smoke test. | Yes. This is D99 plus the slice model. The smoke-test-first step is missing from the worker template. |
| F14 | Resets versus compaction | [Harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps), 2026-03-24 | Resets (fresh agent plus handoff) were essential on Sonnet 4.5; on Opus 4.5 compaction was enough. Scaffolding was removed one piece at a time to find what was load-bearing. A full harness cost 20× a solo run for a better result. | Partly. Re-test our scaffolding when the model changes; do not assume it is still needed. |
| F15 | Start simple | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents), 2024-12-19 | Add complexity only when it is needed. Orchestrator-workers suits tasks whose steps cannot be predicted. | Partly. Our procedure has grown by accretion (section 2). |
| F16 | Progressive disclosure for skills | [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), 2025-10-16 | Only `name` and `description` load at start; the body loads when the skill is chosen; linked files load when read. Keep the core lean and put rarely used parts in separate files. | Yes. `agent-train/SKILL.md` is one 11k-token body for every role. |
| F17 | CLAUDE.md size and scoping | [Memory](https://code.claude.com/docs/en/memory), docs, fetched 2026-11-03 | Target under 200 lines. Move partial-codebase instructions to `paths:` rules. `@` imports do not reduce cost. Root CLAUDE.md survives `/compact`. | Yes, and we pass: 30 lines, five path-scoped rules. |
| F18 | Move workflow text from CLAUDE.md to skills | [Costs](https://code.claude.com/docs/en/costs), docs, fetched 2026-11-03 | Skills load on demand. Delegate verbose output to subagents. Use Sonnet for most work and Haiku for simple subagents. Clear between unrelated tasks. A scheduled task that fires in an idle session re-sends the full context each time. | Yes. Our CLAUDE.md is already thin; the scheduled-task point matters for the coordinator. |
| F19 | Prompt caching | [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), docs, fetched 2026-11-03 | Order is tools, system, messages. Reads cost 0.1× base input; writes 1.25× (5-minute TTL) or 2× (1-hour). A change to tools or system text invalidates the prefix. | Partly. Claude Code manages the breakpoints. We control only whether the coordinator's static procedure sits in a prefix that is still warm (section 2). |
| F20 | Tool design | [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), 2025-09-11 | Consolidate tools, return high-signal fields, offer concise and detailed formats, truncate with guidance (Claude Code caps tool output at 25,000 tokens). | Partly. We use GitHub MCP tools as given. It argues for scripts that return a small summary (section 3, C2). |

## 2. Gap analysis

### What loads when

| Item | Size | Loaded |
| - | - | - |
| `CLAUDE.md` | 30 lines, 1.6k tokens | Every session, automatically |
| 29 skill descriptions | 2.0k tokens | Every session |
| Five `.claude/rules/*.md` | 3.3k tokens in all | By path; a UI worker meets three or four |
| `agent-train/SKILL.md` | 324 lines, 11.0k tokens | Whole body when a worker or the coordinator loads it |
| `agent-train/references/templates.md` | 2.0k tokens; worker block 1.7k | Coordinator at each launch; the worker block is pasted into every brief |
| `agent-train/references/slice-delivery.md` | 7.5k tokens | When followed from a link |
| All 29 skill bodies | 40.3k tokens | On demand |
| The 11 skills `CLAUDE.md` steps 1–6 name | 12.3k tokens | A worker doing a full feature loads most of them |
| All 7 agent definitions | 4.6k tokens | Per invocation |
| Median Studio Next PRD | 25.7k bytes, about 6.4k tokens (14 PRDs, 378 KB) | Brief says read "in full" |

A UI worker therefore reads about 1.6k + 2.0k + 1.7k + 11.0k + 6.4k = 22.7k tokens before it opens the slice issue, and up to 12.3k more as the workflow skills load. That is roughly 35k tokens of fixed reading per worker, repeated for each of up to eight workers, each resume and each fixer that loads the skill.

### G1. One procedure file serves four roles

The worker is told to read three sections: "The worker protocol" (1.1k tokens), "Serial points" (0.3k) and "Lanes" (0.5k). That is 1.9k of 11.0k, so about 83% of what a worker loads (9.1k tokens) is coordinator-only (usage bands, safety net, merge conditions, Studio Next grooming) or history. F16 says to split by what is read when.

| Section | Tokens | Reader |
| - | - | - |
| Owner standing rules | 2.0k | Both; 2.9 KB of it is rows marked superseded, lifted or retired |
| Coordinator's pass | 1.6k | Coordinator |
| Studio Next slices | 1.1k | Coordinator, groomer |
| Safety net | 1.0k | Coordinator |
| Usage and autoscaling, Switches | 1.1k | Coordinator |
| Mockup gates, Which mocks, Queue | 1.1k | Coordinator |

### G2. The worker protocol contradicts itself

Lines 304–307 of `SKILL.md` still tell a worker to subscribe to its PRs, stay subscribed and own them until merge (D82). The D99 row two screens earlier, and the worker template's FINISH paragraph, say the opposite: one-shot, do not subscribe, a fresh fixer handles red checks. A worker that follows the protocol section it was told to read keeps a session alive, which is the cost D99 removed (the costs doc, F18, says an idle session re-sends its full context on every event). The same section's "Checkpoints" step makes each worker read #989 and #993 before every phase, which is fine; the stale finish is not.

### G3. The brief repeats what the worker already has

The worker template is 1.7k tokens. By inspection, about half restates text the worker also gets from `CLAUDE.md`, `SKILL.md` or a skill:

- "READ FIRST: CLAUDE.md" (already auto-loaded).
- MISSING TOOLS (about 190 tokens), which is also in `SKILL.md` line 311 with the same `apt-get` line.
- OPEN THE PR EARLY and FINISH, which repeat the protocol.
- TESTING, WIRE CONTRACTS and OWNER RULES, which duplicate `full-verification-gate`, `wire-contract-change` and the standing-rules table.

The footer line ("Generated by Claude Code") appears four times across `SKILL.md` and the templates. Duplicated text is also a drift risk: G2 is an example.

### G4. The coordinator re-derives state every pass

- It fires every 30 minutes (two hourly Routines, `SKILL.md` line 233), so 48 passes a day. Each reads the 11.0k-token procedure plus, at launch, the 2.0k templates: about 0.5M input tokens a day of text that never changes between passes. Whether that is cached depends on how the Routine is bound; a 30-minute gap is past the 5-minute default TTL (F19), so assume a re-write most passes.
- It calls `get_session` once per running session (up to eight) and `get_session` for usage, then lists PRs and their checks, every pass, even when nothing changed.
- #989's body, which the procedure says the coordinator rewrites and which carries switches, lanes, the Launches table and the `Last pass:` line, reads `placeholder` as fetched on 2026-11-03 (the issue has 186 comments, last updated 2026-10-25). Either live state has moved elsewhere or the train has been quiet since. The train-health check and the launch-limit table both depend on that body, so this needs an owner answer before any of C2–C3 is built.
- If a Routine resumes one long session instead of starting a new one, its context grows every firing (F18, F9). The procedure does not say which; check the Routine's binding.

### G5. Model choice per role is written down for workers only

Workers have a model table by lane (Opus for K and X, Sonnet default, Haiku for bookkeeping). The coordinator, the intent reviewer (Sonnet by the Safety net) and the fixers (Sonnet or Opus) are partly specified. The coordinator's model is not, though its work is a rules-driven state machine, not open-ended reasoning. F1 and F18 put Opus on the part that needs judgment and a cheaper model on mechanical parts.

### G6. Smaller gaps

- **Skills:** the largest bodies are `frontend-primitives` (8.8 KB), `nx-pnpm-workspace` (8.1 KB) and `sidecar-freeze` (7.1 KB). Only `agent-train` has a `references/` split; `scripts/ci/skill-evals.mjs` checks triggering for four skills and does not check what a skill costs.
- **No smoke test first:** F13's start routine (run the app, check the last session's work) is absent from the worker template; CI is the only check.
- **Tool output:** fixers read CI logs through `get_job_logs`; nothing caps what comes back (F20).

## 3. Proposed changes, ranked

Benefit is the saving or risk removed; effort is small (under a day), medium or large. Every item changes `.claude/`, which `pr-risk` labels `risk:high`, so the owner approves each.

| Rank | Change | Expected benefit | Risk | Effort |
| - | - | - | - | - |
| C1 | **Fix the D82/D99 contradiction.** Rewrite lines 304–307 of the worker protocol to the one-shot finish; delete the D82 row's body, leaving a pointer. | Removes a live instruction that keeps workers alive and burning credits; about 0.3k tokens saved. | Low. The owner already decided D99. | Small |
| C2 | **Split `agent-train/SKILL.md` by role** (F16): keep a worker file (protocol, serial points, lanes, the finish rules; about 2k tokens) and move coordinator material to `references/coordinator.md`, grooming to `references/groomer.md`, history to the existing delivery reference. `SKILL.md` becomes a short index. | Workers load about 2k instead of 11k tokens: about 9k tokens saved per worker, resume and fixer start. At 12 slices a day plus resumes and fixers that is on the order of 150k tokens a day. | Medium. A worker that needs a coordinator rule no longer sees it, and the `description:` trigger text and links from other docs must be updated. `pnpm run eval:skills` covers triggering only. | Medium |
| C3 | **Cheaper coordinator pass.** (a) Use one `list_sessions` call (tag `agent-train`) and call `get_session` only for sessions whose status changed. (b) Read the procedure's merge and launch parts only when a PR is ready or a slot is free; otherwise stamp `Last pass:` and end. (c) Skip the usage read on `HOLD`. | Most passes find nothing to do. An early-exit pass should cost a fraction of today's 11k-token read plus up to nine calls. | Medium. A missed change is a stalled train; the existing train-health check (2-hour stale rule) is the backstop. Verify `list_sessions` returns `status_bucket` first. | Medium |
| C4 | **A state block the coordinator maintains**, in #989's body (not a file on `main`, which the procedure forbids): one JSON block with the last-seen status of each session, the Launches table, `TARGET`, band and the oldest ready slice. The pass diffs against it instead of re-deriving. Resolve the `placeholder` body first (G4). | Makes C3 possible; also gives a resumed coordinator the F5/F13 progress-file pattern. | Medium. Body and reality can diverge; the JSON must be rewritten on each change and read from the issue, never trusted over a live `get_session` for a merge decision. | Medium |
| C5 | **Slim the worker brief to the fields that change.** Keep ID, lane, scope, slice, mock page, owned files and never-touch list; replace the fixed paragraphs with "follow the worker file and the named skills". Target under 0.6k tokens. | About 1.1k tokens per brief, and one place to edit rules instead of four (G3). | Medium. Cloud workers may rely on a repeated line (for example MISSING TOOLS) that prevented a past failure; keep any line that cites an incident. | Small |
| C6 | **Prune superseded rows** in Owner standing rules (D75, D82, D91, D96 and the superseded halves of D69, D97): keep a one-line pointer to the decision's issue comment. | About 0.7k tokens (2.9 KB) off every coordinator pass and, until C2, every worker. | Low. History stays in #993 and git. | Small |
| C7 | **Decide the coordinator's model and vary the read-only agents.** All seven agent definitions already set `model: sonnet`. Try Haiku for `standards-auditor` and `phase-planner` (read-only, report-shaped), and put the coordinator on Sonnet with Opus only for semantic conflict fixers. Compare one week of passes before and after. | Largest per-token saving per role; F1 and F18 support the split. | Medium. A cheaper coordinator may mis-order merges; keep the merge conditions as a short checklist and keep intent review in a separate session. | Small to try |
| C8 | **Cap what subagents and fixers return.** Fixer and reviewer prompts ask for a report of at most about 1,500 tokens (F11) and a log tail, not the full log; the fixer brief carries the failing job name and the last 80 lines. | Smaller coordinator and fixer context per red PR. | Low. | Small |
| C9 | **Workers read the slice first, the PRD by section.** Replace "each PRD in scope, in full" with the slice's linked sections (F8). A 25.7 KB median PRD becomes the one or two sections the slice cites. | Up to about 5k tokens a worker. | Medium. A slice header that omits a needed constraint now fails silently; `slice-lint` could require a `prd-sections` field. | Medium |
| C10 | **Start each worker with a smoke test** (F13): run the one cheapest check on the branch tip before new work. | Catches the previous session's breakage before a new session stacks on it. | Low; costs one check per start, so keep it to the fastest one. | Small |
| C11 | **Context hygiene rules in the worker file.** Run `/compact` with instructions ("keep the failing check, files touched, next step") only at a checkpoint after a large test output; otherwise end the session and let the Handoff carry state (already D99). Add `Compact instructions` to `CLAUDE.md` so the summary keeps what matters. | Prevents a long phase from re-sending a bloated window; makes compaction predictable (F9, F18). | Low. | Small |

Suggested order: C1, C6 and C8 first (low risk), then C2 with C5, then C4 with C3, then C7 after a week of numbers.

## 4. What not to change

- **State on issues, not a file on `main`.** It avoids merge conflicts between workers (`SKILL.md` "Where state lives"). C4 keeps this.
- **Root `CLAUDE.md` and the path-scoped rules.** At 30 lines and five `paths:` rules it already meets the under-200-lines target (F17). A smaller file buys little.
- **One-shot sessions (D99).** F13 and F14 favour clean sessions with a handoff over long-lived ones. Fix the contradiction (C1), not the rule.
- **Independent review in a fresh session.** The intent review and the walkthrough agents work because they do not share the author's context (F12). Do not fold them into the worker.
- **The `description:` lines of the 29 skills.** At 2.0k tokens they are the cheap always-on layer (F16); trimming them risks missed triggers. Re-run `pnpm run eval:skills` after any edit.
- **The safety net and the launch limit.** They guard failures the train has had, and none of the findings argues for relaxing them.
- **Fan-out up to `TARGET`.** F1 and F6 favour parallel workers for breadth. Cut repeated reading before cutting concurrency.
- **Scaffolding, until re-tested.** F14 says to remove a piece at a time and measure. Do that after a model change; do not delete the evaluator-style reviews on this note's say-so.

## Not measured

Real token counts per worker and per coordinator pass: the figures above are file sizes at 4 bytes per token. The Routine's session binding, the coordinator's configured model and #989's live state were not visible from this session. A week of `/usage` attribution (skills, subagents, plugins) for the coordinator and two workers would replace the estimates.
