# Provider ports

The things the app plugs in that are not a DAW (speech recognition, text to speech, pronunciation lookup, microphone capture, encoding and mastering) each sit behind a **port**: a small interface, a registry keyed by the name the setting stores, a capability descriptor per implementation, and a conformance suite every implementation passes. Call sites ask the registry by name and never compare names; guard tests in Go and Python fail the build otherwise. The decision is Provider ports; it applies the pattern of the DAW port ([The DAW port](daw-integration.md#the-daw-port), [DAW integration](daw-integration.md)) and shares its vocabulary.

Nothing about ports is visible to the narrator: setting keys, values and choice lists, sidecar flags, error texts and the contract goldens are what they were before the ports existed.

## The ports

| Port | Roles (modes) | Go registry (host) | Python protocol and registry | Rows today | Suites |
| --- | --- | --- | --- | --- | --- |
| Speech recognition, `AsrEngine` | `live` (the teleprompter), `batch` (transcript compare) | `internal/asrport`: `asrport.Engines` | `narration_common.ports.asr`: `AsrEngine`, `LiveTranscriber`, `BatchTranscriber`; `ENGINES` | `whisper` (live and batch, every platform, asset kind `whisper`), `moonshine` (live, Windows, asset kind `moonshine`, English only, runs only from a verified install: [Manuscript Teleprompter](manuscript-teleprompter.md)) | `asrporttest.Run`; `asr_conformance.run` |
| Text to speech, `TtsEngine` | none | `internal/ttsport`: `ttsport.Engines` | `narration_common.ports.tts`: `TtsEngine`, `Voice`; `ENGINES` | `piper` (asset kind `tts`) | `ttsporttest.Run`; `tts_conformance.run` |
| Pronunciation, `PronunciationSource` | `pronounce`; `browse` (the `BrowserLookup` role: a URL the narrator's browser opens, never fetched by the app) | `internal/pronunciationport`: `pronunciationport.Sources` | `narration_common.ports.pronunciation`: `PronunciationSource`, `BrowserLookup`; `SOURCES` (its `fallback_order()` is the build-time order) | `cmu`, `wiktextract`, `espeak` (all `pronounce`; no `browse` row yet) | `pronunciationporttest.Run`; `pronunciation_conformance.run` |
| Extraction, `ExtractionSource` | `extract` (the `Extractor` role: raw Story Bible suggestions) | `internal/extractionport`: `extractionport.Sources` | `narration_common.ports.extraction`: `ExtractionSource`, `Extractor`, `RawSuggestion`; `SOURCES` (its `fallback_order()` is the order a scan runs them in) | `rules`, `imported`, `local-model`, `gliner`, `booknlp` ([extraction sources](#extraction-sources)) | `extractionporttest.Run`; `extraction_conformance.run` |
| Capture, `CaptureBackend` | none; each row has a level (`Backend.Level()`) | `internal/captureport`: `captureport.Backends`, `captureport.For(platform)` | `narration_common.ports.capture`: `CaptureBackend`, `InputDevice`; `BACKENDS` | `dshow` (Windows, the default); `wasapi` (Windows, Experimental: the built-in recorder's engine, [capture_wasapi.py](../../src/studio/sidecars/manuscript-teleprompter/core/capture_wasapi.py)) | `captureporttest.Run`; `capture_conformance.run` |
| Encoding, `Encoder` and `Packager` | the formats a row handles (`mp3`, `m4b`, `flac`) | `internal/encodeport`: `encodeport.Encoders`, `encodeport.Packagers` | none (the host runs them) | `ffmpeg` (`Encoder`, `mp3`, `m4b` and `flac`, Windows, runs the catalogued FFmpeg build from a verified install, asset kind `encoder`: [encoder-assets.json](../../config/encoder-assets.json), [ffmpeg.go](../../src/studio/desktop/internal/encodeport/ffmpeg.go); `m4b`'s own chapters are embedded as a QuickTime/MP4 chapter track, read back by `encodeport.ReadM4BChapters`; `flac` is lossless, with no bitrate and none of `mp3`'s sample-rate restriction, checked back through its own STREAMINFO block); no `Packager` row yet (`internal/packager`'s book assembler works with none registered) | `encodeporttest.RunEncoder` (over the `ffmpeg` row against a fake FFmpeg), `RunPackager` |
| Mastering, `Mastering` | what a row masters from: `wav` (a rendered WAV), `daw_region` (the DAW renders a region through its own FX) | `internal/masteringport`: `masteringport.Rows`; a project's choice is `Mastering.provider`, set by `MasteringChooseProvider` | none (the host runs them) | `builtin` (`wav`, the default: `internal/mastering`'s chain, [Master & QC](../guides/using-the-app/master-and-qc.md), unchanged); `daw` (`daw_region`, Experimental: needs the DAW port's `render_with_fx` and `master_chain_read` and the narrator's approval for each render, and finds the launch's DAW through `masteringport.UseSession`, which the Master & QC flow sets; [The REAPER bridge and its test harness](reaper-bridge.md)); `audacity` (`wav`, Experimental: needs the DAW port's `macro_render`, its own row rather than `daw` because Audacity has no per-track FX chain or region to read or render from, [`macro_render`](../reference/daw/capabilities.md#macro_render)) | `masteringporttest.Run` (over every row; the mock row `masteringporttest.Fake`; DAW-rendering rows through `masteringporttest.FakeDAW` or, for the Audacity row, `masteringporttest.FakeAudacity`) |

The Python adapters that fill the registries live beside the code that used to call the engine directly, and register themselves when their sidecar imports them:

| Sidecar | Adapter module | Rows |
| --- | --- | --- |
| `manuscript-teleprompter` | `core/asr_adapters.py` (wrapping `live_asr.py`'s Whisper decoder and `moonshine_engine.py`) | `whisper`, `moonshine` (live) |
| `manuscript-teleprompter` | `core/capture_dshow.py` (wrapping `devices.py` and the microphone reader); `core/capture_wasapi.py` (PortAudio's WASAPI through `sounddevice`, plus `record()` over `narration_common.recording`) | `dshow`, `wasapi` |
| `transcript-compare` | `core/asr_batch.py` (the body of `compare.py`'s `transcribe()`) | `whisper` (batch) |
| `manuscript-guide` | `core/providers.py` | `piper`, `cmu`, `wiktextract`, `espeak` |

Each sidecar is its own process, so the teleprompter's live `whisper` row and transcript compare's batch `whisper` row never share a registry.

The one pronunciation source that fetches is not a row in either registry ([ADR 0002](../adr/0002-local-models-and-tools-come-first-so-the-app-is-free-to-use.md)): Merriam-Webster runs in the Go host, on the narrator's own key, behind its own Go-only port (`internal/pronunciationonline`: `Dictionary`, adapter `merriamwebster`, fake `pronunciationonlinetest`), so `FallbackOrder` and the sidecar's `capabilities` report never include it and the offline chain cannot reach the network. The `browse` role above still never fetches.

## Extraction sources

A Story Bible suggestion records the source it came from. The host's rows and Python's `extraction.BUILT_IN` descriptors both read this table in their tests, so the two cannot list different sources; the UI shows the label and icon beside each suggestion ([Studio Next extraction PRD](../prds/studio-next-extraction-and-analysis-tools.prd.md)).

| Source | Label | Icon | Runs | Assets | Available today |
| --- | --- | --- | --- | --- | --- |
| `rules` | Rules | `auto` | yes | none | built: `internal/extractionport/rules` runs the sidecar's `suggest --source rules` |
| `imported` | Imported file | `import` | no | none | built in the host only (`internal/extraction/importer`); a scan never runs it |
| `local-model` | Local model | `globe` | yes | none | never on this build: "No local model is installed." |
| `gliner` | GLiNER | `locate` | yes | `gliner` | adapter built, not installable yet; "GLiNER is not downloaded." until its asset is installed |
| `booknlp` | BookNLP | `dictionary` | yes | `booknlp-small`, `booknlp-big` | adapter built, not installable yet; "BookNLP is not downloaded." until either asset is installed |

- **Runs** says whether the narrator can start the source from the Story Bible; an imported file arrives through the import dialog instead. The first row is the default.
- **Assets** are the downloads a source runs from, any one of which is enough. `AvailableNow(name, installed)` checks them before asking the source itself.
- A source offers `Raw` values (Python `RawSuggestion`): a payload, a confidence or none, quotes with an optional paragraph hint, an optional `duplicate` flag and a note. It has no field for an offset, a status or a fingerprint: `internal/extraction` computes those from the manuscript. A source that gives no confidence (`Scored` false, Python `scored=False`) returns none for every item, and the suites fail a made-up number.
- `CheckExtract(name)` refuses an unregistered source or one without the `extract` role. An unavailable source refuses its extractor with its reason and starts nothing; an available one returns the context's error once a scan is cancelled.

## The shared vocabulary

- **Go:** `src/studio/desktop/internal/port` holds `Level` (unsupported, not yet available, experimental, supported), `Support`, `NotSupportedError` and the generic `Registry[P]` with `Entry[P]` (name, `Descriptor`, constructor). `Register` panics on a duplicate name or a missing label; `Lookup` returns a `*port.NotSupportedError` with a sentence for the narrator ("There is no speech engine called …"); `Names(platform)` lists the rows declared for a platform, default first. The DAW port uses the same `Level` and `Support`.
- **Python:** `src/studio/libs/python/narration_common/ports` mirrors them: `Level`, `NotSupportedError` (a `ValueError`, so older `except ValueError` callers still catch it), a frozen `Descriptor` (name, label, platforms, modes) and `Registry` (`register`, `lookup`, `names(platform)`). The Go `internal/port` test writes `tests/fixtures/contracts/port-levels.json`, and a Python test fails if the level names differ.
- **A descriptor** says what a row can do without starting it: platforms (empty means every platform), modes, and per port the asset kind its models or voices install from, its languages, or its browser host. A refusal for an undeclared mode comes from the descriptor (`refuse(mode)`), so every port words it the same way.
- Heavy imports (`faster_whisper`, `moonshine_voice`, `piper`, `av`) stay inside the adapters and load lazily, so importing `narration_common` needs no engine and no numpy.

## Selection

A call site asks the registry, by the name the setting stores, and gets an implementation or a `NotSupportedError`:

- **Host:** the Teleprompter's engine choices and its start check are `teleprompter.Engines`/`SupportsEngine`, which read `asrport`. `liveModelDir` picks the model catalog by the engine's asset kind (`asrport.AssetKind`), and the service refuses a session with no install directory for an engine that runs only from one (`asrport.NeedsInstalledModel`). The `Piper.tts_provider` setting's choices and the voice catalog payload read `ttsport`. `guide.Service.Pronounce` refuses an unregistered source before it starts the sidecar (`pronunciationport.CheckPronounce`).
- **Sidecars:** `live_asr.py` loads the `--engine` row of `ENGINES` with one `LiveRequest` whose `options` each adapter reads its own keys from, checks the arguments with the row's own `check`, and takes `--engine`'s choices from `ENGINES.names()`. `compare.py`'s `transcribe()` goes through the batch row. `manuscript_guide.py` takes `--source`'s choices, the build-time fallback order and each source's failure message from `SOURCES`, and gets Piper from the TTS registry. The microphone reader (`iter_microphone_chunks`, used by a session and the level meter) takes its chunks from the `dshow` row of `BACKENDS`; `--list-devices` still calls the adapter's lister in `devices.py` directly, and off Windows both give the same error text as before.

## Conformance

Every registered row passes its port's suite, and each registry's own test runs the suite over every row, so a new row cannot skip it (Liskov). The suites check the same things in both languages where both exist: a declared role returns a working object and an undeclared one raises `NotSupportedError` with a message; output timings are monotonic and non-negative and a closed segment never reopens; `close()` is safe twice; a TTS failure leaves nothing at the destination; a pronunciation miss is a `ValueError`, not a `NotSupportedError`, and a browser URL is https on the declared host whatever the name; a capture backend's listing never raises and a missing device raises instead of going quiet. Engines that cannot run in CI (Moonshine's Windows-only library, model files) run their suite against a fake model; the packaged smoke test (`src/studio/desktop/smoke.go`, `--capabilities --verify`) still checks the real library. Each suite's own tests register a test-only fake and show it passing with no other file edited.

## The guards

- **Go:** `src/studio/desktop/providerguard_test.go` parses every non-test Go file of the module and fails on `==`, `!=`, a `switch` case, or a composite literal listing two or more names, where a side is a provider name: a string literal of a registered name, or a constant that spells one (a port package's own constants, and any constant defined as one of them, such as `teleprompter.EngineWhisper`). Code inside `internal/*port` is exempt. An asset kind that happens to share a name (`installKindMoonshine`) is not a provider name. `smoke.go`'s `checkCapabilities` reads a verified row by map key (`parsed.Asr["moonshine"]`), never comparing a name, so `providerGuardExceptions` is empty.
- **Python:** `src/studio/libs/python/tests/test_provider_guard.py` reads the provider names from the adapters' own `descriptor = …Descriptor(…)` declarations and fails on a comparison (`==`, `!=`, `in`, `is`, a `match` case) with one, or a set, list, tuple or dict literal listing two or more, in any `src/studio/sidecars/*/core/` module that is not an adapter. Its two exceptions (`devices.py`, the dshow adapter's lister, where `"dshow"` is FFmpeg's log context; `locate.py`, a Whisper-only tool that refuses other engines) carry their reasons and fail when no longer needed.
- Both guards run their own fixtures to prove they fire.

The steps for adding an engine are in the docstring of `src/studio/libs/python/narration_common/ports/__init__.py`.

## Capabilities on the wire

`ProviderCapabilities()` (`src/studio/desktop/bindings_providers.go`) is a read-only binding that reports every row of the speech recognition, voice, pronunciation and capture registries: label, whether it is the default, platforms, modes, the asset kind with the installed count when its catalog is present, and a `support` in the DAW port's `Support` shape (supported on this platform, experimental for the capture port's `wasapi` row, or unsupported with a reason and a sentence for the narrator). It takes no input and changes nothing. Its schema is `src/studio/ui/src/api/schemas/providers.ts`, its goldens `tests/fixtures/contracts/provider-capabilities-{windows,darwin}.json`, and its mock `src/studio/ui/src/api/providersMock.ts` ([wire contracts](wire-contracts.md)). No screen reads it yet; a later feature may use it to explain a disabled choice (Moonshine off Windows) the way `DawCapabilities` explains a disabled DAW control. The empty encoder and packager registries are left off it until a row lands. The mastering rows have their own pair of bindings, `MasteringProviders()` and `MasteringChooseProvider(name)` (`src/studio/desktop/bindings_mastering.go`, schema `src/studio/ui/src/api/schemas/mastering.ts`, goldens `tests/fixtures/contracts/mastering-providers-*.json`, mock `src/studio/ui/src/api/masteringMock.ts`), because a project chooses one, which the read-only payload has no way to say.

## What is not a port

- **Measurement** keeps its concrete, in-process functions and the func-field seams on `Host` (`measureFile`, `diagnoseFile`): one implementation needs no registry. The mastering port keeps it that way on purpose: whichever chain masters a file, `masteringport.Judge` measures it with `internal/measure` and judges it with `internal/deliveryprofile`, and the conformance suite fails a row whose numbers are not exactly that. One judge means one set of numbers, whatever produced the file.
- **Importers** keep their strategy table keyed by extension (`internal/importer/formats.go`), which is already open for extension.
- **Asset downloads** keep `assetProvider` and `assetRegistry` ([The asset registry (implemented)](first-use-dependency-provisioning.md#the-asset-registry-implemented)). A provider's descriptor names the asset kind it needs; assets are downloads, not providers.
- **Remote providers:** none. No descriptor has a field for one, which holds [the roadmap's product boundary](../roadmap.md).

## Not built

| Item | Home |
| --- | --- |
| A `Packager` row (chapters and tags into a delivery file) | `internal/packager` assembles the book without one (`encodeport.Packagers` is empty); the row itself, likely wrapping `internal/chaptertags`, is a later swap |
| `BrowserLookup` rows (web pronunciation lookups the narrator's browser opens) | The `browse` mode is declared on `PronunciationSource` and no source takes it; the one-click lookup pages are built by `internal/pronunciationlookup` instead, and the app never fetches them |
| CoreAudio (macOS) capture | Not built: Windows is the only supported platform ([Supported platforms](../../README.md#supported-platforms)). A `coreaudio` row was built and removed; git history has it |

## Design choices

- One Go package per port (`asrport`, `ttsport`, `pronunciationport`, `captureport`, `encodeport`, `masteringport`, `extractionport`), like `dawport`, so parallel work touched disjoint folders.
- Go learns a Python engine's capability from a static descriptor plus the probes that exist, not from asking the sidecar.
- `Word` and `Hypothesis` moved into `narration_common.ports.asr`; `live_asr.py` re-exports them, so every existing import works.
- The one-choice `Piper.tts_provider` row stays on the Settings page, its choices from the registry.
- Python ports are `typing.Protocol`s with plain registries filled at import, not ABCs or entry-point plugins: existing classes and fakes fit as they are, and plugins would widen the trust boundary.

The trust-boundary side (the engine and pronunciation-source checks before a sidecar starts) is row 4a of the [threat model](threat-model.md).

The UI side of a port (the typed client, `usePort`, the fixtures and the contract kit every provider registers with) is in [UI state and the command journal](ui-state-and-journal.md). The extraction port's tiers and thresholds are in [extraction tiers](extraction-tiers.md).
