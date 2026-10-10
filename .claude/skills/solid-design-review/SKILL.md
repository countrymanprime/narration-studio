---
name: solid-design-review
description: Applies SOLID principles to a plan before code (pass 1, a Design check table) and to the result after (pass 2, a drift review), iterating until each principle is met or has a recorded waiver. Use during planning and before feature-cleanup.
---

# solid-design-review

## Why this exists

This repo already enforces part of its design with tools: depguard fences, dependency-cruiser rules, the 800-line file ceiling and `*port` packages. This skill makes SOLID an explicit step for the rest, and gives a place to record why a principle is not followed.

## When to use this

Pass 1: after a plan is drafted and before any code (workflow step 1 in `CLAUDE.md`). Pass 2: after implementation and before `feature-cleanup`. Skip both for a typo, a doc-only change or a one-line fix with no new type, interface or dependency. It applies to new code and code the change touches; it does not start a repo-wide refactor.

## Pass 1: Design check

Add a table to the plan with one row per planned file or package and a status for each principle: **met**, **at risk** (with the fix) or **waived** (with the reason).

| Principle | Go | Python | TypeScript |
| --- | --- | --- | --- |
| Single responsibility | One reason to change per package or file; do not grow the root package or `app.go` | One responsibility per module in `narration_common` and each sidecar `core/` | One concern per component or hook |
| Open/closed | Extend through ports and registries, not by editing switches | `Protocol`s or registries, not `if/elif` chains | Props and variants, not forked components |
| Liskov | An implementation (and its test fake) honours the port's documented behaviour | Subtypes keep `Protocol` contracts | Components keep their prop contracts |
| Interface segregation | Small interfaces defined at the consumer | Narrow `Protocol`s | Narrow props; do not pass whole objects through |
| Dependency inversion | Depend on `*port` packages; respect the depguard fences | Depend on `Protocol`s, not a concrete sidecar module | Depend on `apps/ui/src/api`, not Wails bindings or `zod` directly |

## Pass 2: drift review

1. Diff the result against the Design check. Objective signals first: depguard, `pnpm --dir apps/ui architecture` and lint results, imports across a port or fence, files past 800 lines, an interface that grew, a package that gained a second reason to change.
2. Judgement findings second, each tied to a line in the diff. Do not report a principle as violated without pointing at the code.
3. Send findings back to the plan and fix. Repeat until every row is met or waived. After three rounds, stop and give the owner the open rows.

## Waivers

A valid waiver names the principle, the concrete cost of complying and what would make us revisit. Put it in a **Design waivers** table in the PR body. A structural or permanent exception becomes an ADR (`adr-author`). The review is advisory: depguard and dependency-cruiser fail the build, a judgement finding needs a fix or a waiver.

## What this skill is not

The behaviour the app promises is in `design-principles`. It is not a style guide and does not replace code review. It does not demand an interface for every type: a principle that adds indirection with no second implementation, test seam or boundary to justify it is a valid waiver.
