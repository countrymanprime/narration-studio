# Proof, Pickups and Editing split; speaker attribution; take detection

Date: 2026-10-23. Code read at `063dc83`. Questions from the owner's test findings, [#2251](https://github.com/countrymanprime/narration-studio/issues/2251) items 26, 22 and 30.

Method: read the code, the tests, the Studio Next mock (`docs/research/mockups/studio-next/`, the spec per [Which mocks are the spec](../prds/studio-next-rebuild.prd.md#which-mocks-are-the-spec)), the PRDs, the [findings contract](../architecture/findings-contract.md) and the guides. One test was added to reproduce item 30. Nothing was run in REAPER for this note.

Path prefixes: `ui/` is `src/studio/ui/src/components/`, `mock/` is `docs/research/mockups/studio-next/src/`, `tc/` is `src/studio/sidecars/transcript-compare/`.

## A. What each page can do with a finding (item 26)

### Today

| Capability | Proof (`ui/proof/`) | Pickups (`ui/pickups/`) | Editing (`ui/editing/`) |
| - | - | - | - |
| Play the flagged audio | **No.** Only "Takes at this spot" plays, raw through the app's player (`spot/SpotTakes.tsx:28-81`). "Show in DAW" moves the cursor and plays nothing (`inspector/InspectorActions.tsx:84-119`). No component calls `findingsLoop`, though the host has `FindingsLoop`. `useNoteContextMenu.ts:27-28` says Play ±3 s is not built | **Partial.** "Hear the original in context" plays ±3 s of the line through the app's player, never the DAW (`list/usePlayOriginal.ts:28-62`) | **Yes.** "Hear the word" plays the word ±0.3 s, in the DAW when transport sync starts, else in the app (`flags/FlagCard.tsx:101-156`, `bar/useScriptPlayback.ts:124-160`). "Not read" has no Hear |
| Position in the chapter | **Yes.** Inspector time, waveform pins (`inspector/Inspector.tsx:107-109`, `ProofPage.tsx:352-360`) | **Partial.** A time column only (`PickupsTable.tsx:318-320`) | **Yes.** The word in the script and "heard at mm:ss" (`FlagCard.tsx:43-50`) |
| Surrounding text | **Partial.** Script and Heard quotes of the span only (`Inspector.tsx:115-120`) | **Partial.** The line's own text (`PickupsTable.tsx:326-328`) | **Yes.** The card sits in the chapter's script (`FlagCard.tsx:55-59`) |
| Mark fine | **Yes, as "Waive"** → `dismissed` (`inspector/DecisionButtons.tsx:6-11`, key W) | **No.** "Mark recorded" sets the pickup's done state, not the finding (`PickupsTable.tsx:352-356`) | **Not in the findings store.** "It is right, accept" writes `accepted.json` through `editingAccept` (`flags/useAcceptWords.ts:17-38`). No file in `ui/editing/` calls `findingsReview`, so the Proof note stays open |
| Make a pickup | **Indirect.** "Needs pickup" writes `accepted`, and the host lists accepted pickup-category findings (`src/studio/desktop/internal/pickuplist/pickuplist.go:586-603`). "Fix in edit" on a misread still becomes a pickup (`proof/resolution.ts:24-28`) | By hand only (`AddPickup`) | **Yes.** "Mark for pickup" adds a by-hand line with no `findingId` (`menu/marks/markCommands.ts:58-84`) |
| Retake | Link to the Booth, chapter level | Link to the Booth at the line (`PickupsTable.tsx:351`) | No recording; stack or keep existing takes |
| Undo | **Yes.** Toast, Ctrl+Z and History share a journal (`ProofPage.tsx:293-337`) | **Partial.** Undo for removing by-hand lines only (`PickupsPage.tsx:176-190`) | **Yes.** `editingUnaccept`, `pickupsRemove` |

Tests that cover these: `proof/inspector/DecisionButtons.test.tsx`, `proof/ProofPage.test.tsx`, `proof/spot/spotTakes.test.tsx`, `pickups/PickupsTable.test.tsx`, `pickups/list/usePlayOriginal.test.ts`, `editing/flags/flags.test.tsx`, `editing/menu/marks/marks.test.tsx`.

### What the spec says

| Source | Proof | Pickups | Editing |
| - | - | - | - |
| Mock | Play ±3 s on Space through the DAW (`mock/pages/proof/Inspector.tsx:73`, `mock/state/commands/proof.ts:57-63`); Pickup, Edit, Waive and Defer kept apart (`Inspector.tsx:83-85`) | Hear the original (a toast in the mock, `mock/pages/Pickups.tsx:125`), Open in Booth, Mark recorded, Remove; "Go to the note in Proof" in the context menu (`Pickups.tsx:174-180`). No mark fine | Hear, accept, Mark for pickup (`mock/pages/editing/FlagCard.tsx:42-84`). Keeping a take and applying a cleanup row also mark the Proof note `keep` or `fixed` (`mock/state/commands/editing.ts:53-79, 272-282`) |
| [Proof and Pickups PRD](../prds/studio-next-proof-and-pickups.prd.md) | Line 50, "Not building": "a full chapter player on Proof (Editing plays the whole chapter), play ±3 s and go-to-by-id (owner unclear)". This supersedes the mock's Play | "Only points to the Booth" (DQ-6) | Takes are edited on Editing (line 37) |
| [Findings contract](../architecture/findings-contract.md) | States `unreviewed`, `accepted`, `dismissed`, `deferred`. `accepted` means "real and needs fixing"; only `dismissed` clears a finding. It does not say which page may set a status | | |

No PRD, guide, mock or UI file uses "mark fine", "sounded right" or "not an error". The verdict exists only as Proof's "Waive".

### Verdict: partly specified, partly drift

1. **Proof can't play: specified, not drift.** The PRD dropped the mock's Play ±3 s and marked it "owner unclear". The owner's report answers that question: supersede PRD line 50.
2. **Pickups can't show context or mark fine: specified.** The mock's Pickups page has neither. Its "Go to the note in Proof" is not built: drift.
3. **Editing's accept and keep never reach the finding: drift.** The mock writes the Proof note; the code writes only `accepted.json`. The parity note left it open ([parity Q1](studio-next-parity-proof-and-pickups.md)). As a result, a word accepted in Editing stays open on Proof, and its pickup has no `findingId`.
4. **Editing's cleanup list counts `accepted` as done** (`ui/editing/cleanup/cleanupRows.ts:63`). This contradicts the contract, where `accepted` is still open: a bug.
5. **Pickup and edit are not stored apart.** The code stores `accepted` and derives the fix from the category (`proof/resolution.ts`, ruling D85 #7). That is a recorded ruling, not drift.

### Recommendation

Keep three pages: **Proof decides, Pickups queues, Editing fixes.** Do not fold Proof into Editing. Proof is the queue across the whole book with its own journal and keys; Editing works one chapter at a time. Instead, give every page the same three verbs on a finding, all writing through `FindingsReview`, so a decision made anywhere shows everywhere:

- **Hear it**: ±3 s through the DAW when linked, the app's player otherwise (item 32 sets the same rule for Editing).
- **Show where**: the time, the paragraph before and after, and a link to the same spot on the other two pages.
- **Fine as read**: writes `dismissed`. On Proof it is today's Waive with a clearer label.

| # | Change | Page | Size | Order |
| - | - | - | - | - |
| A1 | Supersede PRD line 50; Play ±3 s on Proof (Space and the context menu) through `FindingsLoop`, app player fallback | Proof | S | 1 |
| A2 | Editing's accept and Mark for pickup also write the finding: accept → `dismissed`, Mark for pickup carries the `findingId`; keep take → leave the note to the contract's rule | Editing, host | M | 2 |
| A3 | Fix `cleanupRows.ts:63`: `accepted` is not done | Editing | S | 3 |
| A4 | Pickups row: paragraph before and after, "Fine, not a pickup" (dismisses the source finding and drops the line), "Go to the note in Proof" (the mock's item) | Pickups | M | 4 |
| A5 | Proof Inspector shows the surrounding paragraph, not just the span | Proof | S | 5 |
| A6 | Label "Waive" as "Fine as read" on Proof, and update the guides (`docs/guides/using-the-app/proof.md`, `pickups.md`, `editing.md`) | all | S | 6 |
| A7 | Pickups "Hear" plays through the DAW when linked (with item 32) | Pickups | M | 7 |

A1 and A6 change the PRD's lines; per the [mock rule](../prds/studio-next-rebuild.prd.md#which-mocks-are-the-spec), the PR supersedes them in the PRD.

## B. Speaker attribution (item 22)

### What was specified

| Source | What it says |
| - | - |
| [Extraction PRD](../prds/studio-next-extraction-and-analysis-tools.prd.md) | The Story Bible "fills itself"; under 75 % confidence the narrator verifies, at 75 % and above it is accepted and reviewable (line 11). `speaker` is a suggestion kind (21); a speaker with no quote is never accepted automatically (38, DQ-10). Phases: Ph3 rules, Ph4 Suggested UI ("with no route"), Ph6 consent, Ph7 BookNLP in progress; Ph8 calibration not run |
| [Script and Story Bible PRD](../prds/studio-next-script-and-story-bible.prd.md) | Speaker colours and chips in the reader |
| [BookNLP spike](studio-next-booknlp-spike.md) | Ship behind "not yet available"; large model attributed 61 of 61 quotes. BookNLP gives no score, so confidence must come from the code |
| Mock | **No prompt.** Ambiguity shows passively: every quote gets a suggested speaker or "?" (`mock/selectors/phrases.ts:15-46`), the chapter card says "N without a speaker" (`mock/pages/script/Reader.tsx:238`), suggested chips are dashed (`mock/pages/script/Para.tsx:19`, `mock/pages/booth/Teleprompter.tsx:20`, `mock/pages/editing/ScriptDoc.tsx:99`), the picker confirms (`mock/ui/SpeakerPicker.tsx:34`). Its rule is looser than the code's: any speaking name within 70 characters (`phrases.ts:34-37`) |

### What exists

| Part | State | Where |
| - | - | - |
| Rules attribution in the build | Merged. A speech-verb tag naming a known speaking entry, or two speakers alternating | `src/studio/sidecars/manuscript-guide/core/manuscript_guide.py` `extract_dialogue_cues`, `find_speech_tag` (1646-1663), alternation (1691-1720) |
| Rules speaker suggestions | Merged; tag cues only. Line 213 omits the guide's speaking types | `src/studio/sidecars/manuscript-guide/core/extraction_rules.py:209-232` |
| BookNLP adapter | Merged, not installable: both asset rows are `pending` | `core/extraction_booknlp.py`, `config/analysis-assets.json:78,133` |
| Host reads and corrections | Merged | `GuideDialogueCues`, `GuideCorrectCue` (`src/studio/desktop/bindings_character.go:84,95`) |
| Applying a speaker suggestion | Merged; refuses when no cue exists ("The quoted line is not in the text.") | `src/studio/desktop/internal/extraction/apply/apply.go:381-411` |
| Chips and picker | Wired on Script, Story Bible entry, Booth | `ui/script/page/ScriptPage.tsx`, `ui/storybible/GuideDetail.tsx:912`, `ui/booth/page/useBoothData.ts:90-111` |
| Editing chips | Wired, read-only as in the mock, from the Script reader's layers (the gap audit's ED-1 row predates it) | `ui/editing/script/SpeakerChip.tsx`, `ui/editing/script/paragraphNotes.tsx` |
| Mock host | Seeds cues from fixtures, so dev:mock and the visual suite show chips | `src/studio/ui/src/api/mockHost/state.ts:312` |

### Why the narrator never sees it

1. **Nothing produces cues in the app.** Cues are written only by the Story Bible build, `guide.Build`, called only from `Host.startGuideBuild` (`src/studio/desktop/app.go:2170`). That method has no non-test caller and no binding. The guide says so: "Nothing builds the Story Bible on its own, not even a manuscript import" (`docs/guides/using-the-app/story-bible.md`).
2. The Story Bible's wand runs `ExtractionScan`, which writes suggestions, not cues (`ui/storybible/suggested/panel/useSuggestions.ts:109`). Its speaker suggestions then fail in `apply.go` because no cue exists.
3. With no cues, no chip, "?" or "without a speaker" count is drawn. The mock seeds cues, so the feature looks finished there.
4. Even after a build, little is attributed: tag-only rules, lone-word names land in Needs Review and are not speakers (`manuscript_guide.py:433-434, 1632-1642`), and filing an entry as Character does not recompute cues.
5. No proactive prompt was ever specified.

### Build plan, speaker attribution

| # | Change | Size | Order |
| - | - | - | - |
| B1 | Produce cues without a build: `ExtractionScan` (or the build, behind a binding and a button) writes dialogue cues; run it after import and after a scan | M | 1 |
| B2 | Recompute cues for a chapter when an entry is filed under a speaking type | M | 2 |
| B3 | Rules attribution: use the guide's speaking types at `extraction_rules.py:213`; attribute to Needs Review names as suggested (dashed), not confirmed; add the mock's proximity rule as a lower-confidence suggestion | M | 3 |
| B4 | Speaker chips on Editing (ED-1) | M | 4 |
| B5 | Owner decision on #993: a "N lines need a speaker" review queue or prompt. The mock and PRD specify none | S after the decision | 5 |
| B6 | BookNLP: pin the pending assets, the owner's packaged smoke run, Ph8 calibration of the 75 % threshold | L, owner steps | 6 |

B1 changes what crosses a binding or the sidecar's output: `wire-contract-change` applies.

## C. Take detection (item 30)

### How a repeated phrase is classified

| Path | Where it decides | Result for a phrase said twice |
| - | - | - |
| Markers (Proof findings) | `tc/core/compare.py` `diff_and_build_markers` (1165): any difflib `insert` becomes `EXTRA` (1249-1253) | `EXTRA` → `CategoryTranscriptDiscrepancy`, severity info (`src/studio/desktop/internal/transcript/findings_adapter.go:100, 223-228`) → "heard, not in the script" (`ui/proof/findingFormat.ts:89`) |
| Coverage (Editing) | `tc/core/recording_coverage.py` `align_tokens` (397-437); `_is_reread` (240) only picks `skip` over `different_text` inside a gap with missing words, never for extras | A `COVERAGE_EXTRA` run (`tc/core/coverage_mode.py:735-774`) with no repeat field → "Not in the script" (`ui/editing/flags/flagText.ts:9`) |
| Take divergence | `tc/core/take_divergence.py` `_prefer_earlier_copy` (194-216; since 2026-10-24 `preferEarlierCopy` in `internal/takedivergence/divergence.go`) moves the EXTRA onto the abandoned copy | Still `EXTRA`. Runs only in take-divergence mode |
| Find repeats | `compare.py --find-repeats`, `find_repeated_spans` (1729) | Groups repeats **across segments** (items or takes) → `pickup` or `duplicate_read` findings (`src/studio/desktop/internal/repeats/adapter.go:160-181`). Never inside one recording |
| Live teleprompter | `src/studio/sidecars/manuscript-teleprompter/core/flags.py` `_extra_or_restart` (161, 3+ words) | `restart` → pickup (`src/studio/desktop/liveflags.go:75`). Live only |
| Editing "Read twice" | `ui/editing/model/duplicates.ts` `duplicateRead` (44): the line's first 4 words heard again after a 0.3 s pause | Only for a paragraph that has a `take`; `ui/editing/script/docFromHeard.ts:63-68` sets no `dup`, so on the live page the words stay "Not in the script". A repeat mid-paragraph is never found |

### Tests

| Test | Covers |
| - | - |
| `tc/tests/fixtures/coverage/cases/c1-retakes-false-starts.json`, `markers.golden.json` | Paragraph 4 read twice around "Once more." The golden pins two `EXTRA` markers: it pins the owner's complaint |
| `tc/tests/test_take_divergence.py:128-152` (since 2026-10-24 `internal/takedivergence/divergence_test.go`), `fixtures/divergence/cases.json` | Restarts and stutters, scored as `EXTRA` on the earlier copy |
| `tc/tests/test_repeated_spans.py` | Repeats across four segments, grouped, exact copy flagged |
| `ui/editing/model/duplicates.test.ts` | The 4-word head rule |
| **Added:** `tc/tests/test_coverage.py::test_a_phrase_said_twice_is_today_an_extra_run_with_nothing_marking_it_a_second_take` | Reproduces item 30: P1, then "golf hotel india" twice. Coverage has 3 extra tokens, one extra run, and its words equal the chapter's tokens 6 to 8. Nothing marks the run as a repeat. It passes and pins today's behaviour; C1 flips it |

The test is a passing characterisation test, not an `xfail`: the test ratchet (`scripts/ci/test-ratchet.mjs:21`) fails a PR that adds a skip or xfail marker.

### REAPER takes and lanes

| Command | Harness | Real REAPER (`scripts/ci/real-reaper/`) |
| - | - | - |
| `chapter_track_state` (active take only) | `src/studio/integrations/reaper/tests/track_state_test.lua` | `scenarios_session.py`, `scenarios_transport.py` |
| `set_active_take` | `workspace_test.lua` | `scenarios_takes.py:38`: take 2 active, undo label, render tone, Undo |
| `hide_takes` | `takes_test.lua` | `scenarios_takes.py:60`: volumes, render below 1e-4, reload, Undo |
| `split_take` | `split_take_test.lua` | `scenarios_takes.py:117,144`: offset, render, Undo, refusals |
| `stack_takes`, `unstack_takes` | `stack_test.lua` | `scenarios_takes.py:196,232,256` |
| `create_take` | `take_review_test.lua` | **None**; pending with the owner ([capabilities](../reference/daw/capabilities.md)) |
| `pick_retake_lane` | `retake_lanes_test.lua` | **None**; pending ([retake lanes](reaper-retake-lanes.md)) |

Not tested anywhere:

- REAPER does not detect takes. Detection of "two items or takes read the same line" is the sidecar's `--find-repeats`, tested with mocked ASR only.
- Listing every take of an item live: Go reads the saved `.rpp`.
- Lanes for a pass the narrator recorded by hand (the "Unknown" row in [retake lanes](reaper-retake-lanes.md)).
- Any path from a coverage extra to takes.

So "is REAPER take detection tested and working": the take commands are tested in the harness and, except `create_take` and `pick_retake_lane`, in real REAPER. Detecting a second take inside one recording does not exist, in REAPER or the sidecar.

### Build plan, take detection

| # | Change | Size | Order |
| - | - | - | - |
| C1 | Sidecar: an extra run whose words equal the chapter text next to its anchor (at least 3 words, or the whole line) is a **repeat** with the doc span it repeats. `COVERAGE_EXTRA` gains `repeatOf`; the markers path marks the EXTRA the same way. Flip the added test; regenerate the `c1-retakes-false-starts` goldens. `wire-contract-change` applies | M | 1 |
| C2 | Host: map a repeat to `duplicate_read`, not a transcript discrepancy (`findings_adapter.go`, `coverage/gaps.go`) | S | 2 |
| C3 | Editing: `docFromHeard.ts` sets `dup` from `repeatOf`, so the "Read twice" card (Stack as 2 takes, compare) shows on the live page; drop the 4-head-word limit | M | 3 |
| C4 | Proof label "Said twice" with the Editing link for a `duplicate_read` | S | 4 |
| C5 | Real-REAPER scenarios for `create_take` and `pick_retake_lane`; the listening steps stay the owner's | S, owner steps | 5 |
