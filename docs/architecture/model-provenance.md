# Model provenance and licences

Every model, voice and data pack the app can download, where it comes from, under which licence, whether it may be used for a paid audiobook, and what was decided about it. The tables under [The artifacts](#the-artifacts) are **generated** from the eight catalogs the release carries (`config/whisper-assets.json`, `config/tts-assets.json`, `config/spacy-assets.json`, `config/moonshine-assets.json`, `config/dictionary-assets.json`: the reader's offline dictionary, [Dictionary look-up](dictionary-thesaurus-integration.md); `config/wiktextract-assets.json`: the Story Bible's offline Wiktionary pronunciations, [ADR 0002](../adr/0002-local-models-and-tools-come-first-so-the-app-is-free-to-use.md); `config/encoder-assets.json`: the MP3 encoder's FFmpeg build, [encoder-assets.json](../../config/encoder-assets.json); and `config/analysis-assets.json`: the optional Story Bible analysis tools, [first-use dependency provisioning](first-use-dependency-provisioning.md#the-story-bible-analysis-tools)) by `scripts/licenses/models.mjs`, so they cannot disagree with what the app downloads; the judgements (commercial use, status, notes) are written in `scripts/licenses/model-review.json`. The policy for adding one is [below](#adding-a-model-tool-or-data-pack), the record of every candidate is in the [local dependency evaluation](../research/local-dependency-evaluation.md), and the download rules are in [first-use dependency provisioning](first-use-dependency-provisioning.md). This is engineering guidance, not legal advice.

## The rules

- **Program licence.** The project is AGPL-3.0-or-later ([Contributing](../../CONTRIBUTING.md)), so bundling GPL-family code is allowed. That is why the frozen Story Bible sidecar may contain Piper (`piper-tts`, GPL-3.0-or-later), `phonemizer` (GPL-3.0-or-later) and eSpeak NG's data: they ship in the release, with their notices and a source offer in `THIRD-PARTY-NOTICES.txt` ([Third-party notices](../operations/ci-and-releases.md#third-party-notices)). There is no "separate downloaded asset" split for them.
- **Model licences are still checked per artifact.** A model is data with its own licence and its own training-data terms, and the program's licence says nothing about them. An artifact whose licence is unclear, restricted or non-commercial is **marked "unclear" here and kept out of the catalog** until each artifact is cleared: no automatic download, no listing as a supported option (an owner decision, applying the [licence classes](#license-classes)).
- **One row per artifact.** A new catalog entry needs its review row, or `pnpm check` fails (`scripts/licenses/models.test.mjs`); a review row for an artifact that left the catalog fails the same way. Changing a pin (a new revision, a new hash) changes the generated table in the same pull request.
- **Nothing downloads by itself.** Every artifact below is fetched only after the narrator confirms, checked against the size and SHA-256 recorded here, and kept in the per-user cache ([threat model](threat-model.md#1-first-use-downloads-securitymd-bullet-2)).

## Adding a model, tool or data pack

The policy below applies to every candidate before it reaches a catalog. The record of each candidate judged by it, adopted or not, is the [local dependency evaluation](../research/local-dependency-evaluation.md).

### License classes

| Class | Examples | Commercial audiobook workflow | Repository/integration consequence |
| --- | --- | --- | --- |
| Permissive | MIT, BSD-2/3-Clause, Apache-2.0 | Allowed. | Keep copyright/license notices in the dependency record. Apache-2.0 also carries notice and patent terms. |
| Attribution | CC BY 4.0 model packs | Allowed. | Display and retain the exact required attribution and model card. Do not imply the app owns the model. |
| Weak copyleft | LGPL | Allowed. | Prefer a separately installed executable or dynamically linked library; preserve notices and allow replacement of the LGPL component if distributing a combined application. |
| Strong copyleft | GPL | Allowed for using the tool to make a paid audiobook. The audiobook is not made GPL by that use. | The app is itself AGPL-3.0-or-later ([Contributing](../../CONTRIBUTING.md)) and already ships GPL-family code in the frozen Story Bible sidecar (Piper, phonemizer, eSpeak NG data), so a GPL-3.0-or-later component is compatible: keep its notices and make the corresponding source available. GPL-2.0-only is not compatible. Prefer a separate executable for a tool the release does not need. |
| Unclear, restricted, or non-commercial | Missing license, `NC`, research-only, gated terms inconsistent with commercial use | Not approved. | Do not download automatically, list as a supported option, or use in shipped tests until the exact artifact is cleared. |

### Required dependency record

Before an optional dependency is added, record all of the following for it:

- tool/model name, publisher, exact version or commit, immutable download URL,
  SHA-256, installed size, and install command;
- code license URL and the separate weight/dictionary/acoustic-model license
  URL, if there are weights or data packs;
- model card/training-data provenance and required attribution text;
- every runtime dependency that is downloaded by first run;
- whether it is invoked as a separate process, Python package, or linked
  library; and
- removal path, update policy, test result, and the app's feature it
  enables.

An update checker may report that an upstream release exists, but it must not
silently replace a model or executable just because a tag named `latest` moved.
Any automatic update needs a reviewed catalog update, a new hash, a license
recheck, and regression tests. This protects both reproducibility and license
accountability.

### Evaluation protocol

Each candidate follows the same small, reviewable trial before implementation.

1. **Provenance gate.** Record the exact upstream artifact and confirm its
   code, weights, dictionaries, and model-card terms permit this commercial
   workflow.
2. **Held-out corpus.** Use 3--5 already-recorded chapters with narrator
   permission, plus a manually annotated sample appropriate to the task.
   Audio, manuscripts, voice embeddings, and test outputs remain ignored local
   project data.
3. **Blind comparison.** Run the current workflow and the candidate workflow.
   Review without seeing which system produced the cue where practical.
4. **Measure value.** Count useful findings, false positives, missed known
   cases, processing time, setup friction, and minutes of narrator review
   saved. A new analyzer must improve a decision, not simply emit more data.
5. **Human boundary.** Every candidate result has evidence and an
   accept/dismiss/defer outcome. No test may create an active take or alter a
   render.
6. **Decision.** Mark the candidate `adopt`, `defer`, or `reject`, with the
   pinned artifact/version and trial evidence in the [local dependency evaluation](../research/local-dependency-evaluation.md).

## The artifacts

<!-- models:begin (generated by scripts/licenses/models.mjs; edit scripts/licenses/model-review.json, not this table) -->
### Artifacts in the catalogs

| Artifact | Publisher | Licence | Pinned | Download | Commercial use | Status | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faster-whisper/tiny | Systran | [MIT](https://huggingface.co/Systran/faster-whisper-tiny) | `d90ca5fe2602` | 74.6 MiB | Yes (MIT) | In the catalog | CTranslate2 conversion of OpenAI Whisper by Systran. |
| faster-whisper/small | Systran | [MIT](https://huggingface.co/Systran/faster-whisper-small) | `536b0662742c` | 463.7 MiB | Yes (MIT) | In the catalog | CTranslate2 conversion of OpenAI Whisper by Systran. |
| faster-whisper/medium | Systran | [MIT](https://huggingface.co/Systran/faster-whisper-medium) | `08e178d48790` | 1.43 GiB | Yes (MIT) | In the catalog | CTranslate2 conversion of OpenAI Whisper by Systran. |
| faster-whisper/large-v3-turbo | deepdml | [MIT](https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2) | `4df90f753211` | 1.51 GiB | Yes (MIT) | In the catalog | A community conversion by deepdml of OpenAI's model, tagged MIT on its Hugging Face page (re-read 2026-09-20); pinned by commit and per-file hash, so the bytes are the ones reviewed. |
| faster-whisper/large-v3 | Systran | [MIT](https://huggingface.co/Systran/faster-whisper-large-v3) | `edaa852ec7e1` | 2.88 GiB | Yes (MIT) | In the catalog | CTranslate2 conversion of OpenAI Whisper by Systran. |
| piper/en_US-ljspeech-high | rhasspy | [Public domain training data; Piper Voices repository MIT](https://keithito.com/LJ-Speech-Dataset/) | `1.0.0` | 108.9 MiB | The model card is silent; the LJ Speech data is public domain and the Piper Voices repository is MIT | In the catalog | The card's silence on commercial use is a residual, recorded in the local dependency evaluation. The Piper program and eSpeak NG that speak it are GPL-3.0-or-later and are bundled, not downloaded. |
| piper/en_GB-cori-high | rhasspy | [Public domain training data (LibriVox); Piper Voices repository MIT](https://librivox.org) | `5041a7a49ae5` | 108.9 MiB | The model card is silent; the LibriVox recordings are public domain and the Piper Voices repository is MIT | In the catalog | Read at the pinned revision (2026-10-26): the card gives the dataset as LibriVox, public domain, and says the voice was trained from scratch on about 24 hours of LibriVox recordings, so no other voice's training data is in it (the Piper medium voices fine-tuned from lessac are left out for that reason). The card's silence on commercial use is the same residual as LJ Speech's. Bundled Piper and eSpeak NG speak it, as for LJ Speech. |
| piper/en_US-kristin-medium | rhasspy | [Public domain training data (LibriVox); Piper Voices repository MIT](https://librivox.org) | `5041a7a49ae5` | 60.6 MiB | The model card is silent; the LibriVox recordings are public domain and the Piper Voices repository is MIT | In the catalog | Read at the pinned revision (2026-10-26): the card gives the dataset as LibriVox, public domain, and says the voice was trained from scratch on about 11.5 hours of LibriVox recordings, so no other voice's training data is in it (the Piper medium voices fine-tuned from lessac are left out for that reason). The card's silence on commercial use is the same residual as LJ Speech's. Bundled Piper and eSpeak NG speak it, as for LJ Speech. |
| piper/en_US-norman-medium | rhasspy | [Public domain training data (LibriVox); Piper Voices repository MIT](https://librivox.org) | `5041a7a49ae5` | 60.6 MiB | The model card is silent; the LibriVox recordings are public domain and the Piper Voices repository is MIT | In the catalog | Read at the pinned revision (2026-10-26): the card gives the dataset as LibriVox, public domain, and says the voice was trained from scratch on about 15.5 hours of LibriVox recordings, so no other voice's training data is in it (the Piper medium voices fine-tuned from lessac are left out for that reason). The card's silence on commercial use is the same residual as LJ Speech's. Bundled Piper and eSpeak NG speak it, as for LJ Speech. |
| spacy/en_core_web_sm | Explosion | [MIT](https://spacy.io/models/en#en_core_web_sm) | `3.8.0` | 12.2 MiB | Yes (MIT, ExplosionAI) | In the catalog, cleared from the wheel's own notices | The wheel's LICENSES_SOURCES records the training data: OntoNotes 5 ("commercial (licensed by Explosion)"), the ClearNLP dependency conversion (a citation, no code), WordNet 3.0 (its licence, which travels with the model). Read by the S16 spike; the corpora's terms beyond Explosion's statement are not independently verified. The owner may withdraw the model. |
| spacy/en_core_web_lg | Explosion | [MIT](https://spacy.io/models/en#en_core_web_lg) | `3.8.0` | 382.1 MiB | Yes (MIT, ExplosionAI) | In the catalog, cleared from the wheel's own notices | As en_core_web_sm, plus the Explosion Vectors (OSCAR 2109, Wikipedia, OpenSubtitles, WMT News Crawl) recorded in the same file. Same residual. |
| moonshine/tiny | Moonshine AI | [MIT](https://github.com/moonshine-ai/moonshine/blob/main/LICENSE) | `quantized_26_08_21` | 74.1 MiB | Yes (MIT) | In the catalog; the Windows sidecar runs it from a catalog install | English streaming model, word-timestamp variant, publisher Moonshine AI. Licence re-verified 2026-09-22 directly against the repository's LICENSE file (GitHub's detector reports the repository as unrecognized): the English streaming models are explicitly MIT, distinct from the non-commercial Community License that covers only legacy non-English, non-streaming models. Pinned to the dated release path `.../quantized_26_08_21`; every file's URL, size and SHA-256 were verified by downloading and hashing once. |
| moonshine/small | Moonshine AI | [MIT](https://github.com/moonshine-ai/moonshine/blob/main/LICENSE) | `quantized_26_08_21` | 213.7 MiB | Yes (MIT) | In the catalog; the Windows sidecar runs it from a catalog install | As moonshine/tiny, larger architecture. |
| oewn/oewn-2025 | The Open English WordNet Team | [CC-BY-4.0](https://github.com/globalwordnet/english-wordnet/blob/2025-edition/LICENSE.md) | `2025` | 9.5 MiB | Yes (CC BY 4.0, attribution required; the Princeton WordNet 3.0 data it derives from is under the permissive WordNet License) | In the catalog ([dictionary look-up](dictionary-thesaurus-integration.md)); the reader's Look up panel shows it | Open English WordNet 2025 JSON release. Licence read 2026-09-23 from the repository's LICENSE.md: CC BY 4.0 for OEWN, with attribution to both Princeton WordNet and the OEWN team. Pinned by SHA-256 and size (a GitHub release asset URL can be re-uploaded, so a changed file fails the check and is refused); the bytes were downloaded and hashed on 2026-09-23 and match the digest GitHub reports for the asset. The install unpacks it and keeps only a lookup index built from it (about 17 MB); the attribution is shown with every lookup and printed in the third-party notices. |
| wiktextract/wiktextract-en-pronunciation | Wiktionary contributors, via the Wiktextract project (kaikki.org) | [CC-BY-SA-4.0](https://en.wiktionary.org/wiki/Wiktionary:Copyrights) | `PENDING-PHASE-0-VERIFICATION` | 0.0 MiB | Pending (per upstream docs, not verified in this session: CC BY-SA 4.0 and GFDL dual licence, share-alike, attribution required; ADR 0002 accepts the class, scoped to displayed IPA only) | In the catalog as a Pending row; its URL and SHA-256 are not yet filled in because the egress proxy blocks kaikki.org, en.wiktionary.org and every candidate mirror this session could try (docs/research/wiktextract-pronunciation-source.md, #510); Install/Repair refuse the row until a future session verifies it | Wiktionary's IPA data, extracted and republished as structured JSON Lines by the Wiktextract project (kaikki.org). Licence terms restated from Wiktionary's and Wiktextract's own public documentation, not re-read live this session (docs/research/wiktextract-pronunciation-source.md). Once installed, the derived index keeps only a word -> {ipa, audio} lookup file, never the raw multi-gigabyte release; every displayed answer carries a CC BY-SA attribution label and the full notice is printed in the third-party notices. |
| ffmpeg/ffmpeg-7.1-essentials-win64 | The FFmpeg developers (build by gyan.dev, published on PyPI by imageio) | [GPL-3.0-or-later](https://ffmpeg.org/legal.html) | `7.1-essentials` | 29.8 MiB | Yes (GPL-3.0-or-later build of FFmpeg; encoding an audiobook with it does not put the audiobook under the GPL) | In the catalog (Proposed); the MP3 encoder runs it as a separate process | FFmpeg 7.1 essentials build by gyan.dev, from the imageio-ffmpeg 0.6.0 win_amd64 wheel on PyPI (a content-addressed URL; the SHA-256 is PyPI's published digest, checked 2026-09-27). The install keeps only ffmpeg.exe, and only when its own SHA-256 is the pinned one. Build configuration read from the binary: --enable-gpl --enable-version3, no nonfree; the paths the app uses (libmp3lame, the WAV reader, the MP3 muxer) are LGPL code. Windows only. The project does not convey it (PyPI does); the notices name the licence and where the source is (docs/research/ffmpeg-encoder-build.md). |
| gliner/gliner | Urchade Zaratiana (urchade on Hugging Face) | [Apache-2.0](https://huggingface.co/urchade/gliner_small-v2.1/blob/4e091416cf7c3481db542c2a3d26156916f3a47f/README.md) | `4e091416cf7c` | 712.4 MiB | Yes (Apache-2.0, declared on the model card and in the upstream docs; no licence file in the model repository) | In the catalog as an optional analysis tool, not yet available: gliner_config.json, the base encoder's tokenizer and the dependency wheels are not all pinned; consent required | urchade/gliner_small-v2.1 at revision 4e091416cf7c3481db542c2a3d26156916f3a47f, a PyTorch pickle of 610,652,234 bytes, with the gliner 0.2.29, transformers 5.16.0 and torch 2.14.1 wheels from PyPI. Licence read 2026-10-11 from the card front matter and the upstream docs/intro.md; the GLiNER v0 and v1 releases and the unversioned small/medium/large repositories are CC BY-NC 4.0 and are not used. Training data urchade/pile-mistral-v0.1 is Apache-2.0 on its dataset card, whose source text is not described: residual. The base encoder microsoft/deberta-v3-small is fetched separately and is not yet pinned (docs/research/studio-next-gliner-spike.md). |
| booknlp/booknlp-small | David Bamman (UC Berkeley) | [MIT (program); no licence stated for the model files](https://github.com/booknlp/booknlp/blob/main/LICENSE) | `1.0` | 299.3 MiB | Program MIT. The weights carry no stated licence (owner ruling SNX-Q3: not a blocker, because the tool only identifies character entries for the narrator to review) | In the catalog as an optional analysis tool (every file pinned 2026-10-24); consent required | Three PyTorch pickles totalling 160,398,571 bytes from people.ischool.berkeley.edu/~dbamman/booknlp_models/, pinned by size and the SHA-256 this project computed on 2026-10-11 (the host publishes none), with the booknlp 1.0.8 and torch 2.14.1 wheels from PyPI. Program licence read 2026-10-11 from the repository LICENSE (MIT, Copyright (c) 2021 David Bamman). The README names no licence for the weights; the entity model's training data includes about 500 non-public contemporary books. The Google BERT encoders are Apache-2.0: only their config.json and vocab.txt are downloaded, from huggingface.co pinned by revision and SHA-256, since the weight files hold every encoder parameter. The Python wheels BookNLP needs that the freeze does not carry are pinned from PyPI: transformers, huggingface-hub, tokenizers and safetensors (Apache-2.0), regex (Apache-2.0 AND CNRI-Python), filelock and setuptools (MIT), fsspec, sympy, mpmath and networkx (BSD). Use is narrow: character names, clusters and speaker guesses shown for review (docs/research/studio-next-booknlp-spike.md). |
| booknlp/booknlp-big | David Bamman (UC Berkeley) | [MIT (program); no licence stated for the model files](https://github.com/booknlp/booknlp/blob/main/LICENSE) | `1.0` | 1.26 GiB | As booknlp/booknlp-small: program MIT, the weights carry no stated licence (owner ruling SNX-Q3) | In the catalog as an optional analysis tool (every file pinned 2026-10-24): as booknlp/booknlp-small; consent required | As booknlp/booknlp-small; three pickles totalling 1,196,238,139 bytes. |
| local-llm/local-llm | Not chosen | [To be confirmed](https://github.com/countrymanprime/narration-studio/blob/main/docs/research/mockups/studio-next/research/local-llm-research.md) | `none` | 0.0 MiB | Not applicable: no model is chosen | In the catalog as unavailable, with no files; nothing is bundled or downloaded | A model small enough for a narrator's computer took many hours per book in the 2026-10-10 trial (docs/research/mockups/studio-next/research/local-llm-research.md), so the row only says so. A model, its licence and its pins come with the local LLM spike (SNX-9). |

### Every file, with the size and SHA-256 the app checks

| Artifact | File | Size (bytes) | SHA-256 |
| --- | --- | --- | --- |
| faster-whisper/tiny | `config.json` | 2,249 | `a73a28cdfe1c43ccc7202fa333d1f89c202477271407ae9a7f19afa52039cac8` |
| faster-whisper/tiny | `model.bin` | 75,538,270 | `dcb76c6586fc06cbdac6dd21f14cfd129cc4cdd9dce19bf4ffa62e59cbe6e6d1` |
| faster-whisper/tiny | `tokenizer.json` | 2,203,239 | `fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab` |
| faster-whisper/tiny | `vocabulary.txt` | 459,861 | `34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913` |
| faster-whisper/small | `config.json` | 2,370 | `b55496ac7940a7ae47d2c01eab40edfd8701feec1229d9cce3b40014383fb828` |
| faster-whisper/small | `model.bin` | 483,546,902 | `3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671` |
| faster-whisper/small | `tokenizer.json` | 2,203,239 | `fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab` |
| faster-whisper/small | `vocabulary.txt` | 459,861 | `34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913` |
| faster-whisper/medium | `config.json` | 2,257 | `3622a2ddc41ec0e0fd4e68c13c6830f03b90c38d89aaad184de02c8c642cf807` |
| faster-whisper/medium | `model.bin` | 1,527,906,378 | `9b45e1009dcc4ab601eff815b61d80e60ce3fd8c74c1a14f4a282258286b51ae` |
| faster-whisper/medium | `tokenizer.json` | 2,203,239 | `fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab` |
| faster-whisper/medium | `vocabulary.txt` | 459,861 | `34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913` |
| faster-whisper/large-v3-turbo | `config.json` | 2,263 | `b0253ea6c0d3bea6b1e19e91a02acfd3b53f4467362efcb5a3e6b16c9b3a9b7e` |
| faster-whisper/large-v3-turbo | `model.bin` | 1,617,884,929 | `e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da` |
| faster-whisper/large-v3-turbo | `preprocessor_config.json` | 340 | `7ccc62c6f2765af1f3b46c00c9b5894426835a05021c8b9c01eecb6dfb542711` |
| faster-whisper/large-v3-turbo | `tokenizer.json` | 2,710,337 | `297b13372ac43916285644fb9687add3cc62ee2a1adb60da3dc25cc94c1871fd` |
| faster-whisper/large-v3-turbo | `vocabulary.json` | 1,068,114 | `c69260f2ab26d659b7c398f9a2b2b48ed0df16c3b47d7326782fd9cba71690c1` |
| faster-whisper/large-v3 | `config.json` | 2,394 | `a9306624f5ec14270a014b647e5c316b6e03a662c369758d1b90697a7b0655b9` |
| faster-whisper/large-v3 | `model.bin` | 3,087,284,237 | `69f74147e3334731bc3a76048724833325d2ec74642fb52620eda87352e3d4f1` |
| faster-whisper/large-v3 | `preprocessor_config.json` | 340 | `7ccc62c6f2765af1f3b46c00c9b5894426835a05021c8b9c01eecb6dfb542711` |
| faster-whisper/large-v3 | `tokenizer.json` | 2,480,617 | `6d8cbd7cd0d8d5815e478dac67b85a26bbe77c1f5e0c6d76d1ce2abc0e5f21ca` |
| faster-whisper/large-v3 | `vocabulary.json` | 1,068,114 | `c69260f2ab26d659b7c398f9a2b2b48ed0df16c3b47d7326782fd9cba71690c1` |
| piper/en_US-ljspeech-high | `en_US-ljspeech-high.onnx` | 114,199,011 | `5d4f08ba6a2a48c44592eed3ce56bf85e9de3dd4e20df90541ae68a8310c029a` |
| piper/en_US-ljspeech-high | `en_US-ljspeech-high.onnx.json` | 4,970 | `7e1f4634af596d83cca997fb7a931ba80b70f8a316a2655ee69c55365e0ace14` |
| piper/en_GB-cori-high | `en_GB-cori-high.onnx` | 114,219,352 | `470b4dd634c98f8a4850d7626ffc3dfc90774628eeef6605a6dd8f88f30a5903` |
| piper/en_GB-cori-high | `en_GB-cori-high.onnx.json` | 4,963 | `9e7fb5b5671612c22f3c81cbe46c1ae87b031a4632bcb509e499dad6f1e2adec` |
| piper/en_US-kristin-medium | `en_US-kristin-medium.onnx` | 63,531,379 | `5849957f929cbf720c258f8458692d6103fff2f0e3d3b19c8259474bb06a18d4` |
| piper/en_US-kristin-medium | `en_US-kristin-medium.onnx.json` | 4,968 | `5681426d4aead22195de70531eeeeddb46493cfaffc5764b2ea3db73428b651c` |
| piper/en_US-norman-medium | `en_US-norman-medium.onnx` | 63,531,379 | `b9739443232a80a59c7d18810dd856899bf16a7964725f5ab81ea49b1351cb71` |
| piper/en_US-norman-medium | `en_US-norman-medium.onnx.json` | 4,968 | `6c2db7f558a4a8deb9fe822583c1c5105f6c4e834dd0f9de8ad17a888ee9fe1d` |
| spacy/en_core_web_sm | `en_core_web_sm-3.8.0-py3-none-any.whl` | 12,806,118 | `1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85` |
| spacy/en_core_web_lg | `en_core_web_lg-3.8.0-py3-none-any.whl` | 400,658,291 | `293e9547a655b25499198ab15a525b05b9407a75f10255e405e8c3854329ab63` |
| moonshine/tiny | `adapter.ort` | 1,319,664 | `22ecc949e146c49667fda28d102d4e30749a107dc88a396292aa8f277ef1347c` |
| moonshine/tiny | `cross_kv.ort` | 1,287,544 | `143a36667b8d05fd9d04e8c337b7ee121f37ef299aea6b3d82bdb3d3401950b4` |
| moonshine/tiny | `decoder_kv.ort` | 32,583,720 | `8852553f312adb6c9aa4d17418015049b30f412209ee569d336548c0044627de` |
| moonshine/tiny | `encoder.ort` | 7,675,440 | `a8414e1a5dedf9f2093d7680601dd8a9b0433e7020260eafe0e370ead91134ca` |
| moonshine/tiny | `frontend.model.ort` | 23,344 | `5121b561417b638afce0c6c31b760e37c93cf97f80d9b0031aad1fe7b6f25d61` |
| moonshine/tiny | `frontend.weights.ort` | 2,093,464 | `217da24ac6f522ebf02da8ef288e77d1ac68d50d4a6821433182e4fbf4204bbd` |
| moonshine/tiny | `streaming_config.json` | 509 | `74fe5ddebd63b17caf59e8a3b18c17547ff7bce1642050edbb1c3962674f8950` |
| moonshine/tiny | `tokenizer.bin` | 249,974 | `6884b35fd6377d4c4d32336a0bc152f36b64d1e45b6503683cdc238250a8472d` |
| moonshine/tiny | `decoder_kv_with_attention.ort` | 32,515,016 | `c1b41adca4ef75ad8dfdfc71875b5d0ae9be959865a14498da01cbddab8c02b8` |
| moonshine/small | `adapter.ort` | 2,870,368 | `c665f742364febad597cc9ac1e0b341ffbee0e24a1466e2f3bde95e6e4771762` |
| moonshine/small | `cross_kv.ort` | 5,356,536 | `e2d3417144e9514055ebfefe8dcc4c0a55a55adcb8530435844c75c53e352bf6` |
| moonshine/small | `decoder_kv.ort` | 81,878,600 | `1a05465b1dd955858dfcbee039c0020fb5dd982b0f5094c34e61735d518d771b` |
| moonshine/small | `encoder.ort` | 44,148,576 | `2d4d973e91e8aca08c51e7e7efa28a46ab265b63d809d5294d18b86bcd85b993` |
| moonshine/small | `frontend.model.ort` | 26,944 | `09b1210ae30dc5f0f3e45f0ebab914c254741323114f53fbbe5ae62cca35058f` |
| moonshine/small | `frontend.weights.ort` | 7,769,464 | `7ef97521bd4bad3928f5bb6808586f4fcc6e92bd5990394112eed7d4052ec338` |
| moonshine/small | `streaming_config.json` | 512 | `26f02b6afb22d60871a5efd85c3d38e569cc0ddb6c5eb6e93d3260152ae8a47a` |
| moonshine/small | `tokenizer.bin` | 249,974 | `6884b35fd6377d4c4d32336a0bc152f36b64d1e45b6503683cdc238250a8472d` |
| moonshine/small | `decoder_kv_with_attention.ort` | 81,766,608 | `19653ca93362cd0445837cbaabc9f36f462410b357dd4a102d9c8ca1c3d13c8c` |
| oewn/oewn-2025 | `english-wordnet-2025-json.zip` | 9,986,555 | `7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51` |
| wiktextract/wiktextract-en-pronunciation | `wiktextract-en-pronunciation.jsonl` | 0 | `PENDING-PHASE-0-VERIFICATION` |
| ffmpeg/ffmpeg-7.1-essentials-win64 | `imageio_ffmpeg-0.6.0-py3-none-win_amd64.whl` | 31,246,824 | `02fa47c83703c37df6bfe4896aab339013f62bf02c5ebf2dce6da56af04ffc0a` |
| gliner/gliner | `pytorch_model.bin` | 610,652,234 | `1d4e83e4e4ae4ae0a4fbc81a32ee6de480fb341650d73e808088bb2800312de4` |
| gliner/gliner | `gliner_config.json` | 477 | `PENDING` |
| gliner/gliner | `gliner-0.2.29-py3-none-any.whl` | 261,988 | `0c8cfb9f5c2daf7aff329ebb5ab1609052d7ad0aca0ef26049b9476b018b3fde` |
| gliner/gliner | `transformers-5.16.0-py3-none-any.whl` | 12,014,254 | `2b4adda8d99bb4c1b208da5ed967e2625ad449087827a750cb3b23ce4000b139` |
| gliner/gliner | `torch-2.14.1-cp312-cp312-win_amd64.whl` | 124,113,906 | `38bee9f2a2ccfc6898172a5075e4ba52522fbe143eeb099674fc67ab390e858d` |
| booknlp/booknlp-small | `entities_google_bert_uncased_L-4_H-256_A-4-v1.0.model` | 61,979,735 | `0620eed33c32c9b15dcbf3303bb3809b4f7ea29eef5311ba55db361a848cda5a` |
| booknlp/booknlp-small | `coref_google_bert_uncased_L-2_H-256_A-4-v1.0.model` | 40,831,851 | `eadd62a0b5d6f1d8908ee31c9949f863b731046e0e64df8c0c46bedf07a56116` |
| booknlp/booknlp-small | `speaker_google_bert_uncased_L-8_H-256_A-4-v1.0.1.model` | 57,586,985 | `1f530622219b8d6d90881f0d2eaeeec08ff6b73287d9eac66a1505ee0e6887e5` |
| booknlp/booknlp-small | `bert_uncased_L-4_H-256_A-4.config.json` | 383 | `61716a972c73e9cc1d6f1165e27e577c1f4012a3cc480e431f427a78d5071ece` |
| booknlp/booknlp-small | `bert_uncased_L-2_H-256_A-4.config.json` | 383 | `ba873b4875d069697fa5bab011ea9e3f63b7f8186701bdf5356b4d8622d8f5c1` |
| booknlp/booknlp-small | `bert_uncased_L-8_H-256_A-4.config.json` | 383 | `786e6029b075a1bb4af66edcb09fa8b1e7df095b931829ab684a3e55e5dcb5c0` |
| booknlp/booknlp-small | `bert_uncased.vocab.txt` | 231,508 | `07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3` |
| booknlp/booknlp-small | `booknlp-1.0.8-py3-none-any.whl` | 2,421,582 | `9eeaac4c1a2eb8d6b2256e5eefee26d0d0f294a46812ad7602ac469a9f8b02a8` |
| booknlp/booknlp-small | `torch-2.14.1-cp312-cp312-win_amd64.whl` | 124,113,906 | `38bee9f2a2ccfc6898172a5075e4ba52522fbe143eeb099674fc67ab390e858d` |
| booknlp/booknlp-small | `transformers-5.16.0-py3-none-any.whl` | 12,014,254 | `2b4adda8d99bb4c1b208da5ed967e2625ad449087827a750cb3b23ce4000b139` |
| booknlp/booknlp-small | `huggingface_hub-1.31.0-py3-none-any.whl` | 798,313 | `9dbb6a503cbe2494ea666695207e7262d410659e09134059deb83e5480864667` |
| booknlp/booknlp-small | `tokenizers-0.23.2-cp310-abi3-win_amd64.whl` | 2,863,236 | `2e96f5699d5249c9c64aa8412e044f727aae3a4098cf830f9901ec1afc361cde` |
| booknlp/booknlp-small | `safetensors-0.8.0-cp310-abi3-win_amd64.whl` | 355,540 | `096ec1a98435df7beb08853bb5aa9081a84f23d0adc67ed1a0a10550f608373f` |
| booknlp/booknlp-small | `regex-2026.9.29-cp312-cp312-win_amd64.whl` | 280,334 | `fdd88ed5e20b1bcdd234421e454962c971aa44b653bdb7f1ea9ef683e90fb649` |
| booknlp/booknlp-small | `filelock-4.2.1-py3-none-any.whl` | 162,455 | `7be2662e9e826b9bba28afc0f843a123280d799a2ea44bb5d35ccec67905ae44` |
| booknlp/booknlp-small | `fsspec-2026.7.0-py3-none-any.whl` | 206,583 | `b57ddbafedfaef7018c1ecab32aa200a9d7ca26b77965f64e48b70061249d279` |
| booknlp/booknlp-small | `sympy-1.14.0-py3-none-any.whl` | 6,299,353 | `e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5` |
| booknlp/booknlp-small | `mpmath-1.3.0-py3-none-any.whl` | 536,198 | `a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c` |
| booknlp/booknlp-small | `networkx-3.7-py3-none-any.whl` | 2,142,205 | `e3fd2c13a7814cee3746340d8d7f8598a67f16a58bf47fb7f8793fab6efca1b0` |
| booknlp/booknlp-small | `setuptools-80.10.2-py3-none-any.whl` | 1,064,234 | `95b30ddfb717250edb492926c92b5221f7ef3fbcc2b07579bcd4a27da21d0173` |
| booknlp/booknlp-big | `entities_google_bert_uncased_L-6_H-768_A-12-v1.0.model` | 311,346,637 | `c67654ac10b3b49371544ccaf8ed76d224f0d274d23f7f7ea09e74f173ddbe06` |
| booknlp/booknlp-big | `coref_google_bert_uncased_L-12_H-768_A-12-v1.0.model` | 446,250,373 | `9b301a05eff4573d34ad2672f310110b716801759470044b07d1979a0dbb50d8` |
| booknlp/booknlp-big | `speaker_google_bert_uncased_L-12_H-768_A-12-v1.0.1.model` | 438,641,129 | `5f3cdf9880f4f70b3aa0a88a5f4fea78aafaeff52b8f1a4a8712a47939bb1d0d` |
| booknlp/booknlp-big | `bert_uncased_L-6_H-768_A-12.config.json` | 384 | `701910395dc211b902e685089657ccb437ad4f8a7a6b3cae708f7030fc12ba73` |
| booknlp/booknlp-big | `bert_uncased_L-12_H-768_A-12.config.json` | 385 | `887ee20f3594eacdd08318d1c096014389dca4672e3041892916abd17a80c90c` |
| booknlp/booknlp-big | `bert_uncased.vocab.txt` | 231,508 | `07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3` |
| booknlp/booknlp-big | `booknlp-1.0.8-py3-none-any.whl` | 2,421,582 | `9eeaac4c1a2eb8d6b2256e5eefee26d0d0f294a46812ad7602ac469a9f8b02a8` |
| booknlp/booknlp-big | `torch-2.14.1-cp312-cp312-win_amd64.whl` | 124,113,906 | `38bee9f2a2ccfc6898172a5075e4ba52522fbe143eeb099674fc67ab390e858d` |
| booknlp/booknlp-big | `transformers-5.16.0-py3-none-any.whl` | 12,014,254 | `2b4adda8d99bb4c1b208da5ed967e2625ad449087827a750cb3b23ce4000b139` |
| booknlp/booknlp-big | `huggingface_hub-1.31.0-py3-none-any.whl` | 798,313 | `9dbb6a503cbe2494ea666695207e7262d410659e09134059deb83e5480864667` |
| booknlp/booknlp-big | `tokenizers-0.23.2-cp310-abi3-win_amd64.whl` | 2,863,236 | `2e96f5699d5249c9c64aa8412e044f727aae3a4098cf830f9901ec1afc361cde` |
| booknlp/booknlp-big | `safetensors-0.8.0-cp310-abi3-win_amd64.whl` | 355,540 | `096ec1a98435df7beb08853bb5aa9081a84f23d0adc67ed1a0a10550f608373f` |
| booknlp/booknlp-big | `regex-2026.9.29-cp312-cp312-win_amd64.whl` | 280,334 | `fdd88ed5e20b1bcdd234421e454962c971aa44b653bdb7f1ea9ef683e90fb649` |
| booknlp/booknlp-big | `filelock-4.2.1-py3-none-any.whl` | 162,455 | `7be2662e9e826b9bba28afc0f843a123280d799a2ea44bb5d35ccec67905ae44` |
| booknlp/booknlp-big | `fsspec-2026.7.0-py3-none-any.whl` | 206,583 | `b57ddbafedfaef7018c1ecab32aa200a9d7ca26b77965f64e48b70061249d279` |
| booknlp/booknlp-big | `sympy-1.14.0-py3-none-any.whl` | 6,299,353 | `e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5` |
| booknlp/booknlp-big | `mpmath-1.3.0-py3-none-any.whl` | 536,198 | `a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c` |
| booknlp/booknlp-big | `networkx-3.7-py3-none-any.whl` | 2,142,205 | `e3fd2c13a7814cee3746340d8d7f8598a67f16a58bf47fb7f8793fab6efca1b0` |
| booknlp/booknlp-big | `setuptools-80.10.2-py3-none-any.whl` | 1,064,234 | `95b30ddfb717250edb492926c92b5221f7ef3fbcc2b07579bcd4a27da21d0173` |

### Not in the catalogs

| Artifact | Source | Licence | Commercial use | Status | Note |
| --- | --- | --- | --- | --- | --- |
| Silero VAD (silero_vad_v6.onnx) | snakers4/silero-vad, inside the faster-whisper wheel | MIT | Yes | Ships inside two sidecars, listed in the notices | Package data, not a download. |
| moonshine-voice (the Python package itself, distinct from the now-catalogued models above) | PyPI moonshine-voice 0.1.5, github.com/moonshine-ai/moonshine | MIT | Yes | Not yet a project dependency: still pending pyproject.toml/uv.lock pinning and PyInstaller collection (phase 6) | The models it would load are catalogued above and provisioned through the hashed asset catalog, not the library's own downloader; the package's own freeze/bundling review happens in phase 6. |
| Other Piper voices | rhasspy/piper-voices | per voice | unclear until each model card is read | Unclear: none is in the catalog | Each voice is trained on its own dataset, and some datasets restrict commercial use. A voice is added only with its card read and a catalog entry that pins it. |
<!-- models:end -->

## Changing this document

The steps for adding or changing an artifact are in the header of `scripts/licenses/models.mjs`.
