# BookNLP spike: licences, pins, footprint and quality

**Date:** 2026-10-11. **Issue:** [#1142](https://github.com/countrymanprime/narration-utils/issues/1142), Phase 1 of the [Studio Next extraction PRD](../prds/studio-next-extraction-and-analysis-tools.prd.md). **Answers:** can the app offer BookNLP as an optional download, which exact files, under which licence, at what cost, and can it share the environment GLiNER needs.

**Verdict: ship behind "not yet available".** The program is MIT, the weights have no stated licence (a risk the owner accepted for this narrow use, SNX-Q3), and every weight file is pinned below. Its speaker attribution was the strongest local result in the 2026-10-10 trial. It stays "not yet available" because its loader failed on a current `transformers` in that trial, and the one environment SNX-Q4 assumes cannot be confirmed: GLiNER needs `transformers>=4.51.3` and the trial ran BookNLP on `4.44.2`.

## What was read, and from where

Read on 2026-10-11 through the session proxy: PyPI's JSON API for `booknlp`, `torch`, `transformers` and `spacy`; the `booknlp/booknlp` repository on GitHub (`LICENSE`, `README.md`, `setup.py`, `booknlp/english/english_booknlp.py`); and the weights host `people.ischool.berkeley.edu`. Each weight file was hashed by streaming it through `sha256sum`; nothing was written to disk. Footprint and quality are the 2026-10-10 trial's figures (`local-llm-research.md` section 9.9, run by another session on a 4-vCPU CPU); they were not re-run here.

## Licences

| Item | Record |
| --- | --- |
| Program | MIT. The `LICENSE` file on `main` begins "MIT License / Copyright (c) 2021 David Bamman"; PyPI declares `MIT` for `booknlp` 1.0.8 |
| Weights | **No licence is stated.** The README (read 2026-10-11) contains no licence, copyright or MIT statement. The repository's `LICENSE` covers the repository; it does not mention the downloaded `.model` files |
| Entity-model training data | The README: "trained on an annotated dataset of 968K tokens, including the public domain materials in LitBank and a new dataset of ~500 contemporary books, including bestsellers, Pulitzer Prize winners, works by Black authors, global Anglophone books, and genre fiction". The 500 books are not public; their terms are unknown |
| BERT encoders fetched at first load | `google/bert_uncased_L-*_H-*_A-*` on Hugging Face; `license: apache-2.0` in the card data of `google/bert_uncased_L-4_H-256_A-4` (read 2026-10-11) |
| Owner ruling | SNX-Q3: BookNLP's weight licence is not a blocker, because the tool only identifies character entries; the spike records the licence and the provenance row |

The note records the absence as an absence: nothing here is a grant. The narrow use that SNX-Q3 relies on is that BookNLP's output is names, clusters and speaker guesses that the narrator reviews, not text or audio the app publishes. This is engineering guidance, not legal advice.

## Pins

Host: `https://people.ischool.berkeley.edu/~dbamman/booknlp_models/` (HTTPS works; the package's own code requests `http://`, which redirects with a 301 to HTTPS). The host publishes no checksums, so the SHA-256 values below are the hashes of the bytes this session read, and the pin is only as good as the first download. Size is the `Content-Length` header; "Last modified" is the host's header.

**Small** (160,398,571 bytes in total):

| File | Size (bytes) | SHA-256 | Last modified |
| --- | --- | --- | --- |
| `entities_google_bert_uncased_L-4_H-256_A-4-v1.0.model` | 61,979,735 | `0620eed33c32c9b15dcbf3303bb3809b4f7ea29eef5311ba55db361a848cda5a` | 2021-11-07 |
| `coref_google_bert_uncased_L-2_H-256_A-4-v1.0.model` | 40,831,851 | `eadd62a0b5d6f1d8908ee31c9949f863b731046e0e64df8c0c46bedf07a56116` | 2021-11-09 |
| `speaker_google_bert_uncased_L-8_H-256_A-4-v1.0.1.model` | 57,586,985 | `1f530622219b8d6d90881f0d2eaeeec08ff6b73287d9eac66a1505ee0e6887e5` | 2021-11-14 |

**Large** (1,196,238,139 bytes in total):

| File | Size (bytes) | SHA-256 | Last modified |
| --- | --- | --- | --- |
| `entities_google_bert_uncased_L-6_H-768_A-12-v1.0.model` | 311,346,637 | `c67654ac10b3b49371544ccaf8ed76d224f0d274d23f7f7ea09e74f173ddbe06` | 2021-11-07 |
| `coref_google_bert_uncased_L-12_H-768_A-12-v1.0.model` | 446,250,373 | `9b301a05eff4573d34ad2672f310110b716801759470044b07d1979a0dbb50d8` | 2021-11-07 |
| `speaker_google_bert_uncased_L-12_H-768_A-12-v1.0.1.model` | 438,641,129 | `5f3cdf9880f4f70b3aa0a88a5f4fea78aafaeff52b8f1a4a8712a47939bb1d0d` | 2021-11-14 |

The mock shows 161 MB and 1,200 MB; the pinned totals are 160.4 MB and 1,196.2 MB (decimal), and the consent screen should use the pinned bytes. The files are PyTorch pickles: load them only from a path whose hash was checked, with `torch.load(..., weights_only=True)` where the loader allows it.

**Encoders** the package fetches from Hugging Face at first load. The loader turns the weight file name into a repository name (`google_bert_…` becomes `google/bert_…`), so the mapping below is inferred from the file names and the naming rule in `english_booknlp.py`, not observed; the owner run confirms it. The `pytorch_model.bin` sizes and SHA-256 come from the Hugging Face API (2026-10-11):

| Repository @ revision | `pytorch_model.bin` size (bytes) | SHA-256 |
| --- | --- | --- |
| `google/bert_uncased_L-4_H-256_A-4` @ `387825ce42db` | 45,088,961 | `01671831dfec6818302153919efbfd6ee4ad91dd9fba7f3649bdd6cb7b0f16e4` |
| `google/bert_uncased_L-2_H-256_A-4` @ `4e937a8675e5` | 38,763,567 | `67b710645b099510dba08b7605a60859fff59714628e1d9d1ffa9e0956b51783` |
| `google/bert_uncased_L-8_H-256_A-4` @ `fff21c203abc` | 57,739,749 | `ea6b153cc5310ac3c59193dc30048a941533d96a86320579a6d5a9f2d0fd05b4` |
| `google/bert_uncased_L-6_H-768_A-12` @ `c132ecc85d3d` | 270,341,459 | `58058a678878a286bab61eb65b4df352a7a542358143f3518bb82d84e495d2d3` |
| `google/bert_uncased_L-12_H-768_A-12` @ `cc478efa3482` | 440,472,395 | `874977abfe5eb5c3c1ce5156314da7ee75b00661556b94fc7167201860dd489a` |

The full 40-character revisions, `config.json` and `vocab.txt` hashes are **PENDING**: the API listing shows these files without LFS hashes and the revisions were read truncated. Owner command in [Owner steps](#owner-steps). The encoders add about 142 MB to the small install (45.1 + 38.8 + 57.7 MB) and about 711 MB to the large one (270.3 + 440.5 MB, the `L-12` repository counted once for its two uses).

**Python packages** (PyPI):

| Package | Version | File | Size (bytes) | SHA-256 |
| --- | --- | --- | --- | --- |
| `booknlp` | 1.0.8 (2024-07-12), MIT | `booknlp-1.0.8-py3-none-any.whl` | 2,421,582 | `9eeaac4c1a2eb8d6b2256e5eefee26d0d0f294a46812ad7602ac469a9f8b02a8` |
| `spacy` | 3.8.16, MIT (already in `uv.lock`) | — | — | already pinned by the repo |
| `en_core_web_sm` | 3.8.0 (already catalogued) | — | 12,806,118 | `1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85` |
| `transformers` | see [How it loads](#how-it-loads) | — | — | PENDING |
| `torch` | 2.14.1 | `torch-2.14.1-cp312-cp312-win_amd64.whl` | 124,113,906 | `38bee9f2a2ccfc6898172a5075e4ba52522fbe143eeb099674fc67ab390e858d` |

The `booknlp` wheel declares `torch>=1.7.1`, `tensorflow>=1.15`, `spacy>=3` and `transformers>=4.11.3`. The trial installed it with `--no-deps` and found that `tensorflow` was never needed, so the registry must fetch the wheel without its dependency closure.

## Provenance row proposal

Two rows for SN-X61 to paste into `scripts/licenses/model-review.json` under `catalogued`, one per size, keyed `booknlp/small` and `booknlp/big`:

```json
"booknlp/small": {
  "commercialUse": "Program MIT. The weights carry no stated licence (owner ruling SNX-Q3: not a blocker, because the tool only identifies character entries for the narrator to review)",
  "status": "In the catalog as an optional download (ADR 0848, SNX-7b); consent required",
  "note": "Three PyTorch pickles totalling 160,398,571 bytes from people.ischool.berkeley.edu/~dbamman/booknlp_models/, pinned by size and the SHA-256 this project computed on 2026-10-11 (the host publishes none). Program licence read 2026-10-11 from the repository LICENSE (MIT, Copyright (c) 2021 David Bamman). The README names no licence for the weights; the entity model's training data includes about 500 non-public contemporary books. The Google BERT encoders it fetches at first load are Apache-2.0. Use is narrow: character names, clusters and speaker guesses shown for review."
},
"booknlp/big": {
  "commercialUse": "As booknlp/small",
  "status": "In the catalog as an optional download (ADR 0848, SNX-7b); consent required",
  "note": "As booknlp/small; three pickles totalling 1,196,238,139 bytes."
}
```

## Runtime footprint

**Not measured here.** The figures below are the 2026-10-10 trial's (4-vCPU CPU, pipeline `entity,quote,coref`, Alice chapters V to VIII, `local-llm-research.md` section 9.9). Model load times include a first-load download of the encoder.

| Measure | Small | Large |
| --- | --- | --- |
| Weights on disk | 160.4 MB | 1,196.2 MB |
| Four chapters (9.5k words) | 15.6 s | 62.4 s |
| Chapter VI alone (2.6k words) | 6.8 s | 17.7 s |
| Peak memory, four chapters / one chapter | 1.57 GB / 1.19 GB | 3.12 GB / 2.59 GB |
| Model load | 3 to 11 s | 7 to 47 s |
| Projected 90,000-word book | about 2.6 min (estimate) | about 10 min (estimate) |

The upstream README gives 3.6 and 15.4 minutes (small, large) for a 99,000-token book on a 2019 MacBook Pro CPU, which is consistent. Whole-book memory was not measured in the trial. The Python environment was 5.8 GB with default `torch` wheels; the CPU-only wheel was not tried.

To measure on the owner's machine (a clean virtual environment outside the repository, weights in `$MODELS`, Alice from `tests/fixtures/alice.md` split by chapter into `$CH/*.txt`):

```text
python -I measure_booknlp.py --models "$MODELS" --size small --chapters "$CH" --out .local/booknlp-small.json
python -I measure_booknlp.py --models "$MODELS" --size big --chapters "$CH" --out .local/booknlp-big.json
```

with the script in [Owner steps](#owner-steps).

## Quality on a fixture

**Not re-run here.** The trial scored BookNLP against a gold set that session hand-labelled on Alice chapters V to VIII (24 character-chapter slots, 61 chapter-VI quotes). The numbers are a single text with wide intervals, and Alice is in LitBank, which BookNLP's models were trained on, so they are optimistic:

| Measure | Small | Large |
| --- | --- | --- |
| Character recall (of 24) | 24 | 24 |
| Gold characters split into two clusters | 7 | 7 true splits |
| Wrong merges | 1 (Fish-Footman and Frog-Footman) | 0 |
| Stray clusters (2+ mentions, no gold match) | 15 | 20 |
| Speaker attribution, chapter VI (of 61) | 56 | **61** |
| Regex baseline, same quotes | 55 of 61 (4 unknown, 2 wrong) | |

Cluster-to-name matching used normalised name strings. The rules baseline in the same trial emitted no clusters, so there is no baseline for clustering. BookNLP never abstains, so a wrong speaker is always a confident one.

**Confidence.** BookNLP gives no score for a cluster or a quote speaker. It gives a gender estimate with a probability (for example Alice "she" 0.91 to 0.93). For entity clusters and speakers the suggestion's confidence is therefore `null` from the source; any number must come from signals the code computes (a tag check, small-versus-large agreement, mention type), which the calibration protocol scores. In the trial, small and large disagreed on 5 quotes and all 5 small answers were wrong, which is why agreement is the useful signal.

## How it loads

- **Dependency set:** `torch` (124 MB Windows wheel, a far larger unpacked install), `transformers`, `spacy` with `en_core_web_sm`, and `booknlp` itself. `tensorflow` is declared but unused.
- **Loader fragility:** in the trial `load_state_dict` raised `Unexpected key(s): bert.embeddings.position_ids` for every checkpoint on `transformers==4.44.2`, worked around by dropping that key from the loaded dictionary in the runner, and the package imports `pkg_resources` (needs `setuptools<81`). The last release is from 2024-07-12.
- **Shared environment (SNX-Q4):** `gliner` 0.2.29 requires `transformers>=4.51.3,<5.17.0`; the trial ran BookNLP on `transformers==4.44.2`. Whether BookNLP runs on a `transformers` that satisfies GLiNER is **untested**. If it does not, "separate optional wheels in the one environment" cannot hold, and BookNLP needs its own sidecar mode with its own environment (`sidecar-add`), which also keeps its loader patch out of the Story Bible sidecar. The owner run below decides it.
- **Registry fetch:** the `booknlp` wheel, `torch` and `transformers` are PyPI wheels with published sizes and hashes. The six weight files and five encoders are plain hashed files. The host redirects `http` to `https`, so the catalog URLs must be `https`.
- **What the freeze must do:** as for GLiNER, keep the heavy packages out of the frozen tree and import them from the unpacked install directory at run time. The files of `sidecar-freeze` that change: `scripts/release/prepare-resources.py` (`exclude_modules`, not `collect_*`), `scripts/release/verify-installable.mjs` (the freeze must not carry `torch`), `apps/desktop/smoke.go` or the sidecar `self-check` (report "booknlp: not installed" as a normal state), and `scripts/release/tests/test_prepare_resources.py`. If BookNLP gets its own sidecar mode, `sidecar-add` also applies (project, test, packaging, asset and threat-model rows).
- **Threat model:** unpickling a weight file executes code, so the download must be hashed before load. SN-X61 and SNX-7b re-read the first-use-download row of `docs/architecture/threat-model.md`; this slice does not edit it.

## Recommendation

**Ship behind "not yet available":** BookNLP large gave the best local speaker attribution in the trial (61 of 61, about 10 minutes a book), but its loader needs a patch on a current `transformers`, the shared environment with GLiNER is unconfirmed, and its weights have no stated licence beyond the owner's ruling, so the adapter should wait for the owner run below.

## Owner steps

These go to [#992](https://github.com/countrymanprime/narration-utils/issues/992) (D65: none blocks a merge).

1. Confirm the encoder mapping and pin the rest: for each of the five encoders, record the full revision and the hashes of `config.json` and `vocab.txt`:

   ```text
   curl -sS "https://huggingface.co/api/models/google/bert_uncased_L-4_H-256_A-4?blobs=true"
   ```

2. Resolve the dependency question in a clean environment outside the repository: install `booknlp==1.0.8 --no-deps`, `gliner==0.2.29`, `transformers==5.16.0`, `torch==2.14.1`, `spacy`, `setuptools<81`; run the script below with `small`. Record whether it loads without the `position_ids` patch, and the closure's wheel sizes and hashes.
3. Run the footprint and speaker checks. This script writes only to `--out`; the speaker score needs the gold file of the calibration protocol (SN-X13), so it records every quote's cluster and token offsets:

   ```python
   import argparse, glob, json, os, sys, time, resource
   from booknlp.booknlp import BookNLP

   p = argparse.ArgumentParser()
   p.add_argument("--models", required=True)
   p.add_argument("--size", choices=["small", "big"], required=True)
   p.add_argument("--chapters", required=True)
   p.add_argument("--out", required=True)
   a = p.parse_args()

   os.environ["HOME"] = a.models  # assumption: the package builds its model path from the home directory; confirm
   t0 = time.time()
   nlp = BookNLP("en", {"pipeline": "entity,quote,coref", "model": a.size})
   load_s = time.time() - t0
   rows = []
   for path in sorted(glob.glob(os.path.join(a.chapters, "*.txt"))):
       t = time.time()
       out = os.path.join(os.path.dirname(a.out), "booknlp-" + a.size, os.path.basename(path)[:-4])
       nlp.process(path, out, os.path.basename(path)[:-4])
       rows.append({"chapter": os.path.basename(path), "seconds": time.time() - t, "output": out})
   peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 if sys.platform != "win32" else None
   json.dump({"size": a.size, "load_seconds": load_s, "peak_rss_mb": peak, "chapters": rows}, open(a.out, "w"), indent=1)
   ```

   On Windows record the peak working set separately; the script writes `null` rather than a guess. If `BookNLP(...)` tries to download weights over `http`, place the pinned files in `$MODELS/booknlp_models/` first.

Results stay provisional until they are re-run on the owner's own material (D70).
