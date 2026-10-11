# GLiNER spike: licence, pins, footprint and quality

**Date:** 2026-10-11. **Slice:** SN-X11 / SNX-1a ([#1139](https://github.com/countrymanprime/narration-utils/issues/1139)), Phase 1 of the [Studio Next extraction PRD](../prds/studio-next-extraction-and-analysis-tools.prd.md). **Answers:** can the app offer GLiNER as an optional download, which exact artifact, under which licence, at what cost.

**Verdict: ship behind "not yet available".** The artifact `urchade/gliner_small-v2.1` is Apache-2.0 and its bytes are pinned below, but two things stay open until an owner run: the footprint and quality on this repo's fixture were not measured in this session, and the only published weight format for the small model is a pickle. The adapter (SNX-7a) can start from these pins; the consent screen should wait for the numbers in [Owner steps](#owner-steps).

## What was read, and from where

Every figure below was read on 2026-10-11 from the Hugging Face API (`https://huggingface.co/api/models/<repo>?blobs=true`), PyPI's JSON API and the upstream GitHub repository, through the session proxy. No model file was downloaded; the SHA-256 values are the ones the Hugging Face API publishes for each LFS file, which is the file's own SHA-256. Nothing was committed except this note.

## Licence

The question is whether the artifact the app would pin is the Apache one. It is.

| Item | Record |
| --- | --- |
| Repository | `urchade/gliner_small-v2.1` |
| Revision | `4e091416cf7c3481db542c2a3d26156916f3a47f` (last modified 2024-04-10) |
| Licence field | `license: apache-2.0` in the model card's front matter at that revision; the API lists `license:apache-2.0` |
| Licence file | None. The model repository holds `.gitattributes`, `README.md`, `gliner_config.json` and `pytorch_model.bin` only, so the licence is the card's declaration, not a file in the repository |
| Code licence | `urchade/GLiNER` `LICENSE` is the Apache License 2.0 (opening lines: "Apache License / Version 2.0, January 2004"); the PyPI package `gliner` 0.2.29 declares `Apache-2.0` |
| Upstream statement | [`docs/intro.md`](https://github.com/urchade/GLiNER/blob/main/docs/intro.md): "`gliner_multi-v2.1`, `gliner_small-v2.1`, `gliner_medium-v2.1`, and `gliner_large-v2.1` are available under the Apache 2.0 license." |
| Training data | `urchade/pile-mistral-v0.1`, `license: apache-2.0` on its dataset card (read 2026-10-11). The card does not say where the underlying text came from, so the terms of that text are a residual, not a finding |

The card's own release table (same revision) lists the licence per release:

| Release | Repositories | Licence | Verdict |
| --- | --- | --- | --- |
| v0 | `urchade/gliner_base`, `urchade/gliner_multi` | `cc-by-nc-4.0` (API confirms both, 2026-10-11) | Ruled out: non-commercial |
| v1 | `urchade/gliner_small-v1`, `gliner_medium-v1`, `gliner_large-v1` | `cc-by-nc-4.0` per the card | Ruled out: non-commercial |
| v2 | `urchade/gliner_small-v2`, `gliner_medium-v2`, `gliner_large-v2` | `apache-2.0` per the card | Not chosen: v2.1 supersedes them |
| v2.1 | `urchade/gliner_small-v2.1`, `gliner_medium-v2.1`, `gliner_large-v2.1`, `gliner_multi-v2.1` | `apache-2.0` (API confirms all four) | Eligible; the small one is pinned |

The unversioned `urchade/gliner_small`, `gliner_medium` and `gliner_large` are listed as CC BY-NC 4.0 in the upstream `intro.md`; they are also ruled out. A pin must name the revision, never a repository alias, because a repository's licence field can change in a later commit.

## Pins

All files of the install, for the PyTorch route (the route the 2026-10-10 trial ran, [`local-llm-research.md` section 9](mockups/studio-next/research/local-llm-research.md)). Host: `huggingface.co`, path `/urchade/gliner_small-v2.1/resolve/4e091416cf7c3481db542c2a3d26156916f3a47f/<file>`.

| File | Size (bytes) | SHA-256 |
| --- | --- | --- |
| `pytorch_model.bin` | 610,652,234 | `1d4e83e4e4ae4ae0a4fbc81a32ee6de480fb341650d73e808088bb2800312de4` |
| `gliner_config.json` | 477 | `PENDING`: not an LFS file, so the API gives no hash. Owner command: `curl -sS <url> \| sha256sum` |
| `README.md` | 4,756 | Not needed by the install |

The base encoder named in `gliner_config.json` is `microsoft/deberta-v3-small`; `GLiNER.from_pretrained` loads its tokenizer by that name at first use. That is a second fetch from `huggingface.co` that this note did **not** pin: **PENDING**, reason: the config names a repository, not a revision, and the files the tokenizer needs were not listed here. Owner command in [Owner steps](#owner-steps). Until it is pinned the adapter must not call `from_pretrained` with a repository name; SNX-7a should load from a local directory that holds every file.

The size is **610,652,234 bytes (582.4 MiB; 610.7 MB)**. The mock shows "585 MB", which is the trial's cache size; the consent screen should show the pinned bytes.

Formats on offer for the same model line:

| Variant | Format | Size (bytes) | SHA-256 |
| --- | --- | --- | --- |
| `urchade/gliner_small-v2.1` @ `4e091416cf7c` | pickle (`pytorch_model.bin`) only | 610,652,234 | `1d4e83e4…12de4` |
| `urchade/gliner_medium-v2.1` @ `40ec419335d0` | `model.safetensors` and a pickle | 780,735,696 (safetensors) | `922214c0c60f7835bb5c00f52ad1769d38518d5183f85de7bc03893a8403c023` |
| `onnx-community/gliner_small-v2.1` @ `main` | ONNX, int8 `onnx/model_int8.onnx` | 183,403,734 | `c76c90920547fd937aaf505e7f2de5ec73168bf1c25abbb55a298104cb061400` |

The ONNX repository's card names `urchade/gliner_small-v2.1` as its base model but declares no licence in its card data (read 2026-10-11), and it is a third party's conversion. Treat it as not cleared: **PENDING**, reason: no licence field; owner decision whether a derivative of an Apache-2.0 model needs more than the base model's licence. Its tokenizer files (`spm.model`, 2,464,616 bytes) would also need a pin. A pickle is code-executing on load; the pin by SHA-256 plus `torch.load(..., weights_only=True)` is the mitigation, and the safetensors medium model avoids the question at the cost of 28% more disk.

Python packages (PyPI, wheels the registry can fetch as pinned assets):

| Package | Version | File | Size (bytes) | SHA-256 |
| --- | --- | --- | --- | --- |
| `gliner` | 0.2.29 (2026-09-08), Apache-2.0, Python `>=3.10` | `gliner-0.2.29-py3-none-any.whl` | 261,988 | `0c8cfb9f5c2daf7aff329ebb5ab1609052d7ad0aca0ef26049b9476b018b3fde` |
| `transformers` | 5.16.0 (the newest line `gliner` 0.2.29 allows: `<5.17.0,>=4.51.3`) | `transformers-5.16.0-py3-none-any.whl` | 12,014,254 | `2b4adda8d99bb4c1b208da5ed967e2625ad449087827a750cb3b23ce4000b139` |
| `torch` | 2.14.1 | `torch-2.14.1-cp312-cp312-win_amd64.whl` | 124,113,906 | `38bee9f2a2ccfc6898172a5075e4ba52522fbe143eeb099674fc67ab390e858d` |

`gliner` also requires `huggingface_hub`, `numpy`, `packaging`, `safetensors`, `tqdm` and `sentencepiece`; their wheels are **PENDING** a resolver run (owner command below), because the closure depends on the Python the sidecar freezes with. The trial's unpinned install produced a 5.6 GB virtual environment with pip's default wheels, which is the figure to beat, not the one to ship.

## Provenance row proposal

For SN-X61 to paste into `scripts/licenses/model-review.json` under `catalogued`, keyed `gliner/gliner-small-v2.1`:

```json
"gliner/gliner-small-v2.1": {
  "commercialUse": "Yes (Apache-2.0, declared on the model card and in the upstream docs; no licence file in the model repository)",
  "status": "In the catalog as an optional download (ADR 0847, SNX-7a); consent required",
  "note": "urchade/gliner_small-v2.1 at revision 4e091416cf7c3481db542c2a3d26156916f3a47f, a PyTorch pickle of 610,652,234 bytes. Licence read 2026-10-11 from the card front matter and the upstream docs/intro.md; the GLiNER v0 and v1 releases and the unversioned small/medium/large repositories are CC BY-NC 4.0 and are not used. Training data urchade/pile-mistral-v0.1 is Apache-2.0 on its dataset card, whose source text is not described: residual. The base encoder microsoft/deberta-v3-small is fetched separately and is not yet pinned."
}
```

The `gliner` wheel, `transformers` and `torch` are Python packages. They go through the dependency review in `scripts/licenses` (`reviewed.json`), not the model review.

## Runtime footprint

**Not measured here.** The session has 4 vCPU and 16 GB but no PyTorch environment, and installing the 5.6 GB stack was out of proportion for a docs slice. The figures below are the 2026-10-10 trial's, on a 4-vCPU CPU, with `gliner_small-v2.1`, threshold 0.5, Alice chapters V to VIII ([`local-llm-research.md` sections 9.2 and 9.3](mockups/studio-next/research/local-llm-research.md)). They were measured by another session and are not re-checked here.

| Measure | Trial figure |
| --- | --- |
| Disk, weights | 585 MB in the Hugging Face cache (pinned size above) |
| Disk, PyTorch environment | 5.6 GB with pip's default wheels; the CPU-only wheel was not tried |
| Memory | 2.0 GB peak |
| Model load | 3.7 s |
| Time per chapter | 2.0 to 2.4 s (14 to 18 chunks of about 180 words) |
| Projected 90,000-word book | about 1.5 to 2 minutes (estimate) |

The mock's consent figures (585 MB, 2 GB, about 2 minutes per book) match the trial. Treat them as provisional (SNX-Q6).

To measure on the owner's machine, with the weights in a local directory `$MODEL`:

```text
python -I measure_gliner.py --model "$MODEL" --text tests/fixtures/alice.md --out .local/gliner-trial.json
```

where `measure_gliner.py` is the script in [Owner steps](#owner-steps).

## Quality on a fixture

**Not measured here.** The 2026-10-10 trial reports, for `gliner_small-v2.1` with labels `character`, `place`, `object` at threshold 0.5 on Alice chapters V to VIII (its hand-labelled gold of 24 character-chapter slots):

- character recall 24 of 24;
- 56 of 60 distinct surface forms labelled `character` were right; the false positives included "she", "She" and "the hedgehog";
- no aliases: "the Caterpillar" and "Caterpillar" are separate strings;
- the trial's own caveat: Alice is a classic that may have been in training data, so the numbers may be optimistic; the hand-labelled gold was made by that session, not checked by the owner.

Against the rules baseline the trial recorded only counts, not a paired precision and recall on the same gold, and this repo's rules-only run on the whole of `tests/fixtures/alice.md` emits 48 entries ([spaCy spike](spacy-model-provisioning-spike.md)). A paired comparison needs the gold set that the calibration protocol (SN-X13, `docs/research/studio-next-extraction-calibration-protocol.md`) defines.

**Confidence.** GLiNER's `predict_entities` returns a `score` per span (a sigmoid probability that the span has the label, read from the package's README example and the trial's use of a threshold; not re-run here). It is a model score, not a calibrated probability: it must pass through the calibration table before it counts toward the 75% rule. Where a source gives no score the suggestion's confidence is `null`, never a made-up number. This one gives a score, so the open question is how well it is calibrated, which the protocol measures.

## How it loads

- **Package and version:** `gliner` 0.2.29 from PyPI, a pure-Python wheel (261,988 bytes), Apache-2.0. It pulls in `torch` and `transformers` (table above). It also supports an ONNX runtime extra (`onnxruntime`) that avoids PyTorch, but the ONNX weights are an uncleared third-party conversion (above).
- **Registry fetch:** the three wheels above are plain `py3-none-any` or `win_amd64` wheels on `files.pythonhosted.org`, with size and SHA-256 published by PyPI, so the registry can pin them as it pins the spaCy wheels ([spaCy spike](spacy-model-provisioning-spike.md)). The weight file is a separate hashed asset from `huggingface.co`. The caveat is `torch`: 124 MB for the Windows wheel on PyPI, but an unpacked install is far larger and the sidecar must import it from a directory the registry unpacked, not from the frozen tree (SNX-Q4: separate optional wheels in the `manuscript-guide` environment).
- **What a frozen sidecar must do:** PyInstaller cannot follow a package the freeze never saw. SNX-7a must import `gliner` lazily from the unpacked wheel directory (`sys.path` insertion before the import, as the spaCy model is loaded by directory path), and must not add `torch`, `transformers` or `gliner` to the `Sidecar` entry in `scripts/release/prepare-resources.py`, or the release carries about 5 GB it was meant to leave out. `transformers` imports many modules by string, so a path-loaded install is the practical route. Pin `transformers<5.17.0` (the `gliner` 0.2.29 constraint).
- **Files of `sidecar-freeze` that would change** (per that skill's four places): `scripts/release/prepare-resources.py` (an `exclude_modules` entry so the freeze stays small, not a `collect_*` entry), `scripts/release/verify-installable.mjs` (check the freeze does **not** contain `torch`), `apps/desktop/smoke.go` or the sidecar's `self-check` report (report "gliner: not installed" as a normal state), and `scripts/release/tests/test_prepare_resources.py`. `notices.py` will not see an optional wheel installed after release, so its licence line must come from the registry row.

## Recommendation

**Ship behind "not yet available":** the Apache-2.0 small-v2.1 artifact is pinned and the trial's recall is strong, but its disk and memory are unmeasured on the target machine, its only format is a pickle, and its base-encoder fetch and dependency closure are unpinned, so the consent screen should not offer it until the owner run fills those in.

## Owner steps

These go to [#992](https://github.com/countrymanprime/narration-utils/issues/992) (D65: none of them blocks a merge).

1. Pin the unpinned files, on a machine with a network:

   ```text
   curl -sS https://huggingface.co/urchade/gliner_small-v2.1/resolve/4e091416cf7c3481db542c2a3d26156916f3a47f/gliner_config.json | sha256sum
   curl -sS "https://huggingface.co/api/models/microsoft/deberta-v3-small?blobs=true"
   ```

   Record the revision, sizes and SHA-256 of the files `AutoTokenizer.from_pretrained("microsoft/deberta-v3-small")` reads, and its licence.
2. Resolve the dependency closure for the sidecar's Python and record every wheel's size and SHA-256: `uv pip compile` for `gliner==0.2.29 transformers==5.16.0 torch==2.14.1`, with the CPU `torch` wheel if one exists for Windows.
3. Measure the footprint and the quality with this script (run it with `python -I`, in a virtual environment outside the repository; it writes only to the path given):

   ```python
   import argparse, json, re, resource, sys, time
   from gliner import GLiNER

   p = argparse.ArgumentParser()
   p.add_argument("--model", required=True)
   p.add_argument("--text", required=True)
   p.add_argument("--out", required=True)
   a = p.parse_args()

   t0 = time.time()
   model = GLiNER.from_pretrained(a.model, local_files_only=True)
   load_s = time.time() - t0
   text = open(a.text, encoding="utf-8").read()
   chapters = re.split(r"\n(?=#{1,2} )", text)
   labels = ["character", "place", "object"]
   rows = []
   for i, ch in enumerate(chapters):
       words = ch.split()
       chunks = [" ".join(words[j:j + 180]) for j in range(0, len(words), 180)]
       t = time.time()
       spans = [s for c in chunks for s in model.predict_entities(c, labels, threshold=0.5)]
       rows.append({"chapter": i, "words": len(words), "seconds": time.time() - t,
                    "spans": [{"text": s["text"], "label": s["label"], "score": s["score"]} for s in spans]})
   peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 if sys.platform != "win32" else None
   json.dump({"load_seconds": load_s, "peak_rss_mb": peak_mb, "labels": labels, "threshold": 0.5, "chapters": rows},
             open(a.out, "w"), indent=1)
   ```

   On Windows read the peak working set from Task Manager or `psutil`; the script records `null` rather than a guess. Score the spans against the gold set of the calibration protocol, and against the rules baseline run on the same chapters, and record both in the SN-X8 evaluation.

Results stay provisional until they are re-run on the owner's own material (D70).
