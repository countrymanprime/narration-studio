# Story Bible auto-population: what the repo has, what else exists, what to build

Research only. Nothing in `/home/user/narration-utils` or `studio/` / `studio2/` was modified. Date: 2026-10-10.
Paths are relative to `/home/user/narration-utils` unless absolute. "Verified" = read in the repo, run here, or fetched from the live URL this session.

## 0. Short answers

1. **The repo has no LLM anywhere.** Its extractor is deterministic: spaCy NER (optional, downloadable `en_core_web_sm`/`lg`) or a regex "rules-only" fallback, plus rule-based quote attribution and keyword-based trait/description notes. ADR 0020 and `docs/architecture/story-bible-entity-accuracy.md` explicitly list "an LLM-based extractor" as *out of scope, needs its own research*. `docs/research/local-dependency-evaluation.md` has BookNLP and GLiNER v2.1 as **approved-for-trial, not adopted**.
2. **Quality, measured here on the Alice fixture (rules-only; the spaCy model is not installed in this sandbox):** it finds the headline cast but also emits contractions as entities, misses the Hatter and the Caterpillar, mislabels most named characters as "Needs Review", and attributes only 31 of 1,099 quotes by tag (271 more by alternation, 797 left unknown). The only labeled benchmark in the repo is 31 synthetic quotes (precision 0.963, recall 1.0 on determinable quotes) which is far too easy to generalise from.
3. **For talk/act/know there is nothing in the repo.** The closest thing is `properties` (free key/value pairs, manual only), `personality_notes` (a 60-word keyword list) and `description` (one regex for "X is a ..."). An LLM is the only realistic way to get per-character say/do/know evidence; the right shape is **rules/NER for candidates, LLM for aliases, properties and talk/act/know, every claim carrying a verbatim quote and paragraph offsets that code verifies, everything landing in "Needs review"**.
4. **Recommendation:** put it behind a provider interface with three implementations: `rules` (the existing one), `local-llm` (Ollama/llama.cpp, opt-in download) and `hosted` (Anthropic API, off by default, explicit per-book consent). Build the data model and the review UI in the mock now with fixture data; build the provider later.

---

## 1. What the repo already has

### 1.1 Files (all read)

| Area | Where |
| --- | --- |
| Extractor, merge, rescan, cues, pronunciation | `sidecars/manuscript-guide/core/manuscript_guide.py` (1,917 lines), `core/providers.py` |
| Tests | `sidecars/manuscript-guide/tests/` (7 files; **190 passed** when I ran them here in 5 s) |
| Policy | `docs/adr/0020` (precision over recall), `0007` (locked entries), `0018`, `0019`, `0042`, `0080` (spaCy model as downloadable asset), `0345` (stable ids + dialogue cues), `0346/0352` (pronunciation status, queries) |
| Accuracy note | `docs/architecture/story-bible-entity-accuracy.md` |
| Cue eval | `docs/research/character-continuity-cue-extraction-eval/{RESULTS.md,run_eval.py}` (re-run here, numbers reproduce) |
| Candidate tools | `docs/research/local-dependency-evaluation.md` (spaCy models, BookNLP section 2, GLiNER section 3) |
| UI contract | `apps/ui/src/api/contracts/storyBible.ts`; golden payloads `tests/fixtures/contracts/guide-*.json` |
| Fixtures | `tests/fixtures/alice.md` (3 chapters, 807 paragraphs, ~26.4k words), plus txt/docx/epub/pdf |

### 1.2 Pipeline, step by step

1. **Load**: canonical manuscript JSON, narration chapters only, each paragraph has `chapterId`, `paragraphId`, `text`.
2. **Candidates**: either `spacy_candidates` (PERSON/ORG/GPE/LOC/FAC, parser and lemmatizer disabled) or `rule_candidates` (capitalised-word regex). Both pass through `clean_entity_text` (filler words, possessives) and a "common word" test: a single word is rejected if the manuscript also uses it lowercase, or it ends in `-able/-ing/-ed/-ly...`; spaCy can override only with two mid-sentence capitalised mentions.
3. **Classify**: spaCy label -> Character/Place/Organization; else keyword lists (ORG_WORDS, PLACE_WORDS, TITLE_WORDS); lone words become **Needs Review**; a Needs Review entity needs 3+ occurrences to be kept.
4. **Aliases**: only one rule, title-prefix merge ("Captain Arelian" absorbs "Arelian"). Everything else is a separate candidate; the narrator merges by hand (`merge`, `split`, `absorbed_names` so a merge survives rebuilds).
5. **Per-entity fields**: `occurrences` (paragraph, offsets, excerpt), `appearances` (chapter+scene map), `description` (regex "X was/is a/an/the ..." with its sentence as evidence), `personality_notes` (sentence containing the name and any word from a fixed `TRAITS` set, max 5, text "Described as brave." plus excerpt), `properties` (ordered `{key,value}` list, **narrator-entered only**), `relationships` (manual `relate`; a name snapshot on one side only per the earlier compare notes), `pronunciation` (CMU/eSpeak/Piper, status and note, ADRs 0346/0405/0680/0695).
6. **Dialogue cues** (`extract_dialogue_cues`): double-quoted spans, speech-verb tag before/after naming a known Character (`speaker_source: tag`), else per-scene alternation when exactly two speakers are active (`continuation`), else `unknown`. Narrator corrections persist (`correct_cue`, `merge_dialogue_cues`).
7. **Rebuild** (`merge_locked`): locked/manual entities are kept wholesale, ids survive by name overlap (ADR 0345), reviewed fields are carried forward.

### 1.3 What is deterministic vs model-based

Everything is deterministic given the same spaCy model. The only "model" is spaCy NER (statistical, offline, MIT, 12.8 MB sm / 400 MB lg, SHA-pinned catalog asset, ADR 0080). The build asks before downloading and can run rules-only. No network use, no manuscript leaves the machine (`SECURITY.md`: "no telemetry, no account"; sending content off the machine without an explicit action is a vulnerability class). Latency: rules-only on Alice, 26k words, **0.07 s** (measured; pronunciation lookups stubbed out). spaCy sm is seconds for a book; lg a bit more (not measured here).

### 1.4 Measured quality on the Alice fixture (rules-only, run by me)

Script: `scratchpad/alice_eval.py` (imports the sidecar read-only). 51 entities emitted.

Found correctly: Alice (but canonical "Miss Alice", 393), Mock Turtle, March Hare, White Rabbit, Cheshire Cat, Mary Ann, Father William, Knave of Hearts, plus Duchess/Dormouse/Gryphon/Dodo/Dinah/Lory/Eaglet as "Needs Review" (correct names, but not classified).

Failures seen:
- **Junk entities**: `I'm` (54), `I've` (32), `I'll` (30), `I'd` (10) because the typographic apostrophe breaks the filler/stop-word list; `If I`, `Do I`, `Nor I`, `Speak English`, `What I`, `That's Bill`, `It's the Cheshire Cat`, `Here the Queen`, `Mock Turtle Soup`, `Fourteenth of March`, `Pray` (all multi-word capitalised phrases trusted as names, ADR 0020 "known trade-off"). Roughly 20 of 51 rows are junk (my count, no gold list).
- **Missed real characters**: **Hatter** (55 capitalised mentions, 46 as "the Hatter") and **Caterpillar** (27) are absent: the lowercase-use test or the filler stripping rejects them. Queen, King, Duchess lose their role.
- **Wrong merges / titles**: "KING AND QUEEN" (a stage direction) is the canonical name of one entity absorbing "Queen", so the King and the Queen are one character; "Caterpillar and Alice" and "Five and Seven" are single entities.
- **No alias clustering** beyond title prefix: "the Duchess"/"Her Majesty"/"Majesty" are separate rows; "Miss Alice" -> "Alice" works.
- **Trait notes are noise**: "Described as wise / curious / kind" on Alice and the Mock Turtle come from any sentence that contains the name and a trait word, regardless of who the word describes. This breaks the owner's "nothing invented without evidence" rule in spirit: the evidence exists but does not support the claim.
- **Descriptions**: one hit on Alice ("Explicitly described as good deal worse off than before." which is a clipped sentence fragment) and Dinah ("cat"). Everything else empty.
- **Dialogue**: 1,099 quotes; **31 by tag, 271 by continuation, 797 unknown**. The tag path requires the speaker to be a known Character entity, and most named characters were Needs Review (excluded from the speaker index), so recall collapses on exactly the books with many named non-human speakers. Continuation is unaudited on real text (the repo's own eval documents one miss on synthetic text).
- With the spaCy model the classification would improve (PERSON/GPE labels) and some junk drops; I could not test that offline. spaCy's English NER is trained on news (OntoNotes) and is known to be weak on invented fantasy names and animals-as-characters (stated by literature, not measured here).

### 1.5 Evidence in the repo about accuracy

- Quote attribution: 31 synthetic quotes, precision 0.963, recall 1.0 on the 26 determinable (4 of 5 ambiguous correctly left unknown). The PRD's own target was 50-100 hand-labeled quotes from real manuscripts; that has not been done. `RESULTS.md` itself says it is a seed set.
- Entities: regression fixtures for specific reported junk ("ACCEPTABLE", "Abandoned", "About S-Dawn"). No precision/recall number against a gold entity list.
- Properties/talk/act/know: no tests of quality exist, only of storage (`test_properties.py`).
- BookNLP and GLiNER: documented as candidates with trial plans and licence cautions, no trial run in the repo.

### 1.6 Honest assessment

It is a **good conservative candidate finder with an excellent review/rebuild model**, and a poor *interpreter* of text. The strongest parts to keep: ids stable by name overlap, locks, `absorbed_names`, evidence = paragraph id + offsets, `speaker_source` provenance tiers, corrections that survive rebuilds, "Needs Review", the precision-first policy. The weak parts: alias discovery, junk phrases, apostrophe handling, role/category for named non-humans, quote attribution beyond explicit tags, and anything semantic (traits, relationships, knowledge).

---

## 2. Alternatives

### 2.1 Local non-LLM NLP

| Option | What it gives | Facts (source) | For this app |
| --- | --- | --- | --- |
| **spaCy** sm/lg (already in repo) | NER only | MIT; sm 12.8 MB, lg 400 MB (repo ADR 0080) | Keep as candidate generator. `en_core_web_trf` (transformer) not evaluated by repo; unverified here |
| **BookNLP** | Entity tagging (PER/LOC/FAC/GPE/VEH/ORG, incl. pronouns and nominals), coreference, **character clustering of name variants** ("Tom", "Tom Sawyer", "Mr. Sawyer"), quote detection and speaker attribution, supersenses, events | MIT, English only. Small model: entity F1 88.2, speaker-attribution B3 86.4; Big: 90.0 / 89.9. 99k-token book: small 2.1-3.6 min on CPU/GPU, big 2.2 (GPU) to 15.4 min (laptop CPU). Needs PyTorch. Repo page shows 7 commits; maintenance status unclear ([booknlp README](https://github.com/booknlp/booknlp)) | The best offline source of **alias clusters and speaker attribution**. Costs: PyTorch (first in this repo), model licensing review (repo doc already demands it), Python/PyInstaller size, last upstream activity unverified. Good trial candidate, not a property/knowledge extractor |
| **GLiNER (v2.1, Apache-2.0 artifacts only)** | Zero-shot labelled spans (`character`, `place`, `invented term`) | Repo doc: older Base/Small are CC BY-NC (excluded). No published fiction benchmark found; one practitioner blog trained a fiction NER but published no weights or numbers ([search result](https://justin.poehnelt.com/posts/building-a-fiction-ast-training-ner-gliner-onnx/)) | Cheap recall booster for invented names; adds false positives; no aliases/relations. Spans only |
| Academic pipeline (Vala et al. / AAAI 2022 "Extraction and representation pipeline for literary characters") | NER F1 ~0.85, coref ~0.76 reported | [AAAI abstract](https://ojs.aaai.org/index.php/AAAI/article/view/21709) | Illustrates that rule-free NER+coref is mid-80s/mid-70s on novels |
| Quote attribution research | PDNC (22 novels, 35,978 quotes). ACL 2023 short paper ("Improving Automatic Quotation Attribution in Literary Novels") splits the task into character identification, coref, quote identification, speaker attribution and finds a simple sequential model is on par with SOTA. SIG (prompt-based generation) beats complicated baselines and zero-shot ChatGPT, especially on implicit/anaphoric quotes (up to +17%) | [arXiv 2307.03734](https://arxiv.org/html/2307.03734v1), [SIG arXiv 2312.14590](https://ar5iv.labs.arxiv.org/html/2312.14590) | Use PDNC-style *types* (explicit / implicit / anaphoric) as the label for confidence. No frontier-LLM PDNC numbers found (see Could not verify) |

Note on a community name in the brief: "QuoteKG" is a quotation knowledge-graph project, not a fiction speaker attributor; I did not find it relevant and did not verify it.

### 2.2 LLM approaches (prompting and structure)

What the literature and tooling support (all of this is design reasoning, only the cited items are verified):

- **Whole-book long context vs chunked.** Current Claude models have 1M-token windows (about 555k words on the current tokenizer; a 90k-word novel is roughly 165k tokens) and 128K max output ([models overview](https://platform.claude.com/docs/en/about-claude/models/overview)). A whole manuscript fits in one request, but extraction recall and evidence-quoting reliability degrade on very long inputs for every model I know of (general knowledge, not measured here), and one failure loses the whole run. Chunk by chapter (or ~10-20k tokens), run a cheap map pass, then a reduce pass that clusters.
- **Map-reduce shape**: Map = per chapter, "list every named person/place/thing in this chapter with the exact surface forms, each with a quote". Reduce = merge across chapters by alias clustering over the *mention list* (not the full text), producing candidate entries. Then an **entity-centric pass**: for each accepted entry, feed the paragraphs that mention any of its names (code-selected using exact-string search) and ask for properties and talk/act/know with evidence. This keeps prompts small and gives the model a window that actually contains the evidence.
- **Coreference across chapters**: do not ask for pronoun coref at book scale. Ask only for *name-variant clustering* (alias discovery) plus per-chapter "who is `he` in this paragraph" where needed for quote attribution. Evidence from the literature: modular pipelines (NER -> coref) suffer cascading errors; LLM span-tagging with character IDs avoids that but is less explainable ([arXiv 2412.11560](https://arxiv.org/pdf/2412.11560)). Full-length-novel coref evaluation is thin: LitBank coref annotations cover only ~2,000 tokens per text ([arXiv 2401.17922](https://arxiv.org/html/2401.17922v1), [LitBank paper](https://ar5iv.labs.arxiv.org/html/1912.01140)), so published numbers do not transfer to whole-book chunking.
- **Evidence requirement ("nothing invented")**: the model returns a verbatim `quote` string and `paragraphId`; **code finds that string in that paragraph** (exact, then whitespace/quote-normalised) and computes offsets itself; a claim whose quote cannot be found is dropped (or shown as "unverified" only in a debug view). Never trust model-reported offsets. This is the same grounding rule LangExtract uses: it maps every extraction to its source span and returns `char_interval = None` for ones it cannot match so you can filter ([LangExtract README](https://github.com/google/langextract), Apache-2.0, Gemini/OpenAI/Ollama backends, chunking and multi-pass, not an official Google product).
- **Structured output**: the Claude API supports JSON-schema constrained decoding via `output_config.format` on Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5 (and older); limitations: no recursive schemas, no `minLength/maxLength/minimum/maximum`, `minItems` only 0/1, `additionalProperties:false` required, first-use grammar compile latency (cached 24 h), refusals and `max_tokens` truncation can break the schema ([structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). **Native Citations and structured outputs cannot be combined** (the API returns an error if both are on) ([citations](https://platform.claude.com/docs/en/build-with-claude/citations)). So choose: structured output with *our own* verbatim-quote-then-verify scheme (recommended; output is deterministic JSON, offsets come from our code), or Citations (character-offset citations from the platform, but free-form text output and no schema).
- **Prompting**: closed label sets (a fixed property vocabulary plus a free "other" key), "return nothing if not stated", ask for *claims about the entity as stated in text* (not inference), give 2-3 few-shot examples with a negative example (a trait that is merely adjacent to the name), request a self-reported `basis: stated | implied` flag and treat `implied` as lower confidence. Expect that a model-reported confidence number is poorly calibrated; derive confidence from code-checkable features instead (quote verified, number of independent paragraphs, source tier).
- **Quote attribution with an LLM**: send each chapter's paragraphs with quotes pre-segmented by code (ids like `q-p12-0`), the candidate-speaker list (accepted entities + "narrator" + "unknown"), and ask for `speaker_id`, `basis: tag | context | alternation | implied` and the tag text. Verify tag text exists in the paragraph. Keep the repo's existing rule-based result as the baseline; when the LLM disagrees with a `tag` attribution, flag it rather than overwrite.

### 2.3 Local LLMs (offline)

- Run via llama.cpp / Ollama; Qwen/Llama/Mistral/Gemma-class instruction models in the ~7-14B range at 4-bit quantisation run on a recent consumer GPU or a high-memory CPU. I did **not** benchmark any of them, and I did not find a fiction-specific extraction benchmark for them (Could not verify). LangExtract's README shows an Ollama path with a small Gemma model, which shows the plumbing, not the quality.
- Expected profile (reasoned, not measured): fine for name/alias extraction and explicit-tag quote attribution; weaker at consistent JSON over long contexts, at implicit speakers, and at refusing to infer. Throughput for a whole book through a 7-14B model on a CPU-only laptop is plausibly hours; with a consumer GPU tens of minutes. The app's current users run REAPER on Windows; hardware is unknown, so treat as a "when you have the hardware" option.
- Grammar-constrained decoding (llama.cpp GBNF / JSON schema) can enforce the same schema as the hosted option (general knowledge, not re-verified).
- Fit with repo policy: models would be a fourth asset kind in the catalog with hash, size and licence recorded (ADR 0079/0080 pattern); the build asks before downloading.

### 2.4 Hosted Claude API (verified this session on platform.claude.com)

Models and prices per million tokens (base, standard sync):

| Model | API ID | Input | Output | Notes |
| --- | --- | --- | --- | --- |
| Claude Fable 5.1 | `claude-fable-5-1` | $10 | $50 | strongest, slowest |
| Claude Opus 5.5 | `claude-opus-5-5` | $4 | $20 | "start here for most workloads" per docs |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 | $10 | fast |
| Claude Haiku 5.5 | `claude-haiku-5-5` | $0.10 (prompts <=100k), $0.50 above | $0.50 / $2.50 | fastest; docs position it for classification and extraction |

All four: 1M context, 128K max output, adaptive thinking (thinking tokens bill as output). Batch API: 50% off (Haiku 5.5 batch $0.05/$0.25). Cache reads: 10% of input (5% on Opus 5.5 and Sonnet 5.5, 2.5% on Fable 5.1). 1M context at standard rate on all but Haiku 5.5. Models retire "not sooner than" Sep-Oct 2027. ([pricing](https://platform.claude.com/docs/en/about-claude/pricing), [models overview](https://platform.claude.com/docs/en/about-claude/models/overview))

**Cost per book (assumptions stated)**: 90,000-word novel = ~165k input tokens; chapter-chunked, so no per-request long-context surcharge. Pass A (entities and alias mentions): reads the book once, outputs ~25k tokens. Pass B (entity-centric properties and talk/act/know for ~40 entries, windows overlap, ~1.0x the book in input total, ~40k output). Pass C (quote attribution, ~1,500 quotes; reads the book once, ~35k output). Total about 3.0x book input = ~500k in, ~100k out. Thinking tokens could add 0-100% to output, so I give a range.

| Model | Sync cost (no thinking) | With thinking x2 output | Batch (50%) |
| --- | --- | --- | --- |
| Haiku 5.5 | $0.05 + $0.05 = **~$0.10** | ~$0.15 | ~$0.05-0.08 |
| Sonnet 5.5 | $1.00 + $1.00 = **~$2.00** | ~$3.00 | ~$1.00-1.50 |
| Opus 5.5 | $2.00 + $2.00 = **~$4.00** | ~$6.00 | ~$2.00-3.00 |
| Fable 5.1 | $5.00 + $5.00 = **~$10.00** | ~$15.00 | ~$5.00-7.50 |

Prompt caching helps only where the same chapter text is re-sent (passes A and C can share a cached prefix; saves ~90%+ of that input). Rescans re-run only changed chapters. Latency: per chapter call seconds to tens of seconds; whole book minutes if parallelised, longer if batch (batch can take up to hours; not verified here).

**Privacy** (verified at doc level): Anthropic's docs say retained data is never used for training without express permission; Zero Data Retention exists but excludes some models/features ("Covered Models"), and structured outputs are noted as excluded from ZDR eligibility on that page; commercial and consumer retention policies are separate pages ([data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention); I did not read the full eligibility table, see Could not verify). Product conclusion: an unpublished manuscript is the author's or publisher's confidential IP and may be under contract; hosted extraction must be **opt-in per book, off by default**, with a plain statement of what is sent (the paragraphs, nothing else), a dry-run token/cost estimate, and `SECURITY.md`/threat-model updates (the repo treats "sends manuscript off the machine without explicit action" as in scope). A narrator is often not the rights holder, so a contract-check checkbox ("I am allowed to send this text to a third party") is appropriate. The API key should be sealed per-user the way ADR 0356 stores the Merriam-Webster key (a precedent for "one narrator-keyed online source").

### 2.5 Hybrid options compared

| Design | Recall | Precision | Aliases | Properties / talk-act-know | Offline | Cost | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Existing rules/spaCy only | low-mid | mid (junk phrases) | title-prefix only | none real | yes | 0 | status quo |
| B. + BookNLP | mid-high | mid-high | good (clusters) | none | yes | CPU minutes | PyTorch weight; speaker attribution B3 86-90 on its own benchmark |
| C. Rules/NER candidates -> LLM adjudication (aliases, category, properties) with verified evidence | high | high if evidence-verified | good | good | no (unless local LLM) | ~$0.10-2 | recommended core |
| D. C + LLM quote attribution as second opinion | high | high, with disagreements flagged | | | no | +~25% | keep rule `tag` as the trusted tier |
| E. Pure LLM, no rules | high | variable | good | good | no | similar | loses determinism and the existing locks; harder to test |

---

## 3. Recommendation

### 3.1 Principles (from the owner's constraints)

1. **Narrator-authored reference is authoritative.** Extracted data is a *suggestion layer* stored separately from authored fields. Authored always wins; extraction never overwrites a field the narrator touched.
2. **No claim without evidence.** Every machine claim has >=1 `evidence` span (paragraph id + char offsets computed by code against the current manuscript) and a verbatim excerpt. No span, no claim.
3. **Needs review** is the landing state for every imported/extracted item and claim. Accept = becomes authored (or "confirmed"). No names query/confirm workflow, no questions to the author.
4. **One book per app; DAW-neutral**: no DAW term in the schema; paragraph ids only.
5. **Replacing the manuscript clears all extracted data and (per owner) the Story Bible derived from it**; a rescan of the *same* manuscript is a different operation (below).

### 3.2 Architecture

```text
Manuscript (paragraphs, ids)
   |  stage 1  candidates (deterministic)   rules + spaCy [+ GLiNER later]
   |  stage 2  ExtractionProvider (swappable)
   |            rules      -> same as today (no properties/tak)
   |            local-llm  -> Ollama / llama.cpp, schema-constrained
   |            hosted     -> Anthropic API, opt-in per book, schema-constrained
   |  stage 3  verifier (code, deterministic): exact-find quote in paragraph,
   |            compute offsets, drop unverifiable claims, dedupe, attach tier
   |  stage 4  store as suggestions  ->  Review queue ("Needs review")
   v
Story Bible (authored)  <-- accept / edit / reject
```

Provider interface (TypeScript shape for the mock; the repo sidecar equivalent is a Python Protocol; the repo already has a "provider-ports" pattern, `docs/architecture/provider-ports.md`, that this can follow):

```ts
interface ExtractionProvider {
  id: 'rules' | 'local-llm' | 'hosted';
  capabilities: { aliases: boolean; properties: boolean; tak: boolean; speakers: boolean; offline: boolean };
  estimate(book: BookRef, scope: Scope): Promise<{ inputTokens: number; usd?: number; minutes?: number }>;
  run(job: { scope: Scope; entities?: EntityId[]; }, onProgress): Promise<Suggestion[]>;   // never writes the Bible
}
```

Rules: provider output is only ever `Suggestion[]`; the app core owns verification, storage and review. Provider choice, model id (e.g. `claude-sonnet-5-5`) and prompt version are stored on each suggestion for provenance and re-runs. Hosted model default: **Sonnet 5.5** for passes B and C, **Haiku 5.5** for pass A; Opus 5.5 selectable; Fable 5.1 not default (cost 5x Sonnet for a task that is mostly reading comprehension with verification). That default is my judgement and untested on literary data; run a bake-off (3.6) before fixing it.

### 3.3 Schema (suggestion layer)

```ts
type Span = { paragraphId: string; start: number; end: number; text: string };     // text = exact slice; start/end computed by code
type Tier = 'stated' | 'implied';                    // stated: in the text; implied: inference from context
type Source = { provider: string; model?: string; promptVersion: string; at: string };

type EntryProp = {                // description, traits, species, role, etc.
  id: string; key: string;       // key from a fixed vocabulary + 'other:<label>'
  value: string; tier: Tier; confidence: 'high'|'medium'|'low';
  evidence: Span[];              // >=1 required
  status: 'needs-review'|'accepted'|'rejected'; source: Source;
};

type TalkActKnow = {              // per entry
  id: string; kind: 'talk'|'act'|'know';
  text: string;                  // one short claim: 'says the Queen cheated' / 'steals the tarts' / 'knows the key is hidden'
  chapterId?: string;            // where it holds (knowledge is time-bound)
  firstKnownAt?: Span;           // know only: where the entry first learns it
  aboutEntryIds?: EntryId[];     // optional links
  tier: Tier; confidence: ...; evidence: Span[]; status; source;
};

type AliasSuggestion = { entryId: EntryId; alias: string; evidence: Span[]; status; source; reason: 'title-prefix'|'cooccurring-variant'|'model' };
type RelationSuggestion = { fromId: EntryId; toId: EntryId; label: string; evidence: Span[]; tier; status; source };   // stored by ids, both-sided
type SpeakerSuggestion = { quoteId: string; paragraphId: string; start: number; end: number; speakerId: EntryId|'narrator'|'unknown'; basis: 'tag'|'context'|'alternation'|'implied'; evidence: Span[]; confidence; status; source };
type EntrySuggestion = { tempId: string; name: string; kind: string; surfaceForms: string[]; evidence: Span[]; status; source };
```

Design points:
- **Confidence is derived, not model-reported**: `high` = stated + quote verified + >=2 distinct paragraphs or an explicit tag; `medium` = stated, one paragraph; `low` = implied. Keep the model's own claim only as a tier flag.
- **Talk/act/know** are *claims with evidence*, not a profile. "Know" is the risky one: knowledge is time-bound and the model can leak spoilers; therefore scope it to a chapter, require the span where the character acquires it, and let the narrator filter by "up to chapter N" (useful for performance: a character should not sound like they know the ending).
- **Accepting** copies the claim into the authored field (property value, a line in "Talks/Acts/Knows", alias, relation, speaker) and sets `status: accepted`; the evidence travels with it. Editing text on accept is normal; the evidence stays.
- **Rejecting** stores a tombstone (entry id, claim fingerprint) so a rescan does not re-offer the same claim. This is the repo's "decision carries evidence version" idea (ADR 0120).
- Existing speaker model in the mock (`confirmed` / suggested / `?`) maps to: confirmed = accepted `SpeakerSuggestion` or narrator-set; suggested = needs-review; `?` = unknown.

### 3.4 How the narrator reviews

- A single **Needs review** queue per Story Bible with filters by entry, kind (aliases, props, talk/act/know, relations, speakers) and confidence; default sort: entries first (new entries gate everything else), then high-confidence claims, low last.
- Each row: claim text, the evidence excerpt with the matched span highlighted, "Open in manuscript" jumping to the paragraph, buttons Accept / Edit and accept / Reject / Not this character (re-assigns to another entry). Keyboard: A, E, R, N, arrows; bulk "accept all high-confidence in this entry" with a visible count (not automatic).
- Speaker attribution gets the same row type with the quote highlighted and a speaker picker; a "show only disagreements" filter when two providers/passes disagree.
- No questions to the author about names; unresolved items just sit in the queue ("Needs review" count in the Story Bible header, like the repo's rail badges: counts only when the host reports them).
- Entries and items the narrator authored never appear in the queue; the queue can only *add* suggestions beside them.
- Imported/extracted items carry an unobtrusive "suggested" mark until accepted.

### 3.5 Rescan and manuscript replacement

- **Manuscript replaced** (owner rule): delete all suggestions, and per the owner the imported data tied to the old text; authored reference the owner wants cleared is cleared with it. Paragraph ids change, so no evidence span survives. Confirm dialog states what will be removed, counts included.
- **Edit/re-import of the same book** (if it ever exists): keep stable paragraph ids where text is unchanged; for each span, re-check `text` at `[start,end]`; if it moved, relocate by exact string search within the same paragraph; if not found mark the claim `stale` (the repo already built stale-anchor detection, `annotations.ts#resolveNoteAnchor`, ADR 0382). Stale accepted claims keep their text but show "evidence changed".
- **Rescan** (same manuscript, new run): never touches authored or accepted items; only appends suggestions not matching an existing claim fingerprint or tombstone; ids of entries are kept by name overlap as in ADR 0345. Chapter-scoped rescans re-run only changed or chosen chapters.

### 3.6 Evaluation before any default is set

The repo has no usable gold set; creating one is the first real work item:
1. Label ~100 quotes (3 books, varied: first/third person, many-speaker, non-human speakers; use public-domain text, e.g. Alice plus two Gutenberg novels; PDNC is a ready source for 22 novels but check its licence before copying anything into the repo, unverified), and ~100 entities with aliases and ~60 talk/act/know claims, each with the correct paragraph.
2. Score: rules, spaCy sm/lg, BookNLP small, Haiku 5.5, Sonnet 5.5, Opus 5.5 (and a local 7-14B if hardware allows) on: entity precision/recall, alias-cluster purity, quote attribution accuracy split by explicit/implicit/anaphoric, **evidence-verified rate** and **hallucinated-claim rate** (claims where the quote exists but does not support the claim, needs human spot-check), review time per accepted item, USD per book.
3. Gate: ship an LLM provider only if hallucinated-claim rate on accepted-by-default tiers is under what the owner will tolerate (suggest <=5% for `high`), consistent with ADR 0020's precision-first stance.

### 3.7 Build now in the mock vs later

**Now (mock; no model calls)**
- Data model above for entries: `properties` with evidence, `TalkActKnow`, alias/relation/speaker suggestions, statuses, tombstones, `source` provenance, stale flag.
- Fixture "extraction results" for the mock's book (hand-written, with evidence spans that really match the mock manuscript text, so the highlight/jump works); include one stale item, one rejected tombstone, one implied/low item, one high-confidence cluster.
- Review queue UI (3.4), per-entry "Talks / Acts / Knows" sections with evidence popovers, "suggested" marks, counts in header, accept/edit/reject, bulk accept for high.
- A `ExtractionProvider` interface with a `fixture` implementation, a settings row "Extraction: Off / Local rules / Local model / Anthropic (needs your key)" shown as disabled-with-explanation, the consent panel text and cost estimate display (static numbers).
- Replace-manuscript clears suggestions (implement the real rule).
- A `verifyEvidence()` utility with unit tests, since that is the heart of "nothing invented".

**Later (framework wiring)**
1. Fix the rules baseline cheaply first: normalise typographic apostrophes, drop `I'm`-style tokens and sentence-fragment phrases, handle `the Hatter` / `KING AND QUEEN`, let Needs Review names enter the speaker index (visible as suggested). These are deterministic, testable wins on the Alice fixture and are independent of any LLM.
2. Gold set and bake-off (3.6).
3. Hosted provider (Anthropic, structured outputs + verifier, batch for whole-book, estimate + consent + sealed key + threat-model/SECURITY updates).
4. Local-LLM provider as a catalog asset.
5. BookNLP trial for alias clusters/speakers if the bake-off shows it beats rules without the LLM.

---

## 4. Sources

Repo (read or run this session): `sidecars/manuscript-guide/core/manuscript_guide.py`; `docs/architecture/story-bible-entity-accuracy.md`; ADRs 0007, 0020, 0042, 0080, 0345, 0346, 0405; `docs/research/local-dependency-evaluation.md`; `docs/research/character-continuity-cue-extraction-eval/RESULTS.md` and `run_eval.py` (re-run: precision 0.963, recall 1.0); `sidecars/manuscript-guide/tests` (190 passed); `SECURITY.md`; `tests/fixtures/alice.md`; `/tmp/claude-0/-home-user-narration-utils/af1a83ba-1a93-5f2f-9822-2dde169a851a/scratchpad/alice_eval.py` (my measurement script).

Web (fetched):
- Anthropic models overview: <https://platform.claude.com/docs/en/about-claude/models/overview>
- Anthropic pricing: <https://platform.claude.com/docs/en/about-claude/pricing>
- Structured outputs: <https://platform.claude.com/docs/en/build-with-claude/structured-outputs>
- Citations (incompatible with structured outputs): <https://platform.claude.com/docs/en/build-with-claude/citations>
- Data retention: <https://platform.claude.com/docs/en/manage-claude/api-and-data-retention>
- BookNLP: <https://github.com/booknlp/booknlp>
- LangExtract: <https://github.com/google/langextract>

Web (search results only, summaries not read in full): Improving Automatic Quotation Attribution in Literary Novels <https://arxiv.org/html/2307.03734v1> ; SIG speaker identification via prompt-based generation <https://ar5iv.labs.arxiv.org/html/2312.14590> ; role of NLP tasks in literary character networks <https://arxiv.org/pdf/2412.11560> ; LitBank-based literary coreference <https://arxiv.org/html/2401.17922v1> and <https://ar5iv.labs.arxiv.org/html/1912.01140> ; AAAI 2022 extraction/representation pipeline for literary characters <https://ojs.aaai.org/index.php/AAAI/article/view/21709> ; GLiNER-for-fiction blog <https://justin.poehnelt.com/posts/building-a-fiction-ast-training-ner-gliner-onnx/> .

---

## 5. Could not verify

- **spaCy-model quality on Alice**: the model is not installed here and there is no network install allowed, so every number in 1.4 is rules-only. The spaCy path may remove some junk and classify more characters.
- **No gold entity/alias list** exists in the repo; my "~20 of 51 rows are junk" is a manual count, not a scored precision.
- **LLM quote attribution accuracy on PDNC for current frontier models** (no source found; the SIG paper compared against zero-shot ChatGPT of its era). All Claude-model quality claims in section 3 are untested on literary data; the bake-off is the proposed way to find out.
- **Local LLM quality and speed** for fiction extraction (Qwen/Llama/Mistral/Gemma): not benchmarked, no source found. Hardware requirements are general knowledge. Whether llama.cpp/Ollama structured-output enforcement works as described for the current versions was not checked.
- **GLiNER on fiction**: no published benchmark found. GLiNER v2.1 licence terms are from the repo's own doc, not re-checked upstream.
- **BookNLP**: maintenance state and release dates (the fetched page did not show them); the PyTorch dependency and Windows packaging cost; the exact weight licences (the repo's doc says to record them before enabling).
- **Anthropic data retention details**: I read the page's opening and the "never used for training without permission" commitment, but not the full ZDR/feature-eligibility table; the claim that structured outputs are ZDR-ineligible comes from the structured-outputs page note and should be confirmed before promising anything to users. Batch API completion time and Haiku 5.5 behaviour on long prompts were not tested.
- **Cost table** is arithmetic from the documented list prices with my token assumptions (165k tokens per 90k-word book; 3x reads; ~100k output tokens; thinking x0-2); real usage with adaptive thinking could differ. Counts should be replaced by a `count_tokens` call on the real manuscript.
- **QuoteKG**: I did not research it; I believe it targets quotation knowledge graphs rather than fiction speaker attribution.
- **PDNC licence** and whether its text can be committed: not checked.
- I did not read the mock's (`studio2`) current data model, per the instruction not to touch those projects; the schema above is written against the owner's description (entries, aliases, relationships, appears-in, speaker-per-quote) and the earlier compare notes.
