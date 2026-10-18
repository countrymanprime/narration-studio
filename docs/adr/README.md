# Architecture decision records (ADRs)

An ADR records a decision that changed the whole shape of the app and would be expensive to undo: for example the language the app is written in, or the choice to use local models and tools so the app is free to run. It says why, so a later change, by a person or an agent, sees the reason before reversing it.

Few things qualify. That is the point: most things that feel like decisions are timing, convenience or standard practice, and those belong in the documents that describe how the app works.

Most pull requests have no ADR. If one in ten does, that is unusual. If several open pull requests add ADRs, or their numbers clash, ADRs are being written for things that are not decisions of this size, and the work is being recorded in the wrong place.

## When to write one

Write an ADR only when reversing the decision would restructure the whole repo or change what the app is: rewriting it in another language, or moving analysis from local models to paid online services. If you cannot name something at that scale that changes, it is not an ADR.

Examples of decisions that were once ADRs here and are not, with the reason: **which platforms ship** (timing and maturity: there is no Mac or Linux machine to test on, and it can change when someone helps); **which language runs a model** (convenience; anything that runs the model and speaks the contract can replace a Python sidecar); **ports, resolvers and typed contracts** (standard interface and substitution design, SOLID); **where project data is stored** (standard persistence behind interfaces); **the UI component library and CSS** (a standard atomic-component pattern; React is the framework, and the styling layer is replaceable).

These are not ADRs. Record them where they belong, and keep that document describing the current state:

| The decision is about ... | Record it in | And pin it with |
| --- | --- | --- |
| What a page, dialog or control does, its copy, its shortcut | the PRD while it is being built; the [user guide](../guides/using-the-app/README.md) page once built | a test |
| A token value, size, colour or component look | [the design system](../design/design-system.md) | the visual and atlas tests |
| How a subsystem works (import, teleprompter, the DAW bridge, coverage) | its page in [architecture](../architecture/) | a test |
| A file the app writes and reads back | [data files](../reference/data-files.md) | a test that writes and reads it back |
| A threshold, default, field, error code or one function's rule | a doc comment beside the code | a test beside the code |
| CI, the release pipeline, the docs workflow, the agent train, housekeeping | `CONTRIBUTING.md`, [operations](../operations/), or `.claude/` | a CI check where one fits |
| An open product question | the PRD's decisions | |

A new feature, a new page, a new setting, a new sidecar mode, a new asset or a new threshold is never an ADR on its own.

## What an ADR means, and why you supersede it

An ADR is a dated record of what was decided, why, and what it cost. It is history that stays true about its moment. So an accepted ADR is **never amended**. Rewriting it to fit a changed mind erases the reason for the old choice, and the next person cannot tell whether the old choice was a mistake or the world changed.

When the decision changes, write a **new ADR** that says what replaces it and why. Add `**Supersedes:** ADR-NNNN` under its Date line, and change only the `**Status:**` line of the old one to `Superseded by ADR-NNNN`. Both stay in the folder.

Describing how the app works today is the job of the other documents, which are rewritten freely. If you find yourself wanting to edit an ADR's Decision text to keep it current, the detail did not belong in an ADR: move it to a document that tracks the current state, and leave the ADR to state the decision.

## Format

Status, Significance, Date, Context (ending with the options considered and why each lost), Decision, Consequences. [The template](#template) is below; there is no other file to copy. Number the next ADR with the next free four-digit number. Two pull requests that both need a number are a sign that one of them is not an ADR.

### Template

```markdown
# NNNN. Short title that states the decision

**Status:** Proposed | Accepted | Superseded by ADR-NNNN
**Significance:** What whole-repo thing this changes, and why reversing it is costly. If you cannot fill this line, do not write the ADR.
**Date:** YYYY-MM-DD
**Supersedes:** (ADR-NNNN, if any)

## Context
What forced the decision. Ends with **Considered options:** each option and why it lost.

## Decision
What was decided, naming the concrete files or components.

## Consequences
What becomes easier, what becomes harder, and what it takes to override this decision.
```

## Index

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-the-app-is-written-in-go.md) | The app is written in Go | Accepted |
| [0002](0002-local-models-and-tools-come-first-so-the-app-is-free-to-use.md) | Local models and tools come first, so the app is free to use | Accepted |

## History

On 2026-10-17 the folder was rebuilt. The 375 earlier records were mostly page behaviour, token values, thresholds and process rules that had been filed as ADRs. Each rule that still holds now lives in the document that describes the current state (the user guide, the design system, the architecture pages, the data-files reference, a doc comment or a test). The decisions that qualified were kept as ADRs and are listed in the index. The old files remain in git history at commit `9be197f`, the last commit before this rebuild.
