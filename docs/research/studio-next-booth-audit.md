# Studio Next Booth audit (SN-O1)

**Date:** 2026-10-11. **Code audited:** `main` at `928c7de`. **Mock audited:** `docs/research/mockups/studio-next/` (last change `c171071`). **Slice:** SN-O1 (#1035), SNO-1 of the [Booth PRD](../prds/studio-next-booth.prd.md). SNO-10 deletes this note once its tables have been acted on.

Method: files read, `grep` over `apps/ui/src`, `apps/ui/tests`, `apps/desktop`, `integrations/reaper`, `sidecars`, `docs`. The app, REAPER and a microphone were not run. A claim read from code carries a path; a claim not read line by line is marked **unverified**; a check that needs hardware is marked **owner check** (#510). Policy: the Studio Next mock is the only spec (owner ruling D98 in [the agent train](../operations/agent-train.md#which-mocks-are-the-spec)); old things with a mock equivalent are removed in the swap (SNO-10), old things without one are left. The [ADR 0790](../adr/0790-leaving-the-booth-while-recording-asks-to-stop-the-recording-the-app-started-and-a-reading-only-session-keeps-running.md) and [ADR 0791](../adr/0791-record-arms-only-the-chapters-track-and-starts-at-the-end-of-its-last-item-and-a-failed-precondition-shows-the-capabilitys-refusal-reason.md) rulings (A10 and DQ-5) are Proposed; this note treats them as the target.

## Findings that change a slice

1. **The Companion is hosted by the old Booth and entered from its header.** `BoothSession` holds `mode: 'booth' | 'companion'` (`apps/ui/src/components/booth/BoothSession.tsx:84`), renders `CompanionShell` in companion mode, and `BoothView`'s header button `onCompanion={() => setMode('companion')}` (`BoothSession.tsx:301`, `BoothView.tsx:169-173`) is the only way in. The mock Booth has no Companion entry. Deleting `BoothPage`, `BoothSession` and `BoothView` as the PRD lists them removes the Companion's host and its entry. SNO-10 needs a ruling on #992 (see [Owner decisions](#owner-decisions-and-checks)).
2. **The Companion calls the record-in-REAPER hook at runtime.** `CompanionShell.tsx:156` calls `recording.beforeStart()` and `:163` `recording.afterStop()` from `useRecordInReaper`. The PRD's SNO-10 list deletes that hook. The Companion's Play and Stop would stop arming and stopping REAPER.
3. **The Companion shows `ResumePrompt` and `UnresolvedCreditsWarning`.** `BoothSession` builds one `header` element and passes it to both layouts (`BoothSession.tsx:245-264,275,291`). Deleting `ResumePrompt` removes the Companion's resume notice.
4. **The Companion shares the hand-scroll rule.** `CompanionShell` and `ReadAlongView` use `useFollowCursor`, which pauses following on a wheel or scroll key (`useFollowCursor.ts:134`, ADR 0119). DQ-17 replaces that rule in the Booth. SNO-6 must add a Booth-only browse and leave `useFollowCursor` as the Companion has it.
5. **Start at the end of the last item is absent, not "not verified".** `record_start` records from `reaper.GetCursorPosition()` (`integrations/reaper/narration_transport.lua:216`) and `readAloudRecordStartIn` moves nothing first (`apps/desktop/bindings_readaloud_record.go:137-155`). The resume locate reads the end of the track's items (ADR 0349) but only chooses where reading starts. SNO-2 is larger than the PRD's 1.0 pw suggests: it needs a host change, not only a selector.
6. **A built-in recorder take stops silently on leaving.** `requestExit` asks only for `session.active || recording.recording` (`BoothSession.tsx:183-189`), where `recording` is the REAPER hook. `useRecorder` stops a running take in its unmount cleanup (`useRecorder.ts:143-148`). Exit with no reading session, and every nav path, therefore stop a built-in take with no question. The mock treats the built-in recorder as a DAW and guards it (`booth-daw.test.tsx` "the built-in recorder needs no track", "every way out asks"). SNO-3's tests must cover it.
7. **Nav and Back do not ask while REAPER records.** `guardedNavigate` and `attemptDelta` in `apps/ui/src/App.tsx:454-480` hold only the unsaved-Settings and compare-run guards. The Booth hides the rail (`AppShell.tsx:184`), so the live nav paths are `nav.back`/`nav.forward` (Alt+Arrow, Browser keys, mouse buttons: `commands.catalog.ts:47-60`) and a chapter change in the picker. Section [Exit paths](#exit-paths).
8. **The mock Booth has no engine picker, microphone field or model choice.** Engines appear only in the mock's "Check recordings" dialog (`src/providers/speech.ts`: `engines()`, `defaultEngine()`; `liveEngine()` is fixed). The old controls live in `ReadingControlBar`, mounted only by `BoothView`. Under D98 they go with `BoothView` unless the owner keeps them. SNO-9 shrinks to nothing in the Booth.
9. **Booth bookmarks and the pickup session are new.** The Script reader has a chapter-level bookmark (`apps/ui/src/components/manuscript/ReaderCard.tsx`, `apps/desktop/internal/manuscript/reader.go:288`); the Booth has none and no pickup session. Both are larger than "polish".
10. **Threat-model row drift.** The PRD says rows 4g and 4h are re-read for stopping a recording. REAPER `arm_only`, `record_start` and `record_stop` are row 5k in `docs/architecture/threat-model.md`; rows 4g and 4h are the built-in recorder. The Go comments at `apps/desktop/app.go:1027` and `bindings_readaloud_record.go:209` cite 5j, which is `chapter_track_state`. SNO-3 and SNO-7 re-read 4g, 4h and 5k.

## Verdict per ruling

"Present", "partial" or "absent" is the repo today, read from code and tests. Mock tests are under `docs/research/mockups/studio-next/tests/`.

| Ruling | Verdict | Repo evidence | Test | Slice |
| - | - | - | - | - |
| Record in any supported DAW, DAW-neutral wording (DQ-5) | **Absent.** The toggle, its label, the status chip and the confirm all say REAPER; the capability layer is DAW-neutral and not used for wording. See [REAPER wording](#reaper-wording) | `ReadingControlBar.tsx:104-135` (`useCapability('record')`, "Record in REAPER"); `api/contracts/daw.ts:7` (`DawKind` on the wire); `BoothView.tsx:86-92` | `BoothSession.test.tsx:617` ("Record in REAPER"); mock `booth-daw.test.tsx` "names the DAW", `daw-wording.test.tsx` | SNO-2 |
| Record preconditions with the reason on the control | **Partial.** A refusal is shown in the status line, not on the control, and its sentence is worded in Go (`readAloudRecordRefusal`, `readAloudTrackGUID`). The control is gated by the capability message. The wire refusal codes are `not_armed`, `other_armed`, `several_armed`, `playing`, `already_recording`, `unlinked`, `several_links`, `track_missing`. No `recordCheck` selector exists | `ReadingControlBar.tsx:68-83`, `:272`; `apps/desktop/bindings_readaloud_record.go:37-102` | `BoothSession.test.tsx:678` (REAPER refuses, shows why); mock `booth-daw.test.tsx:53,64` | SNO-2 |
| One chapter, one track; arm only the chapter's track | **Present, as a separate click.** `arm_only` arms the named track, disarms the rest, remembers the arms and restores them on stop ([ADR 0232](../adr/0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md)). `RecordStart` refuses when the track was not armed first. DQ-5 folds the click into Record | `integrations/reaper/narration_transport.lua` (`arm_only`, `record_start`); `ReadingControlBar.tsx:111,143` ("Arm only"); `useRecordInReaper.ts` (`armOnly`) | `bindings_readaloud_record_test.go:60,135,192`; mock `booth-daw.test.tsx:103` | SNO-2 |
| Start at the end of the last item | **Absent.** Recording starts at REAPER's edit cursor. See finding 5 | `narration_transport.lua:216`; `bindings_readaloud_record.go:137-155` | none; mock `booth-daw.test.tsx:103,129` | SNO-2 (host change) |
| Resume from the DAW's live cursor, else the saved project, else the Booth's own record; source and confidence shown | **Present** in behaviour. Live first, saved project second, prompter's last word third; the prompt says "in REAPER now" or "as of the project's last save", names a cursor place, and calls a low-confidence place a guess with a percentage. The form differs from the mock's one-line "Resume at ¶ n" | `apps/desktop/internal/teleprompter/locate.go`; `ResumePrompt.tsx:98-102,170,223,424-432`; `useResumeLocate.ts`; [ADR 0349](../adr/0349-the-resume-locate-reads-reapers-live-cursor-and-items-first-and-falls-back-to-the-saved-project-never-to-a-guess.md), ADR 0205, ADR 0206 | `ResumePrompt.test.tsx`; mock `booth-daw.test.tsx:336-395`, `d2-booth.test.tsx` | SNO-5 smaller: restyle only |
| Leave while recording: confirm or stop | **Partial.** Exit booth and Escape ask and stop on yes; nav, Back and a chapter change do not ask. See [Exit paths](#exit-paths) | `BoothSession.tsx:183-200,216`; `App.tsx:454-480` | `BoothSession.test.tsx:132,152,184,767`; mock `booth-daw.test.tsx:172-257` | SNO-3 |
| Roll as one command, a take kept; confirm where destructive | **Absent.** `punch_to` moves the edit cursor only. The capability list has `record` and `punch` and no `roll`. `destructive` is on the wire and nothing under `components/booth/` reads it | `ReaderFlagsPanel.tsx:78,129,191`; `api/contracts/daw.ts:28,60-70`; `apps/desktop/bindings_daw.go:80`; [ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md) | `BoothSession.test.tsx:408` ("Punch from here" gated); mock `booth-daw.test.tsx:269-334` | SNO-4 (waits on SND-6a) |
| Suspected flags automatic, dismissible, no manual flag | **Present** except the shape. Flags are raised by listening; there is no manual flag control; dismissing is kept as a `dismissed` decision on a finding whose id comes from the manuscript words, so the same place comes back dismissed. They are findings in the Proof store, not Pickups with a `speech` source | `apps/desktop/teleprompterflags.go:11-57`; `BoothSession.tsx:172`; `ReaderFlagsPanel.tsx:182-188`; [ADR 0117](../adr/0117-live-flags-are-kept-as-suspected-findings-merged-per-chapter-when-a-session-ends.md) | `BoothSession.test.tsx:408,433,451,470`; mock `booth-daw.test.tsx:395-460` | SNO-5 smaller; the Pickups source is SNQ-8 |
| Pickup session in the Booth | **Absent.** No "Open in Booth at this pickup", no session panel; Pickups does not link to the Booth ([Proof audit](studio-next-proof-audit.md#pickups)) | grep of `components/booth/` | none | SNO-8, larger (needs SNQ-8's model) |
| Bookmarks (ribbon, `B`, `[` `]`) | **Absent** in the Booth. Chapter-level bookmark in Script only | `ReaderCard.tsx`; `internal/manuscript/reader.go:288` | mock `bookmarks.test.tsx:386-463` | SNO-8 |
| Key hints footer from the catalogue | **Absent** in the Booth. The `KeyHints` footer primitive exists and has no consumer outside its stories and tests. The Booth draws one `KeyHint` on Play and a mark legend (`ReaderKey`) | `components/primitives/KeyHints.tsx`; `ReadingControlBar.tsx:238`; `ReaderKey.tsx` | `KeyHints.test.tsx`; mock `d2-keycaps.test.tsx`, `d2-booth.test.tsx:48` | SNO-6 |
| F11 full screen | **Present** | `useFullscreenKey.ts`; `commands.catalog.ts:115` | `useFullscreenKey.test.tsx`; mock `booth-daw.test.tsx:462` | none |
| Passage map written at record time | **Absent.** `grep -rli "passagemap\|passage_map\|passage map"` over `apps/ui/src`, `apps/desktop`, `sidecars`, `integrations` finds no file | none | mock `booth.test.tsx`, `src/state/commands/passagemap.ts` | SNO-7, as the PRD says |
| Engine picker lists what the host reports; Moonshine live (DQ-9) | **Present in the old Booth, absent from the mock Booth.** Engines come from the Teleprompter `engine` setting's choices; a single-engine host shows no choice; the default is `whisper`. No "live engine" label | `useTeleprompterSession.ts:26-35,118,205-215`; `ReadingControlBar.tsx:217-218,377-385` | `BoothPage.test.tsx:217,232,247`; mock `src/providers/speech.ts` | SNO-9 (finding 8) |

### Reading rows that SNO-6 relies on

| Row | Verdict | Evidence |
| - | - | - |
| Wheel and Page Up/Down move the view by pixels, position stays (DQ-17) | **Absent.** A wheel or scroll key pauses following; the position does not move either way | `useFollowCursor.ts:13,76,134` |
| Sentence-phrase navigation (keep ours) | **Absent as keys.** The Booth catalogue has two commands, `reading.toggle` and `booth.fullscreen`; reading position moves by click on a word (`teleprompterSeek`) | `commands.catalog.ts:113,115`; `interactionFeedback/teleprompter.ts:155` |
| Levels (`LevelMeter`), speaker chips, credits readable | **Present** | `useInputLevel.ts`, `BoothView.tsx`; `speakerLabels` in `BoothSession.tsx:126-140`; credits mode in `BoothPage.tsx` |
| Foot pedal, Space only | **Not audited.** Owner check on #510 | none |

## Companion-shared files

Roots: `CompanionShell`, `CompanionThisChapter`, `ReadAlongView`. The closure comes from a relative-import graph over `apps/ui/src/components/booth/` (a throwaway script, not committed), cross-checked with the grep below. Test files (`*.test.ts(x)`) follow their source file.

```text
grep -rn "components/booth/" apps/ui/src --include=*.ts --include=*.tsx | grep -v "^apps/ui/src/components/booth/"
```

The grep finds no importer of the Companion files outside the folder. Outside importers are `App.tsx` (`BoothPage`, `boothQuery`, `useBoothRecording`, `useRecordingEngine`, the `CreditsKind` type), `api/teleprompterMock.ts` and its test (`readerModel`), `api/wireContracts.test.ts` (`readerModel`), and path-keyed registries ([Old equivalents](#old-equivalents)).

| File | Verdict | Importer found |
| - | - | - |
| `CompanionShell.tsx` | swap keeps (it is the Companion) | mounted by `BoothSession.tsx:268` |
| `CompanionThisChapter.tsx` | swap keeps (Companion imports it) | `CompanionShell.tsx:19` |
| `ReadAlongView.tsx` | swap keeps (Companion imports it) | `CompanionShell.tsx:14`; also `BoothView.tsx:17` |
| `ReaderText.tsx` | swap keeps (Companion imports it) | `ReadAlongView.tsx:6` |
| `ReaderKey.tsx` | swap keeps (Companion imports it) | `ReadAlongView.tsx:5`; also `ReaderRail.tsx:11` |
| `readerModel.ts` | swap keeps (Companion imports it); also shared with `App.tsx`, `api/teleprompterMock.ts` | `CompanionShell.tsx:15`, `ReadAlongView.tsx:7`, `ReaderText.tsx` |
| `readerFlags.ts` | swap keeps (Companion imports it) | `ReaderText.tsx` |
| `useFollowCursor.ts` | swap keeps (Companion imports it) | `CompanionShell.tsx:16`, `ReadAlongView.tsx:8`, `ReaderText.tsx` |
| `useTeleprompterSession.ts` | swap keeps (Companion imports it) | `CompanionShell.tsx:18`, `ReadAlongView.tsx:9` |
| `usePacedCursor.ts` | swap keeps (Companion imports it) | `useTeleprompterSession.ts` |
| `boothProgress.ts` | swap keeps (Companion imports it) | `CompanionThisChapter.tsx:6` |
| `useRecordInReaper.ts` | swap keeps (Companion calls it at runtime): the PRD lists it for deletion; see finding 2 | `CompanionShell.tsx:17` (type), `:156,163` (calls) |
| `ResumePrompt.tsx`, `UnresolvedCreditsWarning.tsx` | swap deletes, with a Companion regression: passed as `header` to `CompanionShell` (finding 3) | `BoothSession.tsx:245-264,275,291` |
| `BoothSession.tsx` | decision needed: it is the Companion's host (finding 1) | `BoothPage.tsx` |
| `useRecorder.ts` | shared with another page: `useRecordingEngine` feeds the engine chip in `App.tsx:46,128` | `App.tsx`, `BoothSession.tsx`, `BoothView.tsx`, `BuiltinRecorder.tsx`, `ReadingControlBar.tsx` |
| `useBoothRecording.ts` | shared with another page: gates toasts while the Booth records (`App.tsx:268`) | `App.tsx:17` |
| `readerPreferences.ts` | swap deletes (no Companion importer); read by `ReaderRail` and `BoothSession` | `BoothSession.tsx`, `ReaderRail.tsx` |
| `BoothPage.tsx`, `BoothView.tsx`, `RecordInReaperConfirm.tsx` | swap deletes | `App.tsx:24`; `BoothSession.tsx`; `BoothSession.tsx:11` |
| `ReadingControlBar.tsx`, `BuiltinRecorder.tsx`, `MicrophoneField.tsx`, `useInputLevel.ts`, `useReadAloudReaperState.ts` | swap deletes with `BoothView` (no Companion importer), unless the owner keeps the controls (finding 8) | `BoothView.tsx`, `ReadingControlBar.tsx`, `useRecorder.ts` |
| `ReaderRail.tsx`, `ReaderFlagsPanel.tsx`, `ChapterSuggestionHint.tsx`, `useFullscreenKey.ts`, `useResumeLocate.ts`, `WhisperModelPrompt.tsx` | swap deletes (mock equivalents: side panel, F11, resume offer) | `BoothSession.tsx`, `BoothPage.tsx`, `ResumePrompt.tsx` |

The Companion also imports outside the folder, and those files are not Booth files: `components/pickups/PickupsCompanionSummary.tsx` (`CompanionShell.tsx:20`), `components/assets/AssetFacts` and `AssetInstallPrompt` (`ReadAlongView.tsx`), `hooks/useAssetInstall` (`useTeleprompterSession.ts`), `input/useCommand`, and the `CompactShell`, `Button`, `Kbd`, `StatusBadge`, `Toolbar`, `Panel`, `Highlight`, `SpeakerTag` primitives.

## REAPER wording

Command: `grep -rn -i "reaper" apps/ui/src/components/booth --include=*.tsx --include=*.ts | grep -v "\.test\."`. Comments omitted. DAW-neutral replacement is the capability's name and sentence (`DawCapabilities.daw`, `CapabilityEntry.message`, the mock's `dawName()`/`gateOf`), not a new string in the UI (DQ-5).

| String | File and line | Replace with |
| - | - | - |
| "Record in REAPER" (toggle label, `Record in REAPER: <status>`) | `ReadingControlBar.tsx:109,132` | Record control labelled from the capability; reason from `recordCheck` |
| "Checking REAPER…", "Refresh REAPER state" | `ReadingControlBar.tsx:110,150` | Capability message; drop with the arm state |
| "Arm "<chapter>" only" / "Arm only" | `ReadingControlBar.tsx:111,143` | Removed (Record arms the track, ADR 0791) |
| "Reading finished. REAPER is still recording" | `ReadingControlBar.tsx:272` | DAW name from the capability |
| "REAPER · recording / records with Play / not recording" | `BoothView.tsx:89-92` | Setup chip naming the DAW from the capability (mock `booth-daw.test.tsx:87`) |
| "Record in REAPER when you press Play?" and body (3 sentences naming REAPER) | `RecordInReaperConfirm.tsx:21-27` | Removed with the confirm; the leave dialog takes the DAW name |
| "Reading has finished, but REAPER is still recording…", "…stops REAPER's recording", "…nothing recorded in REAPER is affected" | `BoothSession.tsx:311-314` | Mock dialog: "Stop recording?", `<DAW> is recording. Leaving the Booth stops it.` |
| "REAPER" option in "Record with" | `BuiltinRecorder.tsx:29` | DAW name from the capability |
| "Moves REAPER's edit cursor to <time>" | `ReaderFlagsPanel.tsx:78` | Punch confirm worded from the `punch` capability |
| "REAPER's armed/selected track "<name>" in <file>", aria "Chapters suggested by REAPER" | `ChapterSuggestionHint.tsx:20,74` | Deleted with the picker hint, or neutral if the owner keeps it |
| "in REAPER now", "REAPER and your last reading agree / are in different places", "REAPER" card, "Continuing at REAPER's edit cursor", "REAPER is recording on this track now…", "Checking where REAPER and your last reading are…" | `ResumePrompt.tsx:98,170,223,226,299,428,466` | Resume source label from the DAW name and `source` (`live`/`saved`) |
| "The proofer's note at REAPER's playhead…", "Hotkeys that reach this panel from REAPER are not available yet." | `CompanionShell.tsx:245,265` | **Leave.** Companion, frozen (DQ-13) |

Strings the host sends also reach the Booth: `readAloudRecordRefusal` and `readAloudTrackGUID` word "REAPER did not confirm within 3 seconds", "REAPER could not do that", "The track linked to this chapter is no longer in the REAPER project" in Go (`apps/desktop/bindings_readaloud_record.go:37-102`). They are outside `components/booth/**` and are in SNO-2's scope because the Record control must show the capability's reason instead.

## Exit paths

"Reading" is the teleprompter session (`useTeleprompterSession`). "REAPER take" is a recording the app started through `readAloudRecordStart`. "Built-in take" is the Booth's own recorder (`useRecorder`). ADR 0388 decision 3 says leaving by the nav keeps a session running in the host; [ADR 0232](../adr/0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md) decision 4 limits stopping to a recording the app started. This is the list SNO-3's tests must cover.

| Path | Reading session | REAPER take | Built-in take | Evidence |
| - | - | - | - | - |
| Exit booth button | Asks "Stop reading?" and stops it on confirm | Asks "Stop recording?" (reading already ended) or adds it to the reading question; confirm calls `readAloudRecordStop` | **No question**; unmount stops the take | `BoothSession.tsx:183-205`; `useRecorder.ts:143-148`; `BoothSession.test.tsx:132,767` |
| Escape on the Booth root | Same as Exit booth; skipped when a popover or dialog is open | Same | Same | `BoothSession.tsx:216-220`; `BoothSession.test.tsx:152,797` |
| Escape in Companion | Double Escape returns to the Booth; nothing stops | Nothing stops | Nothing stops | `CompanionShell.tsx` ("Full app"); `BoothSession.test.tsx:808` |
| Back, Forward, Alt+Arrow, Browser keys, mouse buttons | **No question.** The session keeps running in the host (ADR 0388 decision 3); the hook only unsubscribes; flags are kept as the Booth unmounts | **No question.** REAPER keeps recording. The hook's `recordingSince` is React state lost on unmount, so a returning Booth reads not recording (**unverified**, read from `useRecordInReaper.ts`). The host still remembers the chapter for shutdown | **No question**; take stopped by the unmount cleanup | `App.tsx:369-376,454-480`; `useTeleprompterSession.ts:161-164`; `BoothSession.tsx:211` |
| Chapter or credits change in the picker | Picker hidden while a session runs (`BoothPage.test.tsx:692`); otherwise the keyed `BoothSession` unmounts as above | No question (setup visibility after the reading ends with REAPER recording is **unverified**) | No question | `BoothPage.tsx:132-135,176`; `BoothSession.test.tsx:790` |
| "Fill them in Settings" (credits) | Same "Stop reading?" confirm | Same | Not covered | `BoothSession.tsx:190-196`; `BoothSession.test.tsx:582` |
| Other navigation (a link from a toast or the palette `jump.open`) | **Unverified**; all go through `guardedNavigate`, which has no Booth guard | Same | Same | `App.tsx:454-466` |
| Window close or quit | Teleprompter closed (12 s bound) | `stopReadAloudRecordingOnShutdown` sends `RecordStop` for the chapter it remembers; no question is possible | `recorder.Close` finishes the take | `apps/desktop/app.go:1013-1029`; `bindings_readaloud_record.go:209-225`; test `bindings_readaloud_record_test.go:249` |
| Project switch (picker or second REAPER instance) | Refused while the teleprompter is `Busy()` | **Not consulted**: `idleLocked` reads the teleprompter and recorder, not `readAloudRecordingChapter`, so a REAPER take with no live session does not block a switch | Refused while the recorder is `Busy()` | `apps/desktop/app.go:1203-1249`, `attachProjectLocked` `:1060` |
| F11 | Not an exit; a window the Booth put into fullscreen goes back on unmount | n/a | n/a | `useFullscreenKey.ts` |

Against ADR 0790: decisions 1 and 2 need the guard registered for the whole time a recording runs, which `guardedNavigate` and `attemptDelta` cannot express today (the app shell slice SNR-3 supplies `LeaveGuard`). Decision 4 (reading-only sessions keep ADR 0388 decision 3) is already true. The two gaps beyond the nav are the built-in take and the project switch, where a REAPER take does not block the switch.

## Old equivalents

Files SNO-10 deletes, checked against the Companion list above. The PRD names `BoothPage`, `BoothView`, `ResumePrompt`, `RecordInReaperConfirm`, the record-in-REAPER hook, their stories and rows.

| Item | Companion still imports it? | Note |
| - | - | - |
| `BoothPage.tsx`, `BoothView.tsx` | No, but `BoothSession` (not on the PRD's list) hosts and enters the Companion | Finding 1 |
| `ResumePrompt.tsx` (+ `useResumeLocate`, `WhisperModelPrompt`) | Through `BoothSession`'s `header` | Finding 3 |
| `RecordInReaperConfirm.tsx` | No | The `ReadAloud.record_in_reaper` and `record_confirmed` settings (ADR 0380) stay read by the Companion's hook; with the toggle gone, nothing in the UI sets them |
| `useRecordInReaper.ts` | **Yes** | Finding 2 |
| Stories | No `*.stories.tsx` imports a `components/booth` file | Nothing to delete |
| Interaction-feedback rows | Rows keyed `src/components/booth/<file>` for `BoothPage`, `CompanionShell`, `useRecorder`, `useInputLevel`, `useTeleprompterSession`, `readerPreferences`, `ResumePrompt` | `apps/ui/src/interactionFeedback.catalog.ts:101-172`; `interactionFeedback/teleprompter.ts` (rows for the record hook, `ResumePrompt`, `ReaderFlagsPanel`, `BoothSession`, `useReadAloudReaperState`), `interactionFeedback/recording.ts`, `interactionFeedback/production.ts:9` (`CompanionThisChapter`). Companion rows stay |
| Ratchet tests keyed by Booth path | Per-file counts for deleted and kept files | `iconImports.test.ts:16-22`, `badgeShapes.test.ts:22,25`, `panelCopies.test.ts:28-59`, `rawNatives.test.ts:41-63`, `listenerGuard.test.ts:19`, `ports/useApiRatchet.test.ts:18-31,123-136`; `CompanionShell` and `CompanionThisChapter` entries stay |
| Visual catalogue | 55 `booth` rows in `apps/ui/tests/visual/catalog/booth.ts`, drivers in `drivers/booth.ts` (395 lines). `companion-default` and `companion-listening` are driven by clicking the Booth header's Companion button (`drivers/booth.ts:344-353`) | After the swap those two rows need a new driver (finding 1). The other rows (setup, 14 resume states, listening, flags, reaper-*, recorder-*, exit-confirm, dark) go with the old page; `mock-match/mocks.ts` targets `booth/companion-listening` for mock 07 |
| Aria snapshots | `confirm-stop-reading.aria.yml` (state `booth/exit-confirm`) goes; `companion-panel.aria.yml` (state `booth/companion-default`) stays | `apps/ui/tests/aria/dialogs.spec.ts:93-101` |
| Doc screenshots | 5 `booth` entries: `booth-setup`, `booth-listening`, `booth-waiting`, `booth-flag`, `booth-credits` | `apps/ui/tests/visual/doc-screenshots.json` |
| Guide | `docs/guides/using-the-app/booth.md` (201 lines, "Companion mode" at line 180); inbound links from `README.md`, `navigation.md`, `script.md`, `settings.md`, `proof.md`, `story-bible.md` | Rewritten in SNO-10; the Companion section stays accurate |

## Slice adjustments

- **SNO-2:** larger. The start rule needs a host change (finding 5); the refusal wording moves from Go to the capability; the arming click, `ARMABLE_STATUSES` and "Arm only" are removed; no `recordCheck` exists.
- **SNO-3:** larger. It must cover the built-in take (finding 6), Back and Forward, the picker, and the project switch with a REAPER take (not consulted by `idleLocked`). Blocked on SNR-3's `LeaveGuard`.
- **SNO-4:** unchanged in size but blocked: no `roll` capability and no reader of `destructive` exist; the confirm UI can be built against the mock.
- **SNO-5:** smaller. Source and confidence are shown today; stable keys and dismissals persist. Left: the Pickups shape (SNQ-8) and the mock's one-line offer.
- **SNO-6:** larger. Footer (`KeyHints` has no consumer), phrase and word keys, a Booth-only wheel browse that leaves `useFollowCursor` for the Companion (finding 4).
- **SNO-7:** as the PRD says (absent). Re-read rows 4g, 4h and 5k (finding 10).
- **SNO-8:** larger. Bookmarks and the pickup session have no Booth model; the pickup model is SNQ-8's.
- **SNO-9:** shrinks to the question in finding 8; no mock Booth surface to build. The host-reported engine list and the `whisper` default already hold (ADR 0414).
- **SNO-10:** larger. It needs the Companion host and entry, the hook, the `header` content, and two visual rows re-driven (findings 1 to 3).

## Owner decisions and checks

Asked on #992; none blocks SNO-2 to SNO-9 except where noted.

1. **Companion host and entry after the swap** (blocks SNO-10). The mock has no Companion (DQ-13: frozen as built). Options: keep `BoothSession`'s companion branch and a header button; or move the mode to a small host the shell opens without the Booth. This note does not choose.
2. **Booth controls with no mock equivalent** (microphone field, engine and model toggles, level-check, "Record with"). D98 removes them with `BoothView` unless kept. Recommendation: confirm removal, and say where the microphone is chosen in the mock (its Levels menu, `selectors/booth.ts` `MICS`).
3. **The `record_in_reaper` setting** after the toggle is gone: the Companion still reads it (finding 2). Either the Companion records on its own rule or the setting gets a surface.
4. **Owner checks** (pending on #510, not run here): microphone level and capture, a REAPER recording through leave, and the foot pedal.
