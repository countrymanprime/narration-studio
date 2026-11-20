# Local model for speaker attribution: SpeakerLM and the alternatives

**Date:** 2026-11-20. **Issue:** [#3663](https://github.com/countrymanprime/narration-studio/issues/3663). **Question:** is SpeakerLM, or another local model, worth using to say who speaks each quote in the manuscript, judged on accuracy, size, speed, licence and how it would sit behind a port?

**Recommendation: do not adopt SpeakerLM; keep the rules as the default; measure one small local model as a fallback for the quotes the rules leave `unknown`, and only on the owner's own manuscript.** Nothing was benchmarked in this session (see "What was not run").

## SpeakerLM answers a different question

SpeakerLM (Tongyi Lab, Alibaba; AAAI 2026, arXiv 2508.06372) is a multimodal model for **audio**: it takes a recording and returns who spoke when and what they said. The paper's snippets describe a SenseVoice-large audio encoder, ERes2NetV2 speaker embeddings for registered speakers and a Qwen2.5-7B-Instruct backbone. The app's problem is **text**: given a paragraph of a manuscript, which character says each quote. SpeakerLM has no text-attribution mode, and the app records the narrator's takes, so it has no multi-speaker recording for audio diarization to separate. It also costs a 7B backbone plus an audio encoder for no gain here.

Not verified, because the session could not reach `arxiv.org` or `sites.google.com` (both failed to resolve): whether weights are released, their licence, language coverage and speed. Everything above is from search-result summaries, not the paper. If the owner wants SpeakerLM looked at for a future audio feature, those hosts must be allowed first.

## What text attribution looks like

| Approach | Accuracy | Size and speed | Licence | Source |
| --- | --- | --- | --- | --- |
| The app's rules (speech tags, alternation, aliases) | Synthetic corpus of 31 quotes: precision 0.963, recall 1.0 | Instant | The app's own code | [RESULTS.md](character-continuity-cue-extraction-eval/RESULTS.md) |
| Rules baseline in the 2026-10-10 trial | *Alice* ch. VI, 61 quotes: 55 right, 4 unknown, 2 wrong | Instant | n/a | [local-llm-spike.md](local-llm-spike.md) section 3 |
| Qwen3 4B, Q4_K_M | 53 of 61 (87%); 53 of 54 right when it answered | 2.5 GB file, 6.7 GB peak, 4.6 to 5.1 tokens/s on 4 vCPU | Apache 2.0 | same, sections 1 to 3 |
| Qwen3 8B, Q4_K_M | 54 of 61 (89%); the 7 misses name the wrong footman with confidence | 5.0 GB file, 10.8 GB peak, 3.2 to 3.4 tokens/s | Apache 2.0 | same |
| BookNLP | Strongest local attribution in the 2026-10-10 trial | Has a source row, currently "not yet available" | Code MIT; weights have no stated licence | [booknlp-spike.md](booknlp-spike.md) |
| Llama-3 8B and 70B, zero-shot on the PDNC corpus (published) | Reported state of the art on PDNC, 12 points above prior systems on the first 22 novels; 70B close to perfect | 70B is not a 16 GB-machine model | Llama community licence with an acceptable-use policy | [arXiv 2406.11380](https://arxiv.org/html/2406.11380v3), search summary only |

How to read it:

- **On explicitly tagged quotes a small model adds nothing a rule does not already get.** The trial found 47 of 47 (4B) and 50 of 50 (8B) right at confidence 0.75 or above, and the separation came from the code-checkable speech-verb-and-name check that the rules also use, not from the model.
- **The model's use is the implicit quotes.** In the trial both the 4B and 8B attributed all 7 implicit quotes correctly. Those are the quotes the rules leave `unknown` on purpose ("precision over recall").
- **Every model figure is optimistic.** *Alice* is public domain and in every model's training data. The PDNC paper tests memorisation and reports it is not the main factor, but I could only read a summary of it.
- **Whole-book speed rules out running it over everything:** 3 to 11 hours per 90,000-word book on 4 vCPU. Running it on only the quotes the rules left `unknown` sends a few paragraphs, not a book; that cost was not measured.
- Llama 3.x and Phi-4 were left out of the 2026-10-12 spike for licence and context reasons; this note does not reopen that.

## How it would sit behind the port

The slot already exists, so nothing new is designed:

- `internal/extractionport` has a `LocalModel = "local-model"` source name beside `Rules`, `Gliner` and `BookNLP`, with a fake and a shared suite (`extractionporttest`), so a mock-first adapter exists before any model does. Sources offer `Raw` values with a confidence and the quotes behind them; code computes offsets, status and fingerprint, so a model cannot set them.
- Attribution runs through `guide.Service.AttributeSpeakers` (`internal/guide/attribute.go:30`), which never touches a line the narrator confirmed or corrected and has `RestoreSpeakers` as its undo. A model's answer would enter as another `speaker_source`; this note proposes it rank below a narrator's correction and below a rule that found a speech tag.
- Quote discipline stays in code: `extraction.VerifyEvidence` rejects a quote the text lacks, and a speaker is accepted only with the code-checkable tag check the trial used for its 0.75 line.
- The runtime (`llama.cpp`) and one model file would be pinned with digests and loaded by a sidecar, as the spike's section 1 and `docs/operations/ci-and-releases.md` require.

## What was not run

- **No benchmark.** The plan was to run Qwen3 4B on the repo's synthetic corpus (`cueEvalCorpus`, original text no model has seen) beside the rules' published 0.963 and 1.0. Building the runtime in a scratch environment (`pip install llama-cpp-python`) was refused by the auto-mode classifier ("[Undermining Oversight]"). It was not retried another way. The Go tests also cannot run here (Go 1.27.2 installed, the module needs 1.27.3).
- Speed, memory and licence of SpeakerLM; the PDNC paper's own tables.
- The owner's hardware is not recorded in the repo (the earlier spike lists the machine check as pending, D65), so no speed figure is for it.

## Next step, if the owner wants a number

Run on the owner's machine, with a pinned `llama.cpp` build and `Qwen3-4B-Q4_K_M.gguf` from the spike's section 1: (1) `llama-bench -m <model>.gguf -p 4096 -n 512 -t <physical cores> -r 3`; (2) the model over the paragraphs where the rules return `unknown` in one of the owner's own chapters, scored against the owner's labels, counting a speaker as accepted only with the tag check. Decide on the same bar the spike set: the model must beat the rules on precision for the `unknown` quotes, and be confidently wrong on none of the accepted ones. If it does not, drop the tier.
