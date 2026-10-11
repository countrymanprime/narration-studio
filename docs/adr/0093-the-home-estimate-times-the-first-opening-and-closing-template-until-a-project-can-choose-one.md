# 0093. The Home estimate times the first opening and closing template until a project can choose one

**Status:** Accepted
**Date:** 2026-09-22

## Context

The plan for the credits templates asked for a "Credits stat in the estimate (rendered words / 155 wpm)", with a concrete outcome:
"Home shows 'Credits ~18 s' beside the narration estimate." But the first credits work (`apps/desktop/internal/credits`,
`CreditsPanel.tsx`, PR #302) shipped only a narrator-level **library** of opening/closing templates plus a preview renderer
(`creditsPreview(body)`); it never added a way for a project to say "this is the opening template I am actually going to read"
or "this is the closing one." `CreditsPanel.tsx`'s `selectedId` is local component state for editing, not a persisted
per-project choice, and `project.Manifest`'s `Credits` field holds only token *values* (title, author, ...), not a chosen
template id. The plan recommended building templates, preview and estimate before the manuscript entries and the teleprompter,
but did not say what the estimate should render when no per-project selection exists yet.

That is an open question with no owner decision on record. The recommended path is taken and this ADR records it for the owner to
confirm, adjust or replace once template selection is designed (a natural fit for the manuscript entries for credits, or its own
small piece of work).

## Decision

Until a project can choose its own opening/closing templates, the Home audiobook estimate's "Credits" stat is computed from
**the first `opening`-kind and first `closing`-kind template in the narrator's credit template library, in the order
`creditsTemplates()` returns them** (shipped defaults first, as the library is seeded) - rendered with `creditsPreview(body)`
using the current project's own values (falling back to the global narrator default, exactly as `CreditsPanel.tsx`'s preview
already does). Each matched template is treated as its own file (ACX convention: "Opening and closing
credits should be separate files"), so its word count is timed independently and could later carry its own room-tone padding.
A library with no `opening` or no `closing` template simply omits the "Credits" stat rather than showing a zero or a
placeholder (`apps/ui/src/components/home/AudiobookEstimatePanel.tsx`).

This is a **reading default**, not a new store: no manifest field, binding or `hostAPIVersion` bump is added by this decision.
It reuses the two existing bindings the Settings > Credits panel already calls (`creditsTemplates`, `creditsPreview`).

## Consequences

- A narrator who adds a second opening template, or reorders their library so their preferred opening is not first, sees the
  estimate keep timing whichever one the store still returns first - the estimate will not match what they intend to read
  until a real "this project's opening/closing template" selection exists. This is a known, accepted gap, not a bug: it should
  be closed by a follow-up that adds a per-project template choice (most naturally alongside the manuscript entries, which need
  the same "which template plays here" answer for the read-only pseudo-entries before/after the chapter list).
- Because the choice is made by list order rather than persisted state, it costs nothing to change later: replacing "first
  opening/closing template" with an explicit per-project selection is a change inside `AudiobookEstimatePanel.tsx`'s own
  effect, with no migration of stored data (there is none yet to migrate).
- The estimate's Credits stat can differ from what `CreditsPanel.tsx`'s own preview shows (whichever template a narrator has
  selected there to edit), which could read as two disagreeing numbers in the same session. This is accepted and
  should be called out in the guide/help text.
