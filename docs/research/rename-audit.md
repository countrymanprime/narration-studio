# Rename audit: names that no longer fit

Researched 2026-10-12 for the owner, on `main` at `5ee0877`. Tracking issue: [#1489](https://github.com/countrymanprime/narration-utils/issues/1489). The counts are for that commit and are not kept current.

**Question.** Which names in the repo now describe something other than what the code does? For each, what would a rename cost, and when should it run?

**Method.**
- **Scope.** Every name in these classes:
  - the three sidecars, with their modes and entry points;
  - the 90 `apps/desktop/internal/*` packages;
  - the `apps/ui/src/components/*` folders and the 57 primitives, plus the user-visible labels;
  - the 24 REAPER Lua files and 43 bridge commands;
  - `scripts/*`, the 14 Nx projects, the `docs/` file names and titles;
  - every row of [data files](../reference/data-files.md), the settings sections, the bindings and the live events.
- **Reading.** For each name, what it does was read from the code: package doc comments, argparse definitions, the command registry and the rail in `AppShell.tsx`. The UI vocabulary was compared with the Studio Next mock rail (`docs/research/mockups/studio-next/src/app/Shell.tsx`).
- **Counts.** Blast radii are `grep -rIl` file counts that exclude `node_modules` and `.git`.
- **Risk.** Each rename is classed by the path rules in `scripts/ci/pr-risk.mjs` (`BOUNDARIES`, lines 17-28).

**The test for proposing a rename** is that the name misleads a reader about what the thing does today. A name that is only narrow, old-fashioned or inconsistent is listed as fine.

This note changes nothing. No rename here records an architecturally significant decision under [When to write an ADR](../adr/README.md#when-to-write-an-adr), so none needs an ADR. The section [Never rename](#never-rename-persisted-names) applies [ADR 0755](../adr/0755-the-product-is-named-narration-studio-to-the-user-and-narration-utils-stays-on-every-name-a-file-a-key-or-reaper-holds.md) rather than making a new decision.

## Headline

| Class | Misleading, rename | Fine as is | Never rename |
| --- | --- | --- | --- |
| Sidecars | 2 (`manuscript-guide`, `manuscript-teleprompter`) | 1 (`transcript-compare`) | |
| Go packages | 7 | 83 | |
| UI folders and components | 4, plus 1 that the Master swap fixes | the rest | |
| REAPER Lua files | 3 | 21 | the launcher (ADR 0755) |
| REAPER commands | 0 | 43 | |
| Docs files | 4 | the rest | |
| Scripts, Nx | 0 misnamed; 3 misplaced `scripts/ci` tools | the rest | |
| Persisted folders, files, settings keys, analyzer and job ids | 0 | | all |
| Bindings and events | 5 bindings (`ReadAloud*`, `TeleprompterReaperInput`) | the rest, by cost | the live event names |

The owner's instinct is right about the two sidecars. Most other names are fine. The persisted names should stay, because renaming them costs a migration per file, and one of them (`ManuscriptGuide/manuscript_guide.json`) is read from other people's projects.

## Sidecars

| Current | What it does now | Proposed | Blast radius | Boundary | Risk |
| --- | --- | --- | --- | --- | --- |
| `sidecars/manuscript-guide` (exe `manuscript-guide.exe`, Nx `manuscript-guide`, entry `core/manuscript_guide.py`) | Builds and edits the Story Bible. Its 23 subcommands (`manuscript_guide.py:1927-2071`) cover entity build and edit, merge, split, relate, dialogue cues and speaker correction, and pronunciation (CMU, Wiktextract, eSpeak, the narrator's IPA). It also does Piper previews (`render-audio`) and the extraction port's `suggest --source rules\|gliner` (`extraction_rules.py`, `extraction_gliner.py`). The Go side calls it the Story Bible: the findings analyzer is `"story-bible"` (`internal/guide/findings_adapter.go:38`) and host errors say "the Story Bible is unavailable". | `story-bible` (recommended: every mode reads or feeds the Story Bible) or `manuscript-analysis` | `manuscript-guide` 64 files; `manuscript_guide` 86; `Manuscript Guide` 28. 11 ADRs, 3 PRDs, skills `sidecar-add`, `sidecar-freeze`, `doc-impact-check`; threat-model rows 1h, 1j | Release: exe name, `prepare-resources.py:145,169-176`, `verify-installable.mjs:15`, `notices.py:41`, `smoke.go:65`. The runtime folder is content-addressed per build (`app.go:779,896`), so installed users need no migration. Coverage floor `coverage-floors.json:39` moves (needs `ratchet-approved`) | high (`sidecars/`, `scripts/release/`, `scripts/licenses/`, `.claude/`, threat model) |
| `sidecars/manuscript-teleprompter` (exe, Nx project, entry `core/live_asr.py`) | Live word-timestamp ASR (Whisper, Moonshine) with script tracking and live flags, which is the Booth's reading. Also the built-in recorder (`--record`, WASAPI, used by `internal/recording/sidecar.go:67-95`), the input meter (`--meter`), device listing, resume locate (`--locate`) and punch-and-roll word timing (`--align-word`). "Teleprompter" names one mode; the recorder running a binary called teleprompter is the clearest misfit. | `live-audio` (recommended) or `booth-audio` | `manuscript-teleprompter` 84 files; `Manuscript Teleprompter` 18. 21 ADRs (0107's title names it); threat model 6 lines (row 4g); `SECURITY.md:73` names "the Teleprompter's Moonshine engine" | Release: exe and the `_internal/moonshine_voice` and portaudio DLL paths checked by `verify-installable.mjs:48-59`. Coverage floors `coverage-floors.json:41-46` | high (as above) |
| `sidecars/transcript-compare` | Batch transcribe-and-align against the manuscript: compare and diff, `--coverage`/`--recheck`/`--align-only`, `--find-repeats`, `--take-divergence`, `--extract-hints`. | **Fine as is.** Every mode compares a transcript with the manuscript; the name is narrow, not wrong. Its ids `"transcript-compare"` (findings analyzer) and `"transcript_compare"` (job kind) are persisted (see below). | 135 files | | |

Rename only the folder, the exe, the Nx project, the entry module's docstring and the docs. Keep the entry file names `manuscript_guide.py` and `live_asr.py`; they are in 86 and 69 files, mostly tests. Keep the settings keys and project folders ([Never rename](#never-rename-persisted-names)). Python has no package to rename: `core/` is flat modules imported through a `sys.path` insert.

## Go packages

Bindings are generated only for `Host` (`main.go:42`). Their `$Call.ByID` hashes come from the root package and the method name, so renaming an internal package changes no binding name. The one exception is a package whose struct appears in a `Host` signature: today `marks`, `liveflags`, `project` and `editlog` (generated folders under `apps/ui/wailsjs/github.com/countrymanprime/narration-utils/shell/internal/`). Renaming one of these regenerates the bindings, but no hand-written TS import breaks. The [`go-package-split`](../../.claude/skills/go-package-split/SKILL.md) skill covers the mechanics. Event strings such as `"pickups:state"` are literals and do not change.

| Current | What it does now | Proposed | Importers | Also names it | Risk |
| --- | --- | --- | --- | --- | --- |
| `bridge` | REAPER-only file IPC with the Lua launcher (`bridge.go:1-3`) and the REAPER command shapes. It sits beside `audacitybridge`, which reads as if `bridge` were generic. | `reaperbridge` | 78 | depguard rule (`.golangci.yml:86`), 5 architecture docs, 12 ADRs, 9 `.claude` files including `rules/wire-contracts.md` and the `reaper-command-add` skill, `coverage-floors.json`, `docs-impact-map.json` | high (`internal/bridge/`, `.claude/`) |
| `daw` | Locates and launches REAPER and keeps its reachability (`locate.go:1`, `LocateReaper`). It sits beside the neutral `dawport` and `dawcatalog`. | `reaperhost` or `reaperlaunch` | 14 | threat-model row 9a (`internal/daw.LocateReaper`), 3 ADRs | high (threat model) |
| `tracks` | A parser for REAPER `.rpp` files (`tracks.go:1-8`, `Parse`), not a tracks domain model. `dawport` aliases `Project = tracks.Project`. | `rpp` or `reaperproject` | 80 | 6 ADRs, `docs/utilities/tracks.md`, `coverage-floors.json` | normal |
| `pickups` | The host end of the REAPER pickup-marker commands (`csv.go:1-10`). The narrator's pickup list is `pickuplist`. | `pickupmarkers` | 6 | threat-model row 5a, 1 ADR | high (threat model) |
| `character` | The character-continuity voice-reference store: it approves an `.rpp` region as a voice reference (`character.go:1-7`). The Story Bible's characters live in `guide`. | `voiceref` | 18 | 4 ADRs, `docs-impact-map.json` | normal |
| `tts` | Only the Piper voice catalog and its install (`catalog.go:1-3`). The generic TTS concept is `ttsport`, and the sibling catalogs are named after what they install (`whisper`, `moonshine`, `spacy`). | `piper` | 12 | none | normal |
| `guide` | The Story Bible service: it runs the sidecar, reads entities and cues, previews, queries, findings. It has no package doc comment. | `storybible` | 15 | depguard rule (`.golangci.yml:80`), 5 architecture docs, 6 ADRs | normal |

**Fine as is**, grouped:
- **Adapters and catalogs named after what they adapt or install:** `spacy`, `whisper`, `moonshine`, `wiktextract`, `ffmpeg`, `audacitybridge`, `dawport/{reaper,audacity,builtin}`, `extractionport/{gliner,rules}`, `pronunciationonline/merriamwebster`.
- **The port family:** `port` plus the `*port` packages, the [ADR 0301](../adr/0301-providers-sit-behind-small-ports-with-a-registry-and-a-capability-descriptor.md) convention. `extraction` vs `extractionport` and `mastering` vs `masteringport` are core vs port.
- **Feature and domain names that still match the code:** `manuscript`, `importer`, `marks`, `bookmarks`, the `scriptprep`, `prepmarkup` and `prepcompleteness` trio, `teleprompter` (the live session, the same name as its events), `liveflags`, `recording`, `passagemap`, `passagetakes`, `production`, `productionreport`, `delivery*`, `stages`, `proofing`, `editing`, `findings`, `gapreview`, `pickuplist`, `series`, `credits`, `analysistools`, `takereview`, `takecompare`, `repeats`, `retakelanes`, `lineidentity`, `renderconfig`, `cleanuptools`, `projectstate`, the `chapter*` packages, `measure`, `levelnormalize`, `zerocross`, `evidence` ([ADR 0100](../adr/0100-analysis-evidence-is-two-hash-keys-one-ledger-record-per-run-and-a-narrator-confirmed-track-map.md)).
- **Narrow or ambiguous, but not wrong:**
  - `coverage` measures recording coverage. The UI says "Recording check", and the persisted folder `narration-utils/coverage/` stays.
  - `transcript` is the Transcript Compare state machine.
  - `editlog` is a record of accepted edits.
  - `layout` holds repo path constants; it shares a word with a UI folder in another language.
  - `packager` assembles the book package, and its doc tells it apart from `encodeport.Packager`.
  - `preview` is the Proof preview window; it matches the `Preview*` bindings.
- **Infrastructure:** `assets`, `persist`, `hostlog`, `runlog`, `settings`, `recents`, `project`, `credentialstore`, `contractfile`, `update`, `latency`, `dictionary`, `pronunciationlookup`, `pronunciationonline`, `process`.
- **The module path `.../shell` and the Nx project `narration-utils-shell`** are kept by [ADR 0200](../adr/0200-the-desktop-shell-runs-on-wails-v3-beta-pinned-at-v3-0-0-beta-25.md) and ADR 0755. Renaming them would change every binding hash.

Not names, but found on the way:
- **Stale doc comments.** `process` (`supervisor.go:1`) still says "the two retained Python analysis sidecars". `transcript` still cites `dawadapter.Review`.
- **No importers outside themselves.** `continuity` and `cleanupmap` have none; `acoustic` is imported only by `continuity`.

These belong to a cleanup slice, not to a rename.

## UI components and labels

The component folders already use the mock's page keys: `production`, `schedule`, `script`, `storybible` (the mock's key is `bible`, the label "Story Bible"), `booth`, `editing`, `proof`, `pickups`, `master`, `delivery`, `settings`. [ADR 0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) and `AppShell.tsx:61` say "a page is renamed only in the change that ships its replacement". So any mismatch between a page and its label belongs to that page's swap slice, not to a rename slice. Renaming a folder changes no screenshot: visual-suite names come from the `page` keys in `apps/ui/tests/visual/catalog/*.ts`, and Storybook titles are hand-written. A folder rename does change the `src/components/<f>/...` keys in `apps/ui/src/interactionFeedback/*.ts`, so rewrite them with the path map.

| Current | What it is now | Proposed | Blast radius | Risk |
| --- | --- | --- | --- | --- |
| `components/manuscript/` | No longer a page. It holds the shared reader parts (ParagraphView, ChapterNav, ReaderCard, SelectionMenu, WordLookup, MarkupDialog). Script, Booth and Story Bible import them. | `reader/` | 9 importers, 26 path literals, 9 ADRs | normal |
| `Pill` primitive | A toggle chip, or one segment of `ToggleGroup look="segmented"` (`Pill.tsx:7-31`). The mock's `Pill` is a status pill with a dot, which is the app's `StatusBadge` ([ADR 0600](../adr/0600-every-pill-tag-and-status-dot-is-one-badge-primitive-with-a-pill-a-tag-and-a-booth-shape.md)). Code ported from the mock reads it the wrong way. | `ToggleChip` or `Segment` | 5 consumers, 7 ADRs, `docs/design/design-system.md`, generated atlas pages | normal; run `design-spec-guard` |
| `ChapterStepper` primitive | The mock's `ChapterBar` (its own doc comment says so, `ChapterStepper.tsx:12`). | `ChapterBar` | 1 consumer, design system | normal |
| `Guide` component (`storybible/Guide.tsx`) | The Story Bible page. | `StoryBiblePage` | `App.tsx` and 2 tests. Leave `GuideEntity` and `GuideDetail`: they follow the wire type | normal |
| `master/` holds the routed `MasterQcPage`; `masterqc/` holds the new `MasterPage` | The two names are swapped. | No rename slice. The Master swap (SNM-5) moves the new page into `master/`, moves the delivery-profile model (`deliveryProfile.ts`, `deliveryFormat.ts`, `fileVerdict.ts`, `masterLink.ts`) out, and deletes `masterqc/` | 2 importers on the `masterqc` side | normal |

**Fine as is:**
- **The page folders,** which match the mock keys.
- **`assets`, `credits`, `devtools`, `help`, `layout`, `project`, `series`, `stages` and `recordingcheck`:** each name says what is inside.
- **`engine/`:** the mock says "DAW" and has no engine panel, but what replaces the panel is a page decision, not a rename. When the panel goes, move the playback hooks it holds (`useTrackPlayback`, `useRangePlayer`) to `hooks/`.
- **`mapping/`:** one component, `MappingConfirm`.
- **The remaining primitives:** each name says what it renders. The key primitives `KeyHint` and `KeyHints` are close but distinct.
- **The `teleprompter` identifiers in 101 UI files:** they follow the `Teleprompter*` bindings, so they move only if those do.

`StageGrid`, `Collapsible` and `NumberInput` have no consumers. They are deletion candidates for a cleanup slice.

## REAPER Lua

The 43 bridge commands use neutral verbs. The neutral layer is `dawport`'s role names, so the command names are adapter-internal and **fine as is**. That includes `master_chain_read`: its capability id is a persisted settings key (`config/defaults.json`, DAW section), which costs more than the reversed verb order is worth. `NarrationUtils_Launcher.lua` and its action keep their names under ADR 0755.

| Current | What it does now | Proposed | Lists that name it | Risk |
| --- | --- | --- | --- | --- |
| `narration_take_review.lua` | Registers only `create_take` (header line 1). It is easily confused with `narration_takes.lua`, which does `hide_takes`. | `narration_take_create.lua` | `FEATURE_FILES` (`narration_ui_bridge.lua:20-40`), `scripts/release/reaper-files.mjs`, `smoke.go:67-69`, `tests/mutations.json` `file` fields, `docs/architecture/reaper-bridge.md:7-15` | high |
| `narration_render.lua` | Only `configure_chapter_render`; it never renders. Rendering is in `narration_master_render.lua`. | `narration_render_config.lua` (the same as Go `internal/renderconfig`) | as above | high |
| `narration_workspace.lua` | `set_active_take` and the four FX commands, named for the retired edit-and-proof workspace screen. | `narration_take_fx.lua` | as above; 22 `mutations.json` entries | high |

**Fine as is:**
- **The other feature files.**
- **`narration_ui_bridge.lua` and `narration_bridge_core.lua`:** their headers are stale (they list fewer consumers and files than exist), which is a doc fix, not a rename.
- **`reaper_common_core.lua` and `reaper_common_process.lua`:** only the launcher loads them. "common" is loose, but their headers misdescribe them more than the names do; fix the headers.

A file rename is safe for installed users, because feature files load from the bundle's own folder. It still needs the [bridge rule](../../.claude/rules/reaper-bridge.md)'s in-REAPER load check, since the fake cannot prove that REAPER finds the renamed file.

## Docs, scripts and Nx

| Current | Problem | Proposed | Inbound links | Risk |
| --- | --- | --- | --- | --- |
| `docs/utilities/manuscript-guide.md` (H1 "Manuscript Guide") | Describes the Story Bible sidecar. Line 7 says "The REAPER bridge supports building ...", which is stale. | follows the sidecar: `story-bible.md` | 6 | normal |
| `docs/architecture/manuscript-teleprompter.md` | The live session and recorder behind the Booth: "Teleprompter" 45 times, "Booth" 12. It is published by `tools/docs-site/include.txt:38`. | follows the sidecar: `live-audio.md` | 33 | normal |
| `docs/architecture/dictionary-thesaurus-integration.md` (H1 "Dictionary look-up") | "thesaurus" appears 0 times. | `dictionary-lookup.md` | 3 | normal |
| `docs/architecture/import-settings-workflow.md` (H1 "Import heading and subtitle review") | The file name matches neither the title nor the content. | `import-heading-review.md` | 2 | normal |

**Fine as is:**
- **`docs/utilities/recording-coverage.md`:** its H1 already says "Recording Check (recording coverage)".
- **`docs/architecture/daw-integration.md`:** the content is mostly REAPER rules, and line 7 says two sidecars where there are three. That is a content fix; the name is the right home for the DAW boundary.
- **The guides,** which match the current pages.
- **ADRs, research and PRDs:** these are immutable, dated or deleted when built. ADRs keep citing old names after a rename, which is correct for a record.

Moved stubs (`storybible-import-format.md`, `script-marks.md`, `operations/agent-train.md`) are deletions, not renames. Removing the first two edits the links in the threat model and `SECURITY.md` (high).

**Scripts.** No script is misnamed. `scripts/licenses/models.mjs` writes tables for eight asset catalogs, not only models; that is narrow, not wrong. Several files are in the wrong folder:
- `scripts/ci/run-timings.mjs`, `apply-path-map.mjs` and `skill-evals.mjs` are manual tools that no workflow runs. They belong in `scripts/dev/`.
- Four tests of `scripts/dev/*` live in `scripts/ci/` (`owner-qa-list`, `slice-lint`, `capture-studio-next-mock`, `bump-host-api`).

The moves are normal risk. The test ratchet (`test-ratchet.mjs:61-64,95`) accepts a moved test only while git still detects the rename.

**Nx.** The project tags are toolchain-only, so no tag misfits. The sidecar project names follow their folders and change with them. Each sidecar rename also edits `apps/desktop/project.json:6` (`implicitDependencies`), `libs/python/project.json:6`, root `project.json:25-30`, `.github/labeler.yml:15-17`, and the `projects:` entries in `.github/workflows/_quality.yml` (high). The research project `character-continuity-cue-eval` drops "extraction" from its folder name; it is dated research, so it stays.

## Never rename: persisted names

There is no generic file, folder or settings-key rename mechanism. A grep for `migrat|legacy|alias|renamed` in `internal/persist`, `internal/settings` and `internal/projectstate` finds nothing. The existing migrations are one-offs, each with its own flag: `project/migrate.go:27-50`, `marks/marks.go:615-714` and `deliveryprofile/legacy.go`. So each rename below needs a read-old, write-new shim in Go and in Python (`narration_common` `get_default`).

| Name | What it misnames | Why it stays |
| --- | --- | --- |
| `<project>/ManuscriptGuide/` holding `manuscript_guide.json`, `audio/tts/` and `suggestions.json` | The Story Bible | `guide.ReadOnlyNames` (used by `internal/series/voicebible.go:126`) reads it from *other* projects, so the old path stays readable for as long as old projects exist. `manuscript/service.go:621` clears it by name |
| `<project>/TranscriptCompare/` | (still the tool's name) | Also written by the REAPER Lua (`narration_compare.lua:102,134`) and hashed by the recording check (`coverage/params.go:75`) |
| `narration-utils/teleprompter/*.reading.json`, `*.anchors.json`; findings analyzer `"teleprompter"` | The Booth | The analyzer id is the folder `findings/teleprompter/` |
| `narration-utils/proofing/renders.json` | The Proof page | Data-file row; the `Proofing*` bindings use the same name |
| Findings analyzer `"transcript-compare"`; job kind `"transcript_compare"` (`jobs.go:31`) | | The analyzer feeds `findings.StableID` (`findings.go:296`), so renaming it changes every finding id and orphans the narrator's reviews. The job kind is in the run log and the `job:ended` contract |
| Settings sections `ManuscriptGuide`, `Teleprompter`, `Piper`, `RecordingCoverage`; `DAW.experimental_reaper_actions`; `DAW.capability.master_chain_read` (`settings/store.go:66-71,180`, `config/defaults.json`) | Story Bible, Booth, the TTS provider choice, Recording check, the DAW-neutral resolver | They are stored in every user's `global-settings.json` and project `settings.json`, and Python reads them through `sidecars/` (high) |

This applies the reasoning of ADR 0755: keep the names that a file, a key or REAPER holds, and change only the label the user sees. The labels already say Story Bible, Booth and Recording check.

One change costs nothing now and avoids a later rename. The extraction store (`internal/extraction/store/store.go:27`) put the new `suggestions.json` under `ManuscriptGuide/`. A new persisted file should go under `narration-utils/` instead of extending a legacy folder. This is a recommendation for later slices, not a rename.

## Bindings and events

A binding name never reaches a user or a file. Go and the UI ship in one build, and the `ByID` hashes are rebuilt each time. A binding rename still costs:
- a `hostAPIVersion` bump (a serial point);
- regenerated goldens (`UPDATE_CONTRACTS=1`);
- schema, mock and `wireContracts.test.ts` rows;
- regenerated bindings.

See [`wire-contract-change`](../../.claude/skills/wire-contract-change/SKILL.md).

| Family | Count | Misfit | Verdict |
| --- | --- | --- | --- |
| `ReadAloudReaperState`, `ReadAloudArmOnly`, `ReadAloudRecordStart`, `ReadAloudRecordStop`; `TeleprompterReaperInput` | 5 bindings, 2 `read-aloud-*` goldens | Named for the removed Read aloud dialog and for REAPER, on the surface the DAW port made neutral | **Rename**: `BoothDawState`, `BoothArmOnly`, `BoothRecordStart`, `BoothRecordStop`, `BoothDawInput` (or a `Record*` prefix) |
| `Guide*` | 24 bindings, 21 `guide-*` goldens; `Guide[A-Z]` identifiers in 161 files | The Story Bible. The UI schema file is already `schemas/storyBible.ts` | Fine as is: consistent, unseen, and expensive. The Story Bible PRD is still adding to it (`GuideSetSpeakerColor`) |
| `Teleprompter*`, events `teleprompter:event` and `teleprompter:state` | 15 bindings, 29 goldens, 644 identifier uses | The Booth's live session, which still does what the name says | Fine as is |
| `Workspace*` | 14 bindings, 25 goldens | Named for a retired screen; they are take and FX commands | Fine as is unless the Editing swap (SNE-9) replaces them, in which case the replacements take neutral names |
| `Proofing*` | 3 bindings, 9 goldens | Same stem as `proofing/renders.json` | Fine as is |
| Live events (17, `app.go:920-1008`) | | `coverage:state`, `transcript:state`, `teleprompter:*` | Never: the event names are listed in the contract tests and the UI hooks |

## Sequencing

Every rename here conflicts with in-flight slices. A folder rename invalidates the `owns` globs in open slice issues, and a binding rename collides with the `hostAPIVersion` serial point. Run them in one quiet window on lane X, per [the agent train's lanes](../../.claude/skills/agent-train/SKILL.md#lanes):
- **Start:** after the last Studio Next swap slice merges (SNB-8, SNP-8, SNQ-9, SNO-10, SNM-5, SNE-9 in the [cutover table](../prds/studio-next-cutover.prd.md)) and the GLiNER/BookNLP adapters (SNX-7b) land.
- **End:** before the release-candidate rehearsal.

The swaps delete the old pages first, which removes about a third of the UI blast radius (the old `Guide` page and the old Master page). Running the renames before the rehearsal means the packaged smoke test checks the new exe names.

The cutover's steady-state docs step (cutover PRD, step 7) runs after the renames, so it documents the final names once.

**Order:** cheapest and most internal first, so a revert of a later step does not undo an earlier one.

| # | Slice row (lane X, kind `seam` unless noted) | Contents | Risk |
| --- | --- | --- | --- |
| R1 | Docs and scripts | The 2 standalone doc renames; the `scripts/ci` → `scripts/dev` moves | normal |
| R2 | UI internals | `manuscript/` → `reader/`, `Guide` → `StoryBiblePage`, `ChapterStepper` → `ChapterBar`, `Pill` → `ToggleChip` (run `design-spec-guard`; ADR 0600 keeps the old name as a record) | normal |
| R3 | Go internals, normal | `tracks` → `rpp`, `character` → `voiceref`, `tts` → `piper`, `guide` → `storybible` | normal |
| R4 | Go internals, REAPER | `bridge` → `reaperbridge`, `daw` → `reaperhost`, `pickups` → `pickupmarkers`, with the depguard rules, threat-model rows 5a and 9a, and the `.claude` rule and skills that name them | high |
| R5 (kind `lua`) | Lua files | the 3 file renames with `FEATURE_FILES`, `reaper-files.mjs`, `smoke.go`, `mutations.json`, and an in-REAPER load check | high |
| R6 | Sidecars | `manuscript-guide` → `story-bible`, `manuscript-teleprompter` → `live-audio`: folders, exes, Nx projects, the release scripts, coverage floors (`ratchet-approved`), labeler, `_quality.yml`, the two docs that follow them, threat model and `SECURITY.md:73`, skills. Then the packaged smoke test | high |
| R7 | Bindings | the 5 `ReadAloud*`/`TeleprompterReaperInput` bindings, one `hostAPIVersion` bump | normal (root `apps/desktop/*.go` only) |

R6 and R7 each change a release or wire list, so each runs alone. R1 to R3 can share the window if their `owns` are disjoint. `pr-risk` sees only the new path of a renamed file (`git diff --name-only` in `.github/workflows/pr-risk.yml:35`). A move *out of* a boundary therefore rates normal, so review such moves by hand.

**How workers keep their briefs valid:**
- **Record each move in the path map.** Every directory move adds a `renames` row to `scripts/ci/layout.json`, which already holds 15 such rows with `enforceRetired: true`. The layout guard then fails any later text that names the old path.
- **Rewrite before merging.** A slice still open after the window runs `node scripts/ci/apply-path-map.mjs` on its branch and its issue body before merging `main` in. The coordinator applies the same map to the `owns` globs of open slice issues and re-runs `slice-lint`.
- **Don't start a rename mid-series.** Until the window, new code follows the existing names, so one sweep renames everything. A new Go package, file or binding introduced before the window takes its final name from this note. A new persisted file goes under `narration-utils/`.
- **Re-count at the window.** Re-run the counts in this note at the start of the window, since they are for `5ee0877`.

## Pending

- **The window's start** depends on the swap slices merging; the coordinator owns it.
- **The R6 sidecar names** (`story-bible`, `live-audio`) are this note's recommendation. They become decisions only when the owner picks them on #1489, or through the decisions register (#993) default.
