# Whole-app review (2026-10-30)

**Question.** On main at `df52629`, what do the repo's review agents find across every page, beyond what the [UI function audit](ui-function-audit.md) (#2581, clusters 1–25, issues #2591–#2607) already tracks?

**Method.** The mock build (`pnpm run build:mock`, `vite preview`, the fake DAW) was driven with Playwright:

- A sweep of 14 routes in both themes at 390, 1280 and 1920 px (84 captures, with document-overflow, `<h1>` and console checks).
- The `ux-reviewer` agent on 40 of those captures against `frontend-primitives`.
- The `narrator-walkthrough` agent on every page, doing real tasks end to end.
- The `qa-breaker` agent on every page, with mock seams, the DAW disconnected, resizes, double clicks, held keys and hostile text.
- `design-spec-guard` and `solid-design-review` pass 2 on the six largest merges since 2026-10-22: #2537, #2573, #2576, #2578, #2580 and #2570.

Findings marked **checked** were reproduced a second time by a separate run. The others are one agent's observation and need a failing test before a fix. A claim that only holds in the mock says so.

Screenshots are in [`whole-app-review-2026-10/`](whole-app-review-2026-10/).

**Dropped.**

- Production's rail drawn open over the page at 1280 px was a capture artifact. A fresh load leaves the rail collapsed at 64 px with focus on `<body>`.
- `/etc` is the 404 page. The Engine panel is opened from Settings.
- Items already in #1941, #149, #2171, #2202, #1764, #2163 and #2160 are not repeated.

**Not covered.**

- Real REAPER, real audio and the real file picker.
- Audacity.
- Analysis-tool downloads.
- A screen reader.
- Window heights under 700 px.
- The 390 px dark-theme captures and some 1920 px captures. They were taken but not reviewed one by one.
- The visual, aria and atlas suites. They were not run, because this is a review, not a change.

## Severity

- **High**: the narrator is told two different things, or the page stops working.
- **Medium**: a rule of `frontend-primitives` or the design system is broken on a whole page, or an edge case gives a wrong answer.
- **Low**: cosmetic or wording problems, and design drift with no wrong answer today.

## Findings

| # | Sev | Page | Finding | Screenshot | Issue |
| - | - | - | - | - | - |
| R1 | High | Proof, rail | The badge disagrees with the page after #2584 (**checked**) | `proof-badge.webp` | #2629 |
| R2 | High | Booth | A 1,000-paragraph chapter: about 1.4 s per phrase step and React error #185 (maximum update depth) | `booth-huge-185.webp` | #2630 |
| R3 | High | Master & QC, Delivery | After "Master all to spec" and "Master & encode", the files still read Waiting and Delivery still says Not mastered (mock) | `master-encode.webp`, `delivery-disabled.webp` | #2631 |
| R4 | High | Delivery, Master & QC | Errors drawn in the page flow as `role="alert"` paragraphs (rule 7) | `delivery-inline-alert.webp` | #2632 |
| R5 | Medium | Booth | The chapter header reads "Complete", "0%", "~13:50 of audio left" and "Resume at ¶ 14" at once (**checked**) | `booth-header.webp` | #2633 |
| R6 | Medium | Production | The figures strip gives two book lengths, and the recorded figures disagree (**checked**) | `production-1920.webp` | #2634 |
| R7 | Medium | Master & QC, Proof | Tables clipped at 390 px with no scroll cue | `master-390.webp`, `proof-390.webp` | #2635 |
| R8 | Medium | Settings | The Changed filter leaves out a changed "This computer" setting (Start tone) | `settings-changed.webp` | #2636 |
| R9 | Medium | Story Bible | Scan suggestions are added with nothing in the list marking them | `storybible-scanned.webp`, `storybible-needsreview.webp` | #2637 |
| R10 | Medium | Many | Instruction prose in the page flow (rule 8) | `master-1280.webp`, `storybible-1280.webp`, `companion-1280.webp`, `settings-dark-1280.webp`, `script-1920.webp` | #2638 |
| R11 | Medium | Master & QC, Delivery | Uncapped chapter lists (rule 6) | `master-1280.webp` | #2639 |
| R12 | Medium | Script, Booth, Editing | Three reader widths and no shared primitive (rule 4) | `script-1920.webp`, `editing-1920.webp` | #2640 |
| R13 | Medium | Proof, Pickups, Master, Story Bible, Production | Table headers not centred, or centred over a left-aligned column (rule 5) | `proof-1280.webp`, `production-1920.webp` | #2641 |
| R14 | Medium | Script, Editing, Delivery | Clipping and squeezed columns at 390 px | `script-390.webp`, `editing-390.webp`, `delivery-390.webp` | #2642 |
| R15 | Medium | Engine (#2570) | The folder-track picker breaks the native `Select` rule and duplicates a tree widget | — | #2643 |
| R16 | Medium | Recording check (#2576) | The `firstPass` field means the re-check when the re-check stage writes it; the activity file has no data-files row | — | #2644 |
| R17 | Medium | Credits (#2573) | Two owners for the credits id, kind and title (`manuscript` and `coverage`) | — | #2645 |
| R18 | Low | Recording check (#2576) | `ActivityPanel` duplicates `StatTile`; dead tooltip rows; a duplicate `clock()` | — | #2646 |
| R19 | Low | Booth, Editing, host (#2537, #2578, #2580) | Files past the size ceilings and concerns mixed in one place | — | #2647 |
| R20 | Low | Booth, Companion, Editing, Delivery | The load-error card shows the raw schema error to the narrator | `error-card-schema.webp` | #2648 |
| R21 | Low | Companion | The playhead badge is stale while reading, there is no `Heading`, and the buttons are word buttons | `companion-playing.webp` | #2649 |
| R22 | Low | Script | The Change speaker menu prints each name twice | `script-speaker-menu.webp` | #2650 |
| R23 | Low | Pickups | An empty add shows its error twice, and the time hint looks like a value | `pickups-empty-add.webp` | #2651 |
| R24 | Low | Shell | A locked rail item gives its reason on keyboard focus only | `nav-locked.webp` | #2652 |
| R25 | Low | Settings, Master & QC | Two title-sized headings stacked, and text buttons on the toolbar (rules 1 and 2) | `settings-dark-1280.webp`, `master-1280.webp` | #2653 |
| R26 | Low | Pickups, Master & QC | Page width policy at 1920 px: Pickups stretches with dead gaps, Master is centred | `pickups-1920.webp` | #2654 |
| R27 | Low | Booth | Undo on "Take saved" leaves "Recorded 00:02" in This session | `booth-undo-take.webp` | #2655 |
| R28 | Low | Import, New project | The last chapter card is clipped; "Bad:name" is accepted (mock) | `import-clipped.webp`, `project-badname.webp` | #2656 |

## Details

### R1 Proof badge and Proof page disagree (High, checked) — #2629

- **Repro.** Open `/proof` in the mock. The rail reads "Proof, 6". The page reads "1 of 5 cleared", with the chips "Open 4" and "Pickups 0". Resolve one note with "Fine as read": the badge drops to 5 and the page to "Open 3".
- **Why.** `components/layout/useNavCounts.ts` adds `openPickupsBeyondNotes` to `proofProgress(...).open`. No figure on the page shows that sum, and its own "Pickups 0" chip says there are none.
- **Fix.** The class-wide test from cluster 2 should compare the badge with a figure the page draws, not with the selector. Show the sum on the page's head, or drop the pickups from the badge.

### R2 Booth in a long chapter (High) — #2630

- **Repro.** Open `/booth?mockBooth=huge-chapter`, which has 1,000 paragraphs.
- **Slow step.** Pressing ArrowDown 10 times measured 1,397 ms and 1,399 ms per press in two runs. ArrowRight takes about 290 ms per press.
- **Render loop.** Press ArrowDown, ArrowUp, ArrowRight, ArrowLeft, PageDown, End and Home 40 times each. "Minified React error #185" fired in 2 of 4 runs. Afterwards the header reads "¶ 1 of 1,000" while about ¶ 7 is on screen, and the resume chip says ¶ 600.
- **Fix.** Find the update loop with a dev build first. Add a Vitest test that sends 200 arrow keydowns to 1,000 paragraphs and expects no "Maximum update depth" error. Add a Playwright timing test with a budget of under 300 ms per phrase step.

### R3 Master to Delivery has no visible path (High, mock) — #2631

- **Repro.** In `/master`, press "Master all to spec…" and then "Master & encode". The status reads "Prepared 5 files.", and each file's status turns Ready.
- **What stays the same.** The chapter rows stay "Waiting", and Book consistency says "No measured files yet". `/delivery` still says "Not mastered", "14 chapters not ready", and "Build ACX package" stays disabled.
- **Only route to a build.** The build ran only with `?mockDelivery=ready`. In the default mock, Chapter 1 is measured and fails at 48 kHz.
- **Fix.** The status should name what was produced and the next step. The table and Delivery should reflect mastered files, or say why they do not. Check whether this is a mock gap before changing the host.

### R4 Errors in the page flow (High, rule 7) — #2632

- **Delivery.** The Output panel draws "Nothing is measured yet. Measure the files in Master & QC." as a red in-flow `role="alert"` `BuildMessage` in `components/delivery/page/OutputPanel.tsx`. It pushes "Profile rules" down.
- **Master & QC, from code.** In-flow alert paragraphs are in `components/master/DiagnosticsSection.tsx`, `ReportExportPanel.tsx`, `MultiPlatformExportPanel.tsx`, `MasterToSpecPanel.tsx` and `components/master/MasteringChain.tsx`.
- **Fix.** Use a toast, or a fixed-height result slot. Check that the inline-error allowlist under `tests/visual/guards/` did not grow to admit them.

### R5 Booth header contradicts itself (Medium, checked) — #2633

- **Repro.** Open `/booth`. Chapter 1 shows "¶ 1 of 24 · 0% · ~13:50 of audio left", a green "Complete" chip and "Resume at ¶ 14 from the saved project". Production says Chapter 1 is recorded (0:10).
- **Why it confuses.** "0%" and "left" describe the reading position, but they sit next to a recording state.
- **Fix.** On a complete chapter, label the position ("at ¶ 1") rather than reading it as remaining work. Do not offer a resume point inside a complete chapter.

### R6 Production figures strip (Medium, checked) — #2634

At 1920 px:

- **Two book lengths.** "Recorded audio" reads "0:10 / 3:08", while "Recording" reads "4:35 left of 9:25 est." and "Editing + Proof" reads "of 9:33 est.".
- **Recorded figures disagree.** The "Where the book stands" bar says Recorded 1:05, Edited 0:28 and Proofed 0:38. The pipeline's Rec. column is "Not linked" for chapters 2 to 12, although their Record cells are ✓.
- **Wrong caption.** "Open pickups 3" carries "not measured yet" under a measured count.
- **Relation to cluster 8.** This remains after #2608 (cluster 8).
- **Fix.** Use one book-length estimate for the strip, and derive "Recorded audio" from the value the stage bar uses. Drop the "not measured yet" caption under a count.

### R7 Tables clipped at 390 px (Medium) — #2635

- **Master & QC.** The file table clips at "PE…", and RMS, Noise floor, Head / tail and Result are off-screen.
- **Proof.** The table clips at "FRO…", and Resolution is off-screen. The "Open notes, by chapter" strip runs past its card, and its first cell reads "In".
- **Relation to other issues.** #1941 covers only Pickups and Schedule, and #149 covers only Production.
- **Fix.** Stack the rows at narrow widths, as Pickups does, or add a scroll cue.

### R8 Settings "Changed" filter misses a setting (Medium) — #2636

- **Repro.** In `/settings`, set Start tone to On (it persists after a reload), then press Changed. The filter reads "Nothing is changed from the defaults".
- **Likely cause.** `isChanged` in `components/settings/data/values.ts` reads only host-scoped fields, while Start tone is a This computer setting (`components/settings/controls/TakeToneBody.tsx`).
- **Fix.** Add a test that changes every row kind and expects each one to appear under Changed.

### R9 Story Bible scan results are not marked (Medium) — #2637

- **Repro.** In `/story-bible`, choose More actions, Scan the manuscript, then Use basic scan now. The toast reads "2 suggestions added; 1 already offered or rejected before." The list still shows 8 entries, and nothing marks the new ones.
- **Where they are.** The new suggestions appear only under Filter › Show › "Needs review (2)".
- **Fix.** The toast's action should open that filter, or the new rows should carry the review marker.

### R10 Instruction prose in the page (Medium, rule 8) — #2638

- **Master & QC.** "Nothing measured yet. Check your rendered chapter files (WAV) to see them here." (`components/masterqc/files/FilesTable.tsx`) and the paragraph that opens the Mastering chain panel (`components/master/MasteringChain.tsx`).
- **Story Bible.** "Names the app links in the text, and how I say each" (`components/storybible/GuideDetail.tsx`) and "No voice samples yet. Mark one in Editing: select words you voiced well and press V." (`components/storybible/voicesamples/VoiceSamplesBody.tsx`).
- **Companion.** "Jump to one or mark it done on the Pickups page in the full app." (`components/pickups/PickupsCompanionSummary.tsx`) and the "Coming soon" paragraphs.
- **Settings, Recording & DAW.** "Only if REAPER cannot be used at all…" and "The app keeps its bridge in REAPER's Scripts folder…".
- **Schedule.** The chart caption "Set a due date to see the plan line…".
- **Script.** The first-load coachmark "Select text in the reader to mark it, add a note, or look it up." covers the chapter card at every width.
- **Fix.** Move each to the row's existing "?" `HelpButton` or a tooltip, and keep only the factual state in the page.

### R11 Uncapped lists (Medium, rule 6) — #2639

- **Where.** The Master & QC file table lists 15 rows in the page, and Delivery's "Before you build" list is the same.
- **Why it breaks the rule.** Rule 6 exempts only the Production pipeline.
- **Fix.** Cap the height and scroll inside a `Panel`.

### R12 Reader widths (Medium, rule 4) — #2640

- **Widths at 1920 px.** The reader column is about 590 px on Script, about 955 px on Booth and about 1000 px on Editing.
- **Editing.** The text is left-aligned in a 1670 px card, leaving about 580 px empty on the right.
- **At 390 px.** Script keeps a gutter of about 100 px, so the reader is about 270 px wide.
- **Fix.** Add one reader-width primitive, `min(chosen measure, container)`.

### R13 Table header alignment (Medium, rule 5) — #2641

- **Where.** Proof ("TIME / TYPE / SCRIPT VS HEARD / FROM / RESOLUTION"), Pickups, Master & QC ("FILE … RESULT") and the Story Bible tables use left or right header alignment.
- **Production.** The "CHAPTER" header is centred over a left-aligned column.
- **Fix.** Route every header through the table header style, and align each header with its column.

### R14 Clipping at 390 px (Medium) — #2642

- **Script.** "MY PREP" clips its last option to "Prepp…", and the "7 WORDS" label is cut off under the header.
- **Editing.** The waveform label "Showing 0:01.30 to 0:…" runs under the "?" icon. The legend is #2171.
- **Delivery.** The values wrap a word or two per line ("mono or / stereo, the / same in every / file") because the label column keeps its width.
- **Fix.** Let the `ToggleGroup` wrap, truncate the label with a tooltip, and stack label and value at narrow widths.

### R15 Folder-track picker (#2570) against the design system (Medium) — #2643

- **The native `Select` rule.** The design system says `Select` "stays native on purpose". #2570 adds an exported non-native `SelectTrigger` (`components/primitives/Select.tsx`), and `components/mapping/TrackSelect.tsx` swaps the native select for a popover tree whenever a track is in a folder. The design-system row was not updated.
- **A duplicate widget.** `components/mapping/TrackTreePicker.tsx` hand-builds a tree widget (roles, roving tabindex, disabled with a reason). That overlaps `Listbox` and the tree mode of `Table`.
- **Dropped props.** In `components/primitives/Table.tsx`, the `tree` branch returns early and silently drops `onActivate`, `selected` and `tabStop`.
- **Fix.** Record the exception in the design system, or ask the owner. Then promote a tree-list primitive, and make `tree` a discriminated union.

### R16 Recording-check wire contract (#2576) (Medium) — #2644

- **One field, two meanings.** In the re-check stage, `sidecars/transcript-compare/core/coverage_mode.py` writes its windows under `firstPass`. The host (`desktop/internal/coverage/activity.go`) then reinterprets that field according to `j.stage`.
- **Missing data-files row.** `<progress>.activity.json` is written by the sidecar and read back by the host, but has no row in `docs/reference/data-files.md`.
- **Fix.** Have the re-check write `recheck`, merge by field, and add the data-files row.

### R17 Credits id owned twice (#2573) (Medium) — #2645

- **Two owners.** `desktop/internal/manuscript/credits.go` adds `OpeningCreditsID`, `ClosingCreditsID` and `IsCreditsID`. `coverage.CreditsChapterID` and `CreditsKind` (`desktop/internal/coverage/chapter.go`) stay in use.
- **Mixed callers.** New code calls both.
- **Titles.** The credits titles are defined three times.
- **Fix.** Make `manuscript` the one owner, and have `coverage` delegate to it.

### R18 Recording-check panel duplicates (#2576) (Low) — #2646

- **Figures row.** In `components/primitives/ActivityPanel.tsx`, the figures row re-implements `StatTile` and uses a local mono font string.
- **Dead tooltips.** Three `action`-kind rows in `icons.catalog.ts` carry tooltips that are never shown.
- **Duplicate formatter.** `clock()` in `components/recordingcheck/activityView.ts` duplicates `components/editing/bar/clock.ts`.

### R19 Size ceilings and mixed concerns (Low) — #2647

- **Booth.** `components/booth/page/BoothNextPage.tsx` has 869 lines, and `BoothSession` alone is about 590 lines with 38 hooks. The reopen and last-place effects are inline. `ResumeReason` is mapped by hand to a second union.
- **Editing.** `components/editing/bar/useScriptPlayback.ts` has 449 lines and mixes audio, DAW routing and diagnostics, with `path` an untyped string. `components/editing/ribbon/useChapterSound.ts` decodes the peaks a second time.
- **Host.** `desktop/bindings_workspace_wordtimes.go` puts a type adapter in `package main`.
- **Fix.** Extract a `useChapterResume` hook and a play-stop report hook, reuse `decodeEntry`, and move the adapter into `internal/wordtimes`.

### R20 Raw schema text on the load-error card (Low) — #2648

- **Repro.** Open `/booth?mockInvalidPayload=manuscript`. `components/layout/LoadError.tsx` shows "host.binding ManuscriptChapters did not match its schema: [0].index: Invalid input…".
- **Fix.** Show a plain sentence with Retry, and put the detail behind a disclosure or in the log.

### R21 Companion (Low) — #2649

- **Stale badge.** "Playhead stopped" stays while the app reads aloud.
- **Missing prompts.** After Stop reading, the Resume and Start from the top prompts are gone.
- **Title.** The title is a `<span>`, not `Heading`.
- **Buttons.** "Play" and "Stop reading" are word buttons (rule 1).

### R22 Script speaker menu (Low) — #2650

- **Repro.** The Change speaker menu lists "Alice / Alice" and "Hatter / Hatter".
- **Duplicate speaker.** "Rabbit" and "White Rabbit" appear as separate speakers.

### R23 Pickups add (Low) — #2651

- **Error shown twice.** An empty submit shows "Type the line first." both inline and as a toast.
- **Hint.** The time hint (05:12.0) is dark enough to read as a filled value.

### R24 Locked rail items (Low) — #2652

- **Repro.** With no manuscript (`?mockNoManuscript=1`), the reason "Import a manuscript to unlock this page." appears on keyboard focus, but not on mouse hover within 800 ms.

### R25 Titles and toolbar buttons (Low, rules 1 and 2) — #2653

- **Settings.** "Settings" and "Recording & DAW" are both title-sized, with a breadcrumb between them.
- **Master & QC toolbar.** "Master all to spec…" and "Check files…" are text buttons. The first is ellipsized at 1280 and at 390 px.

### R26 Page width at 1920 px (Low) — #2654

- **Pickups.** The table spans about 1270 px, its line column is about 700 px, and the session panel is mostly empty.
- **Master & QC.** The page is centred with a max width, while Proof, Pickups and Editing fill the width.
- **Fix.** Pick one width policy.

### R27 Booth take undo (Low) — #2655

- **Repro.** Record, Stop, then press Undo on the "Take saved" toast. This session still reads "Recorded 00:02".
- **Fix.** Undo should take the take out of the session figure, or say it is kept.

### R28 Import and new project (Low, mock) — #2656

- **Import dialog.** In step 2, the last chapter card ("Chapter Five") is clipped at the bottom of the Chapters box.
- **New project.** The name "Bad:name" is accepted with no error. The mock may skip validation.
