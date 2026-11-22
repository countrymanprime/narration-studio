# Inline error text audit (2026-11)

Tracking issue: [#4045](https://github.com/countrymanprime/narration-studio/issues/4045).

Dated evidence, 2026-11-22, against `main` at `ae5567361`. Scope: every `.tsx` under `src/studio/ui/src` (tests and stories excluded), except the Output options page ([#4044](https://github.com/countrymanprime/narration-studio/issues/4044)). Paths are relative to `src/studio/ui/src/components`, except `hooks/` and `overlay/`, which are under `src/studio/ui/src`; a line number is the element at that commit.

The rule (owner words on #4045, `docs/design/design-system.md#errors`, rule 7 of `.claude/skills/frontend-primitives/SKILL.md`): an error appears only as a toast, in a dialog, or in a result slot that is always present at a fixed size. Text that appears or disappears in a page's flow and moves its neighbours is a defect, whatever its role. The guard `tests/visual/guards/inlineErrors.ts` counts only `role="alert"` outside files named `*Dialog|Confirm|Menu|Popover|SlideOver|Toast`, so it misses errors drawn with `role="status"`, a bare `<p>`, danger or warn colour, or `Field`'s `error`, and it counts alerts that sit inside an overlay that is not in a file of that name.

## What exists to reuse

| Need | Existing thing | Path |
| - | - | - |
| Toast for a failed read or action, one per message, gone when it clears, optional Retry | `useErrorToast(message, retry?)` | `hooks/useErrorToast.ts` |
| Toast from an event handler, with a Retry action | `notify(text, 'error', retryAction(fn))`, `overlay.toast(text, { tone: 'error', topic, action })` | `hooks/useToasts.ts`, `overlay/overlayService.ts`, `primitives/Toast.tsx` |
| A question or a choice | `ConfirmDialog`, `Dialog`, `WorkDialog`, `SlideOver` | `primitives/` |
| A reason on something that cannot be used | `disabledReason` on `Button` / `IconButton`, `TooltipTarget` | `primitives/` |
| A cue that stays in a fixed cell with the reason in a tooltip | `StatusBadge` inside `TooltipTarget` (`ScanStatus`), `CheckedStamp`, header `HeaderChip` | `storybible/suggested/panel/ScanStatus.tsx`, `primitives/` |
| A line whose box is the same in every state | `WorkerPlanNote` (`min-h-[3lh]`), `LiveTracksLine`, `CheckLine`, `ThreadsTab` slot (`min-h-[1.25rem]`), `RunOptions` reserved slot, `OutputPanel` `why` span | see paths in the file list |
| A failed read that replaces a whole page or section | `LoadError`, `LoadErrorPanel` (they also take away a toast with the same sentence) | `layout/LoadError.tsx` |

No new error component is added by the fixes.

## Fix shapes used below

- **T**: `useErrorToast` or `notify`, and the text goes. If the line was also a status ("Reading..."), keep that line.
- **D**: `ConfirmDialog` (a question the narrator has to answer).
- **S**: a slot that is present in every state at a fixed size (a `min-h` line or a badge with a tooltip).
- **R**: reason as `disabledReason` or tooltip on the control.
- **F**: false positive of the guard (inside an overlay); make the guard see it, no UI change.

## Settings and credits (settings/**, credits/**)

Shifts: 38 of 58 entries; 24 allowlisted (22 shift, 2 false positives in `DeliveryProfileEditor.tsx`); 16 shifting entries are not allowlisted.

| File:line | Shows | Allowlisted | Fix |
| - | - | - | - |
| `settings/page/SettingsPage.tsx:402` | "Changes cannot be saved right now" warn card on every pane | no | T once, drop the card (the row has its own error) |
| `settings/page/SettingsPage.tsx:408` | "Your settings could not be read" card with Retry | yes | T with `store.reload` |
| `settings/page/ModelsPane.tsx:52` (drawn 98, 170) | notice card above the list: folder not opened, remove blocked or refused, setting not moved | yes | T (`overlay.toast`, as `ModelsFolder.tsx:78` does); delete the card |
| `settings/page/ModelsPane.tsx:88` | catalog read failed replaces the table | yes | T with refresh; keep the loading frame |
| `settings/page/ScopedFieldsPanel.tsx:260` | "Settings could not be loaded" (unreachable on main: every caller passes `pageSaysReadError`) | yes | delete the branch and prop; T for a failed project-scope read |
| `settings/page/StoryBibleTypesPanel.tsx:240` | read, rename, colour, remove, add failures and "Give the type a new name" under the list | yes | T |
| `settings/page/MarksPanel.tsx:44` | mark types could not be read replaces "Reading..." | yes | T with `marks.retry` |
| `settings/row/SettingRowView.tsx:335` | the row error under every Settings row (no role; collapses when empty) | no | T per row; keep `aria-invalid` on the control |
| `settings/row/SettingRowView.tsx:330` | heavy-model and thread-count warnings | no | D (the existing `row.costly` path) or tooltip |
| `settings/row/SettingRowView.tsx:268` | "No local model installed" / governed-by reason | no | R (`disabledReason`, as `SpeakerFallbackBody` does) |
| `settings/controls/MwKeyBody.tsx:66` | key state could not be read | yes | T |
| `settings/controls/MwKeyBody.tsx:101` | `Field` error: save or sign-up failed | no | T; drop the `Field` error |
| `settings/controls/MwKeyBody.tsx:119` | test or remove failed | yes | T, or the always-present result span at :125 |
| `settings/controls/EngineBody.tsx:127` | bridge problem line | no | S (the Connection card's always-present detail) or T |
| `settings/controls/EngineBody.tsx:235` | read failed replaces "Reading how this project records..." | yes | T |
| `settings/controls/EngineBody.tsx:306` | test connection result line has no reserved height | no | S (`min-h-[1lh]`) |
| `settings/controls/EngineBody.tsx:312` | choose or link failed | yes | `notify` |
| `settings/controls/DefinitionsBody.tsx:94` | local dictionary removal or download failed | yes | T (as `AssetNote` does) |
| `settings/controls/CreditsBody.tsx:101` | credits summary read failed | yes | T with re-read |
| `settings/controls/DeliveryBodies.tsx:35` | delivery profiles could not be read | yes | T |
| `settings/DeliveryProfilesPanel.tsx:231` | same, in `Gate` | yes | T |
| `settings/DeliveryProfilesPanel.tsx:298` | custom profiles could not be read notice | no | T |
| `settings/DeliveryProfileEditor.tsx:142,182,231` | rule, save and name problems | yes (2) | F: inside a `Dialog` |
| `settings/controls/SampleOutputBody.tsx:129` | outputs cannot be listed | yes | T; select keeps a `disabledReason` |
| `settings/controls/SampleOutputBody.tsx:137,164` | saved output missing, last-checked line | yes | T once (the option already says "not connected") |
| `settings/controls/MicBody.tsx:251` | microphone list also carried an error | no | T |
| `settings/controls/modelsControls.tsx:23` | models folder cannot be found | no | T |
| `settings/BackupsSection.tsx:72` | backups settings could not be read replaces the rows | yes | T |
| `settings/BackupsSection.tsx:80` | backups unavailable message replaces the rows | no | R |
| `settings/BackupsSection.tsx:107` | save refused | yes | T |
| `settings/KeyboardPanel.tsx:134` | "Replace takes it from X" conflict | yes | D (ask when Replace is pressed) or fold into the always-present status line at :131 |
| `settings/UpdatesPanel.tsx:94` | status read, check, install, open notes failed | yes | T with check |
| `settings/RetailSamplePanel.tsx:126` | load or save failed | yes | `notify` (prop exists) |
| `settings/CreditsPanel.tsx:470,592` | templates and values could not be read, with Retry (also toasted at :181, :151) | no | T with the retry on the existing toast; drop the line |
| `settings/analysis/AnalysisToolsSection.tsx:59` | analysis tools could not be listed replaces the list | yes | T |
| `settings/analysis/ToolRow.tsx:79` | failure detail disclosure grows the row | no | tooltip or a `Dialog` from an `IconButton` |
| `settings/models/AssetRow.tsx:122,123` | "A file failed its check", unavailable reason line | no | R on the badge or Repair button |
| `settings/controls/AppearanceBodies.tsx:151` (via `editing/output/OutputControls.tsx:69`) | "This computer would not list its outputs" in the Settings page flow | yes (as OutputControls) | T in `DeviceRow` for the Settings use |

Allowed (no change): `WorkerPlanNote`, `AssetNote` badge, number boxes' `aria-invalid` with the static range note, `MwKeyBody:125` result span, `MicBody:130,167,218`, `KeyboardPanel:131`, `RetailSamplePanel:100`, `UpdatesPanel:126`, `DefinitionsBody:68`, `CreditsBody:36`, `credits/*` (toasts or inside a dialog), `AppearanceBodies:333`, `CapabilitiesRowBody:19`.

## Booth (booth/**)

| File:line | Shows | Allowlisted | Fix |
| - | - | - | - |
| `booth/CompanionShell.tsx:175` | could not pin the window beside the DAW | yes | T |
| `booth/ReadAlongView.tsx:81` | session or host error above the text | yes | T (the Booth page already reports it through `listeningProblem`) |
| `booth/ResumePrompt.tsx:330` | locate failed, with Retry, replaces the loading line in the card | yes | T with retry; the card keeps a plain from-the-top line |
| `booth/side/VoicesInChapter.tsx:33` | voice samples could not be read | yes | T; hear buttons keep `disabledReason` |
| `booth/side/VoicesInChapter.tsx:27,52` | "Can't tell whether a take is recording" + Check again | no | topic toast with a Check again action (the `BoothNextPage:758` pattern) |
| `booth/frame/BoothFooter.tsx:184` | "The text cannot follow your voice" (an extra row below 1024 px, a wrapping cell above) | no | T for the error cases; Record options already shows a warn badge; or S |
| `booth/record/RecordSetup.tsx:103,148,253`, `booth/record/ChapterLinkNotice.tsx:54` | connection chip row appears above the footer | no | S: `ConnectionIndicator` in the always-present header slot, as `editing/page/useChapterLink.tsx` does |
| `booth/UnresolvedCreditsWarning.tsx:10` | credits tokens have no value box | no | the existing `HeaderChip` (`booth/page/CreditsWarning.tsx`) |
| `booth/record/RecordSetup.tsx:288` | turned-away alert | yes | F: inside `ConnectionResolveDialog`, which the guard now reads as a dialog |

Compliant: whole-page `LoadError`, `BoothUnavailable`, `LevelsMenu` (popover, plus fixed line and toast).

## Editing (editing/**)

| File:line | Shows | Allowlisted | Fix |
| - | - | - | - |
| `editing/cleanup/CleanupTab.tsx:119` | findings read failed | yes | T with retry |
| `editing/cleanup/CleanupInspector.tsx:114` | "The DAW did not answer" / "X is not running" note | no | R on the action buttons, or S |
| `editing/effects/AddEffect.tsx:61` | coverage over the cap, Add anyway | yes | D |
| `editing/effects/AddEffect.tsx:118` | favourites could not be read | yes | T |
| `editing/effects/AddEffect.tsx:85,93` | select-first or DAW refusal under the buttons | no | R |
| `editing/effects/ChooseInDaw.tsx:69` | DAW problem box | yes | T (the status line at :50 is already a fixed line) |
| `editing/effects/EffectSettings.tsx:367` | turning on would pass the cap, Turn on anyway | yes | D |
| `editing/effects/ProjectFx.tsx:46` | FX chain read failed replaces the table | yes | T |
| `editing/effects/CoverageStrip.tsx:77` | fx cap error | no | T |
| `editing/stack/RetryBar.tsx:77` | retry-mode save failed | yes | T |
| `editing/backups/BackupsInspector.tsx:79` | backup settings read failed replaces the inputs | no | T; keep the fields, disabled |
| `editing/takes/prep/PrepControls.tsx:29` | "figures could not be measured again" (already toasted at `usePrepSteps.tsx:105`) | no | delete the line, or a badge with a tooltip |
| `editing/takes/TakeCompare.tsx:47` | not comparable, pick two different takes, skip reasons | no | R on A and B; skips as a toast |
| `editing/page/EditOffNotice.tsx:6` | "Delete, Mute and Add FX are off" strip | no | R (buttons already carry `disabledReason`) |
| `editing/page/NoAudioBanner.tsx:39` | no audio banner above the script | no | S: `ConnectionIndicator` in the header slot plus a dialog; T for `unreadable` |
| `editing/EditingCheckPanel.tsx:336,343,415`, `editing/output/OutputControls.tsx:31,69,96` | alerts inside a `SlideOver` / a `Popover` | yes (3 + 1) | `EditingCheckPanel`: T (a slide-over's body is in scope, #4045); `OutputControls`: F |

## Script (script/**)

| File:line | Shows | Allowlisted | Fix |
| - | - | - | - |
| `script/page/rail/threads/ThreadsTab.tsx:108` | marks read failed replaces the tab body (a duplicate of the `ScriptPage:148` toast) | yes | draw the empty tab |
| `script/page/rail/words/DefinitionBlock.tsx:92` | "X cannot be reached" card replaces a one-line state | no | T |
| `script/page/chapters/CreditsSection.tsx:67` | unresolved tokens, Fill in | no | `HeaderChip` (as `CreditsWarning`) or S |

## Engine, layout, project, stages, mapping

| File:line | Shows | Allowlisted | Fix |
| - | - | - | - |
| `engine/AudacityLinkCard.tsx:47` | first read failed replaces "Reading how Audacity is doing..." | yes | T; keep a fixed muted line |
| `engine/AudacityLinkCard.tsx:146` | start, link, unlink, check failed at the card's foot | yes | T |
| `engine/ChapterLinksTable.tsx:131` | links or tracks read failed above the table | yes | T with refresh |
| `engine/EnginePanel.tsx:198` | tracks list or select rejected between the project card and tools | yes | T |
| `engine/EnginePanel.tsx:288,302` | "REAPER is not running", "different project open" warn cards | no | header `StatusBadge` with the reason in a tooltip, details in the existing `ReaperOffDialog` (approved default (a) on #4045) |
| `engine/ChapterSyncPanel.tsx:175` | "REAPER has changes that aren't saved yet" | no | header `StatusBadge` + `TooltipTarget` |
| `engine/ToolResult.tsx` | result box, only drawn in 5 dialogs | yes | F |
| `stages/StageSuggestion.tsx:33` | "Couldn't check" in the same `Note` box as "Checking..." | no | keep the box; add the toast in `ProofingStagePanel` |
| `stages/StageEvidence.tsx:69` | "Couldn't check this chapter" replaces the slide-over body | yes | T; a slide-over's body is in scope (#4045) |
| `mapping/ChapterTrackLinkFix.tsx:41` | "The REAPER tracks could not be listed" | no | T; keep a fixed muted line |
| `project/ProjectPicker.tsx:263` | switch, open, browse, pin failed under the title | yes | `notify` |
| `project/ProjectPicker.tsx:290` | "Couldn't load recent projects." replaces the empty body | no | T with reload |
| `primitives/Field.tsx:92` | `error` line drawn only when set | no | keep the line always present (like `hint`), or move uses to T |
| `layout/StartupScreen.tsx`, `primitives/ErrorBoundary.tsx` | whole-app and whole-route error screens | no | no shift of an existing page; listed |
| `layout/AddressGate.tsx:194`, `layout/LoadError.tsx:35`, `layout/NotFoundPage.tsx:14` | whole-page screens | yes | keep (replace the page); not layout shifts of a page |

Compliant: `LiveTracksStatus`, `NestedChaptersNotice`, `CheckLine`, `CheckedStamp`, `ConnectionIndicator`.

## Production, master, delivery, pickups

| File:line | Shows | Allowlisted | Fix |
| - | - | - | - |
| `production/ProductionPage.tsx:382` | stage timer start or stop refused, pushes the KPI row | yes | T |
| `production/ChapterTrackPanel.tsx:213` | track audio could not be played | yes | T |
| `production/ChapterTrackPanel.tsx:287` | REAPER tracks could not be listed | no | T; keep a muted line (`LiveTracksLine`) |
| `production/ChapterTrackPanel.tsx:166,176` | linked track is gone, tracks look like this chapter | yes (2 / no) | a state: header `StatusBadge` "Missing" |
| `production/CreditsRowPanel.tsx:65` | unresolved credit tokens | yes | status role, fixed slot or badge |
| `production/readiness/ReadinessPanel.tsx:56,106` | recommendations read failed replaces the drawer body; "Changed since..." list | yes (2) | T; the list is a verdict (drop `role="alert"`) |
| `master/MasterToSpecPanel.tsx:259` | a failed file's reason under the Failed badge grows the row | no | badge + `TooltipTarget` (job error is already toasted) |
| `master/MultiPlatformExportPanel.tsx:73` | per-platform build error line | no | badge + tooltip; the job toast exists |
| `masterqc/files/FileChecks.tsx:38` | "Can't tell what your DAW can do right now" | no | T (gates carry `disabledReason`) |
| `master/MasteringChain.tsx:154` | chain unavailable notice | no | `overlay.toast` with a topic, or S |
| `delivery/profile/ProfileCard.tsx:94,164,172` | profiles could not be read, can't tell if still the project's profile, save refused or notice | yes (3) | T; badge "May be out of date" for the re-read |
| `delivery/page/OutputPanel.tsx:161` | "Cancel was sent, but the host did not confirm it" | no | the existing `why` slot at :141, or T |
| `pickups/list/PickupsTable.tsx:379` | first read failed replaces the body | yes | T; muted empty state with Retry |
| `pickups/list/PickupsTable.tsx:352` | "Can't tell if this list is current" strip above the rows | no | T with reload; badge "May be out of date" |

## Proof, recording check, schedule, Story Bible

| File:line | Shows | Allowlisted | Fix |
| - | - | - | - |
| `proof/RenderAssociationSection.tsx:26,51,52` | render read failed; stale, missing or unsupported reason; last measurement failed | yes / no / no | T; a danger `StatusBadge` with the reason in a tooltip |
| `proof/PreviewPanel.tsx:164` | preview suggestions could not be read | yes | T with retry; muted `EmptyLine` |
| `proof/PreviewPanel.tsx:310` | pinned preview is stale | no | badge or fixed slot |
| `proof/NativeTakesPanel.tsx:184` | an action on a take failed | yes | T |
| `proof/CompareRun.tsx:630,596` | marker export result; "REAPER project may have changed" | no | `notify` for errors; fixed progress slot |
| `proof/checkcard/CheckCard.tsx:333,324` | coverage or findings load failed; stale banner | yes (2) | T; badge |
| `proof/inspector/Inspector.tsx:211`, `InspectorActions.tsx:136`, `TrimGap.tsx:97` | decision save, Hear it / Show in DAW, trim failures (`empty:hidden` lines move the layout even on success) | yes (3) | T; make the status line a fixed `min-h-[1lh]` slot |
| `proof/inspector/FindingThread.tsx:214` | "Not saved: ..." note | yes | T |
| `proof/inspector/EvidenceChangedBanner.tsx:31` | evidence changed, Use new evidence | yes | D |
| `proof/ProofChapterPage.tsx:192` | align again, unlinked, missing track notices strip above the panels | no | fixed slot in the title row (`SavedProjectChip` row) or a badge |
| `recordingcheck/CheckResult.tsx`, `RunningView.tsx`, `proof/proofOptions/ProofOptions.tsx:124` | alerts drawn only inside `CheckRecordingsDialog` / the options dialogs | yes (2, 1, 1) | F |
| `schedule/SchedulePage.tsx:78` | first read failed replaces the page body | yes | T with reload; page frame with Retry |
| `schedule/SchedulePage.tsx:234` | "Couldn't read the schedule again" strip pushes the heading down | no | T; badge "May be out of date" |
| `storybible/Guide.tsx:450` | "This link points to an entry that is not in the Story Bible" | yes | D (Dismiss / Go to Production is a two-choice question) or toast with action |
| `storybible/ReadNotice.tsx:9` (drawn `Guide.tsx:461,468`, `GuideDetail.tsx:950`) | "Could not read the types or chapters" strip | no | T; fixed cue |
| `storybible/DialogueCueAttribution.tsx:64`, `VoiceReferencesSection.tsx:96` | cues or references load failed | no | T |
| `storybible/CommonsAudioLookup.tsx:34`, `OnlinePronunciationLookup.tsx:50` | Commons or Merriam-Webster lookup failed | no | T |
| `storybible/GuideDetail.tsx:1086` | add-name validation line (field validation) | no | S: a note slot always present under the box |

Allowed: `master/DiagnosticsTables.tsx:94` (row's own cell), `storybible/voicesamples/VoiceSampleRow.tsx:135`, `schedule/ContractPanel.tsx:97`, `MilestoneTable.tsx:211` (`sr-only` + `aria-invalid`), `recordingcheck/CheckRecordingsButton.tsx:17` (tooltip reason), toasts in `MasterPage`, `Preflight`, `ScanStatus`, `VoiceSamplesBody`, `OutputPanel`.

## Counts

| Area | Real entries | Shift | Allowlisted | Not allowlisted |
| - | - | - | - | - |
| settings, credits | 58 | 38 | 24 | 34 (16 shift) |
| booth | 9 | 9 | 5 (1 false positive) | 4 |
| editing | 15 | 15 | 9 (1 false positive, `OutputControls`; `EditingCheckPanel`'s 3 are in scope, see the second pass) | 6 |
| script | 3 | 3 | 1 | 2 |
| engine, layout, project, stages, mapping | 8 errors + 3 warnings + `Field` | 11 | 5 (+ `ToolResult` false positive) | 3 errors + 3 warnings + `Field` |
| production, master, delivery, pickups | 17 | 17 | 8 | 9 |
| proof, recording check, schedule, Story Bible | about 35 | about 35 | 18 (3 false positives) | about 17 |

## Guard gaps

1. An error without `role="alert"` is invisible to the guard: `role="status"` with danger or warn text, a bare `<p>`, `Field`'s `error`, a `StatusBadge` line under a control (about 45 entries above).
2. A status `<p className="empty:hidden">` beside an alert shifts the layout on success too (`Inspector`, `InspectorActions`, `TrimGap`).
3. Alerts drawn by files that only ever render inside a dialog, slide-over or popover are counted because the file name does not end in `Dialog`, `SlideOver` or `Popover` (`CheckResult`, `RunningView`, `ProofOptions`, `ToolResult`, `DeliveryProfileEditor`, `OutputControls`, `RecordSetup`): 7 allowlist entries that cannot shift a page. `EditingCheckPanel`'s 3 were listed here too, but a slide-over's body is in scope (second pass), so they are real entries.
4. Nothing measures a shift: no test compares the neighbouring boxes between the ok and the error state.

## What the widened guard counts against these tables

Added after the guard was widened under #4045 (same base). The guard's rule is in [design-system.md#errors](../design/design-system.md#errors). The first widening counted 123 elements in 87 files, where the old guard counted 77 `role="alert"` elements in 61 files; the second pass below sets the counts the shrink-only list `src/studio/ui/tests/visual/guards/inline-errors-allowlist.ts` holds.

Taken off the list by the first widening because the element is inside an overlay (the second pass puts the slide-over files back): `editing/EditingCheckPanel.tsx` (3, its own `SlideOver`), `engine/EnginePanel.tsx` (1, its own `SlideOver`, so the warn cards at :287 and :299 are inside it too), `engine/ToolResult.tsx` (1), `production/ChapterTrackPanel.tsx` (2, its own `SlideOver`, with the line at :287), `production/CreditsRowPanel.tsx` (1, its own `SlideOver`), `proof/proofOptions/ProofOptions.tsx` (1, its own `Dialog`), `recordingcheck/CheckResult.tsx` (2), `recordingcheck/RunningView.tsx` (1) and `settings/DeliveryProfileEditor.tsx` (2, its own `Dialog`). `mapping/ChapterTrackLinkFix.tsx:41` is drawn only in `CheckResult` and the `EditingCheckPanel` slide-over; the second pass counts it, since the slide-over's body is in scope.

Counted, not in the tables above:

| File:line | Shows |
| - | - |
| `booth/companion/CompanionHost.tsx:113`, `booth/page/BoothNextPage.tsx:937`, `editing/page/EditingBody.tsx:628`, `editing/takes/prep/usePrepSteps.tsx:173` | the callers that draw `UnresolvedCreditsWarning`, `ChapterLinkNotice`, `EditOffNotice` and `PrepStatus` under a condition |
| `master/FileRulesPanel.tsx:49` | "Advice:" line in warn colour under a file's rule |
| `script/page/rail/words/WordCard.tsx:91`, `storybible/source/NamePronunciation.tsx:215` | `CandidatesCheckAgain` in place of the candidates when the lookup failed |
| `settings/UpdatesPanel.tsx:116` | the result block holding the failure line (listed above as allowed at :126) |
| `settings/page/ScopedFieldsPanel.tsx:307` | "Unsaved changes" in warn colour above Save |
| `storybible/voicesamples/VoiceSampleRow.tsx:136` | the problem sentence under the title (listed above as allowed at :135) |

Not seen by the guard, so the tables are their only record: the reason lines `settings/row/SettingRowView.tsx:268`, `editing/cleanup/CleanupInspector.tsx:114`, `editing/effects/AddEffect.tsx:85,93` and `editing/takes/TakeCompare.tsx:47` (a `reason` or `message` is not an error by its name alone: counting those names added 26 elements, 6 of them in these tables); the connection chip rows in `booth/record/RecordSetup.tsx`; `editing/page/NoAudioBanner.tsx`, which decides inside itself whether to draw; the add-name note `storybible/GuideDetail.tsx:1086`; and `layout/StartupScreen.tsx`.

The layout-shift spec `src/studio/ui/tests/visual/error-shift.spec.ts` also found that `WorkerPlanNote`, listed above as allowed, is not a fixed slot at 1440 and 1100 px: the plan the mock answers takes four lines, one more than its `min-h-[3lh]`, so the Speech to text row is 19.5 px shorter when the plan cannot be worked out.

## Second pass of the guard

Added after review of the first widening (same base). The guard now counts 137 elements in 91 files, 14 more than the first widening. A slide-over's body is in scope (#4045): a slide-over is a panel beside the page whose own content an error shifts, so the guard counts what a `SlideOver` draws, in its own file or another's; a modal dialog, a popover, a menu and a toast stay exempt.

| File | First widening | Now | Why |
| - | - | - | - |
| `booth/record/RecordSetup.tsx` | 2 | 0 | the turned-away alert and the facts line at :289 and :293 are inside `ConnectionResolveDialog`, whose every return is a dialog |
| `recordingcheck/background/BackgroundChecks.tsx` | 1 | 0 | `BackgroundChecksNotice`, drawn at :141, returns a `Dialog` |
| `proof/inspector/Inspector.tsx` | 1 | 2 | :165 draws `EvidenceChangedBanner` in some states, an exported component whose element is marked |
| `settings/controls/MicBody.tsx` | 1 | 3 | the views returned at :165 (the DAW cannot be asked) and :216 (the microphones could not be listed) say a failure; the table above lists the lines in them as allowed |
| `stages/StageEvidence.tsx` | 0 | 2 | its slide-over: :69, and the warn section at :111 |
| `editing/EditingCheckPanel.tsx` | 0 | 4 | its slide-over: :337, :344, :416 and the danger card at :349 |
| `engine/EnginePanel.tsx` | 0 | 3 | its slide-over: :199 and the warn cards at :288 and :302 |
| `production/ChapterTrackPanel.tsx` | 0 | 4 | its slide-over: :167, :177, :214 and the tracks line at :288 |
| `production/CreditsRowPanel.tsx` | 0 | 1 | its slide-over: :67 |
| `mapping/ChapterTrackLinkFix.tsx` | 0 | 2 | drawn in the `EditingCheckPanel` slide-over, so off `DRAWN_IN_OVERLAY`: :39, :43 |
| `production/ProductionPage.tsx` | 2 | 1 | :383, the timer's problem line; the timer's notice at :388 ("Timer stopped: …") is a success, and the guard reads a `notice` as an error only with an error mark |
| `settings/UpdatesPanel.tsx` | 3 | 2 | the one alert kept in `errorAlert` counts once, at :95 (it counted again at :99 and :110 where the variable is drawn); :126 is the failure line in the result block |

The Booth's real entries above include the connection chip rows of `booth/record/RecordSetup.tsx` (:103, :148, :253), which the guard does not count: they are drawn from a connection state, not an error mark.

What changed in the guard: a fixed slot exempts its contents only when the slot itself is always drawn, and only a `min-h-` that reserves a line counts as one. It looks through `.map` callbacks and calls, reads the view after an early return and a `case 'error':`, an error's `.message`, templates and drawn strings, `empty:hidden` and `hidden={…}`, and reads `noErrors`, `errors.length === 0` and a confirm's "You can't undo this" as no error. It learns from every file which exported components are dialogs, which are notices, and which are drawn only in an overlay (in what `overlay.open` renders, or in a component drawn only there); that replaced the exemption by file name, under which a file such as `HideOthersConfirm.tsx` or `JumpMenu.tsx` was never read. `DRAWN_IN_OVERLAY` keeps the one file it cannot learn, `primitives/Toast.tsx` (the toast region itself). `ProofOptions.tsx` and `ToolResult.tsx` came off it: each draws its own `Dialog` or is drawn only in one, so the exemption hid nothing.

The guard learns a component by name only when one file in `src` declares that name: `Section`, `Row`, `Note`, `SpeakerChip`, `SplitButton` and `DiagnosticsSection` are each declared in more than one file, so a `<Section>` is read as neither an overlay nor a notice. No file's count rested on an ambiguous name.

Still not seen by the guard, or counted when it is not an error:

- JSX assigned in a branch and drawn elsewhere (`let line; if (e) line = <p>…</p>; … {line}`) is not seen; one written as `const line = e && <p>…</p>` is counted where it is written.
- An exported component imported under another name (`import { Notice as Banner }`) or through a default export is not read as the overlay, notice or drawn-only-in-an-overlay component it is.
- Whether a message fits its `min-h-` slot is not read: `error-shift.spec.ts` measures it, so a fix of shape S registers its ok and failing pair in `tests/visual/error-states.ts`.
- A fixed slot that is always drawn inside a section that appears for a reason other than an error is counted with that section.
- An error in a `Popover`'s `trigger` attribute is not counted: the guard leaves out the whole popover.
- A view returned after a loading guard (`if (!data) return <Spinner />`) is counted for a danger or warn colour anywhere in it, such as a static "Beta" note.
- A colour in a style object kept in a variable (`style={dangerStyle}`) is not seen.

Lines the guard counts that the tables above list as allowed or that are not errors. The pull request that fixes each one checks whether it moves the page (an `error-states.ts` pair), then either changes the page to a fix shape above or adds a named exemption with its reason to `inlineErrors.ts`, and lowers the allowlist, so the list can reach empty:

| File:line | What it is | Task for the fixing pull request |
| - | - | - |
| `settings/controls/MicBody.tsx:165`, `:216` | the views drawn in place of the microphone list when the DAW cannot be asked or the list cannot be read | PR 2: make the failure a toast and keep the view's text the same in every state, or exempt the views with the reason |
| `storybible/voicesamples/VoiceSampleRow.tsx:136` | the problem sentence under a sample's title, beside its danger badge | the Story Bible pull request: move the sentence into the badge's tooltip, or exempt it as the row's own data |
| `settings/UpdatesPanel.tsx:126` | the failure line in the always-present result block (the audit's allowed :126) | PR 2: give the line a fixed slot or a toast; it is drawn only when a check failed |
| `master/FileRulesPanel.tsx:49` | the "Advice:" line in warn colour under a file's rule, advice and not an error | the Master pull request: draw it in muted text or exempt it with the reason |
| `settings/page/ScopedFieldsPanel.tsx:307` | "Unsaved changes" in warn colour above Save, a draft state and not an error | PR 2: a muted always-present status line, or an exemption with the reason |
