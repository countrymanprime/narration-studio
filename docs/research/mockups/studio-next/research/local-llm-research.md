# Local (offline) LLM extraction for the Story Bible, plus a bring-your-own-LLM import path

Research only; nothing in the repo, studio or studio2 was modified. Date: 2026-10-10. Builds on `scratchpad/story-bible-extraction-research.md` (the "prior doc"), whose repo findings are not repeated: the repo has no LLM, a deterministic rules/spaCy extractor, a review-first model, and ADR 0020 precision-first policy.

Evidence labels used throughout: **[web]** = seen in a search result or fetched page this session (secondary blogs unless stated); **[prior]** = from the prior doc; **[knowledge]** = my general knowledge, not re-verified, may be stale; **[estimate]** = my arithmetic or reasoning, not measured. Nothing here was benchmarked on this machine (sandbox, no GPU, no models).

---

## 0. Short answers

**Update 2026-10-10:** section 9 now holds measured results from a CPU-only trial of Qwen3 1.7B/4B/8B, GLiNER and BookNLP (9.9: 61/61 quote speakers in about 15 s per chapter, the strongest local result) on Alice chapters V-VIII (speed, RAM, entity recall/precision, quote verification, quote attribution, calibration of the 75% rule). Everything outside section 9 is desk research or estimate; where they differ, trust section 9 for this hardware.

1. **A local model is practical, but only as a slow, opt-in, background job, and only for a subset of the task.** On a typical narrator laptop (8-16 GB RAM, no GPU) a 4B-8B Q4 model reads a novel at roughly 30-100 tokens/s, so a 3-pass extraction is about **2-5 hours** CPU-only, **~1 hour** on Apple Silicon Pro-class, **20-40 min** on a mid consumer GPU [estimate]. That is acceptable overnight/background, not interactive.
2. **What small local models can do reliably:** candidate-name confirmation, category (character/place/thing), alias suggestions from a mention list, explicit-tag quote speakers, short stated descriptions, with verbatim-quote verification by our code. **What they do badly:** implicit/anaphoric speaker attribution, "know" claims (time-bound, spoiler leakage), consistent JSON over long inputs (fixed by grammar-constrained decoding), and refusing to infer. Open-weights LLMs on fiction event extraction scored F1 max 0.45 in one 2025 study and degraded with story length, with background-knowledge leakage causing false positives [web, abstract only]. Treat that as the honest warning label for talk/act/know.
3. **Non-LLM local tools are still the best value for the mechanical parts**: BookNLP for alias clusters and speaker attribution (its own reported B3 86-90 on its benchmark, prior doc), a coreference model for within-chapter pronouns, spaCy/GLiNER for candidates. They need PyTorch, which is the packaging cost.
4. **Do not rely on any single confidence number from a model.** Derive confidence from checkable facts (verbatim evidence found, number of distinct paragraphs, agreement across passes/models/tools, mention counts, source tier). Section 3.6 gives a concrete scoring rule that the owner's 75% threshold can sit on.
5. **Build the bring-your-own import first** (section 5): it needs no model, no runtime, no download, supports hosted or local LLMs the user already trusts, and exercises the same verifier and Needs-verification queue that a bundled local model would later feed. Then the rules baseline fixes, then an optional local-model download.

---

## 1. Candidate models and non-LLM tools

### 1.1 Local instruction models (state as of search, 2026-10; model landscape moves monthly, re-check before pinning)

Sources are mostly secondary blogs; licences and sizes need confirming on each model card at pin time.

| Family / model | Sizes relevant to laptops | Q4_K_M RAM (weights only; add 1-4 GB for KV cache/context) | Context | Licence | Notes |
| --- | --- | --- | --- | --- | --- |
| **Qwen3 (2025) / Qwen3-2507 refresh** | 4B, 8B, 14B, 32B | 8B ~5 GB, 14B ~8.5 GB, 32B ~19 GB [web, frankx.ai guide, unverified methodology] | 32K native, 131K with YaRN; 2507 variants listed at 256K [web, third party] | Apache-2.0 [web, secondary; verify on model card] | Strong instruction following and JSON; "thinking" mode costs output tokens, disable for extraction |
| **Qwen3.5 small (Mar 2026)** | 0.8B, 2B, 4B, 9B (dense) | 4B ~2.5-3 GB, 9B ~5.5-6 GB [estimate from params] | 262K [web, Artificial Analysis; one blog says 32K, treated as wrong] | Apache-2.0 [web, Artificial Analysis] | Artificial Analysis Intelligence Index 32 for 9B, 27 for 4B [web]. Existence of a 14B small variant NOT confirmed |
| **Gemma 4 (2 Apr 2026)** | E2B (~2.3B eff.), E4B (~4.5B eff.), 26B MoE (3.8B active), 31B dense | E4B ~3-4 GB [estimate]; 26B MoE ~24 GB, 31B 40 GB+ [web] | 128K (edge), 256K (26B/31B) [web] | **Apache-2.0** (first time) [web: the-decoder, several outlets] | Gemma 3 (12B ~6.7 GB, 4B ~2.6 GB [web]) used Google's Gemma Terms with a Prohibited Use Policy; avoid for bundling |
| **Mistral Small 3.x** | 24B | ~14 GB [knowledge] | 32K-128K [knowledge] | Apache-2.0 from Small 3 [web: the-decoder] | Too big for 8 GB laptops; fine for 32 GB Macs. Small 4 exists per a comparison site, not examined |
| **Llama 3.x** | 1B/3B/8B (3.1/3.2), 70B (3.3) | 8B ~4.9 GB [knowledge] | 128K | **Meta Llama Community Licence** (attribution, AUP, large-user clause) [web, secondary] | Redistribution allowed with licence terms/attribution; avoid as the default bundled model. One blog's "Llama 3.3 8B" does not exist as far as I know |
| **Phi-4 / Phi-4-mini** | 3.8B (mini), 14B | mini ~2.5 GB, 14B ~9 GB [knowledge] | 128K mini, 16K for Phi-4 14B [knowledge] | MIT [web, secondary; one source hedged] | Strong reasoning for size, weaker world/fiction knowledge; short context on 14B |
| **gpt-oss, OLMo 2, GLM** | various | | | Apache-2.0 [web, secondary] | Not examined for this task |

**Selection guidance for this task [estimate/judgement]:**
- Default candidate: a **4B-9B Apache-2.0 model** (Qwen3 4B/8B 2507 or Qwen3.5 4B/9B, or Gemma 4 E4B). Apache-2.0 means the app may offer them as a downloadable catalog asset and even redistribute weights, with the licence text and NOTICE shipped alongside. Pick by a bake-off on a small labelled set, not by leaderboard.
- **Do not bundle weights in the installer.** A Q4 4B model is ~2.5-3 GB, 8B ~5 GB; downloading on consent (the repo's ADR 0080 pattern: SHA-pinned catalog asset, ask first) keeps the installer small and lets users decline.
- Long context is not a reason to push a whole novel through a small model: 262K-token windows exist, but KV cache memory and small-model recall degrade, and a 90k-word book (~120-165k tokens) would need several GB more KV memory [estimate]. Chunk by chapter regardless.
- Quantisation: Q4_K_M is the usual default (quality loss small for extraction); Q5_K_M/Q6_K for 4B models where RAM allows, since small models degrade more from quantisation [knowledge]. For structured extraction, prefer Q5+ on models under 5B.

### 1.2 Speed (tokens/s) by hardware

Search found **no usable measured benchmark** (all results were one low-quality blog with unsourced rules of thumb, e.g. 40-60 t/s generation for 7B on Max/Ultra chips [web, unsourced]). The figures below are my rule-of-thumb ranges from general knowledge for an **8B Q4_K_M** model in llama.cpp; 4B is roughly 1.7-2x faster, 14B roughly 0.55x. Treat as order-of-magnitude. Replace with `llama-bench` measurements on 3 real machines before advertising anything.

| Hardware | Prompt processing (prefill) t/s | Generation t/s | Notes |
| --- | --- | --- | --- |
| Laptop CPU, 8 cores, 16 GB DDR4/5, no GPU | 20-80 | 4-9 | Memory-bandwidth bound for generation. Windows/Linux AVX2 builds |
| Same CPU, Vulkan/iGPU | 50-200 | 5-12 | Highly driver-dependent; worth an optional toggle only |
| Apple M1/M2/M3 base, 16 GB | 100-250 | 12-22 | Metal; 8 GB Macs cannot comfortably run 8B Q4 plus the app |
| Apple M-series Pro/Max, 18-48 GB | 250-700 | 25-45 (Max 40-60) | Best laptop experience; MLX can be ~10-30% faster than llama.cpp [knowledge] |
| NVIDIA RTX 3060/4060 8 GB (fits 8B Q4) | 1,200-3,000 | 35-70 | CUDA or Vulkan |
| RTX 4070-4090, 12-24 GB | 3,000-8,000+ | 60-130 | 14B-32B fit |

### 1.3 Non-LLM local tools for fiction

| Tool | Gives | Evidence (date as noted) | Licence / packaging | Verdict |
| --- | --- | --- | --- | --- |
| **BookNLP** | Entities (PER/LOC/FAC/GPE/VEH/ORG incl. pronouns and nominals), coreference, **character clustering of name variants**, quote detection + speaker attribution, supersenses, events | Small: entity F1 88.2, speaker B3 86.4; Big: 90.0 / 89.9; 99k-token book 2-15 min [prior, from README] | MIT (code); PyTorch; English only; maintenance status unverified | Best single offline source of alias clusters and speaker candidates. Packaging cost is PyTorch + model files; run as an optional sidecar |
| **LitBank-trained coref (Maverick, xcore)** | Coreference chains incl. pronouns; trained/evaluated on LitBank | Maverick on LitBank avg CoNLL F1 ~78.0-78.3; xcore-litbank 78.2 long-document [web]; LitBank paper: OntoNotes-trained model drops 10.3 points to 72.9 on LitBank [web]. LitBank annotates only ACE categories PER/FAC/LOC/GPE/ORG/VEH and ~2,000 tokens per text [prior/web] | Code Apache-2.0-ish per Sapienza [knowledge, verify]; PyTorch; model licence unverified | Useful for within-chapter pronoun resolution feeding speaker attribution. Not for "things" (LitBank does not annotate them) |
| **fastcoref** | Fast coref (LingMessCoref) | No LitBank numbers found [web: none] | MIT-ish [knowledge] | Faster than Maverick on CPU, weaker; not evaluated |
| **spaCy en_core_web_sm/lg/trf** | NER (OntoNotes, news-trained) | In the repo: sm 12.8 MB, lg 400 MB [prior]. trf (transformer) needs PyTorch, ~400-500 MB [knowledge] | MIT | Keep as candidate generator; weak on invented names and animals-as-characters |
| **GLiNER (v2.1, Apache-2.0 artifacts)** | Zero-shot labelled spans ("character", "place", "creature", "invented term") | No fiction benchmark found [prior]; older checkpoints CC BY-NC (excluded) [prior]. ONNX export exists, so it can run without PyTorch [knowledge] | Apache-2.0 for v2.1 per repo doc | Cheap recall booster for invented names (ONNX Runtime, 100-500 MB). Spans only; no aliases or relations |
| Quote-attribution models (BERT/DST style, ACL 2022; sequential model, ACL 2023) | Speaker per quote | PDNC: 35,978 quotes, 22 novels, annotated with speaker, addressees, type (explicit/implicit/anaphoric), referring expression [web]. 2022 pipeline claims +50% relative F1 over earlier SOTA [web]. 2023 finds a simple sequential model on par with SOTA [web] | Research code; weights/licences unverified | Not turnkey. Use PDNC's quote types as the confidence vocabulary |

**Comparison for fiction, honestly:** published ceilings for the classic pipeline are mid-80s F1 for NER and mid-70s to ~78 for coreference on novels (AAAI 2022 pipeline: NER 0.85, coref 0.76 [web]; Maverick LitBank 78 [web]). Numbers do not transfer to whole-book chaining, since LitBank coref covers ~2,000 tokens per text. Small LLMs (4B-9B) probably land near spaCy-trf on explicit names and below BookNLP on speaker attribution, but I found **no published benchmark of small open LLMs on LitBank/PDNC** (see Could not verify). The bake-off in the prior doc, section 3.6, is the only way to know.

---

## 2. Runtimes and packaging

| Runtime | What it is | Embed / spawn from Go-Wails or Electron | Download + disk | Licence | Notes |
| --- | --- | --- | --- | --- | --- |
| **llama.cpp (`llama-server`)** | C/C++ inference, GGUF, CPU/Metal/CUDA/Vulkan/HIP builds | **Best fit: ship the official prebuilt `llama-server` binary per OS/arch as a sidecar** (like the repo's other sidecars) and talk to it over localhost HTTP (OpenAI-compatible `/v1/chat/completions`, `/completion`). Bind to 127.0.0.1 on a random port with an API key; kill on exit | Binary 5-60 MB (CPU) up to hundreds of MB with CUDA libs; Vulkan build avoids CUDA redistribution | MIT [knowledge] | Native `json_schema` / GBNF constrained decoding [web, section 3]. New model architectures are usually supported here first [knowledge] |
| **Ollama** | Daemon + model registry + CLI over llama.cpp | Spawn `ollama serve` or detect an existing install; REST on localhost:11434. Cheapest integration, but the user must install a 3rd-party app, and its model store/registry is outside our consent/hash control | App ~0.5-2 GB with GPU libs on Windows [knowledge] | MIT [knowledge] | Supports `format: <JSON schema>` structured outputs [knowledge; docs page unreachable here]. Good "I already have Ollama" detection path |
| **LM Studio** | GUI app with local server (OpenAI-compatible) | Cannot be embedded or redistributed (proprietary, free for personal use; terms changed over time [knowledge, verify]); offer only "point at an OpenAI-compatible URL" | | Proprietary | Support as a user-configured endpoint, never as a dependency |
| **llamafile** | Single-file executable (llama.cpp + weights, cosmopolitan libc) | Spawn the file; one file per model, runs on Win/mac/Linux | 2-6 GB per model file; Windows has a 4 GB executable limit (workaround: external weights) [knowledge] | Apache-2.0 / MIT [knowledge] | Neat but lags llama.cpp releases; antivirus false positives on Windows are a known annoyance [knowledge] |
| **MLX / mlx-lm** | Apple's array framework; fastest on Apple Silicon | Python sidecar or Swift; mac only | Models in MLX format | MIT [knowledge] | Optional mac optimisation. Skip in v1: llama.cpp+Metal is good enough and one code path |
| **ONNX Runtime (+ GenAI)** | Cross-platform inference | In-process via C API/cgo or Python; DirectML on Windows GPUs | Runtime 10-60 MB | MIT | Ideal for GLiNER/small encoders, not for generation quality parity with llama.cpp |
| **Transformers.js / WebGPU** | In-browser inference (the Wails/Electron webview) | Runs in the UI, no sidecar | Models via browser cache | Apache-2.0 | Only practical for <=1-2B or encoders; WebGPU availability differs per webview (WebView2 yes, WKWebView partial, WebKitGTK poor) [knowledge]. Not recommended for the generative pass |
| **Python sidecar (transformers/PyTorch)** | For BookNLP, coref | Already the repo's sidecar pattern (PyInstaller) | PyTorch adds ~0.5-2 GB CPU-only, more with CUDA | BSD | The single biggest size cost of the "classic NLP" route |

**Recommendation:** one runtime, **llama.cpp's `llama-server` as a managed sidecar**, plus an advanced setting "use an OpenAI-compatible endpoint at URL" which covers Ollama, LM Studio and any other local server without us integrating them separately. (This endpoint is user-chosen; labelled "local" only if the host is loopback, and non-loopback hosts get the same consent text as any external service. The owner's concern is exactly this: do not silently enable remote.)

**Hardware backends per OS:** Windows x64: AVX2 CPU build + Vulkan build (CUDA optional download); macOS: Metal build (arm64; Intel Macs CPU only, effectively unsupported for this); Linux: CPU + Vulkan. Detect AVX2/AVX512, RAM, GPU/VRAM at first run and pick quant + model + `-ngl` accordingly.

**Model download and consent UX (aligned with ADR 0079/0080 pattern in the repo):**
1. Settings: "Extraction: Rules only (default) / Local model (download needed) / Import from file". Nothing downloads until chosen.
2. Consent panel before download: model name, size (e.g. 2.7 GB), source URL host, licence (Apache-2.0, link), "stays on this computer; your manuscript is never sent anywhere", estimated time for **this** book on **this** machine (a 30-second benchmark on first use gives tokens/s, then estimate = tokens * passes / rate).
3. Hash-pinned download with resume, progress, cancel, delete model button showing disk used. Store under the app data dir, not the project.
4. First-run cost: download (2.5-6 GB, minutes to an hour) + load (5-30 s) + the calibration benchmark. Updates: catalog entry bumps model id/hash; old model kept until the user deletes it; prompts are versioned and stored on each suggestion for provenance.
5. Per-run: show estimated time, run in a cancellable background job, resumable per chapter (store map-pass output per chapter so a laptop sleep or cancel loses at most one chapter), battery/AC warning.

**Update story:** pin llama.cpp build tag per app release (llama.cpp changes quickly; GGUF formats of new models need newer builds, so a model catalog entry declares `min_runtime_build`). Re-verify hashes at launch only if the user asks; verify at download.

**Security/threat-model rows to add (repo rule):** download of a binary and weights (hash, signature, source pinning), localhost server (random port + key, loopback only), sidecar arguments fixed (no user-provided flags), model output is untrusted data (never executed; verifier checks it), prompt injection from the manuscript text (the manuscript can contain "ignore previous instructions"; the output is only ever suggestions in a review queue, so the blast radius is wrong suggestions, not actions).

---

## 3. Technique

### 3.1 Pipeline shape for a 60-120k word book (~80-165k tokens)

```text
Stage 0  parse chapters/paragraphs with ids (existing)
Stage 1  candidates (existing rules/spaCy [+GLiNER])                 -> candidate surface forms with counts
Stage 2  MAP per chapter (LLM, schema-constrained, 6-12k tokens in)  -> mentions: surface form, kind guess, paragraph id, short quote
Stage 3  REDUCE (code first, LLM second) alias clustering over the mention list (not full text)
Stage 4  ENTITY-CENTRIC pass: for each accepted entry, code selects paragraphs containing any of its names (+/- 1 paragraph), batches <= 6-8k tokens, LLM returns description/traits/relations/talk-act-know with verbatim quotes
Stage 5  QUOTE pass: code segments quotes with ids; LLM (or BookNLP/rules) assigns speaker among accepted entries; rule `tag` result kept as baseline
Stage 6  VERIFIER (code): exact-find quotes, compute offsets, drop unverifiable, score confidence (3.6), dedupe, store as "Needs verification" or "auto-accept tier"
```

**Chunking:** by chapter; split chapters over ~6-8k tokens at paragraph boundaries with 1-2 paragraph overlap. Small models should see less: aim at **4-8k tokens per call** for 4B-9B models (recall drops and format slips grow with length [knowledge]). Per-chapter calls are independent, so resume/cancel/rescan of only changed chapters is easy.

**Map-reduce details:**
- Map output is deliberately tiny: list of `{name, kind, para, quote}`; short output is the main lever on CPU time because generation is 5-10x slower per token than prefill.
- Reduce step 1 (code, deterministic): normalise (case, apostrophes, titles "the", "Mr./Mrs.", possessives), group exact matches, token-subset matches ("Elizabeth" within "Elizabeth Bennet" if unambiguous), title-prefix. Reduce step 2 (LLM on the cluster list only, cheap): "which of these groups are the same entity?" with the co-occurrence and first-appearance chapter as context. Ambiguous short names ("Mr. Smith" vs "Smith") shared by two entities are the classic failure; keep ambiguous merges as *suggested merges* in review, never auto-merge.
- **Alias clustering signals checkable by code:** identical surface after normalisation; subset-of-tokens; appears in the same sentence apposition ("Tom, the miller's son"); co-reference chains from BookNLP/Maverick if available; same speaker-tag; never co-occurring in the same sentence as separate people. Contradictions block a merge: two forms appearing together in a list or both speaking in one scene are different people.

**Coreference across chapters:** do not attempt pronoun coref at book scale (prior doc). Use (a) name-variant clustering for aliases, (b) per-chapter/scene context for quote speakers, (c) optional BookNLP/Maverick per chapter. Narrative knowledge such as "the Captain" = Arelian is an alias claim with evidence (a sentence that links them), not a coreference chain.

### 3.2 Constrained decoding

- **llama.cpp**: native; the server accepts a JSON Schema in `json_schema` (completion endpoints) or `response_format: {type:"json_schema", json_schema:{schema}}` on `/chat/completions`, and also raw GBNF; the schema converter supports a **subset** and silently skips unsupported keywords: no `uniqueItems/contains/not/if-then-else`, `prefixItems` broken, nested `$ref` broken, numeric bounds apply to integers only, `pattern` must be anchored; the schema constrains output only and is NOT shown to the model so the prompt must also describe it [web, llama.cpp grammars README, fetched this session]. Design schemas flat, with `enum` for kinds and basis, `additionalProperties:false`, and check the generated grammar in tests.
- **Ollama**: `format` takes a JSON schema [knowledge; docs page unreachable from this sandbox].
- **outlines / lm-format-enforcer / xgrammar / guidance**: Python libraries with the same idea; only relevant if we use a Python sidecar with transformers. For the llama.cpp sidecar, built-in grammar is enough.
- Constrained decoding guarantees *syntactic* validity, not truth. It also can force the model to emit a value even when nothing is there (mitigate: allow empty arrays, add `"none"` options). A grammar keeps a small model from derailing, which is the main reliability win at 4B-9B.
- A verbatim `quote` field cannot be forced to be a true substring by grammar. Our verifier does that (3.3).

### 3.3 Verbatim-evidence verification (the heart of "nothing invented")

Same rule as the prior doc, with local-model specifics:
1. Model returns `paragraph` (id we gave it) and `quote` (<= 200 chars).
2. Code looks for `quote` in that paragraph: exact -> normalised (whitespace, curly/straight quotes, ellipsis, case-insensitive as a separate weaker tier) -> fuzzy (e.g. token-level edit ratio >= 0.9 within the paragraph only; flagged `fuzzy`) -> else search the neighbouring paragraphs -> else **drop** (keep in a debug log).
3. Offsets computed by code. Never trust model offsets.
4. Verify it supports the claim: cheap checks - claim's entity (any alias) appears in the quote or in the same sentence; for traits, the trait word appears in the quote; for talk, a quote span exists inside the quote marks; for relations, both names appear within the span. A failed support check lowers the score, it does not delete.
5. Small models paraphrase quotes frequently; expect 5-30% unverifiable quotes on 4B-9B [estimate], so measure the "drop rate" in the bake-off and report it in the UI ("14 claims dropped, evidence not found").

### 3.4 Quote speaker attribution with a local model

- Code segments quotes (existing) with ids; give the model: previous+next paragraph, active-character list (accepted entries with aliases, plus "narrator", "unknown"), and the quote ids. Output: `{quote_id, speaker_id|"unknown", basis: tag|context|alternation|implied, tag_text}`. Verify `tag_text` exists in the paragraph and contains the speaker's alias or a pronoun.
- Order of trust: explicit tag verified by code (rules baseline) > BookNLP/LLM agreement > LLM alone. The existing repo baseline has only 31 of 1,099 tag-attributed and 797 unknown on Alice [prior], so most gain is on continuation/implicit quotes, which are exactly where PDNC shows models are weakest (implicit and anaphoric types). The SIG prompt-based method gained up to +17% on implicit/anaphoric quotes over baselines [prior], but that was with large LMs.
- Always allow `unknown`. Under 75% -> narrator verifies; the UI already has confirmed/suggested/`?`.

### 3.5 Honest limits of small models

- Context fragility: quality degrades with prompt length; keep calls short.
- Over-inference and background-knowledge leakage (a model that knows *Pride and Prejudice* will fill gaps from memory; for public-domain books this contaminates the test, too; use unpublished text for evaluation) [web: leakage cited as a cause of false positives, fanfic death-event study].
- Poor "know" semantics: knowledge acquisition, false beliefs, and time-scoping are hard even for frontier models; a 4B-9B will mostly restate the text. Offer "know" only with a mandatory "learned at" evidence span, and label low by default.
- Non-human and invented names, honorifics, nicknames, multi-lingual names: spaCy and small LLMs both fail; mention counts + capitalisation + the narrator review catch most.
- Self-reported confidence from small models is nearly uninformative [knowledge]; do not display it.
- Consistency across runs at temperature 0 is high but not perfect across llama.cpp builds and quantisations; store prompt version, model id, quant and runtime build on each suggestion.

### 3.6 Deriving a trustworthy confidence (the 75% rule)

Principle: **confidence is a function of checks the app itself performed**, calibrated on a small labelled set, never a number the model says. Report 0-1 internally, show High/Medium/Low (or the % only when calibrated).

Feature set per claim (all computable):

| Feature | How | Direction |
| --- | --- | --- |
| E1 evidence verified | quote found: exact / normalised / fuzzy / not found | exact +, fuzzy -, not found => drop |
| E2 support check | entity/alias in quote or sentence; trait/relation tokens present | + / - |
| E3 distinct paragraphs | number of independent paragraphs (and chapters) with verified evidence for the same claim | more is +, diminishing |
| E4 agreement | same claim from a second pass (different chunking/prompt, temperature 0 and 0.3), second model, or a non-LLM tool (rules tag, BookNLP) | agreement +, disagreement flags |
| E5 mention count | for entries: total exact-name mentions, chapters spanned, capitalisation consistency, lowercase use rate | entries with 1-2 mentions cap at Low |
| E6 basis | stated vs implied (model flag); for quotes: tag/alternation/implied | stated +, implied - |
| E7 ambiguity | the name matches several entries; competing speakers in scene; pronoun-only evidence | - |
| E8 source tier | rules tag (deterministic) > multi-source agreement > single-LLM | tier sets a ceiling |

Starting rule (to be calibrated on the 100-quote/100-entity gold set from the prior doc; thresholds below are placeholders):

```text
if evidence not found                    -> drop
base = 0.40
+0.20 exact quote found (+0.10 if only normalised, +0.00 fuzzy)
+0.10 support check passed
+0.10 per extra distinct paragraph, max +0.20
+0.15 independent agreement (second pass or other tool); -0.25 if they disagree
+0.10 explicit tag (quotes) / explicit "X is a ..." (descriptions)
-0.20 implied basis; -0.10 ambiguity; cap 0.60 for 'know' claims; cap 0.50 if entry has < 3 mentions
clamp 0..1
```

Then **isotonic/Platt calibration on the gold set**: bucket scores and measure the actual accuracy per bucket, adjust thresholds so that the "75%+" bucket really is >= 75% correct (the owner's rule is a promise about correctness, so show the measured bucket accuracy in the evaluation doc, and re-measure when the model or prompt version changes). Until a gold set exists, **cap every locally-extracted claim at 0.74** (all go to Needs verification) except deterministic rules-tier results; that is the honest default. Allow higher only for claims with exact evidence + second-source agreement once calibration shows >= 75%. Imported rows use the same score if evidence can be verified against the manuscript (section 5).

### 3.6b Published accuracy anchors (dates as stated; none measured by me)

- **PDNC** (Project Dialogism Novel Corpus, LREC 2022; 22 novels, 35,978 quotes) [web]. ACL 2023: sequential model on par with SOTA after splitting into 4 sub-tasks [web]; ACL 2022 BERT-based pipeline +50% relative F1 [web]. Prior doc: SIG beats zero-shot ChatGPT, up to +17% on implicit/anaphoric. **No numbers found for current open or frontier LLMs on PDNC.** Quote types: explicit, anaphoric, implicit; expect accuracy to fall in that order.
- **LitBank**: NER data on 100 novels; coref ~2,000 tokens per text; best published coref avg CoNLL F1 ~78 (Maverick/xcore) [web]; cross-domain OntoNotes->LitBank loses ~10 points [web].
- **BookNLP**: entity F1 88.2/90.0, speaker B3 86.4/89.9 on its own benchmark [prior]. A different benchmark would yield lower numbers; "B3" is not accuracy.
- **LLM fiction extraction (small open models)**: only adjacent evidence: F1 <= 0.45 on fanfic death-event extraction, falling with length, with knowledge leakage [web, 2025, abstract only]; CROSS benchmark (EMNLP 2024) of LLM character profiles from 126 recent novels [web, abstract only, results not read]. Conclusion: assume small-model properties/talk/act/know accuracy is well below entity accuracy and needs human review of everything.

---

## 4. Time and cost per book

**Assumptions [estimate]:** 90,000-word novel = 120-165k tokens (use 150k; the prior doc used 165k). 3 reads: Map (1.0x), Entity-centric (~1.0x, overlapping windows), Quotes (~1.2x incl. candidate list; ~1,500 quotes). Total prefill ~480k tokens. Output: Map ~25k, Entity ~40k, Quotes ~40k (~100k tokens with a compact schema; thinking disabled). Prompt overhead included. Prefill and generation rates from the 1.2 table. "Time" = prefill/prefill_rate + output/generation_rate, with no parallelism.

| Hardware | Model | Prefill t/s | Gen t/s | Prefill time | Generation time | **Total** |
| --- | --- | --- | --- | --- | --- | --- |
| Laptop CPU 8-core, 16 GB | 4B Q4/Q5 | ~60 | ~12 | 2.2 h | 2.3 h | **~4.5 h** |
| Laptop CPU 8-core, 16 GB | 8B Q4 | ~35 | ~6 | 3.8 h | 4.6 h | **~8 h** (not recommended) |
| Laptop CPU 8-core, 8 GB | 2B-4B only | ~80 | ~15 | 1.7 h | 1.9 h | ~3.5 h; quality notably worse |
| Apple M2/M3 base 16 GB | 8B Q4 | ~150 | ~16 | 53 min | 1.7 h | **~2.5 h** |
| Apple M-Pro 24-36 GB | 8B Q4 | ~400 | ~35 | 20 min | 48 min | **~1.1 h** |
| RTX 4060 8 GB | 8B Q4 | ~2,000 | ~50 | 4 min | 33 min | **~40 min** |
| RTX 4070+ 12 GB | 14B Q4 | ~2,500 | ~45 | 3 min | 37 min | ~40 min |

Generation dominates, so: (i) keep outputs terse (IDs and short fields), (ii) only run the entity-centric pass on accepted entries (not every candidate), (iii) run the quote pass only for unresolved quotes (rules tag handles the explicit ones), (iv) use a smaller model for Map and a larger one for adjudication, (v) run chapters in parallel slots only if memory allows (`-np` in llama-server; helps GPU, rarely CPU). With (ii)+(iii) the output falls to ~40-50k tokens and CPU times roughly halve. **A "quick pass" (Map + alias reduce, no talk/act/know) is ~25-30% of the full time** and may be the right first tier for CPU-only laptops.

Cost: no money; electricity and fan noise. Rescans: re-run only changed chapters.

For comparison, hosted cost estimates are in the prior doc (about $0.10-$4 per book on Haiku 5.5-Opus 5.5).

---

## 5. Bring-your-own-LLM import path

Purpose: the user pastes the manuscript into any LLM (hosted or local), gets back a CSV or JSON, and imports it. **Everything imported is treated as untrusted claims about the manuscript and passes through the same verifier as local extraction.** The app never sends the manuscript anywhere; the user decides where it goes. This directly fits the owner's "don't rely on someone hooking up an external LLM that mines their data": it is opt-out by default, and the app does not need to know which LLM was used.

### 5.1 Interchange format: `storybible-import` v1 (JSON is canonical; CSV is a flattened convenience)

**JSON (preferred; one object):**

```json
{
  "format": "storybible-import",
  "version": 1,
  "generator": { "name": "free text, e.g. ChatGPT / Claude / local qwen3-8b", "date": "YYYY-MM-DD" },
  "book": { "title": "optional", "chapters_seen": ["1", "2", "..."] },
  "entries": [
    {
      "id": "e1",
      "name": "Elizabeth Bennet",
      "type": "character",
      "aliases": ["Lizzy", "Miss Bennet", "Eliza"],
      "description": "One or two sentences, only what the text states.",
      "properties": [ { "key": "age", "value": "twenty", "evidence": { "quote": "...", "chapter": "3", "paragraph": 12 }, "confidence": 0.9 } ],
      "relationships": [ { "to": "Jane Bennet", "relation": "sister", "evidence": { "quote": "...", "chapter": "1", "paragraph": 4 }, "confidence": 0.95 } ],
      "appears_in": ["1", "2", "5"],
      "claims": [
        { "kind": "talk", "text": "Tells Darcy she will not dance with him.", "chapter": "3", "paragraph": 12, "evidence": "verbatim quote", "confidence": 0.8 },
        { "kind": "act",  "text": "...", "chapter": "...", "paragraph": 0, "evidence": "...", "confidence": 0.8 },
        { "kind": "know", "text": "Knows Wickham's history.", "chapter": "36", "paragraph": 9, "evidence": "...", "confidence": 0.6 }
      ],
      "confidence": 0.9
    }
  ],
  "speakers": [
    { "quote": "first 10-200 chars of the quoted speech, verbatim", "chapter": "3", "paragraph": 12, "speaker": "Elizabeth Bennet", "basis": "tag", "confidence": 0.9 }
  ],
  "pronunciation": [ { "entry": "Fitzwilliam", "respelling": "fits-WIL-yum", "note": "optional" } ]
}
```

Field rules:
- `type`: one of `character | place | thing | other`. `other` or unknown -> Needs verification.
- `aliases`: strings; the main `name` must not be repeated there.
- `chapter`: the chapter label or number as the app's chapter list shows it (the app also accepts the chapter title); `paragraph`: 1-based paragraph number within the chapter, **optional**. Paragraph numbers from an LLM are unreliable, so the verifier treats chapter/paragraph as a *hint*, and finds the quote by search (3.3).
- `evidence`: object `{quote, chapter?, paragraph?}` or a plain string quote. Quote <= 200 chars, verbatim.
- `confidence`: number 0..1 or omitted/empty. Optional at every level; entry-level is used if a claim has none.
- Free text only where noted; arrays never nested deeper than shown. Unknown fields are kept in a `raw` blob but ignored.
- `basis` for speakers: `tag | context | alternation | implied`.
- Unknown `kind` values other than talk/act/know are an error for that claim.

**CSV (for spreadsheet users): one table, `row_type` discriminates, UTF-8, header required, RFC 4180 quoting, list values separated by ` | `.**

Columns: `row_type` (`entry | alias | property | relationship | claim | speaker | pronunciation`), `entry_name`, `type`, `aliases`, `description`, `key`, `value`, `to`, `relation`, `kind`, `text`, `chapter`, `paragraph`, `evidence_quote`, `appears_in` (e.g. `1 | 2 | 5`), `speaker`, `basis`, `respelling`, `confidence`.

Entry rows carry name/type/aliases/description/appears_in/confidence. Other rows link by `entry_name` (exact match with an entry row or an alias). Missing columns are allowed; extra columns are ignored with a notice.

### 5.2 Copy-paste prompt template (works with hosted or local LLMs)

The app shows this with a "Copy" button and fills `{BOOK_TITLE}`, and the list of chapter labels. Notes beside it explain the limits of pasting a whole novel (context windows; do it by chapter batches and import each file; the app merges). Wording is designed so a model returns **JSON only**:

```text
You are helping build a "Story Bible" for an audiobook narrator. I will paste part of a novel manuscript.
Return ONLY one JSON object, no commentary, no code fences, matching this shape exactly:

{ "format": "storybible-import", "version": 1,
  "generator": {"name": "<your model name>", "date": "<today YYYY-MM-DD>"},
  "entries": [ { "id": "e1", "name": "", "type": "character|place|thing|other", "aliases": [],
      "description": "", "properties": [{"key":"","value":"","evidence":{"quote":"","chapter":"","paragraph":0},"confidence":0.0}],
      "relationships": [{"to":"","relation":"","evidence":{"quote":"","chapter":"","paragraph":0},"confidence":0.0}],
      "appears_in": [], "claims": [{"kind":"talk|act|know","text":"","chapter":"","paragraph":0,"evidence":"","confidence":0.0}],
      "confidence": 0.0 } ],
  "speakers": [ {"quote":"","chapter":"","paragraph":0,"speaker":"","basis":"tag|context|alternation|implied","confidence":0.0} ],
  "pronunciation": [ {"entry":"","respelling":"","note":""} ] }

Rules:
1. Only include what the text itself states or clearly shows. Do not use outside knowledge about this book, its author or its adaptations.
2. Every property, relationship, claim and speaker must have an "evidence" quote copied EXACTLY, word for word, from the text (max 200 characters). If you cannot quote it, leave the item out.
3. Use the chapter labels and paragraph numbers I give you. If the text has no numbers, give chapter only and set paragraph to null.
4. "talk" = something the character says or asks; "act" = something the character does; "know" = something the character is shown to know or learn (put the chapter where they learn it).
5. aliases = other names, nicknames, titles used for the same character in the text. Do not merge two different people. If unsure, leave the alias out.
6. type: character (person or speaking creature), place, thing (named objects, groups, items), other.
7. confidence is your honest 0 to 1 estimate (1 = stated outright, 0.5 = guess). Use null if you cannot judge.
8. Never invent entries, quotes or chapter numbers. Empty arrays are fine.
9. For "speakers" include only quoted speech whose speaker you can identify; copy the first words of the quote verbatim.

Book: {BOOK_TITLE}. Chapters in this paste: {CHAPTER_LABELS}.

MANUSCRIPT:
```

Template implementation notes: provide a smaller variant ("entries only") for small local models; a CSV variant of the same prompt; tell the user to paste in chapter batches (about 15-25k words each for hosted, 3-5k for small local models) and import each result (the app merges into one run). The app should also offer to **export the manuscript as numbered-paragraph text** ("[ch 3 ¶12] ...") so the model has real numbers to cite. That raises paragraph-hint accuracy significantly [estimate].

### 5.3 Validation and error reporting

Stages (all non-destructive; nothing changes until the user confirms the import preview):
1. **Parse**: JSON tolerant cleanup only for the common wrappers (strip ``` fences, leading/trailing prose before the first `{` and after the last `}`, BOM, smart quotes in keys). Report "unparseable at line/col N" with the exact snippet; no guessing beyond that. CSV: report row numbers for unbalanced quotes, wrong column counts.
2. **Schema check** (Zod/JSON Schema in the existing wire-contract style): errors are per item, not per file. An invalid item is rejected and listed; valid items continue. Messages name the path: `entries[3].claims[1].kind: "says" is not one of talk, act, know`.
3. **Size limits**: file <= 20 MB, <= 5,000 entries, quote <= 500 chars (truncation noted), strings stripped of control chars; no HTML interpreted (rendered as text); no URLs fetched.
4. **Grounding check** against the manuscript for every evidence quote (3.3): found exact/normalised/fuzzy/not found, with the paragraph resolved by search (hint chapter/paragraph used to disambiguate duplicates). `not found` -> item imported only if allowed by policy below, else rejected. The default policy: **claims without verifiable evidence are not imported** (shown in the report with the quote). Entries without evidence can still be imported by name only if the name string occurs in the manuscript (count shown); a name that doesn't occur is rejected as "not in manuscript".
5. **Normalise and dedupe**: Unicode NFC, trim, case-fold match to existing entries by name or alias; matches become "merge suggestion" rows, never overwrite authored or locked entries (ADR 0007 / locked). Duplicate rows inside the file are merged and counted. Alias conflicts (the same alias claimed by two entries) are flagged `ambiguous alias` and dropped from auto-merge.
6. **Reference check**: relationships whose `to` doesn't resolve to an entry or alias in the file or the Bible -> kept as unresolved rows (name text only) and flagged; speaker names that don't resolve -> `unknown` with the raw name kept in the note.
7. **Report**: counts (imported / merged / needs verification / rejected by reason), a downloadable list of rejected rows with reasons, first 20 shown inline; can re-import a corrected file (idempotent: fingerprints prevent duplicates).

### 5.4 Marking and the verification queue

- Every imported row: `source: "imported"`, `import_id`, `generator` string from the file (free text, untrusted), `imported_at`, `file_hash`; plus `confidence_in` (the file's value or null), and `confidence` (our computed value from 3.6, using the file's value only as one weak feature; a file claiming 0.99 never lifts a claim above what the checks support).
- **Rule:** rows with `confidence < 0.75` **or** missing confidence **or** failing any check other than exact evidence go to **Needs verification**. Default: **all imported rows land in Needs verification unless** they carry file confidence >= 0.75 **and** exact verified evidence **and** (for entries) the name occurs >= 3 times in the manuscript; those show as "Imported (unverified source)" and can be bulk-accepted by the narrator, never auto-accepted. Because the generator is untrusted, the conservative choice is to keep imported rows out of the authored Bible until the narrator accepts or bulk-accepts, which is consistent with the prior doc's "suggestion layer" principle.
- Display: "Imported" chip, the generator name, the file's confidence beside the app's evidence verdict ("evidence found in ch 3 ¶12"), and "Open in manuscript".
- Rejected/accepted tombstones as in the prior doc, so a re-import does not re-offer rejected claims.
- Replacing the manuscript clears imports with the rest (owner rule in the prior doc); keep the original import file reference so the user can re-run the import against the new text.

### 5.5 Safety

Imported files and LLM output are untrusted: no HTML injection (render as text), no formula injection in CSV round trips (prefix cells beginning with `= + - @` when exporting), prompt-injection text inside quotes is just text. State plainly in the UI: "the AI service you paste your manuscript into receives it; this app does not" with a link to the provider's terms being the user's responsibility.

---

## 6. Recommendation

### 6.1 Tiers

| Tier | What | Needs | When |
| --- | --- | --- | --- |
| **0. Rules baseline (default, always works)** | Existing rules/spaCy extractor + cheap fixes (apostrophe normalisation, `I'm`-style junk, "the Hatter" handling, Needs Review names in the speaker index, title/alias heuristics) | Nothing | First. Deterministic, testable, fixes visible Alice failures from the prior doc |
| **1. Bring-your-own import** | Section 5: JSON/CSV import + prompt template + numbered-paragraph export + verifier + Needs verification queue | Nothing local; user uses any LLM | **Build early (right after Tier 0)**; value arrives immediately and de-risks the data model, verifier and UI |
| **2. Optional local model download** | llama.cpp sidecar + Apache-2.0 4B-9B model from the catalog, map/reduce/entity/quote passes, background job, resumable | 8 GB RAM minimum (quick pass), 16 GB recommended, Apple Silicon or GPU for comfortable speed | Later, after the verifier, confidence scoring and gold set exist. Gate on the bake-off |
| **3. Hosted (optional, per book consent)** | From the prior doc | API key | Optional; out of scope for the owner's initial direction |
| **4. Optional classic NLP sidecar (BookNLP / Maverick)** | Alias clusters and speakers without an LLM | PyTorch size; Python sidecar | Evaluate in the bake-off; may beat a small LLM on aliases and speakers at lower cost |

### 6.2 What to build first (ordered)

1. Evidence verifier + suggestion data model + Needs-verification queue (shared by every tier); unit-test `verifyEvidence`.
2. Import schema (Zod + golden fixtures per the repo's wire-contract rules), parser, report, and the prompt template with a copy button; a fixture file generated from Alice by hand for tests.
3. Numbered-paragraph export (helps imports and speaker/paragraph hints).
4. Rules-baseline fixes.
5. Gold set (about 100 quotes, 100 entities, 60 claims; use a book the models are unlikely to have seen, or public-domain with the contamination caveat) and a scoring script. Calibrate the confidence function (3.6).
6. Local-model sidecar behind the `ExtractionProvider` interface from the prior doc; quick pass first (entities + aliases), then entity-centric properties, then quotes. Model catalog entry per model with hash, size, licence, min runtime.

### 6.3 Hardware to advertise (provisional until measured)

- **Rules baseline and import:** any machine.
- **Local model, "quick pass" (entities + aliases):** 8 GB RAM, 4-core CPU, 4 GB free disk; expect a few hours on CPU; "run overnight."
- **Local model, full pass:** 16 GB RAM and Apple Silicon (M1+) or a GPU with 8 GB VRAM; expect roughly 1-2.5 hours (Apple) or 40 min (GPU).
- Say plainly: no GPU = slow but works; 8 GB Macs and Windows laptops under 8 GB RAM are rules/import only. Publish measured numbers from three real machines, not the table in 4.

### 6.4 Risks

- **Quality risk (highest):** small-model talk/act/know and speakers may be noisy enough that review time exceeds writing them by hand. Mitigation: bake-off gate, "quick pass" first, evidence-verified output only, review queue sorted by confidence, measurable "accepted rate" telemetry kept local.
- **Speed/UX:** hours on CPU. Mitigate with resumable background job, per-chapter results, honest estimate from a benchmark.
- **Packaging/support:** per-OS runtime builds, GPU driver variance, antivirus on downloaded binaries, 3-6 GB downloads, llama.cpp moving fast (pin builds). Model licence drift (verify per card; prefer Apache-2.0; avoid Llama/old Gemma terms for redistribution).
- **Trust/privacy:** the local server must be loopback + key; imports are untrusted; hosted pasting is the user's decision. Update `SECURITY.md` and the threat model (downloads, sidecar, localhost API, import files).
- **Hallucination and spoilers:** "know" claims; enforced evidence + chapter scoping + low cap.
- **Calibration:** a 75% promise requires a gold set; until then cap at 0.74 so everything is verified by the narrator.
- **Benchmark contamination:** public-domain books are in training data; use fresh text for evaluation.
- **Maintenance:** BookNLP state unknown; GLiNER and coref model licences need review; PyTorch in the app doubles size.

---

## 7. Sources

Fetched:
- llama.cpp GBNF/JSON schema README: <https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md> (fetched 2026-10-10)

Search results only (secondary; summaries, not read in full):
- Small/local model guides and memory figures: <https://frankx.ai/blog/best-local-llm-2026> , <https://tinyweights.dev/posts/best-small-language-models-2026/> , <https://www.sitepoint.com/best-local-llm-models-2026/> , <https://you.com/resources/best-local-llm>
- Licences: <https://www.aiwiki.ai/wiki/open_weight_license_comparison> , <https://codenote.net/en/posts/oss-license-coding-llm-local-guide-2026/> , <https://the-decoder.com/new-mistral-small-3-does-more-with-less-under-apache-license/>
- Gemma 4 (2 Apr 2026, Apache-2.0): <https://the-decoder.com/googles-gemma-4-is-now-available-with-apache-2-0-licensing-for-the-first-time/> , <https://datanorth.ai/news/google-releases-gemma-4-open-models> , <https://www.noze.it/en/insights/gemma-new-release/>
- Qwen3.5 small models: <https://artificialanalysis.ai/articles/qwen3-5-small-models> , <https://toolhalla.ai/blog/qwen-3-5-small-best-llm-for-phone-2026>
- Apple Silicon llama.cpp (weak, unsourced): <https://aiindigo.com/blog/running-llms-on-apple-silicon-a-performance-guide-for-llama-cpp>
- PDNC and quote attribution: <https://aclanthology.org/2022.acl-long.400> , <https://paperswithcode.com/paper/the-project-dialogism-novel-corpus-a-dataset> , <https://arxiv.org/html/2307.03734v1> (via prior doc)
- Coreference: Maverick <https://sotaverified.org/papers/2407-21489> , <https://libraries.io/pypi/maverick-coref> , <https://huggingface.co/sapienzanlp/xcore-ecb/blob/main/README.md> , LitBank <https://arxiv.org/pdf/1912.01140>
- Fiction LLM evaluation: <https://arxiv.org/pdf/2404.12726> (CROSS), <https://arxiv.org/pdf/2507.04852> , <https://ojs.aaai.org/index.php/AAAI/article/view/21709>
- Prior doc and its sources (BookNLP README, LangExtract, Anthropic docs).

---

## 8. Could not verify

- **All tokens/second figures and all time estimates** (1.2, 4). No benchmark was run; the web search returned no measured llama.cpp numbers by chip. The ranges are my rules of thumb and must be replaced with `llama-bench` on real machines.
- **Model sizes, memory, context lengths and licences** come from secondary blogs and news (frankx.ai, Artificial Analysis, the-decoder). None checked against the Hugging Face model cards or licence files. In particular: whether a Qwen3.5 14B small model exists; Qwen3-2507's 256K context; Phi-4's MIT status; Mistral Small 4; Gemma 4 sizes/context; the exact Llama licence terms for redistribution. Re-verify at pin time. The model landscape changes monthly; this snapshot is 2026-10-10.
- **Ollama structured-output behaviour**: docs.ollama.com was unreachable from the sandbox (DNS failure). Statement in 3.2 is from memory.
- **llamafile, MLX, LM Studio, Transformers.js/WebGPU facts** (licences, size limits, WebView support): general knowledge, not checked this session.
- **LLM accuracy on PDNC, LitBank, or fiction entity/alias/quote extraction for 4B-14B open models**: no published benchmark found. The adjacent items (fanfic death-event F1 <= 0.45; CROSS) were read as abstracts/snippets only. BookNLP, Maverick and spaCy numbers are from their own papers/READMEs, on different datasets, and not comparable to each other.
- **fastcoref and BookNLP LitBank numbers**: not found. BookNLP maintenance status and weight licences: unverified (also in the prior doc). Maverick/xcore model licences: unverified.
- **GLiNER ONNX export on fiction** and its memory/speed: not checked.
- **The confidence function (3.6)** is a design, not a validated model; its weights are placeholders and the 0.74 cap is the safe default until a gold set exists. The claim "small models' self-reported confidence is uninformative" is general knowledge, not tested here.
- **Quote-drop rate of 5-30%** for small models (3.3) is an estimate.
- **Prompt template (5.2)**: not tested against any LLM in this session; it needs a trial on at least a hosted model, a local 8B and a local 4B, with the failure modes recorded (wrapper text, invented paragraph numbers, paraphrased quotes) before it is shipped.
- **PDNC licence** and whether texts may be copied into the repo: still unchecked.
- I did not read the repo this time beyond the prior doc (the brief allowed it); repo-specific claims here come from that doc.

---

## 9. Measured here (2026-10-10): hands-on trial on Alice

Everything in sections 1-8 and 10 is desk research. **This section is the only part measured on this machine.** The first two attempts were blocked at `us.aws.cdn.hf.co`; after the owner allowlisted it, the downloads worked and the trial below ran. Labels: [measured] = produced by the scripts in `scratchpad/trial-scripts/` with outputs in `scratchpad/results/`; [hand-labelled] = my judgement from reading the text; [estimate] = projection from measurements.

### 9.1 Setup and honest limits

- **Hardware:** sandbox VM, 4 vCPU (CPU model not identified), 15 GB RAM, no GPU, CPU only. No Apple Silicon or GPU was tested; no number here transfers to those.
- **Runtime:** `llama-cpp-python` 0.3.36 compiled from source with PyPI (gcc/cmake present; compile took several minutes; one earlier pip attempt failed with a hash-mismatch error on an unnamed package and the retry succeeded, cause not investigated). JSON-schema constrained decoding through the library's grammar support (`response_format` with a schema), `n_ctx` 8192, 4 threads, Qwen3 thinking disabled (`/no_think`).
- **Models** (official `Qwen/*-GGUF` repos on Hugging Face): Qwen3-1.7B Q8_0 (1.83 GB), Qwen3-4B Q4_K_M (2.50 GB), Qwen3-8B Q4_K_M (5.03 GB). All three downloaded in about a minute each. **GLiNER:** `urchade/gliner_small-v2.1` (the Hugging Face API lists `license:apache-2.0`; 585 MB in the cache). Not tried: Llama, Mistral, Gemma, Phi, Qwen3.5, Gemma 4, BookNLP, Maverick/fastcoref.
- **Sandbox quirk:** the Python `huggingface_hub` xet downloader needs `cas-server.xethub.hf.co`, which is still denied; `HF_HUB_DISABLE_XET=1` makes it use the allowed CDN.
- **Text:** `tests/fixtures/alice.md`, chapters V-VIII (2.2-2.6k words each, 3.4-3.9k prompt tokens) for entities/claims, chapter VI for quote attribution. **Alice is public domain and certainly in every model's training data, so all quality numbers are optimistic** (names, "Mad Hatter", the Cheshire Cat's lines can be recalled, not read). Treat them as an upper bound on unseen manuscripts.
- **Gold set** [hand-labelled, `trial-scripts/gold.py`]: 24 entries for chapters V-VIII (17 characters with alias sets such as Hatter/Mad Hatter, Cheshire Cat/Cheshire Puss/the Cat, Queen/Queen of Hearts, Footman = Frog-Footman, White Rabbit/Rabbit; 4 things; 3 places; 24 character-chapter slots to recall) and **61 quotes in chapter VI with speakers (54 explicit-tag, 7 implicit)** after reading every paragraph. The "Footman = Frog-Footman" call is an inference from the text (the text only says "the Footman"), so the 7 Footman quotes are the most arguable gold items.
- **Small samples:** 4 chapters, 61 quotes, 75 (4B) and 41 (8B) claims. Percentages carry wide error bars (about +/-10 points or more); two-pass "agreement" has K=2 or 3 only.
- Artifacts: the three GGUFs, both venvs and the GLiNER cache (about 15 GB) were deleted after the runs; results JSON (228 KB) and scripts remain under the scratchpad. Nothing was written to the repo, studio or studio2.

### 9.2 Speed and memory [measured]

| Model (CPU, 4 threads) | Prefill (prompt) tok/s | Generation tok/s | Peak RAM (VmHWM, n_ctx 8192) | Wall per chapter, extraction call (prompt ~3.4-3.9k tok, output cap 1,600 tok) | Wall, quote pass (prompt 4.6k tok, 108 quote ids, ~1.05k output tok) |
| --- | --- | --- | --- | --- | --- |
| Qwen3-1.7B Q8_0 | 98-168 (typ. 150) | 3-10 (typ. 8-10) | 5.1 GB | 44-230 s (mean 130 s; EOS after 1-5 entries) | 136-140 s |
| Qwen3-4B Q4_K_M | ~62 (first call 29 while a pip install competed) | 4.6-5.1 | 6.7 GB | 113-415 s (mean 329 s; 4 of 8 calls hit the 1,600-token cap) | 288-304 s |
| Qwen3-8B Q4_K_M | 40-44 | 3.2-3.4 | 10.8 GB | 567-594 s (both calls hit the cap) | 433-436 s |
| GLiNER small-v2.1 (PyTorch CPU) | n/a | n/a | 2.0 GB | 2.0-2.4 s per chapter (14-18 chunks of ~180 words); model load 3.7 s | n/a |

Generation, not prefill, dominates: a 1,600-token answer from the 4B model takes about 340 s versus about 60 s to read the chapter. This sandbox's generation speed (4B at 4.7 tok/s) is probably below a recent laptop (my section 1.2 guess for a laptop CPU 8B was 4-9 tok/s; measured 3.3 here, a little under that range) [estimate].

**Projection per 90k-word book, same hardware** [estimate]: about 40 chapters of 2.2k words; one extraction call per chapter plus one quote pass per chapter (the quote pass is overstated, since chapter VI is unusually quote-dense). 1.7B: 40 x (130 + 137) s = about **3 h**. 4B: 40 x (329 + 295) s = about **7 h**. 8B: 40 x (580 + 435) s = about **11 h**. GLiNER: about **1.5 min**. My section 4 table (4B CPU 4.5 h for three passes) was the right order of magnitude but optimistic for this machine. RAM: an 8B model needs about 11 GB at 8k context, so it does not fit alongside the app on an 8 GB laptop and is tight at 16 GB.

### 9.3 Entities, aliases and structure [measured + hand-labelled]

| System | Character recall (gold slots, ch. V-VIII) | Entry precision | Notes |
| --- | --- | --- | --- |
| GLiNER small-v2.1, labels character/place/object, threshold 0.5 | **24/24** | **56/60** distinct surface forms labelled `character` (false positives: "she", "She", "the hedgehog") | Surface strings only: no alias clustering, no description, no relations; "the Caterpillar" and "Caterpillar" are separate strings. 2 s per chapter |
| Qwen3-4B (passes A, B) | A: 10/24, B: 12/24, **A union B: 16/24** (ch. V 3/3, VI 6/8, VII 3/4, VIII 4/9) | 26/26 entries map to a gold entity (no invented entities) | Misses are mostly output-length limits: it writes verbose descriptions and stops at 1-6 entries per pass, "most important first" |
| Qwen3-8B (ch. VI only) | A: 6/8, B: 6/8, union 7/8 | 14/15 | The 15th was a merged label "The Cheshire Cat (Grin)". Both calls hit the token cap and needed JSON salvage |
| Qwen3-1.7B | A union B: 7/24 | 11/11 | Usually emitted one entry then stopped; 2 of 8 outputs were truncated runaway JSON that could not be repaired. Not usable |

- **Aliases:** 4B alias strings that literally occur in the chapter text: 32/42 (76%); the other 10 are descriptive epithets the model made up ("the girl", "the little girl", "the insect", "the bird", "the round thing", "the pipe"), and the 4B also merged Fish-Footman and Frog-Footman into one entry in chapter VI pass A. 8B: 17/18 literal. So an alias must be code-checked against the text (it costs one string search), as proposed in section 3.3.
- **Constrained decoding:** with the schema grammar every output was syntactically valid until truncation at the token cap; 8 of 18 extraction outputs hit the cap (4B 4, 8B 2, 1.7B 2); 5 of those were salvaged by truncating at the last complete entry, 1 parsed as is, and 2 (1.7B) were not recoverable. Without a cap on output size, small models loop; set `maxItems`, short fields and a token limit, and treat truncation as normal.
- **Wrong merges** (Fish/Frog-Footman; "Cheshire Cat (Grin)") are exactly the alias-conflict flag cases of section 10.6.

### 9.4 Evidence quotes and claims [measured + hand-labelled]

Quote verification (code finds the model's `quote` in the paragraph it named; "elsewhere" = in the chapter but not that paragraph; "none" = not found even after quote/whitespace normalisation):

| Model | Claim quotes: exact / elsewhere / none | Description quotes: exact / elsewhere / none |
| --- | --- | --- |
| 4B (8 chapter-passes, 78 claim quotes incl. 3 duplicates) | 47 (60%) / 12 (15%) / 19 (24%) | 13 / 6 / 7 of 26 |
| 8B (ch. VI, 41 claim quotes) | 37 (90%) / 2 / 2 | 12 / 0 / 3 of 15 |
| 1.7B | 13 / 0 / 8 of 21 | 2 / 2 / 7 of 11 |

- **Paragraph numbers from the model are unreliable** (4B: 15% of claim quotes sat in a different paragraph than cited, though the text was real). Verification must search the chapter, as designed in 3.3 and 5.3. A quote is also sometimes real but does not support the claim: of the 4B's exactly-verified quotes, 11 of 45 did not support the claim at all.
- The strict verifier discarded 18 of the 4B's 75 claims; **8 of those 18 were true** (44% false rejects, mostly dropped closing quote marks or altered punctuation). A fuzzy-match tier is worth having.

Claim correctness, hand-labelled with three grades (S = true, specific, and fits its kind talk/act/know; W = true but vacuous or the wrong kind, e.g. "X is at a tea party" filed under "talk"; X = false or wrong entity):

| Model | S | W | X |
| --- | --- | --- | --- |
| 4B, all four chapters, 75 unique claims | 26 (35%) | 34 (45%) | 15 (20%) |
| 8B, chapter VI, 41 claims | 35 (85%) | 1 | 5 (12%) |

The 4B filled every entity with exactly one talk, one act and one know claim (my schema asked for up to three) and mostly produced state descriptions ("is confused about identity"), several false ("The Caterpillar is uninterested in conversation", quote "Who are you?"). The 8B quoted real speech and actions. Its five wrong claims were entity-attribution errors (it gave the Cook the Duchess's line twice, gave the Cat Alice's question, gave the Duchess the Cook's action). **Talk/act/know at 4B is not usable without a human; at 8B it is promising but still 12-15% wrong and CPU-slow.** "Know" claims were the least meaningful at both sizes.

### 9.5 Quote attribution, chapter VI, 61 gold quotes [measured]

Candidates fixed to Alice, Duchess, Cheshire Cat, Fish-Footman, Frog-Footman, Cook, Baby, Narrator, Unknown (so this tests attribution, not entity discovery). One call per pass; grammar forces an answer for all 108 quote segments.

| System | Accuracy per pass | Explicit (54) / implicit (7) | Notes |
| --- | --- | --- | --- |
| Qwen3-1.7B Q8 (3 passes) | 49, 55, 49 of 61 (80-90%); majority 50/61 | 43-50 / 5-6 | Errors scattered (Cat <-> Alice, Fish vs Frog) |
| Qwen3-4B Q4 (3 passes) | 53, 51, 53 of 61; majority 53/61 (87%) | 44-46 / 7 of 7 | 7 misses are "Unknown" for "the Footman" (abstaining), 1 real error; **53 of 54 non-abstained answers right (98%)** |
| Qwen3-8B Q4 (2 passes) | 54, 54 of 61 (89%) | 47 / 7 of 7 | Both passes identical; all 7 misses are "Fish-Footman" for the Frog-Footman, confidently wrong |
| Regex baseline (speech verb + alias in the same paragraph; my 7-alias dictionary, not the repo's extractor) | 55 right, 4 unknown, 2 wrong of 61 | | Chapter VI is tag-heavy, so a rule baseline is already strong here. The repo's own extractor scored 31 tags of 1,099 quotes on the whole book, where the rule's requirement of known Character entities hurts [prior] |
| Always "Alice" | 29 of 61 | | trivial floor |

Cost: a 108-quote pass took 137 s (1.7B), 288-304 s (4B), 433 s (8B). The LLM's useful contribution here is the 7 implicit quotes (correct for 4B and 8B), not the explicit ones that a regex already gets.

### 9.6 Calibration of the 75% rule [measured; formula from section 10.5 with placeholder weights]

**Speakers** (score = 0.25 + V/C terms + 0.2 x pass-agreement + 0.15 x tag-check T + 0.05; T = speech verb and the predicted speaker's alias in the same paragraph outside the quotes; K = 3 passes for 1.7B and 4B, 2 for 8B):

| Model | Score >= 0.75: n, correct | Score < 0.75: n, correct |
| --- | --- | --- |
| 1.7B | 44, **44 (100%)** | 17, 6 (35%) |
| 4B | 47, **47 (100%)** | 14, 6 (43%) |
| 8B | 50, **50 (100%)** | 11, 4 (36%) |

So the 75% line behaved as hoped on this chapter: everything the formula auto-accepts was right (lower 95% bound about 92-94% by the rule of three, n=44-50), and what it sent to the narrator was right only 35-43% of the time, so verification was warranted. **But the separation comes almost entirely from the code-checkable tag feature T** (T=1: 47/47, 49/49, 50/50 correct), not from model agreement. Pass agreement: 4B 3/3 agree 51 of 52 correct, 2/3 agree 2 of 9 correct (useful); 8B's two passes gave identical answers on all 61 quotes including all 7 wrong ones (agreement carried no information), 1.7B 3/3 agree 46 of 49. Caveat: chapter VI is dialogue with explicit tags, the easiest case; implicit-heavy chapters would put more quotes below 0.75, which is correct behaviour but means more narrator work.

**Claims** (talk/act/know, same formula with T = the claimed entity or alias named in the located paragraph outside quotes; P = the same entity gave a similar claim in the other pass, by an automatic word-overlap rule; claims whose quote is not found are dropped):

| Model / grading | Score >= 0.75: n, correct | Score < 0.75: n, correct |
| --- | --- | --- |
| 4B, correct = S only | 12, **8 (67%)** | 45, 10 (22%) |
| 4B, correct = S or W (true even if vacuous) | 12, 12 (100%) | 45, 32 (71%) |
| 8B ch. VI, correct = S | 2, 2 | 37, 31 (84%) |

- For 4B, **agreement between the two passes was the discriminator**: claims with agreeing passes 8 of 12 (67%) S versus 10 of 45 (22%) without. For 8B it **reversed**: agreeing claims 4 of 6 (67%) versus 29 of 33 (88%) for non-agreeing, because the one agreed-upon error repeated (the Cook given the Duchess's line in both passes). So "agreement predicts correctness" held for the small, noisy model and failed for the larger, more consistent one, where errors are correlated. This confirms the concern in sections 10.1 and 10.9.
- The 4B's >= 0.75 bucket was only 67% correct under the strict reading, **below the owner's 75% promise**, because the formula cannot see "true but vacuous". Takeaway: for claims keep the cap at 0.74 (everything verified by the narrator) until a support check beats this; an LLM or code check that the quote actually supports the claim is the missing feature (11 of 45 verified quotes did not support their claim).
- The same-chapter-vs-cross-chapter question (section 10) could not be tested beyond this: the pipeline found each claim in one chapter only, and with 4 chapters no entity-level error existed to detect (all 26 extracted entries were real entities), so there is no measured evidence on cross-chapter agreement yet. Alias and entry recurrence across chapters (Alice in all 4, Cheshire Cat in 6 and 8) was always correct.

### 9.7 What the measurements change

1. **GLiNER earns its place for candidate names**: 24/24 character recall in 2 s per chapter at 2 GB RAM, far above what a 4B-class LLM achieved at 60-400 s per chapter. It cannot do aliases, descriptions or relations, and PyTorch is the cost (the CPU venv was 5.6 GB with pip's default wheels; an ONNX export would be smaller [knowledge, not tested]).
2. **Small-LLM quote attribution is viable as a second opinion**: 4B and 8B gave 87-89% (98% when abstentions are excluded), the implicit quotes were right, and the code-checkable tag gate produced a clean 75% line. The rules baseline is just as good on explicit tags, so the LLM should only be asked about quotes the rules leave unknown.
3. **Properties and talk/act/know need an 8B-class model or a hosted model, and still need review**; the 4B is not worth running for them. At 8B the cost on this hardware was about 10 min per chapter.
4. **Plan the run time honestly: 3-11 hours per book on a 4-vCPU CPU for the 1.7B-8B models**; the model-per-book "overnight" framing in section 6 stands, and the 8 GB-RAM claim should be dropped for 8B.
5. Needed fixes found by running: cap outputs and salvage truncation, verify aliases literally, search the whole chapter for quotes (paragraph numbers are hints), add a fuzzy quote tier, add a "quote supports claim" check, and do not count agreement from a single model at temperature 0 as independent.

### 9.8 Not measured here

Apple Silicon, GPUs, other model families (Llama/Mistral/Gemma/Phi, Qwen3.5), quantisations other than Q4_K_M/Q8_0, coreference models other than BookNLP's, first-person text for BookNLP, the full 12-chapter book, unseen (non-training-data) text, cross-chapter know ledgers, the bring-your-own import path with a real hosted model, and any run with 3+ passes of the 8B. The section 1.2 hardware table and section 4 estimates remain estimates except for the CPU rows in 9.2.

### 9.9 BookNLP 1.0.8 on the same Alice material (run 2026-10-10)

The weight host `people.ischool.berkeley.edu` was allowlisted. Everything below is [measured] unless marked [hand-labelled], [estimate] or [from source]. Same gold set as 9.1 (24 entries in chapters V-VIII, 24 character-chapter slots, 61 chapter-VI quotes).

**Setup and install friction**
- `pip install booknlp` 1.0.8 (MIT, July 2024) with `--no-deps`; I installed `torch` (default wheels, venv 5.8 GB), `transformers==4.44.2`, `spacy` 3.8.16, `numpy<2`, `setuptools<81` (it imports `pkg_resources`), and `en_core_web_sm` 3.7.1 from `huggingface.co/spacy/en_core_web_sm` (a 12.8 MB wheel named `...-any-py3-none-any.whl`, which pip rejects until renamed; the spaCy model under spaCy 3.8 prints a version warning). The declared `tensorflow` requirement was never needed.
- **BookNLP's own loader fails on current stacks:** `load_state_dict` raised `Unexpected key(s): bert.embeddings.position_ids` for every checkpoint. I worked around it by filtering that key out of the loaded dict in my runner (no model edit). That is a real maintenance signal: an unpinned install of the package breaks on a 2024-era transformers.
- **Weights come from `http://people.ischool.berkeley.edu/~dbamman/booknlp_models/` over plain HTTP in the code** (port 80 is not reachable here); I fetched the same files with `curl` over HTTPS from the official host only and recorded SHA-256 (`results/booknlp_weights_sha256.txt`). The authors publish no checksums to compare against, so these hashes are only for our own pinning. Small: entities 62.0 MB, coref 40.8 MB, speaker 57.6 MB (161 MB total). Big: entities 311 MB, coref 446 MB, speaker 439 MB (1.20 GB total). Each variant also fetches a Google BERT base checkpoint from Hugging Face at first load. The weights are PyTorch pickles; recent torch loads state dicts with `weights_only` by default, which is safer, but load them only from the pinned hashes.
- **Licences:** code MIT (LICENSE file in the repo, "Copyright (c) 2021 David Bamman"). The README names no weight licence; the entity model is trained on LitBank (CC BY 4.0) plus "~500 contemporary books" that are not public, so **the weight licence and training-data terms remain unverified**. **Maintenance:** last PyPI release 2024-07-12, previous 2023-08-28; the install problem above suggests no recent compatibility work.
- **Alice and LitBank:** yes, Alice is in LitBank (entry 11, Carroll 1865, in the LitBank README table; the repo carries the whole text, 26,438 words). LitBank annotates only about 2,000 words of each text, i.e. the opening, so chapters V-VIII were not annotated training data, but the speaker, entity and coref models were trained on LitBank's Alice sample and on a corpus that surely contains classics. Treat the BookNLP numbers as optimistic, like the LLM numbers.

**Speed and memory** (4 vCPU CPU; pipeline `entity,quote,coref`; chapters V-VIII concatenated as one document)

| Variant | 4 chapters (9.5k words, 12.5k tokens) | Chapter VI alone (2.6k words) | Peak RSS (4 ch / ch. VI) | Model load | Projected 90k-word book [estimate] |
| --- | --- | --- | --- | --- | --- |
| small | 15.6 s | 6.8 s | 1.57 GB / 1.19 GB | 3-11 s | about 2.6 min (40 chapters x 3.9 s) |
| big | 62.4 s | 17.7 s | 3.12 GB / 2.59 GB | 7-47 s (first load also downloads BERT) | about 10 min (40 x 15.6 s) |

For comparison, the 8B LLM needed about 10 minutes per chapter on the same machine (9.2; extraction call only), so BookNLP is roughly 40x (big) to 150x (small) faster per chapter. BookNLP's README gives 3.6 / 15.4 min (small / big) for a 99k-token book on a 2019 MacBook Pro CPU; my figures scale to about 2 and 8 min for 99k tokens, consistent. Whole-book RAM was not measured (peak RSS grew 0.4-0.5 GB going from 1 to 4 chapters; I did not extrapolate).

**Characters and clusters** [measured; matching by name strings after normalising tokeniser spacing, e.g. "Fish - Footman"]
- **Character recall: 24/24 slots for both variants** (same as GLiNER's 24/24; the 4B LLM had 16/24, the 8B 7/8 on chapter VI only). All mentions come with token offsets (see below).
- **Types:** entity mentions are `PROP`/`NOM`/`PRON` crossed with `PER` (small: 268 PROP + 260 NOM + 931 PRON), and only `FAC` (house, garden, room, kitchen, stairs), `LOC` (wood, world, earth, ground), plus a few odd `GPE` ("march", "hearts", fragments of "March Hare" and "Queen of Hearts") and one `VEH` ("procession"). **Places appear only as nominal common nouns, no named places; there is no `ORG`; "things" (mushroom, hookah, flamingo, hedgehog) are not tagged at all** (LitBank has no object category), so the Story Bible "things" must come from GLiNER or an LLM.
- **Name variants and merges:** Alice is one cluster (168 mentions), the Duchess one (16-17), the Queen one (38-39), the King one. `Hatter`, `Cat`, `Caterpillar`, `Pigeon`, `Baby`, `Dormouse`, `March Hare` were each **split into two clusters** by name (small: Caterpillar 14+11, Cat 15+6, Hatter 15+18, Dormouse 13+13, Baby 10+2, Footman 6+2, gardeners; big: Caterpillar 14+11, Pigeon 7+4, Cat 16+8, Hatter 26+8, March Hare 19+5, Dormouse 18+8, Baby 10+2). Some splits are within a single chapter (Caterpillar and Pigeon in V, Hatter and Dormouse in VII), so this is coreference windowing, not just cross-chapter drift. **7 gold characters split in the small model, 8 in the big** (the big count includes the three gardeners Five/Two/Seven, which my gold lumps together and BookNLP correctly keeps apart, so about 7 true splits for each). By inspection, a rule "merge clusters whose most common normalised name is identical" would repair every true split (not executed). **Wrong merges: small merged Fish-Footman and Frog-Footman (one cluster); big none.** "Cheshire Cat" and "the Cat" are in the same cluster family but one cluster holds mostly "the Cat" (ch. VI) and the other (ch. VIII) a mix. "Hatter/Mad Hatter" and "White Rabbit/Rabbit": the chapters only say "the Hatter" and "the Rabbit", so no merge was needed (the "Mad Hatter" case could not be tested on this text).
- **Spurious clusters** (clusters with 2+ named/nominal mentions that match no gold name): small 15, big 20. About 7 in each are legitimate referents (the youth, his father, three gardeners, soldiers, royal children, your majesty, players); the rest are junk or non-characters ("everybody", "nobody", "no room", "there", "world", "party", "procession", "my dear", "people", "sir" as a vocative cluster).
- **Character names and aliases:** each cluster carries counted mention strings (`proper`, `common`, `pronoun` lists in `.book`), which is a ready alias list ("the Cat", "Cheshire Cat", "The Cat"). The canonical name BookNLP picks is by proper-noun count.
- **Gender** (`.book`): Alice she 0.91-0.93, Duchess she 1.0, Queen she 0.92-1.0, Hatter he 0.84-1.0, King he 1.0; weak for the Cat (he 0.69 or no estimate) and the small model gave the Caterpillar both "she 0.82" and "she 1.0". A usable property for the narrator (voice) when confidence is high.

**Quote attribution, chapter VI, 61 gold quotes** (the speaker's cluster is mapped to a gold character by name; BookNLP never abstains, every quote got a speaker mention)

| System | Correct | Explicit (54) | Implicit (7) | Notes |
| --- | --- | --- | --- | --- |
| BookNLP **big** | **61/61** | 54 | 7 | Footman lines correct too (the "Footman" cluster) |
| BookNLP small | 56/61 | 52 | 4 | 5 wrong: 2 Footman lines to the Fish-Footman (merged cluster), 2 implicit Alice lines given to the Duchess, 1 Duchess song line given to the Baby |
| Qwen3-8B Q4 (9.5) | 54/61 | 47 | 7 | 7 misses all "Fish-Footman" for the Frog-Footman |
| Qwen3-4B Q4 | 53/61 (87%) | 46 | 7 | 7 abstentions on the Footman |
| Regex baseline | 55/61 | | | 4 unknown, 2 wrong |

BookNLP big beat every LLM and the regex baseline here, in 62 s for the four chapters (about 15 s for chapter VI). The speaker mention types in the big run were 28 nominal, 23 proper, 10 pronoun, all correct.

**Offsets and verifiability** [verified in use + from source]: `book.tokens` gives `byte_onset`/`byte_offset` for every token; `book.entities` and `book.quotes` give token indices, so any mention, quote or agent/patient word maps to a character span. I used this to assign every mention to a chapter by byte offset. Evidence spans can be verified by code exactly like LLM quotes, and each BookNLP quote carries a verbatim text. `.quotes` ties a quote to a cluster id, not to a name (the name comes from the cluster's mentions).

**agent / patient / mod / poss lists vs our fields** [hand-labelled on a seeded random sample of 99 items from the big model for six characters: Alice 23, Hatter 20, Queen 20, Duchess 15, Footman 11, Cat 10; each item read in a +/-7 token context]
- Sizes (big): Alice agent 537, patient 39, mod 19, poss 64; Hatter 63/5/2/10; Queen 29/8/2/8; Duchess 32/4/0/3; Cat 31/1/0/1; Footman 19/0/0/3. Items are **single words with a token id** (verbs, adjectives, nouns), not claims: no object, no negation ("I do not know" appears as `know`), no relation.
- **Attributed to the right character: 88/99 (89%).** The 11 wrong ones are dialogue pronouns resolved to the wrong speaker (the Hatter's list contains Alice's "talk" and "mean"; the Duchess's "saw" is Alice's) and embedded verse (Alice's `old` and `nose` come from the Father William poem).
- **Useful for a Story Bible field: 47/99 (47%).** Useful = a specific act, speech verb, trait or body/possession fact (`vanished`, `poured`, `murdering`, `turned crimson`, `silent`, `ears`...). Not useful: auxiliaries and copulas (`'m`, `'s`, `do`, `have`), generic verbs (`see`, `like`, `went`) and incidental objects.
- **Mapping:** *talk* is best served by `.quotes` (verbatim speech per cluster with offsets, 61/61 on this gold) plus speech-verb agents (`said`, `replied`, `asked`, `added`, `screamed`); *act* from agent verbs only as a keyword pointing at a sentence (a template or LLM must write the claim); *know* has no source (only `know`/`think` verbs without polarity or object); *properties* from `mod` (very few adjectives: 0-19 per character) and `poss` (mostly body parts) plus the gender inference; *relationships* none; *description* none. So BookNLP supplies clusters, aliases, appearances, gender and speech, but not descriptions, talk/act/know claims or relationships.

**Failure modes seen:** within-chapter cluster splits; a merged Fish/Frog-Footman cluster in the small model; wrong speaker for pronoun-addressed dialogue and verse; generic nominal clusters ("everybody", "no room"); odd `GPE` fragments; vocative cluster "sir" instead of the referent; attribution never abstains; no objects/things; a model-loading incompatibility with current transformers; weights over HTTP from a single university host with no published hashes; whole-document processing with no chapter output (chapters must be derived from byte offsets, which worked).

**Calibration of the 75% rule for BookNLP-derived items** (formula from section 10.5 reused; weights placeholders)
- **Speakers.** Features: tag check T (speech verb plus the predicted speaker's alias in the paragraph, outside the quotes), agreement P between the small and the big run (a second "pass" at 3.9 + 15.6 s per chapter), speaker-mention type. BookNLP small: score >= 0.75 for 54 quotes, **54 correct (100%)**; below 0.75: 7 quotes, only 2 correct (29%). Agreement was the discriminator: small and big disagreed on 5 quotes and **all 5 small answers were wrong**; where they agreed, 56/56 were right. T=1: 54/55 correct. Speaker-mention type: proper 26/27, nominal 24/25, **pronoun 6/9** (so a pronoun-only evidence cap is justified). BookNLP big: all 61 correct, so every bucket is trivially 100%. Without the tag check (mention type plus small/big agreement only), 35 of the small model's 61 quotes fall below 0.75 and 30 of those were right, so the narrator would verify many correct items; the tag check and the second run are what make the 75% line efficient.
- **Entries** (clusters with 2+ named mentions; correct = maps to a gold or valid character, scored leniently). Features: named-mention count, proper noun present, GLiNER agreement (a cluster name appears in GLiNER's character strings), small/big agreement. Small: score >= 0.75 for 23 clusters, **23 real (100%)**; below 0.75: 20 clusters, 12 real (60%). Big: 25 accepted, **25 real**; 27 below with 14 real (52%). So a 75% auto-accept line works for entries on this text, and what it sends to the narrator is about half junk. It does not detect cluster splits (both halves of the Hatter scored high), which needs the identical-name flag of section 10.6.
- Sample sizes are 61 quotes and 43-52 clusters from one text: the intervals are wide, and Alice leakage helps both.

**Combined-pipeline comparison on this gold (chapters V-VIII; 4-vCPU CPU)**

| Pipeline | Character recall | Aliases / clusters | Quote speakers (ch. VI, 61) | Descriptions / claims | Time for a 90k-word book [estimate] | RAM |
| --- | --- | --- | --- | --- | --- | --- |
| GLiNER + rules | 24/24 (56/60 strings right) | none beyond title-prefix | regex 55/61 (4 unknown, 2 wrong) | none | about 2 min | 2 GB |
| BookNLP small | 24/24 | clusters; ~7 splits, 1 wrong merge, 15 stray clusters | 56/61 | single-word lists (47% useful) | about 2.6 min | 1.2-1.6 GB |
| BookNLP big | 24/24 | clusters; ~7 splits, no wrong merge, 20 stray clusters | **61/61** | single-word lists (47% useful) | about 10 min | 2.6-3.1 GB |
| 8B LLM alone (9.2-9.5) | 7/8 on ch. VI only; 4B 16/24 | LLM aliases; 18/18 literal, merged the Footmen | 54/61 | claims 85% good on ch. VI | about 11 h | 10.8 GB |
| **Hybrid: BookNLP clusters + 8B (one run, ch. VI)** | BookNLP's | BookNLP's | BookNLP big 61/61 | 16 act/know/trait claims: 11 good, 3 vacuous or partly wrong, 2 false [hand-labelled]; 15/16 quotes verified exactly | LLM about 7 min per chapter (419 s: 116 s prefill, 303 s for 943 tokens) = about 4.7 h/book; plus BookNLP | 10.8 GB |

The hybrid prompt gave the model BookNLP's nine chapter-VI cluster names as an enum and told it not to write speech (BookNLP's quotes cover that). It only produced claims for five of the nine (Footman, Duchess, cook, baby, Cat) and did not improve claim accuracy over the stand-alone 8B (69% good versus 85% on a larger sample, same chapter; small n, different prompt). Its two false claims were the cook/Duchess confusion again (it credited the Duchess with the cook's throwing and gave the cook a trait with an unverifiable quote), and the Footman claims mixed the two footmen because BookNLP's "Footman" cluster does. Constraining names removed invented entities but not wrong attribution inside a chapter.

**What this changes in the tiers**
1. **BookNLP earns a place in the optional download tier, ahead of the LLM**, for aliases/clusters, appearances, gender and especially **quote attribution**: 61/61 (big) vs 54/61 (8B) at about 1/60 of the time and 1/3 of the RAM, with offset-verifiable output. The LLM is then needed only for descriptions, properties, relationships and talk/act/know claims, and only on an 8B-class model or hosted.
2. **A "big BookNLP + GLiNER" local tier needs no LLM and finishes a novel in about 10 minutes**: GLiNER supplies things/places and invented-name recall (BookNLP has no object class), BookNLP supplies clusters and speakers; cluster splits are flagged by identical-name duplicates; the 75% line should require small/big agreement or GLiNER agreement for entries and a verified tag or small/big agreement for speakers.
3. **Packaging cost is the catch**: PyTorch (5.8 GB venv with default wheels; CPU-only wheels were not tried), 1.2 GB big weights (161 MB small) from one university HTTP host (hash-pin and mirror them if the licence allows, which is unverified), a patched loader or a pinned old transformers, and a package with low maintenance. Run it in a Python sidecar, as the repo already does for other tools.
4. The section 6 recommendation changes from "rules, then optional local LLM" to: rules -> **optional BookNLP+GLiNER download (aliases, speakers, gender, things)** -> optional 8B LLM or hosted import for descriptions/claims; the import path stays first to build.
5. Still not tested: BookNLP on text it did not train on, on first-person or dialogue-light chapters, on a full 90k-word book (RAM, window splitting), the CPU-only PyTorch wheel size, and whether the "big" model is needed once an identical-name merge and a small/big agreement check exist.

---

## 10. Per-chapter independent extraction, cross-chapter and cross-pass agreement as confidence (desk research, added 2026-10-10)

Owner idea: "run the context on each chapter, then compare for confidence." Labels: [web] seen in search results this session (snippets, not read in full), [prior] earlier sections, [knowledge] general knowledge not re-verified, [estimate] my reasoning. **Nothing here was run; weights and thresholds are placeholders.**

### 10.1 Verdict

The idea is sound and fits the existing design: Map (3.1) already runs per chapter, and 3.6 already lists agreement (E4) and distinct paragraphs (E3) as features. What this section adds: (a) chapters become the unit of *independent replication*, so "found in 6 of 20 chapters, each with its own verified quote" is strong evidence that costs no extra model calls; (b) contradictions become a first-class flag; (c) "know" is stored per chapter, never globally merged; (d) multi-pass agreement is a second, costlier signal, used selectively. Caveat: chapters are **not independent samples** (same author, same names, same model biases), so cross-chapter agreement measures *recurrence*, not *correctness*. A model that systematically misreads "the Captain" as Arelian will repeat that error in every chapter. Only code-verified evidence and a labelled set can tell those apart [estimate].

### 10.2 Literature (all [web] snippets unless noted; none specific to fiction story-bible extraction)

- **Sampling-consistency as a confidence proxy.** Agreement among repeated samples (self-consistency) and clustering outputs by meaning then measuring dispersion (semantic entropy) are established uncertainty signals; one paper reports verbalized confidence from DeepSeek R1-32B is often overconfident while semantic entropy stays reliable; an AAAI 2025 paper reports consistency-based post-hoc calibration beats other methods across models on nine reasoning datasets; a May 2026 paper (Sem-ECE) uses semantic-class frequencies as confidence for open-ended QA [web: arxiv 2505.23845, AAAI 2025 "Calibrating LLMs with Sample Consistency", arxiv 2605.15588]. Another paper notes it is unclear whether LLMs are naturally calibrated on semantic notions of confidence without calibration, and that sampling methods depend on task-specific normalisation of answers before they can be compared [web]. **Implication:** agreement is a better signal than the model's own stated number, but needs (i) normalisation of claims before comparison and (ii) calibration on our labelled set. I found no paper applying agreement measures to field-level information extraction from fiction [web: none].
- **Divide-and-conquer failure modes.** LLM×MapReduce names two risks of chunking: inter-chunk dependency (long-range information lost) and inter-chunk conflict; it adds a structured protocol plus confidence calibration to handle them [web: arxiv 2410.09342, snippet]. This is the same problem as cross-chapter contradictions here.
- **Map-reduce vs iterative refine.** A hybrid long-document study reports Refine beat Map-Reduce on accuracy at every retrieval level (avg ~0.70 vs ~0.58) while Map-Reduce is parallel and faster [web: arxiv 2305.16344, snippet; task was QA/extraction over tables+text, not fiction]. Refine is sequential and re-sends the running summary every chunk, inflating tokens [web: vendor glossary, unsupported by experiments]. **No controlled study of error accumulation/drift across refine steps found** [web: none].
- **BookNLP chapter handling.** BookNLP processes a whole book as one document (long documents are windowed internally) and clusters characters across it; I did not verify chapter-level behaviour or whether it exposes per-chapter outputs [knowledge, unverified]. Coreference/quote attribution is typically evaluated per text excerpt (LitBank ~2,000 tokens per text) so book-length evaluation is thin [prior].
- **Long-document IE evaluation.** I found no standard benchmark for book-length character-property extraction; closest are CROSS (character profiling from 126 novels) and the fanfic death-event study (F1 <= 0.45, worse with length) [prior; abstracts only].

### 10.3 Pipeline design

```text
For each chapter c (independent; parallel only if RAM allows):
  Pass A  extract(c)            -> Rc  (mentions, aliases, properties, relations, claims, speakers) each with verbatim quote
  Pass B  extract(c, variant)   -> R'c (optional: re-prompted wording, paragraph order reversed or shuffled in blocks, temperature 0.3, or second model)
  verify(Rc), verify(R'c)       -> drop unverifiable quotes (3.3); record per-item evidence record (10.8)
Cross-chapter reduce (code):
  normalise claims -> claim keys; cluster identical/near-identical across chapters
  compute features per claim/entry/alias/speaker (10.5), flags (10.6)
  merge to Story Bible suggestions with per-chapter provenance (10.8)
Optional adjudication (LLM, only for flagged conflicts): shown both quotes, asked "same / different / unclear"
```

Overlapping windows: within a chapter, 1-2 paragraph overlap between chunks (3.1) so boundary facts are seen twice; the same claim extracted from two overlapping windows is *not* independent agreement (count once, mark `same_chapter`).

**Claim normalisation (needed for any comparison):** entries by alias-cluster id; properties by `(entry, key, normalised_value)` with the key from a fixed vocabulary, values lower-cased/stemmed, numbers and colours canonicalised; relations by `(entryA, entryB, relation-lemma)` with symmetric relations ordered; speakers by `(quote_id, speaker_entry)`; claims talk/act/know by `(entry, kind, verb-lemma + object-heads)` or, cheaper, by embedding similarity of the claim text plus overlapping evidence span [estimate; embeddings need a local encoder via ONNX, not benchmarked]. Un-normalisable free text is compared only through evidence-span overlap, not text.

### 10.4 Per-kind treatment

| Kind | Recurrence meaning | Contradiction rule | Scope |
| --- | --- | --- | --- |
| Entry (name exists) | Found in N chapters with verified quotes. Single mention in 1 chapter caps Low (E5) | None; entry may be split/merged | Global |
| Alias | Same alias linked to same entry in >= 2 chapters, or an explicit linking sentence (apposition, "known as", "called") once | Alias linked to two different entries in different chapters => `alias_conflict`; never auto-merge (e.g. "Smith") | Global, but conflict keeps chapters listed |
| Static property (eye colour, species, occupation) | Same value in >= 2 chapters | Different values for the same key => conflict flag, keep both with chapter provenance; may be legit change (hair dyed, new job) so label `changes_over_time?` | Global with chapter list; a changed value becomes two time-scoped values |
| Evolving property/state (age, location, title, allegiance, injury) | Not merged | Not a contradiction by default | **Per-chapter state records**; display "as of chapter N" |
| Relationship | Same pair+relation in >= 2 chapters | Different relation for same pair (friend vs enemy) => flag, usually an arc, not an error | Per-chapter, with first-seen chapter |
| Talk / Act | An event: each is an occurrence tied to its chapter; recurrence = repeated behaviour (habit) | None (events do not contradict) | Per chapter |
| **Know** | Knowledge can be gained, lost, false or secret | A character "knows X" in ch 5 but "doesn't know X" in ch 12 is a state change, not a conflict | **Per-chapter state ledger**: `acquired_at` (chapter+span), optional `revealed_false_at`, `concealed`; never merge into a global "knows"; viewer filter "as of chapter N" (spoiler-safe for performance). Recurrence across later chapters raises confidence only for *persistence*, not for *acquisition*, which needs its own evidence span |
| Speaker attribution | Per quote, so there is no cross-chapter replication; use cross-**pass** and cross-tool agreement | Two passes/tools giving different speakers for the same quote => `speaker_conflict`, forced into Needs verification | Per quote |

Because quotes belong to a single chapter, cross-chapter agreement helps entries, aliases and static properties most, and helps speakers/know least. For those, agreement must come from multiple passes (10.5 P) and from independent tools (rules tag, BookNLP).

### 10.5 Concrete confidence formula (placeholder weights; calibrate on the labelled set)

Fits the owner's rule: **score < 0.75 or unknown => Needs verification (narrator must verify); >= 0.75 => accepted but reviewable (marked "auto-accepted", filter and bulk-undo); missing/uncomputable => verify.** Everything is computed by code from checkable features. The model's own confidence is **not** an input (consistent with 3.6; [web] says verbalized confidence is poorly calibrated).

Per claim (entry, alias, property, relation, claim, speaker) compute:

- `V` verified-evidence count: number of *distinct* paragraphs (not windows) where the claim has a quote that verifies exact/normalised (fuzzy counts 0.5), after the support check (3.3 step 4). If `V = 0` the claim is dropped.
- `C` chapter spread: number of distinct chapters among those paragraphs.
- `P` pass agreement in [0,1]: among K independent extractions of the *same chapter* (different prompt/order/seed/model), the fraction that produced the same normalised claim. K=1 means `P` is unknown (treated as 0 contribution, not as 1).
- `T` tool agreement: +1 if a deterministic or independent tool supports (explicit speech-verb tag, apposition, BookNLP cluster/speaker), -1 if it contradicts, 0 if absent.
- `X` conflict: number of chapters/passes holding a contradicting value (10.4 rules).
- `B` basis: stated(1)/implied(0).
- `M` mentions (entries only): total exact mentions; `A` ambiguity flag.

```text
s = 0.25                                   # prior: an extracted+verified-once claim is not yet trustworthy
  + 0.20 * min(V, 3) / 3                   # more distinct paragraphs with verified quotes
  + 0.15 * min(C, 3) / 3                   # recurrence across chapters (not independent; smaller weight than V)
  + 0.20 * P                               # pass agreement (0 when K=1)
  + 0.15 * T+                              # +0.15 if tool supports; -0.25 if tool contradicts (T = -1)
  + 0.05 * B
  - 0.20 * min(X, 2) / 2                   # contradictions
  - 0.10 * A
cap: entries with M < 3 -> s <= 0.60
cap: know claims -> s <= 0.65 unless P >= 0.67 and an acquisition span exists
cap: all claims -> s <= 0.74 until the formula is calibrated (10.7)
decision: s >= 0.75 accepted-reviewable; otherwise (or any feature missing) needs verification
```

Worked examples [estimate]: entry named in 8 chapters, 3+ verified paragraphs, alias via apposition, two passes agree: 0.25+0.20+0.15+0.20+0.15+0.05 = **1.00** (cap lifts only after calibration). A trait found once, in one chapter, K=1, no tool: 0.25+0.067+0.05+0+0+0.05 = **0.42** -> verify. A talk claim in 2 chapters with a contradicting value elsewhere: 0.25+0.133+0.10+0-0.10 = **0.38** -> verify and flag. A speaker with an explicit verified tag and 2/2 pass agreement but a single paragraph: 0.25+0.067+0.05+0.20+0.15+0.05 = **0.77** -> accepted-reviewable. Verified one-paragraph claims thus only reach 0.75 with both pass agreement and tool support, which is deliberately demanding.

Agreement is much more informative if the extra passes are *diverse*: different model, different chunk boundaries, reversed paragraph order, and prompts that ask for the claim in a different form (extract vs verify "does this passage say X?"). Samples from one model at temperature 0 are nearly identical and give false confidence [knowledge]. A cheaper second look that is genuinely different: a **verification pass** per claim (given only the quote and the claim, answer yes/no), short prompt, short output.

### 10.6 Flags raised to the narrator (always shown, never silently resolved)

`alias_conflict` (alias belongs to two clusters), `entry_split?` / `entry_merge?` (cluster membership changes depending on the chapter subset or pass), `trait_conflict` (different values for the same key), `speaker_conflict` (passes/tools disagree), `know_regression` (claims "doesn't know" after "knows", offered as state change), `single_source` (one chapter, one pass), `fuzzy_quote`, `name_collision?` (a name used for different roles in different chapters; see 10.9), `late_only` (appears only in the last chapter, possible spoiler or sequel setup).

### 10.7 Calibration protocol (needs the gold set from the prior doc, 3.6)

1. Run the pipeline on 2-3 books with per-chapter outputs stored; label ~100 entries/aliases, ~100 properties/claims, ~100 quotes as correct/incorrect (and correct-but-unsupported-by-quote).
2. Fit the weights (logistic regression on the features V, C, P, T, X, B, M, A) or keep hand weights and map scores to observed accuracy by isotonic regression. Check **reliability diagrams per kind** (entry, alias, property, claim, speaker): calibration differs by kind.
3. Requirement for lifting the 0.74 cap per kind: the bucket "score >= 0.75" must have measured precision >= 0.75 on held-out *books* (not held-out chapters; chapters of the same book leak style), with a confidence interval reported (100 items gives roughly +/-9 points, so use more for kinds that matter [estimate]). Report **both** precision of the accepted bucket and the narrator burden (share of items sent to verification).
4. Re-run on every model, quant, prompt or formula change; store `formula_version` on suggestions.
5. Hold-out against memorisation: use unpublished or lesser-known text; for Alice/public-domain books the model may be reciting memory, which inflates both accuracy and agreement [knowledge].

### 10.8 Data-model addition (fits the suggestion schema in the prior doc, 3.3)

New record `ChapterEvidence`, one per (suggestion, chapter, pass). Suggestions keep their existing `evidence: Span[]`, and gain an aggregate and a ledger:

```ts
type ChapterEvidence = {
  id: string;
  suggestionId: string;            // entry/alias/property/relation/claim/speaker suggestion
  chapterId: string;
  passId: string;                  // links to an ExtractionPass
  spans: Span[];                   // verified, code-computed offsets; >=1 else the record is not stored
  verification: 'exact' | 'normalised' | 'fuzzy';
  supportCheck: 'pass' | 'weak' | 'fail';
  normalisedValue?: string;        // for property/relation comparison
  basis: 'stated' | 'implied';
  stateScope?: { from: ChapterId; until?: ChapterId; kind: 'acquired' | 'lost' | 'revealed-false' };  // know, evolving state
};

type ExtractionPass = {
  id: string; chapterId: string; kind: 'primary' | 'variant' | 'verify';
  model: string; quant?: string; runtimeBuild?: string; promptVersion: string;
  seed?: number; temperature: number; order: 'original' | 'reversed' | 'shuffled-blocks';
  at: string;
};

type Confidence = {
  score: number | null;            // null = unknown => needs verification
  formulaVersion: string;
  features: { V: number; C: number; P: number | null; T: -1 | 0 | 1; X: number; B: 0 | 1; M?: number; A: boolean };
  flags: string[];                 // 10.6
  decision: 'needs-verification' | 'auto-accepted-reviewable';
};
// added to every suggestion type: chapterEvidence: ChapterEvidence[]; confidence: Confidence;
```

Merge into one Story Bible entry: the entry holds one accepted/suggested value per key, plus `timeline: {chapterId, value, evidenceId}[]` for evolving properties and know-ledgers; the entry view shows "seen in chapters 1, 3, 4, 9" from `chapterEvidence`. Accepting copies the value and keeps the `ChapterEvidence` links, rejecting stores a tombstone including a fingerprint of the normalised value. Imported rows (section 5) get `ChapterEvidence` records only if their quotes verify, with `pass.kind = 'imported'`; imports are one pass, so `P` is null for them unless two imports agree.

### 10.9 Failure modes

- **Name reuse / series / many characters with the same name** (two Johns; father and son "Mr. Smith"; family surnames): cross-chapter merge by name is wrong. Mitigation: never auto-merge on surname-only or single-token matches; use context (co-occurring names, location, roles) and the `name_collision?` flag; ask the narrator via a merge suggestion with both sets of quotes. **Series:** the app handles one book at a time; a character known from book 1 appears as a mention only; do not import properties from model memory (rule 1 of the prompt).
- **Unreliable narrators / lies / rumours / fiction within fiction:** a character *says* something false; "talk" is fine, "know" and static properties are not. Require `basis` and treat claims whose only evidence is inside dialogue as `speaker_asserted`, not narrator-stated, with a lower cap [estimate].
- **Nicknames, dialect, titles and epithets** ("the Captain", "Her Ladyship", "Boy"): aliases are often role-based and change owner across chapters; role aliases get chapter-scoped validity (`alias.validIn`), not a global alias.
- **Pronoun-only chapters / close third person / first person:** few name mentions, so the Map pass finds nothing or invents a protagonist. First-person narrators have no name unless addressed: allow a synthetic "Narrator (I)" entry; for pronoun-only passages pass the previous chapter's active-character list as context only for *speaker resolution*, and cap speaker confidence for pronoun-only evidence (E7).
- **Chapter order assumptions:** flashbacks, nonlinear timelines, epistolary, multiple POV: "as of chapter N" is not story time. State it as reading order; do not claim chronology.
- **Correlated errors:** one wrong alias or hallucinated trait repeats across chapters => false high `C`. Mitigations: weight `V` (distinct verified quotes with support check) above `C`; sample-check the highest-scoring items first in calibration; use a second model or tool for the top-scoring contested entries.
- **Over-merge by shared prompt context:** if the running list of known entries is passed to each chapter (see 10.10), the model may "complete" mentions to existing entries; keep that list out of the primary pass.
- **Frequency bias:** minor characters appear in few chapters and are scored Low by design. Allow high score from a single chapter only via strong deterministic evidence (e.g. "X, the baker" apposition + name capitalised + 3+ mentions in the chapter) [estimate].
- **Chapter boundaries unavailable or wrong** (no headings): fall back to fixed-size windows, with `chapterId` = window index and weaker "recurrence" semantics.

### 10.10 Map-reduce vs running summary (iterative)

| Aspect | Independent per-chapter map + reduce (recommended) | Iterative "running summary"/refine (each chapter sees the Bible so far) |
| --- | --- | --- |
| Error propagation | Isolated: a bad chapter output affects that chapter; failures are localised and replayable | Errors enter the running state and are repeated and elaborated in later chapters (drift, anchoring); no controlled study of this found [web: none] |
| Independence for confidence | Chapter replication is meaningful (partly) | Later chapters are conditioned on earlier output, so "agreement" is an echo; confidence from recurrence is inflated |
| Cost | Parallel; prompts short and constant; resume per chapter | Sequential; prompt grows with the bible (re-sent every chapter) [web: vendor claim]; cannot parallelise |
| Alias/entity resolution | Needs a reduce step (code first, LLM for flagged) | Natural; the model can link "the Captain" to Arelian when it already knows Arelian; but over-merging risk |
| Accuracy | In one hybrid-doc study Refine beat Map-Reduce on accuracy (0.70 vs 0.58) [web, different task] | Same; speed trade-off |
| Cancel/rescan | Trivial per chapter | A change early in the book invalidates everything after it |

Recommended hybrid [estimate/judgement]: **independent primary pass per chapter** (the confidence engine depends on it), then an **optional second, conditioned pass** that gives the model the compact alias table from the reduce step (names only, not summaries, ~200-800 tokens) to resolve pronoun-only chapters and role aliases. The conditioned pass is *another* pass with a recorded `kind: 'variant'` and counts toward `P` at reduced weight because it is not independent. Never feed free-text summaries forward.

### 10.11 Cost and time for local models

Reuse the table in section 4 (CPU 4B: ~4.5 h for the 3-pass design; Apple Pro 8B: ~1.1 h; 8 GB GPU 8B: ~40 min) [estimate, unmeasured]. Per-chapter independence costs nothing extra beyond the base passes; **each additional full pass K adds roughly one more base pass of time**:

- K=2 on all claims: roughly x2 total (CPU 4B: ~9 h; Apple Pro: ~2.2 h; GPU: ~80 min) [estimate].
- **Cheaper selective agreement:** run the second pass only on (a) items that fall in 0.45-0.85 after the first pass, (b) the top-N highest-impact items (characters with many mentions), (c) speakers whose first-pass basis is `implied`. This typically touches 20-40% of items [estimate], so cost ~x1.3.
- **Verification pass** (claim + quote -> yes/no) costs mostly prefill of ~150 tokens and ~3 output tokens per claim; 1,000 claims is ~150k prefill and ~3k generation tokens, i.e. about 40 min on CPU 4B, 6 min on Apple Pro, 1 min on GPU [estimate]. This is the cheapest diverse second opinion.
- Cross-chapter comparison itself is code (milliseconds) except optional embedding of claim texts (ONNX encoder, tens of seconds per book [estimate]).
- RAM: running K passes sequentially needs no extra memory; parallel passes multiply KV cache (llama-server `-np`), so on 8-16 GB laptops keep K sequential.
- Scheduling: run pass 1 over all chapters first so the narrator can start reviewing; second passes run in the background and *raise* scores/flags later (items may move from verify to auto-accepted-reviewable, never the reverse without notice; moving down is shown as a flag).

### 10.12 What to build first for this feature

1. `ChapterEvidence`/`ExtractionPass`/`Confidence` types and the pure-function scorer, with unit tests using synthetic fixtures (including the worked examples above), since it needs no model.
2. Claim normalisation + conflict detection (alias_conflict, trait_conflict) as code, tested on the rules-baseline output and imported files (an import of several chapters' JSON is already "multiple passes" data).
3. Per-chapter know ledger and "as of chapter N" filter in the data model before any UI.
4. Calibration harness reading the gold set and printing reliability tables per kind.
5. Only then wire local passes (primary, verify, optional variant).

### 10.13 Could not verify (this section)

- All formula weights, caps, the example scores, and the "20-40% of items need a second pass" figure are placeholders/estimates; none calibrated.
- No paper found applying self-consistency/semantic-entropy agreement to field-level extraction from fiction or to character properties; the cited calibration work is on QA/reasoning [web, snippets only, not read in full].
- Refine vs map-reduce drift: no controlled study found; the 0.70 vs 0.58 result is one snippet from a hybrid table/text QA paper (arxiv 2305.16344), not fiction. The vendor-glossary claims about token inflation and dropped disclaimers are unsupported by experiments.
- BookNLP's chapter-level handling and per-chapter outputs: not verified.
- Whether chapters are sufficiently independent for agreement to track correctness on novels: untested; flagged as the main conceptual risk.
- Timing numbers inherit the unmeasured status of section 4 (model downloads remain blocked).
- Sources for this section: <https://arxiv.org/html/2505.23845v2> , <https://object.cloud.sdsc.edu/v1/AUTH_da4962d3368042ac8337e2dfdd3e7bf3/ml-papers/AAAI/2025/calibrating_large_language_models_with_sample_consistency__c93d278a.pdf> , <https://arxiv.org/pdf/2605.15588> , <https://arxiv.org/pdf/2305.16344> , <https://arxiv.org/abs/2410.09342v1> , <https://futureagi.com/glossary/llm-summarization-works> .
