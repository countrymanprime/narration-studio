# Local language model spike: candidates, cost, quality and quote discipline

**Date:** 2026-10-12. **Issue:** [#1272](https://github.com/countrymanprime/narration-utils/issues/1272), Phase 9 (Could) of the [Studio Next extraction PRD](../prds/studio-next-extraction-and-analysis-tools.prd.md). **Question:** is there a local language model small enough for a 16 GB Windows computer that is worth offering as an optional analysis tool, and under what condition would the catalogue row's `unavailable` be lifted?

**Recommendation: keep unavailable. No default changes.** Every model below fits 16 GB, but the only measurements are from the 2026-10-10 trial on a 4-vCPU CPU, where a book took 3 to 11 hours, and the [SN-X8 calibration table](studio-next-extraction-calibration.md) holds no figure for any source, so the model cannot yet be compared with the rules baseline. Section 5 states what lifts it.

## Method and what was run

- **Desk research on 2026-10-12.** Model cards, file sizes and file digests were read from the Hugging Face API (`huggingface.co/api/models/<repo>?blobs=true`) through the session proxy. No model file was downloaded, so none was hashed here. The digests below are the SHA-256 values the host publishes for each file (the Git LFS object id).
- **Earlier measurements.** Speed, memory, quote and attribution figures are from the hands-on trial of 2026-10-10 in [`local-llm-research.md`](mockups/studio-next/research/local-llm-research.md) section 9: Qwen3 1.7B, 4B and 8B with `llama-cpp-python` on a 4-vCPU, 15 GB CPU-only VM, on *Alice's Adventures in Wonderland* chapters V to VIII (quote attribution on chapter VI, 61 hand-labelled quotes). *Alice* is public domain and in every model's training data, so those figures are optimistic, and they are provisional until the same run is made on the owner's manuscript (D70). They are quoted here, not re-measured. The trial's scripts are not in the repo.
- **Not run in this session:** any model. This session has 4 vCPU and 15 GB RAM (the same as the trial), and the repo's calibration harness cannot score a source without its gold set, which does not exist yet ([calibration note](studio-next-extraction-calibration.md)). Everything not covered by the trial is marked `not run`.

## 1. Candidates

All three are Apache-2.0 and fit 16 GB. Pinned values were read on 2026-10-12; a pin is final only when the app's registry row is written.

| Candidate | Host and repository revision | File, quantization, size | SHA-256 (host-published) | Licence |
| --- | --- | --- | --- | --- |
| Qwen3 8B | `huggingface.co/Qwen/Qwen3-8B-GGUF`, revision `7c41481f57cb95916b40956ab2f0b139b296d974` | `Qwen3-8B-Q4_K_M.gguf`, Q4_K_M, 5,027,783,488 bytes | `d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785` | Apache License 2.0. The repository's `LICENSE` file is the Apache 2.0 text ("Apache License, Version 2.0, January 2004"); the card's `license` field says `apache-2.0` |
| Qwen3 4B | `huggingface.co/Qwen/Qwen3-4B-GGUF`, revision `bc640142c66e1fdd12af0bd68f40445458f3869b` | `Qwen3-4B-Q4_K_M.gguf`, Q4_K_M, 2,497,280,256 bytes | `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5` | Apache License 2.0, same terms as above |
| Gemma 4 E4B (QAT) | `huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf`, revision `4b4a2c1d584be7264f87aac328a1bc739ce81b6c` | `gemma-4-E4B_q4_0-it.gguf`, Q4_0 from quantization-aware training, 5,154,941,280 bytes. The repository's `gemma-4-E4B-it-mmproj.gguf` (991,552,256 bytes) is for images and is not needed | `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee` | Apache 2.0. The card header links the terms at `ai.google.dev/gemma/docs/gemma_4_license`, which was not fetched; the licence text is `PENDING` until the registry row copies it |

Reasons for the choice:

- Qwen3 8B and 4B are the two sizes the trial measured, so the quality figures below belong to them. They are the 2025-05 releases; the later Qwen3 2507 refresh and Qwen3.5 were not examined.
- Gemma 4 E4B is the one candidate from another family with a first-party GGUF under Apache 2.0 (earlier Gemma versions used Google's own terms, [`local-llm-research.md`](mockups/studio-next/research/local-llm-research.md) section 1.1). Nothing about its quality on this task was measured or found.
- Llama 3.x (community licence with an acceptable-use policy) and Phi-4 (short context) were left out for the reasons in that section.

A GGUF is loaded by a runtime (`llama.cpp`, or `llama-cpp-python` as in the trial). Registering a model as a tool would also need the runtime pinned and its loading confined to the install folder, as [ADR 0848](../adr/0848-optional-analysis-tools-load-their-code-and-weights-from-the-registrys-install-folder-never-from-the-freeze-or-the-network.md) requires of the other tools. This spike pins no runtime.

## 2. Time and memory

**Measured here: not measured here for any candidate.** The trial's CPU-only figures, per chapter of 2.2k to 2.6k words (prompt 3.4k to 3.9k tokens, output capped at 1,600 tokens), peak resident memory at an 8,192-token context:

| Model | Generation | Extraction call per chapter | Peak memory | Projected per 90k-word book |
| --- | --- | --- | --- | --- |
| Qwen3 4B Q4_K_M | 4.6 to 5.1 tokens/s | 113 to 415 s (mean 329 s) | 6.7 GB | about 7 h with one quote pass per chapter |
| Qwen3 8B Q4_K_M | 3.2 to 3.4 tokens/s | 567 to 594 s | 10.8 GB | about 11 h |
| Gemma 4 E4B QAT Q4_0 | `not run` | `not run` | `not run` | `not run` |

The book projections multiply the chapter times by about 40 chapters ([`local-llm-research.md`](mockups/studio-next/research/local-llm-research.md) section 9.2) and are estimates, not runs. For comparison, the GLiNER small model took 2.0 to 2.4 s per chapter in the same trial. An 8B model at 10.8 GB leaves little room beside the app on 16 GB.

**Command for the owner's machine** (pending, owner step, D65), with a build of `llama.cpp` for Windows and a candidate's `.gguf`:

```text
llama-bench -m <model>.gguf -p 4096 -n 512 -t <physical cores> -r 3
```

`-p` is the prompt-processing speed over a chapter-sized prompt and `-n` the generation speed; seconds per chapter is the prompt length over the first plus the output length over the second. Peak memory is the Task Manager Details column "Peak working set" for `llama-bench.exe` after the run. Record the CPU model, core count, RAM, GPU if used, and the `llama.cpp` build.

## 3. Quality against the SN-X8 table

**Against the table: not run.** The [calibration note](studio-next-extraction-calibration.md) records no scored source, no gold set and no table, so there is no rules-baseline precision to compare with, and no model has been scored by the harness. The harness takes a model's output as an imported file:

```text
python scripts/research/extraction-calibration/run_calibration.py run --import-file <output.json>
```

The file comes from the app's import prompt template run through the model; the harness's [README](../../scripts/research/extraction-calibration/README.md) lists the data it needs.

What the 2026-10-10 trial measured, with its own hand-made gold set and an ad hoc regex baseline (not the repo's extractor, and not the SN-X8 gold):

| Task | Qwen3 4B | Qwen3 8B | Rules baseline in the trial |
| --- | --- | --- | --- |
| Speaker of 61 quotes in *Alice* chapter VI | 53 of 61 (87%); 53 of 54 answers right when it did not abstain | 54 of 61 (89%); the 7 misses all confidently name the wrong footman | 55 right, 4 unknown, 2 wrong |
| Claims (what a character says, does, knows) judged true and specific | 26 of 75 (35%); 15 false (20%) | 35 of 41 (85%) on chapter VI; 5 false (12%) | not applicable |
| Characters found, of 24 | 16 across two passes | 7 of 8 on chapter VI | GLiNER found 24 of 24 |

Confident but wrong, using the trial's placeholder score (pass agreement plus a check that a speech verb and the speaker's name sit in the paragraph) with 0.75 as the line:

- Speakers at or above 0.75: 47 of 47 right for the 4B and 50 of 50 for the 8B, so 0% wrong. The separation came from the code-checkable tag check, which the rules baseline also uses, not from the model.
- Claims at or above 0.75: the 4B was right on 8 of 12 (67%), so 33% of confident claims were wrong under the strict reading, far above the 5% failure line the [calibration note](studio-next-extraction-calibration.md) proposes. The 8B had 2 such claims, both right, which is too few to say anything.
- Agreement between passes predicted correctness for the 4B and failed for the 8B, whose two passes gave identical answers including every wrong one.

Reading: on explicit speech tags a small model adds nothing a rule does not already get. Its useful part was the 7 implicit quotes, which the 4B and 8B both attributed correctly. Descriptions and relationships need the 8B class and still showed 12% false claims on a text the model has seen.

## 4. Quote discipline

[`extraction.VerifyEvidence`](../../apps/desktop/internal/extraction/evidence.go) never accepts a quote the text lacks: it searches the named paragraph, then its chapter, then the book, folds only typographic quotes and the non-breaking, thin and narrow spaces, and returns the manuscript's own offsets and text. It reports `ok` false for an empty or missing quote, which sends the suggestion to Needs verification.

**Rate with `VerifyEvidence`: `not run`.** No model output was passed through it. The trial used its own normalising search, so its rates bracket the result:

| Model | Claim quotes found exactly in the cited paragraph | Found elsewhere in the chapter | Not found |
| --- | --- | --- | --- |
| Qwen3 4B | 47 of 78 (60%) | 12 (15%) | 19 (24%) |
| Qwen3 8B | 37 of 41 (90%) | 2 | 2 |
| Qwen3 1.7B | 13 of 21 | 0 | 8 |

- `VerifyEvidence` accepts "elsewhere" quotes, so the expected acceptance is about 75% (4B) and 95% (8B), less wherever the trial's normalisation was looser than the fold above. The trial's own check found that 8 of the 18 quotes it rejected from the 4B were true, mostly dropped closing quote marks or altered punctuation; `VerifyEvidence` does not forgive those either, so they would go to Needs verification, which is safe but adds work.
- Finding a quote proves the quote exists, not that it supports the claim. Of the 4B's 45 exactly-verified quotes, 11 did not support the claim. No existing check catches that.
- Aliases the model proposed were literal text in 76% of cases for the 4B and 94% for the 8B (17 of 18); the rest were invented epithets, so an alias must be searched for as well.

## 5. Recommendation

**Keep unavailable.** The catalogue row `local-llm` in [`components.ts`](mockups/studio-next/src/fixtures/components.ts) keeps its text, "A model small enough for this computer takes many hours per book. It will be offered once that is practical." The row's size and RAM there (5,030 MB, 11 GB) are the Qwen3 8B figures; the licence line, "Licence to be confirmed before it is offered", can now say Apache 2.0 for the Qwen3 files. No default, threshold or setting changes. Nothing in this note drops the tier: offering it is a later decision once the following hold.

`unavailable` is lifted when all of these are recorded in a dated note:

1. **A table exists.** The SN-X8 harness has scored the rules baseline and the model's imported output on the scored books, and the model's precision with quotes is above the baseline's for at least one kind of suggestion, with the confident-but-wrong share under the failure line the owner sets in the calibration note.
2. **Time is practical.** `llama-bench` on the owner's machine, and on one lower-spec Windows machine if the owner has one, shows a book finishing in a time the owner accepts as a background job. The owner sets the number; the trial's 3 to 11 hours is not it.
3. **Memory fits.** Peak memory beside the app is under the 16 GB machine's free memory with room to spare, which excludes Qwen3 8B at 8,192 context unless the context or the file shrinks.
4. **Quotes pass.** A run through `VerifyEvidence` gives the rate in section 4, and the share of verified quotes that do not support their claim is measured and acceptable.
5. **Pins and licence.** The runtime and one model file are pinned with their digests streamed and recorded, and the licence text is copied into the registry row ([ADR 0848](../adr/0848-optional-analysis-tools-load-their-code-and-weights-from-the-registrys-install-folder-never-from-the-freeze-or-the-network.md)).
6. **The owner's manuscript.** The same run on the owner's own book, because every figure on public-domain text is provisional (D70).

The first and sixth steps depend on the SN-X8 re-run already on the QA checklist ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)); the second, third and fourth need the owner's machine and are pending, D65. None blocks a merge or a launch. "Drop" is also open: if the first condition fails once a table exists, the tier has no use that BookNLP and the rules do not cover.
