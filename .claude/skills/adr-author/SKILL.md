---
name: adr-author
description: Decide whether a change needs an ADR (almost never) and, if the owner agrees it does, write or supersede one. Load before creating any file in docs/adr/.
---

# adr-author

## Start by assuming there is no ADR

`docs/adr/` holds eight decisions that reshaped the whole repo: the host language and shell, the platform, the process model, the DAW port, typed boundaries, local-first consent, files-beside-the-project storage and the UI stack. Of ten pull requests, one adding an ADR is unusual; two open pull requests that both add one, or whose numbers clash, mean ADRs are being written for things that are not decisions of this size.

A new page, control, setting, threshold, token, sidecar mode, asset, gate, workflow or refactor is **not** an ADR. `docs/adr/README.md`, "When to write one", has the table of where each belongs. Record it there, with a test, and stop.

## The test

Can you finish this sentence about something that is not already in the eight? "Reversing this means rebuilding ___ across the whole repo." If the blank is a page, a package or a feature, it is not an ADR. If it is the language of the host, a platform, the database, the UI framework or the process model, it is.

If it passes, **ask the owner before writing**. State the sentence and the candidate. Do not open a Proposed ADR to get an answer: an ADR is written after the code lands, never as a proposal. Proposals belong in a PRD.

## Writing one (with the owner's agreement)

1. Read `docs/adr/README.md` for the template and take the next four-digit number. Check it again before you push; if another pull request took it, one of the two should not be an ADR.
2. Write the file `docs/adr/NNNN-title-that-states-the-decision.md`. The Significance line names the whole-repo thing that changes. Context ends with the options considered and why each lost. Decision names concrete files. Consequences are honest about what it costs.
3. Add its row to the index in `docs/adr/README.md`. There is no generator.

## Superseding

An accepted ADR is never edited to reflect a changed mind: that erases the reason for the old choice. Write a new ADR with `**Supersedes:** ADR-NNNN` under its Date, and change only the old ADR's `**Status:**` line to `Superseded by ADR-MMMM`. Update both rows of the index. Everything about how the app works today lives in the other documents, which are rewritten freely.
