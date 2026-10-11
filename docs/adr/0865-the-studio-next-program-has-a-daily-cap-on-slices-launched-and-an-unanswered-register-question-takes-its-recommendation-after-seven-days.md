# 0865. The Studio Next program has a daily cap on slices launched, and an unanswered register question takes its recommendation after seven days

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none

## Context

The Studio Next program runs on the agent train ([ADR 0758](0758-the-agent-train-is-watched-from-outside-and-gated-by-checks-a-worker-cannot-edit.md)) with one issue per slice, under the program PRD [studio-next-agent-delivery.prd.md](../prds/studio-next-agent-delivery.prd.md). Two gaps showed up when that PRD was written:

- Nothing limited how many slices the coordinator launched in a day. A slice template with a defect would be launched against every ready slice before anyone could see it. The PRD's deviation D-4 and question SNA-Q3 ask for a cap.
- Owner questions that arise while slices run had no home and no deadline, so a slice waiting on an answer stayed blocked. The PRD's D-8 and SNA-Q5 ask for one register and a default.

The coordinator already follows both rules. Issue #989 carries `DAILY_CAP: 12 slices launched per day`, and issue #993 is the decisions register. This ADR records the rules; it changes neither issue. Writing them into `docs/operations/agent-train.md` is the next slice (SN-A31).

## Decision

**Daily cap.** The train has a switch, `SN_DAILY_CAP`, set on issue #989.

- It counts slices launched, not merged, per UTC day. A resumed session or a fixer for an already-launched slice does not count.
- It defaults to 12.
- The coordinator and the owner may change it by editing the switch on #989.
- At the cap the coordinator launches no new slice for the rest of the UTC day. It keeps merging green pull requests and fixing red ones.

**Seven-day default.** Issue #993 is the decisions register, one comment per decision.

- A question raised after the initial rulings is a comment with the options, the recommendation and the default date. The owner answers by replying `decided: A` or with text.
- If the question is unanswered after seven days, it takes its recommendation. The coordinator comments the default on the question and unblocks the slices that waited on it.
- The rule never applies to a question that would change an accepted ADR, and never to A1..A17 of the Studio Next overview. Those stay Proposed until the owner accepts them. The coordinator flags such an item to the owner and does not block other slices on it.
- An answer that contradicts merged work becomes a new slice. An agent does not revert the merged work.

**Scope.** The cap and the seven-day rule bind the Studio Next program only. `SN_HOLD`, the switch that stops launching Studio Next slices (D-5), is not decided here.

## Consequences

- A defective slice template spends at most 12 launches before the next UTC day, and the owner or coordinator can lower the cap in between.
- Slices waiting on a minor question no longer stall on an owner who is away; the cost is that a default may later be overruled, and the overrule costs a new slice.
- The cap counts launches, so a day of failed slices uses the budget the same as a day of merged ones.
- Because the rules live on #989 and #993 until SN-A31 lands, a change to either is an issue edit, not a code change. To replace the rules themselves, write a new ADR that supersedes this one.
