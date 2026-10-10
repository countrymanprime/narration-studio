---
name: design-spec-guard
description: Checks a proposed change against recorded ADRs and the design-system reference before/during a refactor, and flags anything that contradicts a decision unless it's explicitly listed in an approved plan.
---

# design-spec-guard

## Why this exists

Agentic refactors on this repo have a history of silently reverting deliberate decisions — a modal's width gets "cleaned up" back to an arbitrary value, a button row gets re-aligned "for consistency" in the wrong direction, a filter gets removed because it looked redundant — because the agent doing the refactor had no way to know the current state was intentional. `docs/adr/` exists to make those decisions durable and checkable. This skill is the check.

## When to use this

Invoke before starting a refactor that touches:
- `apps/ui/src/components/primitives/` (Dialog, Button, MeterBar, Panel, Field, Tooltip, etc.)
- `apps/ui/src/styles.css`
- Anything the design-system reference or an ADR names a specific file/behavior for

Also invoke mid-refactor if a diff is about to touch one of those files and you're not sure whether the change conflicts with a recorded decision.

## What to do

1. Start from `decision-index` for the topics the change touches (`ui-primitives-and-design-system` at least), then read the full text of every ADR whose title or file-references look relevant to the change under consideration. Do not skip based on the title alone — read the Decision and Consequences sections.
2. Read `docs/design/design-system.md` for the current-state conventions (tokens, primitive components, the CSS layering gotcha, the interaction conventions section).
3. Compare the proposed change against what you just read. For each ADR/convention that the change would contradict:
   - If the change is **explicitly listed** in an approved plan file (the plan the user is currently executing), it's allowed — the plan itself is the record of an intentional supersession, and a new ADR should be written afterward if the decision is meant to stick (use `adr-author` for that).
   - If it is **not** listed in an approved plan, stop and surface the conflict to the user before proceeding: name the ADR, quote the specific Decision line it contradicts, and ask whether this is an intentional change (in which case supersede the ADR) or an accidental regression (in which case don't make the change).
4. Never silently "fix" a change to match an ADR without telling the user — the point is visibility, not auto-correction.

## Rules the gate already checks (do not re-check by hand)

Run `pnpm --dir apps/ui architecture` and `pnpm --dir apps/ui exec vitest run src/highlightBoundary.test.ts src/baseUiBoundary.test.ts src/rawNatives.test.ts` instead of reading for these (ADR 0062, ADR 0047, ADR 0053): a primitive (story or test too) never imports a feature folder; only `src/api/` imports `wailsjs/`; only primitives import Base UI or write a native `button`, `select`, `input`, `textarea` or `table`; only `Highlight` writes `<mark>` (one reasoned exception, ADR 0063, Proposed). Spend the read on what they cannot judge: which tokens, which look, whether a new primitive is really needed.

## What this skill is not

It does not review code quality, security, or correctness — that's `code-reviewer`/`security-reviewer`. It only checks for contradictions with `docs/adr/` and `docs/design/design-system.md`.
