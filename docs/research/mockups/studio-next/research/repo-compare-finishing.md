# Repo vs our rebuild: Master & QC, Delivery, Editing, Settings, project picker/import, app shell, design system

Scope: the owner's "finishing" share. Repo = `/home/user/narration-utils` (read-only). Ours = `/tmp/claude-0/-home-user-narration-utils/af1a83ba-1a93-5f2f-9822-2dde169a851a/scratchpad/studio` (`src/`, `ARCHITECTURE.md`, `tests/`). ADR numbers were checked against `docs/adr/` file names and read where cited.

## 0. Things that could NOT be found in the repo (so there is nothing to translate)

- **No Editing page and no Editing mock.** The seven benchmark mocks are 01 Production, 02 Script, 03 Booth, 04 Proof/Pickups, 05 Master & QC, 06 Series bible, 07 DAW companion (`docs/research/mockups/audiobook-studio-benchmark/`). Editing in the repo is a per-chapter "editing check" slide-over (`components/editing/EditingCheckPanel.tsx`) plus take/FX tools inside the Proof chapter view (`components/proof/*`). Our Takes | Cleanup | Effects page has no repo counterpart.
- **No Schedule page.** ADR 0407 point 5 says a nav item exists only for a page that exists. Our Schedule is ours alone (the benchmark mock rail still draws it).
- **No Delivery page.** It was merged into Master & QC (`/delivery` redirects to `/master`, `App.tsx:618`; ADR 0407, ADR 0440). Delivery profile editing lives in Settings > Delivery (`components/settings/DeliveryProfilesPanel.tsx`, `DeliveryProfileEditor.tsx`).
- **No command palette / jump menu and no in-app undo history.** Grepped `apps/ui/src` and `docs`: only REAPER's own undo exists ("one Undo in REAPER takes it back"). `Ctrl+K` and `Ctrl+Z` in the repo are ours only. The repo's nearest things are Back/Forward (Alt+Left/Right) and the "?" shortcut sheet.
- **No mock for Settings, project picker, import, or the shell** other than the rail and header drawn inside each benchmark mock. Those are scored by `pnpm --dir apps/ui mock-match` (ADR 0636), not by a dedicated mock.
- **Not built in the repo yet:** a mastering-chain editor ("Edit chain" is not drawn, ADR 0321/0440), a per-file Clicks and Text column on Master (nothing measures them, ADR 0440 point 5), "Quietest 5 s", "A/B raw vs mastered", "Preview naming" (same ADR), the REAPER "daw" mastering row (declared NotYetAvailable, ADR 0306), a REAPER command to set an FX parameter, bypass or remove an FX (ADR 0234 lists only `list_fx_chains`, `apply_fx_chain`, `list_fx`, `add_take_fx`, `set_active_take`).

## 1. Master & QC and Delivery

### 1.1 What the repo does

- One page `/master` (`components/master/MasterQcPage.tsx`, 411 lines) built to mock 05. Sections: platform tabs, per-file checks (`PerFileChecks.tsx`), "Why it fails" with a suggested fix (`WhyItFails.tsx`), book consistency chart (`BookConsistency.tsx`) and checklist (`BookChecklist.tsx`), mastering chain (`MasteringChain.tsx`), "Master all to spec..." (`MasterToSpecPanel.tsx`), delivery package and multi-platform export (`DeliveryPackagePanel.tsx`, `MultiPlatformExportPanel.tsx`, `useExportJobs.ts`), diagnostics and report sections (`DiagnosticsSection.tsx`, `ReportExportPanel.tsx`).
- **Platform tabs are the project's saved delivery profile**, not a view filter (ADR 0440): pressing one saves it (`deliverySelectProfile('project', ...)`, same call as Settings > Delivery) and the host re-judges. Drawn as a `ToggleGroup look="segmented"`. Only ACX is built in; other tabs appear when their profile exists.
- **Profile model** (`docs/prds/delivery-platform-profiles.prd.md`, ADR 0179): `{id, name, platform, version, builtIn, basedOn, rules[]}`. A rule has `scope` (file/book), `metric` (rms_dbfs, sample_peak_dbfs, true_peak_dbtp, noise_floor_dbfs, integrated_lufs, head/tail room tone seconds, mp3 bitrate/cbr, credits/retail-sample checklist items), a bound (min/max/oneOf/sameAcrossFiles), `level` (required vs advice), `checkedBy` (measured / not_yet / listen) and `verification` (verified / to_verify / conflicting) with a quoted source. Custom profiles are copies with changed numbers, version bumped on save, cannot add a rule kind the app does not measure.
- **Honest verdicts** (ADR 0440 point 6): Fail / "Not judged" / Pass. A rule the app did not measure is counted under the verdict ("1 to check yourself"), never counted as met. `JudgementSummary` in `MasterQcPage.tsx` spells out which rules each file missed and which rules the app does not check.
- **Mastering** is a provider port (ADR 0306): `builtin` row (fixed 80 Hz high-pass, limiter 0.5 dB under the peak limit, gain to the middle of the RMS window, ADR 0321), `daw` row (REAPER FX render, needs per-render approval, Experimental, not yet available), `audacity` planned. One in-process judge (`internal/measure` + `internal/deliveryprofile`) measures whatever any row produced, so the same ruler applies. The chain is shown read-only as chips; the project picks its row (`Mastering.provider`).
- Package and export: "Master to spec" writes only new files, never over a source (conformance suite `masteringporttest`), needs approval where the row needs it; multi-platform export; PDF/report export; ID3 chapter embedding (`internal/chaptertags`).
- Measurement is a host job with real progress, cancel, polling every 500 ms (`MasterQcPage.tsx` `POLL_MS`); jobs survive leaving the page (ADR 0015, ADR 0075).
- Delivery findings feed Proof (`delivery_qc` findings, `proof/deliveryFindingFormat.ts`); a Proof finding deep-links into Master with the file and rule opened (`master/masterLink.ts`, `focus` prop).
- Settings > Delivery: profile list, editor, retail sample panel (`RetailSamplePanel.tsx`), credits (`CreditsPanel.tsx`).

### 1.2 What ours does

- `pages/Master.tsx` (206 lines): per-file table (Length, RMS, Peak, Noise floor, Head/Tail, Clicks, Text, Result) with roving-row keyboard and a right-click menu; "why it fails" panel listing each limit with limit text; RMS consistency strip (SVG) with spread; delivery-package checklist computed from the profile's format (max minutes, retail sample range, channels/rate/format); chapter bar; Recheck, Play quietest 5 s, Open in REAPER (DAW adapter calls).
- `pages/Delivery.tsx` (109 lines): profile menu, an editable custom profile (limits and format via `CommitInput`), output folder, Build button gated on "every chapter passes", written-files list, and a "Before you build" per-chapter pass list that jumps to Master.
- `selectors/master.ts`: pure `rule`, `masterFails`, `chapterStates`, `consistency`; `state/commands/delivery.ts`.

### 1.3 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Platform tabs (ACX, INaudio, Google Play, Apple M4B, Kobo) | Tabs = saved project profile; only ACX exists (ADR 0440) | Profile dropdown on Delivery, label chip on Master | Translate the segmented tab row onto our Master (the mock draws it); keep multiple profiles seeded, since our fixtures can show all five |
| Rule model with `checkedBy` / `level` / `verification` | Yes (PRD profile model, ADR 0179) | Fixed five numeric limits + format strings | Translate: add `checkedBy` (measured / not yet / listen) and `level` (required / advice) to our `Limit` type and show "N to check yourself" |
| Verdicts Fail / Not judged / Pass | Yes (ADR 0440 pt 6) | Pass / Fail / Waiting | Translate "Not judged" (silent or unmeasurable file) |
| True peak (dBTP, EBU R128) | In measure + mock 05 header says "true peak (EBU R128)" | Sample "Peak" | Translate: label the column True peak, keep sample peak in the detail |
| Per-file Clicks / Text columns | Drawn by the mock, left out in the app (no data) | Have both | Keep ours (mock-faithful) |
| "Why it fails" with suggested fix | Per rule, fix promises only what the built-in chain does (RMS, peaks), noise floor/sample rate sent to the DAW | Lists every limit with limit text, no fix text | Translate the suggested-fix sentence, with the same honesty rule (do not promise a fix the chain cannot do) |
| Book consistency | Chart + book checklist + spread (PRD phase 10) | RMS strip + spread | Keep ours; add the repo's checklist items (credits files separate, one chapter per file, retail sample 1-5 min) |
| Mastering chain chips | Read-only chips, provider row, approval | None | Translate as a panel (mock 05): Room-tone fill > De-click > High-pass 80 Hz > EQ > Limiter -3.5 dBTP > Gain to RMS -20.5; add the "Master all to spec" button |
| Master all to spec | Yes, writes new files only, report | None | Translate (button + progress job + before/after) |
| Platform packages / outputs list | Multi-platform export panel | Single "Build package" | Better than both: see 1.6 |
| Delivery page | Removed (ADR 0407) | Separate page | Keep ours as a screen but fold the profile editor into Settings > Delivery as the repo did, or drop the page and put "Build" on Master. Decide with owner (see 1.6) |
| Real job progress, cancel, survives navigation | Yes (ADR 0015/0075) | Instant mock toast | Translate in the mock: a progress job with Cancel and a completion toast wherever you are |
| Report export (PDF) | Yes | None | Translate as a button |
| Finding to file deep link | Proof finding opens Master on file+rule | `openInMaster` from Delivery only | Translate the Proof to Master link when Proof gets delivery findings |
| In-app clear marking of "not measured" vs "waiting on pickups" | `Not judged`, `not_measurable` reasons | `waitingText` for pickups | Keep ours (it is better: it names the blocking pickups) |

### 1.4 Ranked: worth translating

1. **Honest verdict model** (Not judged, "N to check yourself", `checkedBy`). Changes `Limit`/`MasterRow` schema and the Pass pill logic. Biggest trust gain; costs little.
2. **Platform tab row** on Master, wired to the shared profile (no second judge in the UI). Changes Master header, drops Delivery's profile `Select`.
3. **Mastering chain panel + Master all to spec** as a job. Adds a panel and one command; the chain stays read-only like the repo (ADR 0321) unless we decide otherwise.
4. **Suggested fix text per failing rule** that only promises what the chain does.
5. **Book checklist** (credits files, one chapter per file, retail sample length) as in `BookChecklist.tsx`; ours already computes part in `packageItems`.
6. **Real progress and a cancellable job** for Recheck, Master and Build.

### 1.5 What ours does better (feed back)

- A **waiting row names its blocker** ("Waiting on 3 pickups") and links Pickups to Master; the repo only says "not mastered".
- **Keyboard on the table**: roving row, ArrowUp/Down, Enter, and a right-click menu on rows (`registerContext` in `Master.tsx`). Repo's `TableRow onActivate` has the roving model but no context menu on Master.
- **Delivery preflight per chapter** with one click to the failing file; the repo spreads this across the checklist.
- **Single pure selector layer** (`selectors/master.ts`) with the rule engine unit-testable without UI; the repo's judging is in Go and the UI only formats it (fine there, but our pure layer is a good reference for the mock).

### 1.6 Better than both

- **Fix-it loop**: from a failing rule, one click offers "Master this file to spec" (the built-in chain) or "Open in REAPER at the problem", then re-checks that file only and shows before/after on that rule. The repo has the pieces (master, open, re-measure) but no per-file loop.
- **One Delivery verb, one place**: Master shows the profile tabs, the verdicts and a single "Build" that is disabled with the exact blocking reasons ("Ch 4 noise floor", "3 chapters not mastered"), as in mock 05's "Waiting on 1 failing check and 9 unmastered chapters". Delivery's profile editor moves to Settings.
- **Plain-language spread** ("tone match between chapters: good") from the repo mock, extended to a per-chapter drift marker that you can click to hear the two loudest outliers back to back.

### 1.7 Conflicts and departures

- Ours **separates Delivery from Master**; the repo deliberately removed that page (ADR 0407: a new page replaces its old counterpart, no two versions). Recommend: adopt the rule (one page) or document why the mock keeps a Delivery rail item (the benchmark mock 05 rail still shows DELIVERY).
- Ours edits limits **inline on the page** (`CommitInput` on Delivery); the repo edits profiles only in Settings and the page "draws only what the host measures" (ADR 0440). Adopt: move editing to Settings.
- Ours lets a custom profile change `format` strings freely; repo custom profiles "cannot add a rule kind the app does not measure". Adopt.

## 2. Editing (takes, cleanup, effects, mastering chains, talking to REAPER FX)

### 2.1 What the repo does

- **No standalone page.** Pieces: `EditingCheckPanel.tsx` (opened from the Production chapter board and `engine/ChapterLinksTable.tsx`) runs the editing-readiness check (`docs/prds/editing-readiness-analysis.prd.md`: dead air, mouth clicks, loud breaths, with a "processed-audio caveat" because analysis reads raw sources, not FX output) and lists candidates (`EditingCandidateRow.tsx`, class labels in `editingCheckText.ts`). `CleanupAction.tsx` offers silence trim and level match: preview the candidates through the host, then Apply inside a `ConfirmDialog`, each behind a `CapabilityGate` showing "Experimental" until the owner's REAPER verification pass promotes it (ADR 0230).
- **Takes/FX in Proof's chapter view** (`components/proof/TakesPanel.tsx`, `TakeComparisonView.tsx`, `NativeTakesPanel.tsx`, `ApplyFxDialog.tsx`, `WaveformStrip.tsx`, `TransportBar.tsx`, `useChapterPlayback.ts`); PRD `docs/prds/edit-and-proof-workspace.prd.md`.
- **REAPER FX rules (ADR 0234, owner-decided):** FX *chains* go only on tracks (including master); a take/passage gets *one plug-in at a time*, never a chain. `integrations/reaper/narration_workspace.lua`: `list_fx_chains` (`.RfxChain` files under `FXChains`, names only), `apply_fx_chain(track|master, name)` via `TrackFX_AddByName`, `list_fx` (`EnumInstalledFX`, container/video-processor excluded), `add_take_fx(item, take, sourceStart, sourceEnd, name)` which splits the item around the passage, adds one plug-in, all in one undo block; every call re-resolves by GUID (`ITEM_STALE`/`TRACK_STALE`), refuses while recording, and the host refuses a name that is not in the listing. Favourites are a Settings > DAW row (`DAW.fx_favourites`). All four are Experimental (ADR 0230).
- **Other REAPER commands:** `set_active_take` (non-destructive take choice), `launch_cleanup_tool` (opens REAPER's own Repair Pops/Clicks or Magnolius DeClick on the selection; the bridge itself changes nothing, `narration_cleanup.lua`), `apply_item_gain` (level match, one undo block, `narration_level_normalize.lua`), render config (`narration_render.lua`, never triggers a render), navigation/loop (`navigate_item`, `loop_context`, `narration_navigation.lua`). No command sets an FX parameter, bypasses or removes FX.
- Harness: Lua 5.4 bridge harness `integrations/reaper/tests` and a verification pass (`docs/operations/reaper-verification-pass.md`, ADR 0066); a command with no harness test is zero-coverage by repo rule.
- Threat model row 5h: only an allow-listed launcher calls `Main_OnCommand`; no arbitrary action IDs from the app.

### 2.2 What ours does

- `pages/Editing.tsx` + `pages/editing/{TakesTab,CleanupTab,EffectsTab,Coverage}.tsx`, selectors `selectors/editing.ts` (281 lines), commands `state/commands/editing.ts` (366 lines), adapter `state/daw.ts`.
- Takes: passages with more than one take, per-take match to script (`takeMatch`, `diffWords`), suggested take, keep a take (others muted not deleted, `setActiveTake`), remove others, play one take, `removeTakes` text varies by source (REAPER take / recorder take / clip).
- Cleanup: five operations (gaps, breaths, clicks, plosives, noise) with Light/Standard/Heavy levels and per-op thresholds, proposals list (from notes and detections), skip rows, apply selected (`applyFix`, `trimGaps`).
- Effects: six effects with parameters (pitch, de-esser, de-plosive, de-click, noise reduction, EQ), scopes Section / One take / Whole track, draw-a-range on the waveform, bypass, compare ("without, then with"), remove, **coverage strip and a cap** (fxCapPct, warns "over the cap" and asks again).
- All DAW changes via `daw()` with undo labels and `{daw:true}` history, REAPER-off banner with Retry, Needs-REAPER pills when the built-in recorder is the engine.

### 2.3 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Dedicated Editing page | No | Yes | Keep ours (owner's mock). Tell the owner the repo has no counterpart, so layout is ours to decide |
| Takes: choose active, others muted not deleted | `set_active_take`, built, verification pending | Same (non-destructive) | Keep ours; matches |
| Take evidence per word (matched/misread/skipped) and A/B audition | Take review + comparison view, real data | Word diff + match % + suggested take | Keep ours, borrow repo's four statuses (matched, misread, skipped, unread) |
| Cleanup candidates (silence/click/breath) | Readiness check + preview then Apply in confirm dialog, behind CapabilityGate | Proposals + levels + apply selected | Translate **preview-then-confirm with the exact count and "one Undo in REAPER takes it back"**; keep our levels and thresholds, which the repo lacks |
| Cleanup via REAPER's own tools | `launch_cleanup_tool` opens REAPER's dialog on the selection | In-app apply (`applyFix`) | Better than both: offer both, "Apply here" and "Open REAPER's Repair Pops/Clicks on these" (the second is real in the repo) |
| Level match | `apply_item_gain` to a target (default -20 dBFS +-2) | None | Translate as a cleanup op "Level match to profile" (RMS target from the active delivery profile, not a constant) |
| FX: chain on a track | `apply_fx_chain` (chains only on tracks, ADR 0234) | "Whole track" scope applies one named effect | Conflict: see 2.7 |
| FX: plug-in on a passage | `add_take_fx`, one plug-in, splits item, one undo | Section/One take scope with parameters | Keep ours' UI; label honestly (parameters are not settable in REAPER today) |
| FX parameters, bypass, remove, compare | Not built | Built (mock) | Better than both only if we capability-gate each; mark Needs-bridge-command |
| Effect "presets" from the narrator's own REAPER chains/favourites | `list_fx_chains`, `list_fx`, favourites (Settings > DAW) | Fixed list `data.fxPresets` | Translate: presets are the narrator's REAPER chains and favourite plug-ins, not our invented ones |
| FX coverage cap | Not present | Yes, warns over cap | Keep ours; it is a good guardrail (feed back) |
| Waveform + overview + pins | `WaveformStrip.tsx`, `waveformLayout.ts`, real peaks | `ui/Waveform.tsx` shared with Proof | Keep ours |
| Capability gating ("Experimental") | `CapabilityGate`, ADR 0230 | `Needs REAPER` pill per region only | Translate a gate per action with the host's message |
| Mastering chain editing | Fixed chain, read-only | None | n/a here (Master) |
| Processed-audio caveat | Shown: analysis reads raw sources, not FX | Not shown | Translate: say so next to Cleanup counts when effects exist on the chapter |

### 2.4 Ranked: worth translating

1. **Effects offered = what is in the narrator's REAPER** (chains for tracks, plug-ins for passages, favourites first). Changes the preset Select and drops our invented presets; scope rules from ADR 0234 shape the Scope control.
2. **Preview, confirm, one-undo wording** for every DAW write (names target, item count, "REAPER can undo this in one step").
3. **Capability gate per action** (disabled but focusable with the reason, `Experimental` badge).
4. **Level match** operation tied to the delivery profile's RMS window.
5. **Open REAPER's own cleanup dialog** as an alternative to the in-app apply.
6. **Processed-audio caveat** line.

### 2.5 What ours does better (feed back)

- Cleanup **levels** (Light/Standard/Heavy) with explicit thresholds and a live count per operation; repo has one fixed threshold set per setting.
- **Coverage strip and cap** for effects.
- **Non-destructive takes with a source-aware label** (REAPER take vs recorder take vs clip).
- A single **chapter-scoped, three-tab** workflow with the waveform window following the selection; repo scatters it over Production, Proof and Settings.

### 2.6 Better than both

- **A "chain on the whole track" vs "one effect on this passage" split in the UI** that mirrors ADR 0234 exactly: Scope Track picks a *chain* from REAPER (multi-effect, shows its steps), Scope Section/Take picks a *single plug-in*. Prevents promising something REAPER cannot do and removes the cap ambiguity (a chain is a track-wide change, so it counts as 100% coverage by definition).
- **Before/after audition tied to the same range for every operation**, not only effects: Cleanup rows and Takes rows get the same "without, then with" button.

### 2.7 Conflicts and departures

- **ADR 0234**: ours applies single effects with parameters to "Whole track". Repo: chains only on tracks; one plug-in at a time on passages; parameters, bypass, remove, compare have no bridge command. Adopt the scope rule; document the rest as mock-only, gated.
- **Fixed preset list** (`fxPresets`, six effects) is invented content; the repo reads the narrator's installed plug-ins (`EnumInstalledFX`) and chains.
- **Where it lives:** the repo avoids a new page; ours adds one (fine, document).

## 3. Settings

### 3.1 Repo

`components/settings/Settings.tsx` (606 lines): a category list beside the panel (Tabs `sidebar` variant) with scope switch Global / This Project ("falls back to Global where unset"). Categories (`SETTINGS_CATEGORIES`, lines 29-60): General, Appearance, Keyboard & pedals, Manuscript, Recording check, Silence cleanup, Proof, Preview, Stage suggestions, Story Bible, Delivery, DAW Integration, TTS, Booth, Local assets, Project data, Credits, About & updates. Rows are typed (`choice`, `text`, `color`, `bool`, `number`) by `ScopedSetting.tsx` and validated by the host by the same kind; Save sends only changed fields; unsaved-changes confirm on leave; reflow at 390 px captured (ADR 0061); `ProjectData` has a destructive "Clear derived project data?" confirm; Local assets rows with progress and verify (`assets/LocalAssetRow.tsx`); Updates with download dialog; Keyboard panel remaps every command with a conflict finder (`input/findConflicts.ts`, ADR 0361). Defaults live in `config/defaults.json` plus Go `builtinDefaults`, kept equal by a test.

### 3.2 Ours

`pages/Settings.tsx` (107 lines): single scrolling column, panels: Recording (REAPER vs built-in), Definitions and pronunciations source (web / local / online), Reader text, Marks, Story Bible types (add/rename/colour/can-speak/remove), Appearance (system/light/dark), Keyboard shortcuts (read-only list). Changes apply immediately; no scopes, no save.

### 3.3 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Global vs project scope with fallback | Yes | No | Translate the scope switch and "inherited" display |
| Category sidebar | Yes (Tabs sidebar) | One long page | Translate once there are more than ~6 sections (ours has 7 already) |
| Typed settings with schema | Yes | Ad hoc | Keep ours' typed controls; add reset-to-inherited per row |
| Save model | Explicit Save, unsaved confirm | Immediate | Keep ours (the mock is a studio, immediate with undo-free prefs); document |
| Keyboard remap + conflicts | Yes | Display only, and two lists that disagree | Translate (3.5) |
| Recording engine choice | In DAW Integration | Recording panel | Keep ours |
| Story Bible types / marks editors | Not in Settings (Story Bible page owns them) | In Settings | Keep ours; note for the Bible share |
| Local assets (voices, models) | Yes | None | Out of mock scope unless owner wants it; translate as a simple list if so |
| Updates / About | Yes | None | Drop for the mock |
| Delivery profiles | Yes | On Delivery page | Translate: move here |
| Reflow at 390 px | Required (ADR 0061) | Not tested | Translate as a test |

### 3.4 What ours does better

- **Live preview** beside the reader controls (the `sprev` quote) and the three-way definition source with inline status pills (Installed / Online) reads faster than the repo's form rows.
- **Immediate apply** for display prefs with no Save step suits appearance settings.

### 3.5 Concrete bug in ours (found while comparing)

`src/app/help.tsx` has **two shortcut lists that disagree**: `SHORTCUTS` (shown in Settings > Keyboard shortcuts) says proof notes move with `Up/Down` and proof decisions are `P E W D`; `HELP_ROWS` (the "?" sheet) says `J / K`. Both claim to describe the same keys. The repo avoids this with one catalog (`input/commands.catalog.ts`) that feeds the "?" sheet, the Settings panel and the key router. Translate that: one `COMMANDS` registry in `app/registry.ts` that `keys.ts`, the palette, the sheet and Settings read.

## 4. Project picker, import, replace manuscript

### 4.1 Repo

- `components/project/ProjectPicker.tsx` (184 lines): the standalone-launch screen: recents list, Open folder, New project (`NewProjectDialog.tsx`), busy guard on every action, refusal reason shown inline, recents-failed fallback; `DemoBanner`; `StartupScreen` for host-connection failures. A switch emits `system:attached` and the app refreshes.
- Import: `components/production/ManuscriptImport.tsx` + `ImportReview.tsx`; spec `docs/architecture/import-review.md`, ADRs 0086, 0135. Review before anything is written: counts line ("DOCX · 221 paragraphs · 5 narration chapters"), **groups by what each section will become** (Narration chapters, Front matter, Reference material, Story Bible character suggestions, Repairs) as `Disclosure`s with counts; per-row title + muted subtitle, Subtitle checkbox, kind Select; markdown heading level; correcting a wrongly detected subtitle (joins title or returns to the text, by where its line came from); character suggestions with Select all/none; replacing adds "what is cleared" to the count line. Formats: docx, md, txt (PDF rejected, ADR 0095 for txt decoding by BOM / UTF-8 / Windows-1252; a chapterless file becomes one narration chapter).
- Quirks and repair reporting: `docs/architecture/docx-import-quirks.md`.

### 4.2 Ours

- `pages/production/ProjectPicker.tsx` (68 lines): "Choose your project", pinned + recent cards with star pin and Open, New project, taskbar jump-list preview, REAPER-linked banner.
- `pages/production/ImportFlow.tsx` (143 lines): Import is 2 steps (choose, review), **Replace is 3 steps** (choose, review, "What this changes in your project"): drop zone + file input, chapter outline table with first-paragraph preview, subtitle detected checkbox, character suggestions checkbox, counts pills, and for replace a per-chapter changes table (Change, Recorded %, What happens): DAW keeps recordings and flags; built-in recorder archives takes and flags; marks on unchanged text are kept, marks on changed text flagged.

### 4.3 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Pinned/recent, open, new | Recents, open, new | Pinned + recents + star, jump list | Keep ours (pinning, jump list are better) |
| Busy guard + visible refusal reason | Yes (`runAction`) | Mock only | Translate in the mock: Open disabled while busy; refusal shown inline |
| Grouped import review (chapter / front matter / reference / suggestions / repairs) | Yes | Flat outline + 2 checkboxes | Translate **groups and kind Select per row** (front matter and reference are real cases) |
| Review counts line | Yes | Pills | Keep ours, add "front matter / reference" counts |
| Repairs report | Yes ("reports repairs instead of a log", ADR 0086) | None | Translate a Repairs group |
| Replace: what changes per chapter | Counts what is cleared | **Per-chapter change table with consequences for recordings, marks, notes** | **Keep ours: better**; feed back |
| Replace protects recordings (DAW vs built-in) | Not found in the repo's import review | Explicit: never touches DAW recordings; archives, not deletes | Keep ours; feed back |
| Drop zone | Not found (file picker) | Yes | Keep ours |
| Subtitle correction semantics | Joins title or returns to text | Keep or drop | Translate the "returns to text so it is narrated" outcome (ADR 0135) |
| Heading level for Markdown | Yes | No | Translate if md import is shown |
| Encoding handling | BOM / UTF-8 / 1252 | No | Drop |

### 4.4 Better than both

- **Replace as a diff on the outline**, not a table of rows: matched / changed / added / removed chapters side by side with word-count deltas, and a toggle "show only chapters with recordings". Keep the consequence column.
- Import and Replace share one stepper; ours already does (good), keep the "step n of m" label.

## 5. App shell

### 5.1 Repo

- `components/layout/AppShell.tsx` (ADR 0407, ADR 0635): **216 px rail** (class `w-54`) fixed from 1400 px (`min-[1400px]:flex`), below that a **NavDrawer** (modal Base UI Drawer, hamburger below `md`); nav grouped by stage Production / Prep / Record / Review / Finish, Settings pinned at the foot, count badges only where data exists; 62 px brand block, 37 px item pitch, 52 px header, `HeaderChip`s (22 px, tones neutral/success/warning), engine chip opens the engine panel, stage timer chip, series chip; **Back / Forward** (Alt+Left/Right) and **zoom group** (readout is the reset button; Ctrl+= / Ctrl+- / Ctrl+0) in the header (`app-navigation-and-zoom-controls.prd.md`, ADR 0201: real webview zoom, steps 100/110/125/150/175/200%, level read back from the window and persisted).
- `html/body` never scroll; one scroll container, `<main>` (design-system.md "Layout and scrolling", `app-shell-vertical-overflow.prd.md`).
- Router: React Router; old routes redirect (`/delivery`, `/review`, `/proofing`, `/teleprompter`, `/manuscript`) and redirects are removed only by a later ADR.
- Guards: leaving Settings with unsaved changes confirms (`guardedNavigate`).
- Context menu: primitive `ContextMenu` exists (Base UI), used in the Proof `ScriptView` for "add effect / takes"; disabled items stay with an `unavailable` reason (ADR 0705). No app-wide context menu.
- Toasts: `Toast`/`ToastRegion`, up to 4 visible, 5 s info, **errors sticky** with `role="alert"`, action button also dismisses, announced via `Notify` (ADR 0075, ADR 0630).
- Tooltips: Base UI Tooltip, shown after **1000 ms** of hover or immediately on keyboard focus (`:focus-visible` only), stays while hovered, Escape dismisses (WCAG 1.4.13, ADR 0049); a disabled control's reason is its accessible name via `CapabilityGate`/`disabledReason`.
- Shortcut sheet `help/ShortcutSheet.tsx` built from `input/commands.catalog.ts`, scopes global / page / booth / dialog; MIDI and HID pedals are input sources bound by a remappable keymap (ADR 0361).
- Theme: tri-state Light/Dark/System (`theme/`), `data-theme` set by an inline script in `index.html` before first paint (ADR 0010).
- Responsive: Tailwind `md` 768 and container queries; visual matrix 1440x900 desktop, 1024x768 small-desktop, 768x1024 tablet; **no phone viewport** (ADR 0037) except Settings at 390 px reflow (ADR 0061); minimum window 960 px.

### 5.2 Ours

- `app/Shell.tsx` (Rail, TopBar), `app/layout.ts`, `app/keys.ts`, `app/palette.tsx`, `app/registry.ts`, `app/commands.ts`, `app/context.ts`, `app/history.tsx`, `ui/OverlayHost.tsx`, `ui/overlay.ts`, `ui/Tooltip.tsx`.
- Rail: same stage groups plus **Schedule**, theme toggle in rail, Settings; counts for Proof/Pickups/Master. Collapses below 1360 px to an icon rail that **expands over the page on hover/focus** (nothing moves); breakpoints are JS-measured (`useLayout`: medium <=1280, narrow <1180, tiny <860).
- Top bar: project name button (opens picker), **"Jump to or run..." with Ctrl K**, zoom chip when not 100%, engine chip (REAPER linked / Not running / Built-in recorder) with tooltip text.
- **Jump menu** (`palette.tsx`): pages, chapters, text in the manuscript, Story Bible entries and marks; `>` for commands only; groups that open to their own commands when empty; every page registers commands (`registerCommands`), search sources (`registerSearch`), context items (`registerContext`), keys (`registerKeys`).
- **Right-click everywhere**: `contextItemsFor` with submenus (`I/L/SEP/SUB`), Shift+F10 / Menu key, arrow-key navigation, `tailItems()` appended on every page.
- **Undo**: `act(label, fn, {daw})` history, Ctrl+Z, toast with Undo, Undo history dialog that says when REAPER's own last action differs so the undo will not run there.
- Zoom: 80-150% via `document.documentElement.style.zoom`, coordinates divided by zoom in overlays; commands in the jump menu.
- Themes: system/light/dark through `data-theme`, Companion window forced dark.
- Toasts: max 2, 5 s (7 s for undo), no dismiss button, status-region only.
- Tooltips: one `TooltipHost` using `data-tip` and taking over `title`; 320 ms delay; no Escape dismissal, not hoverable.
- Overlays hand-rolled (`OverlayHost.tsx`): focus first element, Tab loop by query, Escape, opener focus return, `aria-modal="true"`, no inerting of the page behind.

### 5.3 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Stage-grouped rail with counts | Yes | Yes + Schedule | Keep ours |
| Rail below 1400 px | Hidden, hamburger NavDrawer (modal) | Collapses to icons; hover/focus expands over page | Keep ours (better for a desktop tool), add `aria-expanded` and a Escape to close; document |
| Jump menu / command palette | None | Ctrl K, search + commands + groups | **Keep ours; it is better. Feed back** (they have no equivalent) |
| Undo history | None (REAPER undo only) | In-app history + REAPER flag | Keep ours; feed back |
| Context menus | One primitive, one consumer | App-wide on every page with submenus | Keep ours; adopt `unavailable` reason under disabled items (repo ADR 0705) |
| Back / Forward | Header buttons, Alt+Left/Right | None | Translate (history stack of page + chapter) |
| Zoom | Real zoom 100-200%, readout resets, Ctrl +/-/0 | CSS zoom 80-150%, palette only | Translate shortcuts and a header readout; document CSS zoom as a mock limitation |
| Toasts | 4 visible, sticky errors, dismiss, alert role | 2, timed, no dismiss | Translate (5.5 item 1) |
| Tooltips | Base UI, WCAG 1.4.13 | Custom, 320 ms | Translate Escape + hoverable + focus-visible-only; delay is a judgement call (6.2) |
| Keyboard catalog + remap | Yes | Two drifting lists | Translate |
| Theme before first paint | Inline script | Effect after mount | Translate (tiny inline script in `index.html`) |
| Min window width | 960 px | Down to <860 "tiny" | Document |
| Single scroll container | Yes | `main` scrolls, `html/body` overflow auto below 860 | Adopt rule at all widths |
| Page redirects keep old URLs | Yes | n/a | Drop |
| Page-leave guard | Settings unsaved | None needed | Drop |

### 5.4 What ours does better

- Jump menu with **search across manuscript text, Story Bible and marks**, grouped commands, `>` mode; Ctrl+F falls back to it off Script.
- **Undo as a first-class feature**, with the history dialog honest about REAPER.
- **Context menu everywhere** with the same tail on every page and a keyboard route.
- **Rail that expands without shifting layout**; shows labels on focus too.
- A zoom-aware overlay positioning layer, because the zoom is real here.

### 5.5 Ranked: worth translating

1. **Toasts**: sticky errors with `role="alert"`, dismiss button, up to 4 queued, identical message restarts instead of stacking (ADR 0075). Small, mechanical, directly a11y.
2. **Tooltip behaviours**: Escape dismisses, hoverable, show on `:focus-visible` only, disabled control shows its reason (we have 45 `title=` and 9 `data-tip` to route).
3. **Overlay a11y**: inert the page behind a modal (`aria-hidden`/`inert`), return focus when the opener is gone (fall back to `main`), nested dialog dims (ADR 0630). Cheapest route: Base UI Dialog/Menu/Popover under the same `openModal`/`popAt`/`openCtx` API.
4. **One command registry** for keys, sheet, Settings and palette; remappable.
5. **Back / Forward and Ctrl+= / - / 0.**
6. **Theme bootstrap script** in `index.html`.

### 5.6 Better than both

- **Palette = one registry that also drives the shortcut sheet, Settings remap and the context menu "Ctrl Z" hints**, so a command is defined once and shows up everywhere with its key (the repo has a catalog; we have a palette; combine).
- **Undo history grouped by chapter and page** with "undo everything I did on this chapter today" (not in either).
- **"Where am I" strip** (page, chapter, REAPER follow state) shared between rail, header and palette so Back/Forward restore chapter and scroll too.

## 6. Design system

### 6.1 Repo rules (current state; `docs/design/design-system.md`, `colour-and-contrast.md`)

- **Tokens**: CSS custom properties on `:root` in `apps/ui/src/styles.css`, dark in one `:root[data-theme='dark']` block; Tailwind references them with `bg-[var(--surface)]` (ADR 0003, completed by ADR 0009: Tailwind-only, **no new class in `styles.css`**, ADR 0017: state classes mutually exclusive, no legacy CSS shadowing utilities). Names: `--bg --surface --surface-2 --surface-3 --border --text --text-muted --non-text --accent --accent-strong --accent-soft --accent-contrast --danger/--warn/--info/--ok` and `-text` companions, kind colours with derived `--<kind>-text`.
- **Colour (ADR 0059)**: exactly two text levels, `--text` and `--text-muted`, both >= 4.5:1 on every surface and both themes; `--text-faint` is retired; one non-text token `--non-text` >= 3:1 for icons/dots; active nav text `--accent-strong`; `paletteContrast.test.ts` holds every declared pair.
- **Primitives** (`components/primitives/`, ~50): one flat file each with `<Name>.stories.tsx` and `.test.tsx`; **closed API**, never spread Base UI props, never export a Base UI type; only primitives import `@base-ui/react` (ADR 0047, `baseUiBoundary.test.ts`); native `button/select/input/textarea/table` only inside primitives (ADR 0053, `rawNatives.test.ts` with a per-file ceiling that only goes down); `Button` owns its look (`buttonOverrides.test.ts` fails padding/type/height overrides) with `pending` (aria-busy, ignores a second press, ADR 0075); `IconButton` needs a `label`, `disabledReason` keeps a disabled control focusable; `Select` stays native on purpose (ADR 0053).
- **Overlays**: `Dialog` is really modal (page behind hidden, Tab loops, focus returns, Escape closes, backdrop never closes, ADR 0048/0051), confirms are `alertdialog`, nested dialog dims, stacking order slide-over 50, dialog 60, selection menu 65, nav drawer 70, tooltip/popover 1000, `#root` isolate; `WorkDialog` blocks and says so when a job cannot be cancelled (ADR 0057).
- **Accessibility**: WCAG 2.2 AA; hints meet 1.4.13 (ADR 0049); axe runs on **every captured state** in the visual suite and on every Storybook story in the atlas; a violation fails the capture unless declared in `tests/visual/axe-debt.ts` with a reason and an issue, the list is capped and a declared rule that stops being reported fails (ADR 0064); **aria snapshots pin the role trees** of dialogs, the slide-over and the navigation (ADR 0065); controls must have accessible names (`controlNaming.ts`), tables name themselves, tabs and toggle groups need a `label` (ADR 0054), a collapsed control (<64 px text box/select) fails the run (ADR 0060).
- **Responsive**: viewport matrix desktop 1440x900, small-desktop 1024x768, tablet 768x1024 (`tests/visual/viewports.ts`); no phone viewport (ADR 0037); Settings also at 390x844 `reflow` (ADR 0061, WCAG 1.4.10); extra widths (`wide` 1680, `companion` 380) opt in per row; shell min window 960 px.
- **Visual suite as a gate**: each `{page,state}` is its own test; fails on page errors, failed requests, sideways overflow, blank screenshots, collapsed controls, identical states without `sameAs`; no retries; three CI shards (ADR 0244).
- **Atlas** (ADR 0243, ADR 0023): Storybook 10 with a11y addon; `pnpm --dir apps/ui atlas` builds and checks every story in light and dark at wide and narrow; `docs/ui/` is generated from it (`scripts/atlas-docs.mjs`, 50 files); `atlasCoverage.test.ts` fails a primitive with no story.
- **Mock fidelity** (ADR 0585, 0636, owner decisions D91/D97): `pnpm --dir apps/ui mock-match` reports a text-blind match % per benchmark mock plus rail/header scored apart; a diagnostic, not a gate; **a UI PR with no before/after screenshots against the mock is rejected** (CLAUDE.md, owner rule 2026-09-29).
- **Icons**: Font Awesome Free (`@fortawesome/react-fontawesome` 3.x with solid/regular 7.x), imported per file (e.g. `AppShell.tsx` imports `faHouse`, `faGaugeHigh`...); decorative glyph colour is `--non-text`.
- **Type**: Barlow Condensed (labels, titles, buttons, tracked), IBM Plex Sans (body), IBM Plex Mono (numbers, `Kbd`), `@fontsource` packages; sizes from `--font-size-*`.
- **Motion**: `motion-safe:` utilities only (ADR 0057), `components.css` declares none.
- **Layering gotcha**: unlayered CSS beats Tailwind utilities (design-system.md "CSS layering gotcha").
- **Import rules** by dependency-cruiser (ADR 0062): primitives are leaves; only `src/api` touches Wails bindings; only primitives import Base UI; Zod only in `src/api`.
- **Wire contracts** (CLAUDE.md, `docs/architecture/wire-contracts.md`): every payload into the UI has a Zod schema, a golden file and a mock that passes the schema; no `as` cast or bare `JSON.parse`.
- **Stack versions**: React 19, Vite 8, Tailwind 4.3, Base UI 1.8, Storybook 10.6, Vitest 5, Playwright 1.63, TypeScript 7/6.

### 6.2 What ours does

Base UI + Tailwind + Font Awesome Free + Zod, same fonts (`@fontsource/*`), React 18 and immer. Form primitives only (`src/ui/primitives/`: Checkbox, RadioGroup, Input, Textarea, Select, Slider, NumberInput, FieldRow) on Base UI/Tailwind; everything else is the mock's global CSS (`styles/app.css`, 502 lines, verbatim class names `.btn .pill .panel .ph .pb .seg .nav .rail`...) plus hand-rolled overlays and tooltip. Enforced by `tests/no-raw-controls.test.ts` (input/select/textarea only; `native-control-ok:` escape) and `tests/no-hardcoded-speakers.test.ts`. Icons through one `ICONS` map (`ui/Icon.tsx`) so screens ask for a meaning ("download", "pin"). Tokens: `--bg --surface --raised --line --line-strong --btn-line --ink --muted --faint --copper --copper-soft --copper-text --ok/--warn/--bad/--info/--violet (+ -soft) --focus`. Dark via `@media (prefers-color-scheme: dark)` with `:root:not([data-theme="light"])` plus `[data-theme="dark"]` (same three-block pattern the repo's own docs name). Reduced motion: global kill switch. Focus: one global `:focus-visible` 2 px outline in `--focus`. Tests: Vitest/RTL per page, Playwright parity scripts in `e2e/`, no Storybook, no axe, no aria snapshots, no dependency-cruiser.

### 6.3 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Base UI behind closed-API primitives, only primitives import it | Yes (ADR 0047) | Form controls only | Adopt for Dialog, Menu/ContextMenu, Popover, Tooltip, Tabs, Toast under our imperative API |
| Tailwind-only, no new global classes | Yes (ADR 0009/0017) | Mock CSS verbatim (by design) | Document the departure now; migrate class by class as primitives are made; ours must not add new global classes after the migration starts |
| Two text levels + `--non-text` + contrast test | Yes (ADR 0059) | Three text levels (`--ink --muted --faint`), no contrast test | Adopt (6.4) |
| Native `Select` on purpose | Yes (ADR 0053) | Base UI Select popup | Document departure; note repo reasons (fireEvent/Playwright, platform behaviour) |
| `Button` owns its look, `pending` prop | Yes | `.btn` class, no component | Adopt a `Button` component with `pending` and `disabledReason` |
| Raw native element ceilings | `rawNatives.test.ts` for button/select/input/textarea/table | Only input/select/textarea | Adopt for `button` (use IconButton/Button) and `table` after the primitives exist |
| Story + test for every primitive; atlas in light/dark; axe | Yes | None | Adopt a light version: a "Primitives" gallery route in our app and an axe run in `e2e/` over every page and state at the three viewports, light and dark |
| Axe on every state, capped debt file | Yes (ADR 0064) | None | Adopt |
| Aria snapshots of dialogs, nav, slide-over | Yes (ADR 0065) | None | Adopt for palette, import, modal shell, rail |
| Viewport matrix + 390 reflow for Settings, no phone | ADR 0037/0061 | Ad hoc 1100, 1250, 1440, 1000, 860 | Adopt the matrix; keep our extra tiers as extra rows |
| Collapsed-control check (<64 px) | ADR 0060 | None | Adopt (a 10-line Playwright assertion) |
| Overflow / blank / page-error gate | Yes | `e2e/overflow.mjs`, `smoke.mjs` | Keep ours, add blank and identical-state checks |
| FontAwesome | Yes, direct imports | Yes, via a meaning map | **Keep ours: better** |
| Tooltips WCAG 1.4.13 | Yes | Partial | Adopt |
| Toast contract | Yes | Partial | Adopt |
| Import rule enforcement | dependency-cruiser | None | Adopt (cheap) |
| Mock fidelity score and PR screenshots | Yes | Parity shots in `e2e/` | Keep ours, but if work goes back to the repo the screenshots-in-PR rule applies |
| Data/Zod contract tests | Golden payloads | Zod domain + `foundations.test.ts` | Keep ours |
| Dev "mock states" panel | `build:demo` mode and `DemoBanner` | Mock states panel | Keep ours; keep controls only there (already our rule) |

### 6.4 Every place our rebuild departs from the repo's design-system rules

Decision per item: **A** = adopt the rule, **D** = document the departure (add to `ARCHITECTURE.md`).

1. **Hand-rolled overlays, not Base UI** (`ui/OverlayHost.tsx`): modal has `aria-modal` but the page behind is not hidden or inert, Tab loop is a hand query, no `finalFocus` fallback when the opener is gone, nested modals do not dim, context menu has no typeahead. Repo ADR 0047 says exactly this failure was why they moved to Base UI. **A**: reimplement `Modal`, `Popover`, `CtxPanel` on Base UI Dialog/Popover/ContextMenu behind the same `openModal/popAt/openCtx`.
2. **Hand-rolled tooltip** (`ui/Tooltip.tsx`): 320 ms, no Escape, not hoverable, rewrites `title`. **A** for Escape, hoverable and `:focus-visible`; **D** the delay (repo is 1000 ms hover; an editing tool with many icon buttons may want shorter, record the choice).
3. **Three text levels, `--faint` in use** (`app.css`: `.grp`, `.crumb` and others): `--faint #766F60` on `--bg #EFEDE7` is **4.26:1, under AA 4.5:1** (4.78 on `--surface`; dark passes). Repo ADR 0059 retires the third level. **A**: darken `--faint` to >= 4.5 on `--bg` or map it to `--muted`; use `--non-text` for glyphs only.
4. **Control boundaries**: `--line-strong #BDB6A6` on `--bg` is **1.72:1**, used as the search box and segmented border (`.search`, `.seg`, `.chip-hdr`). WCAG 1.4.11 needs 3:1 for a control's boundary. Repo: `--non-text` >= 3:1 for what is seen, `--border` decorative. **A**: use `--btn-line` (14:1) or a 3:1 token for input/segmented borders; card borders may stay light.
5. **No automated contrast guard.** Repo: `paletteContrast.test.ts`. **A**: a Vitest that parses the token blocks and checks the declared pairs in both themes.
6. **Global CSS classes vs Tailwind-only** (ADR 0009/0017, and design-system "no new class in `styles.css`"): ours intentionally uses the mock's CSS verbatim (`ARCHITECTURE.md`). **D** now, with a rule: no new global class after this point; new components are Tailwind + tokens; migrate when a primitive is extracted.
7. **Native `button` / `table` everywhere with ad hoc roles**: Master/Editing tables are `<table role="grid">` with custom `tabIndex`/`onKeyDown`, buttons are `.btn` classes. Repo ADR 0053/0056 gives `Table` (`TableRow onActivate`, `aria-selected`, `aria-sort`) and `Button`/`IconButton`. **A** (add `Button`, `Table`, `Tabs` primitives; extend `no-raw-controls` to `button` and `table`).
8. **Hand-rolled tabs** (`Editing.tsx` `onTabKey`): Left/Right only, no Home/End, manual wrap. Repo `Tabs` (Base UI, `activation` manual/automatic, label required, panel not a tab stop, ADR 0054). **A**.
9. **Toasts**: max 2, no dismiss, errors time out, `role="status"` only. ADR 0075 requires sticky errors with `role="alert"`, up to 4, dismiss, action dismisses. **A**.
10. **Select is a button + popup** (repo's Select stays native on purpose, ADR 0053/0610). **D**, note tests use `chooseOption`; revisit only if we ever port to the repo.
11. **Zoom is CSS `zoom` at 80-150%**, overlay coordinates divided by zoom everywhere (`OverlayHost`, `Tooltip`), range 80-150 vs repo 100-200% real window zoom (ADR 0201). **D**: a mock limitation; **A** for Ctrl+= / Ctrl+- / Ctrl+0 and the header readout, and **A** testing at 200% (WCAG 1.4.4/1.4.10).
12. **Breakpoints measured in JS** (`useLayout`: 1360/1280/1180/860) instead of CSS `md` + container queries; rail collapses by hover overlay instead of the repo's NavDrawer below 1400. **D** the rail choice (it is better, 5.4); **A** CSS-first breakpoints where possible so a zoomed window reflows without JS lag, and **A** the viewport matrix of 1440x900, 1024x768, 768x1024, plus 390 for Settings.
13. **No phone layout** is consistent with ADR 0037, but ours has a `tiny <860` tier that the repo does not capture; the repo's minimum window is 960. **D** (state the minimum we support) or drop the tier.
14. **Two page scroll models**: ours sets `html,body{overflow:auto}` below 860 px; the repo's rule is the document never scrolls. **A**.
15. **No automated a11y**: no axe, no aria snapshots, no collapsed-control check, no story per primitive. **A** (see 6.3); cheapest wins are axe over every state, one aria snapshot each for modal shell, palette, rail, and the 64 px collapsed-control assertion.
16. **Focus ring**: one global 2 px blue `--focus` outline. The repo's rule is `:focus-visible` not `:focus` (ADR 0610); the color token for its ring was not located in `styles.css`. Ours already meets the visible-on-keyboard rule. **D** (record the blue ring as ours).
17. **`title=` attributes (45) rewritten at runtime** into tooltips. Repo: tooltips are explicit `TooltipTarget`; a control that names itself needs no hint text duplicate. **A** gradually.
18. **Keyboard**: handlers scattered per page plus two disagreeing lists (3.5); repo has one catalog and a remappable keymap with conflict detection. **A**.
19. **`Kbd`**: ours is a styled `<kbd>`; repo `Kbd` is an image named by its keys (so a screen reader hears "Ctrl + K") with `sm`/`md` sizes. **A** (cheap).
20. **Reduced motion**: ours kills all animation/transition globally with `!important`; repo uses `motion-safe:` per animation (ADR 0057). Both respect the preference; **D**.
21. **Theme bootstrap**: no inline pre-paint script. **A**.
22. **Mock-only controls** live in the Mock states panel (our own rule) while the repo has `build:demo` plus `DemoBanner`. **D**, fine.
23. **No import-rule enforcement and no `Notify` live region discipline** (`#live` exists). **A** dependency-cruiser rules or a simple Vitest scan: primitives are leaves, only `ui/primitives` imports `@base-ui/react`.
24. **Library versions**: ours React 18.3, repo React 19.3; irrelevant to behaviour, **D**.
25. **Screenshots before/after rule**: not applicable to our scratch rebuild; becomes mandatory the moment a rebuilt screen is proposed into the repo (CLAUDE.md "A UI change ships with screenshots of the change").
26. **Chapter-name formatting** (not my share but a repo rule): "Title — Subtitle" with em dash, context prefix `: ` (ADR 0191/0261); ours has `chName/chTag/chLabel` in `format/headings.ts`. Verify our three heading styles can produce this exact form.

### 6.5 Ideas better than both (design system)

- **One primitives gallery state** inside our Mock states panel that renders every control in every state (hover, focus, disabled with reason, pending, error) in light and dark: acts as our Storybook atlas without Storybook, and is what the axe and screenshot gate drives.
- **Contrast + token-use scanner** in one test: flags any text colour token not in the two-level set and any control boundary below 3:1.
- **Behaviour parity test**: the same keyboard script (Tab, Shift+Tab, Escape, Home/End, arrows) run against every overlay and tab strip, so "really modal" is proved once rather than per component.

## 7. Summary of what to do first (cross-area, ranked)

1. Overlay + tooltip + toast contract fixes (6.4 items 1, 2, 9): biggest accessibility gain, touches one file each.
2. Add axe + collapsed-control + three-viewport run to `e2e/` (6.4 item 15). Catches the rest.
3. Fix token contrast (items 3, 4, 5): `--faint` and `--line-strong` are measurable failures today.
4. One command registry; fix the two disagreeing shortcut lists now (3.5).
5. Master & QC: honest verdicts, platform tabs, mastering chain panel, Master all to spec, fold Delivery in (1.4).
6. Editing: effects offered come from the narrator's REAPER, scope rules per ADR 0234, preview-then-confirm wording, capability gates (2.4).
7. Import: grouped review + repairs; keep our Replace changes table and feed it back (4.3).
8. Add Button / Table / Tabs primitives and extend `no-raw-controls` (6.4 items 7, 8).

## 8. Feed-back list for the repo (things ours does better)

- Jump menu (Ctrl K) over pages, chapters, manuscript text, Story Bible and marks.
- In-app undo history with REAPER-aware messaging.
- App-wide right-click and Shift+F10 menus with submenus.
- Icon meaning map (`ui/Icon.tsx`) instead of per-file glyph imports.
- Replace-manuscript consequence table (recordings, marks, notes) and DAW-vs-built-in handling.
- Master rows that name their blocker; per-chapter delivery preflight with one-click jump.
- Cleanup levels with explicit thresholds; FX coverage cap.
- Rail that expands over the page without shifting layout.
- Pure selector layer and per-behaviour tests from the mock's decisions.
