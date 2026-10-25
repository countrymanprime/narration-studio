# BookNLP spike: licences, pins, footprint and quality

**Date:** 2026-10-11. **Issue:** [#1142](https://github.com/countrymanprime/narration-studio/issues/1142), Phase 1 of the [Studio Next extraction PRD](../prds/studio-next-extraction-and-analysis-tools.prd.md). **Answers:** can the app offer BookNLP as an optional download, which exact files, under which licence, at what cost, and can it share the environment GLiNER needs.

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

The full revisions, `config.json` and `vocab.txt` are pinned in [Pinned and run](#pinned-and-run-2026-10-24); the encoder weights above are not downloaded at all. The encoders add about 142 MB to the small install (45.1 + 38.8 + 57.7 MB) and about 711 MB to the large one (270.3 + 440.5 MB, the `L-12` repository counted once for its two uses).

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
  "status": "In the catalog as an optional download (SNX-7b); consent required",
  "note": "Three PyTorch pickles totalling 160,398,571 bytes from people.ischool.berkeley.edu/~dbamman/booknlp_models/, pinned by size and the SHA-256 this project computed on 2026-10-11 (the host publishes none). Program licence read 2026-10-11 from the repository LICENSE (MIT, Copyright (c) 2021 David Bamman). The README names no licence for the weights; the entity model's training data includes about 500 non-public contemporary books. The Google BERT encoders it fetches at first load are Apache-2.0. Use is narrow: character names, clusters and speaker guesses shown for review."
},
"booknlp/big": {
  "commercialUse": "As booknlp/small",
  "status": "In the catalog as an optional download (SNX-7b); consent required",
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
- **What the freeze must do:** as for GLiNER, keep the heavy packages out of the frozen tree and import them from the unpacked install directory at run time. The files of `sidecar-freeze` that change: `scripts/release/prepare-resources.py` (`exclude_modules`, not `collect_*`), `scripts/release/verify-installable.mjs` (the freeze must not carry `torch`), `src/studio/desktop/smoke.go` or the sidecar `self-check` (report "booknlp: not installed" as a normal state), and `scripts/release/tests/test_prepare_resources.py`. If BookNLP gets its own sidecar mode, `sidecar-add` also applies (project, test, packaging, asset and threat-model rows).
- **Threat model:** unpickling a weight file executes code, so the download must be hashed before load. SN-X61 and SNX-7b re-read the first-use-download row of `docs/architecture/threat-model.md`; this slice does not edit it.

## Pinned and run (2026-10-24)

**Encoders.** The code confirms the mapping: each model strips its prefix and version from the weight file's name and calls `BertModel.from_pretrained("google/bert_uncased_L-…")`, then loads the weight file over it with a strict `load_state_dict`. Every weight file holds the whole encoder (embeddings, every layer, the pooler), so the encoder's own weights are overwritten and never used. The adapter builds each encoder from its `config.json` and the shared `vocab.txt` alone (`_local_encoders`). On chapter VI of Alice the small model's `.entities`, `.quotes` (122 lines), `.tokens` and `.book` files are byte-identical with and without the encoder weights. That saves 142 MB on the small install and 711 MB on the large one.

| Repository @ revision | `config.json` (bytes, SHA-256) |
| --- | --- |
| `google/bert_uncased_L-2_H-256_A-4` @ `4e937a8675e5afd9a4836735c186ec01695bc3ea` | 383, `ba873b4875d069697fa5bab011ea9e3f63b7f8186701bdf5356b4d8622d8f5c1` |
| `google/bert_uncased_L-4_H-256_A-4` @ `387825ce42dbb39b87911cdf8e383ee3b25184f8` | 383, `61716a972c73e9cc1d6f1165e27e577c1f4012a3cc480e431f427a78d5071ece` |
| `google/bert_uncased_L-8_H-256_A-4` @ `fff21c203abcc9365418f2e46bb6801a2b98e3da` | 383, `786e6029b075a1bb4af66edcb09fa8b1e7df095b931829ab684a3e55e5dcb5c0` |
| `google/bert_uncased_L-6_H-768_A-12` @ `c132ecc85d3d73b460b741cc50aa9ed18446c335` | 384, `701910395dc211b902e685089657ccb437ad4f8a7a6b3cae708f7030fc12ba73` |
| `google/bert_uncased_L-12_H-768_A-12` @ `cc478efa3482fefe275eb2733363db9713d499ef` | 385, `887ee20f3594eacdd08318d1c096014389dca4672e3041892916abd17a80c90c` |

All five repositories share one `vocab.txt` (231,508 bytes, `07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3`), installed once as `bert_uncased.vocab.txt`.

**Python packages.** `transformers==5.16.0` and its closure, resolved for Windows and Python 3.12 against `uv.lock` (`uv pip compile`), minus what the guide's freeze already carries: `transformers`, `huggingface-hub` 1.31.0, `tokenizers` 0.23.2, `safetensors` 0.8.0, `regex` 2026.9.29, `filelock` 4.2.1, `fsspec` 2026.7.0, `sympy` 1.14.0, `mpmath` 1.3.0 and `networkx` 3.7. Add `setuptools` 80.10.2 for `pkg_resources`, which the freeze's `setuptools` 84 no longer has. Each wheel is pinned in `config/analysis-assets.json` with its PyPI SHA-256 and unpacked size. `hf-xet` is left out: it only serves downloads, and the load is offline. A frozen scan ran without `networkx` and `fsspec`, but both are declared dependencies, so they ship. This `transformers` satisfies GLiNER's `<5.17.0`, so the two share the one environment (SNX-Q4), and BookNLP 1.0.8 loads on it with the `position_ids` patch already in the adapter.

**The freeze.** Running a scan in the frozen guide on Linux (`prepare-resources.py --sidecar manuscript-guide`, the pinned files in an install folder, no network settings in the environment) found four gaps, each fixed and pinned by a test:

- the standard library the tools import that the guide does not (`pickletools`, then `filecmp`, `plistlib`, `mmap`, `struct`, `sysconfig`, and `ctypes.wintypes` on Windows);
- submodules of packages the freeze carries in part (`tqdm.auto` and the rest of `tqdm`'s, `jinja2.meta`), since a frozen package wins over the install folder's copy;
- the metadata of `tqdm`, `packaging`, `numpy` and `pyyaml`, whose versions `transformers` checks on import;
- BookNLP printing to stdout, which the host would have read as a bad suggestion line.

The list is `FREEZE_IMPORTS` and `FREEZE_METADATA` in the adapter; `prepare-resources.py` reads it, and the `tool-runtime` self-check line proves it in the packaged smoke test. After the fixes the frozen guide's scan of chapter VI (81 paragraphs, 3,328 words) printed 142 suggestion lines in 20 seconds on the small weights: 114 speakers, 15 entries, 10 Gender properties and 3 aliases. The Linux check used torch's Linux build with its CUDA libraries; the Windows freeze and wheels are the owner's packaged check below.

## Recommendation

**Shipped as an optional download (2026-10-24).** Both sizes install from Settings > Analysis tools with consent. The speaker confidences in `SPEAKER_CONFIDENCE` stay provisional until the calibration below.

## Owner steps

These go to [#992](https://github.com/countrymanprime/narration-studio/issues/992) (D65: none blocks a merge).

1. **Packaged check on Windows.** In a release build:
   - Open Settings > Analysis tools, choose **Download** on BookNLP (small) and accept. Note how long it takes.
   - Open a project with a manuscript, then Story Bible > More actions > **Scan the manuscript** with BookNLP ticked. Note the minutes, and the peak memory of the `manuscript-guide` process in Task Manager.
   - Run the program with `--smoke` and keep its report: the `guide:tool-runtime` and `guide:booknlp` lines must pass.
   - Repeat with BookNLP (large).
   - **Send back:** the scan's log lines (Story Bible > the scan's messages), the `--smoke` report, the two timings and peak memory per size, and any line that says BookNLP could not be loaded.
2. **Calibration of the 75% rule (SN-X8).** In the repository, with the app's install folders from step 1 (under the asset cache, `analysis\booknlp\booknlp-small\1.0` and `…\booknlp-big\1.0`):

   ```text
   python scripts/research/extraction-calibration/run_calibration.py fetch
   python scripts/research/extraction-calibration/run_calibration.py gold-check
   python scripts/research/extraction-calibration/run_calibration.py run --booknlp-small-install <small folder> --booknlp-large-install <large folder> --spacy-model <en_core_web_sm folder>
   ```

   A source is only scored against a gold set, and none exists yet. Write `data/<book>/gold.jsonl` for at least two scored books by reading their chapters, in [the protocol's format](studio-next-extraction-calibration-protocol.md#the-gold-set), until `gold-check` reports the minimums. **Send back:** `data/out/report.md`. Its threshold recommendation, and the speaker accuracy for tagged and implicit quotes per size, set `SPEAKER_CONFIDENCE` and whether `VerifyBelow` stays 0.75.

Results stay provisional until they are re-run on the owner's own material (D70).
