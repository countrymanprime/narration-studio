---
name: doc-impact-check
description: Map a change's diff to the docs it owes (architecture, utilities, guides, threat model, ADRs, screenshots) and update them, or record why none is owed. Run before feature-cleanup.
---

# doc-impact-check

## Why this exists

`pnpm check` passes when code changes and the docs describing it do not. The result is docs that describe last month's behaviour. This skill finds the docs a change owes from the diff, so the update happens in the same change.

## When to use this

After implementation and before `feature-cleanup`, for any change to code, config, scripts, workflows or a skill. A change that touches only Markdown skips it.

## What to do

1. **List the change.** `git diff --name-only origin/main...HEAD` plus `git status --short` for untracked files.
2. **Map each path to its owed docs** with [references/map.md](references/map.md). Check the whole map, not the first match: a file can owe more than one doc.
3. **Open each owed doc and check what it says against the new code.** Fix the lines that are now false: names, commands, counts, flags, event and command tables, diagrams, status labels. Update the status label in `docs/README.md` when a utility's state changes.
4. **Add a doc** when the change introduces something a reader needs and no page covers it. Pick the page type with [docs-style](../docs-style/SKILL.md) and register it: the `docs/README.md` inventory or reading order, and `tools/docs-site/include.txt` if it is to be published.
5. **Run the dependent skills** the map names: `doc-screenshot-sync` for UI, `adr-author` for a decision, the trust-boundary step of `feature-cleanup`.
6. **Run `doc-unslop`** on the Markdown you touched.
7. **If no doc is owed,** say so in the PR description as `Docs: none — <reason>`. A reason names why no behaviour, contract, command or boundary changed (for example "internal rename, no documented name"). "Not needed" is not a reason.
8. **Report** the paths changed, the docs updated or added, and any owed doc you did not update with the reason.

## Guard against empty edits

Touching a doc without changing what it says (a whitespace edit, a date bump) is not an update. The edit must change a statement that the code change made false, or add the missing one.

## What this skill is not

It does not check links (`lychee` in `docs.yml` does) or Markdown style (`markdownlint`). It does not write ADRs; `adr-author` does.
