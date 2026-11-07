# Review checklist for a user-facing page

Run on each guide page a change touches (`docs/guides/using-the-app/`, the root `README.md`, `src/web/docs/`). Report each item as pass, fail with the line, or not applicable: `item 9: fail, no What next`. Fix what fails, or list it in the PR body. Why each item is here: [the research note](../../../../docs/research/2026-11-gold-standard-documentation.md#6-review-checklist-for-a-person-or-an-agent).

## Reader

- **1.** The first one or two sentences say who the page is for and what it gets them.
- **2.** A newcomer page says what you need before you start.
- **3.** Every term a newcomer would not know (DAW, `.rpp`, bridge) is explained or linked on first use, or replaced with the narrator's word.

## Task

- **4.** Each task has a heading a reader would search for, numbered steps, and the result of the last step.
- **5.** Each step names the exact UI label in bold, and the label exists in the app (`grep` it in `src/studio/ui/src`).
- **6.** A tutorial or how-to has a worked example with concrete values.
- **7.** Each visual result has a screenshot from the real app (`scripts/dev/guide-screenshots.mjs`), captioned with what it shows.

## Way out and way on

- **8.** The failures a reader is likely to hit are in a troubleshooting table, with the exact message, or linked to the page that owns them.
- **9.** The page ends with `## What next`: two to five links to where its reader goes next.
- **10.** Every link is descriptive and resolves.

## Truth and economy

- **11.** Every factual claim was checked against code, a test or the running app in this change.
- **12.** No filler ([doc-unslop](../../doc-unslop/SKILL.md) steps 3 to 5), and no paragraph describing the screen's layout where a task or a table would do.
- **13.** A fact copied from another page is one sentence and links its home.

## Read it as the reader

- **14.** Read the page top to bottom as the reader named in item 1. Write down where you needed something it did not give you.
