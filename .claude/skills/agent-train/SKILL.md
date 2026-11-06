---
name: agent-train
description: "The agent train's procedure: the coordinator's pass, the worker protocol, lanes, serial points, the switches on issue 989, Studio Next slices, and the worker, resume and fixer templates. Load when running as the train's coordinator, a worker, groomer, fixer or mockup-drafting session, or when planning a phase for the train."
---

# The agent train

One **coordinator** and up to eight **workers** build the planned work in parallel Claude Code sessions. Read only the file for your role; the rules are the same ones as before, split so a worker does not load the coordinator's material.

| You are | Read |
| --- | --- |
| A worker, a resume session or a fixer | [references/worker.md](references/worker.md), then the prompt you were given ([references/templates.md](references/templates.md)) |
| The coordinator, running one pass | [references/coordinator.md](references/coordinator.md), [references/owner-rules.md](references/owner-rules.md), and [references/templates.md](references/templates.md) when launching |
| A groomer cutting slices | [references/groomer.md](references/groomer.md) |
| Planning a phase for the train | [references/worker.md](references/worker.md) (lanes, serial points) and [references/coordinator.md](references/coordinator.md#mockup-gates) |
| Looking for why the Studio Next series is delivered as slices | [references/studio-next-delivery.md](references/studio-next-delivery.md) |

Where the rules are:

| Rule | File |
| --- | --- |
| Where state lives; switches on #989; usage bands and `TARGET`; the safety net; the coordinator's pass; mockup gates; the queue | `references/coordinator.md` |
| The worker protocol; serial points; lanes; the how-to guide rule; which mocks are the spec | `references/worker.md` |
| The owner's standing rules (D-numbers) | `references/owner-rules.md` |
| Studio Next slices and the groomer | `references/groomer.md` |

`docs/operations/agent-train.md` points here. A Routine prompt that says to read the procedure reads `references/coordinator.md`. Changing the procedure is a normal pull request (`risk:high`, because it is under `.claude/`).
