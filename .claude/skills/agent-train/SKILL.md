---
name: agent-train
description: "The agent train's procedure: the coordinator's pass, the worker protocol, lanes, serial points, the train issue and its switches, the owner board, slices, and the worker, resume and fixer templates. Load when running as the train's coordinator, a worker, groomer, fixer or mockup-drafting session, or when planning a phase for the train."
---

# The agent train

One **coordinator** and up to eight **workers** build one goal in parallel Claude Code sessions; several trains can run at once, each with its own issue. Read only the file for your role; each role loads only its own material.

| You are | Read |
| --- | --- |
| A worker, a resume session or a fixer | [references/worker.md](references/worker.md), then the prompt you were given ([references/templates.md](references/templates.md)) |
| The coordinator, running one pass | [references/coordinator.md](references/coordinator.md), [references/owner-rules.md](references/owner-rules.md), and [references/templates.md](references/templates.md) when launching |
| A groomer cutting slices | [references/groomer.md](references/groomer.md) |
| Planning a phase for the train | [references/worker.md](references/worker.md) (lanes, serial points) and [references/coordinator.md](references/coordinator.md#mockup-gates) |

Where the rules are:

| Rule | File |
| --- | --- |
| Where state lives; one issue per train; the owner board; switches; usage bands and `TARGET`; the safety net; the coordinator's pass; references for a job; mockup gates; the queue | `references/coordinator.md` |
| The worker protocol; the order of work; serial points; lanes; the how-to guide rule; what a job builds to | `references/worker.md` |
| The owner's standing rules for the train (D-numbers); the product rules are in `.claude/rules/product-rules.md` | `references/owner-rules.md` |
| Slices and the groomer | `references/groomer.md` |

`docs/operations/agent-train.md` points here. A Routine prompt that says to read the procedure reads `references/coordinator.md`. Changing the procedure is a normal pull request (`risk:high`, because it is under `.claude/`).
