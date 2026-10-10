---
name: doc-unslop
description: Review changed documentation for AI filler and unverifiable claims, and cut them without adding facts. Run on changed docs, skills and CLAUDE.md before a change is called done.
---

# doc-unslop

## Why this exists

Agent-written prose picks up filler: significance claims, sales words, restated headings, hedges standing in for facts. None of it can be checked, and it buries the lines that can. This skill is the review pass that cuts it. It follows [docs-style](../docs-style/SKILL.md).

## When to use this

On every Markdown file the change adds or edits (`docs/`, READMEs, ADRs, PRDs, skills, `CLAUDE.md`), after the content is right and before `feature-cleanup`. Scope it to the diff (`git diff --name-only origin/main...HEAD -- '*.md'`), not the whole tree.

## What to do

1. **Read only changed lines and their section.** Do not rewrite untouched prose.
2. **Mark each sentence** keep, cut or fix. Ask of each: can a reader verify it from code, a command, a test or a link? Would they miss it if it were gone?
3. **Cut or fix on a single sighting:**
   - Staged openings: "In today's…", "It is worth noting that…", "It is important to…".
   - Inflation: "plays a crucial role", "serves as", "stands as", "testament", "pivotal".
   - Sales words: "seamless", "robust", "powerful", "cutting-edge", "comprehensive". "Robust" and "comprehensive" are fine when a test or spec backs them; name it.
   - Vague attribution: "experts say", "studies show", "best practice" with no link.
   - Closers: "In conclusion", "Overall", "I hope this helps", a one-line dramatic last sentence.
   - Chat residue: "Certainly!", "Great question", "As an AI".
   - Promises with no check: "ensures", "guarantees" with no test or command named.
4. **Cut or fix when several appear together** (weak alone): forced triads, "not just X but Y", trailing "-ing" clauses that add significance, em-dash runs, decorative bold, emoji, title-case headings.
5. **Judgment cuts:**
   - A first sentence that restates the heading.
   - "This section describes…".
   - Text that explains what the code already shows.
   - A section that copies a generated or linked source. Replace it with a link.
   - "Currently", "now", "recently" with no date or version.
   - A "why" paragraph with no ADR behind it. Propose `adr-author` or cut.
6. **Cut, do not rewrite.** Do not add a fact, name, number or citation. If a sentence needs a source you do not have, mark it `unverified` in your report and leave the choice to the author.
7. **Leave alone:** code blocks, file paths, link targets, YAML front matter, quotations, ADR titles, product names, and a term the repo defines.
8. **Report** each cut as `file:line — pattern — action`, then the net lines removed. Restrict findings to inaccuracy, unverifiable claims, redundancy and filler. Do not report style preference.

## What this skill is not

It is not a fact check against code (that is `doc-impact-check` and review). It does not gate on a count of em dashes or triads. Detectors of AI text are unreliable, so judge each sentence by whether it carries a checkable fact, not by how it sounds.

Patterns are adapted from [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) and [blader/humanizer](https://raw.githubusercontent.com/blader/humanizer/main/SKILL.md). The no-new-facts rule is from the latter.
