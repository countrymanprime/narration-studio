# Narration Studio: React + TypeScript rebuild

Read this first. It is the contract every page follows.

## What this is

A data-driven rebuild of the single-file mock at
the earlier single-file proposal (`narration-studio-proposal.html`, not kept in the repo)
(vanilla JS, ~1,940 lines, **the spec**). Same screens, same behaviour, same look — but every screen
reads from typed data through selectors, nothing is hard-coded, and the UI is React + TypeScript with
Font Awesome Free icons.

Also available: `ui/NeedManuscript` (a page's empty state until a manuscript is imported), `ui/TextSettings` (reader font/size/spacing/width
sliders), `app/context` `tailItems()`/`pageItems()`, `app/help` `SHORTCUTS`, `selectors/reader` (FONTS, SIZES, fontCss, readerVars).
Booth mirror text was removed at the owner's request: do not port it (state, key, button or shortcut row).

## Rules from the owner (do not break)

- **Do not read the repo.** Do not open anything under `/home/user/narration-utils` (the app's own code, docs,
  ADRs, mocks). Allowed inputs: the mock above, this project, and tooling in `node_modules`
  (Playwright is at `/home/user/narration-utils/apps/ui/node_modules/@playwright/test`, already wired in `e2e/lib.mjs`).
- **Enhance, don't replace.** Keep every behaviour, label, control and decision in the mock. Do not invent
  content, capabilities, copy or notes. No explanatory/assumption/draft notes on pages (use code comments).
  Mock-only controls live in the Mock states panel only.
- One book per app. Single source of truth for every idea (chapter heading, pickups, stage progress…).
- If you find a bug in the mock while porting, fix it in the port and list it in your report (never silently).

## Layout

```text
src/domain/schemas.ts     Zod schemas = the data types (z.infer). Align with real types later.
src/fixtures/             Sample book data (alice.ts) + makeBook() (book.ts). Add sample data HERE, never in a component.
src/format/               headings (one formatter per idea), time, text helpers.
src/selectors/            Pure functions of BookData: chapters, progress (calc, vals), proof, pickups, master, bible,
                          annotations, phrases (speakers), search, segments (reader rendering), reader (fonts/sizes).
src/state/store.ts        update(fn), act(label, fn, {daw, restoreUi}) → undoable, undoEntry/undoLast, useStudio/useData/useUi/useMock.
src/state/slices/ui.ts    Screen state by page (script, proof, pickups, master, delivery, booth, bible, check, prefs).
src/state/slices/mock.ts  Mock-only forced states (setup, companion, reaperTop, deliveryReady, net, deadline…).
src/state/commands/       Commands (functions that change state): nav.ts, prefs.ts, script.ts. Add <page>.ts for yours.
src/state/daw.ts          DawAdapter interface + mock. EVERY DAW action goes through daw(); never fake it in a component.
src/ui/                   Icon (FontAwesome), IconButton, Pill, Seg, Swatch, Field, Menu (openMenu), ChapterBar,
                          overlay.ts (toast, toastUndo, openModal, popAt, openPopoverAt, openCtx, openCtxAt, I/L/SEP/SUB),
                          OverlayHost.tsx (renders them).
src/providers/            Provider interfaces for what a real engine will do later, each with a mock fed by fixture data. pronunciation.ts: sources()/defaultSource()/
                          candidate(word, source) (data in fixtures/pronunciation.ts); swap with setPronunciationProvider(). A pronunciation (a flagged word, or one
                          name of a Story Bible entry) stores its text and the id of its source ('manual' = typed; state/commands/pronunciation.ts, ui/PronSource.tsx).
                          Story Bible: speaker colour per entry (selectors/speakers.ts speakerColourOf: entry.colour or a stable palette pick by id), merge on a name
                          collision (commands/bible.ts mergeEntries), unsaved new entries are drafts dropped on Cancel, list sort + needs-review filter in ui.bible,
                          imported entries/names carry `review` flags until marked reviewed, "Appears in" lists chapters only (selectors/bible.ts appearsIn).
                          Production/Schedule (batch B): config/estimates.ts holds every fixed input (WPH, RATIO, PACE, PICKUP_HOURS, WARN_DAYS; progress.ts re-exports the first three).
                          providers/measurements.ts (data in fixtures/measurements.ts) answers room tone per microphone, the take log and booth time for pickups as
                          `Measured<T>` (value or reason); selectors/measured.ts turns them into the chart's recorded line, This week, room-tone label and session minutes,
                          and screens show NOT_MEASURED when there is no source (mock toggle: mock.measurements). deadlineTone/isFinished/contractValue/planStart live in
                          selectors/progress.ts, Next up ranking in selectors/nextup.ts (risk hours, then group, then stage). data.contract {payment, amount} with the
                          payment types and milestone templates in fixtures/schedule.ts; milestones carry `note` and scopes chN / minN. Recording checks are data.checks
                          (model, textKey, rec, at); selectors/checks.ts gives current / stale / none, shared by Production and the Pickups check dialog.
                          DAW plumbing (batch C1): domain/daw.ts (Zod: DawCapabilities {daw, reachable, caps{level, available, reason?, destructive?}}, DawResult {ok, changed,
                          message, undoSteps, refused?}, DawProjectState {savedAt, unsavedChanges, playState}, tracks/items/markers, ResumePoint, LiveFlag). state/daw.ts is the
                          DawAdapter: every call answers a DawResult (toast `.message`; a refusal carries the capability's own reason, controls never word their own) and the
                          mock keeps a small live project (tracks, items, markers, arms, transport) that resetState() puts back. fixtures/daw.ts is the one data module per setup
                          (capabilities for reaper / reaper-off / builtin / audacity, saved project, which chapters have tracks, refusal texts); selectors/daw.ts reads it
                          (capabilitiesFor, gateOf(mock, 'markers') -> {ok, label, reason}, dawLabel, guidOf = guid-like ids with a revision, saveNote, lastEnd). Stale ids:
                          setActiveTake(takeId, passageId) is refused when mock.dawStale (the DAW re-created its items); commands ask the DAW first and change nothing on a refusal.
                          Pickup markers: PICKUP: / PICKUP_DONE: marker names are the DAW-side truth; commands/pickups.ts writeThroughDone writes the app's done state through
                          (data.pickSync holds writes made while the DAW was away) and reconcilePickupMarkers() takes the DAW's markers on opening Booth / Pickups.
                          Mock states panel: Audacity setup, "DAW project" group (audacityBackups, dawUnsaved, dawStale).
                          Booth (batch C1): Record asks recordCheck(chapter) (running, capability, one chapter = one track, not playing) and the Record control shows the reason;
                          a take arms only the chapter's track and starts at recordStartAt (end of the last item) unless Start from here lies inside it (a punch). Roll and punch
                          ask first when the roll capability is destructive (Audacity without backups). store.setChangeGuard lets the Booth hold any change of page while a take
                          runs: "Stop recording?" (ui/ConfirmDialog.tsx) then the DAW's recording is stopped and the same change replays. Resume at ¶ n (data.resume, or the end of
                          the last item on the track); providers/speech.ts (data in fixtures/speech.ts) reports suspected skips/restarts that become Pickups with src 'speech',
                          live: true (stable key flagKey, dismissible, never added again); F11 toggleFullscreen; the pedal is Space only.
                          Pickups, Proof, Editing (batch C2): speech check: providers/speech.ts (data in fixtures/speech.ts) reports the live engine (Moonshine, Booth only) and the offline
                          engines the host offers (Whisper-class, listed by the Check recordings dialog), transcribes a chapter (`check`) and re-checks notes (`recheck`);
                          selectors/gaps.ts classifies what was heard against the text: missing / extra words / misread inside the read part, and paragraphs unread at the start
                          or end are `unfinished`, never pickups. Pickup `conf` is a number or null with `confReason` (never made up); commands/pickups.ts detectPickups stores a
                          RecordingCheck {model, basis (the DAW's last save), gaps, readTo, paras, unfinished}; checkState(b, id, basis) goes stale when text, recording or save moves.
                          Pickups only points to the Booth (no cursor or punch). Proof: ProofNote carries conf/confReason, an `evidence` key and an append-only `history` of decisions
                          (commands/notes.ts setNoteRes is the only writer of `res`); selectors/proof.ts isCleared / noteProgress give the two counters (decided, cleared), a note is open
                          until fixed, waived or dismissed, and vals().proof is held at 99 while a pickup is open. Stale guard: ui.proof.seen is the evidence the narrator looked at;
                          a decision on changed evidence is refused, the Inspector shows before/now, the typed note (ui.proof.dnote) stays. Sort (time/confidence/severity) and the
                          Sources line are selectors; Add marker goes through daw().addMarker with a kind prefix. Editing: providers/takes.ts (fixtures/takes.ts) measures a take
                          (pause, level, noise floor, clarity, breaths) with prep steps applied; selectors/takes.ts suggestTake gives the favoured take with a confidence that is null
                          (with the reason) until levels are comparable and rises as trims are applied (config/estimates.ts holds the thresholds); commands/editing.ts applyPrep never
                          runs by itself. Hide other takes (hideTakes) replaces removal, nothing is ever deleted. The Booth writes data.passageMap (commands/passagemap.ts, marks with the
                          ids the DAW gave) and selectors/passagemap.ts turns it into passages (via 'map'); fixture takes are via 'alignment' (shown as Aligned). duplicateRead finds a
                          take that reads the line twice and splitDuplicate cuts it (DAW when the `takes` capability allows, else the built-in recorder). Audacity: data.backups,
                          editor.backups / backupWindow / backupKeepDays (Editing, Backups tab, shown only for DAWs with the capability), commands/backups.ts backupBefore is called by
                          the Booth's punch and roll and by split/prep; capabilitiesFor(setup, backups) reads the setting, so Audacity's roll is non-destructive exactly when backups are on
                          and its takes become clips. DAW wording on Proof / Editing / Production is capability-driven (selectors/daw.ts gateOf, editGateOf).
Stacking retries (batch D3): data.editor.retryMode ('leave' by default) + retryChapters, Passage.retryMode (own choice) and Passage.stack {id, base, offsets (seconds after the first
                          read, by take id), backupId}; selectors/stacking.ts (retryModeOf passage > chapter > project, movableTakes/canStack/canUnstack, stackGeometry/unstackGeometry,
                          stackPlan/unstackPlan for the confirmation, canCleanUp) is pure; commands/stacking.ts asks (requestStack/requestUnstack via modals.stackTakes, dialog in
                          pages/editing/StackDialog.tsx), then stackRetries/unstackRetries go to the DAW first (DawAdapter.stackTakes/unstackTakes, capability `stackTakes` with
                          Capability.mode native|app|steps; fixtures/daw.ts STACK_PLAN holds the undo wording and Audacity's step checklist; Audacity needs backups and backupBefore
                          clones the region first) and only then change the book in one act() (the later reads move onto the first read's start, the audio that follows moves by the
                          freed seconds: other passages, detections, effects, notes). Un-stack restores by offsets, per take or per passage, until a take is kept. Leave mode: after a
                          keep, requestCleanUp hides the other reads (hideOtherTakes) after a backup in DAWs that keep them. mergePassages leaves stacked passages and their chapter's
                          moved audio alone. Waveform bands take lane/lanes so stacked takes draw one above the other.
Delivery profile + milestones (batch D1): the project's delivery profile is data.deliveryProfile (id from fixtures/platforms.ts: ACX, Other / none; chosen on the first
                          import, changed in Settings). selectors/platform.ts (platformOf, platformHas) is the one lookup for what a profile unlocks (a capability list per profile;
                          MEASURES entries carry `needs`); setDeliveryProfile gives an unset contract the profile's default payment. Milestones: Schedule shows a read-only table
                          (selectors/milestones.ts measureText writes the measure with its value, measureOptions gates by profile) and edits in a dialog (saveMilestone / removeMilestone
                          are undoable, MilestoneDraft). The checkpoint measure has scope 'checkpoint' (CHECKPOINT_MINUTES). Replace manuscript lives in Settings > Manuscript. The app logo is the microphone.
Production and Proof additions (batch F): finished-hour target: selectors/pace.ts (ownRate from providers/measurements chapterLengths, basisOf / wphOf / targetHours; data.rateBasis
                          'standard' | 'own', calc().wph) and pages/production/TargetInfo.tsx (info icon + popover on the Recording KPI, no layout space). Stage readiness: domain
                          StageId / StageDecision / StageSuggestion (data.stageDecisions append-only, data.stageSuggestions), providers/readiness.ts (stage list, fixtures/readiness.ts),
                          selectors/readiness.ts (stageItems = evidence the app can measure, stageReadiness verdict + key + changes, replayed decisions give the current stage;
                          readinessKey.ts is the hash), state/commands/readiness.ts (confirm / dismiss / revert via act, evidence-key refusal as Proof's guard, stampSuggestions),
                          pages/production/StageReadiness.tsx (chip on the pipeline cell + slide-over: openModal side:true). Status report: selectors/report.ts (buildReport,
                          reportHtml / reportBodyHtml / reportJson, file name and path; pure), state/commands/report.ts (exportStatusReport: in memory, data.reports record),
                          pages/production/ReportDialog.tsx (modals.statusReport). Takes on Proof: selectors/proofTakes.ts (spotOf, takeCounts, heardMarkup), pages/proof/TakeLanes.tsx,
                          badge in NotesTable, "Takes at this spot" in the Inspector, commands/proofTakes.ts (play raw only). Recording check card: providers/recordingcheck.ts
                          (fixtures/recordingcheck.ts: categories from speech and audio, findings by chapter), selectors/checkcard.ts (state none / checking / current / stale
                          from selectors/checks.ts, counts, as-of-last-save), commands/checkcard.ts (run with paced progress then detectPickups, cancel, accept -> proof note with the
                          suggested decision, ignore; data.findingReviews), pages/proof/CheckCard.tsx.
Bookmarks (batch G): data.bookmarks (domain/schemas.ts Bookmark: id, chapterId, pid + character offset, optional label and note, `at` from the mock clock; the narrator's own place-holders, not
                          discussions; cleared by finishImport and newProject). selectors/bookmarks.ts (order, by chapter, snippet/title/tip, stepBookmark with wrap, boothSpot / boothPositionOf),
                          state/commands/bookmarks.ts (add / update / remove through act, showBookmarkInScript sets ui.script.pendingBm / bmAt / bmFlash, showBookmarkInBooth sets the reading
                          position, goToBookmark picks by page, stepBookmarks). app/bookmarks.ts holds what the two pages share: bookmarkInScript / bookmarkInBooth, step from the right place,
                          the ribbon's right-click menu and the jump-menu commands ("Bookmark: <label or words>", Bookmark here, Next / Previous). ui/BookmarkEditor.tsx is the ribbon button
                          and the label / note popover (saved as one undo step on blur or close). Ribbons: Script gutter (pages/script/Para.tsx Gutter, line found by selection.ts lineTop),
                          Booth right margin (pages/booth/Teleprompter.tsx Ribbons, measured from the word). List: the Bookmarks tab of the Script side panel (pages/script/BookmarksTab.tsx),
                          which is the rail drawer at 1280 and below. Keys: B, [ and ] on Script and Booth (Legend, Booth footer, help sheet, Settings list); styles/bookmarks.css.
Story Bible extraction (batch H): data.suggestions (domain/extraction.ts ExtractionSuggestion {kind entry|alias|property|relationship|claim talk/act/know|speaker, payload, entryId, evidence[{paragraphId,start,end,text}],
                          confidence number|null, source, status accepted-auto|needs-verification|accepted|rejected, fp}); config/extraction.ts holds VERIFY_BELOW = 0.75 (the one place) and the
                          source registry (rules, imported, local-model). Rule (selectors/extraction.ts reasonsOf / autoStatus): confidence null or under the threshold, a quote not found in the text
                          ('quote not found'), no quote on a property/claim/speaker, or an entry that is not in the Story Bible -> needs-verification (feeds the same review flags: entryNeedsReview
                          in selectors/bible.ts, blocks Mark reviewed); otherwise accepted-auto (applied, flagged Review, still listed under "Suggested"). format/evidence.ts verifyEvidence finds the
                          quote (curly/straight quotes match) and computes offsets; fingerprint() recognises the same thing offered again. state/extractionCore.ts is pure on book data (ingestRaw,
                          settle, acceptSuggestion, rejectSuggestion, reviewSuggestion, clearSuggestions; applying records `applied` so Reject takes it back; a rejected suggestion stays as the
                          tombstone). state/commands/extraction.ts runs them through act (undoable); finishImport / newProject clear suggestions. providers/extraction.ts: ExtractionProvider
                          (rules = fixtures/extraction.ts findings, imported = the parser, local-model = unavailable with a reason); makeBook seeds the sample queue from the rules provider.
                          Import: format/extractionImport.ts (pure CSV + JSON parse and Zod validation, per-row errors), selectors/extractionImport.ts planImport (preview worked out on a copy by the
                          real ingest code: add / merge / skip, rows about unknown entries are errors), config/extractionPrompt.ts + format/extractionPrompt.ts (prompt template, filled from the
                          format), fixtures/extractionExample.ts (shown in a copyable box), pages/bible/ImportDialog.tsx, pages/bible/Suggested.tsx (rows, confidence chip, labelled Says/Does/Knows).
                          Merge helpers moved to selectors/bibleMerge.ts (re-exported from commands/bible.ts).
Story Bible analysis tools (batch I): optional downloads, never bundled. domain/components.ts (Zod ComponentSpec, ComponentJob, AnalysisHost), fixtures/components.ts (registry data: GLiNER,
                          BookNLP small / large, Local language model with `unavailable` reason; HOST_FREE_DISK_MB), config/components.ts (mock pace), providers/components.ts (ComponentProvider:
                          specs / install with progress + AbortSignal / remove; the mock paces a download and fails as mock.analysisHost says: blocked -> unreachable, lowdisk -> disk; Mock states >
                          "Analysis tools"). Installed ids and the ask-first choice live in ui.prefs (installedComponents, analysisPrompt: saved to local storage); downloads in progress or failed in
                          ui.components. selectors/components.ts (statusOf, scanSources, shouldOffer, recommended), state/commands/components.ts (installComponent / installComponents /
                          cancelInstall / dismissFailure / removeComponent / setAnalysisPrompt). Scan: commands/extraction.ts scanManuscript runs rules plus each installed tool's source in one undo
                          step; providers/extraction.ts createMockGliner / createMockBookNlp (fixtures/extraction.ts GLINER_FINDINGS, BOOKNLP_FINDINGS with per-variant confidence) are sources
                          'gliner' and 'booknlp' in config/extraction.ts (own label and icon); a finding can carry flag 'duplicate' + note (shown on the row). UI: pages/settings/AnalysisTools.tsx
                          (Settings > Story Bible analysis), ui/ComponentConsent.tsx (openConsent: what / size / host / licence, Download or Cancel), pages/bible/startScan.tsx (first-scan prompt:
                          basic scan, download the recommended pair, import from a file; "Don't ask again"), styles/components.css.
src/ui/KeyCap.tsx         Key -> picture mapping (arrows, Enter, Esc, Tab, Backspace in Font Awesome; space bar and right-click as inline SVG; other keys stay text). KeyCap/KeyChord are used by ui/KeyHints (Booth, Proof, Editing footer: own tone, top line, sticky on Proof/Editing) and the help sheet (app/help.tsx, structured specs; SHORTCUTS stays text for Settings).
src/ui/Waveform.tsx       The chapter waveform (overview strip, window, pins, optional bands and drag-a-range). Proof draws it (Editing draws its own ribbon, pages/editing/Ribbon.tsx, from the words' times). The overview window moves by grabbing and resizes by its two edge handles (window.resize; selectors/proof resizeWindow/stepLen, minimum MIN_WINDOW); the zoomed wave is symmetric about its centerline. Proof chapter step = Left/Right (ARROW_CHAPTER_PAGES in ui/ChapterBar); Editing's chapter step is Alt+Up/Down and its keys live in pages/Editing.tsx registerKeys.
src/pages/Editing.tsx     Editing (script-based audio editing, design E): the chapter's own text is the editor (read-only text, the audio is edited). pages/editing/ScriptDoc.tsx draws
                          the words against what was heard (ScriptDoc/Word/ParaText memoised per paragraph), pages/editing/{Ribbon,FlagCard,Bar,Strip,Drawer,RangeDialogs,TakeParts}.tsx the ribbon
                          under the active line, the cards of flagged words, the bar (transport, selection, Add FX / Mute / Delete) and the floating toolbar, the timeline strip, the drawer
                          (Clean up | Effects | Backups, plus Timeline where the strip does not fit) and the confirmations. Cleanup/Effects/Backups lists keep their components (CleanupTab, EffectsTab,
                          BackupsTab, Coverage) and live in the drawer; takes are inline sub-lines under each passage (TakeParts: TakesChip, TakesInline). Keys in Editing.tsx registerKeys
                          (Space, word arrows, Shift selects, Ctrl phrase, Del, M, F, T/Shift+T, Enter, H, [ ], S, Esc, Ctrl+Shift+C); chapter step is Alt+Up/Down.
src/providers/alignment.ts What the recording sounds like, word by word (data fixtures/alignment.ts, HEARD_EDITS keyed by take or paragraph id, plus the speech check's own findings): heard(req) answers
                          words with offsets from the start of the stretch, a confidence and an `added` flag, or null while mock.alignment is 'none'; snap() moves a cut to a zero crossing.
                          Swap with setAlignmentProvider(). selectors/scriptedit.ts sets those words against the manuscript (alignToScript: matches, misreads paired by look-alike,
                          not read, extra words), builds ChapterDoc (items with stable keys `pid:n` / `pid:xn`, times as they stand now, cuts and effects applied, accepted words), the selection
                          model (rangeKeys, stepKey/stepPhrase/stepFlag), summarize() (ranges per paragraph, snapped, padded) and the geometry the dialogs show. selectors/cuts.ts (curTime/origTime/takeShift)
                          places audio after closed cuts from the cut list alone (cuts are kept in the recording as it was before any cut).
                          Cutting and effects on words: DawAdapter.deleteRange / applyFxToRange / removeFxFromRange behind capabilities `cutRange` and `fxRange` (fixtures/daw.ts: reaper native,
                          builtin app (edit list), audacity steps and only with backups; RANGE_PLAN holds the wording and undo steps per mode, selectors/daw.ts rangePlanOf/fillPlan); a call carries the
                          passage key and item guid and is refused when they are stale. providers/fxchains.ts (fixtures/fxchains.ts) lists the DAW's own saved chains / effects / macros for Add FX.
                          state/commands/scriptedit.ts: selection (clickWord, selectBetween, extendSel, jumpFlag), listening (playFrom/togglePlay with the playhead in ui.editing.playT, follow until a
                          hand scroll), requestDelete/deleteWords (backup first where the DAW changes the audio, DAW first, then one act() entry: cut record, take shortened, later takes/findings/effects
                          shifted by commands/stacking.ts shiftAfter, struck words kept), restoreCut (undoes that entry), fxPlanFor/requestFx/applyWordFx/removeWordFx (data.wordFx; one undo step; coverage
                          cap warning), acceptWords (data.accepted), markWords/markForPickup. Schemas: EditCut, WordFx (additive, stable ids), data.cuts / data.wordFx / data.accepted. This is the
                          owner-approved exception to ADR 0234 (FX on a selected range of words): never auto-applied, always confirmed, shown as an underline and an FX marker with a way to remove.
src/ui/primitives/        Form controls on Base UI + Tailwind: Checkbox, Radio(Group), Input, Textarea, Select, Slider, NumberInput, FieldRow
                          (import from '@/ui/primitives'). NEVER write a raw <input>/<select>/<textarea>: tests/no-raw-controls.test.ts fails
                          (only `native-control-ok: <why>` on the line allows one, e.g. the hidden file input). Select is a button + popup
                          (tests pick with tests/helpers/select.ts chooseOption); its popup carries data-keeppop.
src/app/                  App, Shell (rail, top bar), keys (global), palette, help, history, mock-states, context, registry, modals.
src/pages/<Page>.tsx      One default-exported component per page, registered in pages/index.ts.
src/styles/app.css        The mock's CSS, verbatim. USE THE SAME CLASS NAMES AND MARKUP so it applies unchanged.
tests/                    Vitest + React Testing Library.  e2e/  Playwright parity tools.
```

## How to port a page

1. Read your section(s) of the mock. Port markup 1:1 (same classes, same `aria-*`, same labels, same `data-tip`).
   `ib('icon','Tip',attrs)` → `<IconButton icon="…" tip="Tip" />`. Icons: add new names to `ui/Icon.tsx` ICONS (Font Awesome Free only).
2. Read state with `useData()`, `useUi()`, `useMock()` (or `useStudio(s => s.ui.proof)`). **Selectors passed to useStudio must
   return an existing slice, never a freshly built array/object** — derive with `useMemo` from the slice.
3. Names of chapters ALWAYS come from `chName(data, c)` / `chTag(data, c)` / `chLabel(data, c)`. Never write "Ch 5", "CHAPTER V",
   or a title literal. Counts, lists, labels come from selectors over `data`.
4. Change state only through commands in `src/state/commands/<page>.ts`: `update(d => …)` for plain changes,
   `act('Label', d => …, { daw: true })` for anything the mock recorded in its undo history (`act(...)`) — keep every one of those,
   with the same label and `daw` flag, and the same `toast(msg, undo)` offer (`toastUndo(msg, entry)`).
   DAW effects: call `daw().xxx()` and toast its returned message.
5. Overlays: `openModal({label, wide, render:({close}) => <…/>})`, popovers `popAt(btn, ({close}) => <…/>, 'menu')`,
   menus `openMenu(btn, items, cur, pick)`, context menus via items `I/L/SEP/SUB`.
   Dialogs shared with other pages are opened through `modals.xxx` (app/modals.ts); the page that owns a dialog assigns it at module load
   (`modals.importFlow = …`).
6. Wire into the shared systems from your page module (top level, runs at import):
   `registerContext(fn)` right-click menus (port the mock's `ctxItems` branches for your page, ending with `tailItems()` where the mock did),
   `registerCommands(() => Command[])` jump-menu commands, `registerSearch`, `registerKeys('page', (e, info) => …)` page keys
   (port the mock's global key handler branches for your page; respect `info.typing`, `info.plain`, `info.hadPop`).
7. Keep the page's own screen state in its slice (`state/slices/ui.ts`); add fields there if needed (small, additive edits).
8. Persisted prefs are `ui.prefs` (saved to localStorage automatically).

## Tests (required)

- Vitest + RTL under `tests/<page>.test.tsx`. Reset with `resetState(createInitialState())`, render `<OverlayHost/>` + the page.
  One test per behaviour decided in the mock (decisions are visible in the mock's comments and controls).
- Add scenario coverage: your page must render correctly with `makeBook({headingStyle})` for all three styles and `chapters: 40`,
  with no hard-coded chapter text (assert on `chName(data, c)` output).

## Verification (required before you report)

- `npx tsc --noEmit` (errors in files you do not own can be ignored while others are mid-edit), `npx vitest run tests/<yours>`.
- Build to YOUR OWN dir so parallel work does not collide: `OUT_DIR=dist-<you> SINGLE=1 npx vite build`, then
  `APP_DIST=dist-<you> node e2e/shot.mjs app "<Rail label>" out.png [light|dark] [w] [h]` and the same with `mock` for the original.
  Look at both PNGs (Read the image files) at 1440×900 light and dark for each main state, and fix differences. Also check 1100×800.
- Drive interactions with Playwright (`e2e/lib.mjs` helpers `open`, `nav`, `mockState`) and compare against the mock: same clicks, same
  visible result. Use `page.errors` to assert no console/page errors.

## Report back

Short: files created, what is ported, tests added, parity verified (states checked), mock bugs found + fixed, anything NOT ported and why.
