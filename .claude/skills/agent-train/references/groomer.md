# Studio Next slices and the groomer

Read by the coordinator and by a groomer session. Workers read only their own slice issue.

## Studio Next slices

The Studio Next series is delivered as slices, one PR by one worker each. This section is the operating rule. [Agent Delivery](studio-next-delivery.md#deviations-from-the-agent-train) holds the deviations D-1 to D-11 and the reasons, and [the slice issue](studio-next-delivery.md#the-slice-issue) holds the header's fields.

- **One issue per slice (D-1).** It is a sub-issue of its PRD's issue, titled `SN-<code><n> <verb phrase>`. The PR body says `Closes #<slice>`, and one more `Closes` line for any other issue it fully resolves.
- **The header.** A fenced `slice-meta` block with `id`, `lane`, `kind`, `depends`, `owns` and `serial`, checked by `scripts/dev/slice-lint.mjs`. The issue form is `.github/ISSUE_TEMPLATE/slice.yml`. The coordinator reads the header and the labels, never the code.
- **Labels:** `slice`, `lane:<L>`, `prd:<code>`, and one of `ready`, `blocked` or `owner-decision`.
- **Ready.** A slice is ready when every issue in its `depends` is closed and no other slice in progress has an overlapping `owns`. A slice waiting on an unanswered `owner-decision` is not ready.
- **Slice kinds.** The groomer cuts no `adr` slices. An open product question is answered in the PRD's decisions log or put to the owner on the decisions register; the whole-repo decisions are in `docs/adr/` and a slice does not add one.
- **A spike slice** writes a research note in `docs/research/` only when its findings outlast the slice. The note carries a date, the question, the method and the findings, and no slice, stream or lane header; the slice issue links the note, not the other way round. Findings that only the slice needs go in the slice issue.
- **An audit or checklist for one PR** is a comment on that PR or its issue, not a file.
- **A swap slice** replaces its page and deletes the old page and what only it used, in the same PR with no flag (D98). Its `owns` lists the files it deletes.
- **Handoff.** Every slice issue has a `## Handoff` comment that the worker rewrites at each checkpoint: done, next step, failing check, files touched, decisions assumed. A resume session starts from it and the branch.
- **The groomer (D-2).** A session type for cutting slices, like the mockup-drafting session. It opens issues from a PRD's slice table (a PRD without one, under the [PRD template](../../../../docs/prds/README.md#prd-template), is cut from its phases, and its slices exist only as issues), fills each header from the code (it may read the code; the coordinator doesn't), runs `slice-lint`, marks `ready` the slices whose dependencies are merged, and ends. The coordinator launches one when fewer than 2 x `TARGET` ready slices exist and a PRD has slice rows, or phases, with no issue.
- **A stalled worker (D-3).** A session in `working` with no push, no issue comment and no PR event for 3 hours is stalled. `interrupt_session`, then start one resume session from the Handoff comment.
- **A session stuck on a permission prompt** follows the fallback on #989, unchanged: relaunch up to two more times, then the coordinator runs the slice itself with a background agent under the same session cap.
- **An idle worker** can't be messaged. Idle with no PR gets its one resume session from the pushed branch. Idle with a conflicted or red PR gets a fixer straight away.
- **Merges that don't wait for CI.** On 2026-10-11 the owner directed the coordinator to merge train PRs without waiting for CI and to reconcile `main` in batches of four or five merges. A reconciliation session reproduces the red checks locally, fixes them in one PR, and logs on #1119 what it fixed and what it could not run; the next `main-health` run is the check for those. This is the owner's direction on #1119, not one of the merge conditions in step 4 of [the pass](coordinator.md#the-coordinators-pass).
- **The decisions register (D-8).** #993 holds one comment per decision. A later question is a comment with the options, the recommendation and the default date; the owner answers `decided: A` or with text. After seven days an unanswered question takes its recommendation, and the coordinator comments the default and unblocks the slices that waited. The rule never applies to a question that would change an accepted ADR or to A1..A17 of the overview. Those stay Proposed until the owner accepts them. Workers read the register at every checkpoint.
- **The status issue (D-9).** "Studio Next status", which the coordinator rewrites when something changed: per PRD the counts of slices ready, in progress, blocked and merged, the oldest ready slice, and the critical path.
