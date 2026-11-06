# Gold-standard documentation for this app: readers, doc types, style and a rollout plan

Researched 2026-11-06 for the owner ([#3072](https://github.com/countrymanprime/narration-studio/issues/3072)). Point-in-time note against `main` at `9af9c66`; it is evidence and a proposal, not a rule. Nothing here changes `docs-style`, `doc-unslop` or any gate until the owner approves; the proposed skill edits are in [the patch beside this note](2026-11-gold-standard-documentation-proposed-skills.patch).

**Question.** What makes software documentation worth reading for each kind of reader this app has, what each doc type needs, how the repo's short-and-filler-free writing rules fit the owner's bar ("reads like it is for a human; not too concise and not too verbose; examples; screenshots; links to related things; worth reading"), and how to roll a standard out without it rotting.

**Method.** External guidance (section 1) read against this product: a Windows desktop app for audiobook narrators that drives REAPER (or Audacity 3, or its own recorder), with its user guide in `docs/guides/using-the-app/` (13 pages and an index, 4,109 lines, 259 screenshot embeds at `9af9c66`). The pilot rewrite (section 8) applies the standard to one page and checks every claim against the code.

**How the sources were read.** This session's network reached GitHub only. Pages whose source is on GitHub were read in full (marked *read*). The rest were read through a search engine's summary of the page (marked *summary*); treat those as lower confidence and check the page before quoting it.

## Headline findings

1. **Short is not the same as good, and the repo's rules only measure short.** Every source agrees on cutting filler. None says the shortest page is best for a learner: Google's audience lesson says that unless you write for experienced teammates "you typically must explain more than you expect", and Write the Docs asks for examples. The `docs-style` skill has rules against padding and none for the reader's missing context, examples, or a way forward, so an agent following it writes accurate pages that a newcomer cannot use.
2. **The user guide is reference written as how-to.** Each page describes everything its app page does, in screen order, densely and accurately. That serves an experienced narrator looking up one control. It does not serve a newcomer who needs a path: no guide page says what you need before you start, gives a worked example, or ends with what to do next (the footer links only the next page in sidebar order).
3. **The newcomer's first run was not written down anywhere.** Installing is in the root `README.md`; creating a project in `getting-started.md`; importing in `production.md`; linking REAPER in `settings.md`; the first take in `booth.md`. Two facts a newcomer trips on were in no guide page: **New project** makes a folder with a project file and no REAPER project (`ProjectCreateIn` in `src/studio/desktop/bindings.go`), and until a REAPER file is in that folder or another recorder is chosen, a project records with the built-in recorder (`ProjectKind` in `src/studio/desktop/internal/dawport/adapter.go`).
4. **A screenshot can be embedded on exactly one guide page** (`src/studio/ui/src/docsGuide.test.ts`). It keeps images from drifting, and it also stops a tutorial from reusing the reference page's picture of the same step; the pilot links instead. Section 7 proposes a fix.
5. **Most of what keeps docs current is already gated** (docs-impact, guide-impact, link and heading checks, screenshot regeneration). What is missing is a check that a page serves a reader, which needs a reader: section 7 proposes a cheap structural check plus an agent walkthrough that follows the page in the real app.

## 1. Sources

| Source | What it contributes | Read |
| --- | --- | --- |
| [Diátaxis](https://diataxis.fr/) (Procida) | Four types by reader need: tutorial (learning), how-to (task), reference (information), explanation (understanding); keep them apart and link between them. A tutorial shows a visible result early, explains only what the steps need, and must work every time, so it is tested | summary |
| [Write the Docs: documentation principles](https://github.com/writethedocs/www/blob/main/docs/guide/writing/docs-principles.rst) | ARID ("Accept (some) Repetition In Documentation"); skimmable ("write like a newspaper instead of a novel"; descriptive headings and link text; concepts early in each paragraph); exemplary ("include (some) examples"; "too many examples can make the documentation less skimmable"); consistent; current ("incorrect documentation [is] worse than missing documentation") | read |
| [Google documentation guide: philosophy](https://github.com/google/styleguide/blob/gh-pages/docguide/philosophy.md) and [best practices](https://github.com/google/styleguide/blob/gh-pages/docguide/best_practices.md) | "Brief and utilitarian is better than long and exhaustive"; "A small set of fresh and accurate docs is better than a large assembly of documentation in various states of disrepair"; change docs in the same change as the code; delete dead docs. Written for engineers reading engineering docs | read |
| [Google Technical Writing One: audience](https://developers.google.com/tech-writing/one/audience) | Good documentation = what the reader needs to do the task − what they already know; the curse of knowledge; "you typically must explain more than you expect" unless writing for experienced teammates | summary |
| [Google developer style guide: voice and tone](https://developers.google.com/style/tone) | Conversational, friendly, respectful; "a knowledgeable friend who understands what the developer wants to do"; read it aloud; second person, active voice, descriptive link text | summary |
| [Microsoft Writing Style Guide: top 10 tips](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice) | "Get to the point fast": lead with what matters, front-load keywords, make next steps obvious; write like you speak; contractions; start statements with a verb | summary |
| [GOV.UK: writing for GOV.UK](https://www.gov.uk/guidance/content-design/writing-for-gov-uk) and [why 25 words is our limit](https://insidegovuk.blog.gov.uk/2014/08/04/sentence-length-why-25-words-is-our-limit/) | Plain English for a wide public; most important point first in page, section, paragraph and sentence; a 25-word sentence limit used in spot checks (2014, flagged by GOV.UK as possibly out of date) | summary |
| [plainlanguage.gov: write for your audience](https://plainlanguage.gov/guidelines/audience) | "The first rule of plain language is: write for your audience"; plain is not dumbed down; documents with several audiences address each one separately | summary |
| [NN/g: how users read on the web](https://www.nngroup.com/articles/how-users-read-on-the-web/), [why web users scan](https://www.nngroup.com/articles/why-web-users-scan-instead-reading/) | 1997: 79% of test users scanned a new page, 16% read word by word; readers scan headings and the left edge, so front-load headings, list items and paragraphs | summary |
| [NN/g heuristic 10: help and documentation](https://www.nngroup.com/videos/help-and-documentation/) | Best if the interface needs no docs; help is searchable, task-focused, concrete steps, reachable without leaving the screen | summary |
| [GitHub Docs content model](https://docs.github.com/en/contributing/style-guide-and-content-model) | Conceptual, referential, procedural, troubleshooting, release note, quickstart and tutorial types; procedural content says how the task fits the reader's larger goal; troubleshooting covers built-in errors and common problems; articles end with next steps or further reading | summary |
| [Mark Baker, *Every Page is Page One*](https://everypageispageone.com/the-book) (XML Press 2013) | Readers arrive from search or a link, so each page establishes its own context and links onward instead of relying on page order | summary |
| John Carroll, *The Nurnberg Funnel* (MIT Press 1990), and [minimalism in technical communication](https://en.wikipedia.org/wiki/Minimalism_(technical_communication)) | Users learn by doing real work early; short task-focused sections; support recognising and recovering from errors | summary |
| Sweller, "Cognitive load during problem solving", *Cognitive Science* 12(2), 1988, and the [worked-example effect](https://en.wikipedia.org/wiki/Worked-example_effect) | Novices learn more from a worked example than from working it out; the benefit fades with expertise, so examples go where newcomers read, not in reference | summary |
| [van der Meij and Gellevij, screen images in software documentation](https://research.utwente.nl/en/publications/the-role-and-design-of-screen-images-in-software-documentation/) | Screenshots help some tasks and not others; full-screen captures did better than partial ones in one study; signalling the relevant control draws the eye but did not always improve performance | summary |
| [GitHub Open Source Survey 2017](https://www.infoq.com/news/2017/06/github-survey-open-source) | 93% of respondents met incomplete or outdated docs; the most-cited problem | summary |
| [Stripe's documentation culture](https://review.firstround.com/podcast/from-kickoffs-to-retros-and-slack-channels-stripes-documentation-best-practices-with-brie-wolfson/) | Docs treated as product; writing on the career ladder; reviewed like code | summary |
| [Keep a Changelog 1.1.0](https://github.com/olivierlacan/keep-a-changelog/blob/main/source/en/1.1.0/index.html.haml) | "Changelogs are for humans, not machines"; group by Added, Changed, Deprecated, Removed, Fixed, Security; latest first, dated; "Don't let your friends dump git logs into changelogs" | read |
| [llms.txt proposal](https://github.com/AnswerDotAI/llms-txt/blob/main/nbs/index.qmd) | "Agents are best served by concise, expert-level information gathered in a single, accessible location"; Markdown; links to the detail | read |
| [Anthropic: Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices) | Keep agent instruction files concise and human-readable; point to detail instead of pasting it | summary |
| [The Good Docs Project templates](https://gitlab.com/tgdp/templates) | Open templates for quickstart, how-to, tutorial, troubleshooting, reference, release notes, README | summary |

**Where the sources disagree.** Google's docguide and Microsoft say shorter is better; Google's audience lesson, Write the Docs and Diátaxis's tutorial page say a newcomer needs more than the writer expects. They are about different readers. The engineering guide is for engineers reading engineering docs, which is what `docs-style` was written from. A narrator learning the app is the other reader. The reconciliation (section 5) is to cut words that carry nothing and keep, or add, words that carry context, an example or a next step.

## 2. The readers and what they come with

The repo's audiences, from the guide's own pages and agents: the narrator (newcomer and experienced), the people around a book (author or rights holder, editor, proofer and QA checker), contributors, the release owner, and the agents that read and write the repo.

| Reader | Comes with | Skims for | Quits when | Trusts when | Lands on |
| --- | --- | --- | --- | --- | --- |
| **Complete newbie** (new to the app, maybe to narration software) | "What is this, will it work for me, what do I do first?" | Numbered steps, the first screenshot that matches their screen, a time or step count | A page assumes a term (DAW, `.rpp`, pickup) or a setup step they have not done; the first screen does not match | Each step's result is shown and matches; the page says what they need before starting | Root `README.md`, then [Getting started](../guides/using-the-app/getting-started.md) |
| **End user** (narrator, past first run) | "How do I do X on this page?" | The heading that names their task, the bold control name | The task is buried in a paragraph about the page's layout | The control names match the screen exactly | A guide page, via search or the index |
| **Experienced user** (knows the app) | "What exactly does this setting do, and what changed?" | Reference tables, defaults, limits, keyboard keys | The answer is in a tutorial they must read through | Exact values with units and defaults | [Settings](../guides/using-the-app/settings.md), release notes |
| **Experienced narrator** (audio professional, not a coder: ACX, punch and roll, room tone, pickups) | "Does this fit how I already work in REAPER? Will it touch my project?" | Their own terms (punch and roll, pickups, ACX), what the app writes into REAPER and what it never changes | The guide explains narration to them, or uses developer words (bridge, sidecar, binding) | It names what it changes in REAPER and what it leaves alone, in their vocabulary | [Booth](../guides/using-the-app/booth.md), [Master & QC](../guides/using-the-app/master-and-qc.md) |
| **Author / rights holder** | "Is my manuscript safe and private? What leaves this computer?" | Privacy, where files go, what is uploaded | Vague reassurance | Specific statements: what is local, what is sent where, and how to check | `README.md` install, [Settings](../guides/using-the-app/settings.md) models and downloads |
| **Editor** | "How do I review the audio against the text and hand back changes?" | Editing and Proof workflows, what a note means | Recording instructions they do not need | Example notes and decisions shown in screenshots | [Editing](../guides/using-the-app/editing.md), [Proof](../guides/using-the-app/proof.md) |
| **QA checker / proofer** | "What does this finding mean, is it real, what do I do with it?" | Finding names, pass and fail thresholds, sources for each rule | A rule with no number or source | Each check names its threshold and source | [Proof](../guides/using-the-app/proof.md), [Delivery](../guides/using-the-app/delivery.md), [ACX requirements](../reference/acx-delivery-requirements.md) |
| **Developer / contributor** | "How do I build, test and change this without breaking something?" | Bootstrap commands, layout, where a thing lives, the gate | Prose where a command would do; stale commands | Commands that run; paths that exist | `README.md` developer bootstrap, [docs/README.md](../README.md), `CONTRIBUTING.md` |
| **Release / ops** | "What do I run, in what order, and how do I know it worked or roll back?" | Checklists, preconditions, verification and rollback steps | A runbook that skips a precondition | Each step has a check | [CI and releases](../operations/ci-and-releases.md), [owner release checklist](../operations/owner-release-checklist.md) |
| **AI agent** | "Which file holds the rule, what is the exact command, what must I not do?" | Paths, commands, rule lists, links to the detail | Long narrative, repeated text that disagrees between copies | One fact in one place, with the file or test that proves it | `CLAUDE.md`, `.claude/skills/`, `.claude/rules/` |

**Consequences for this repo.**

- The narrator is two readers. The newcomer needs a path; the experienced narrator needs reference in their own vocabulary. Today's guide pages are written for the second.
- The agent reader is real and is served by what `docs-style` already asks for: exact, linked, one fact in one place. Agent files (`CLAUDE.md`, skills) stay terse. User guide pages are written for people, and agents read those too.
- The author, editor and QA readers have no entry point. The index lists app pages, not "I am an editor, start here".

## 3. Doc types and their skeletons

One page, one type, as `docs-style` rule 3 already says. An onboarding page is the one deliberate mix: a short tutorial followed by how-to sections, because a newcomer and a returning reader land on the same first screen. The skeletons below are sections to have, in order; a section with nothing to say is left out, not filled.

### Tutorial (learning: the first run, a first recording)

```markdown
# <What you will do>
<Who this is for and what you will have at the end, in two sentences.>
## Before you start
<What you need: software, files, accounts. Links to how to get each.>
## <Step-by-step heading>
### 1. <Action>
<One action, its visible result, a screenshot of that result.>
### 2. ...
## What next
<Three to five links to what a reader usually does next.>
```

Rules: a named example used all the way through (a book title, a file name); every step shows its result; explanation only where a step needs it, with a link to the rest; tested by someone, or an agent, following it in the real app.

### How-to (a task on one page: "Link a REAPER project")

```markdown
## <Task, as the reader would say it>
<When you need this, and the result, in one or two sentences.>
1. <Step, with the exact control name in bold.>
2. ...
<The result, a screenshot of it.>
<If it fails: the likely cause and the fix, or a link to troubleshooting.>
<Related: links.>
```

### Reference (what a control, setting or check is: Settings rows, delivery rules)

```markdown
## <Thing's name as the UI shows it>
<What it is for, in one sentence.>
| Value or option | What it does | Default | Saved for |
<Limits, units, interactions with other settings, the source of a rule.>
<See also: the how-to that uses it.>
```

Rules: mirrors the screen's order; exact names, defaults and units; no steps; examples only where a value is hard to picture.

### Explanation (why: how the app talks to REAPER, why takes never overwrite)

```markdown
# <Topic>
<The question this answers.>
## <Concept>
<Discussion, with a diagram when there is a mechanism.>
## Trade-offs
## Related
```

### Troubleshooting (a symptom and its fix)

```markdown
## If something goes wrong
| What you see | What it means and what to do |
```

Rules: the left column is the exact message or the visible symptom, so a reader can match it; the fix names the control or links the how-to. A page's own troubleshooting goes at its end; a problem shared by several pages (REAPER not connected) lives once, on the page that owns it, and others link to it.

### Onboarding / first run

The tutorial skeleton, then the page's how-to and reference sections under clear headings, and a troubleshooting table. The pilot (section 8) is this type.

### Release notes

```markdown
## <version> (<date>)
### Important
<BREAKING CHANGE, Migration, Known issue lines, written for a narrator.>
### New / Changed / Fixed
<One line per change, in narrator words, naming the page it is on.>
```

This repo builds them from pull request titles (`scripts/release/changelog.mjs`), grouped by type, with the **Important** lines from the PR body (`.github/pull_request_template.md`). The rule that matters is in the template: title and lines are written for the narrator who reads the release page, not for the reviewer.

### README

```markdown
# <Name>
<What it is and who it is for, two sentences. A screenshot.>
## Install
## First steps            (a link to Getting started)
## Where the docs are     (the user guide, the reference, contributing)
## For contributors       (bootstrap, layout, the gate)
```

Google's README guidance: "At a minimum, your README.md file should contain a link to your user- and/or team-facing documentation." The root `README.md` opens with the tool list and source paths; the user-facing paragraph comes after it.

### In-app help (the **?** hints, empty states, notices)

Not Markdown, but the same reader. The app's rules already cover it (`frontend-primitives`: no instruction prose on a page, the **?** beside a control, errors as toast, modal or fixed box). For docs, the rule is that a guide page uses the same words as the hint, and the hint is short enough that the page is where the detail lives.

## 4. Style checklist

**Voice.** Second person ("you"), active voice, present tense. Conditions before instructions ("With one `.rpp` in the folder, press **Link**"). Contractions are fine in user guides. A knowledgeable friend who knows narration, not a salesperson and not a spec.

**Front-load.** The first sentence of a page says who it is for and what it gets them; the first words of a heading, list item and paragraph carry the keyword a scanning reader looks for.

**Length rules of thumb.** These are this note's judgement from the sources and the repo's pages, not a measured standard.

| Type | Aim | Too short when | Too long when |
| --- | --- | --- | --- |
| Tutorial | One sitting; 5 to 8 steps of 1 to 4 sentences each | A step has no visible result, or a term is used before it is explained | It explains options the newcomer does not need yet |
| How-to section | 3 to 8 steps | It leaves out the precondition or the result | It describes the whole page around the task |
| Reference entry | One line to one paragraph per control | Defaults, units or limits are missing | It contains steps or history |
| Troubleshooting row | Symptom plus 1 to 2 sentences | The fix is "check your settings" | It explains the mechanism; link instead |
| README | One screen to the install link | It does not say what the app is for | Developer layout comes before what the app does |
| Sentence | Under about 25 words for user guides (GOV.UK spot-check figure) | Choppy fragments that drop the subject | Two conditions and a list in one sentence |

**Examples.** A tutorial uses one named example throughout (the pilot uses *The Lighthouse Keeper* and `The Lighthouse Keeper.rpp`). A how-to shows an example value where the reader must type or choose one. Reference gives an example only where a value is hard to picture (a file name pattern, a time format). Examples are invented but plausible, and never a real person's or company's data.

**Screenshots.** One per step whose result is visual, taken from the real app with `scripts/dev/guide-screenshots.mjs`, captioned with what it shows (the caption is the alt text). Full screen or the whole dialog, not a crop to one button, unless the step is about that button. A screenshot sits after the step it shows. No screenshot of text the page already says.

**Links.** Descriptive link text (the page or section name, never "here"). Link the first mention of another page's thing, not every mention. Every page ends with where to go next. Link a fact's home instead of repeating it, but keep the one sentence the reader needs on this page (Write the Docs' ARID: some repetition is the price of a page a reader can use alone).

**Scannability.** Headings name tasks or things as the UI names them. Numbered lists for steps, bullets for unordered facts, tables for symptom and fix or option and effect. Bold only for UI labels, consistently.

**Glossary and naming.** Use the UI's exact label in bold, and the narrator's word for a thing (pickup, punch and roll, room tone). Explain a term the first time a newcomer page uses it (`.rpp`: REAPER's project file). Developer terms (sidecar, binding, bridge) stay out of user guides, or get one plain-words gloss ("its bridge, a small script").

**What next.** Every guide page ends with a short list of the pages a reader usually goes to next, before the footer.

## 5. Reconciling `docs-style` and `doc-unslop` with the owner's bar

The rules are right about what to cut. They are silent about what a reader needs, and their wording ("short", "delete any line whose removal would not cause a mistake", "cut, do not rewrite", "would they miss it") reads to an agent as "fewer words is always better". The owner's bar is "not too concise". The fix is to say which reader a page is for and to define filler as words that carry nothing, never as context, examples or next steps.

Exact lines, in `.claude/skills/docs-style/SKILL.md` at `9af9c66`, and the proposed change (the full text is in [the patch](2026-11-gold-standard-documentation-proposed-skills.patch)):

| Line | Now | Proposed |
| --- | --- | --- |
| 3 (description) | "…so it stays accurate, thorough and short." | "…so it stays accurate, complete for its reader, and free of filler." |
| 10 (why) | "Agent-written docs drift two ways: … they fill up with filler…" | Adds a third: "and they get so terse that a reader new to the subject cannot use them." |
| 14, rule 1 | "State only what code, a command or a test can show." | Keeps it, and adds that a sentence giving context, an example or a next step for the reader is not a claim and needs no source beyond the facts in it. |
| 16, rule 3 | Five types | Adds onboarding (tutorial then how-to, one deliberate mix) and points to the templates. |
| 22, rule 4 | "Say what is, in the active voice, once." | Keeps "once" for facts; allows the one-sentence restatement a page needs to stand alone, with a link to the full fact. |
| 26, rule 8 | "Keep size proportional. … For `CLAUDE.md` and skills, delete any line whose removal would not cause a mistake." | Splits: agent files stay at the delete-test; user guides are sized to the reader (the length table), with "too short" named as a failure. |
| new rule 10 | — | "Write for a named reader." Each page names who it is for in its first sentence or two and gives that reader what they lack: before-you-start, an example, the result of each step, what next. |
| new section | — | Reader and question matrix, doc-type skeletons and the review checklist, in `references/` files so the skill body stays under 500 lines. |

In `.claude/skills/doc-unslop/SKILL.md` at `9af9c66`:

| Line | Now | Proposed |
| --- | --- | --- |
| 20, step 2 | "Would they miss it if it were gone?" | "Would *the page's reader* miss it?" A newcomer misses a before-you-start line an expert would not. |
| 31, step 5 | "A first sentence that restates the heading." | Keeps it; adds "A first sentence that says who the page is for and what it gets them is not a restatement." |
| 33, step 5 | "Text that explains what the code already shows." | Scoped to code comments and contributor docs: a narrator never reads the code. |
| 37, step 6 | "Cut, do not rewrite." | Keeps it for filler; adds a step 9: report, without fixing, what the page's reader lacks (no example, no result shown, no what next, an unexplained term) as `gap` findings for the author. |
| new step 9 | — | The gap report, using the review checklist below. |

The patch also adds a review step to `doc-screenshot-sync` and `doc-impact-check` (run the review checklist on a guide page you changed) and one line in the definition of done. It leaves `scripts/ci/docs-slop-phrases.json` alone: the phrase list cuts filler and is still right.

## 6. Review checklist (for a person or an agent)

Run on each user-facing page changed. Each item is pass, fail with the line, or not applicable; the numbers are for reporting (`item 9: fail, no What next`).

**Reader**

- **1.** The first one or two sentences say who the page is for and what it gets them.
- **2.** A newcomer page says what you need before you start.
- **3.** Every term a newcomer would not know is explained or linked on first use, or replaced with the narrator's word.

**Task**

- **4.** Each task has a heading a reader would search for, numbered steps, and the result of the last step.
- **5.** Each step names the exact UI label in bold, and the label exists in the app (`grep` it in `src/studio/ui/src`).
- **6.** A tutorial or how-to has a worked example with concrete values.
- **7.** Each visual result has a screenshot from the real app, captioned with what it shows.

**Way out and way on**

- **8.** The failures a reader is likely to hit are in a troubleshooting table or linked to the page that owns them, with the exact message.
- **9.** The page ends with what to do next, linking two to five pages.
- **10.** Every link is descriptive and resolves (the guide test checks resolution).

**Truth and economy**

- **11.** Every factual claim was checked against code, a test or the running app in this change.
- **12.** No filler (`doc-unslop` steps 3 to 5), and no paragraph that describes the screen's layout where a task or a table would do.
- **13.** A fact copied from another page is one sentence and links its home.

**Read it as the reader**

- **14.** Read the page top to bottom as the reader named in item 1. Where did you need something it did not give you? Record it.

## 7. Implementation plan

### What changes, in order

| # | File | Change | Depends on |
| --- | --- | --- | --- |
| 1 | `.claude/skills/docs-style/SKILL.md` | Rules 1, 3, 4 and 8 reworded; rule 10 (named reader) added; links to two new references | Owner approval of this note |
| 2 | `.claude/skills/docs-style/references/readers-and-types.md` (new) | The reader matrix (section 2) and the skeletons (section 3), cut to what an author needs | 1 |
| 3 | `.claude/skills/docs-style/references/review-checklist.md` (new) | The checklist (section 6) | 1 |
| 4 | `.claude/skills/doc-unslop/SKILL.md` | Steps 2, 5 and 6 scoped; step 9 gap report added | 1, 3 |
| 5 | `.claude/skills/doc-screenshot-sync/SKILL.md` | Step 3 becomes "run the review checklist on the page"; a tutorial may reuse a step's image (see 9) | 3, 9 |
| 6 | `.claude/skills/doc-impact-check/SKILL.md` | Step 5 ("Add a doc") points to the skeletons; step 7 runs the checklist as well as `doc-unslop` on guide pages | 2, 3 |
| 7 | `.claude/rules/definition-of-done.md` | One line: a changed guide page passed the review checklist, and a newcomer page was followed by a fresh agent | 3, 10 |
| 8 | `.github/pull_request_template.md` | The Docs checkbox adds "and ran the review checklist on each guide page changed" | 3 |
| 9 | `src/studio/ui/src/docsGuide.test.ts` and `src/studio/ui/tests/visual/doc-screenshots.json` | Allow an entry to name extra pages it may appear on (`alsoOn`), so a tutorial reuses a reference page's image without a second capture | Owner approval; a code change with its own test |
| 10 | `.claude/agents/narrator-walkthrough.md` | A "doc walkthrough" mode: given only a guide page, follow it in the real app and report each step where the page and the app disagree or the reader is stuck | 3 |
| 11 | `CLAUDE.md` step 6 | `docs-style` named as "accurate, complete for its reader and free of filler" where it is listed | 1 |
| 12 | `docs/operations/documentation-gates.md` | Rows for whatever automated checks are approved from the table below | 13 |
| 13 | `scripts/ci/` or `docsGuide.test.ts` | The approved checks | Owner choice |

Items 1 to 8, 10 and 11 are text and can land in one pull request once approved. Item 9 is a small code change with a test. Items 12 and 13 follow the owner's pick of checks. The patch beside this note has items 1 to 8, 10 and 11 (`git apply --check` passes on `9af9c66`); 9, 12 and 13 wait for the owner's choice. No repo agent writes user docs as its job; the workers that change UI write guide pages through `doc-screenshot-sync`, so changing the skills reaches them. `docs-governance` is a plugin skill, not this repo's, and is not changed.

### Which pages to rewrite first

Ranked by how many readers hit the page and how far it is from the standard. Effort is one agent's working time including checking each claim against the code; it is an estimate, not a measurement.

| Rank | Page | Reader | Gap | Effort |
| --- | --- | --- | --- | --- |
| 1 | [Getting started](../guides/using-the-app/getting-started.md) | Newbie | Done in this pull request (pilot) | — |
| 2 | Root `README.md` | Newbie, author, contributor | Opens with source layout; the user part (what it is, install, first steps) should come first and link Getting started; developer bootstrap moves down | 2 to 3 h |
| 3 | [Using the app](../guides/using-the-app/README.md) index | Every reader | Add "start here" paths by reader: new narrator, experienced narrator, editor, proofer and QA, author | 1 h |
| 4 | [Booth](../guides/using-the-app/booth.md) (552 lines) | Narrator, daily | Reference-dense; needs a short "Record a chapter" how-to at the top, task headings, a troubleshooting table that gathers the setup problems, what next | 1 to 1.5 days |
| 5 | [Settings](../guides/using-the-app/settings.md) (421 lines) | Experienced user, newbie at setup | True reference; needs a "common tasks" list at the top linking into it, defaults stated per row, what next | 1 day |
| 6 | Release page (`scripts/release/changelog.mjs`, PR template) | Every user | Titles are written for reviewers; add narrator-facing wording rules and two examples to the PR template's release notes section | 2 h |
| 7 | [Production](../guides/using-the-app/production.md) | Narrator | Import is buried at the end; "Import a manuscript" how-to moves up | 0.5 day |
| 8 | [Proof](../guides/using-the-app/proof.md), [Editing](../guides/using-the-app/editing.md), [Pickups](../guides/using-the-app/pickups.md) | Editor, proofer | A worked example of one note from finding to decision | 0.5 to 1 day each |
| 9 | [Delivery](../guides/using-the-app/delivery.md), [Master & QC](../guides/using-the-app/master-and-qc.md) | QA, experienced narrator | Thresholds and sources in tables; "deliver to ACX" how-to | 0.5 day each |
| 10 | The rest of the guide | — | Checklist pass, what next sections | 2 to 4 h each |

### Keeping it from rotting

| Check | What it enforces | False-positive risk | Cost |
| --- | --- | --- | --- |
| Every guide page except the index has a `## What next` heading with at least two links (`docsGuide.test.ts`) | The way on | Low: every app page leads somewhere | 20 lines of test |
| Every guide page embeds at least one screenshot (same test) | Pictures exist | Low: all 13 pages embed one at `9af9c66` | 10 lines |
| Bold UI labels on a guide page exist as a string in `src/studio/ui/src` (advisory script) | Labels match the app | Medium to high: labels built from data (`Link {file}`), plain bold for emphasis, labels in Go. Advisory only, with an ignore list | A day to tune |
| First paragraph under 80 words and names a reader (advisory) | Front-loading | High: "names a reader" cannot be detected reliably | Not recommended |
| Links and headings resolve | Already gated (`docsGuide.test.ts`, lychee) | — | — |
| A troubleshooting section on each page | The way out | Medium: Schedule and Delivery may not need one | Not recommended as a gate |
| Definition of done: guide pages pass the review checklist; a newcomer page is followed by a fresh agent in the real app (doc walkthrough) | The reader's view | None mechanical; it costs an agent run per newcomer-page change | An agent run |

Recommended: the first two checks as test failures, the label check as an advisory report, and the definition-of-done line. The rest stays in review.

## 8. The pilot: Getting started

**Why this page.** It is the first guide page in the index and the public site's first docs page after its overview (`src/web/build/guides.mjs`), and the newcomer's first screen in the app.

**What changed.**

- A tutorial on top: before you start, five steps from starting the app to a first take, one example book throughout, and what next. Each step links the page that holds the detail and the screenshots of that step.
- Two facts no guide page had: New project makes no REAPER project, and a project with no REAPER file records with the built-in recorder until one is linked or chosen.
- The old content kept, under how-to and reference headings: the picker, the REAPER bar, where new projects go, Audacity.
- A troubleshooting table with the app's exact messages.
- The public site's condensed page (`src/web/docs/getting-started.md`) said **Browse folders…**; the button is **Open folder…** (`ProjectPicker.tsx`). Fixed.

**Claims checked against the code.**

| Claim | Source |
| --- | --- |
| New project makes a folder named after the project under the location and opens it, with no `.rpp` | `ProjectCreateIn`, `src/studio/desktop/bindings.go` |
| "a project named … already exists in that location" | same function |
| "No recent projects yet." and "Couldn't load recent projects." | `src/studio/ui/src/components/project/ProjectPicker.tsx` |
| Ten recent projects; pinned ones stay past the cap | `maxEntries` and `Pinned`, `src/studio/desktop/internal/recents/store.go` |
| Opening a project by folder adds it to the list | `recents.Touch` in `ProjectSwitch`, `bindings.go` |
| "This project has no manuscript yet. Import one to begin." | `src/studio/ui/src/components/layout/NeedManuscript.tsx` |
| **Link** with the file's name appears only with exactly one `.rpp` found and the project not linked | `EngineBody.tsx`, `foundFiles.length === 1` |
| No REAPER file and no choice: built-in recorder (where available); a REAPER file in the folder: REAPER | `ProjectKind`, `src/studio/desktop/internal/dawport/adapter.go` |
| The project name in the header has the hint **Switch project** | `src/studio/ui/src/components/layout/AppShell.tsx` |
| The import does not fill the Story Bible; **Scan the manuscript** does | `production.md`; `src/studio/ui/src/components/storybible/ActionsMenu.tsx` |
| **Create a new track**, the first-take model download, Record and Stop | [Booth: Recording](../guides/using-the-app/booth.md#recording), [the microphone](../guides/using-the-app/booth.md#the-microphone-the-booth-listens-to) |

**Not done in the pilot.** No new screenshots: the steps' images already exist on their reference pages, and the one-page rule (finding 4) blocks reusing them, so the tutorial links to them. No walkthrough of the rewritten page by a fresh agent in the real app; that is pending, owned by the coordinator, and is the check item 10 of the plan would make routine.
