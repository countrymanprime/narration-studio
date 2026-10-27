---
name: narrator-walkthrough
description: Drive the real app with Playwright as a first-time narrator would (link a fake DAW, import a book, scan, attribute, record, edit, proof, produce) and report findings with screenshots. Never fixes. This is the independent walkthrough rule 2 of definition-of-done asks for. Load when running or briefing one.
---

# Narrator walkthrough

[Definition of done](../../rules/definition-of-done.md), rule 2, says a fresh agent walks the feature as a narrator before merge. This skill is how. The `narrator-walkthrough` agent runs it.

## The walker

- **Knows the purpose, not the diff.** The brief is the feature in a narrator's words and the pages it touches. Do not give it the branch's diff, the PR body or the author's notes.
- **Behaves like a first-time narrator.** Reads only what the page shows: labels, tooltips, empty states. A step that needs the guide, the code or a guess is a finding.
- **Never fixes.** It writes findings and screenshots. Fixing is the author's job, and a walker that fixes stops seeing the next defect.

## Running the app

The mock backend with the fake DAW is what the visual suite uses ([ui-visual-verification](../../rules/ui-visual-verification.md)):

```bash
cd src/studio/ui
pnpm run build:mock && pnpm exec vite preview --outDir node_modules/.cache/mock-build --port 4173 --strictPort
```

Drive it with Playwright (`require('playwright')` works from any directory; never `playwright install`; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if launch fails, see `playwright.launch.ts`). Page drivers in `tests/visual/drivers/` show how to reach each page and state. Write the walker's script and screenshots to the scratchpad, not the repo.

## The route

Take this order, one screenshot per step and one after any surprise. Skip a step the feature does not touch, and say so.

1. **Link the DAW** (the fake): Settings or the Engine page, link a project, confirm the status reads as linked.
2. **Import a book**: the import dialog, chapters detected, names shown.
3. **Scan**: Script or Story Bible scan runs, results appear.
4. **Attribute**: assign speakers to lines.
5. **Record**: the Booth, mic present, one take, stop, redo.
6. **Edit**: Editing, select words, cut, undo.
7. **Proof**: Proof, a finding opened and resolved.
8. **Produce**: Production, Master and Delivery, an export started.

For each step note: what the narrator expected, what happened, whether the next action was obvious without help, and any text, layout or state that looked wrong.

## Output

Write `walkthrough-<date>.md` in the scratchpad with:

- **Route covered** and what was skipped.
- **Findings**, each with: step, severity (blocks the narrator, confuses, cosmetic), what happened, the screenshot path, and how to reproduce.
- **Not exercised**, so the PR body's "Not exercised" section can cite it.

Return the path and the finding count. What the fake DAW cannot show (real audio, real REAPER) is listed as unverified, not as passed.
