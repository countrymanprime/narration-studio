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

1. **Run the check.** `node scripts/ci/docs-impact.mjs` compares the change (committed, staged, unstaged and untracked) against `origin/main` using `scripts/ci/docs-impact-map.json`, and names the docs a rule still owes. It covers ten rules, not everything below, so a pass does not mean no doc is owed. `pnpm check`, the `Docs impact` job and the `Stop` hook run the same script.
2. **List the change.** `git diff --name-only origin/main...HEAD` plus `git status --short` for untracked files, for the paths no rule covers.
3. **Map each path to its owed docs** with [references/map.md](references/map.md). Check the whole map, not the first match: a file can owe more than one doc.
4. **Open each owed doc and check what it says against the new code.** Fix the lines that are now false: names, commands, counts, flags, event and command tables, diagrams, status labels. Update the status label in `docs/README.md` when a utility's state changes.
5. **Add a doc** when the change introduces something a reader needs and no page covers it. Pick the page type with [docs-style](../docs-style/SKILL.md) and register it: the `docs/README.md` inventory or reading order, and `tools/docs-site/include.txt` if it is to be published.
6. **Run the dependent skills** the map names: `doc-screenshot-sync` for UI, `adr-author` for a decision, the trust-boundary step of `feature-cleanup`.
7. **Run `doc-unslop`** on the Markdown you touched.
8. **If no doc is owed,** say so as `Docs: none — <reason>` in the PR description (CI), a commit message (`pnpm check`) and your final message (the hook). A reason names why no behaviour, contract, command or boundary changed (for example "internal rename, no documented name"). "Not needed" is not a reason.
9. **Report** the paths changed, the docs updated or added, and any owed doc you did not update with the reason.

## The gates around it

[Documentation gates](../../../docs/operations/documentation-gates.md) lists the checks this skill sits beside. The order for a change that owes docs:

1. Write with [docs-style](../docs-style/SKILL.md): state what code, a command or a test shows, link instead of copying, one page type per page.
2. Run this skill before `feature-cleanup`.
3. Run [doc-unslop](../doc-unslop/SKILL.md) on the Markdown you touched. It cuts and does not add facts.
4. If no doc is owed, put the `Docs: none — <reason>` line in the pull request description.

The docs-impact script also runs as a `Stop` and `SubagentStop` hook (`.claude/settings.json`). It asks once per stop. If it blocks, update the doc or repeat the `Docs: none` line in your final message.

## Guard against empty edits

The script checks paths only. Touching a doc without changing what it says (a whitespace edit, a date bump) is not an update. The edit must change a statement that the code change made false, or add the missing one.

## What this skill is not

It does not check links (`lychee` in `docs.yml` does) or Markdown style (`markdownlint`). It does not write ADRs; `adr-author` does.
