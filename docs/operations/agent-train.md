# The agent train

The agent train's procedure is the agent-train skill, [`.claude/skills/agent-train/SKILL.md`](../../.claude/skills/agent-train/SKILL.md): instructions that only automated coding tools follow live in `.claude/` ([Which document](../README.md#which-document)). Its templates are in [`references/templates.md`](../../.claude/skills/agent-train/references/templates.md) beside it, and the slice rules are in [`references/groomer.md`](../../.claude/skills/agent-train/references/groomer.md#slices).

A Routine or prompt that names this file runs one pass from `.claude/skills/agent-train/SKILL.md` on `main`; its index sends the coordinator to `references/coordinator.md`.

The headings below point to where each part lives.

## Which mocks are the spec

Each job's references are named by the coordinator ([References for a job](../../.claude/skills/agent-train/references/coordinator.md#references-for-a-job)).

## UI PRs update the how-to guide

In [CONTRIBUTING.md](../../CONTRIBUTING.md#ui-prs-update-the-how-to-guide), with the command that regenerates a page's guide images (`node scripts/dev/guide-screenshots.mjs`).

## Owner standing rules

In [the procedure](../../.claude/skills/agent-train/references/owner-rules.md#owner-standing-rules). The product rules are in [`.claude/rules/product-rules.md`](../../.claude/rules/product-rules.md).

## Safety net

In [the procedure](../../.claude/skills/agent-train/references/coordinator.md#safety-net).

## Serial points

In [the procedure](../../.claude/skills/agent-train/references/worker.md#serial-points).

## Lanes

In [the procedure](../../.claude/skills/agent-train/references/worker.md#lanes).

## The coordinator's pass

In [the procedure](../../.claude/skills/agent-train/references/coordinator.md#the-coordinators-pass).

## The worker protocol

In [the procedure](../../.claude/skills/agent-train/references/worker.md#the-worker-protocol).

## Worker template

In [the templates](../../.claude/skills/agent-train/references/templates.md#worker-template).
