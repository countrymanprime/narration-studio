# Studio Next Settings, Master & QC and Delivery swap audit (SN-M51)

**Date:** 2026-10-11. **Code audited:** `main` at `18e1b40`. **Mock audited:** `docs/research/mockups/studio-next/` (last change `9506744`). **Slice:** SN-M51 (#1268), SNM-5a of the [Master, Delivery and Settings PRD](../prds/studio-next-master-delivery-and-settings.prd.md). SN-M5 (#1286) deletes this note once its tables have been acted on.

Method: files read, `grep` over `apps/ui/src`, `apps/ui/tests`, `apps/desktop/internal/settings`, `docs/guides`. The app was not run and no screenshot was taken. A claim read from code carries a path and line; a claim not read line by line is marked **unverified**. Policy: the Studio Next mock is the only spec (owner ruling D98 in [the agent train](../operations/agent-train.md#which-mocks-are-the-spec)); an old thing with a mock equivalent is removed in the swap, an old thing without one stays as built. Verdicts: **replace** (the mock draws it; delete the old), **keep** (no mock equivalent; mount as built), **split** (part of it has an equivalent).

## Findings that change a slice

1. **`Settings.tsx` cannot be deleted whole.** Besides the category list it holds the scoped-form machinery every kept category needs: `load`, `save`, `discard`, `changedValues` and `clearOverride` (`Settings.tsx:80-218`), the dirty hooks `App.tsx` wires into its leave guards (`onDirtyChange`, `registerActions`; `App.tsx:485-487,565,578`), the project and global DAW blocks (`:281-386`), and the remove-voice, remove-model and clear-project-data confirms (`:438-500,554-619`). 15 of the 18 categories are **keep**. SN-M5 lists `Settings.tsx` as deleted and SN-M52 may not touch it; neither says where that code goes. Default taken (question 1): the new page is the mock's panels, then the existing `Settings` component trimmed to the kept categories, scope tabs included.
2. **Five of the mock's ten Settings panels have no model in the repo.** Recording (REAPER / Audacity / Built-in): no setting selects a recorder. `DawKind` is `'REAPER' | 'Audacity' | 'none'` and is reported, not chosen (`api/contracts/daw.ts:7`); the `DAW` settings keys are `auto_start_launcher`, `experimental_reaper_actions` and `capability.*` (`apps/desktop/internal/settings/store.go:78-86`); the built-in recorder joins `DawKind` in DAW phase 9, pending. Definitions source (web / local / online): `grep -rn dictSource apps/ui/src` finds nothing. Reader text (font, size, spacing): the repo has the Script's small / medium / large (`components/script/ScriptPage.tsx:59-60`) and the Booth rail state in `localStorage` (`components/booth/readerPreferences.ts`). Marks: the repo has three markup kinds (three kinds, `stress`, `pause`, `character_tag`; [Script audit](studio-next-script-bible-audit.md)); the mock's list is `data.marks` and its dialog is the Script page's (`mockups/studio-next/src/pages/script/dialogs.tsx:103`). Story Bible types (rename, colour, can-speak): `grep -rn bibleTypes apps/ui/src apps/desktop` finds nothing. SN-M52 lists "Contracts: none" and may not touch `api/**` or `apps/desktop/**`, so its tests 1, 3, 4, 5 and 6 cannot pass. Adjustment under SN-M52.
3. **The mock's Master table has two columns with no host field.** Clicks and Text (`mockups/studio-next/src/pages/Master.tsx:133`); `MeasureFileResult` carries `report`, `findings` and `rules`, no click count or text match (`api/contracts/measure.ts:85-93`). `PerFileChecks` draws File, Length, RMS, True peak, Noise floor, Head / Tail and Result (`PerFileChecks.tsx:128-134`). Under "Master draws what is measured" ([ADR 0440](../adr/0440-master-and-qcs-platform-tabs-are-the-projects-delivery-profile-and-the-page-draws-only-what-the-host-measures.md)) the two columns are not drawn.
4. **`MasterQcPage` is also the owner of the measuring job.** Lines 104-250 hold the measure job, `Check files…`, Cancel, `chooseOther`, the platform choice and `rulesOpen`/focus from `#file=`. The mock has only "Check the files again" (`Master.tsx` `#recheck`). Deleting the page deletes that logic unless SN-M42 or SN-M43 extracts it first. `useExportJobs` is already shared and host-backed ("leaving the page and coming back shows them again", `useExportJobs.ts:16-20`), so the Delivery page can call it itself.
5. **`RuleBadges.tsx` cannot be deleted.** SN-M5 lists it. A kept panel imports `ResultIcon` from it (`MultiPlatformExportPanel.tsx:8`), and the kept Delivery profile list and editor import `Mark` and `LOCK_ICON` (`DeliveryProfilesPanel.tsx:11`, `DeliveryProfileEditor.tsx:10`). Likewise `deliveryProfile.ts` and `deliveryFormat.ts` have a Proof importer (`proof/deliveryFindingFormat.ts:6-7`), and `masterLink.ts` is read by `App.tsx:51,537`.
6. **The profile list, Duplicate, Delete and rule-off have no mock equivalent.** The mock has two profiles, ACX (built in) and one fixed `Custom`; its commands are `setProfile`, `renameProfile`, `setLimit`, `setFormat`, `buildPackage` (`mockups/studio-next/src/state/commands/delivery.ts`, `fixtures/book.ts:39-40`). The repo's profile is rule-based with a Global default, a project choice, Duplicate, Edit (numbers, rules off) and Delete (`DeliveryProfilesPanel.tsx:113-151`, [ADR 0180](../adr/0180-custom-delivery-profiles-are-copies-of-a-built-in-kept-in-a-user-level-file.md)). The choice and the number edit are replaced (Settings select, Delivery card); the rest is **keep**. SN-M5 lists `DeliveryProfilesPanel` and `DeliveryProfileEditor` as deleted.
7. **"Series settings and Companion settings" are not Settings categories.** The PRD and SN-M5 name them as kept. `SETTINGS_CATEGORIES` (`Settings.tsx:35-67`) has neither; `store.go` has no Series or Companion tool. Series is a Story Bible tab (`components/series/SeriesTab.tsx`) and a credits value (`CreditsPanel.tsx:32`). Nothing in Settings needs a keep for them.
8. **Master's "Silence cleanup" link lands on Delivery.** `DiagnosticsSection` says "Set in Settings > Silence cleanup" with an Open Settings button (`DiagnosticsSection.tsx:68-69`), and `App.tsx:726` gives it `/settings#delivery`; there is no `#cleanup` anchor (`App.tsx:63`). The kept panel needs its own target (see [Anchors](#anchors-and-links)).
9. **The mock rail shows a failing-file count on Master & QC and none on Delivery** (`mockups/studio-next/src/app/Shell.tsx:34,45`); `NavCounts` has Story Bible, Proof and Pickups only (`useNavCounts.ts:7`). See [The Delivery rail item](#the-delivery-rail-item).

## Verdict per Settings category

Files are under `apps/ui/src/components/settings/` unless a path says otherwise. Mock sections are in `mockups/studio-next/src/pages/Settings.tsx`. Visual rows are `state` names under `page: 'settings'` in `apps/ui/tests/visual/catalog/settings.ts` (52 rows in all, 3 page-wide: `dirty-footer`, `navigate-away-confirm`, `reset-override`). Guide text is in `docs/guides/using-the-app/settings.md`.

| Category | Mock section | Verdict | Files | Visual rows, guide, doc screenshots |
| - | - | - | - | - |
| General | None | keep | `Settings.tsx` generic form (`tool: General`) | `global-general`; intro paragraph; `settings-general` |
| Appearance | Appearance (system / light / dark radios, `:106-114`) | replace | `Settings.tsx:387-398`, `THEME_OPTIONS`; `theme/ThemeContext` stays | `global-appearance`; "Appearance controls the light/dark theme"; `settings-appearance`, `theme-dark` |
| Keyboard | Keyboard shortcuts, a read-only list (`:115-117`; mock test "lists the keyboard shortcuts read-only") | keep | `KeyboardPanel.tsx`: remap, pedal and MIDI capture, conflicts have no mock equivalent; the list part is what the mock draws | `global-keyboard`, `-recording`, `-conflict`; no guide text (`grep -in keyboard settings.md` is empty) |
| Manuscript | Manuscript (imported line, Replace or Import, `:118-125`) | split | `ManuscriptSection.tsx` is the mock panel (SN-M2, merged) and mounts as is; the reader-note colour field (`color_note`, generic form) has no equivalent: keep | `global-manuscript`; paragraph on colours; `settings-manuscript` |
| RecordingCoverage | None | keep | `RecordingCheckSummary.tsx`, generic form | `global-recording-check`, `project-recording-check`; "Recording check" bullet |
| Cleanup | None | keep | generic form (`tool: Cleanup`) | none; no guide text (named in `docs/architecture/codebase-map.md` only) |
| TranscriptCompare ("Proof") | None | keep | generic form, Whisper model block `Settings.tsx:438-468`, remove confirm `:598-619` | `global-proofing`, `project-proofing`; "Proofing" bullet |
| Preview | None | keep | generic form | none; the guide's "Preview" at `settings.md:107` is the credits preview |
| StageRecommendations | None | keep | generic form | `global-stage-recommendations`; text is in `production.md` ("Stage suggestions") |
| ManuscriptGuide ("Story Bible") | Story Bible types (`:41-56`) and Story Bible analysis (`AnalysisTools.tsx`) | keep, with two sections added | spaCy model, build-after-import, pronunciation source, colours (`applyPalette`, `Settings.tsx:138-153`), `OnlineDictionaryPanel.tsx`. SN-M33 registers analysis tools here through `sections.ts`. The types panel has no model (finding 2) | `global-storybible`, `-key-saved`, `project-storybible`; "Story Bible" bullet |
| Delivery | Delivery profile, a select (`:75-80`) | split | select over profiles: replace (mock). Global default, profile list, Duplicate, Edit, Delete: keep (finding 6) in `DeliveryProfilesPanel.tsx`, `DeliveryProfileEditor.tsx` | `global-delivery`, `project-delivery`, `delivery-profile-editor`; "Delivery" bullet; no doc screenshot |
| Daw ("DAW Integration") | Recording radio (`:66-74`) and the capability list | keep, sections mounted | `DawCatalogPanel.tsx`, launcher and reachability block `Settings.tsx:299-386`, project link block `:281-298`, `CapabilitySection.tsx` (SN-M1, registered at `Settings.tsx:33`); Backups arrives by `sections.ts` (SN-M32). The Recording radio has no model (finding 2); `experimental_reaper_actions` is a generic field (`apps/desktop/app.go:1477`) | `global-daw`, `-capabilities`, `-not-detected`, `-handoff`, `project-daw`, `-not-linked`; "DAW Integration" section |
| Piper ("TTS") | None | keep | generic form, voice block `Settings.tsx:470-500`, remove confirm `:576-597` | `global-tts`; "TTS" bullet |
| Teleprompter ("Booth") | None | keep until SN-O10 | generic form (`engine`, `model`, `punch_preroll_seconds`: `store.go:70`). The Booth audit's owner question 2 may remove the controls; the category follows that ruling | `global-booth`; paragraph on the Booth category |
| LocalAssets | None | keep | `components/assets/LocalAssets` | `local-assets` and 5 more (`-downloading`, `-verifying`, `-needs-repair`, `-failed`, `-remove-confirm`); "Local assets"; `settings-local-assets` |
| ProjectData | None | keep | block `Settings.tsx:407-419`, confirm `:554-575` | `project-data`; paragraph; `settings-project-data` |
| Credits | None | keep | `CreditsPanel.tsx`, `RetailSamplePanel.tsx` | `project-credits` and 4 more (`-detected`, `-chapter-announcement`, `-retail-sample`, `-retail-sample-refused`); "Credits"; `settings-credits-chapter-announcement`, `settings-credits-retail-sample` |
| About | None | keep | `AboutPanel.tsx`, `UpdatesPanel.tsx`, `UpdateDownloadDialog.tsx` | `global-about` and 11 `about-*` rows; "About and updates"; `settings-about-updates` |

Mock sections the table does not place: Recording and the capability list sit on the Daw row; Definitions and pronunciations, Reader text and Marks have no repo category (finding 2) and are new panels in SN-M52. Counts: 1 replace (Appearance), 2 split (Manuscript, Delivery), 15 keep.

## Verdict per Master & QC panel

Files are under `apps/ui/src/components/master/`. Mock references are to `Master.tsx` (M) and `Delivery.tsx` (D). Line counts are from `wc -l`.

| Panel (lines) | Mock element | Verdict | Notes |
| - | - | - | - |
| `MasterQcPage` (411) | M page, profile pill `#mprof` opens Delivery | replace, after the measuring job moves out (finding 4) | The platform tabs (`ToggleGroup`, `:262-274`, ADR 0440) go: the pill replaces them and the profile choice moves to the Delivery page |
| `PerFileChecks` (176) | M "Per-file checks" grid, `aria-selected` rows, waiting rows | replace | `describeFormat` and `uniformFormat` are imported by `FileRulesPanel` and `MasterQcPage` (`FileRulesPanel.tsx:8`, `MasterQcPage.tsx:21`): move them if `FileRulesPanel` stays. Clicks and Text columns not drawn (finding 3) |
| `WhyItFails` (93) | M detail "<file> · Why it fails / Checks" with Pass/Fail rows | replace | The "Suggested fix" and "rules the app could not judge: check them yourself" lines have no mock equivalent and carry into the new detail panel |
| `FileRulesPanel` (122) | None (the mock lists the five limits only) | keep | "Every rule" for one file, including rules marked not measurable. Mounts under the detail panel as today |
| `BookConsistency` (113) with `bookSpread.ts` | M `Consistency`, RMS by file against the profile range | replace | The repo draws every book rule's spread; the mock draws RMS only. Default: draw what the host judges (ADR 0440), RMS first. `bookSpread` goes with it unless `knip` finds a user |
| `BookChecklist` (123) | M `packageItems` and the aside "Delivery package · <profile>" | replace | Its credits-template line has no mock equivalent: carried as one extra row in the aside |
| `DeliveryPackagePanel` (127) | M aside plus D "Output" and "Before you build" | replace, split across two pages | Checklist: the Master aside (SN-M43). Build, folder, written files: the Delivery page (SN-M45), using `useExportJobs` |
| `DeliveryProfilePanel` (194) | D first panel (profile card: checks, files) | split | "Change profile" and the platform line: replace. "Rules and their sources" (what the platform requires, how checked, verification): no equivalent, keep and mount on the Delivery page below the card. Exports `Requirement`, used by `FileRulesPanel` (`:7`) |
| `MasterToSpecPanel` (156) | None (`grep -ci "to spec\|mastering chain\|diagnostic\|report"` over the three mock pages is 0) | keep | Master page, left column, above the mastering chain |
| `MasteringChain` (90) | None | keep | Master page, left column, below `MasterToSpecPanel` |
| `DiagnosticsSection` (296) with `DiagnosticsTables` | None | keep | Master page, left column, after the chain. Needs its own Settings anchor (finding 8) |
| `ReportExportPanel` (78) | None | keep | Master page, left column, last |
| `MultiPlatformExportPanel` (134) | None | keep | Builds packages for several platforms, so it mounts on the Delivery page under "Output" (default taken). It reads `jobs` from `useExportJobs` and imports `RuleBadges` |

Helpers: `fileVerdict.ts` is imported only by deleted files (`PerFileChecks`, `WhyItFails`, `MasterQcPage`, `DeliveryPackagePanel`) and goes unless SN-M42 reuses it. `RuleBadges`, `deliveryProfile`, `deliveryFormat`, `masterLink`, `useExportJobs`, `diagnosticsFormat` stay.

## Old equivalents

Command for the importers below, run in `apps/ui/src` over non-test files:

```text
grep -rlE "from '(\./|\.\./(master|settings)/|.*components/(master|settings)/)<Name>'" --include=*.ts --include=*.tsx .
```

| File the swap deletes | Importers outside tests | Tests and stories | Keyed rows and entries |
| - | - | - | - |
| `master/MasterQcPage.tsx` | `App.tsx:47` | `MasterQcPage.test.tsx` (383 lines), `DiagnosticsSection.test.tsx` (it renders the page) | `interactionFeedback/master.ts` (9 keys, `measureState#1` and others); `useApiRatchet.test.ts:50,155`; 25 `master` visual rows; 10 `master-*` doc screenshots; mock-match target `master/mock-fidelity-05` (`apps/ui/tests/visual/mock-match/mocks.ts:48`) |
| `master/PerFileChecks.tsx` | `MasterQcPage.tsx:21`, `FileRulesPanel.tsx:8` | `PerFileChecks.test.ts` | none keyed by this path |
| `master/WhyItFails.tsx` | `MasterQcPage.tsx:24` | none | none |
| `master/BookConsistency.tsx`, `bookSpread.ts` | `WhyItFails.tsx:4`; `BookConsistency.tsx` | `BookConsistency.test.tsx`, `bookSpread.test.ts` | `panelCopies.test.ts:54` |
| `master/BookChecklist.tsx` | `DeliveryPackagePanel.tsx:6` | `BookChecklist.test.tsx` | `interactionFeedback/master.ts` (2 keys); `iconImports.test.ts:34`; `useApiRatchet.test.ts:48,153`; `paletteContrast.test.ts:387` |
| `master/DeliveryPackagePanel.tsx` | `MasterQcPage.tsx:11` | none | none |
| `master/DeliveryProfilePanel.tsx` (split) | `MasterQcPage.tsx:13`, `FileRulesPanel.tsx:7` | none | `iconImports.test.ts:35`; `paletteContrast.test.ts:388` |
| `master/fileVerdict.ts` | the four deleted files above | `fileVerdict.test.ts` | none |
| `settings/Settings.tsx` (trimmed, not deleted) | `App.tsx:35,746` | `App.test.tsx` (Settings cases at `:160,252,412,462,524-531,692-735`); `ManuscriptSection.test.tsx`, `CapabilitySection.test.tsx` mention it | `interactionFeedback/settings.ts` (9 keys); `useApiRatchet.test.ts:93,198`; `paletteContrast.test.ts:398`; 52 `settings` visual rows; 8 `settings-*` doc screenshots; aria `confirm-unsaved-settings` (state `settings/navigate-away-confirm`) and `dialog-delivery-profile-editor` (state `settings/delivery-profile-editor`) in `apps/ui/tests/aria/dialogs.spec.ts:17-19,44` |
| `settings/DeliveryProfilesPanel.tsx`, `DeliveryProfileEditor.tsx` (kept) | `Settings.tsx`; the editor only from the panel | `App.test.tsx:729` (chooses, duplicates, edits, deletes) | `interactionFeedback/credits.ts` (7 keys); `useApiRatchet.test.ts:89,194` |

Deleting the rows above removes the matching visual rows and drivers (`apps/ui/tests/visual/drivers/master.ts` 210 lines, `apps/ui/tests/visual/drivers/settings.ts` 415 lines), the 10 `master-*` and the replaced `settings-*` doc screenshots, and the guide text for the replaced parts of `master-and-qc.md` (183 lines: Platforms, Checking files, Why it fails, Book consistency, The delivery package, The delivery profile) and `settings.md` (185 lines: Appearance, the Delivery bullet). The Mastering chain, Mastering to spec, several-platform, Diagnostics and Exporting a report sections stay. `navigation.md` gains the Delivery page. No story imports a deleted file (`master/` has none; `settings/` has `CapabilitySection.stories.tsx` and `ManuscriptSection.stories.tsx`, both kept).

## Anchors and links

| Inbound | Where | What the swap does |
| - | - | - |
| `/settings#credits` | `App.tsx:688` (Booth "Fill them in Settings"), `ManuscriptImport.tsx:274`, `CreditsRowPanel.tsx:75`, `ScriptPage.tsx:804` | Keeps landing: Credits is a kept category, `SETTINGS_ANCHORS['#credits']` stays |
| `/settings#delivery` | `App.tsx:726` (`openSettings` for Master) | Becomes the Delivery card on the new page for "Change profile". The Silence cleanup button gets `#cleanup` (new anchor to the Cleanup category) |
| `/settings#booth`, `#teleprompter` | `ReadingControlBar.tsx:389`; alias test `App.test.tsx:529-531` | Anchor stays while the Teleprompter category stays; the only caller is deleted by SN-O10 |
| `/settings` (no hash) | `recordingCheckText.ts:64-65`; shortcut sheet `App.tsx:811`; rail `AppShell.tsx:212` | Lands on the new page |
| Update notice text | `App.tsx:328` ("See Settings, About & updates") | Text only, no link. Unchanged |
| `/master#file=…&rule=…` | `App.tsx:537` `goToMaster`, from Proof (`FindingDetail.tsx:203`) | `masterLink.ts` stays; the new page reads the same hash |
| `/delivery` | `App.tsx:728` redirects to `/master`; test `App.test.tsx:612-616` | Becomes a route (ADR 0802). The redirect and its test go; any old `/delivery#file=` link now opens Delivery, which does not read a file anchor (SN-M45 decides; default: redirect only a hash that carries `file=` to `/master`) |
| Palette | `goto.page./master` and `/settings` from `shellPages` (`useGoToCommands.ts`) | One more row, `goto.page./delivery` |

Not found: a toast that links to `/master` or `/delivery`; the jump menu has no page list of its own (it reads `shellPages`).

## The Delivery rail item

- `NAV_GROUPS` (`AppShell.tsx:62-68`): add `DELIVERY = { name: 'Delivery', path: '/delivery', icon, requiresManuscript: true, requiresDaw: false }` after `MASTER_QC` in `Finish`. The mock rail does the same (`Shell.tsx:33-34`) and its Delivery page shows `NeedManuscript` without one (`Delivery.tsx:24`). Master is not gated in the repo (`requiresManuscript: false`) and the mock's Master is (`Master.tsx:73`): default taken, Master stays ungated (it reads files the narrator picks), Delivery is gated.
- `shellPages` (`AppShell.tsx:70-74`) flattens `NAV_GROUPS`, so "Go to Delivery" comes with the item. `useGoToCommands.ts` names no page and needs no edit. `AppShell.test.tsx:64,133,355` list page names and gain `Delivery`.
- `useNavCounts.ts`: Delivery has no count in the mock. The mock draws a failing-file count on Master (`Shell.tsx:45`); the repo has no cheap read for it (the last measurement is read by `MasterQcPage`'s `measureState`; cost **unverified**). Default taken: no count on either; the missing Master count is listed for the Master parity audit (SN-C3).
- Order against the other rail slices: the mock's Finish group is Master & QC then Delivery, and Schedule sits beside Production and Editing gets its own group (`Shell.tsx:19-34`), so the three slices edit different lines of one array. `nav` is a one-at-a-time serial point: SN-M5 merges `main` first and inserts its line in place.
- ADR bookkeeping: [ADR 0802](../adr/0802-schedule-and-delivery-are-pages-with-their-own-rail-items.md) says the slice that lands the first of the two items edits ADR 0407's decision 5 note.

## Questions the PRD leaves open, with the default taken

None blocks a slice; each goes on #992 with its default (D22, D64, D65).

1. **Where do project-scope settings go in a single page, and what becomes of the Global / This Project switch?** The mock has no scope. Default: the mock's panels on top (they are per project or per machine, as the mock has them), then the kept categories under one heading with the existing scope tabs, because 12 of the 18 categories offer a project scope, 10 of them beside Global (`SETTINGS_CATEGORIES`, `Settings.tsx:35-67`). Reason: dropping the switch loses per-project overrides that have no replacement.
2. **Delivery profile: per project (mock) or Global default plus project choice (repo)?** Default: the new select is the project's choice; the Global default stays in the kept Delivery category (finding 6). A new project still asks at import (SN-M44).
3. **Experimental REAPER actions (SNM-Q3).** Default: stays a generic field on the Daw category, unchanged (`app.go:1477`), until the DAW promotion plan empties the list.
4. **Mock panels with no model (finding 2).** Default: SN-M52 builds only the panels the repo can back (Delivery profile select, Appearance, Keyboard list, Manuscript, mounted sections) and leaves Recording, Definitions, Reader text, Marks and Story Bible types as listed gaps, each needing its own host slice. The owner can instead ask for the models in this PRD.
5. **Booth category** follows the Booth audit's question 2 (microphone, engine and model controls): kept until the owner rules.
6. **Master gating and count** (the rail section): Master ungated, no counts.

## Slice adjustments

- **SN-M31:** no such issue exists (the Backups note on #1270 says so); the two backups settings are SN-D82's (#1203). Nothing to adjust.
- **SN-M32, SN-M33:** unchanged in size and files. Both register through `sections.ts` into the `Daw` and `ManuscriptGuide` categories, which are kept, so they mount inside the trimmed `Settings` component (finding 1).
- **SN-M41:** smaller. It edits one custom profile's name, numbers and files; Duplicate, Delete and rules-off stay in Settings (finding 6). Check that each mock "Files" row maps to a rule id (**unverified**). Add "Rules and their sources" below the card.
- **SN-M42:** the grid drops Clicks and Text (finding 3). Add: take the measuring job out of `MasterQcPage` (finding 4); keep `FileRulesPanel` under the detail panel; carry the "Suggested fix" lines.
- **SN-M43:** add `MasterToSpecPanel`, `MasteringChain`, `DiagnosticsSection`, `ReportExportPanel` in the left column in today's order; the aside takes the credits row; the Silence cleanup button needs `#cleanup`. Larger than 0.9 pw if the measuring job is also its job.
- **SN-M44, SN-M45:** SN-M44 unchanged. SN-M45 adds `MultiPlatformExportPanel` and the `/delivery#file=` rule, and calls `useExportJobs` itself.
- **SN-M52:** narrower and smaller than 1.0 pw (finding 2, question 4). It must not delete anything; it mounts the trimmed `Settings` below the mock panels, so its "Must not touch `Settings.tsx`" becomes "mount `Settings` unchanged", and the trim is SN-M5's. Tests 1, 3, 4, 5 and 6 move to follow-up slices.
- **SN-M5:** `Settings.tsx` is trimmed, not deleted (finding 1). Do not delete `RuleBadges.tsx`, `FileRulesPanel.tsx`, `DeliveryProfilesPanel.tsx`, `DeliveryProfileEditor.tsx`, `deliveryProfile.ts`, `deliveryFormat.ts` or `masterLink.ts`; delete `fileVerdict.ts` and `bookSpread.ts` only after `knip`. The visual and doc-screenshot rows to rewrite are the counts in [Old equivalents](#old-equivalents). Add `#cleanup`, drop the `/delivery` redirect, and edit ADR 0407 decision 5's note.
