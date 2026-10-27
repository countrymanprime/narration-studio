# Extraction scans: whole book or per chapter

Owner question (#18): why does the BookNLP import take so long, and why not run BookNLP or GLiNER in parallel on chunks and merge the results? This page records how a scan runs today, where the time goes, what the earlier research said, and a design for chunking. Nothing in the code changed.

## How a scan runs today

- The host runs the selected sources one after another (`runExtractionScan`, `src/studio/desktop/extraction_job.go`). There is no goroutine pool. Progress is `done/len(sources)`, so BookNLP is one step of the bar however long it takes (`sourceDone`).
- Each of GLiNER and BookNLP is one sidecar process (`suggest --source ...`) that reads the whole manuscript. The model loads once per process.
- **BookNLP** gets the whole book as one text (`book_text`, `BookNlpExtractor.extract`) and one `BookNLP.process` call (`BookNlpModel.analyse`). Coreference, character clustering and speaker attribution are therefore book-wide.
- **GLiNER** loops over paragraphs in one thread and cuts a paragraph longer than 180 words into windows (`GlinerExtractor.extract`, `_chunks`). It keeps no state between paragraphs except the best-scored span per name.
- Parallelism: none in the scan. **Parallel processes** (`parallel_workers`, 0 = Automatic) is a Recording check setting (`Recording check` section, `internal/coverage/workers.go`: half the processors, capped by 75% of free memory over the model's size). The extraction scan never reads it. Torch's own intra-op threads are the only parallelism, and BookNLP's sidecar does not set them.

## Where the time goes

Not measured here: this container (4 vCPU, 16 GB) has no torch, `booknlp` or `gliner`, and the weights are an optional download. The figures are the 2026-10-10 trial's (4 vCPU CPU, Alice chapters V to VIII; `studio-next-booknlp-spike.md`, `studio-next-gliner-spike.md`):

| | Small weights | Large weights |
| - | - | - |
| BookNLP, chapter VI alone (2.6k words) | 6.8 s | 17.7 s |
| BookNLP, four chapters (9.5k words) | 15.6 s | 62.4 s |
| BookNLP peak memory, one chapter / four | 1.19 / 1.57 GB | 2.59 / 3.12 GB |
| GLiNER, per chapter | 2.0 to 2.4 s (model load 3.7 s, 2 GB) | |

- BookNLP's cost is close to linear in words (large: 17.7 s for 2.6k words, 62.4 s for 9.5k). A 90k-word book is about 10 minutes on the large weights and 2.5 minutes on the small. Model load is a few seconds of that, paid once. So the time is per-word inference, not load.
- GLiNER is about 1.5 minutes per 90k-word book and is not the problem.
- Chunking does not reduce total work. It can only reduce wall time by using more cores, and torch already spreads one process over the cores. Expect well under 2x from a worker pool on 4 cores, and every large-weights worker costs about 2.6 GB.

## What was said before

- `docs/research/mockups/studio-next/research/local-llm-research.md` plans chunking by chapter for the LLM map pass ("resumable per chapter ... a cancel loses at most one chapter", line 93; "chunking: by chapter", line 115) and says "do not attempt pronoun coref at book scale ... optional BookNLP/Maverick per chapter" (line 122).
- No ADR and no issue covers it (search of the issues and `docs/adr/` found none). `extraction_booknlp.py` never implemented the per-chapter run; the SN-X72 adapter runs the book whole.

## What chunking changes about BookNLP's output

- Coreference restarts in each chunk. Character ids are chunk-local, so characters must be re-joined across chunks by name. The adapter already does that within one analysis (`_key`, `kept`, the `duplicate` alias flag), so it would run over the union.
- A character known only by a common noun ("the Captain") cannot be linked across chapters.
- A pronoun-only stretch loses its antecedent at a chapter start; speakers there become `None` or resolve to a chunk-local name that differs from the book-level display name ("the girl" vs "Alice").
- The gender estimate sees fewer pronouns per chunk and is noisier; merging by count-weighted vote over chunks is needed.
- The speaker and gender confidences are per suggestion already (`SPEAKER_CONFIDENCE`, BookNLP's own `max`), so they carry through a merge unchanged. BookNLP gives no score for an entry, and a chunk count is not a calibrated confidence.

## Design

1. Chunk = chapter (`chapterId`), with a chapter over a word cap split at paragraph boundaries. A chunk never splits a paragraph, so quote offsets stay inside one paragraph as `locate` requires.
2. One sidecar process holds a pool of N workers that each load the model once. N comes from the host, which plans it from processors and free memory as `coverage.PlanWorkers` does and sends `--workers N` (as `--parallel-workers` is sent for coverage). Automatic stays "half the processors, fewer if the memory does not fit"; `0` is never reported as a number it did not run.
3. The sidecar prints chunk results in manuscript order whatever order the workers finish in, and one progress record per chunk on stderr for the host to show in the existing result box (`job.say`, `percent`).
4. A failed chunk is logged and skipped; the others are kept, and the scan says which chapters it could not read. Nothing is raised as page text; it goes to the result box and a toast.
5. Merge at book level: entries by `_key` with aliases unioned and the evidence from the first chunk; speakers and genders as the chunks gave them, with their own confidences; gender by count-weighted vote. GLiNER's merge is unchanged (best score per name already crosses chunks).
6. All text IO stays explicit UTF-8, including the per-chunk temporary folder.

## Decisions for the owner

- **Quality for speed on BookNLP.** Chunking loses cross-chapter coreference. Recommended: do not change BookNLP's default until a gold-set comparison (SN-X8, `studio-next-extraction-calibration-protocol.md`) shows chunked and whole-book runs agree on entries and tagged-speaker accuracy; offer chunked as the choice for long books, and say what it trades in the scan's result box.
- **Which setting.** **Parallel processes** is labelled and described for Recording check only. Either a second row in a Scan section or a rename is needed; the Automatic wording must be shared.
- **GLiNER first.** It has no cross-chunk state, so chunking it loses nothing, but it takes about 1.5 minutes per book, so the gain is small. It is the right first slice to prove the pool, ordering and failure handling.

## Measure before building

On the owner's machine, with `measure_booknlp.py` from the spike: whole book against per-chapter with 1, 2 and 4 workers, large and small weights, recording wall time and peak memory. The pool is worth building for BookNLP only if 2 workers give a clear gain over one process.
