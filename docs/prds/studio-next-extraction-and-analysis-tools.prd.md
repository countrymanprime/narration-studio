# Studio Next Extraction and Analysis Tools: Suggestions, the 75% Rule, Optional Downloads and Bring-Your-Own LLM

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); "Story Bible extraction (owner direction)" and "Extraction tools: distribution decision (owner)" in `studio-next/research/repo-compare-decisions.md`; research in `studio-next/research/story-bible-extraction-research.md`, `studio-next/research/local-llm-research.md` and `studio-next/research/own-model-research.md`; the owner's rulings of 2026-10-11 (see Decisions).

**Builds on:** the delivered Story Bible build ([ADR 0020](../adr/0020-entity-extraction-precision-over-recall.md), [ADR 0042](../adr/0042-proofing-suggestions-derive-from-current-entities-and-skip-auto-extracted-needs-review.md), [ADR 0345](../adr/0345-a-story-bible-entity-keeps-its-id-by-name-overlap-and-dialogue-cues-are-precision-first-rules.md), `sidecars/manuscript-guide`, `apps/desktop/internal/spacy`), the asset registry ([ADR 0079](../adr/0079-every-downloadable-asset-is-listed-installed-verified-and-removed-through-one-registry-of-providers.md), [ADR 0081](../adr/0081-local-assets-is-a-settings-list-built-from-the-registry-whose-rows-own-their-download-verify-and-remove.md), [ADR 0077](../adr/0077-every-asset-install-is-one-job-with-real-bytes-a-second-start-joins-it-and-one-hook-follows-it.md), [ADR 0078](../adr/0078-asset-state-comes-from-the-manifest-an-asset-is-read-in-full-once-per-session-and-a-failed-download-resumes.md), [ADR 0136](../adr/0136-an-asset-may-keep-only-a-file-built-at-install-from-its-verified-archive.md)), [model provenance](../architecture/model-provenance.md), the provider ports ([ADR 0301](../adr/0301-providers-sit-behind-small-ports-with-a-registry-and-a-capability-descriptor.md)), the threat model and D72/D70 in [Owner standing rules](../operations/agent-train.md#owner-standing-rules). UI list and review behaviours are in [Script and Story Bible](studio-next-script-and-story-bible.prd.md).

**Status (2026-10-11):** draft; the owner's rulings of 2026-10-11 are applied. The Studio Next mock is the only spec for the suggestion list, import and consent screens. Licence and quality spikes come first; nothing is downloaded or bundled before the owner accepts the consent flow.

## Problem Statement

The owner wants the Story Bible to fill itself with varying success: anything under 75% confidence must be verified by the narrator, 75% and above is accepted but reviewable, nothing is invented (every claim carries a verbatim quote), no hosted LLM is required, no author data leaves the machine, and a narrator can run the manuscript through any LLM they choose and import the result. Optional tools (GLiNER and BookNLP) are downloaded only after a consent screen, never bundled. The real app extracts with rules and spaCy and has no suggestion layer, no confidence rule, no import and no analysis-tool flow.

## Evidence

- **Mock.** `studio-next/src/domain/extraction.ts` (`ExtractionSuggestion {kind, payload, entryId, evidence[{paragraphId,start,end,text}], confidence, source, status, fp}`), `studio-next/src/config/extraction.ts` (`VERIFY_BELOW = 0.75`, source registry), `studio-next/src/selectors/extraction.ts` (`reasonsOf`, `autoStatus`), `studio-next/src/state/extractionCore.ts` (pure ingest, settle, accept, reject, review), `studio-next/src/format/evidence.ts` (`verifyEvidence`, `fingerprint`), `studio-next/src/format/extractionImport.ts` (CSV and JSON parse with per-row errors), `studio-next/src/config/extractionPrompt.ts`, `studio-next/src/providers/extraction.ts`, `studio-next/src/providers/components.ts`, `studio-next/src/domain/components.ts`, `studio-next/src/pages/bible/{Suggested,ImportDialog,startScan}.tsx`, `studio-next/src/pages/settings/AnalysisTools.tsx`, `studio-next/src/ui/ComponentConsent.tsx`. Tests: `studio-next/tests/extraction.test.tsx`, `studio-next/tests/analysis-tools.test.tsx`.
- **Research.** Tier order from the owner: rules baseline, then optional download (GLiNER and BookNLP), then a local LLM later, then bring-your-own import throughout. The local-LLM note measured a trial on one public-domain book with placeholder calibration weights (its section 9); BookNLP's licence was not treated as a blocker by the owner because the tool only identifies character entries.
- **Repo.** Rules and spaCy extraction in `sidecars/manuscript-guide/core/manuscript_guide.py` ([ADR 0020](../adr/0020-entity-extraction-precision-over-recall.md) precision over recall, "Needs Review" entities); the asset registry installs, verifies and removes catalogued assets as one job with real bytes ([ADR 0077](../adr/0077-every-asset-install-is-one-job-with-real-bytes-a-second-start-joins-it-and-one-hook-follows-it.md)); `apps/desktop/internal/assets/` and `assetregistry.go`; the language-model asset ([ADR 0080](../adr/0080-the-story-bible-language-model-is-a-catalog-asset-unpacked-at-install-and-the-build-asks-before-it-downloads.md)); threat-model rows for downloads.

## Proposed Solution

1. **A suggestion layer.** `ExtractionSuggestion` as a wire contract (Go store beside the Story Bible file, Zod schema, golden). Kinds: entry, alias, property, relationship, claim (talk, act, know), speaker. Status: `accepted-auto`, `needs-verification`, `accepted`, `rejected`.
2. **The rule in one place** (DQ-10; `reasonsOf` and `autoStatus` in `studio-next/src/selectors/extraction.ts`). Needs verification when confidence is null or under 0.75, the quote is not found in the text, a property, claim or speaker has no quote, or the entry is not in the Story Bible. Otherwise accepted-auto: applied and flagged Review, still listed under Suggested. A rejected suggestion stays as a tombstone so it is not offered again (fingerprint).
3. **Evidence verification** in Go (`verifyEvidence`: curly and straight quotes match; offsets computed), so a quote that is not in the text is never accepted.
4. **Sources as providers.** `ExtractionProvider` port with registered sources: rules (existing sidecar), imported, GLiNER, BookNLP, local model (unavailable with a reason). Each source has its own label and icon in the UI.
5. **Import** of a CSV or a JSON (`storybible-import` v1) with per-row errors and a preview worked out on a copy (add, merge, skip); a copyable prompt template filled from the format so a narrator can use any LLM.
6. **Analysis tools as registry assets.** GLiNER, BookNLP small and large and the local language model are catalogue entries of the existing asset registry, installed only after a consent screen (what, size, source host, licence note), with progress, cancel and remove; the first-scan prompt offers basic scan, download the recommended pair, or import from a file, with "Don't ask again" in preferences.
7. **Sidecar adapters** for GLiNER and BookNLP behind the extraction port, with conformance tests against fakes; real models run only in the packaged smoke test.

## Key Hypothesis

If every suggestion carries a verbatim quote and a stated confidence, and everything under 75% is verified by the narrator, a weak extractor costs the narrator review time but never puts an invented fact in the Story Bible. We are wrong if the calibration on real manuscripts shows confident wrong entries above a few percent; the 75% value is configured in one place, so a calibration result changes one value, not the rule.

## What We're NOT Building

- A hosted or remote LLM, by default or at all in this series; the app never sends manuscript text out (D72). A narrator may use a hosted LLM themselves and import the file.
- A bundled model or tool; an installer that includes GLiNER, BookNLP or an LLM.
- Mining user data or training on it; "roll our own model" (research only, `studio-next/research/own-model-research.md`).
- Automatic acceptance of properties, claims or speakers without a quote.
- Extraction of talk, act and know fields beyond what a source provides (parsing them needs an LLM; later).
- LLM-parsed properties by default (maybe list).

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Suggestions with a verified quote | 100% of accepted ones | Host test; `verifyEvidence` property tests |
| Under-75% items auto-applied | 0 | Rule tests ported from `studio-next/tests/extraction.test.tsx` |
| Bytes downloaded without consent | 0 | Asset registry tests; consent test |
| Import errors | Reported per row, none silent | Ported import tests |
| Calibration | A table of confidence versus correctness on at least two real or public-domain books before any default changes | `docs/research/` note |

## Decisions

Owner rulings of 2026-10-11; none is open.

| Id | Ruling | Consequence here |
| --- | --- | --- |
| DQ-10 | The mock's rule is the spec: suggestions at 75% or more are applied and flagged Review; under 75% need verification | ADR 0020 and ADR 0042 are superseded to that extent; a kind is applied only if it also has a quote (property, claim, speaker) and its entry exists, as the mock does |
| SN0-Q1 / DQ-1 | Studio Next is the spec | The Suggested list, import dialog and consent screen follow `studio-next/src/pages/bible/` and `studio-next/src/ui/ComponentConsent.tsx` |
| SN0-Q2 / DQ-2 | Replace, one PR, no flag | The suggestion UI lands as components with no route and appears with the Story Bible swap (SNB-8) |
| SNX-Q2 | The mock defines the import's parse rules and preview; the host runs them with size and row limits, because the file is untrusted (default taken, standing instruction) | The UI shows the preview the host returns |
| SNX-Q3 | BookNLP's weight licence is not a blocker (owner); the spike records the licence and the provenance row | SNX-1b |
| SNX-Q4 | GLiNER and BookNLP run in the existing `manuscript-guide` sidecar's environment as separate optional wheels fetched through the registry (default taken) | SNX-7a, SNX-7b |
| SNX-Q5 | With nothing installed the rules baseline runs and its suggestions carry source "rules" (default taken) | SNX-3 |
| SNX-Q6 | Disk and memory limits are provisional until measured; the consent screen shows the free-disk check as the mock does (`HOST_FREE_DISK_MB`) | SNX-6 |

## Users & Context

A narrator opening a manuscript for the first time, a narrator who prefers their own LLM, and the owner who accepts only auditable output. Privacy: local only, D72.

## Solution Detail

### Acceptance criteria tied to the mock

| Behaviour | Mock reference | Acceptance |
| --- | --- | --- |
| 75% rule | `studio-next/src/selectors/extraction.ts` | At 0.74 the item needs verification and blocks Mark reviewed; at 0.75 it is applied and flagged |
| Quote must exist | `studio-next/src/format/evidence.ts` | A quote not found yields "quote not found" and needs verification |
| Reject is remembered | `studio-next/src/state/extractionCore.ts` | A rejected suggestion offered again is dropped by fingerprint |
| Import preview | `studio-next/src/selectors/extractionImport.ts`, `studio-next/src/pages/bible/ImportDialog.tsx` | Rows about unknown entries are errors; add, merge and skip are previewed |
| Prompt | `studio-next/src/config/extractionPrompt.ts`, `studio-next/src/format/extractionPrompt.ts` | The template contains the format and the rules; copy works |
| Consent | `studio-next/src/ui/ComponentConsent.tsx`, `studio-next/tests/analysis-tools.test.tsx` | Download starts only after Download; Cancel stops it; failures name the reason (blocked, low disk) |
| First scan | `studio-next/src/pages/bible/startScan.tsx` | Basic scan, download the pair, or import; "Don't ask again" persists |

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth; old ADRs stay in force for unmigrated code ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0020](../adr/0020-entity-extraction-precision-over-recall.md), [ADR 0042](../adr/0042-proofing-suggestions-derive-from-current-entities-and-skip-auto-extracted-needs-review.md) | SUPERSEDE (DQ-10) | Applied and flagged Review at 75% or more; needs verification under 75% |
| [ADR 0345](../adr/0345-a-story-bible-entity-keeps-its-id-by-name-overlap-and-dialogue-cues-are-precision-first-rules.md) | KEEP | Ids and cues |
| [ADR 0079](../adr/0079-every-downloadable-asset-is-listed-installed-verified-and-removed-through-one-registry-of-providers.md), [ADR 0081](../adr/0081-local-assets-is-a-settings-list-built-from-the-registry-whose-rows-own-their-download-verify-and-remove.md), [ADR 0077](../adr/0077-every-asset-install-is-one-job-with-real-bytes-a-second-start-joins-it-and-one-hook-follows-it.md), [ADR 0078](../adr/0078-asset-state-comes-from-the-manifest-an-asset-is-read-in-full-once-per-session-and-a-failed-download-resumes.md), [ADR 0136](../adr/0136-an-asset-may-keep-only-a-file-built-at-install-from-its-verified-archive.md) | EXTEND | Tools are registry assets; no second installer |
| [ADR 0080](../adr/0080-the-story-bible-language-model-is-a-catalog-asset-unpacked-at-install-and-the-build-asks-before-it-downloads.md) | EXTEND | The language model asset becomes a tier |
| [ADR 0301](../adr/0301-providers-sit-behind-small-ports-with-a-registry-and-a-capability-descriptor.md) | EXTEND | Extraction becomes a provider port |
| [ADR 0032](../adr/0032-analyzers-report-findings-and-never-change-audio-or-manuscript-on-their-own.md) | KEEP | Analysis is local and suggests; the narrator accepts |
| [ADR 0015](../adr/0015-real-progress-only.md) | KEEP | Real progress (the mock's paced fake progress is a mock adapter only) |

## Technical Approach

**Interfaces.** Go: `extractionport` with `Extractor` roles and a registry keyed like the other ports ([ADR 0301](../adr/0301-providers-sit-behind-small-ports-with-a-registry-and-a-capability-descriptor.md)); `internal/guide` stores suggestions; Python `libs/python/narration_common/ports` mirrors the level vocabulary. UI: `ExtractionPort` (`sources()`, `scan()`, `accept()`, `reject()`, `review()`, `import(plan)`) and `ComponentsPort` that wraps the asset bindings (`specs()`, `install()`, `remove()`) rather than adding a second installer.

**Contracts.** `extractionSuggestionSchema`, `extractionImportPlanSchema`, `componentSpecSchema` (mapped onto the asset catalogue schema; no parallel type), goldens from Go tests, `wireContracts.test.ts` rows, mocks pass; `hostAPIVersion` bumps; JSON format `storybible-import` v1 documented under `docs/architecture/`.

**Architecture.** Suggestions are data beside the Story Bible; accept applies through the existing Story Bible commands so merge, lock and review rules ([ADR 0007](../adr/0007-story-bible-locked-entry-enforcement.md)) still hold; a suggestion never edits a locked entry.

**Test plan.** Port the mock's rule, evidence, import and prompt tests to Go and TS; fuzz the importer (deterministic, [ADR 0044](../adr/0044-property-and-fuzz-tests-are-deterministic-in-the-gate.md)); conformance suite per extraction source against fakes; asset-registry tests for the new rows; visual rows (Suggested list, import dialog, consent, Settings > analysis tools, first-scan prompt) at all viewports; aria for the dialogs.

**Rollout.** Rules tier first (visible only as a Suggested list); tools after the consent flow; each tool enters the catalogue "not yet available" until its adapter and licence row exist.

**ADRs.** A14 extraction suggestions and tiers; a model-provenance row per tool ([ADR 0136](../adr/0136-an-asset-may-keep-only-a-file-built-at-install-from-its-verified-archive.md) style); consent flow if it differs from the existing asset prompts.

**Trust boundaries.** Downloads (host, hash, size, verified archive), a file the app opens (import), sidecar arguments (tool selection), and the threat-model "what the app sends off the machine" statement (unchanged: nothing is sent): rows re-read and updated in the slices that add each ([threat model](../architecture/threat-model.md)).

**Risks.** Licence of weights; model quality on fiction beyond the trial; memory on a laptop; a long scan blocking the UI (it is a job with cancel, [ADR 0076](../adr/0076-a-host-job-ends-with-one-job-ended-event-the-app-announces-it-and-the-story-bible-rebuild-may-continue-in-the-background.md)); a confident wrong entry (mitigation: the calibration table and the single threshold).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Spikes | Licences and provenance for GLiNER and BookNLP; quality on fixtures; calibration protocol | in progress (calibration protocol SN-X13 [#1143](https://github.com/countrymanprime/narration-utils/issues/1143), [note](../research/studio-next-extraction-calibration-protocol.md)) | 2 | SN0-1 | 1.2 | - |
| 2 | ADR and schema | A14; suggestion contract, store, rule, evidence verification | in progress (rule, evidence check and fingerprint SNX-2a [#1080](https://github.com/countrymanprime/narration-utils/issues/1080); store, schema, golden and binding SNX-2b) | 1 | SN0-1 | 1.5 | - |
| 3 | Rules tier into suggestions | Sidecar adapter emits suggestions | in progress (extraction port, Go registry and Python mirror SNX-3a [#1189](https://github.com/countrymanprime/narration-utils/issues/1189); rules adapter and the scan job to come) | 4 | 2 | 1.0 | - |
| 4 | Suggested UI | Rows, chips, accept, reject, review, needs-verification | pending | 3 | 2, SNB-3 | 1.3 | - |
| 5 | Import and prompt | Host parser, preview, UI dialog, prompt template | in progress (parser, plan and prompt SNX-5a [#1086](https://github.com/countrymanprime/narration-utils/issues/1086); binding, dialog and threat-model row SNX-5b) | 4 | 2 | 1.2 | - |
| 6 | Consent and registry rows | Consent screen, assets for the tools, Settings section, first-scan prompt | pending | 4 | 1 | 1.2 | - |
| 7 | Tool adapters | GLiNER, BookNLP sidecar adapters, conformance | pending | - | 1, 6 | 1.3 | - |
| 8 | Evaluation | Harness, calibration table, default review | pending | - | 7 | 0.5 | - |
| 9 | Local LLM tier (Could) | Spike only; no default | pending | - | 8 | 0.3 | - |

### Phase Details

- **Phase 1.** Output: a research note per tool with licence text, source host, size, hash and a provenance row proposal; no download in CI.
- **Phase 5.** The importer is untrusted input: size cap, row cap, encoding checks, formula-guard on any later CSV export; the preview is computed by the same ingest code as accept.
- **Phase 8.** The 75% threshold stays configured in one place (`config`), so a calibration result changes one value.

### Parallelism Notes

1 and 2 start together; 3 to 6 are independent after 2 (6 needs only 1); 7 needs both the spikes and the consent flow.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 2 | `internal/guide/*`, schemas, goldens, `hostAPIVersion` | Story Bible slices |
| 3 | `sidecars/manuscript-guide/core/*` | [Script and Story Bible](studio-next-script-and-story-bible.prd.md) pronunciation slice (same file) |
| 4 | `components/storybible/Suggested*` | Story Bible UI slices |
| 6 | `internal/assets`, `assetproviders.go`, `components/settings/` | Asset registry streams; Settings rows (append-only) |
| 7 | new sidecar packages, `scripts/release/` | Release pipeline (serial; `.github/workflows` untouched) |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNX-1a | Spike GLiNER | SN0-1 | yes | Research note |
| SNX-1b | Spike BookNLP | SN0-1 | yes | Research note |
| SNX-1c | Calibration protocol ([note](../research/studio-next-extraction-calibration-protocol.md)) | SN0-1 | yes | Research note |
| SNX-2 | ADR, schema, store, rule, evidence | SN0-1 | yes | Go tests; golden; wire row |
| SNX-3 | Rules tier adapter | SNX-2 | yes | Sidecar tests; conformance |
| SNX-3a | Extraction provider port: Go registry, Python mirror, conformance suites | SNX-2 | yes | Go and pytest conformance; docs table both read |
| SNX-4 | Suggested UI | SNX-2, SNB-3 | yes | Ported tests; visual; aria |
| SNX-5 | Import and prompt | SNX-2 | yes | Fuzz; ported tests; threat model |
| SNX-6 | Consent and registry rows | SNX-1a | yes | Registry tests; consent test; visual |
| SNX-7a | GLiNER adapter | SNX-6, SNX-1a | yes | Conformance with fake model |
| SNX-7b | BookNLP adapter | SNX-6, SNX-1b | yes | Conformance with fake model |
| SNX-8 | Evaluation harness | SNX-7a, SNX-7b | no | Calibration note |
| SNX-9 | Local LLM spike (Could) | SNX-8 | yes | Research note |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Tier order (owner) | Rules, optional download, local LLM later, import throughout | Hosted LLM | Local only (D72) |
| Not bundled (owner) | Downloads on consent | Installer bundle | Size and licence |
| One threshold (owner) | 0.75 in one config | Per source | Calibration changes one value |
| Registry reuse (proposed) | Tools are assets | A component installer | [ADR 0079](../adr/0079-every-downloadable-asset-is-listed-installed-verified-and-removed-through-one-registry-of-providers.md) |

## Research Summary

Read: the mock's extraction, components and import files; the owner's extraction rulings; headings of the three research notes; the asset registry and `manuscript_guide.py` function names; ADRs 0020, 0042, 0079, 0136. Not done: no model was downloaded or run; quality figures in the research are from a one-book trial.

## Visual Spec

Mock states: Story Bible with Suggested rows (`studio-next/src/pages/bible/Suggested.tsx`), import dialog, consent screen, Settings > Story Bible analysis (`studio-next/src/pages/settings/AnalysisTools.tsx`), first-scan prompt.
