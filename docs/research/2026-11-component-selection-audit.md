# Component-selection audit (2026-11)

Tracking issue: [#3675](https://github.com/countrymanprime/narration-studio/issues/3675). Committed under [#3692](https://github.com/countrymanprime/narration-studio/issues/3692).

Dated evidence, 2026-11-20: every value control in `src/studio/ui/src/components` (selects, switches, checkboxes, radios, segmented groups, sliders, number and text boxes, tabs, menus, pickers) checked against the draft of [Component selection](../design/component-selection.md), each one opened in the source. The rule IDs (`CS-…`), table rows and anti-pattern numbers are the draft's. The page as committed applies the objections R1 to R12 and the missed cases M1 to M16 below, so a rule there may read differently from the one a row cites; [Notes added when this was committed](#notes-added-when-this-was-committed) says how.

Paths are relative to `src/studio/ui/src`. A line number is the control's opening tag at commit `76a3319ca`; each one was re-read against that commit on 2026-11-20.

## What this audit did not check

| Area | State |
| --- | --- |
| Rendered pixels (960 px, 683 px, light, dark) | **Not verified.** No screenshots were supplied and the copy has no `node_modules`, so none could be made. Every CS-S rule (sizing, clipping, wrapping) is unchecked; nothing below claims a control fits or overflows. |
| Guards (`rawNatives`, `iconButtonRule`, `inlineErrors`, `inFlowProse`) | **Not run** (no `node_modules`). Whether an allowlist already excuses a site below is unknown. |
| Action buttons (642 `Button` / `IconButton` sites, counted in the audit's inventory) | **Sampled only.** FP1 (text button where the catalogue has an icon) was checked where a value control was being read anyway; three hits are listed. A full FP1 pass is a separate job. |
| Destructive actions (CS-X), keyboard (CS-K), labels (CS-L) | Not audited systematically; noted only where seen beside a value control. |
| Dynamic option counts | A list built from host data (tracks, takes, profiles, effects, templates) is judged by CS-E2 (does it grow), not by a count. |
| `components/devtools/MockStatesPanel.tsx` | Skipped: developer panel. |

Impact: **High** = the narrator meets it in normal work, or it is the owner's named example; **Medium** = a dialog or panel used now and then, or a wrong control that still works; **Low** = consistency.

## 1. Settings (/settings)

The page with the most mismatches, and both of the owner's examples.

| # | Impact | File:line | Current control | Correct control | Rule |
| --- | --- | --- | --- | --- | --- |
| S1 | High | `components/settings/row/ValueControl.tsx:122` | Every host `choice` field is a `Select`, whatever its option count | Control chosen per row (see the six rows below); `Select` stays for 5 or more and for lists that grow | CS-E6, CS-E1, anti-pattern 5 |
| S1a | High | `components/settings/registry/rows.ts:317` `stt.live` (Whisper / Moonshine (Windows)) | `Select` of 2 | `ToggleGroup look="segmented"` | CS-E1 |
| S1b | High | `components/settings/registry/rows.ts:331` `stt.liveModel` (Tiny / Small) | `Select` of 2 | `ToggleGroup look="segmented"` | CS-E1 |
| S1c | High | `components/settings/registry/rows.ts:296` `stt.compareChunk` (30 / 60 / 300 / 600 s) | `Select` of 4 numbers | `ToggleGroup look="segmented"` | CS-N3 |
| S1d | Medium | `components/settings/registry/rows.ts:994` `app.channel` (Candidates and stable / Stable only) | `Select` of 2 | `RadioGroup` (labels are three words; segmented would wrap) | CS-E1 |
| S1e | Medium | `components/settings/registry/rows.ts:710` `project.spacy` (Small (en_core_web_sm) / Large (…)) | `Select` of 2 | `RadioGroup`, or segmented "Small / Large" with the id moved to the row's help | CS-E1 |
| S1f | Medium | `components/settings/registry/rows.ts:548` `voice.pron` (Automatic / CMU dictionary / Wiktionary / eSpeak) | `Select` of 4 | `ToggleGroup look="segmented"` if it fits at 683 px (not verified), else `RadioGroup` | CS-E1, CS-S3 |
| S2 | High | `components/settings/ScopedSetting.tsx:284` | Every scoped `choice` field is a `Select` (second copy of S1's logic) | Same rule as S1, from one shared renderer | CS-E6 |
| S3 | High | `components/settings/page/StoryBibleTypesPanel.tsx:89` | `Select` of six colour names (Green … Rose), `Swatch` at :75 | Colour selector, palette mode | CS-C1, anti-pattern 1 |
| S4 | High | `components/settings/row/ValueControl.tsx:170` and `:177` | Hand-written `TextField type="color"` named "… swatch" plus hex `SettledBox` (`look.note`) | Colour selector, free mode (`ColourField`) | CS-C2, CS-C3 |
| S5 | High | `components/settings/ScopedSetting.tsx:270`–`271` | Second hand-written colour pair; the picker is named "… hex" although it is not the hex box; hex saves on every keystroke, not on Enter or blur | Colour selector, free mode | CS-C2, CS-C3, CS-T3 |
| S6 | High | `components/settings/controls/TakeToneBody.tsx:19` | `RadioGroup` Off / On | `Switch` | CS-B1, anti-pattern 3 |
| S7 | High | `components/settings/controls/SyncEnabledBody.tsx:52` | `RadioGroup` Off / On, neither picked before the narrator has answered | `Switch` once answered; the unanswered state has no rule (missed case M3) | CS-B1, CS-B5 |
| S8 | Medium | `components/settings/controls/AppearanceBodies.tsx:148` | `Checkbox` "Silence playback", saved at once | `Switch` | CS-B2 |
| S9 | Medium | `components/settings/analysis/AnalysisToolsSection.tsx:91` | `Checkbox` "Offer better analysis when scanning", saved at once; `disabled` with no reason while it loads | `Switch` | CS-B2, CS-K2 |
| S10 | Medium | `components/settings/DeliveryProfileEditor.tsx:166` | `Switch` per rule in a draft applied by "Save profile" (:134) | `Checkbox` | CS-B2 |
| S11 | Medium | `components/settings/DeliveryProfileEditor.tsx:195` | `TextField inputMode="decimal"` for a rule's lowest / highest, validated by the page | `NumberInput` with unit after the box | CS-N1 |
| S12 | Medium | `components/settings/row/ValueControl.tsx:141` (8 registry rows: `editing.maxGap`, `headMax`, `tailMax`, `daw.fxCap`, `stt.workers`, `stt.backgroundProcessors`, `proofing.renderTolerance`, `project.wordsPerPage`) | `SettledBox` (a `TextField`) with page-written `numberProblem`; no arrow-key step | `NumberInput` | CS-N1, "Entering values" row 3 |
| S13 | Medium | `components/settings/ScopedSetting.tsx:178` | `TextField inputMode="decimal"` for a scoped number (third number box implementation) | `NumberInput` | CS-N1 |
| S14 | Medium | `components/settings/registry/rows.ts:766` `project.roomTone` | `Select` of 0 to 10 seconds (11 integers) | `NumberInput` min 0 max 10 step 1, unit "s" | CS-N1, CS-N3 |
| S15 | Medium | `components/settings/registry/rows.ts:152` `daw.reaperPath`, drawn at `components/settings/row/ValueControl.tsx:192` | Free-text path box, no Choose… button | Path field: `BreakablePath` + `Button` "Choose…" | CS-P3, anti-pattern 8 |
| S16 | Medium | `components/settings/registry/rows.ts:391` `stt.workers`, `:472` `stt.backgroundProcessors` | Number box where 0 means automatic (default 0) | An "Automatic (N)" option plus the number; see missed case M2 | CS-E3 |
| S17 | Medium | `components/settings/RetailSamplePanel.tsx:110`–`123` (Select at :25) | Four `Select`s: two of all chapters, two of "Line 1 … Line N" for every paragraph of a chapter | Chapters: searchable picker; line: `NumberInput` 1..N | CS-E2, CS-N1, anti-pattern 7 |
| S18 | Low | `components/settings/CreditsPanel.tsx:519` | `Select` of 3 (Opening / Closing / Chapter announcement) | `ToggleGroup look="segmented"` or `RadioGroup` | CS-E1 |
| S19 | Low | `components/settings/page/ModelsPane.tsx:188` | Segmented `ToggleGroup` of 5 (All / Speech to text / Voices / Language / Tools) as a table filter, with `overflow-x-auto` to cope | `Pill look="filter"` chips | Filter row of the table, CS-E1 (more than 4), CS-S3 |
| S20 | Low | `components/settings/controls/AppearanceBodies.tsx:132` | Segmented `ToggleGroup` of 5 speeds | `Select` by the letter of CS-N3; see rule objection R1 | CS-N3 |
| S21 | Low | `components/settings/controls/AppearanceBodies.tsx:38` (Theme, 3 short options) and `:49` (Motion, 2) | `RadioGroup` with no descriptions | `ToggleGroup look="segmented"` | CS-E1 |
| S22 | Low | `components/settings/controls/ProjectBodies.tsx:130` versus `components/production/target/TargetPopover.tsx:65` | The same setting (Schedule basis) is a `RadioGroup` here and a segmented `ToggleGroup` on Production | One control for one setting | CS-E1; missed case M9 |
| S23 | Low | `components/settings/ScopedSetting.tsx:221`, `components/proof/proofOptions/ProofOptions.tsx:79` | Text `Button variant="link"` "Reset" where the custom bodies (Zoom `components/settings/controls/AppearanceBodies.tsx:260`, `components/settings/controls/SyncEnabledBody.tsx:59`, `components/settings/controls/ChapterLayoutBody.tsx:18`) use `IconButton action="undo"` | `IconButton action="undo"` | FP1 |

Not a mismatch, checked: `components/settings/controls/SampleStorageBody.tsx:37` (RadioGroup of 3 with disabled reasons), `components/settings/controls/DefinitionsBody.tsx:84` (Radio rows with their own status), `components/settings/controls/EngineBody.tsx:258`, the reader sliders, `MicBody` / `SampleOutputBody` device selects, Zoom (6), Story Bible order (8), the five-model Whisper selects, `voice.id` (4 today, a list of voices that grows: stays a `Select` under CS-E2).

## 2. Story Bible (/story-bible)

| # | Impact | File:line | Current control | Correct control | Rule |
| --- | --- | --- | --- | --- | --- |
| B1 | High | `components/storybible/SpeakerColourField.tsx:43` | `Select` of "Automatic (Blue)" plus seven hue names, `Swatch` at :39 | Colour selector, palette mode, with Automatic as one of its choices | CS-C1, CS-C3, anti-pattern 1 |
| B2 | High | `components/storybible/DialogueCueAttribution.tsx:96` | `Select` of every speaker in the book, once per dialogue cue | Searchable picker (`SearchList` in a `Popover`), as the Booth's `components/booth/reading/SpeakerChip.tsx:117` already does | CS-E2, anti-pattern 7 |
| B3 | Medium | `components/storybible/Relationships.tsx:75` + `:93` | Page-built combobox: `TextField role="combobox"` over a `Listbox`; no arrow keys (Enter always picks the first match) | `SearchList` | Anti-pattern 21 |
| B4 | Medium | `components/storybible/voicesamples/MoveVoiceSampleDialog.tsx:78` | `Select` of all characters | Searchable picker | CS-E2, anti-pattern 7 |
| B5 | Medium | `components/storybible/GuideDetail.tsx:798` | A `Menu` of action items sets the entry's type; no `select="one"`, so the open menu does not show the current type; trigger imports `FontAwesomeIcon` (:813) | `Menu select="one"`, or `Select`; see missed case M7 | "Sort order" row by analogy; no rule fits exactly |
| B6 | Low | `components/storybible/VoiceReferencesSection.tsx:138` | `Select` of REAPER regions with "Choose a region…" as an option | Searchable picker if regions are many (grows with the project); placeholder via `placeholder`, not an option | CS-E2 |
| B7 | Low | `components/storybible/suggested/scan/AnalysisPrompt.tsx:30` | `Checkbox` "Don't ask again" | Stays; the rule is what is wrong (R6) | CS-B3 |

Not a mismatch: `components/storybible/SortMenu.tsx:20` and `components/storybible/FilterMenu.tsx:105` (Menu, as the table asks), `components/storybible/suggested/import/ImportDialog.tsx:331` (JSON / CSV segmented).

## 3. Script (/script)

| # | Impact | File:line | Current control | Correct control | Rule |
| --- | --- | --- | --- | --- | --- |
| C1 | High | `components/script/page/tools/select/MarksDialog.tsx:119` | `Select` of six colour names (Copper, Blue, Green, Amber, Red, Violet). **Not in the guideline's list of five colour sites.** | Colour selector, palette mode | CS-C1, anti-pattern 1 |
| C2 | Medium | `components/script/page/tools/select/MarksDialog.tsx:102` | Hand-built swatch `span` with an inline `var(--…)` background | `Swatch` | Hand-built copy of a primitive |
| C3 | Medium | `components/script/page/tools/speaker/SpeakerPicker.tsx:67` + `:97` | Page-built combobox (`TextField role="combobox"` + `Listbox` + own key handling) | `SearchList` | Anti-pattern 21 |
| C4 | Medium | `components/script/page/rail/words/DefinitionSourceMenu.tsx:11`–`:26` | `Popover` holding a list of ghost `Button`s with `aria-current` to choose one of three sources | `Menu select="one"`, or segmented `ToggleGroup` (3 short options) | CS-E1; hand-built copy of `Menu` |
| C5 | Low | `components/script/page/tools/select/MarksDialog.tsx:135` | Native `title` on the wrapper of the "Asks" checkbox as its hint | `TooltipTarget` | Actions table, hint row |
| C6 | Low | `components/script/page/tools/select/MarksDialog.tsx:136` | `Checkbox` "Asks", saved at once | `Switch` by the letter of CS-B2; see R3 | CS-B2 |
| C7 | Low | `components/script/page/tools/select/MarksDialog.tsx:127` | `Select` of six line styles by name (Highlight, Underline, Double line, Dotted, Wavy, Box) | No rule: a visual style wants a preview in each option (missed case M5) | none |

Not a mismatch: `components/script/page/chapters/PrepSegment.tsx:14` (3, segmented), `components/script/page/rail/threads/NoteCard.tsx:251` (2, segmented), `components/script/page/layout/RailPanel.tsx:35` (Tabs own panels), `components/script/page/tools/text/TextSettings.tsx` (font Select of 7, three sliders with readouts).

## 4. Production (/) and the Check recordings dialog

| # | Impact | File:line | Current control | Correct control | Rule |
| --- | --- | --- | --- | --- | --- |
| P1 | High | `components/production/ImportReview.tsx:286` | `Switch` per character candidate to select it | `Checkbox` per tile | CS-B2, CS-M1, anti-pattern 4 |
| P2 | High | `components/production/ImportReview.tsx:272`, `:278` | "Select all" / "Select none" text buttons | One `Checkbox` with `indeterminate` above the tiles | CS-M2, anti-pattern 13 |
| P3 | High | `components/production/ImportReview.tsx:180` | `Switch` per chapter to include it in the import (applied by the dialog's Import button). **The guideline names only the character tiles.** | `Checkbox` | CS-B2, anti-pattern 4 |
| P4 | Medium | `components/recordingcheck/CheckRecordingsDialog.tsx:393`, `:396` | "All" / "None" ghost buttons over a list of `Checkbox` rows (:415) | Header `Checkbox` with `indeterminate` | CS-M2, anti-pattern 13 |
| P5 | Medium | `components/recordingcheck/RunOptions.tsx:125` (with the slider at :114) | "Automatic: …" `Checkbox` beside the Parallel workers `Slider` it overrides | "Automatic (N)" as an option of the control | CS-E3, anti-pattern 18 |
| P6 | Medium | `components/recordingcheck/RunOptions.tsx:114` | `Slider` 1 to 8 for a count of processes | `NumberInput`, or a `Select` "Automatic (N), 1 … 8" that also fixes P5 | CS-N1 (a count is exact) |
| P7 | Low | `components/recordingcheck/RunOptions.tsx:101` | `Slider` 0 to 10 for whole seconds of overlap | `NumberInput` with "s"; arguable (R5) | CS-N1 / CS-N2 |
| P8 | Low | `components/recordingcheck/RunOptions.tsx:55` | The "Larger model" block appears when its checkbox is ticked and pushes the form down | Kept in place, off with a reason | CS-B4 |
| P9 | Low | `components/recordingcheck/RunOptions.tsx:92`, `:108`, `:121`, `:125` | Controls `disabled` while "Transcribe each recording whole" is on, none with a reason | `disabledReason` or a described reason | CS-B4, CS-K2 |
| P10 | Medium | `components/production/ChapterTrackPanel.tsx:213`, `:216`, `:219` | Text `Button`s with `FontAwesomeIcon` imported by the page for skip back, play / pause, skip forward; `disabled` with no reason | `IconButton action="play"` / `"pause"` (both in `icons.catalog.ts:272`–`273`) and catalogue rows for the skips | FP1, CS-K2 |

Three designs for one value. Parallel workers is a number box where 0 means automatic in Settings (S16), a slider plus an Automatic checkbox here (P5, P6), and a chip group "Auto / 1 / 2 / 4" on Proof (`components/proof/CompareRun.tsx:391`). Chunk length is "60 s" in a `Select` here and in Settings and "1m" in a chip group on Proof (`components/proof/CompareRun.tsx:373`). The Whisper model is a `Select` here and in Settings and a chip group on Proof (`components/proof/CompareRun.tsx:360`). One shared control per value would close S16, P5, P6, F2 and F3 together.

Not a mismatch: `components/production/report/ReportDialog.tsx:136` (HTML / JSON), `components/production/target/TargetPopover.tsx:65`, `components/production/CreditsRowPanel.tsx:72` (5 statuses), `components/production/ImportReview.tsx:210` (H1 to H6), the form checkboxes at `components/production/ImportReview.tsx:222`, `:230` and `components/production/ManuscriptImport.tsx:315`.

## 5. Proof (/proof)

| # | Impact | File:line | Current control | Correct control | Rule |
| --- | --- | --- | --- | --- | --- |
| F1 | High | `components/proof/ChapterCompare.tsx:44` | Segmented `ToggleGroup` "Compare view" switching three panels (:46, :59, :62); the options constant is named `TABS` and the doc comment says "behind tabs" | `Tabs` / `TabList` / `Tab` / `TabPanel` | "Which panel is showing" row, anti-pattern 16 |
| F2 | Medium | `components/proof/CompareRun.tsx:360` | Chip `ToggleGroup` of 5 models, each with its explanation in a `title` tooltip | `RadioGroup` with the caption as the option's description, or the `Select` the other two surfaces use | CS-E1 ("Not: ToggleGroup with tooltips carrying the explanation"), anti-pattern 6 |
| F3 | Medium | `components/proof/CompareRun.tsx:373`, `:391` | Chip `ToggleGroup`s (default look) for chunk length and workers; an unavailable option says why through `title`, not `disabledReason` | `ToggleGroup look="segmented"` with `disabledReason` | CS-E1, CS-E5, FP9 |
| F4 | Medium | `components/proof/notes/NotesPanel.tsx:201` | `Select` "Sort notes" in the notes toolbar | `Menu select="one" closeOnSelect` | "Sort order" row |
| F5 | Medium | `components/proof/NativeTakesPanel.tsx:161` | `Select` of "Paragraph 1 … N" for every paragraph of the chapter, per take | `NumberInput` 1..N, or a pick from the reader | CS-E2, anti-pattern 7 |
| F6 | Medium | `components/proof/proofOptions/ProofOptions.tsx:29`, `:35` | Third hand-written colour pair, picker named "… picker" | Colour selector, free mode | CS-C2, CS-C3, anti-pattern 2 |
| F7 | Low | `components/proof/proofOptions/ProofOptions.tsx:67` | `Select` for every `choice` option (third copy of S1's logic) | Shared choice renderer | CS-E6 |
| F8 | Low | `components/proof/NativeTakesPanel.tsx:157` | Ghost text `Button` holding a `FontAwesomeIcon` play / stop | `IconButton action="play"` / `"stop"` | FP1 |

Not a mismatch: `components/proof/CompareRun.tsx:413` (`TagInput`), `:494` (3, segmented), `components/proof/inspector/FindingThread.tsx:186`, `components/proof/inspector/TypeSelect.tsx:25` (10 types), the `Pill look="filter"` chips at `components/proof/notes/NotesPanel.tsx:195`, `components/proof/proofOptions/ProofOptions.tsx:55` (`NumberInput`), `:87` (`Switch`, saved at once).

## 6. Editing (/editing)

| # | Impact | File:line | Current control | Correct control | Rule |
| --- | --- | --- | --- | --- | --- |
| E1 | Medium | `components/editing/range/cut/CutDialog.tsx:144` | `Select` of 4 crossfades (0 / 6 / 12 / 25) | `ToggleGroup look="segmented"` | CS-N3 |
| E2 | Medium | `components/editing/range/cut/CutDialog.tsx:146` | `Select` of 3 edge pads (0 / 50 / 100) | `ToggleGroup look="segmented"` | CS-N3 |
| E3 | Medium | `components/editing/range/cut/CutDialog.tsx:154` | `Checkbox checked disabled` with a no-op `onChange`, used to state a fact ("… (required)") | Plain text or `CheckedStamp`; missed case M6 | CS-K2, anti-pattern 15 |
| E4 | Medium | `components/editing/effects/EffectSettings.tsx:364` (and the off copy at :62) | `Checkbox` "Bypass this effect", applied at once to the DAW | `Switch` | CS-B2 |
| E5 | Medium | `components/editing/voicesample/VoiceSampleDialog.tsx:183` | `Select` of all characters (grouped) | Searchable picker | CS-E2, anti-pattern 7 |
| E6 | Low | `components/editing/stack/RetryBar.tsx:51` | Segmented `ToggleGroup` whose options carry their meaning in `title` (:41, :43) | `RadioGroup` with descriptions, or visible full labels | CS-E1 ("Not" column) |
| E7 | Low | `components/editing/output/OutputControls.tsx:127` | Segmented `ToggleGroup` of 5 speeds | `Select` by the letter; see R1 | CS-N3 |
| E8 | Low | `components/editing/cleanup/CleanupHeader.tsx:10` | Chip `ToggleGroup` of 6 kinds, forced into a 3-column grid by a child selector on the wrapper | It is a list filter, so chips are right; the count (6) breaks CS-E1 and the page restyles the primitive's layout from outside | CS-E1, anti-pattern 6; R4 |
| E9 | Low | `components/editing/range/replace/ReplaceDialog.tsx:329`, `:332` | Two `NumberInput`s in seconds for a position in a file | No rule for entering a time position (missed case M4) | CS-N4 covers display only |

Not a mismatch: `components/editing/EditingCheckPanel.tsx:318` (2), `components/editing/cleanup/CleanupInspector.tsx:70` (4 with Custom), `components/editing/cleanup/CleanupList.tsx:41` + `:68` (header checkbox plus row checkboxes: the shape CS-M2 asks for), `components/editing/drawer/Drawer.tsx:64` (Tabs), `components/editing/range/cut/CutDialog.tsx:132` (RadioGroup, long labels), `components/editing/range/replace/ReplaceDialog.tsx:388` (5 fades, Select), `components/editing/backups/BackupsInspector.tsx:55`/`:67`, `components/editing/effects/CoverageStrip.tsx:63`, `components/editing/effects/EffectSettings.tsx:194`/`:212`, `components/editing/takes/TakeCompare.tsx:32`/`:33`, `components/editing/range/fx/FxDialog.tsx:96`, `components/editing/menu/marks/NoteDialog.tsx:52`.

## 7. Engine panel and DAW link

| # | Impact | File:line | Current control | Correct control | Rule |
| --- | --- | --- | --- | --- | --- |
| G1 | Medium | `components/engine/LinkChaptersDialog.tsx:319` | Plain `Select` of REAPER tracks, one per chapter row | `TrackSelect` (`components/mapping/TrackSelect.tsx`, which already hands a foldered project to `TreeSelect` and is used by four other track pickers) | "One item of a tree" row; hand-built copy of a shared control |
| G2 | Medium | `components/engine/CreateChapterRegionsDialog.tsx:65` | Plain `Select` of tracks for the credits | `TrackSelect` | Same |
| G3 | Low | `components/engine/VoicesCard.tsx:73` | `Select` of chapters | Searchable picker, or `ChapterStepper` if this card follows the current chapter | CS-E2, "A chapter" row |
| G4 | Low | `components/booth/voices/WhoIsInDialog.tsx:205` (Booth) | `Select` of voice tracks | `TrackSelect` | Same as G1 |

Not a mismatch: `components/engine/VoicesCard.tsx:196` (Flat / Voice folders), `components/engine/VoicesCard.tsx:263` (multi-select checkboxes), the dialog-option checkboxes.

## 8. Schedule (/schedule)

| # | Impact | File:line | Current control | Correct control | Rule |
| --- | --- | --- | --- | --- | --- |
| H1 | Medium | `components/schedule/ContractPanel.tsx:81` | `TextField inputMode="decimal"` for the rate, parsed by the page | `NumberInput`; money has no rule (missed case M1) | CS-N1 |
| H2 | Medium | `components/schedule/MilestoneDialog.tsx:82`, `:93` | `TextField inputMode="numeric"` for chapter and minute counts, clamped by the page on blur | `NumberInput` with min and max | CS-N1 |
| H3 | Low | `components/schedule/ContractPanel.tsx:68` | `Select` of 3 (Per finished hour / Royalty share / None or unspecified) | `RadioGroup` (labels of three words) | CS-E1 |

Not a mismatch: `components/schedule/MilestoneDialog.tsx:66` (`DateField`), `:115` (form checkbox).

## 9. Pickups, Booth, Master and QC, Delivery, App shell

| # | Page | Impact | File:line | Current control | Correct control | Rule |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | Pickups | Medium | `components/pickups/list/AddPickup.tsx:75` | `Select` of chapters | Searchable picker | CS-E2, anti-pattern 7 |
| K2 | Pickups | Low | `components/pickups/list/PickupsTable.tsx:429` | Row `Checkbox` "Include … in the session" with no header checkbox (it is the file's only `Checkbox`) | Header `Checkbox` with `indeterminate` | CS-M2 |
| K3 | App shell | Medium | `components/layout/JumpMenu.tsx:267` + `:315` (`role="combobox"` at :272) | Page-built combobox | `SearchList` | Anti-pattern 21 |
| K4 | Booth | Low | `components/booth/frame/LevelsMenu.tsx:559` | `RadioGroup` of 2 short options (Record / Cold read), no descriptions | `ToggleGroup look="segmented"` | CS-E1 |
| K5 | Master and QC | Low | `components/master/MasterToSpecPanel.tsx:232` | `Select` of 4 roles in every file row | Stays a `Select`; the rule has no case for a control repeated per table row (R2, M8) | CS-E1 by the letter |

Booth, Master and QC and Delivery are otherwise clean: `components/booth/reading/SpeakerChip.tsx:117` and `components/booth/voices/VoiceControl.tsx:223` (`SearchList`), `components/booth/frame/LevelsMenu.tsx:455` (`NumberInput`), `components/master/MasteringChain.tsx:161` (RadioGroup), `components/master/DiagnosticsSection.tsx:247`, the delivery profile selects (lists that grow, under 15).

## Missed cases (the guidelines have no rule)

| # | Case | Where it shows | Proposed rule |
| --- | --- | --- | --- |
| M1 | Money | `components/schedule/ContractPanel.tsx:81` | `NumberInput` with two decimals and the currency as the unit text; never a slider |
| M2 | A number that can also be "Automatic" | `components/settings/registry/rows.ts:391`, `:472`; `components/recordingcheck/RunOptions.tsx:114`+`:125`; `components/proof/CompareRun.tsx:391` | One shape: a `Select` or segmented group whose first option is "Automatic (N)". CS-E3 names enums only; a stored 0 that means automatic is the same defect |
| M3 | A boolean not yet answered (consent) | `components/settings/controls/SyncEnabledBody.tsx:49`–`:57` | Say whether this is a `Switch` shown off with a "not chosen yet" note, or a three-option enum. CS-B5 covers a three-valued setting, not an unset one |
| M4 | Entering a time position or duration | `components/pickups/list/AddPickup.tsx:82`, `components/editing/range/replace/ReplaceDialog.tsx:329`/`:332` | A time field (`m:ss.t`) primitive, or `NumberInput` in seconds with the clock value beside it. CS-N4 covers display only |
| M5 | An enum whose options are visual (line style, font) | `components/script/page/tools/select/MarksDialog.tsx:127`, the three font selects | Each option previews itself (as palette mode does for colour); a native `Select` cannot |
| M6 | A fixed fact drawn as a control | `components/editing/range/cut/CutDialog.tsx:154` | A fact is text or `CheckedStamp`, never a disabled checked box |
| M7 | A value shown as a chip that opens a menu | `components/storybible/GuideDetail.tsx:798`, `components/script/page/rail/words/DefinitionSourceMenu.tsx` | `Menu select="one"` with the current item checked, when the value sits in a header or a sentence |
| M8 | A control repeated in every row of a table | `components/master/MasterToSpecPanel.tsx:232`, `components/engine/LinkChaptersDialog.tsx:319`, `components/settings/page/StoryBibleTypesPanel.tsx:89`/`:98`, `components/script/page/tools/select/MarksDialog.tsx` | Row controls are compact: `Select` for any enum, `Checkbox` for a boolean column, the colour selector's popover form. The option-count thresholds apply to a control that stands alone |
| M9 | One setting drawn in two places | Schedule basis (S22), parallel workers, chunk length, Whisper model | The same value uses the same component and the same option labels everywhere, from one shared module |
| M10 | Multi-line text | Raw `textarea` at `components/script/bookmarks/ui/BookmarkEditor.tsx:120`, `components/script/page/rail/threads/NoteTextarea.tsx:8`, `components/storybible/suggested/import/ImportDialog.tsx:351`, `components/storybible/voicesamples/EditVoiceSampleDialog.tsx:89`, `components/editing/voicesample/VoiceSampleDialog.tsx:234` | "Entering values" has no row; `Field textarea` exists and should be named there |
| M11 | A file chosen in the browser | Hidden `input type="file"` at `components/storybible/suggested/import/ImportDialog.tsx:294`, `components/proof/ProoferSheet.tsx:112` | CS-P1 demands a host dialog; say when the browser's file input is allowed (content read in the page, no path kept) |
| M12 | A range (lowest and highest, from and to, start and end) | `components/settings/DeliveryProfileEditor.tsx:187`–`:209`, `components/editing/range/replace/ReplaceDialog.tsx:329`/`:332`, `components/settings/RetailSamplePanel.tsx:110`–`:123` | Two `NumberInput`s, each bounded by the other, one error slot |
| M13 | An index into the manuscript (paragraph, line) | `components/proof/NativeTakesPanel.tsx:161`, `components/settings/RetailSamplePanel.tsx:116`/`:123` | `NumberInput`, or a pick from the reader; never a `Select` of "Paragraph 1 … N" |
| M14 | Multi-select over tiles or a plain list with no header row | `components/production/ImportReview.tsx:282`, `components/recordingcheck/CheckRecordingsDialog.tsx:404` | CS-M2's header checkbox becomes an "All N" `Checkbox` with `indeterminate` above the list |
| M15 | A scope switch (All projects / This project) | `components/settings/page/ScopedFieldsPanel.tsx:160` | State whether it is a segmented `ToggleGroup` (as now) or `Tabs`; it changes which values the panel edits, which is neither a stored value nor a panel |
| M16 | Presets with a Custom option | `components/editing/cleanup/CleanupInspector.tsx:70` | Segmented presets plus "Custom", which the control selects itself when the numbers below stop matching; the code does this, no rule says so |

## Guideline rules that look wrong

| # | Rule | Problem | Proposed change |
| --- | --- | --- | --- |
| R1 | CS-N3, CS-E1 (cap of 4 for a segmented group) | The guideline's own example gives four playback speeds; the code has five (`components/engine/outputPrefs.ts:18`: 0.75, 1, 1.25, 1.5, 2). By the letter both speed controls (S20, E7) become `Select`s, which is worse for a value changed while listening | Cap by what fits: up to 5 when every label is four characters or fewer, else 4. Correct the example |
| R2 | CS-E6 ("the renderer picks by `field.choices.length`") | Count alone gives wrong answers: `voice.id` has 4 options today and grows (CS-E2 says long); `app.channel` and `project.spacy` have 2 options with labels too long for a segment (CS-S3); and CS-E4 adds a stale stored value to the list, so a 4-option row would change from segmented to `Select` when the host drops an option | The registry row declares its control (`segmented`, `radio`, `select`); a test checks the declaration against the option count and label length |
| R3 | CS-B2 (`Switch` for anything applied at once) | Applied to a boolean column in an editable list (`components/settings/page/StoryBibleTypesPanel.tsx:98` "Can speak", `components/script/page/tools/select/MarksDialog.tsx:136` "Asks") it puts a switch in every row; `Switch` also cannot say why it is off (CS-K3). Those two sites are not listed as mismatches above except C6 for this reason | `Switch` for a setting that stands alone; `Checkbox` for a boolean column of a list, whenever it saves |
| R4 | "A list filter" row versus CS-E1 | The row says `Pill look="filter"` chips; a default-look `ToggleGroup` is a group of `Pill`s (`components/primitives/ToggleGroup.tsx:54`), and three filters use `ToggleGroup` (`components/settings/page/SettingsPage.tsx:375`, `components/settings/page/ModelsPane.tsx:188`, `components/editing/cleanup/CleanupHeader.tsx:10`), two of them segmented. The page does not say whether a one-of-N filter is chips or segmented, nor whether the cap of 4 applies to filters | Name both: one-of-N filter is a default-look `ToggleGroup` (chips, may wrap, up to about 6); several-at-once is `Pill look="filter"`; segmented is for values only |
| R5 | CS-N1 versus CS-N2 | "Tunes by feel" does not settle small whole-number ranges (overlap 0 to 10 s, waveform arrow step 15 to 30 s at `components/settings/controls/AppearanceBodies.tsx:85`, workers 1 to 8). Reviewers will disagree | Add a test: if the narrator would ever say the number aloud or copy it from a guide, it is a `NumberInput`; a count of things is always exact |
| R6 | CS-B3 (labels phrased positively) | "Don't ask again" (`components/storybible/suggested/scan/AnalysisPrompt.tsx:30`) is the standard wording and the positive form is worse | Exempt "Don't ask again" / "Don't show again" |
| R7 | Decision table row for more than 15 options versus anti-pattern 21 | The table says to build a searchable picker "as `components/script/page/tools/speaker/SpeakerPicker.tsx`, `components/layout/JumpMenu.tsx` do"; anti-pattern 21 lists the same two files as page-built comboboxes to remove. Both write `role="combobox"` on a `TextField` themselves (`components/script/page/tools/speaker/SpeakerPicker.tsx:71`, `components/layout/JumpMenu.tsx:272`) | Cite `components/booth/reading/SpeakerChip.tsx:117` and `components/booth/voices/VoiceControl.tsx:223` as the model; they use `SearchList` |
| R8 | CS-C2 / CS-C3 ("five sites") | There are six: `components/script/page/tools/select/MarksDialog.tsx:119` is a third `Select` of colour names, with a hand-built swatch at :102 | List six; `ColourField` takes the caller's palette (speaker hues, type colours, mark colours are three different token sets) |
| R9 | CS-C3 palette mode (a row of swatch buttons) | Three of the four palette sites sit in a dense row (`components/settings/page/StoryBibleTypesPanel.tsx:89` is 100 px wide, `components/script/page/tools/select/MarksDialog.tsx`'s colour column is 7.5 rem). Six or eight 24 px targets do not fit there. Not verified in pixels | Two forms of palette mode: the inline row, and one swatch button that opens the same row in a `Popover` |
| R10 | CS-E6 together with the keyboard table's `ToggleGroup` gap | Moving Settings choices to segmented groups before `ToggleGroup` has arrow-key roving turns each one-stop `Select` into 2 to 4 tab stops down a long page | Fix the roving gap first, or in the same PR as S1 |
| R11 | Anti-pattern 4 and CS-M2 name only the character tiles of `components/production/ImportReview.tsx` | The chapter tiles (:180) use the same `Switch`-as-selection | Name both |
| R12 | "A sort order" row | Read strictly it also condemns the Settings row "Story Bible order" (`components/settings/controls/AppearanceBodies.tsx:305`), a stored setting with 8 options, where a `Select` is right | Scope the row to a sort control on the list's own toolbar |

## Proposed fix issues

Shared primitives first, because each closes rows on several pages; then one issue per page for what is left.

| Issue | Scope | Closes |
| --- | --- | --- |
| 1. `ColourField` primitive (palette and free modes, inline and popover forms) and move all six sites to it | `primitives/`, design-system row, story, test | S3, S4, S5, B1, C1, C2, F6; guideline R8, R9 |
| 2. One Settings value renderer: control declared per registry row; shared by `ValueControl`, `ScopedSetting`, `ProofOptions`; numbers on `NumberInput`; `ToggleGroup` arrow-key roving | `settings/row`, `settings/registry`, `primitives/ToggleGroup` | S1 (a to f), S2, S12, S13, S14, S23, F7; guideline R2, R10 |
| 3. Settings custom bodies: booleans to `Switch`, short enums to segmented, REAPER path field | `settings/controls`, `settings/analysis`, `DeliveryProfileEditor`, `CreditsPanel`, `ModelsPane` | S6, S7, S8, S9, S10, S11, S15, S18, S19, S21 (needs M3 decided for S7) |
| 4. `ComboSelect` primitive (closed box, `Popover`, `SearchList`) and replace the three page-built comboboxes and the long selects | `primitives/`, then callers | B2, B3, B4, C3, E5, K1, K3, G3, S17 (chapters); anti-patterns 7 and 21 |
| 5. Recording-check options as one shared module (model, chunk length, workers with "Automatic (N)") used by Settings, Check recordings and Proof | `recordingcheck/`, `proof/CompareRun`, registry rows | S16, P5, P6, P7, P8, P9, F2, F3; missed cases M2, M9 |
| 6. Multi-select: checkbox tiles and an "All N" checkbox with `indeterminate` | `production/ImportReview`, `recordingcheck/CheckRecordingsDialog`, `pickups/PickupsTable` | P1, P2, P3, P4, K2; missed case M14 |
| 7. Proof page | `proof/ChapterCompare`, `notes/NotesPanel`, `NativeTakesPanel` | F1, F4, F5, F8 |
| 8. Editing page | `range/cut/CutDialog`, `effects/EffectSettings`, `stack/RetryBar`, `cleanup/CleanupHeader` | E1, E2, E3, E4, E6, E8 |
| 9. Track pickers use `TrackSelect` | `engine/LinkChaptersDialog`, `engine/CreateChapterRegionsDialog`, `booth/voices/WhoIsInDialog` | G1, G2, G4 |
| 10. Schedule numbers | `schedule/ContractPanel`, `schedule/MilestoneDialog` | H1, H2, H3 (needs M1 decided) |
| 11. Story Bible and Script menus | `storybible/GuideDetail`, `storybible/VoiceReferencesSection`, `script/…/DefinitionSourceMenu`, `MarksDialog` hint | B5, B6, C4, C5 |
| 12. Production transport buttons | `production/ChapterTrackPanel` | P10 |
| 13. Guideline page: add M1 to M16, settle R1 to R12 | `docs/design/` component-selection page | Needs the owner's decision on R1, R3, R4 and M3 before issues 2, 3 and 8 can be finished (S20, E7, C6, K4, K5, S22 wait on it) |

Suggested order: 13 (decisions only) → 1 → 2 → 6 → 4 → 5 → the page issues. Every one of them changes what a page draws, so each needs the 1440 px and narrow screenshots in both themes that this audit did not have.

## Found while writing the guidelines

- `components/primitives/Button.tsx`'s comment says `md` is "the mocks' 32 px button (`--button-height`)" and `sm` is 28 px, but `styles.css` sets `--button-height` to 2.25 rem (36 px) and `--button-height-sm` to 2 rem (32 px), as `components/primitives/IconButton.tsx` says. The comment is stale.
- The swatch square of the free colour pair is named "… swatch" in `components/settings/row/ValueControl.tsx`, "… hex" in `components/settings/ScopedSetting.tsx` (the box that is not the hex box) and "… picker" in `components/proof/proofOptions/ProofOptions.tsx`.

## Notes added when this was committed

- **Decisions applied to the page.** The coordinator applied these defaults without the owner, who can overturn them: R1 (a segmented group takes 5 options when every label is 4 characters or fewer, else 4), R3 and M8 (rows of an editable list use `Checkbox`), R4 (a filter is chips in the filter look, whether one of N or several at once; segmented is for values; see the R4 note below), and the first-listed option of M3 (a `Switch` drawn off with a "Not chosen yet" note), M4 (a time field primitive) and M15 (a segmented `ToggleGroup`). R2 and R5 to R12 were applied as proposed.
- **R4 corrected.** R4's proposed change, and E8's "chips are right", took a default-look `ToggleGroup` for filter chips. It draws `Pill look="chip"` (`components/primitives/ToggleGroup.tsx:54`): 36 px, capitals, the accent fill, which `components/primitives/Pill.tsx` documents as a standalone toggle for a value. The filter look is `Pill look="filter"` (28 px, sentence case), and `ToggleGroup` has no option for it. The page (CS-E13) therefore asks for the filter look for a one-of-N filter, marks a `look="filter"` option on `ToggleGroup` as proposed, and lists all three filter sites as departures: `components/settings/page/SettingsPage.tsx:375` and `components/settings/page/ModelsPane.tsx:188` (segmented), `components/editing/cleanup/CleanupHeader.tsx:10` (default look). This is the coordinator's default, pending the owner.
- **R1 and the speed labels.** `rateLabel` (`components/engine/outputPrefs.ts:23`) draws each speed with a sign: `0.75×` and `1.25×` are 5 characters. Under the cap as decided, S20 and E7 stay mismatches until the sign leaves the option label or the owner raises the cap to 5 characters.
- **683 px.** The draft named 960 px and 683 px as the widths to check. The window's minimum is 960 px (`src/studio/desktop/main.go:74`), so a 683 px window is reached only by zoom. The visual suite captures 1440, 1024 and 768 px (`src/studio/ui/tests/visual/viewports.ts`); the page names the 1024 px (narrow layout) and 768 px (tiny layout) captures. "683 px" in S1f reads as the tiny layout.
- **M6.** The proposed rule offered `CheckedStamp` for a fixed fact. `CheckedStamp` draws when a check last ran (`at`, `reads`), so the page says plain text or a `StatusBadge`.
