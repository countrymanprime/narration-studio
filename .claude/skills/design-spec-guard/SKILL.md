---
name: design-spec-guard
description: Checks a proposed UI change against the design-system reference, its visual and interaction tests and the architecture ADRs before/during a refactor, and flags anything that contradicts them unless it's explicitly listed in an approved plan.
---

# design-spec-guard

## Why this exists

Agentic refactors on this repo have a history of silently reverting deliberate decisions — a modal's width gets "cleaned up" back to an arbitrary value, a button row gets re-aligned "for consistency" in the wrong direction, a filter gets removed because it looked redundant — because the agent doing the refactor had no way to know the current state was intentional. The look and behaviour are recorded in `docs/design/design-system.md` and the user guide and pinned by the visual, atlas and interaction tests; the architecture under them (primitives wrapping Base UI, the token system) is recorded in ADRs. This skill is the check.

## When to use this

Invoke before starting a refactor that touches:
- `apps/ui/src/components/primitives/` (Dialog, Button, MeterBar, Panel, Field, Tooltip, etc.)
- `apps/ui/src/styles.css`
- Anything the design-system reference or an ADR names a specific file/behavior for

Also invoke mid-refactor if a diff is about to touch one of those files and you're not sure whether the change conflicts with a recorded decision.

## What to do

1. Read `docs/design/design-system.md` for the current-state conventions (tokens, primitive components, the CSS layering gotcha, the interaction conventions section), and the user guide page for any behaviour the change touches.
2. Find the tests that pin what the change touches: the visual suite, the atlas and the aria snapshots (`.claude/rules/ui-visual-verification.md`), and the component's own Vitest file. A change those tests would fail is a contradiction even if no document names it.
3. Read the ADRs for the architecture: start from `decision-index` for `ui-primitives-and-design-system`, and read the Decision and Consequences of each ADR whose title or file references look relevant, not just the title. Many older ADRs in that topic record a single width, alignment or key; they still describe the current code until the owner's ADR audit moves them, so treat them as part of the current state. An ADR whose Status is `Moved to <path>` is history: read the path it names instead.
4. Compare the proposed change against what you just read. For each convention, test or ADR the change would contradict:
   - If the change is **explicitly listed** in an approved plan file (the plan the user is executing), it's allowed — the plan itself is the record of an intentional change. Afterwards, update the design system, the user guide or the test to match; write a superseding ADR (`adr-author`) only when the contradicted record is an ADR that is not moved.
   - If it is **not** listed in an approved plan, stop and surface the conflict to the user before proceeding: name the document, test or ADR, quote the specific line it contradicts, and ask whether this is an intentional change or an accidental regression (in which case don't make the change).
5. Never silently "fix" a change to match a recorded decision without telling the user — the point is visibility, not auto-correction.

## Rules the gate already checks (do not re-check by hand)

Run `pnpm --dir apps/ui architecture` and `pnpm --dir apps/ui exec vitest run src/highlightBoundary.test.ts src/baseUiBoundary.test.ts src/rawNatives.test.ts` instead of reading for these (ADR 0062, ADR 0047, ADR 0053): a primitive (story or test too) never imports a feature folder; only `src/api/` imports `wailsjs/`; only primitives import Base UI or write a native `button`, `select`, `input`, `textarea` or `table`; only `Highlight` writes `<mark>` (one reasoned exception, ADR 0063, Proposed). Spend the read on what they cannot judge: which tokens, which look, whether a new primitive is really needed.

## What this skill is not

It does not review code quality, security, or correctness — that's `code-reviewer`/`security-reviewer`. It only checks for contradictions with `docs/design/design-system.md`, the tests that pin it, and `docs/adr/`.
