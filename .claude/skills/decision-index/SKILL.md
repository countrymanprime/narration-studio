---
name: decision-index
description: Find the recorded decisions (ADRs) that govern a change before planning or coding it, by topic or by word, and read the right ones. Load before a plan, a refactor or a review that touches behaviour an ADR might have settled.
---

# decision-index

## Why this exists

`docs/adr/` has hundreds of decisions and its index is one flat table in number order. A plan that reads none of them reverses a decision by accident; a plan that tries to read all of them never starts. [The topics page](../../../docs/adr/topics.md) groups every ADR under one topic, generated from the ADR files, so a plan reads the few dozen that matter.

## When to use this

Before the plan for any change that touches behaviour, a boundary, a primitive or a rule. Also when `design-spec-guard` says an ADR may apply, when a review asks "was this decided?", and before `adr-author` writes a decision that might supersede one.

Skip it for a typo or a change inside one function that no ADR names.

## What to do

1. **Pick topics from what you will touch.**

   | You will touch | Topic ids to read |
   | --- | --- |
   | `integrations/reaper/`, `internal/bridge/`, `internal/dawport/`, `internal/audacitybridge/` | `daw-integration`, `ports-and-providers`, `consent-and-safety` |
   | A Wails binding, an event, a payload, `apps/ui/src/api/` | `wire-contracts-and-bindings`, `persistence-and-project-files` |
   | `apps/ui/src/components/primitives/`, `styles.css`, a page's layout | `ui-primitives-and-design-system`, `accessibility-and-interaction`, `visual-testing-and-mock-fidelity` |
   | `sidecars/`, `libs/python/`, `internal/assets/`, a model or voice | `assets-and-downloads`, `local-first-and-privacy`, `ports-and-providers` |
   | Import, chapters, credits, the Story Bible, pronunciation | `manuscript-import-and-story-bible` |
   | The teleprompter, Booth, read-aloud, recorder, resume | `teleprompter-and-read-aloud`, `daw-integration` |
   | Recording check, takes, proofing, stage recommendations | `recording-check-and-takes` |
   | Measurement, delivery, mastering, encode, production, series | `mastering-delivery-and-production`, `local-first-and-privacy` |
   | CI, release, update, installer, licences | `release-ci-and-supply-chain`, `verification-and-code-health` |
   | Docs, PRDs, ADRs, GitHub tracking | `docs-and-process` |

   Always add `consent-and-safety` when the change makes the app do something on its own.
2. **List the topic or search by word.** From the repo root:

   ```bash
   node scripts/ci/adr-topics.mjs --topic daw-integration
   node scripts/ci/adr-topics.mjs --grep undo block
   ```

   The topics page has the same lists with links. A word search finds an ADR the topic grouping put somewhere unexpected, since each ADR sits under one topic only.
3. **Read the Decision and Consequences of each ADR that could apply**, not just its title. Titles are one line of a longer rule.
4. **Respect status.**
   - **Accepted:** a rule. Follow it.
   - **Accepted (amended by ...)** or a status naming another ADR: read the amending ADR as well; the two together are the rule.
   - **Superseded by ...:** history. Follow the ADR that supersedes it.
   - **Proposed:** the code does this but the owner has not accepted it. Treat it as current behaviour, say in the plan that you are relying on a Proposed ADR, and do not build a second feature on it without asking.
5. **Write a precedent table in the plan.** One row per ADR that applies: number, status, the rule in a clause, and what it means for this change (follows, extends, or conflicts).

   | ADR | Status | Rule | Effect on this change |
   | --- | --- | --- | --- |
6. **A conflict is surfaced, not resolved silently.** If the change contradicts an Accepted ADR, name the ADR, quote the Decision line, and ask the user whether it is an intentional supersession (then `adr-author` after the code lands) or an accident. Never edit the code to match an ADR without saying so.
7. **If nothing applies, say so.** An empty precedent table after searching the right topics is a finding, and a sign the change may need an ADR of its own.

## Keeping the index true

- `docs/adr/topics.md` is generated: `node scripts/ci/adr-topics.mjs --write`. `pnpm check` fails when it is stale or when an ADR has no topic.
- A new ADR is claimed by a title pattern in `scripts/ci/adr-topics.json`, or pinned there by number. `adr-author` should add the pin when no pattern fits. Topics are looked up by title, so a title that states the decision plainly is also easier to find.
- The grouping is a lookup aid, not a taxonomy: change the config when a search keeps missing.

## What this skill is not

It does not decide whether a change is acceptable; the ADRs and the owner do. It does not summarise principles (`design-principles` does) or check a UI change against the design system (`design-spec-guard` does, and starts from this skill's lists).
