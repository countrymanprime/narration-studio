# Repo vs our rebuild: Production, Schedule, Booth, Proof, Pickups, Companion, DAW/REAPER bridge

Scope: my share of the owner's question. Repo = `/home/user/narration-utils` (read only). Ours = `.../scratchpad/studio`.
Paths below are repo-relative unless they start with `studio/`. "ADR nnnn" = `docs/adr/nnnn-*.md`.
The repo is a Wails (Go) desktop host + React UI + Lua REAPER bridge + Python sidecars. Our rebuild is a UI-only mock-faithful React app with a mock `DawAdapter`, so most "repo does it" items are real host behaviour that our UI has to be shaped to receive.

## 0. Headline findings (read this first)

1. **The repo is more honest and less ambitious than we are on numbers.** Its Production page shows only measured things (timer hours, PFH, effective rate, measured recorded length) and projects nothing (ADR 0404: "No finish date is projected from the pace so far"; ADR 0320; ADR 0193; ADR 0015 "real progress only"). It has **no Schedule page at all** (ADR 0407 item 5: Schedule "stays Production's plan panel"; `docs/roadmap.md` line 67: pace pill, burndown chart, This week "each need their own PRD and mocks first"). Our Schedule, pace pill and plan-vs-actual chart are ahead of the repo, but they run on constants we labelled ASSUMED (`studio/src/selectors/progress.ts`: `RATIO`, `PACE`, `WPH`) and a fake `actualSeries`. The repo already logs the data that would replace those constants (stage-timer sessions, burndown series).
2. **Takes: the repo never deletes, never ranks, and chooses by id the host offered.** Source of truth for the owner's "takes handling PRD/ADR": `docs/utilities/take-review.md` (the retired PRD is named there: `take-review-pickups-duplicates-take-intelligence.prd.md`, found with `git log --diff-filter=D`), ADR 0098, 0124, 0147, 0165, 0233, 0700, `docs/prds/edit-and-proof-workspace.prd.md` (EP6, EP7, EP16), and for the built-in recorder ADR 0455, 0485, 0545. Two of our features cross those lines: `removeOtherTakes` (deletes) and `suggestedTake` (ranks).
3. **"Audacity 3 copies takes out as clips" is not in the repo.** I searched `docs/` and the code. The repo's stance is the opposite: Audacity has no take management at all (`docs/architecture/daw-integration.md` "Audacity boundary": "Take management has no direct Audacity equivalent"; ADR 0660 hides take controls for Audacity; `docs/prds/audacity-integration.prd.md` Won't row). Our `TakeSource = 'clip'` and `REMOVE_TEXT.clip` are therefore our own extension, not a repo decision. Nearest repo statement on Audacity clips: `docs/research/audacity-4-scripting-spec.md` (`GetInfo: Type=Clips` returns track/start/end/color/name only).
4. **Punch and roll is not what our Booth does.** Repo `punch_to` only moves the REAPER edit cursor and **refuses while REAPER records** (ADR 0246, `integrations/reaper/narration_punch.lua` header). Our R key is only live while recording and "keeps rolling from that phrase". There is no bridge command for that in the repo. This is the biggest DAW-side gap for the Booth (section 8).
5. **There is no app-driven undo of REAPER in the repo.** Every writing command is one REAPER undo block ("Narration Utils: use take") and the guides say "one Undo in REAPER takes it back". Our History panel promises an app Undo that reaches into REAPER when REAPER's top action is ours (`studio/src/state/store.ts` lines 118-121). That needs a new command (idea in section 8).
6. **The repo's Companion is a different thing from our Companion.** Repo: the Booth session in a 380 px always-on-top window that follows the *voice*; "Note at playhead" is a "Coming soon" badge (`apps/ui/src/components/booth/CompanionShell.tsx` line 245, ADR 0381, ADR 0401). Ours is mock 07: follows the DAW playhead, shows the note, decides it. We are ahead on review, behind on recording.

Evidence base I read: ADRs 0015-0034, 0098-0132, 0140-0147, 0161-0165, 0193-0206, 0232-0262, 0300-0353, 0380-0414, 0455-0560, 0645-0725; docs `architecture/{daw-integration,reaper-bridge,findings-contract}.md`, `utilities/take-review.md`, `guides/using-the-app/{production,booth,proof,pickups}.md`, `workflows/recording-and-comping.md`, PRDs `input-commands-and-pedals`, `edit-and-proof-workspace`, `native-recording-suite`, `audacity-integration`, `booth-actions-enablement`; code `apps/ui/src/components/{booth,proof,pickups,production}`, `apps/desktop/internal/{production,bridge}`, `integrations/reaper/*.lua`; benchmark mocks 01, 03, 04, 07 (viewed) and `docs/research/audiobook-studio-benchmark.md`. Mocks 02, 05, 06 not in my share. Not found: a Schedule mock page (only the nav item in mocks 01-05), the Booth-mode PRD (deleted per ADR 0028), any statement about Audacity clips.

---

## 1. Production

### 1.1 What the repo does

- **Page** `apps/ui/src/components/production/ProductionPage.tsx`; guide `docs/guides/using-the-app/production.md`. Subtitle names chapters/words/delivery date. Figures: Finished audio (measured length of chapters with a confirmed track vs a target "estimated from the word count", the only estimate allowed), Work time logged (split record/edit/proof), Hours per finished hour, Effective rate, Delivery date, Chapters finalized. A figure with no honest input shows a dash and says why.
- **Stage timer**: `apps/desktop/internal/production/production.go`. `Session{id, chapterId, stage, startedAt, endedAt?, source:"manual"}`, one running at a time, only stopped sessions count, never started from REAPER activity, never changes a chapter status. Header chip `components/layout/TimerChip.tsx` ("0:42:07 · timer on Chapter 6"). Log is kept across re-imports (`<project>/narration-utils/production/sessions.json`).
- **PFH and rate** (ADR 0320, `pfh.go`): chapter PFH = logged hours / measured recorded hours; book PFH likewise; effective rate = contracted amount / logged hours; undefined (dash) with no honest input, never 0.
- **Burndown data** exists: `burndown.go` returns a per-day running total of logged hours (data only, no chart yet).
- **Recorded cell** (ADR 0193): union of unmuted items on the chapter's one confirmed track from the saved `.rpp`; dash with reason (No track / 2+ tracks / Track missing / No project); status never touches it.
- **Board** (ADR 0399, 0645): cell per stage; current-stage cell carries the stage verdict (Ready / Not ready / Not checked / In progress / Evidence changed) and opens a slide-over with status select, recording check, editing check and the suggestion with **Confirm / Dismiss / Revert** (ADR 0161: decisions in append-only `stage-decisions.json`, confirm writes the record before the status, refuses when evidence changed). Prep and Delivery columns say "Not available" (no per-chapter producer).
- **Next up** (ADR 0404): max five; groups: in progress and `not_ready` first, other in progress, ready-to-confirm, not started; least advanced stage first. Deadline shown, tone neutral > week / warn <= week while unfinished / danger past / success when all finalized.
- **Plan panel** (ADR 0323, `PlanPanel.tsx`, `plan.go`): deadline `YYYY-MM-DD`, contracted amount, milestones `{name, dueDate, note}` (max 100), save refused whole on any bad row; one template: "ACX 15-minute checkpoint".
- **Status report** export: HTML + JSON into `narration-utils/production/reports`, contracted amount and rate left out unless ticked.
- Also: recording check (Whisper vs manuscript, stale detection, "Two-pass check", background re-check on mains power with REAPER quiet, ADR 0211), credits rows (ADR 0183), Remove from recording (reclassify, never delete, ADR 0207), import review (ADR 0086).
- **Mock 01** (viewed) draws what the repo has *not* built: pace pill "On track · at current pace done Oct 9", Start session, Open pickups KPI with "~6 min booth time", Delivery check KPI, Filter chip, Finished-hours-vs-plan chart, This week card (Booth hours booked 6:00/8:00, Voice rest last 24 h), Next up with "resume at ¶ 38 'Have some wine'" and "~8 min finished left".

### 1.2 What ours does

`studio/src/pages/Production.tsx`, `selectors/progress.ts`, `pages/production/*`: KPI buttons (Finished audio, Recording left, Editing+proof, Open pickups, Delivery check, Due), stacked "Where the book stands" bar by stage, Chapter pipeline table, Next up derived from data, Manuscript card, Recorded-vs-plan chart (plan dashed, actual solid, projection dotted), a This week card, verdict pill (ok/tight/behind from `calc()`), Start session, Export status report (toast), changed-chapter flags dialog, author-query pills, import flow, REAPER-off banner. Estimates come from `WPH = 9300`, `RATIO = {rec 3.0, edit 2.1, proof 0.94}`, `PACE = 1.5 h/day`. This week shows hard-coded `6:00 / 8:00` and `3:05 recorded`. `actualSeries()` is a fixed placeholder array.

### 1.3 Capability table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Stage timer + hours log | Yes, manual, per chapter/stage, persisted | No | **Translate it** (chip in top bar, start from Next up / pipeline row, log in data) |
| PFH, effective rate, hours by stage | Yes, dash when undefined | No (mock 01 draws them; we replaced them with "Recording left" etc.) | **Translate it** |
| Finished-hours target | "estimated from word count" (only allowed estimate) | `words / WPH`, WPH is a constant | **Better than both**: WPH from the narrator's own measured words per recorded hour once a chapter is measured; fall back to 9300 labelled "standard" |
| Finish date projection / pace pill | Deliberately none (ADR 0404) | Yes, assumed constants | **Keep ours, fix inputs**: RATIO per stage = logged hours / finished hours measured; PACE = trailing hours per day from the log; show "Not enough logged time yet" and no pill until >= N logged sessions |
| Deadline tone | neutral/warn/danger/success by days left | ok/tight/behind by slack | **Better than both**: use days-left tone as the floor, projection can only make it worse and only when inputs are real |
| Plan chart (plan vs actual) | Data only (`Burndown`) | Chart with fake actual | **Keep ours, wire actual** to the log; actual axis should be hours logged AND recorded finished hours, not one |
| Chapter pipeline cells open stage | Yes (ADR 0399) | Yes (`cellAct`) | Keep ours; **translate** current-stage verdict words and "Evidence changed" |
| Stage readiness with Confirm/Dismiss/Revert | Yes, evidence-based, append-only | Stage % per chapter, no suggestion | **Translate it** (see 1.4 #4) |
| Next up ranking | By held-back readiness, then stage | By derived risk, with resume/pickup text | **Keep ours**, adopt the repo's group order as the tie-break; mock 01's "resume at ¶ N" needs the resume point from Booth section 3 |
| Recorded cell reasons | No track / 2+ tracks / Track missing / No project | Percent | **Translate** the four reasons (they map to DAW states we must model anyway) |
| This week card | Not built | Invented numbers | **Drop the numbers** until sourced; **better than both**: weekly booth target as a Setting, "hours logged this week" from the timer log, "Voice rest" from recorded seconds in the last 24 h from the take log |
| Status report | HTML+JSON, amount opt-in | Toast only | **Translate it** (schema: `StatusReport`, amount opt-in) |
| Delivery date + contracted amount + milestones | Yes (ADR 0323) | Due date + milestones (no amount) | **Translate** the amount (needed for effective rate) |
| Recording check (speech vs manuscript) | Yes, stale detection, background | In Pickups dialog only | **Translate** stale/"as of last save" (section 5) |

### 1.4 Ranked translate list (Production)

1. **Time log + PFH/rate** (high value, small). Why: it is the only honest source for pace, and mock 01 draws it. Schema: `data.sessions: {id, chapterId, stage:'record'|'edit'|'proof', startedAt, endedAt|null}[]`, `data.contractedAmount: number|null`; selectors `loggedHours(b,stage?)`, `pfh(b,chapterId?)`, `effectiveRate(b)` returning `number | null` (dash). UI: timer chip in Shell, Start/Stop timer on Next up, two KPIs replacing "Recording left"/"Editing+proof" (those become the Schedule's breakdown).
2. **Replace ASSUMED constants with derived values** (`RATIO`, `PACE`, `WPH`). Schema: `calc()` returns `{basis: 'logged'|'default', ...}`; Schedule says which.
3. **Recorded cell reasons** `recordedUnavailable: 'unlinked'|'multiple_tracks'|'track_missing'|'no_project'` on `Chapter` (needs our DAW model, section 8).
4. **Stage suggestion on the current-stage cell**: `Chapter.suggestion?: {verdict, reasons[], basisKey}` and `data.stageDecisions[]` append-only `{chapterId, kind: confirmed|dismissed|reverted, from, target, basisKey, at}`. Confirm refuses when `basisKey` changed.
5. **Status report** with amount opt-in.
6. **Pipeline Prep/Delivery "Not available"** is the repo's honest empty; we have values from fixtures, fine to keep ours.

### 1.5 Ours does better (feed back)

Stacked "where the book stands" bar by finished audio per stage (repo has no equivalent), KPI tiles that are links, 40-chapter scenario tests, pipeline row context menu with REAPER actions only when linked, Production empty state that doubles as setup, changed-chapter flag review.

### 1.6 Better than both

- **One "basis" chip for every projected number** ("from 14 logged sessions" vs "standard 9,300 words/hour"). Honest like the repo, useful like ours.
- **Burn-up, not burn-down**: plot finished recorded hours (measured) and logged hours on one chart against the plan line; a projection appears only after enough data.
- **Next up reads from the DAW**: "resume at ¶ 38" comes from the resume point (Booth), "Ch 4 fails noise floor" from Master. The repo's Next up is stage-only.

---

## 2. Schedule

### 2.1 Repo

No page. ADR 0407 item 5 and `docs/roadmap.md` line 67 say Schedule needs "its own PRD and mocks". What exists is Production's **Delivery plan** (`PlanPanel.tsx`): date, amount, milestones with name/date/note, ACX 15-minute template. `AppShell.tsx` line ~154 comment: the mock's Schedule nav item has no page.

### 2.2 Ours

`studio/src/pages/Schedule.tsx`, `state/commands/schedule.ts`: chart; "How this is worked out" (recording/editing/proofing left, pickups 0.06 h each, pace, pace needed, done date); milestones table with name, Measures select (custom / all recorded / edited / proofed / edited+proofed / first N chapters / everything), date, status cell (Done / Not estimated / On track / At risk / Late by N d), done checkbox, remove, add row, final delivery row. Owner rule honoured: `custom` has no estimate (`meas === 'custom' ? 'Not estimated'`, tests `schedule.test.tsx`).

### 2.3 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Schedule page | None | Full | **Keep ours** (repo's own roadmap says it needs one) |
| Milestone note field | `note` (<= 2,000 chars) | None | **Translate** (cheap, proofers/ACX use it) |
| Milestone measure + estimate | None (no projection) | Yes, only when measure set | **Keep ours** (matches owner rule); **conflict** with ADR 0404 "no projection" is soft: ADR 0404 is about the Production page's deadline tone, and says nothing against a per-milestone estimate |
| Done flag | None | Checkbox | **Keep ours**; add `doneAt` date |
| ACX 15-minute checkpoint | Template milestone, undated | Not present | **Translate**, and **better than both**: give it a measure "first 15 finished minutes recorded, edited and proofed" so it can be estimated (our measure list only has chapter-count N) |
| Validation | Whole-list refusal, real dates, <= 100, amount finite >= 0 | Per-field, blank name ignored | Keep ours for inline editing; **translate** the date rule (calendar `YYYY-MM-DD` only, ADR 0323) and 100-row cap |
| Contracted amount | Stored | Absent | **Translate** (feeds effective rate) |
| Pace inputs | Burndown series from the log | Constants | **Translate** inputs (1.4 #2) |

### 2.4 Ranked

1. Pace and ratios from the log (changes `calc()` and the "How this is worked out" panel to show basis and sample size).
2. `Milestone.note`, `Milestone.doneAt`, measure `firstMinutes:N`.
3. Contracted amount field next to Due.

### 2.5 Ours better / better than both

Ours better: the whole page, measure-tied estimates, "pace needed for the due date". Better than both: show the estimate as a **range** (best/worst from the spread of daily logged hours) instead of one date; milestones may be pinned to a session in the DAW (a region or marker date) later; a "Not estimated" milestone can be promoted by choosing a measure inline.

---

## 3. Booth (recording, teleprompter, punch and roll, levels, pickup mode)

### 3.1 Repo

Files `apps/ui/src/components/booth/*` (BoothPage, BoothSession, BoothView, ReadingControlBar, ReaderText, ReaderRail, ReaderFlagsPanel, ResumePrompt, BuiltinRecorder, useTeleprompterSession, useFollowCursor, useRecordInReaper, useInputLevel); guide `docs/guides/using-the-app/booth.md`; Go `apps/desktop/internal/teleprompter`; Python `sidecars/manuscript-teleprompter/core/{script_tracker,flags,locate,align_word,live_asr}.py`.
- **Voice-following, not a clock**: engines Whisper (default `tiny`, ADR 0414) and Moonshine (Windows, ADR 0107), one event contract (ADR 0021), unconstrained decoding (ADR 0034). Tracker (ADR 0033): fuzzy forward match stepping over <= 2 words, `waiting` after 1.5 s of no progress (holds the highlight, never rewinds), jumps only on >= 3 matched words beating alignment by 2 (restart <= 40 words back, skip <= 30 ahead). Done -> auto-stop 5 s later unless the narrator reads on (ADR 0106).
- **Hand scroll** (ADR 0119): wheel/touch/scrollbar/scroll keys pause *following* ("Following paused", Follow button beside Stop), it resumes by itself when the current word is back in the middle band (150 ms settle). Reading position is the voice's and is never moved by scrolling or by clicking in the rail.
- **Click a word** starts reading from there (ahead) or goes back (behind).
- **Flags** (ADR 0115, 0117, 0118): automatic, suspected only: `skipped`, `restart`, `misread`, `extra`. Precision gates (confirmed words only, never a segment's first two words, spelling-equivalents forgiven, re-read >= 3 words for restart, misread <= 3 heard words). Skipped and restart show by default, misread/extra off ("live listening mishears correct reads too often"). Drawn as underlines (dotted skip, dashed restart, wavy misread, bar for extra), hover says what was heard, Dismiss removes it. Saved when reading stops as unreviewed findings per chapter with stable ids (`StableID(teleprompter, chapter, paragraph, kind, words, ordinal)`), dismissed kept as dismissed, never duplicated. Credits flags are not kept.
- **Resume point** ("Where you stopped", ADR 0111, 0112, 0206, 0349, 0353): transcribes the last 30 s of the chapter track's last audible item and places it with the tracker; reads REAPER's live cursor/items first and falls back to the saved `.rpp`, never a guess; reconciles with the prompter's last word in the host (`agree|disagree|complete|daw_only|prompter_only`, tolerance 10 words); offers Resume from here / Start from the top / Pick a word; nothing starts until Play; prompt disappears when REAPER plays.
- **Record in REAPER** (ADR 0232, 0380): a project-scoped toggle (off by default, Experimental until the owner's verification pass), `Arm <chapter> only` is its own button (never implicit in Play), `record_start` only when REAPER is stopped and exactly one track armed, stop only the recording this app started, remembered arms restored when it ends, refusal reasons `not_armed | other_armed | several_armed`, 3 s deadline.
- **Built-in recorder** (ADR 0357, 0455, 0485, 0545; Experimental, Windows): WAV 24-bit in `<project>/Recordings/`, `Take 004.partial.wav` while recording then renamed, never overwritten/edited/deleted, **Takes** list in the rail newest first, **Unfinished** badge, line identity assigned later on Proof's Native takes panel (`line-identity.json`), one **keeper** per line (`keeper.json`, undoable).
- **Levels** (ADR 0247, 0250, 0618): model-free meter child runs before start, LED ladder, mic list from the OS, REAPER's mic preselected only on a sure device-name match.
- **Punch** (ADR 0246, 0560): `Punch from here` in the Flags tab moves REAPER's edit cursor to `max(0, word time - pre-roll)`, pre-roll fallback setting `Teleprompter.punch_preroll_seconds` (<= 10 s). Word time from anchors, else alignment in the recording (`align_word.py`), else reading pace, and the UI names which. Experimental until verification.
- **Page rules**: address is `/booth?chapter=…|credits=opening|closing` (ADR 0388); only **Exit booth** (or Esc) asks "Stop reading?"; leaving via nav keeps the session running; Booth fills the window, F11 full screen (ADR 0720); follows the global theme (ADR 0365). Single command registry with remappable keymap, `reading.toggle` = Space, `booth.fullscreen` = F11, USB pedals that send keys work, MIDI/HID are Should/Could, `noisy` commands suppressed while recording (`docs/prds/input-commands-and-pedals.prd.md`, ADR 0361).
- **Not built**: pickup session in the Booth ("not available yet", `guides/using-the-app/pickups.md`), mock 03's Room/Mic-match/DAW chips, Last punch card, F/P keys (ADR 0470: "there is no narrator flag store"), tablet remote, reference voice clips.

### 3.2 Ours

`studio/src/pages/Booth.tsx`, `pages/booth/*`, `state/commands/booth.ts`, `selectors/booth.ts`, tests `tests/booth.test.tsx`. Sentence-level units with speaker chips (suggested dashed, confirm from menu, Story Bible type colours), single word caret, read words dim, Space starts/stops a (simulated) take at WPH, arrows step word/phrase, R roll again from current phrase or chosen "Start from here" (while recording the take keeps running; punches logged `{pi, at}`), wheel and Page keys browse without moving the reading position, view snaps back on take start/click, menus hold the take, side panel (voices nearby with Story Bible voice note, coming-up words, session numbers, reference to a clicked name/mark), drawer layout <= 1280, text size 24-72, pickup session (bar on lines, list in panel, N / Shift+N, a take that ran over a line marks it recorded with undo), mic/levels menu, REAPER-off disables Record, Esc exits and stops the take, no mirror text, no Ready chip, no F/P keys.

### 3.3 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Voice-following | Real ASR + tracker with waiting/jump/done | Timer at WPH | Ours is a stand-in. **Translate the behaviours** as the spec for the stand-in: waiting state, no rewind, done then stop |
| Auto-stop at end | 5 s after `done`, cancelled if reading resumes | Immediate stop at last word | **Translate** (5 s grace) |
| Hand scroll vs following | Pauses following, Follow button, auto-resume in band | Browse offset, snaps back on take/click | **Keep ours** (clearer: reading position vs view), **translate** auto-snap when the reading position re-enters the band and a visible "Back to reading" chip |
| Click word | Starts there / goes back | Sets reading position | Equal |
| Sentence/phrase navigation + backspace | No (word stream only) | Yes | **Keep ours** |
| Speaker chips per phrase | No (Story Bible name tints only) | Yes, confirm/set | **Keep ours** |
| Suspected flags | Automatic, 4 kinds, gated, saved as findings | None (by owner decision no manual flag) | **Translate as automatic detection only**: skip + restart on by default, misread/extra off; they feed Pickups `src:'speech'`. Not a narrator action, so no conflict with the owner's "no flag-for-edit" |
| Resume point | Locate from recorded tail, live cursor, reconcile | None | **Translate** (changes Booth start state, Next up text) |
| Record in REAPER | Toggle, arm-only click, preconditions, refusal reasons | Space = simulated take, `reaper-off` disables | **Translate** the preconditions and reasons; keep Space as the one action |
| Built-in recorder | Takes list, partial/finished, Unfinished | Label swap only | **Translate** Takes list in the rail (we show nothing) |
| Punch and roll | Cursor move only, refuses while recording | Roll while recording, from phrase | **Better than both** (section 8): needs a new bridge command |
| Levels | Meter child, LED ladder, device preselect | Static `ROOM_TONE_LABEL`, MICS array | **Translate** the meter and ceiling; **drop** `ROOM_TONE_LABEL` until measured |
| Pedal | Remappable catalog, MIDI/HID later | Space or "foot pedal set to it: start and stop only" | **Keep ours** (owner: pedal only start/stop). Compatible with the repo: bind the pedal to `reading.toggle` only |
| Pickup session in Booth | Not built | Built (bars, list, N keys, auto-recorded) | **Keep ours, feed back** |
| Credits in Booth | Opening/closing as chapters from templates | Not in my read of the fixtures | **Translate** if our Chapter `kind:'credits'` should be recordable |
| Leaving | Confirm "Stop reading?" on Exit/Esc; nav keeps session | Esc stops take immediately; leaving the page stops quietly | **Conflict**, see section 9 |
| F11, themes, whole-window | Yes | Yes | Equal |

### 3.4 Ranked translate list (Booth)

1. **Automatic suspected flags -> Pickups.** Why: it is the owner's "pickups mainly from speech-to-text" in the live path and the repo already specifies the precision gates. Schema: `LiveFlag {id, chapterId, pid, kind:'skip'|'restart'|'misread'|'extra', wordStart, wordEnd, heard, dismissed}`; on stop merge into `Pickup {src:'speech', conf, ty}` by stable key `(chapter, pid, kind, words, ordinal)` so a re-read does not duplicate.
2. **Resume point.** Schema: `Chapter.resume?: {pid, word, source:'live'|'saved'|'prompter', confident}`; UI: notice above text, three choices, nothing starts until Play.
3. **Record preconditions + refusal reasons** as a `DawResult` (section 8).
4. **Takes list in the rail** (built-in and REAPER): `Take {id, source, start, len, unfinished?}` already exists in our schema; surface it in Booth.
5. **Auto-stop grace (5 s) and "Done" state.**
6. **Level meter with ceiling (-3 dB peak) and floor (-60 dB)**; benchmark `docs/research/audiobook-studio-benchmark.md` lines 74-77.
7. **Credits in the Booth.**

### 3.5 Ours better

Phrase-level navigation, speaker attribution in the reading surface, pickup session inside the Booth, menus that hold the take, text popover, drawer behaviour at <= 1280, Story Bible reference panel (repo has the same idea but read-only tabs), the restraint rules (no mirror, no Ready chip).

### 3.6 Better than both

- **Session log as a first-class record**: every start/stop/roll/restart writes `{at, pid, wordIdx, kind}` to `data.sessionLog`. Editing's Takes and Pickups resolve from that log instead of re-transcribing; the repo only has after-the-fact detection (take review) and live flags.
- **Pre-session check chip**: "Mic matches Sep 19 session" (mock 03) can come from the meter's device name + gain + noise floor stored per session; the repo has the device match (ADR 0250) but no history.
- **Reading-position band + browse offset** (ours) plus **auto-return** (repo) plus **waiting state** (repo) in one control: "Reading ¶ 38", "Browsing ¶ 44 · Back".

---

## 4. Proof

### 4.1 Repo

`apps/ui/src/components/proof/*` (ProofPage, ProofChapterPage, FindingsList, FindingDetail, NotesHeader, NotesStrip/WaveformStrip/ChapterWaveformCard, TransportBar, TakesPanel, TakeReviewReads, TakeComparisonView, NativeTakesPanel, RecordingCheckCard); guide `guides/using-the-app/proof.md`; contract `docs/architecture/findings-contract.md`.
- **Notes = findings** from every analyzer on one schema: `{id, analyzer, source{trackGuid,itemGuid,takeGuid}, time_range{start,end,source_start,source_end}, manuscript{chapter, expected, recorded, span}, category, severity, confidence|null + confidence_reason, evidence, evidence_version, suggested_action, review{unreviewed|accepted|dismissed|deferred, note, at}, not_in_latest_run}`. Id is manuscript-anchored (survives a different ASR model). Decisions are an append-only `review.json`; `FindingsReview(id, evidenceVersion, status, note)` is **refused when the evidence changed** and the page shows the latest version and keeps the typed note.
- **Words over status** (ADR 0470): Pickup / Edit / Waived / To review / Deferred are drawn from stored status plus category: extra words and `duplicate_read|take_comparison|pacing|audio_quality|silence_cleanup|level_consistency|delivery_qc` read as Edit, everything else Pickup.
- **Header** "Notes · N" + chips per resolution; **Import proofer sheet** / **Export for proofer** (CSV `start,note,tag`); Sources line (only sources that have notes).
- **Chapter view** `/proof/:chapterId`: real waveform from host min/max peaks cached per source (EP12, ADR 0715 for the book-level card with its own chapter selector; ADR 0651/0652 say a book-level waveform and denser list *lower* mock-04 match), pins per timed note, in-app transport honouring item trims, 0.75x-2x pitch-kept, Space, arrows by word/paragraph, `[ ]` by flag, word highlight + follow, "as of last save" and stale marking.
- **Play +-3 s** from raw source (no FX/edits). **Go to / Loop in REAPER** by item GUID + source time (ADR 0121); stale item -> `FINDING_STALE`, nothing moves, **never a project-time fallback**; availability from a 5 s heartbeat, never by asking (ADR 0122).
- **Approved marker** (ADR 0123): only for an *accepted* finding, after a confirm, a take marker at source time named like Transcript Compare's (`MISREAD: …`), one undo point, dedupe within 0.15 s.
- **Takes** (ADR 0700): Takes panel for the paragraph at the playhead: other takes of the item, other lane retakes, reads from take-review groups; Play per card (raw, no REAPER), One vs A/B with Swap at the same word, Compare (on demand; "Not compared yet"), **Use this take** by an id the host offered (`not_offered` refusal), one undo step (two when a read from another item is added then activated, confirmed first). Evidence per category, "never a score" (ADR 0165, 0140, 0141).
- **Decision text**: single optional note (<= 2,000 chars). No threads.

### 4.2 Ours

`studio/src/pages/Proof.tsx`, `pages/proof/*`, `selectors/proof.ts`, `state/commands/proof.ts`: all-chapters strip + chapter view, notes table with filters (decision, find in notes, In-view chip), waveform overview + zoomed window with pins (pins that touch merge to a count), drag/arrow window, play +-3 s with moving playhead, inspector with script/heard diff, decisions Needs pickup / Fix in edit / Waive / Defer with P E W D keys, arrows cycle, undo toast, reopen, change type of finding, right-click menu, **thread** (proofer/you messages, edit, delete with undo), Takes row points to Editing, cleanup moved to Editing (dead-air trim stays as a single-gap shortcut), import/export toast, Go to REAPER + marker, REAPER-off states, Space toggles play.

### 4.3 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Waveform | Real peaks, pins, no zoom | Window, zoom, drag, pin merge, in-view filter | **Keep ours** (UX), **translate** real peaks (`Peaks {min,max}[]` per chapter) |
| Notes list | Findings table, chips, sort keys chapter/time/confidence/severity | Table, filters, find | Keep ours; **translate** sort by confidence/severity and the Sources line |
| Decision words | Derived from status+category | Stored word chosen by narrator | **Keep ours** (narrator can pick Pickup vs Edit), **translate** the default (category -> suggested word) as a pre-selected suggestion |
| Stale decision guard | `evidence_version`, refuse + keep note | None | **Translate it** (`ProofNote.evidence: string`, decide refused if changed) |
| Decision history | Append-only, audit | Overwrites `res`, undo in app history | **Translate** (`decisions[]` per note `{res, at, note}`) |
| Deferred counts as open | Yes (accepted/deferred/unreviewed are open, only dismissed closed) | Proof % counts any decision as done | **Conflict**, section 9 #6 |
| Threads | No | Yes | **Keep ours, feed back** |
| Play +-3 s | In-app from raw source | Simulated | Equal intent; **translate** "raw source, FX and edits not applied" text |
| Full chapter player + word follow + speed | Yes | No (notes only) | **Translate** if the Proof chapter view is meant to be a listen-through; schema `Alignment {token, t0, t1}[]` per chapter |
| Go to / loop by GUID, stale refusal | Yes | `gotoTime(chapterId, sec)` | **Translate** (section 8) |
| Add marker | Accepted only, confirm, named `KIND: script/heard`, one undo | `addMarker` any note | **Translate** the accepted-only + confirm + naming |
| Proofer CSV import/export | `start,note,tag`, idempotent, round trip | Toast | **Translate** (Pickups section) |
| Takes UI | Panel on Proof | Moved to Editing, Proof links out | **Keep ours** (owner moved cleanup to Editing; repo has takes on Proof), but see conflicts for delete/rank |
| Native takes: line assignment + keeper | Panel | `Take.source:'recorder'` only | **Translate** `Passage.takes[].lineId` and `keeper` (exclusive per line) |
| Recording check card | Recorded, Length, check sentence, stale | Not on Proof | **Translate** compact card |
| Delivery checks as notes | Yes ("Open in Master & QC") | Master separate | Keep ours |

### 4.4 Ranked translate list (Proof)

1. `evidence` key + refuse-when-changed + keep note (small schema change, avoids silent wrong decisions after a re-check).
2. Append-only decisions (`ProofNote.history`).
3. Real peaks + a playable chapter with word alignment (largest build, biggest realism).
4. Accepted-only marker with confirm and naming.
5. Sources line + sort by confidence/severity.
6. Compact Recording check card with stale state.

### 4.5 Ours better / better than both

Ours better: waveform window/zoom, thread, keyboard decisions with undo, cycling decisions with arrows, type correction. Better than both: **"triaged" vs "cleared"** two counters (notes decided; pickups actually re-recorded), so Proof % cannot say 100 while pickups are open; **evidence diff shown inline** when a decision is refused (what changed in the heard text).

---

## 5. Pickups, and the speech check that finds lines to redo

### 5.1 Repo

- **Page** `apps/ui/src/components/pickups/PickupsPage.tsx`, guide `guides/using-the-app/pickups.md`. It is **the proofer's list**, stored in REAPER as project markers `PICKUP: [tag] note` while open and `PICKUP_DONE: …` when resolved (`integrations/reaper/narration_pickups.lua`: `import_pickups`, `export_pickups`, `next_pickup` (wraps), `resolve_pickup`, `count_pickups`; tolerance 0.15 s; idempotent import; one undo block; round-trips through one marker name). Per pickup: time, tag, note; chapter found by matching project time to linked chapter tracks (all matching chapters offered, none guessed) -> "Open Chapter N in Proof" at `?t=`. Punch from here = move cursor (gated `punch`). "Pickup session" panel: "not available yet". Companion shows count + last jumped to.
- **Machine-found redo lines are not on this page**; they are findings on Proof: Transcript Compare discrepancies (MISREAD / SKIPPED / EXTRA with confidence), take-review `pickup`/`duplicate_read` groups (restart, pickup, exact copy), and live Booth flags.
- **Recording check** (Production; ADR 0126, 0132, 0204, 0242): Whisper (faster-whisper, model chosen in Settings; two-pass option) transcribes the items on the chapter track, `SequenceMatcher` aligns to the manuscript; a **gap** is everything between two anchor runs (>= 3 tokens); gap <= 8 body tokens is a misread, larger is missing: `skip` (>= half re-reads chapter text) or `different_text`; thresholds `min_paragraph_present 0.8`, `max_missing_run 3`, `max_misread_run 8`, `min_anchor_run 3` **labelled uncalibrated, chosen on synthetic fixtures**. Result: summary first ("Recorded to paragraph N of M"), then **Pickups = interior gaps only**: paragraphs, word count, first/last missing words, audio position, Go to paragraph. **"An unread start or end is unfinished recording, not a pickup."** Misreads, false starts, retakes, a spoken chapter title never count against you. Result is stored, goes stale when the saved `.rpp` or text changes, only changed items are re-transcribed. Background re-check on mains power only.
- **Moonshine is live-only** (ADR 0107, 0414, `sidecars/manuscript-teleprompter`). The offline check and Transcript Compare use faster-whisper only; no Moonshine in `sidecars/transcript-compare`.
- **Take review** (`docs/utilities/take-review.md`): finds restarts/pickups/exact copies by transcribing every take in scope and aligning to the manuscript; groups reads whose spans overlap; "Add as take…" adds the read as a new take (`AddTakeToMediaItem`), active take and item length untouched, provenance in take `P_EXT:narration_utils_take_{finding_id,source_file,source_range}` (ADR 0098); never ranks.
- **Stage rule** (ADR 0525): proofing is met only when a current pickup source has zero open items, open = unreviewed, deferred or accepted.

### 5.2 Ours

`studio/src/pages/Pickups.tsx`, `pages/pickups/CheckRecordings.tsx`, `selectors/pickups.ts`, `state/commands/pickups.ts`: one list unioned from `pickups[]` (src speech/audio/you) and proof notes decided Needs pickup; columns incl. From (Speech + confidence / Audio / Proof note / You); include-in-session toggles; recorded lines leave the session and can be reopened; remove with undo; add by hand (finds the paragraph by the line's first 24 chars); keys (arrows, Space include, Enter open Booth on that line); "Record in Booth" opens a pickup session; add markers in REAPER; **Check recordings** dialog: chosen chapters (only recorded ones, All/None), speech model picker (`SPEECH_MODELS`: Moonshine tiny/base, Whisper tiny..medium) and worker count, runtime estimate, run adds speech pickups once per chapter, marks chapter checked, Stop adds nothing, undo removes added; session estimate `n*0.7+3` min. `detectPickups()` is a mock: manufactures pickups from paragraphs 2 and 4.

### 5.3 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Source of pickup list | Proofer markers in REAPER only | Union of speech + audio + proof + hand | **Keep ours** (matches owner: mainly STT vs manuscript); repo keeps machine findings on Proof |
| Proofer CSV | `start,note,tag`, idempotent, export open ones | Toast only | **Translate** (add `Pickup.tag`, `src:'proofer'`) |
| Done state | Marker renamed `PICKUP_DONE:` (DAW is truth) | `pickDone[]` in app | **Better than both**: app state plus write-through to the marker; reconcile on open |
| Pickup to chapter | By time vs chapter track span, may be ambiguous | `chapterId` stored | **Better than both**: resolve proofer time -> chapter -> paragraph through the stored word alignment (ADR 0212, 0242 `alignment`), so a proofer CSV row becomes a script line the Booth can open |
| Session assembly | Not built (mock 04 has 4 steps, tone-match clip, Print pickup script) | Session list in Booth, include/leave out, `sessionMinutes` | **Keep ours**; add mock 04's tone-match clip and print script later |
| Auto-mark recorded when take ran over line | No | Yes (undoable) | **Keep ours, feed back** (needs line position in recording: session log) |
| Speech check engine choice | faster-whisper only offline; two-pass | Moonshine/Whisper picker | **Conflict**: Moonshine not available offline, see section 9 #3; keep the picker data-driven by what the host reports |
| Gap taxonomy | skip / short read / different text; interior only | skip / misread (fixture) | **Translate** taxonomy and "start/end not a pickup" |
| Confidence | numeric or `null` with reason, never fabricated | `conf: string` | **Translate** (`conf: number|null`, `confReason`) |
| Check results stored and stale | Yes | `checked[]` ids | **Translate** `check {at, modelId, basisKey}`; stale when the DAW project or text changed |
| Restarts / duplicate reads | take-review groups, Add as take | Editing Takes (passages) | Keep ours; translate provenance on added takes |
| Punch from here | cursor only | n/a on Pickups (Booth session) | see section 8 |

### 5.4 Ranked translate list (Pickups)

1. Proofer CSV import/export + `tag`, idempotent by `(time within 0.15 s, body)`.
2. Check result record with model, basis key, stale detection, and the gap taxonomy (data model for detection that the mock fakes).
3. Alignment-based time -> line resolution (changes `Pickup` to carry `{pid, wordStart, wordEnd, sec}` not just `t` text).
4. Write-through done state to DAW markers.
5. Confidence nullable with reason.

### 5.5 Ours better / better than both

Ours better: one actionable list, session include/exclude, Booth hand-off, hand-add, undoable check. Better than both: a **single "line to redo" object** with `reasons[]` (speech skip, proofer note, restart seen in take) so one line is not listed three times; `src` becomes a set. The repo splits this across three UIs and it can double-count.

---

## 6. Companion window

### 6.1 Repo

`CompanionShell.tsx`, ADR 0381, 0401, `docs/prds/read-aloud-control-bar.prd.md`. One window resized to 380 px and `AlwaysOnTop` (`CompanionModeEnter/Exit`, restores saved bounds, never a second window). Whole-window fixed layer, everything else `inert`. Same teleprompter session as Booth (one `reading.toggle`). Header badge "Playhead m:ss.t | Recording · m:ss.t | Playhead stopped" from REAPER heartbeat (ADR 0305, `daw_transport_changed`), but the **script follows the voice**. Sections: script (own scroll box), Note at playhead (**Coming soon**), Pickups (count + last jumped), hotkeys while this window has focus ("Hotkeys that reach this panel from REAPER are not available yet", spike `docs/research/global-hotkeys-while-reaper-has-focus.md`), This chapter. Full app / double Esc returns with the session still running.

### 6.2 Ours

`studio/src/pages/Companion.tsx`, `state/commands/companion.ts`: header pill "Following playhead", chapter from DAW playhead (`mock.dawChapter`), script quote of the note, Note at playhead with type/resolution, prev/next note within the chapter, Play +-3 s, Go to REAPER, four decisions (undoable), Pickups in this chapter with a Record this line button (toast), This chapter (Recorded, Proof n of m, Mastered), open full app.

### 6.3 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Window mechanics | 380 px, always on top, same window | Mock state | **Translate** (document in our `Shell`: companion = layout state, not a second page) |
| Content | Recording companion (voice-follow script) | Review companion (note at playhead, decide) | **Better than both**: one companion with two modes keyed to transport |
| Follow source | Voice | DAW playhead | Both are right in their mode; label the mode explicitly ("Following voice" / "Following playhead") |
| Note at playhead | Coming soon | Built | **Keep ours, feed back** |
| Hotkeys while REAPER has focus | Not available (spike only) | Not shown | Neither; **do not draw F9-F12 from mock 07** until the spike passes |
| Pickups | Count + last jump | List with Record this line | Keep ours |
| This chapter | Recorded/check | Recorded/Proof/Mastered | Keep ours; recorded must be measured (ADR 0193) |

### 6.4 Ranked

1. Mode switch driven by `daw_transport_changed` (recording -> script follows voice; stopped/playing -> note at playhead).
2. Chapter-at-playhead from the chapter-track map and regions (ADR 0245, 0349), not a mock field; show reason when unknown.
3. Honest hotkey row (only keys that work with focus here).

---

## 7. How the repo models DAW state (REAPER, Audacity, built-in)

- **Port** (ADR 0300, 0302, 0303): `apps/desktop/internal/dawport`, small role interfaces (`ReviewSession, Navigator, MarkerWriter, PickupList, LineStamper, RenderConfigurer, CleanupLauncher, RetakeLanePicker, ProjectStateReader, TakeCreator, Heartbeat, ProjectReader, TrackStateReader, TrackSelector, Recorder, Puncher, RegionWriter, TakeSelector, FXManager, SilenceTrimmer, GainAdjuster, FXRenderer, MasterChainReader, MacroRenderer`). Each has a **level** (Supported / Experimental / Unsupported / NotYetAvailable); per-capability toggles `DAW.capability.<name> auto|on|off` (ADR 0304); promoting a verified command is a one-line change (ADR 0400). Table in `docs/architecture/daw-integration.md`.
- **UI reads one binding and one event**: `Host.DawCapabilities()` + `daw_capabilities_changed` `{daw, reachable, capabilities:{name:{level, available, reason?, message?}}}` (`apps/ui/src/api/schemas/daw.ts`); controls never word their own refusal (`CapabilityGate`, `useCapability`). `useDawKind` hides REAPER take management for Audacity (ADR 0660).
- **Bridge** (`docs/architecture/reaper-bridge.md`, ADR 0031, 0066-0068, 0253): Lua file bridge, no server; commands as `commands/NNNNNNNN.cmd` (version, name, args), events appended to `events.log` with the **run id first**; every error is `ERROR|run|message`; fan-out by tag and run; Lua harness under Lua 5.4 with a fake `reaper` and mutation checks; REAPER-only behaviour checked in scripted real-REAPER runs; "every command that writes is one undo block, writes nothing when there is nothing to change, and is safe to send twice".
- **Identity by GUID, never by time** (ADR 0026, 0098, 0121): item/take GUIDs, line id in item `P_EXT:narration_utils_line_id`, take provenance in take `P_EXT`; stale -> `FINDING_STALE|ITEM_STALE|TAKE_STALE` + nothing changes. Native takes have a sidecar instead (ADR 0485).
- **State comes from two places**: the saved `.rpp` parsed in Go (works with REAPER closed, "as of last save"; ADR 0210 watches mtime) and live Lua only for what only a running REAPER knows (selection, edit cursor, play state: `PROJECT_STATUS` heartbeat with `unsaved`, `changeCount`, `playState`, `playPosition`, ADR 0305; `TRACK_STATE`, `TRACK_ITEM` incl. `muted`).
- **Markers/regions**: take markers named `KIND: …` at source time (Transcript Compare export, approved marker ADR 0123); project markers `PICKUP:`/`PICKUP_DONE:`; regions via one `create_regions` (ADR 0235, 0245: host plans from confirmed track links and the saved project, UI only chooses, 0.01 s duplicate rule, `update` moves a region).
- **Takes**: add take (`create_take`), make active by GUID (`set_active_take`, ADR 0233, only command that calls `SetActiveTake`), pick lane (`pick_retake_lane`, sets `C_LANEPLAYS` only; never converts takes/lanes, ADR 0147), fixed-lane aware reader. App never deletes items or takes.
- **Recording**: `arm_only`, `record_start`, `record_stop` (ADR 0232), arms restored after; heartbeat transport so a start is seen within the heartbeat.
- **Cleanup**: launchers open an allow-listed REAPER action by name (ADR 0146); `preview_cleanup_markers` adds take markers, `apply_cleanup_trims` = split+delete inside one undo block after matching file to live item (ADR 0262).
- **Wire contracts** (`CLAUDE.md`, `docs/architecture/wire-contracts.md`, ADR 0069): every payload crossing into the UI has a Zod schema in `apps/ui/src/api/schemas/`, a golden JSON written by a Go/Python test (`tests/fixtures/contracts/`, `UPDATE_CONTRACTS=1`), a row in `wireContracts.test.ts` and a mock that passes the schema; no `as` casts.
- **Settings layering** project > user > repo defaults (`daw-integration.md`); findings and evidence in `<project>/narration-utils/{findings,analysis,production}`; Go host is the only writer.

### 7.1 Ours

`studio/src/state/daw.ts`: `DawAdapter` with ~17 methods returning a **message string** (`gotoTime(chapterId, seconds)`, `addMarker`, `trimGaps`, `setActiveTake(takeId)`, `removeTakes`, `playAround`, `applyFix`, `addFx` …) and call recording; `mock.setup` = `'reaper' | 'reaper-off' | 'builtin'`; `act(label, fn, {daw:true})` records an undo entry flagged REAPER; History panel pill "REAPER" vs "App". Missing from the adapter: record/arm/stop, punch_to/roll, play position/transport, regions, pickup markers, capabilities, staleness, GUIDs, saved-vs-live state.

### 7.2 Table

| Capability | Repo | Ours | Verdict |
|---|---|---|---|
| Capability model with reasons | Yes | Three mock setups | **Translate** `DawCapabilities {daw:'reaper'|'builtin'|'audacity', reachable, caps:{name:{level, available, reason}}}`; replace string toasts with `DawResult {ok, changed, message, undoSteps, refused?: reason}` |
| GUID identity + stale refusal | Yes | Ids from our own data | **Translate**: `Take.itemGuid/takeGuid/trackGuid`, `Finding.source`, refusals surfaced as one toast and a "stale" row state |
| Saved vs live | Yes | Single state | **Translate** `daw.projectState {savedAt, unsavedChanges, playState, playPosition}` (drives "as of last save", Companion mode, Booth resume) |
| One undo block per command; no-op writes nothing | Yes | `act({daw:true})` | Keep ours; **translate** `undoSteps: 0|1|2` per call and "no undo point" for cursor/arm/play |
| App undo reaches REAPER | **No** ("Undo in REAPER") | Yes when top action is ours | **Better than both (idea, unverified)**: `undo_if_top(label)` using ReaScript `Undo_CanUndo2` to read the next undo label and `Undo_DoUndo2` only if it starts with `Narration Utils:`; otherwise tell the narrator to Edit > Undo. I am quoting ReaScript API names from memory; the repo has no such command (grep for `DoUndo` finds nothing) so it needs a spike |
| Markers as pickup truth | Yes | `addMarkers(n)` count only | **Translate** (`PICKUP:`/`PICKUP_DONE:`; `addMarker(chapterId, sec, label)` takes kind prefix) |
| Regions | `create_regions` host-planned | Not modelled | **Translate** later (chapter regions come from confirmed links) |
| Takes: choose / add / lanes | by offered id, 1-2 undo steps | `setActiveTake(takeId)`, `removeTakes` | Translate choose/add/lane; **drop** removeTakes (section 9 #1) |
| Audacity | Labels in/out, no take mgmt | `clip` take source | **Drop** clip-takes unless owner confirms (section 9 #2) |
| Contracts | Zod + goldens | Zod domain schemas | **Translate**: `schemas.ts` already uses Zod; add one schema per DAW result/event and a mock that passes it |

---

## 8. Takes, restarts and punch-and-roll: the concrete design the repo supports, and where we should go

**What the repo has decided**
- A restart/retake/pickup read is **found after the fact** by transcribing every take and aligning to the manuscript (take review, ADR 0124; categories `pickup` with `evidence.kind` restart|pickup|exact_copy, `duplicate_read` for near duplicates), or flagged live as suspected `restart` (ADR 0115). Nothing is auto-chosen: "Never insert, move, delete, or activate a take automatically" (`docs/workflows/recording-and-comping.md` Safeguards).
- **REAPER takes are non-destructive**: the other takes stay on the item; choose = `SetActiveTake` (ADR 0233) or lane play state (ADR 0147). Add-as-take keeps active take and length (`docs/utilities/take-review.md`).
- **Native takes** are files that are never overwritten/edited/renamed/deleted; identity and keeper in sidecars (ADR 0455, 0485, 0545).
- "No delete, cut, ripple edit, crossfade or comp building from the app" (`edit-and-proof-workspace.prd.md` line 92, EP16 answered A, D39). The benchmark must-have is "Non-destructive takes: a punch never loses the audio it replaced" (`research/audiobook-studio-benchmark.md` line 76).
- Provenance: `P_EXT` on the take (finding id, source file, range).

**Where ours differs**
- `removeOtherTakes` deletes (`REMOVE_TEXT`).
- `suggestedTake` ranks.
- R rolls *inside* one take; the repo's punch cannot do that.

**Better than both (proposal, needs a REAPER spike; I could not verify any of the Lua below exists)**
1. **Roll = one bridge command, one undo block**: `punch_roll(run, trackGuid, time, preroll)`: if the app started the recording, stop it, `punch_to(time - preroll)`, start recording again so REAPER's own take/lane behaviour keeps the previous audio; answers `ROLLED|run|itemGuid|takeGuid|position`. It reuses the arm-memory and "stop only what we started" rules of ADR 0232 and amends ADR 0246's "refuses while REAPER records" for this one command.
2. **The Booth writes the passage map at record time**: on each roll, write `{pid, wordStart, wordIdx, sec, itemGuid, takeGuid}` to the session log and stamp the new take's `P_EXT` (ADR 0098 pattern). Editing's Takes tab then lists passages *from the log* (exact), and falls back to take-review alignment only for takes recorded outside the app. Keeps provenance, avoids a transcription pass, still never auto-chooses.
3. **Keep the choice human**: replace `suggestedTake` by an "evidence per take" strip (words matched, longest pause, level vs neighbours: ADR 0140) with no pre-selected winner, or label it "reads the most of the line" as a filter, not a recommendation.
4. **Replace "Remove other takes"** by "Hide other takes" = mute (non-destructive, one undo) and an explicit, separate "Delete in REAPER yourself" hint.
5. **Audacity**: treat as label import/export only (repo). If the owner's statement is that Audacity 3 copies a punched/restarted read out as a separate clip on the track, then in our model that is a `Take` with `source:'clip'` that has no "active" notion: choose = mute the others' clips, which still needs a verified command via `mod-script-pipe` (ADR 0355, `docs/research/audacity-4-scripting-spec.md`). Not in the repo; do not draw it until a spike exists.

---

## 9. Conflicts between the repo's decisions and what the owner told us this session

| # | Owner decision (our log) | Repo | Status / what to do |
|---|---|---|---|
| 1 | Takes are non-destructive in Editing | `removeOtherTakes` deletes; repo never deletes (EP16 A, `take-review.md`, ADR 0455) | **Real conflict inside our own build.** Reframe as mute/hide; ask owner if delete is wanted at all |
| 2 | Audacity 3 copies takes out as clips (owner statement) | No such statement; Audacity has no take management (ADR 0660, daw-integration.md) | **Not found in repo.** Our `clip` source is an extension; ask owner for the source before drawing Audacity take UI |
| 3 | Pickups mainly from Whisper/Moonshine speech-to-text vs manuscript | Moonshine is live-teleprompter-only (ADR 0107, 0414); the offline check and Transcript Compare use faster-whisper only; proofer-list Pickups page is separate from machine findings; recording check says misreads/retakes are not pickups | **Partly conflicts.** Our picker lists Moonshine for the offline check; needs a new engine in the transcript sidecar or restrict Moonshine to the live path. Also decide whether misreads belong in Pickups (repo: Proof notes, Transcript Compare) or only skips/gaps (repo: recording check) |
| 4 | Foot pedal only start/stop | Remappable keymap for any command, MIDI/HID later (`input-commands-and-pedals.prd.md`) | **Compatible**: bind pedal to `reading.toggle` only; suppress `noisy` commands while recording. Don't ship the generic remap UI unless asked |
| 5 | No flag-for-edit / mark-as-pickup in Booth | No narrator flag store (ADR 0470); automatic live flags with Dismiss exist (ADR 0115-0118); mock 03 draws F and P | **Compatible** if live flags are automatic only. Mock 03 F/P and mock 07 F9 "Flag at playhead" stay out |
| 6 | Wheel browses without moving reading position | ADR 0119: hand scroll pauses *following*, position stays the voice's | **Compatible.** Adopt auto-return when the position re-enters the band |
| 7 | Cleanup moved from Proof to Editing | Repo's Proof chapter view hosts effects/takes (EP13/EP14); cleanup tools launch from the audio engine panel, editing check from Production's Edit cell | **Compatible/ahead.** Note: repo has no Editing page; its Takes/Effects live on Proof (ADR 0700, 0705). Our split is a divergence the owner chose |
| 8 | Schedule milestones estimated only when tied to a measure | Repo has no estimates, no measure; ADR 0404 "No finish date is projected" | **Compatible with the letter.** The repo's honesty rule (ADR 0015, 0193, 0320) argues our default ratios/pace need a visible "standard" basis or derived values (section 1) |
| 9 | Proof % = decided notes | Accepted/deferred/unreviewed are *open*, only dismissed is closed (findings-contract.md "What the review states mean", ADR 0525) | **Conflict.** Ours counts "Needs pickup" as progress. Use two counters (triaged / cleared) |
| 10 | Esc exits Booth and stops the take; leaving the page stops the take quietly | Esc / Exit booth asks "Stop reading?"; leaving via nav keeps the session running (ADR 0388) | **Conflict.** For a recording, a silent stop on page change is risky; ask owner |
| 11 | R punch while recording | `punch_to` refuses while recording (ADR 0246) | **Conflict** until a new roll command exists (section 8) |
| 12 | Companion follows DAW playhead | Companion follows the voice; "Nothing in the panel claims that the text is tracking the DAW" (ADR 0381); Note at playhead not built | **Mode conflict**, resolved by section 6 two-mode design |
| 13 | App Undo can reach REAPER | App never undoes REAPER; narrator uses Edit > Undo | **Needs a spike** (section 7.2) |
| 14 | Booth Record without a precondition | Record in REAPER is a project setting, off by default; arming is its own click; refuses unless exactly one track armed (ADR 0232, 0380); Experimental until verified | **Gap in ours.** Keep Space as one action, but show the refusal reason on the Record control |
| 15 | Fixture numbers shown as data | Repo bans invented figures (ADR 0015); `ROOM_TONE_LABEL`, This week 6:00/8:00, `actualSeries`, `sessionMinutes` formula | **Replace with derived values or remove** (ours already has a "do not invent content" rule) |
| 16 | Take suggestion | "No composite score anywhere" (take-review.md), ADR 0165 "never ranked" | **Conflict** with `suggestedTake`. Owner call |

---

## 10. Things worth feeding back from us into the repo (summary)

Schedule page with measure-tied milestone estimates and "pace needed"; pickup session inside the Booth with auto-recorded lines and undo; phrase-level Booth navigation with speaker chips; waveform window/zoom/in-view filtering and pin merging; note threads with edit/delete/undo; decision keys and cycling; unified "lines to redo" list with include/leave-out; Companion that decides notes; History panel that says which changes are REAPER and which are app-only; Editing split (Takes | Cleanup | Effects) with thresholds, levels and an effects cap; stacked "where the book stands" bar.

## 11. Suggested order of work (our rebuild)

1. DAW adapter v2 (capabilities, `DawResult`, GUID fields, saved-vs-live state, refusal reasons). Everything else leans on it.
2. Time log + PFH/rate; derive RATIO/PACE; remove invented numbers; Schedule basis chip.
3. Proof evidence key + append-only decisions + two counters; accepted-only marker.
4. Pickup model: `reasons[]`, proofer CSV, check result record + stale, gap taxonomy.
5. Booth: resume point, automatic flags -> pickups, record preconditions, takes list, auto-stop grace.
6. Companion modes.
7. Takes: drop delete/rank (or get owner approval), add provenance and keeper-per-line.
8. Spikes to ask the owner/REAPER pass about: `punch_roll`, app-triggered undo, Audacity clips.
