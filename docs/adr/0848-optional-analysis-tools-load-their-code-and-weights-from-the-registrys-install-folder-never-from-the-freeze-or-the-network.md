# 0848. Optional analysis tools load their code and weights from the registry's install folder, never from the freeze or the network

**Status:** Proposed
**Significance:** The release pipeline and a dependency boundary: which Python packages a frozen sidecar carries, and how a sidecar finds code it was not frozen with. Reversing it means refreezing the Story Bible sidecar with a deep-learning stack, changing what the installer weighs and what the licence notices list, or adding a network fetch to a sidecar.
**Date:** 2026-10-12

## Context

The Story Bible can take suggestions from optional analysis tools: GLiNER for names, BookNLP for name groups and speakers ([the GLiNER spike](../research/studio-next-gliner-spike.md), [the BookNLP spike](../research/studio-next-booknlp-spike.md)). Both run on PyTorch and `transformers`. The trial's unpinned install of GLiNER made a 5.6 GB environment, the Windows `torch` wheel alone unpacks to about 476 MB, and most narrators will never turn either tool on. The `manuscript-guide` sidecar is a PyInstaller freeze that ships inside the installer (`scripts/release/prepare-resources.py`), so whatever it is frozen with every narrator downloads.

Both libraries' usual loaders (`GLiNER.from_pretrained`, the Hugging Face hub) fetch weights and tokenizers by repository name at first use, from a host the narrator never agreed to and with no hash this app checks. The app's rule is that analysis is local and every download goes through the asset registry with consent and a SHA-256 per file (ADR 0032, ADR 0079, ADR 0080 for the spaCy model).

The analysis tools' catalog (`config/analysis-assets.json`) already lists GLiNER's weights and its three wheels, each pinned by size and SHA-256, and the registry unpacks each wheel into its own `wheel-<name>` folder of the tool's install folder (`internal/analysistools`).

**Considered options:** freeze `gliner`, `transformers` and `torch` into `manuscript-guide` (lost: every narrator downloads gigabytes for a tool few will use, and each package becomes a licence line in the notices whether used or not); a second, separately frozen sidecar per tool, downloaded as one asset (lost: a second PyInstaller build in CI for code that changes rarely, and the frozen bundle still has to be hashed and pinned per release, unlike the upstream wheels the registry already pins); `pip install` into a virtual environment at first use (lost: it needs the network at run time, resolves versions the app did not pin, and needs a Python the narrator may not have); let the libraries fetch from the Hugging Face hub (lost: unhashed downloads outside the registry, against ADR 0032).

## Decision

1. An optional analysis tool's Python packages and weights are catalog files of its asset (`config/analysis-assets.json`), downloaded, checked and unpacked by the asset registry into the tool's install folder. Nothing installs, resolves or fetches a package at run time.
2. The host passes that install folder to the sidecar as an argument (`suggest --source gliner --install <folder>`, `self-check --gliner-install <folder>`). The adapter (`sidecars/manuscript-guide/core/extraction_gliner.py`) puts the folder's `wheel-*` directories on `sys.path`, sets `HF_HUB_OFFLINE` and `TRANSFORMERS_OFFLINE`, and loads the weights from the folder by path with `local_files_only=True`. It reads no other path and imports no HTTP client; a test holds it to both.
3. The freeze never carries these packages. `prepare-resources.py` excludes `gliner`, `transformers` and `torch` from the `manuscript-guide` freeze (the adapter's import is a plain one PyInstaller would otherwise follow on a build machine that has them), and `scripts/release/verify-installable.mjs` fails a release whose guide tree contains any of them.
4. The Go row (`apps/desktop/internal/extractionport/gliner`) is unavailable, with "GLiNER is not downloaded.", until the registry reports the tool installed and verified, and the sidecar's `self-check` reports the tool's version, or "not installed" as a pass, so the packaged smoke test never fails for a tool the narrator did not download. A missing or damaged install is a sentence, not a traceback.

The same rule holds for BookNLP's adapter.

## Consequences

- The installer stays the size it is, and a narrator who never turns on GLiNER or BookNLP never downloads PyTorch.
- Every byte an optional tool runs is pinned in the catalog and checked by the registry. A file whose hash is still pending (GLiNER's `gliner_config.json` and its tokenizer) keeps the tool from being installed at all, rather than letting the library fetch it.
- The wheels must match the Python the sidecar is frozen with (`cp312`, `win_amd64` for `torch`); a Python upgrade of the freeze means new catalog pins for every tool, and until then a tool installed for the old Python fails to load with a sentence naming the import error.
- A package loaded from `sys.path` inside a frozen program is not one PyInstaller analysed, so a native library it needs and the freeze lacks surfaces only on the narrator's machine. The packaged smoke test with the tool installed is the check, run by the owner on Windows.
- The licence notices built from the freeze (`notices.py`) do not see these packages; their licences are the catalog row's `license` and `attribution`, shown at consent.
- Reversing this (freezing a tool, or letting a library download) needs a new ADR that supersedes this one.
