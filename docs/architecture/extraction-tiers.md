# Extraction tiers

Story Bible extraction turns a manuscript into suggestions: new entries, aliases, properties, relationships, claims and speakers. Each suggestion comes from one **source**, carries the quote that backs it, and gets a status from one rule. This page describes the tiers the sources fall into, the rule, the evidence check and where each runs. Nothing here writes the Story Bible without that rule and the lock rule of [manuscript_guide.py](../../src/studio/sidecars/manuscript-guide/core/manuscript_guide.py).

## Tiers

| Tier | Source (`internal/extractionport`) | Runs in | Download | State on this branch |
| --- | --- | --- | --- | --- |
| Rules baseline | `Rules` (`rules`) | Manuscript Guide sidecar, `suggest --source rules` (`src/studio/sidecars/manuscript-guide/core/extraction_rules.py`) | none | Built. Emits `entry`, `alias` and `speaker` only; properties, relationships and claims need a language model. Always part of a scan. |
| Optional download: names | `Gliner` (`gliner`) | Same sidecar, `suggest --source gliner --install <folder>` (`core/extraction_gliner.py`) | asset `gliner` | Adapter built. Row not installable: its `pending` note in `config/analysis-assets.json` lists files without a pinned hash. Emits `entry` only. |
| Optional download: characters | `BookNLP` (`booknlp`) | Same sidecar, `suggest --source booknlp --install <folder>` (`core/extraction_booknlp.py`) | assets `booknlp-small`, `booknlp-big` | Adapter built. Rows not installable, same reason. Emits `entry`, `alias` (flagged `duplicate`), `speaker` and a `Gender` `property`. |
| Local language model | `LocalModel` (`local-model`) | nowhere | none in the registry; catalogue row `local-llm` | Not built. The registry row has no extractor and the reason `No local model is installed.`; the catalogue row has no files and an `unavailable` sentence. |
| Bring-your-own import | `Imported` (`imported`) | Go host only (`src/studio/desktop/internal/extraction/importer`, `src/studio/desktop/bindings_extraction_import.go`) | none | Built. Not started from a scan (`Runs()` is false); it arrives through the import dialog. |

The registry order above is the scan order. `NewRegistry` in `src/studio/desktop/internal/extractionport/extractionport.go` registers the five rows, and `Host.extractionRegistry` in `src/studio/desktop/extraction_job.go` swaps in the `rules`, `gliner` and `booknlp` adapters (`src/studio/desktop/internal/extractionport/{rules,gliner,booknlp}`). Python mirrors the rows in `src/studio/libs/python/narration_common/ports/extraction.py` (`BUILT_IN`). The port itself, its suites and the row table are in [provider ports](provider-ports.md#extraction-sources); this page does not repeat them.

`extractionScanOrder` runs the rules first, then each requested source that `RunnableNamesIn` lists, once and in registry order. It refuses an id that is not a source a scan can run. A source that is not installed answers `AvailableNow` with a reason (`GLiNER is not downloaded.`) and starts nothing.

## The 75% rule

The 75% rule sets the rule. It is written once, in `src/studio/desktop/internal/extraction/rule.go`.

| Piece | Identifier | Behaviour |
| --- | --- | --- |
| Threshold | `VerifyBelow = 0.75` | The only place the number appears. |
| Confident | `Confident(c *float64)` | `c != nil && *c >= VerifyBelow`. A nil confidence is never confident. |
| Reasons | `ReasonsOf(Candidate)` | Returns reasons in a fixed order: confidence, evidence, entry. Empty means it can be accepted on its own. |
| Status | `AutoStatus(Candidate)` | `StatusNeedsVerification` exactly when `ReasonsOf` is non-empty, otherwise `StatusAcceptedAuto`. |

The reasons are `ReasonNoConfidence`, `ReasonLowConfidence`, `ReasonQuoteNotFound`, `ReasonNoEvidence` and `ReasonUnknownEntry`. The evidence reasons depend on the kind: `NeedsQuote` is true for `property`, `claim` and `speaker`; `NeedsEntry` is true for `alias`, `property`, `relationship` and `claim`. A quote that was offered but not found gives `ReasonQuoteNotFound` for every kind, so such a suggestion is never accepted automatically whatever its confidence.

The four statuses are `accepted-auto`, `needs-verification`, `accepted` and `rejected` (`Status` constants in the same file).

- `accepted-auto` is applied to the Story Bible and flagged Review. It stays listed until the narrator looks at it (`Applier.Review` makes it the narrator's and clears the flag).
- `needs-verification` is stored and not applied. `Applier.Accept` applies it, optionally with edited text.
- `rejected` is a tombstone in the store: the suggestion's `Fingerprint` is remembered, so the same thing is not offered again.

Enforced by `TestThresholdLivesInOnePlace` (no other non-test file in the package holds the literal), `TestExactlyThreeQuartersIsAcceptedAuto`, `TestReasonsFollowTheMock` and `TestStatusFollowsReasons` in `src/studio/desktop/internal/extraction/rule_test.go`. The import planner and the store both take their status from `AutoStatus` (`TestStatusFollowsTheSharedRule` in `importer/importer_test.go`, `TestStoredStatusFollowsTheRuleAtIngest` in `store/store_test.go`). Per [Verification and code-health tooling](../operations/verification-tooling.md), a rule that can be checked by reading code is a test that names its ADR.

The 75% rule supersedes [Story Bible entity-extraction accuracy](story-bible-entity-accuracy.md) and [service.go](../../src/studio/desktop/internal/guide/service.go) where it reaches; the Story Bible build keeps writing entries as `docs/architecture/story-bible-entity-accuracy.md` describes, and the rules source proposes only what the Story Bible does not already say.

## The evidence check

`VerifyEvidence(paragraphs, quote, hint)` in `src/studio/desktop/internal/extraction/evidence.go` finds a quote in the manuscript and returns an `Evidence` (paragraph id, `Start`, `End`, `Text`) and `ok`.

| Rule | Where |
| --- | --- |
| Search order: the paragraph the `QuoteHint` names, then the rest of its chapter, then the whole book | `VerifyEvidence` |
| Typographic quotes, apostrophes, non-breaking and thin spaces match their plain forms | `foldRune`, `fold` |
| Offsets are UTF-16 code units into the paragraph text, the unit the UI and the prep-markup spans use | `units`, `indexUnits` |
| Offsets and `Text` come from the manuscript, never from a source | `VerifyEvidence` |
| An empty or unfound quote returns `ok == false`, so the claim needs verification | `ReasonsOf` |

Enforced by `TestVerifyFindsAQuoteAndComputesOffsets`, `TestOffsetsAreUTF16CodeUnits`, `TestQuotesFoldTypography`, `TestSearchOrder` and `TestEmptyQuoteIsNotFound` in `evidence_test.go`, and `TestPropertyFoldKeepsEveryOffset` and `TestPropertyNoPanicOnInvalidText` in `properties_test.go`.

The check runs in the host for every tier. `store.Service.Ingest` (`internal/extraction/store/store.go`) calls it for each quote a source offers. The rules adapter (`internal/extractionport/rules/rules.go`) also drops a sidecar line whose quote is not in the paragraph it names. A source has no field for an offset, a status or a fingerprint (`extractionport.Raw`), so none can set them.

`Fingerprint(Payload)` in `fingerprint.go` names what a suggestion is about: the kind, then the normalised fields for that kind. Two spellings of the same thing give one fingerprint, which is how a repeat offer or a rejected suggestion is recognised (`TestFingerprintRecognisesTheSameThing`, `fingerprint_test.go`).

## Bring-your-own import

A narrator can have any tool or LLM write a Story Bible as a CSV or JSON file in the `storybible-import` v1 format and import it. The format, its columns and its examples are in [the Story Bible import format reference](../reference/storybible-import-format.md); this page does not copy them.

| Step | Code |
| --- | --- |
| The page reads the file and sends its text; no binding takes a path | `ExtractionImportPreview`, `ExtractionImportCommit`, `ExtractionImportUndo` in `src/studio/desktop/bindings_extraction_import.go` |
| Parse, with caps `MaxBytes` (2 MiB), `MaxRows` (5000), `MaxFieldBytes` (8 KiB) | `importer.Parse` (`importer/format.go`) |
| Plan against the Story Bible and the stored suggestions: add, merge or skip | `importer.PlanImport` (`importer/plan.go`) |
| Store the rows as suggestions from `store.SourceImported`, each through the 75% rule and the evidence check | `ExtractionImportCommit`, `store.Service.Ingest` |
| Copy-ready prompt for an LLM, per format | `importer.Prompt`, `ExtractionImportPrompt` |

The file is untrusted. The `importer` package imports no `os`, `io/fs` or network package, and every cell is stored as text: `TestNoFormulaOrPathIsEverFollowed`, `TestLimitsAreEnforced` and the import check in `importer_test.go`, `TestFuzzSeededMutationsAndRandomBytes` in `fuzz_test.go`. `ExtractionImportUndo` refuses an id whose suggestion did not come from an import. Threat-model rows 1i and 1j in [the threat model](threat-model.md) cover the analysis tools and the sidecar that runs them.

## Storing and applying

| Package | Does | Does not |
| --- | --- | --- |
| `internal/extraction/store` | Keeps every suggestion in `<project>/ManuscriptGuide/suggestions.json`, beside the Story Bible ([Data files](../reference/data-files.md), Proposed). Skips a suggestion already stored or rejected. | Change the Story Bible. A decision here changes a status only. |
| `internal/extraction/apply` | Puts accepted suggestions into the Story Bible through the `Bible` interface and takes them back (`Accept`, `Reject`, `Review`, `Withdraw`, `Settle`). Idempotent. | Write `manuscript_guide.json` itself, or touch a locked entry (`TestLockedEntryIsNeverEdited`, [manuscript_guide.py](../../src/studio/sidecars/manuscript-guide/core/manuscript_guide.py)). |

The Wails bindings that expose both are in `src/studio/desktop/bindings_extraction.go` (`ExtractionList`, `ExtractionAccept`, `ExtractionReject`, `ExtractionReview`, `ExtractionReopen`). The scan is `ExtractionSources`, `ExtractionScan`, `ExtractionScanState` and `ExtractionScanCancel` in `bindings_extraction_scan.go`, run as a host job by `src/studio/desktop/extraction_job.go` ([Job-end events](interaction-feedback.md#job-end-events)). Their payload shapes are pinned by `bindings_extraction_scan_contract_test.go` and `bindings_extraction_import_contract_test.go`; the walk for changing one is in [wire contracts](wire-contracts.md).

## What runs where

| Work | Process | Code |
| --- | --- | --- |
| Rules, GLiNER and BookNLP inference | Manuscript Guide sidecar (Python), the `suggest` command; prints one JSON line per suggestion and writes nothing | `src/studio/sidecars/manuscript-guide/core/manuscript_guide.py` (`suggest`), `extraction_*.py` |
| Starting the sidecar, checking its output (byte caps per output, line and field; exact fields; allowed kinds), cancelling it | Go host | `internal/extractionport/{rules,gliner,booknlp}` through the process supervisor |
| Evidence check, offsets, fingerprint, status | Go host | `internal/extraction` |
| Store, apply, import | Go host | `internal/extraction/{store,apply,importer}` |
| Install state of a tool | Go host | `Host.analysisToolInstall` reads the asset registry; a tool counts only when installed, verified and pinned |

The sidecar's Python wheels and weights are loaded only from the registry's install folder, passed as `--install`; the freeze never carries `gliner`, `transformers`, `torch` or `booknlp` ([CI and releases](../operations/ci-and-releases.md), Proposed). The adapters set Hugging Face offline and a missing or damaged install is a sentence for the narrator. The packaged smoke test reports each install's version through `run_self_check` (`gliner_install`, `booknlp_installs`). The sidecar tests are `src/studio/sidecars/manuscript-guide/tests/test_extraction_rules.py`, `test_extraction_gliner.py` and `test_extraction_booknlp.py`; the rules adapter's line format is pinned by `internal/extractionport/rules/testdata/suggest-lines.json`.

## Consent for each download

The downloads are catalogue entries of the one asset registry ([The asset registry (implemented)](first-use-dependency-provisioning.md#the-asset-registry-implemented)), not a second installer. The rules, the consent facts, the unavailable-until-pinned check and the failure sentences are in [first-use dependency provisioning, Story Bible analysis tools](first-use-dependency-provisioning.md#the-story-bible-analysis-tools); the install, verify and remove controls are in [the models and downloads list](first-use-dependency-provisioning.md#the-models-and-downloads-list-implemented). The tools and their catalogue rows are in `config/analysis-assets.json`.

| Tool | Asset id | Consent UI | State |
| --- | --- | --- | --- |
| GLiNER | `gliner` | `src/studio/ui/src/components/settings/analysis/ConsentDialog.tsx` | Refused at install while the row has a `pending` note |
| BookNLP small, large | `booknlp-small`, `booknlp-big` | same | Refused, same reason |
| Local language model | `local-llm` | none; no files | Not built; the row carries an `unavailable` sentence |

Nothing downloads without the narrator's confirmation, and with nothing installed the scan runs the rules.
