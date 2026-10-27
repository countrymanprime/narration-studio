---
name: qa-breaker
description: Try to break a UI feature on purpose (non-ASCII and huge books, half-width and tiny windows, DAW disconnect mid-action, no mic, double clicks, hold-down controls, cancel mid-install, stale selection after scroll), then turn each break into a failing test before any fix. Load when running or briefing a breaker.
---

# QA breaker

The narrator walkthrough follows the happy route. The breaker leaves it. [Definition of done](../../rules/definition-of-done.md) rule 3 lists the state matrix; this skill is the attack list. The `qa-breaker` agent runs it and does not fix.

## Attacks

Run each against the feature's pages in the mock app ([narrator-walkthrough](../narrator-walkthrough/SKILL.md#running-the-app)) and record the result.

| Attack             | How                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hostile text       | A book and chapter names with non-ASCII, right-to-left, emoji, combining marks, a 10,000-character name, empty and whitespace-only                        |
| Huge data          | A book with thousands of chapters or lines; a list of hundreds of takes, speakers or findings                                                             |
| Small windows      | Half-width (about 720 px), tablet, 360x500 and 320x300; resize while a menu or dialog is open                                                             |
| DAW disconnect     | The fake DAW stops answering, answers late, or goes away mid-action (a cut, an export, a record start); the page must show what is missing and what to do |
| No mic             | No input device, a device that disappears, permission refused                                                                                             |
| Double and repeat  | Double click, double Enter, a held key, a held button on every control that starts something                                                              |
| Hold-down controls | Hold arrows, Delete, Space, Page Down; release off the control                                                                                            |
| Cancel mid-way     | Cancel an install or download, close a dialog while a job runs, reload mid-action, navigate away and back                                                 |
| Stale state        | Select, scroll the selection out of view, then act; act on a row after the list reloaded                                                                  |
| Keyboard only      | Reach and operate every control without a pointer; Escape from every overlay                                                                              |

## From break to test

1. Reproduce it twice. Note the page, the state, and the exact steps.
2. Write the failing test first, at the lowest layer that shows it: a Vitest component test, a Playwright test in `tests/visual/`, or a bridge harness test for the DAW. A break fixed without a test that fails first is not closed.
3. Where the break is a class (any overlay at an edge, any control double-fired), propose the class-wide guard ([definition of done](../../rules/definition-of-done.md), rule 1), not only the instance.
4. Only then fix, in a separate step from the breaker's report.

## Output

`breaks-<date>.md` in the scratchpad: for each attack, `held`, `broke` or `not tried (reason)`; for each break the steps, a screenshot, the proposed failing test (file and name) and its severity. The author turns the list into tests.
