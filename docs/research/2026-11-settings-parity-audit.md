# Settings parity audit (2026-11-03)

**Question.** The owner's rule: a page may configure a setting in place, but everything configurable must also have an equivalent on the Settings page. [Chapter sync's Layout row](https://github.com/countrymanprime/narration-studio/pull/2799) (Flat or Voice folders, in `voice-tracks.json`) existed only on the Engine panel. Which other controls break the rule? Tracked by [#2815](https://github.com/countrymanprime/narration-studio/issues/2815), under [#2251](https://github.com/countrymanprime/narration-studio/issues/2251).

**Method.** Read against `main` at `38d00e1`. Three read-only passes (Production, Script, Story Bible, Schedule, Pickups; Booth, Editing, Proof, Master & QC, Delivery; Engine panel, Companion, dialogs, popovers, header menus, jump menu) walked `src/studio/ui/src/components/**`, the host bindings in `api/wailsClient.ts` and `api/contracts/`, every `localStorage` key, every `saveSettings` caller, the earlier [UI function audit](ui-function-audit/inventory-shell.md) inventories and [data files](../reference/data-files.md). Each control was matched to a row in `components/settings/registry/rows.ts` or an entry in `pageSettings.ts`. Nothing was run in the app. There is no `sessionStorage`, cookie, IndexedDB, density or language setting, and Companion writes none.

**Scope words.** *computer*: `global-settings.json`. *project*: the project's `settings.json` or a named project file. *window*: this window's `localStorage`. *transient*: React state only.

## Summary

Ten persisted preferences have no Settings equivalent (gaps below); gap 1 is fixed in the second pull request. Every other persisted control is covered by a Settings row or a page-setting entry (`ps.*`, the same keys behind a Settings panel), or is not a setting (the last table).

## Gaps

| # | Control | Page | Storage | Scope | Settings equivalent | Verdict |
| - | - | - | - | - | - | - |
| 1 | Chapter layout (Flat / Voice folders) | Engine panel, Chapter sync card and Voices card | `voice-tracks.json` via `voiceTracksSetLayout` | project | none | **Fixed:** `daw.layout`, one shared voice setup, either place shows the other at once |
| 2 | Chapter sync on / off (Turn on, Turn off, the consent dialog's Sync and Not now) | Engine panel; consent dialog on any page | `chapter-sync.json` via `chapterSyncSetEnabled` | project | none (`daw.syncActivity` is the log) | **Gap.** Row in the Engine-panel pull request |
| 3 | Narrator's character | Engine panel, Voices card | `voice-tracks.json` via `voiceTracksSetNarrator` | project | none | **Gap.** Engine-panel pull request |
| 4 | Which characters each voice track records | Engine panel, Voices card | `voice-tracks.json` via `voiceTracksSetCharacters` | project | none | **Gap.** Engine-panel pull request |
| 5 | Booth text size (slider, larger and smaller keys) | Booth, Text settings | `narration.booth.textSize` | window | none (`look.readerSize` is the Script's size, a different key) | **Gap.** Booth pull request |
| 6 | Playback speed, volume, mute, output device | Editing, Output popover | `narration-ui-editing-output` | window | none (`daw.sampleOutput` is the voice-sample output) | **Gap.** Editing pull request |
| 7 | Effects coverage cap (%) | Editing, Effects | `Editing.fx_cap_pct` | project | none (`ps.fx` shows favourites only) | **Gap.** Editing pull request |
| 8 | Story Bible entry sort | Story Bible, Sort menu and column headers | `narration.storyBible.sort` | window | none | **Gap.** Story Bible pull request; the owner may rule it view state |
| 9 | Schedule basis (Standard / Your pace) | Production target popover | `plan.rateBasis` in `project.json` via `setProductionRateBasis` | project | `project.rateBasis` | **Covered.** Ruled a setting, not plan data: it is not an undo step, unlike the payment, due date and milestones beside it |
| 10 | First-use tips already seen | Script and others, "Got it" | `Tips.seen` in `global-settings.json` | computer | none | **Gap.** App pull request (a Reset tips action) |

## Covered

| Control | Page | Storage | Scope | Settings equivalent |
| - | - | - | - | - |
| Record with (REAPER, Audacity, Built-in) | Settings, Engine panel link cards | `Recording.engine` via `dawChoose` | project | `daw.engine` |
| Microphone, "Use the DAW's input" | Booth Levels menu | `Teleprompter.input_device`, `input_source` | computer | `daw.mic` |
| Start tone | Booth (plays it) | `narration-ui-take-tone` | window | `daw.startTone` |
| Start REAPER (writes the launcher switch) | Booth setup, connection dialog | `DAW.auto_start_launcher` | computer | `daw.autoLauncher` |
| Punch pre-roll | Booth Levels menu | `Teleprompter.punch_preroll_seconds` | computer | `ps.punch` |
| Reader font, line spacing, column width, size | Script and Booth Text settings | `narration.script.text` | window | `look.reader`, `look.readerSpacing`, `look.readerWidth`, `look.readerSize` (Script size) |
| Definition source | Script, Words tab | `Script.definition_source` | computer | `voice.dict` |
| Theme | Rail button, jump menu, context menu | `narration-ui-theme` | window | `look.theme` |
| Zoom | Keys, jump menu, header chip | `Appearance.zoom` via `windowSetZoom` | computer | `look.zoom` |
| Waveform arrow step | Editing ribbon (reads it) | `narration-ui-ribbon-scroll-step` | window | `look.waveScrollStep` |
| Favourite effects | Editing, Effects | `DAW.fx_favourites` | computer | `ps.fx` |
| Audacity backups window and retention | Editing, Backups | `DAW.backups.*` | project | `ps.backups` |
| Preview, Compare, Recording check, Silence cleanup, Stage suggestion options | Proof, Production, Master & QC (jump menu) | `Preview.*`, `TranscriptCompare.*`, `RecordingCoverage.*`, `Cleanup.*`, `StageRecommendations.*` | project | `ps.preview`, `ps.compare`, `ps.coverage`, `ps.cleanup`, `ps.stages` |
| Background checks on, pause, resume, consent | Background-check card, any page | `RecordingCoverage.background_checks[_confirmed]` | computer | `stt.background` |
| Delivery profile and its limits | Delivery, import review | `project.json`, `delivery-profiles.json` | project, computer | `delivery.profile`, `delivery.default`, `delivery.custom` |
| Close the import when it finishes | Production, import review | `General.close_import_when_done` | computer | `app.importClose` |
| Narrator name, credits | Credits setup dialog | `General.narrator_name`, `project.json` | both | `project.narrator`, `project.credits` |
| Mark types, Story Bible types, Can speak, type colours | Script Define marks | `marks.json`, Story Bible types | project | `project.marks`, `project.types` |
| Merriam-Webster key | Script, Words tab | `credentials.json` | computer | `voice.mwKey` |
| First-scan "Don't ask again" | Story Bible scan prompt | `ManuscriptGuide.analysis_prompt` | computer | Models pane, analysis tools checkbox |
| Key bindings | Every page (read) | `Keymap.overrides` | computer | `keys.map` |
| Motion | Settings | `narration-ui-motion` | window | `look.motion` |

## Not settings

| Control | Where | Reason |
| - | - | - |
| Chapter status, kind (reference or narration), prep state, pickups included or done, marks, bookmarks, findings and decisions, takes kept or lined, locks, speaker colour, cue attribution, voice samples, retry mode, stage Confirm and Dismiss, per-chapter analysis source | Production, Script, Story Bible, Proof, Pickups, Editing | Content or a decision about one item, kept with the project's records |
| Chapter-to-track links (Link, Another track, Unlink, Confirm), chosen `.rpp` | Engine panel, Production, Booth, Editing | Link data in `chapter-track-map.json`, one per chapter |
| Payment, rate, due date, milestones | Schedule | The project's plan, edited where it is read, journalled with Undo |
| Recent-project pin and remove | Project picker | A list of items, not a preference |
| Monitor level | Booth Levels menu, Editing Output | The DAW's own level, read back from the DAW |
| Effect parameters, bypass, cut and replace dialogs | Editing | Edits to audio |
| Mastering provider | none | No control calls `masteringChooseProvider` ([unwired](unwired-host-bindings.md)); a row comes with a control |
| Record, Check recordings, Build package, Export report, Rescan, Import, Start timer, Restore backup, Undo | many | One-off actions |
| Sort order, filters, search, chip filters, side-panel and drawer toggles, ribbon zoom, chapter steppers, rail tab | many | View state, not kept, or reset on open |
| Reading place: Booth last place, per-chapter places, Proof and Master & QC last chapter, Script reader position | Booth, Proof, Master & QC, Script | Remembered position, not a choice |
| Demo "Play animations" | Demo builds | A development switch |
| Legacy keys `narration.teleprompter.device`, `narration.script.definitions`, `narration.readAloud.flags` | none | Read once and moved to the host, or never written |

## Open points

- `look.zoom` is listed as *computer*; the earlier inventories call it a window setting. The host stores it in `global-settings.json`.
- Whether `ChapterSyncSetEnabled` writes `chapter-sync.json`, `project.json` or both is unsettled in [data files](../reference/data-files.md); the Engine-panel pull request settles it from the Go code.
- Compare run's log detail and chunk selects were not traced to storage.
- The Story Bible sort (gap 8) and the Schedule basis (gap 9) were ruled settings: both persist and change what a page shows, and neither is journalled.

## Fix plan

1. This note.
2. `daw.layout` and the guard `settingsParity.test.ts`. The guard lists host bindings, window keys and `saveSettings` callers, each covered by a row or exempt with a reason. Gaps 2 to 10 now each have a row, and no exemption is marked `GAP` any more: the guard fails on one, and each exempt list's cap equals its length, so an exemption can only be added with the owner and a removal lowers the cap. The guard's name scan does not see bindings that start with `set`, so the Schedule basis binding, `setProductionRateBasis`, is held by its own check; issue 2970 tracks the blind spot.
3. Engine panel (gaps 2 to 4), Booth (5), Editing (6, 7), Story Bible (8), Production (9), App (10); the last pull request closes #2815.
