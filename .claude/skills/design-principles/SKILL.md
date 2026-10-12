---
name: design-principles
description: Check a plan against the design principles this app's decisions add up to (docs/architecture/principles.md), each with the ADRs behind it and the question to ask of a plan. Load when planning or designing a feature, reviewing a design, or deciding between approaches, before writing code.
---

# design-principles

## Why this exists

The ADRs hold the decisions, but a plan needs the rules they share: findings suggest and never execute, nothing runs without a click, unknown stays unknown. Without them each plan rediscovers the rules, or breaks one that a different ADR set a month ago. [The design principles](../../../docs/architecture/principles.md) state each rule once, with the ADRs behind it and the question that tests a plan against it; this skill is how a plan is checked against them. When that page and an ADR disagree, follow the ADR and fix the page.

## When to use this

- After a plan is drafted and before any code (step 1 of `CLAUDE.md`), alongside `solid-design-review`. SOLID checks the shape of the code; this checks the behaviour the app promises.
- Choosing between two designs, or reviewing someone else's.
- Deciding whether a new behaviour needs an ADR.

Skip it for a typo, a doc-only change or a one-line fix.

## What to do

1. Read [the principles](../../../docs/architecture/principles.md) and pick the ones the change touches. Most changes touch two to four.
2. For each, answer its question in the plan. Add a **Principles check** table next to the Design check: one row per principle touched, **met**, **at risk** (with the fix) or **waived** (with the reason and what would make you revisit), as `solid-design-review` does.
3. Use `decision-index` to read the Accepted ADRs for the topics the change touches. A principle is a summary; the ADR is the rule.
4. If a principle has to be broken, that is a decision: write the waiver in the PR, and write an ADR (`adr-author`) when it is permanent.
5. If a plan needs a rule that is not on that page and is not an ADR, say so. A rule that three plans have needed is a candidate for an ADR.

## What this skill is not

It does not hold the principles (`docs/architecture/principles.md` does). It is not a code style guide or a SOLID review (`solid-design-review`), and it does not find the ADRs for a change (`decision-index`). It does not replace reading an ADR's Decision before relying on it.
