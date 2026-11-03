# "Roll our own LLM" for Story Bible extraction: feasibility and plan

Desk research, 2026-10-10. Read-only on the repo, studio and studio2. No model was downloaded, trained or run. Builds on `scratchpad/story-bible-extraction-research.md` ([prior-1]) and `scratchpad/local-llm-research.md` ([prior-2]).

Labels: **[web]** seen on a fetched page or search result this session; **[prior]** from [prior-1]/[prior-2]; **[knowledge]** my memory, not re-verified, may be stale; **[estimate]** my arithmetic or judgement. Search in this sandbox was thin (several hosts unreachable: arxiv.org, gutenberg.org, github PDNC repo), so many dataset facts are [knowledge].

## 0. Bottom line

The owner means two different things, and the answers differ.

**A. A narrow Story Bible extractor we own (fine-tune + encoders + verifier): yes, worth building, in stages.** Realistic form: a LoRA/QLoRA fine-tune of an Apache-2.0 1.7-4B open-weight model that emits our JSON with verbatim evidence quotes, wrapped in the verifier/calibration pipeline we need anyway. Cost is small in compute (tens of dollars per training run [estimate]); the real cost is the gold set and narrator review time. Whether it beats the rules baseline is near-certain; whether it beats a bring-your-own large model on talk/act/know is doubtful and must be measured. Expect "our model" = verifier + calibration + gold set + a distilled small model, with the model the least valuable piece.

**B. A general-purpose LLM trained by us from scratch on public-domain and openly licensed text: technically possible, but not a good way to get this product.** The data exists (Common Pile, Common Corpus, Comma v0.1 prove it) but at 0.5-3B size an open-data-only model would be well below the web-trained small models we can fine-tune today, and would cost roughly 10-100x more in people and money than the narrow route for a worse extractor [estimate]. It only makes sense if the goal is the provenance/marketing position ("trained only on licensed text") and the owner will fund it as a separate programme, not as the way to ship Story Bible extraction.

**Hybrid worth knowing about:** continued pretraining on public-domain literature adds little, since the base models have already seen Gutenberg [knowledge]; skip unless a measured gap on period prose appears.

**Biggest hidden issue:** distilling from Claude (or any hosted model) is restricted by the provider's terms (section 2.4). If "licence-clean, no third-party terms" is a selling point, the training labels must come from humans plus an open-weight teacher whose licence allows it.

## 1. What "our own model" could mean (cheapest to most ambitious)

| Option | What it is | Compute | People | Quality outlook | Verdict |
|---|---|---|---|---|---|
| (a) Prompt + rules + verifier around an off-the-shelf small model | Existing repo extractor, plus constrained JSON decoding, quote verification, calibrated confidence ([prior-2] 3.3, 3.6) | 0 | 3-5 pw | Entities and explicit tags ok; talk/act/know and implicit speakers weak at 4-9B [prior] | Do first. The verifier is reused by every other option |
| (b) Task fine-tune (LoRA/QLoRA, or full FT) of Qwen3/Gemma/Phi/SmolLM, 1-4B | Teach the schema, the evidence-quote habit, refusal to infer | A few GPU-hours per run | 6-10 pw incl. data | Large gain in format reliability and quote fidelity; modest gain in comprehension (limited by base) [estimate] | Core of the "own model" story |
| (c) Specialised encoders (GLiNER-style span tagger, token classifier, coref, quote-attribution head on DeBERTa-v3/ModernBERT) + rules | Narrow, small (100-400 MB), CPU-fast, no generation | Hours on one GPU | 6-12 pw | Good for mentions, categories, explicit/anaphoric speakers; cannot do descriptions or talk/act/know | Strong complement: cheap candidate generation and a second opinion for agreement-based confidence |
| (d) Distillation from a large model's silver labels | Teacher labels books; student (b or c) trained on them | Teacher API cost, see 3.3 | within (b) | Student approaches teacher on the narrow schema, typically a few points below [knowledge] | Standard route, but see ToS (2.4) |
| (e) Pretraining from scratch | General LM on open data, then SFT | 10^20-10^22 FLOPs (section 4) | 2-4 engineers, 6-12 mo | Behind same-size web-trained models | Not worth it for this product; section 4 |

## 2. Training data

### 2.1 Sources and licences

| Source | What it gives | Licence / terms | Notes |
|---|---|---|---|
| Project Gutenberg | ~75k ebooks, most English [knowledge]; PG-19 = 28,602 books published before 1919 with licence boilerplate stripped [web] | US public domain; "you may do practically ANYTHING in the United States" with works not restricted by US copyright; PG makes no representation about any other country; the trademark may not be used if you charge for the ebooks without permission; you may still distribute if you strip the PG licence and all references to Project Gutenberg [web, gutenberg.org license via search snippets] | Strip headers/footers and the name. Authors who died recently enough are still in copyright in life+70 countries: filter to a conservative cut (e.g. author died before 1955, or pre-1929 publications) if the model or data will be distributed in the EU/UK [estimate]. Gutenberg text has OCR/typo noise, ASCII-isation, inconsistent quote marks (a real problem for dialogue tasks), pre-1919 skew |
| Standard Ebooks | A few thousand carefully proofread, typographically correct PD titles [knowledge, count unverified] | Texts PD in the US; their editorial work is CC0 [knowledge] | Clean curly quotes and paragraph structure: much better for dialogue than raw PG. Small (~0.1-0.3B tokens [estimate]) |
| LitBank | 100 English fiction works, ~2,000 words sampled from each, 210,532 tokens; entities (6 ACE types), events, coreference, quotations with speakers | CC BY 4.0 [web, github.com/dbamman/litbank] | Excellent for evaluation; tiny for training. Underlying texts are from Gutenberg |
| PDNC (Project Dialogism Novel Corpus) | 22 full novels, 35,978 quotations with speaker, addressees, type (explicit/implicit/anaphoric), referring expressions, character mentions [web, arXiv 2204.05836 via search] | Licence **not verified** (repo page 404 from here) | Best available quote-attribution gold. Check licence before copying into our repo; texts are mostly PD but some are from the 20th century (Christie, Forster) |
| BookNLP training data | Models trained largely on LitBank-style annotations [knowledge] | MIT code [prior]; data licensing follows source | Not a separate downloadable gold set as far as I know |
| QuoteLi3, RiQuA | Quote-attribution corpora (RiQuA: 19th-century English novels with speaker and addressee info [knowledge]; QuoteLi3: larger, later [knowledge]) | **Not verified** | Look up both before relying on either |
| FanfictionNLP | Quote/character resources built from fan fiction [knowledge] | Fan fiction authors hold copyright; research-only likely | Avoid for a shipped model |
| CoNLL-2012 / OntoNotes | News-heavy coref/NER | LDC licence, restricted [knowledge] | Not usable for a redistributed model; also wrong genre |
| WikiPlots, Wikipedia character pages | Plot summaries and entity descriptions (weak labels for "who is this character") | CC BY-SA [knowledge] | Share-alike obligations on derivatives are debated for model weights; risky for a clean-licence story |
| Narrative QA, CROSS (character profiles from 126 recent novels, EMNLP 2024) | Reading-comprehension and profile evaluation sets [prior/knowledge] | Not verified | CROSS is useful as a *modern-fiction* eval idea; check redistribution terms |
| Common Pile v0.1 | 8 TB of public domain and openly licensed text from 30 sources (papers, code, books, encyclopedias, educational material, audio transcripts), released with the code that built it [web] | Per-source open licences, curated for openness [web] | The sanctioned base for an open-data pretraining run |
| Common Corpus (Pleias) | ~1.998T tokens; roughly 0.9-1.1T public domain (books, newspapers, Wikisource, government); English ~969B tokens [web, Hugging Face card and reviews] | PD + permissive licences [web] | Mostly newspapers/government/code, not fiction |
| Comma v0.1 / KL3M | Comma v0.1-1T and -2T, 7B models trained on Common Pile, "competitive with Llama 1 and 2 7B" [web]; KL3M (legal-focused open-data models) [knowledge] | Open | Evidence of what open-data-only pretraining reaches |

### 2.2 How many tokens of PD fiction actually exist

[estimate] Gutenberg English: ~60k books x ~100k words ≈ 6B words ≈ 8B tokens in all genres, of which fiction maybe 30-40% ≈ 2.5-3.5B tokens. PG-19 (pre-1919, 28.6k books) is of the order of 2-3B tokens [knowledge: ~1.97B words]. Standard Ebooks adds a small clean set. So **clean PD English fiction is single-digit billions of tokens**: enough for a 0.1B model at Chinchilla ratios, or ~1B model with 4+ epochs of repetition. The large open corpora (Common Pile, Common Corpus) reach ~1-2T tokens only by adding newspapers, government text, papers, code and encyclopedias. For narration use the relevant gap is *modern fiction* (post-1929), which is under copyright and therefore absent from any clean corpus. Open-data models will know 19th-century prose and mid-century newspapers far better than contemporary dialogue, YA, thrillers, or present-tense first person [estimate].

### 2.3 What an extraction fine-tune needs (examples, not tokens)

- LIMA showed ~1,000 curated examples can elicit instruction-following style from a strong base [knowledge: Zhou et al. 2023]. For narrow structured tasks, practitioners commonly report usable behaviour from a few hundred and diminishing returns past a few thousand examples [knowledge, no single source].
- For this task, count *examples = (chapter window, gold JSON)*. Plan [estimate]: 300-800 windows for the first useful model (schema adherence, evidence habit), 2,000-5,000 for entity/alias/quote performance, with 100-200 of the windows gold (human-verified) and the rest silver. Quote attribution is the data-hungriest: PDNC alone gives ~36k labelled quotes.
- Label noise matters more than count: a few hundred verified examples beat thousands of unverified silver [knowledge].

### 2.4 Silver data and the terms-of-service problem

- **Anthropic Commercial Terms, D.4 Use Restrictions:** Customer may not "access the Services to build a competing product or service, including to train competing AI models or resell the Services except as expressly approved by Anthropic" [web, anthropic.com/legal/commercial-terms]. The same page says Customer owns its Outputs and has no *separate* output restriction [web].
- **Anthropic Consumer Terms, section 3:** prohibits using the Services "to develop any products or services that compete with our Services, including to develop or train any artificial intelligence or machine learning algorithms or models" [web, anthropic.com/legal/consumer-terms].
- Reading: training a *general* LLM on Claude outputs is clearly forbidden without approval. A narrow Story Bible extractor is arguably not "competing", but that is a legal judgement; **get written approval from Anthropic before using Claude outputs as training labels for a shipped model**, or assume it is forbidden. I did not read the Usage Policy or any API-specific addendum (Could not verify). Other hosted providers have similar clauses [knowledge, unchecked].
- Clean alternatives: (1) human gold labels by narrators; (2) programmatic labels from rules plus the verifier (high precision, low recall: use as "weak supervision"); (3) an open-weight teacher whose licence permits output training (Apache-2.0/MIT models such as Qwen3-large, gpt-oss, DeepSeek-class; check each licence because some releases tightened terms [web: reports that newer Qwen releases arrived with tighter restrictions]); (4) LitBank/PDNC conversion to our schema for entities/quotes.
- Silver generation cost if permitted: ~$0.10/book (Haiku 5.5) to ~$2/book (Sonnet 5.5) per [prior-1]. 150 books = $15-300; trivial next to review time.

### 2.5 Gold-set protocol with narrator review

1. Pick 30 books/excerpts: ~10 PD classics (not used for training), ~10 modern/CC-licensed or owner-supplied manuscripts used only for evaluation (never leave the machine/ never enter training), ~10 synthetic or hand-written stress texts (dialect, present tense, first person, unreliable narrator, no dialogue tags).
2. Pre-fill with the best available system (rules + large model), then the narrator *corrects* instead of writing from scratch; two narrators on 20% to measure agreement (Cohen's kappa).
3. Per item store: paragraph id, verbatim span, label, narrator verdict, time spent. Review time is the key cost metric: target <30 s per item [estimate].
4. Split by *book* (never by chapter) into train/dev/test; freeze test.
5. Size: ~100 entities with alias clusters, ~150 quotes per speaker-difficulty class, ~100 talk/act/know claims, ~100 negative probes (adjacent trait, spoilers, "know" leakage). About 40-80 narrator-hours [estimate].

### 2.6 Evaluation

- Entities/aliases: precision, recall, cluster purity (B3) on LitBank (CC BY) plus our gold.
- Quote attribution: accuracy by PDNC type (explicit/anaphoric/implicit), on PDNC held-out novels and our modern set.
- Claims: **evidence-verified rate** (quote found in the cited paragraph), **support rate** (human-judged: does the quote support the claim), hallucination rate, unverifiable-drop rate.
- Calibration: bucket the derived confidence ([prior-2] 3.6) and measure real accuracy; the "verify below 75%" rule is valid only if the >=75% bucket measures >=75% correct on the held-out set. Report reliability diagram and expected calibration error; re-run per model/prompt version.
- Leakage: Alice and other classics are in every base model's pretraining data [knowledge]; a model can "extract" from memory. Evaluate on text that post-dates training or is unpublished: owner manuscripts (with permission), CC-licensed recent fiction, synthetic novels, and a *perturbation test* (rename all characters/places in a PD novel and check scores don't change much).

## 3. Compute, cost and deployment of the narrow route

### 3.1 Fine-tuning (LoRA/QLoRA) 1-4B

[estimate, standard rules of thumb] 4B model, 3,000 windows x ~4k tokens = 12M tokens/epoch; 3 epochs = 36M tokens. QLoRA on a single 24 GB GPU (4090/L4/A10-class) runs ~2-5k tokens/s => 2-5 hours; on an H100 under ~1.5 hours. Cloud price $0.5-3/GPU-hour => **$2-15 per run**. Memory: QLoRA 4B ~10-16 GB; bf16 LoRA ~24 GB; full fine-tune ~16 bytes/param with Adam ≈ 64 GB+ (one 80 GB GPU, tight). 1.7B models are about half of everything. Iteration time: a dev loop of train + eval on 500 windows is ~half a day; plan 10-30 iterations. GPU cost is not the constraint; data and evaluation are.

### 3.2 Running on a laptop

GGUF Q4_K_M sizes: 1.7B ~1.2 GB, 4B ~2.5-3 GB, 8B ~5 GB [prior-2]. Speed: [prior-2] gives 4B at ~12 tokens/s generation on an 8-core CPU laptop and a ~4.5 hour full run per novel; those are unmeasured rules of thumb (weights download is blocked here). Fine-tuned small models can use shorter prompts (no few-shot, since behaviour is baked in) and terse outputs, which cuts time ~2x [estimate]. 8 GB machines: 1.7-2B only; quality drops. Quantisation of a fine-tuned model costs a few points; prefer Q5+ for <5B and re-evaluate the *quantised* artifact, not the bf16 one.

### 3.3 Base-model licences for redistribution

Apache-2.0 (redistribution of derivatives allowed with licence/NOTICE): Gemma 4 moved to Apache-2.0 in April 2026 (E2B, E4B, 26B MoE, 31B) [web]; Qwen3 / Mistral were Apache-2.0 [web, secondary; Qwen3 not named explicitly in my sources, verify on the model card]; newer Qwen releases may carry tighter terms [web]. Phi-4 MIT [prior, secondary]. Llama = Meta community licence (attribution, AUP) [prior]. SmolLM (Hugging Face) Apache-2.0 [knowledge]. Pin the exact checkpoint and archive its licence text. Our fine-tuned adapter + merged weights can be shipped under Apache-2.0 if the base is, provided training data (and teacher outputs) do not add restrictions.

## 4. Option (e) in depth: pretraining a general LLM on open data

### 4.1 What exists and what it achieved

- **Common Pile v0.1 and Comma v0.1:** 8 TB, 30 sources; Comma v0.1-1T and -2T, 7B models trained on 1T and 2T tokens, reported competitive with Llama 1 and 2 7B, models trained on unlicensed text [web, NeurIPS 2025 abstract]. That means: open data matches *2023-era* 7B web-trained models, not 2025-26 ones. GPU-hours were not in what I could read (Could not verify).
- **Common Corpus / Pleias:** ~2T tokens, trained at 350M, 1.2B, 3B on the Jean Zay supercomputer [web]; Pleias-RAG-350m/1B were mid-trained on synthetic retrieval-style data and the authors report beating sub-4B models on HotPotQA/2wiki and competing with Qwen-2.5-7B, Llama-3.1-8B, Gemma-3-4B *on their RAG-style task* [web, authors' own claim, not independently verified]. The interesting part for us: **small open-data models can be strong on a narrow citation-style task after specialised mid-training** — which is exactly the pattern of "evidence quotes". But it needed a large synthetic dataset, probably generated by other LLMs, and the base was a government-funded run [knowledge].
- KL3M (legal-domain open-data models) shows the same: strong in-domain, weak general [knowledge].

### 4.2 Compute and dollars

Rule: training FLOPs ≈ 6 x params x tokens. H100 bf16 peak ~990 TFLOPs; realistic 25-40% MFU for small dense models ⇒ 250-400 TFLOPs/GPU [estimate]. Cloud H100 $2-3/GPU-hour (spot/large commitments lower) [estimate].

| Model | Tokens (regime) | FLOPs | H100-hours | Cost (final run only) |
|---|---|---|---|---|
| 0.5B | 10B (Chinchilla 20:1) | 3e19 | 30-35 | ~$100 |
| 0.5B | 100B (200:1, over-trained) | 3e20 | 300-350 | ~$1k |
| 1B | 20B (20:1) | 1.2e20 | 85-135 | ~$300 |
| 1B | 200B (over-trained) | 1.2e21 | 850-1,350 | $2-4k |
| 1B | 1T (SmolLM-style) | 6e21 | 4-7k | $10-20k |
| 3B | 60B (20:1) | 1.1e21 | 750-1,200 | $2-3.5k |
| 3B | 1T | 1.8e22 | 12-20k | $30-60k |
| 7B | 1T (Comma-1T scale) | 4.2e22 | 29-47k | $60-140k |

Add: experiments, ablations, failed runs and data-pipeline reruns typically cost 3-10x the final run [estimate]; so a serious 3B at 1T tokens is a **$100-500k programme** in compute alone, before people. The cheap rows (0.5-1B, 10-200B tokens) are affordable and would yield a GPT-2/Pythia-class model: fluent but weak at following long structured instructions, poor reading comprehension, benchmarks (MMLU, ARC, HellaSwag) near the low end of the same-size range [knowledge]. Same-size web-trained models today (Qwen3-1.7B, Gemma E2B, SmolLM3) trained on 10-36T tokens, i.e. 10-100x more data than any clean corpus gives a 1-3B model [knowledge, token counts approximate].

Data limit: to train 1B on 200B tokens of *fiction-relevant* text you would have to repeat PD fiction (~3B tokens) ~60x, which degrades quality (repetition beyond ~4 epochs gives little [knowledge: Muennighoff et al.]). You would therefore train mostly on newspapers, government text, papers and code (Common Corpus/Pile). That yields a general model with little fiction competence, not a narrator-specialised one.

### 4.3 Infrastructure, pipeline, post-training

- **Frameworks:** nanoGPT/nanotron/torchtitan/OLMo-core/Megatron-LM; for 1-3B on <=64 GPUs torchtitan or OLMo-core with FSDP are enough [knowledge]. Rented 8xH100 nodes (Lambda, RunPod, CoreWeave) or an EU academic grant (Pleias used Jean Zay [web]).
- **Data pipeline:** download (Common Pile/Corpus are ready-made; reuse them rather than re-collect), language ID, quality filtering, exact + MinHash dedupe, boilerplate/header stripping, OCR-noise filtering (Gutenberg plus scanned newspapers: heavy noise in Common Corpus-style OCR data [knowledge]), PII, licence manifest per document, tokeniser training (BPE 32-64k), shard to 1-2 TB. 6-10 pw for a first pass [estimate].
- **Post-training:** SFT on ~10-50k instruction examples (this itself needs a teacher model: licence-clean teachers only), then DPO or rejection-sampling/RL on verifier rewards (quote exists, schema valid, support check passes: a natural RL reward for us). Structured JSON via constrained decoding at inference regardless. 6-12 pw [estimate].
- **Team/time:** 2-4 ML engineers + 1 data engineer, 6-12 months to a 1-3B model that follows instructions and then to a task-tuned extractor; plus ongoing re-training when tokenisers/architectures move on (maintenance is a standing cost, 20-30% of the team) [estimate].
- **Evaluation of the general model** needs its own harness (lm-eval-harness etc.): extra 2-3 pw.

### 4.4 Honest comparison with fine-tuning an existing open-weight model

| Dimension | Fine-tune open-weight (Qwen3/Gemma 4/SmolLM, 1-4B) | Pretrain from scratch on open data |
|---|---|---|
| Out-of-pocket compute | $10-500 | $300 (toy) to $100-500k (serious) |
| Time to first working extractor | 2-6 weeks | 6-12+ months |
| Reading comprehension / instruction following | Inherits trillions of web tokens; best per dollar by far | Comparable to 2023-era models of same size at best [web: Comma ~Llama 1/2 7B] |
| Fiction competence (modern) | Base saw modern web fiction and fan fiction [knowledge] | Weak on post-1929 prose; no modern dialogue conventions |
| Licence cleanliness | Base-model licence + whatever web data it saw; provenance not auditable | Fully auditable data manifest; no third-party model terms |
| Third-party terms | Apache-2.0 bases impose almost none; teacher-output terms are the real exposure | None, if no hosted-model labels were used |
| Privacy story | Same: local either way | Same |
| Marketing | "Fine-tuned on Qwen/Gemma" | "Trained only on public-domain and licensed text": real differentiator for authors worried about AI |
| Maintenance | Swap base each year; re-run recipe | Full re-train or abandon; falls behind the field |

Advantages of owning a model: clean provenance, no dependence on a vendor's licence changes (Gemma changed terms once, newer Qwen tightened [web]), ability to publish weights and data manifests, and the story for narrators and authors. These are real but do not require pretraining: a clean *task* dataset (human labels + open-weight teacher) on an Apache base gives most of the licence benefit; "built only from openly licensed data" is the one claim fine-tuning cannot make honestly.

### 4.5 Hybrid: continued pretraining / domain adaptation

Continue-pretrain a 1.7-4B base on ~2-3B tokens of PD fiction (PG-19 + Standard Ebooks), then task fine-tune. Compute: 6 x 4e9 x 3e9 = 7e19 FLOPs ≈ 50-100 H100-hours full FT (~$150-300), LoRA cheaper [estimate]. Expected benefit: small. The base already read this text [knowledge], PD fiction is skewed to 1800-1930, and CPT risks forgetting instruction following and degrading modern prose. A better use of the same budget is SFT on *diverse* labelled windows including dialect, present tense, first person. Treat CPT as an experiment only if the gold-set error analysis shows period-prose failures. A genuinely useful middle path is **mid-training a small open-data model (Pleias-style) on synthetic evidence-citation tasks**; this is research-grade and only worth it if the "open data only" claim is a hard requirement.

## 5. Risks

- **Hallucination:** invented traits/knowledge; mitigated by verbatim evidence + support check + review queue; hallucination rate (quote exists but doesn't support) is the metric to gate on.
- **Long context:** keep chapter windows at 4-8k tokens; small models degrade with length [prior-2].
- **Genre/period bias of PD training data:** pre-1919 diction ("said he", "thou", archaic names), few contractions, different quote punctuation (British single quotes, em-dash dialogue in translated works). Modern dialogue conventions, tagless dialogue, dialect spelling, present tense, first person, unreliable narrators and second-person text are under-represented; build synthetic and licensed modern stress sets and include them in SFT.
- **Copyright:** (1) PD status is US-centric; PG makes no claim abroad [web]. (2) Test manuscripts from narrators are in copyright; never train on them without explicit written permission, keep eval-only copies local, and keep them out of hosted calls unless consented. (3) Training-on-copyrighted-text legal position for models is unsettled [knowledge]; open-data-only sidesteps it, fine-tuning on PD does too, but the base model's pretraining does not.
- **Evaluation leakage:** classics are in all base models; use held-out/modern/synthetic and the rename-perturbation test (2.6).
- **Maintenance:** llama.cpp and base models move monthly; each model update means re-running the fine-tune, re-quantising, re-calibrating, re-running the gate. Budget ~1 pw per quarter [estimate].
- **Privacy advantage of local:** real and marketable: manuscript never leaves the machine; the shipping risk is download/runtime packaging ([prior-2] section 2).
- **Output ToS risk** (2.4): the one issue that could invalidate a trained artifact after the fact.

## 6. Staged roadmap with decision gates

| Stage | Work | Effort (people-weeks) | Gate to continue |
|---|---|---|---|
| 0 | Rules-baseline fixes, evidence verifier, suggestion/review data model ([prior-1] 3.7, [prior-2] 6.2) | 3-5 | Verifier unit-tested; Alice junk rate down |
| 1 | Gold set (2.5) + scoring script, run baselines: rules, spaCy, BookNLP, 4-8B local zero-shot, hosted BYO | 4-6 (incl. 40-80 narrator-hours) | We know the baseline numbers. **If a bring-your-own large model gets >=90% of what we need and users accept it, stop here for generation and keep only (a)** |
| 2 | Minimal fine-tune experiment (section 7) | 2-3 | Fine-tuned 4B beats zero-shot 4B by a clear margin on evidence-verified rate and claim support and approaches BYO-large within ~10 points on entities/aliases/explicit quotes |
| 3 | Encoders (GLiNER-style/DeBERTa quote and mention heads) trained on LitBank + PDNC + silver; agreement-based confidence | 4-6 | Adds measurable accuracy or lets us shrink the LLM's job |
| 4 | Productise: GGUF, llama-server sidecar, catalog asset, consent UI, calibration of 75% rule on gold | 6-8 | Calibration bucket >=75% really >=75%; speed acceptable on 3 measured machines |
| 5 (optional) | Open-data-only story: Pleias-style mid-training on a small open base, or full pretrain | 40-100+ (6-12 months, $100-500k) | Owner explicitly funds provenance as a product goal; Stage 1-4 showed the narrow task is solved on a web-trained base |

Total narrow route to a shippable local model: ~20-30 pw (about 5-7 months for one engineer, shorter with two) [estimate].

## 7. Minimal first experiment (2-3 weeks)

- **Base:** Qwen3-4B (or Gemma 4 E4B), Apache-2.0 (verify card), plus a Qwen3-1.7B arm for the 8 GB case. QLoRA r=16-64, all linear layers, 2-3 epochs, lr 1e-4-2e-4, one 24 GB GPU.
- **Task:** window (4-8k tokens, numbered paragraphs, candidate entity list) -> JSON: entities+aliases, properties, talk/act/know with `paragraph` + verbatim `quote`, quote speakers, all schema-constrained.
- **Data (~1,500 windows):** 40 PD novels from Gutenberg/Standard Ebooks (cleaned), labels from (i) LitBank/PDNC conversion where available, (ii) rules+verifier high-precision labels, (iii) an open-weight large teacher (Apache/MIT) with verifier filtering, (iv) 150-200 narrator-corrected gold windows. Claude-labelled data only with written Anthropic approval (2.4). Hold out 10 novels plus 10 modern/synthetic documents the model never sees.
- **Measure** (same test set for every arm): entity/alias F1 and B3, quote-attribution accuracy by PDNC type, evidence-verified rate, support rate/hallucination rate, JSON-valid rate, drop rate, review seconds per accepted item, tokens/s and RAM on 3 machines. Arms: rules baseline, spaCy, BookNLP, zero-shot 4B with schema, **fine-tuned 4B**, fine-tuned 1.7B, BYO large hosted model (user pastes), and (if licensed) a hosted frontier model as an upper bound.
- **Success:** fine-tune beats rules on entities/aliases/quotes by a stated margin; evidence-verified rate >=95% after verification; hallucination rate <=5% in the "high" bucket; clearly better than zero-shot 4B; distance to BYO-large reported honestly. **Failure** on talk/act/know is acceptable and expected: ship entities/aliases/speakers locally and make talk/act/know a BYO/hosted feature.

## 8. Build-vs-buy conclusion

- **Narrow extractor:** build the pipeline (verifier, calibration, gold set, review queue) in every case; build a fine-tuned small model if Stage 1 shows BYO-large is not enough for offline users; buy the base model (Apache-2.0 open weights) and encoders. "Our own model" here is mostly the data, the verifier and the calibration, which are the parts that do not go stale; the weights are replaceable.
- **General LLM from scratch:** buy, don't build, for this product. A 1B-3B open-data model would cost $2k-$60k to train for the final run and 10x that with experiments and people, and would still lose to a fine-tuned Qwen/Gemma on this task, because the extraction needs web-scale reading comprehension and modern-fiction knowledge that clean public-domain data lacks. Build it only if the owner wants a provenance-first AI product line in its own right; then fund it as a separate research programme, start from Common Pile/Common Corpus and a published recipe (Comma, Pleias), and expect 6-12 months and a team.
- **Cheapest honest version of "we own a model":** publish a fine-tuned Apache-2.0 small model, its training manifest, the gold set, and the verification pipeline; claim only what is true (base from a named vendor; task data human-labelled or from an open teacher).

## 9. Could not verify

- Anthropic: I read the Commercial Terms D.4 and Consumer Terms section 3 summaries via a fetch tool that paraphrases pages; I did not read the Usage Policy, any API addendum, or whether approvals for narrow tasks exist. Get counsel's reading and Anthropic's written permission before any Claude-labelled training data.
- PDNC, QuoteLi3, RiQuA, FanfictionNLP, Narrative QA, WikiPlots, CROSS licences and sizes: not verified (GitHub PDNC page 404, arxiv.org and gutenberg.org unreachable from the sandbox; only search snippets).
- Gutenberg token counts, fiction share, Standard Ebooks counts, PG-19 token total: [knowledge/estimate] only; the dataset page snippet gave book counts, not tokens.
- Comma v0.1 and Pleias GPU-hours, exact token counts of Common Pile, and head-to-head benchmark tables: not read (paper full text unreachable). "Competitive with Llama 1/2 7B" is from the abstract; the Pleias-RAG comparisons are the authors' own claims.
- All GPU-hour/dollar figures in section 4.2 are my arithmetic from 6ND, assumed MFU and assumed GPU prices; real throughput varies 2x.
- Fine-tuning example counts (hundreds to a few thousand) and LIMA are from memory; my search for them returned nothing.
- Qwen3 licence on the specific checkpoints, SmolLM licence, Phi-4 MIT: secondary or memory; verify on model cards.
- No model was run: all laptop speeds are [prior-2] rules of thumb. Weight downloads are blocked in this sandbox.
- Whether Anthropic's "competing" language covers a narrow in-app extractor: a legal question I cannot answer.

## 10. Sources

- Anthropic Commercial Terms: <https://www.anthropic.com/legal/commercial-terms>
- Anthropic Consumer Terms: <https://www.anthropic.com/legal/consumer-terms>
- LitBank (CC BY 4.0, 100 works, 210,532 tokens): <https://github.com/dbamman/litbank>
- Common Pile v0.1 (NeurIPS 2025): <https://proceedings.neurips.cc/paper_files/paper/2025/hash/52acc050138d6f40dad6f12f91a4ce22-Abstract-Datasets_and_Benchmarks_Track.html> ; <https://www.eleuther.ai/papers-blog/the-common-pile-v01-an-8tb-dataset-of-public-domain-and-openly-licensed-text>
- Common Corpus: <https://huggingface.co/datasets/PleIAs/common_corpus> ; <https://simonwillison.net/b/8294> ; <https://www.themoonlight.io/en/review/common-corpus-the-largest-collection-of-ethical-data-for-llm-pre-training>
- Pleias models: <https://simonwillison.net/2024/Dec/5/pleias-llms/> ; <https://arxiv.org/pdf/2504.18225> (Pleias-RAG) ; <https://genci.fr/resultats-projets/resultats/pleias-10-open-language-models-public-good>
- PG-19: <https://huggingface.co/datasets/deepmind/pg19>
- PDNC: <https://arxiv.org/pdf/2204.05836> ; ACL 2023 quotation attribution <https://arxiv.org/pdf/2307.03734>
- Project Gutenberg licence/permissions: <https://gutenberg.org/license> ; <https://gutenberg.org/policy/permission>
- Gemma 4 Apache-2.0: <https://the-decoder.com/googles-gemma-4-is-now-available-with-apache-2-0-licensing-for-the-first-time/> ; <https://datanorth.ai/news/google-releases-gemma-4-open-models>
