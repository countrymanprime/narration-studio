# Readers and doc types

The full matrix, sources and reasoning are in [the research note](../../../../docs/research/2026-11-gold-standard-documentation.md). This file is the part an author needs while writing.

## Readers

| Reader | Comes with | Quits when | Trusts when |
| --- | --- | --- | --- |
| Newcomer narrator | "What do I do first?" | A term or setup step is assumed; the screen does not match | Each step shows its result and it matches |
| Narrator past first run | "How do I do X here?" | The task is buried in a description of the page | Control names match the screen exactly |
| Experienced narrator (audio pro) | "Will this fit my REAPER workflow, what does it touch?" | Narration explained to them; developer words | It says what it changes in REAPER and what it leaves alone |
| Author / rights holder | "What leaves this computer?" | Vague reassurance | What is local and what is sent where, and how to check |
| Editor, proofer, QA | "What does this finding mean and what do I do with it?" | A rule with no number or source | Thresholds and sources named |
| Contributor, release owner | "What do I run and how do I know it worked?" | Prose where a command would do | Commands that run, paths that exist, a check per step |
| Agent | "Which file holds the rule, what is the command?" | Copies that disagree | One fact in one place, with its proof |

Agent files (`CLAUDE.md`, skills, rules) stay terse. User guides are written for people.

## Skeletons

A section with nothing to say is left out, not filled.

- **Tutorial / onboarding:** who it is for and what they will have; `## Before you start`; numbered steps, each one action with its visible result and screenshot, one named example throughout; `## What next`. Then, on an onboarding page, the how-to and reference sections and `## If something goes wrong`.
- **How-to section:** heading as the reader would say the task; when you need it; numbered steps with bold UI labels; the result and its screenshot; the likely failure and fix, or a link.
- **Reference entry:** the UI's name; what it is for in one sentence; options, default, unit, who it is saved for (a table when there are several); limits and the source of a rule; the how-to that uses it.
- **Explanation:** the question; the concept, with a diagram for a mechanism; trade-offs; related links.
- **Troubleshooting:** a table of what you see (the exact message or symptom) and what it means and what to do. A problem shared by pages lives once, on the page that owns it.
- **Release notes:** `Important` (breaking change, migration, known issue) then new, changed, fixed, one line each in narrator words naming the page (`scripts/release/changelog.mjs` builds them from PR titles).
- **README:** what it is and who it is for, a screenshot, install, first steps (link Getting started), where the docs are, then contributor setup.

## Length

Rules of thumb, not limits:

| Type | Aim | Too short when | Too long when |
| --- | --- | --- | --- |
| Tutorial | One sitting, 5 to 8 steps of 1 to 4 sentences | A step has no visible result or uses an unexplained term | It explains options the newcomer does not need yet |
| How-to section | 3 to 8 steps | No precondition or result | It describes the whole page around the task |
| Reference entry | A line to a paragraph | Defaults, units or limits missing | It holds steps or history |
| Troubleshooting row | Symptom plus 1 to 2 sentences | "Check your settings" | It explains the mechanism; link instead |
| Sentence in a user guide | Under about 25 words | Fragments that drop the subject | Two conditions and a list in one sentence |

## Examples, screenshots, links

- One named, invented, plausible example through a tutorial (a book title, a file name). Never real people's data.
- A screenshot after each step whose result is visual, from the real app, whole screen or whole dialog, captioned with what it shows.
- Descriptive link text; link the first mention of another page's thing; end every guide page with `## What next`.
