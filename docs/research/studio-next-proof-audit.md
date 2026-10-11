# Studio Next Proof and Pickups audit (SN-Q1)

**Date:** 2026-10-11. **Code audited:** `main` at `96707b3`. **Mock audited:** `docs/research/mockups/studio-next/` (last change `c171071`). **Slice:** SN-Q1 (#1036), SNQ-1 of the [Proof and Pickups PRD](../prds/studio-next-proof-and-pickups.prd.md). SNQ-9 deletes this note once its tables have been acted on.

Method: files read, `grep` over `apps/ui/src`, `apps/ui/tests`, `apps/desktop`, `sidecars`, `docs`. The app and REAPER were not run. A claim read from code carries a path; a claim not read line by line is marked **unverified**. Policy: the Studio Next mock is the only spec (owner ruling D98 in [the agent train](../operations/agent-train.md#which-mocks-are-the-spec)); old things with a mock equivalent are removed in the swap, old things without one are left.

## Findings that change a slice

1. **The mock does not list the decision history.** Both `docs/research/mockups/studio-next/tests/d2-proof.test.tsx` ("the Inspector does not list the decisions so far, but the history is kept") and `c2-proof.test.tsx` assert the Inspector has no history list; `ProofNote.history` is stored and read only to find the evidence the last decision was made on. The PRD (ruling table, acceptance row "History", Proposed Solution item 3) asks for a list. Under D98 the list is not built. SNQ-3 shrinks to keeping the history (the host already does).
2. **The mock's "seen" evidence is UI state, not a wire field.** `ui.proof.seen` in `docs/research/mockups/studio-next/src/state/commands/proof.ts` holds what the narrator looked at. The wire already carries the comparison key: `FindingsReview(id, evidenceVersion, status, note)` in `apps/desktop/bindings_findings.go`. The PRD's "decision `evidenceKey`/`seen`" additive fields are likely unneeded; SNQ-3 needs the UI to keep the finding it showed so it can draw before and now.
3. **No source list exists on Pickups.** A pickup today is `{position, tag, note}` from a proofer CSV or an existing REAPER marker (`apps/ui/src/api/contracts/pickups.ts`, `apps/desktop/internal/pickups/csv.go`). The mock's four sources (speech, audio, proof, by hand), the include/leave-out set, and the pickup session panel have no host model. SNQ-8 is larger than the PRD's 1.0 pw suggests.
4. **The rail Proof badge and the stage engine already disagree** (the PRD's stated way to be wrong). The badge counts `unreviewed` only; `proofing.pickups` counts accepted and deferred as open. See [One definition of open](#one-definition-of-open).
5. **Confidence has no source.** The coverage sidecar never reads Whisper word probabilities. A null with a reason is cheap; a real score changes the words-file schema and invalidates cached results.

## Verdict per ruling

Evidence-table rows of the PRD. "Present", "partial" or "absent" is the app today; the last column names the slice that covers the rest.

| Ruling | Verdict | Repo evidence | Test | Slice |
| - | - | - | - | - |
| Decided and cleared counters; open until fixed, waived, dismissed | **Absent.** Summary has per-status counts, no `decided`, `cleared` or open total | `apps/desktop/internal/findings/query.go:57-67`, `:203-217`; `apps/ui/src/api/schemas/findings.ts:97` | `apps/desktop/internal/findings/query_test.go` | SNQ-2 |
| Stale decision guard, before/now in the Inspector | **Partial** (to-verify row settled). Host refuses a stale `evidenceVersion` and records nothing. The detail swaps in the latest finding and says "Not saved … look again"; the old evidence is discarded, so no before/now. The typed note survives (state is `useState(finding.review.note)`; detail keyed by finding id) | `apps/desktop/bindings_findings.go:83-85`; `apps/ui/src/components/proof/FindingDetail.tsx:106-130`, `:31-32`; `apps/ui/src/components/proof/ProofPage.tsx:260` | `apps/ui/src/components/proof/ProofPage.test.tsx:241`; `apps/desktop/bindings_findings_test.go:159` | SNQ-3 (UI only, see finding 2) |
| Decision history list | **Absent** in the UI (to-verify row settled). The store keeps an append-only history (`appendHistory`, `readHistory`) but no binding returns it; the detail shows only "Waived on <date>" | `apps/desktop/internal/findings/store.go:47`, `:390`, `:419`; `FindingDetail.tsx:243` | none | None: not in the mock (finding 1) |
| Sort by time, confidence, severity; Sources line | **Partial** (to-verify row settled). Book level: sort (chapter, project time, confidence, severity), status/kind/check/chapter filters and a confidence floor, all behind a "Filters" popover; Sources line present. Chapter view: Sources line only, no sort or filters. No find-in-notes text search; no "In view" window filter | `apps/ui/src/components/proof/ReviewFilters.tsx:14-67`; `apps/ui/src/components/proof/NotesHeader.tsx:46-54`; `ProofChapterPage.tsx:330` | `ProofPage.test.tsx` (filter flows), `apps/desktop/internal/findings/query_test.go` | SNQ-4 |
| Recording check card (none, checking, current, stale) | **Partial.** `RecordingCheckCard` has `never`, `stale`, `current`; no `checking` (the running check is in the Production dialog); read-only, no findings list, accept or ignore; counts skipped/misread/short/extra, not "repeats"; shows "saved <time>". Mounted in the chapter view only | `apps/ui/src/components/proof/RecordingCheckCard.tsx:9-58`; `ProofChapterPage.tsx:397` | `RecordingCheckCard.test.tsx` | SNQ-6 |
| Takes at a flagged spot | **Partial.** `TakesPanel` and `NativeTakesPanel` exist, mounted once each in the chapter view; they manage takes (choose, compare, A/B). No takes badge in the notes table, no lanes, nothing on the book-level page | `ProofChapterPage.tsx:398`, `:437-447`; `apps/ui/src/components/proof/FindingsList.tsx:63-68` | `TakesPanel.test.tsx`, `NativeTakesPanel.test.tsx` | SNQ-7 |
| Gap taxonomy; confidence null with reason; unfinished is not a pickup | **Partial.** Two vocabularies, neither the mock's: Compare findings use Misread / Skipped / Extra words; the recording check uses skip / not read / misread / short / extra. No "missing" or "unfinished". Confidence is already `number \| null` with `confidence_reason`, shown as "No score" plus the reason; the sidecar produces none for coverage | `apps/ui/src/components/proof/findingFormat.ts:45`, `:64`; `FindingDetail.tsx:189-192`; `sidecars/transcript-compare/core/recording_coverage.py:251-264` | `findingFormat.test.ts`, `sidecars/transcript-compare/tests/test_coverage_results_golden.py` | SNQ-5 |
| Engine picker lists what the host reports | **Absent** (to-verify row settled). No "Check recordings" dialog and no model, chunk, overlap or workers choice for the recording check; it uses the `TranscriptCompare.model_size` setting. A picker exists only for Transcript Compare, with a hard-coded list; no overlap setting anywhere. `WhisperCatalog()` reports approved models but is not an engines list | `apps/ui/src/api/contracts/coverage.ts:184`; `apps/ui/src/components/proof/CompareRun.tsx:37-51`; `apps/desktop/bindings.go:89-100` | `CompareRun.test.tsx` | SNQ-6 (needs a read binding or a `WhisperCatalog` field) |
| Add marker through `DawResult` with a kind prefix | **Present** for the prefix. `FindingsAddMarker` sends `add_finding_marker` named `KIND: 'expected' as 'recorded'` (kind from the category or `evidence.kind`); accepted findings only; REAPER only. Whether it returns a `DawResult` was not read | `apps/desktop/bindings_marker.go:44-135`; `apps/desktop/internal/bridge/marker.go:43`; button at `apps/ui/src/components/proof/ReaperControls.tsx:97` | `apps/desktop/internal/bridge/marker_test.go:28`, `ProofPage.test.tsx:441` | None beyond DAW PRD |

## Mock elements against the app

Verdict is the app against `docs/research/mockups/studio-next/src/pages/Proof.tsx`, `pages/proof/`, `Pickups.tsx`, `pickups/`. "Swap removes" means D98 deletes the old thing in SNQ-9.

### Proof

| Mock element | App today | Slice |
| - | - | - |
| Header: ring, "N of M cleared · K decided" | Missing. Header chips show to review / need pickup / fix in edit / waived / deferred (`NotesHeader.tsx:82-88`) | SNQ-2. Swap removes `NotesHeader` |
| Chapter bar; all-chapters chapter strip with open count | Differs. In-card chapter selector (ADR 0715) and `NotesStrip`; no strip of chapters with open counts | SNQ-9. Swap removes `ChapterWaveformCard`, `NotesStrip` |
| Windowed waveform with zoom and note pins | Differs. `ChapterWaveformCard` on the book page, `WaveformStrip` in the chapter view (workspace) | SNQ-9 |
| Notes table: time, type, script vs heard, from · confidence, resolution; grouped by chapter with open count | Differs. Columns Chapter / Time / Type / Script vs heard / From / Resolution; no group rows; no takes badge | SNQ-4, SNQ-7. Swap removes `FindingsList` |
| Filter chips All / To review / Open / Pickups / Decided | Differs. Status filter inside the Filters popover (ADR 0650, superseded by DQ-1) | SNQ-4 |
| Sort select; Sources line; find in notes | Sort and Sources: exist (above). Find in notes: missing | SNQ-4 |
| Import proofer sheet / Export for proofer icons | The mock icons only toast. The app imports and exports the real CSV from `NotesHeader.tsx:76-84` through `pickupsImport` / `pickupsExport`. The PRD lists proofer CSV as not built. **Owner ruling needed** (#992): keep the real import/export or drop it with `NotesHeader` | none assigned |
| Inspector: type select, previous/next note | Missing (no way to retype a finding; no step buttons) | SNQ-3 (not in the PRD; mock element) |
| Evidence-changed banner with before and now | Missing (see ruling table) | SNQ-3 |
| Script / heard quotes | Present (`FindingDetail.tsx` evidence rows, `evidenceRows` `:188`) | none |
| Takes at this spot list, raw play, link to Editing | Missing on Proof; `TakesPanel` is the workspace version | SNQ-7 |
| Trim-gap cleanup for pacing notes | Not found in the notes UI (**unverified**: Editing has candidates in `apps/ui/src/components/editing/`) | none assigned |
| Play ±3 s, go to in DAW, add marker, open in Script, open in Booth | Play ±3 s and go-to: transport and `ReaperControls` in the chapter view; add marker: present. Open in Script / Booth links: not found. The PRD lists play ±3 s as not built ("owner unclear"); the mock has it | SNQ-3. Owner to confirm |
| Decision buttons Pickup / Edit / Waive / Defer with keys P E W D, Reopen, decision note | Present as the words over stored statuses (ADR 0470, `apps/ui/src/components/proof/resolution.ts`); key bindings not checked (**unverified**) | none |
| Confidence line with reason | Present (`FindingDetail.tsx:189-192`) | none |
| Notes thread on a finding (proofer and you messages, add, edit, delete) | Missing. The app has one review note per finding (cap 2,000, ADR 0120). The PRD does not mention the thread | **No slice.** Owner ruling needed whether it is built |
| Recording check card with findings, accept and ignore | Partial (ruling table) | SNQ-6 |
| Key hints footer | Not audited (Studio Next shell primitive, SN-F4 merged) | SNQ-9 |

### Pickups

| Mock element | App today | Slice |
| - | - | - |
| Table with include checkbox, time, type, line, from, status | Missing. The page shows a count ("N pickups remaining of T"), the active pickup's time, tag and note, and buttons (`apps/ui/src/components/pickups/PickupsPage.tsx:198-232`); no list | SNQ-8 |
| Sources: speech, audio, proof, by hand | Missing. Pickups are `PICKUP:` markers in the REAPER project or a proofer CSV (finding 3) | SNQ-8 |
| Done state written to the DAW marker; reconcile on open | Partly true. Done is the marker rename `PICKUP:` to `PICKUP_DONE:` (`integrations/reaper/narration_pickups.lua:5`); `Resolve` writes it in one undo step; counts come from the markers each time. No pending-write queue for an absent DAW | SNQ-8 smaller here |
| Open in Booth at this line | Missing. Pickups links to Proof (`chaptersAtPosition`), not the Booth | SNQ-8 |
| Hear the original in context; remove from pickups; add by hand | Missing | SNQ-8 |
| Pickup session panel: lines, about N min, Open N in Booth, add as markers, copy script | Missing. "Next pickup" jumps REAPER's edit cursor | SNQ-8 |
| Check recordings icon and dialog | Missing (ruling table) | SNQ-6, SNQ-8 |
| Punch from here | Mock has none (DQ-6) | Swap removes ([Punch removal](#punch-removal-impact)) |
| Next pickup (moves the REAPER cursor), Mark this pickup done, Import proofer CSV, Export CSV | No mock equivalent on Pickups. Next pickup is a cursor move, which DQ-6 rules out for Pickups; Mark done maps to the mock's "Mark recorded"; CSV import/export: see the owner ruling above | SNQ-9: remove Next and Punch; the rest follows the ruling |

Left as built (no mock equivalent, D98): the series voice bible, the companion mode, the stage timer, PFH and effective rate. `apps/ui/src/components/pickups/PickupsCompanionSummary.tsx` is companion code and stays.

## One definition of open

Today's statuses are `unreviewed`, `accepted`, `dismissed`, `deferred` (`apps/desktop/internal/findings/findings.go:62-65`). ADR 0793 maps "waived" to `dismissed` with reason `waived`; "fixed" has no status and "a take kept" and "a pickup recorded" are facts about other stores (the DAW marker, the take set).

| Definition | Open means | Where |
| - | - | - |
| ADR 0525 (Proposed), `PickupItem.Open()` | Everything but `dismissed`; a finding missing from the latest run stays open unless the run covered it | `apps/desktop/internal/proofing/pickups.go:88-96`, used by `PickupsSignal` `:136-190` |
| Editing candidates | Not `dismissed`; ignores "not in latest run" | `apps/desktop/internal/editing/provider.go:191`, `:215` |
| Preview candidates | Not `dismissed`; drops "not in latest run" | `apps/desktop/bindings_preview.go:243-258` |
| Delivery report | Not `dismissed` | `apps/desktop/internal/deliveryreport/report.go:287` |
| Findings summary | No open count. Buckets per status for the latest run; "not in latest run" counted apart and left out of every bucket | `apps/desktop/internal/findings/query.go:57-67`, `:203-217` |
| Rail Proof badge (ADR 0725) | `unreviewed` only | `apps/ui/src/components/layout/useNavCounts.ts:30-33` |
| Production recording-check report, "not reviewed yet" | `unreviewed` only, pickup category | `apps/ui/src/components/production/RecordingCheckReport.tsx:67-76` |
| Proof page header chips | Per-status counts; "Notes · N" is the latest-run total including dismissed | `ProofPage.tsx:29-38`, `:253`; `resolutionCounts` in `resolution.ts:90-100` |
| Pickups page, rail Pickups badge, companion, Production "Pickup list" | REAPER markers: `PICKUP:` open, `PICKUP_DONE:` done | `integrations/reaper/narration_pickups.lua:220-231`; `PickupsPage.tsx:198`; `apps/ui/src/components/production/PickupListCount.tsx:16` |
| Stage engine, marker source | A non-done marker is an open item with empty status | `apps/desktop/internal/proofing/markers.go:56-67` |
| ADR 0793 (cleared) | Fixed, waived, dismissed, a take kept, or a pickup recorded or removed clear; deferred, "Fix in edit" until fixed, and a pickup not yet redone stay open | mock `selectors/proof.ts` `isCleared` |

Reading the table:

- **Accepted differs.** Under ADR 0525 an accepted finding is open, which matches ADR 0793 only for "Fix in edit" and "Needs pickup". An accepted finding that a take kept or that cleanup fixed is cleared in the mock; the app has no stored fact for either. SNQ-2 must say where "fixed" and "take kept" come from, or derive cleared from status plus the pickup marker only, and say so.
- **Deferred matches.** Open in both.
- **The badge changes meaning.** It counts `unreviewed`; after SNQ-2 it reads the open count (ADR 0793 decision 4 and ADR 0725 extend). A chapter today can show no badge while `proofing.pickups` is `not_met` because accepted pickups are waiting.
- **Two "pickup" notions.** Findings of category `pickup` (Proof) and `PICKUP:` markers (Pickups). The stage engine already merges both; the page counters would have to as well, or `cleared` is computed host-side next to `PickupsSignal`.
- **Two summary implementations.** Go `summarize` and the TS mock `apps/ui/src/api/findingsMock.ts:89`; ADR 0120 requires the mock to mirror the host.
- **Production overview.** It reads stage recommendations only (`apps/ui/src/components/production/productionFormat.ts:57`), not findings counts, so it follows the stage engine, not the badge.

The PRD's hypothesis ("proofing met" and the counters diverge) is therefore already true for the badge. SNQ-2 changes one selector, with the host computing `cleared` and the open count beside `PickupItem.Open()`, and the page, rail, companion and Production reading it. Which one the stage engine uses is left open by ADR 0793 decision 6; SNQ-2 states it.

## Old-file consumers

Commands, run from the repo root:

```text
grep -rn "components/proof/\|components/pickups/" apps/ui/src --include=*.ts --include=*.tsx | grep -v "^apps/ui/src/components/\(proof\|pickups\)/"
```

125 lines: 5 in `apps/ui/src/App.tsx`, 111 path-keyed rows in `apps/ui/src/interactionFeedback.catalog.ts` and `apps/ui/src/interactionFeedback/{proof,pickups,recording}.ts`, and one comment plus name-keyed allowlists in `badgeShapes.test.ts`, `panelCopies.test.ts`, `rawNatives.test.ts`, `highlightBoundary.test.ts`. The grep misses relative imports (`../pickups/…`, `./…`), so importers below also come from a relative-import graph over `apps/ui/src` (a throwaway script, not committed) cross-checked with `grep -rnE "from '\.\./(proof|pickups)/"`.

Mounts: `apps/ui/src/App.tsx:558` (`/proof/:chapterId`), `:589` (`/proof`), `:604` (`/pickups`); nav entries `apps/ui/src/components/layout/AppShell.tsx:44`, `:49`. Redirects to `/proof`: `/review`, `/proofing`, `/tracks/chapter/:chapterId` (`App.tsx:606-610`). No story and no `.storybook` file references any file in scope. No aria snapshot covers a Proof or Pickups page body.

| File (under `apps/ui/src/components/`) | Importers | Tests | Visual and docs | Other registries |
| - | - | - | - | - |
| `proof/ProofPage.tsx` | `App.tsx:31` | `ProofPage.test.tsx`, `.takeReview.test.tsx`, `.takeComparison.test.tsx`; `App.test.tsx` | `apps/ui/tests/visual/catalog/proof.ts` (30 states), `drivers/proof.ts`; 18 `proof` shots in `apps/ui/tests/visual/doc-screenshots.json`; `docs/guides/using-the-app/proof.md`; `docs/architecture/codebase-map.md:161` | `interactionFeedback/proof.ts` ×6 |
| `proof/ProofChapterPage.tsx` (notes block, lines 318-400) | `App.tsx:29` | `ProofChapterPage.test.tsx` last `describe` (lines 401-435); `App.test.tsx` | `catalog/proof-chapter.ts` state `note-selected`; rest of the file's 50 states are workspace | `interactionFeedback/proof.ts` ×11, `catalog` ×3 |
| `proof/NotesHeader.tsx` | `ProofPage.tsx:21`, `ProofChapterPage.tsx:38` | `NotesHeader.test.tsx` | every `proof` state with the header; ADR 0650 | `badgeShapes.test.ts:27`, `rawNatives.test.ts:72`, `interactionFeedback/proof.ts` ×2 |
| `proof/NotesStrip.tsx` | `ProofChapterPage.tsx:39` | none (via `ProofChapterPage.test.tsx`) | `proof-chapter/note-selected` | `badgeShapes.test.ts:28`, `panelCopies.test.ts:29` |
| `proof/FindingDetail.tsx` | `ProofPage.tsx:17`, `ProofChapterPage.tsx:34` | none (via the three `ProofPage` tests) | all `proof` detail, decision, REAPER, take-review, take-comparison, audacity states; `proof.md`; `docs/architecture/daw-integration.md:47` | `panelCopies.test.ts:42`, `interactionFeedback/proof.ts` ×3, `catalog` ×1 |
| `proof/FindingsList.tsx` | `NotesStrip.tsx:4` (`CATEGORY_TONE`), `ProofPage.tsx:18`, `ProofChapterPage.tsx:35` | none | every notes-table state | none |
| `proof/ChapterWaveformCard.tsx` | `ProofPage.tsx:8` | `ChapterWaveformCard.test.tsx` | `proof` states `chapter-selected`, `chapter-filtered`, `no-recording`, `default`; `docs/research/studio-next-token-and-primitive-diff.md:137` | `interactionFeedback/proof.ts` ×4 |
| `pickups/PickupsPage.tsx` | `App.tsx:32` | `PickupsPage.test.tsx` (Punch tests at lines 124-158) | `catalog/pickups.ts` (7 states), `drivers/pickups.ts`; `docs/guides/using-the-app/pickups.md`; no pickups screenshots exist | `rawNatives.test.ts:72`, `interactionFeedback/pickups.ts` ×8, `catalog` ×1 |

Further consumers of the same pages:

- Visual helpers in `apps/ui/tests/visual/drivers/shared.ts` (`openProof` `:152`, `openProofChapter` `:160`, `openDeliveryFindingOnProof` `:671`) are reused by `drivers/master.ts:202` (state `from-proof`) and `drivers/global.ts:26`. They stay while the routes stay.
- `apps/ui/tests/visual/mock-match/mocks.ts:46` maps the retired benchmark mock `04-proof-pickups.webp` to `proof/default`; D98 retires that target.
- `apps/ui/tests/aria/dialogs.spec.ts:104-140` uses four `proof-chapter` states (effects and takes dialogs). They are workspace parts and survive the Proof swap.
- Generated: `docs/ui/inventory.json` and 25 files under `docs/ui/atlas/` list these components; regenerate with `pnpm --dir apps/ui atlas` (not run).
- Docs naming deleted files: 29 images in `docs/images/ui/` for `proof-*` states (28 referenced from `docs/guides/using-the-app/proof.md`); `docs/guides/using-the-app/{README,navigation,booth}.md` link to the pages.

Exports used elsewhere: none from `ProofPage`, `ProofChapterPage`, `PickupsPage`. `NotesHeader` exports `SourcesLine` and `sourcesOf`, drawn by `ProofPage.tsx:199` and `ProofChapterPage.tsx:330`; the mock keeps a Sources line, so move them. `CATEGORY_TONE` (from `FindingsList`) is used only by `NotesStrip`.

Pickups siblings: `usePickupsState.ts` stays (the Booth companion, via `PickupsCompanionSummary.tsx`, imports it). `pickupChapters.ts` is imported only by `PickupsPage.tsx`; its `chaptersAtPosition` maps a pickup time to a chapter and may be reused by the new page. `PickupsCompanionSummary.tsx` stays (`apps/ui/src/components/booth/CompanionShell.tsx:20`).

### What deleting the notes files orphans

Imported only by a deleted notes file, so deleted with it unless the new Proof reuses it: `ReviewFilters.tsx` and `reviewQuery.ts` (ProofPage only), `TakeReviewScanDialog.tsx` (ProofPage only), `TakeReviewReads.tsx` (FindingDetail only). `lastChapterStorage.ts` keeps `saveLastChapter` for `App.tsx:30`; `loadLastChapter` loses its only caller (ProofPage). Whether the take-review scan and reads have a mock equivalent was not read; the Proof mock shows none, so D98 removes them (**owner may differ**: ADR 0124, ADR 0165 and DQ-15 govern take review).

Shared and kept: `findingFormat.ts` (five importers outside `proof/`: `booth/ReaderFlagsPanel.tsx`, `editing/EditingCandidateRow.tsx`, `master/DiagnosticsTables.tsx`, `master/diagnosticsFormat.ts`, `pickups/PickupsPage.tsx`), `resolution.ts`, `flags.ts`, `playlist.ts` (also `engine/useTrackPlayback.ts`), `options.ts` (also `settings/ScopedSetting.tsx`), `format.ts`, `ReaperControls.tsx` and `useReaperStatus.ts` (also `editing/`), `AuditionDialog.tsx`, `useReadNavigation.ts`, `takeReviewFormat.ts`, `deliveryFindingFormat.ts`.

## Workspace parts

Marked **Editing swap (SNE-9) deletes**. None has an importer outside `apps/ui/src/components/proof/`, and none is imported by `ProofPage`, `NotesHeader`, `NotesStrip`, `FindingDetail` or `FindingsList`. [SN-E1](../prds/studio-next-script-based-editing.prd.md) lists the same folder from the Editing side; if the lists differ, the later note corrects the earlier.

| File | Importers | SNE-9 deletes | Proof's notes or takes lanes need it |
| - | - | - | - |
| `ScriptView.tsx` | `ProofChapterPage.tsx:27` | yes | no |
| `TransportBar.tsx` | `ProofChapterPage.tsx:26` | yes | no |
| `WaveformStrip.tsx` | `ProofChapterPage.tsx:17`, `ChapterWaveformCard.tsx:12` | yes | the new Proof draws its own waveform window; only the old card imports it today |
| `TakesPanel.tsx` | `ProofChapterPage.tsx:37` | yes | no, see below |
| `ApplyFxDialog.tsx` | `ProofChapterPage.tsx:1`, `ScriptView.tsx:3` (type) | yes | no |
| `useChapterPlayback.ts` | `ProofChapterPage.tsx:24`, `TransportBar.tsx` | yes | no |
| `useWorkspaceReaper.ts` | `ProofChapterPage.tsx:25`, `TransportBar.tsx`, `FlagsPanel.tsx` (type) | yes | no |
| `tokenAtTime.ts` | `ProofChapterPage.tsx:23` | yes | no |
| `takesPassage.ts` | `TakesPanel.tsx:23` | yes | candidate: the takes-at-a-spot lanes need the passage's takes; `internal/passagetakes` serves them host-side |

Not in the PRD's list but workspace-only (follow the same swap): `NativeTakesPanel.tsx`, `FlagsPanel.tsx`, `InlineDiff.tsx`, `CompareRun.tsx`, `hints.ts`, `PreviewPanel.tsx`, `ProofingStagePanel.tsx`, `RenderAssociationSection.tsx`, `useProofingRender.ts`, `RecordingCheckCard.tsx` (until SNQ-6 replaces it), `compareFlags.ts`, `findingFlags.ts`, `waveformLayout.ts`, `peaksDecode.ts`.

What SNQ-9 must keep for Proof: `TakeComparisonView.tsx` (exports `WORD_STYLE`), `TakeComparisonDialog.tsx` and `takeComparisonFormat.ts` are used by `TakesPanel.tsx` and by `FindingDetail.tsx` and `TakeReviewReads.tsx`; they leave with `TakesPanel` only if the new takes lanes do not compare takes, which the mock's read-only lanes do not (play raw, link to Editing). Deleting `ChapterWaveformCard` first leaves `WaveformStrip` imported by `ProofChapterPage.tsx` only, so SNE-9 can delete it without touching Proof.

## Punch removal impact

DQ-6 removes the Pickups page's Punch; `docs/prds/studio-next-adr-register.prd.md:67` and `docs/prds/studio-next-cutover.prd.md:91` record it. Only the Pickups binding goes. The punch capability and its Booth use stay: `dawport.Puncher`, `punchPreRoll`, the setting `Teleprompter.punch_preroll_seconds`, `integrations/reaper/narration_punch.lua` (`punch_to`, `play_position`), `TeleprompterPunch*` and `mockPunchCapabilityOn`. ADR 0246 is unchanged.

```text
grep -rn "pickupsPunch\|PickupsPunch" apps docs tests --include=*.go --include=*.ts --include=*.tsx --include=*.json --include=*.md -l
```

15 files. The golden `tests/fixtures/contracts/pickups-punch-results.json` has no content hit and is found by name.

| Consumer | Kind | SNQ-9 change |
| - | - | - |
| `apps/desktop/pickupspunch.go` (`PickupsPunch` `:23`) | Host method | delete |
| `apps/desktop/pickupspunch_test.go` (`TestContractPickupsPunchResults` writes the golden) | test | delete |
| `tests/fixtures/contracts/pickups-punch-results.json` | golden | delete |
| `apps/ui/wailsjs/github.com/countrymanprime/narration-utils/shell/host.ts:1148` | generated binding | regenerate, do not hand-edit |
| `apps/ui/src/api/contracts/pickups.ts:52-62`, `:77-78` | contract type and method | remove |
| `apps/ui/src/api/schemas/pickups.ts:2`, `:39-49` | zod schema | remove |
| `apps/ui/src/api/wailsClient.ts:124`, `:470` | client decode | remove |
| `apps/ui/src/api/mockHost/reaperActions.ts:45-46`, `:308` | UI mock | remove |
| `apps/ui/src/api/contractGoldens/reaperActions.ts:6`, `:16` | golden registry | remove row and import |
| `apps/ui/src/api/wireContracts.test.ts:131`, `:261-262`, `:271-273`, `:2710` | wire rows | remove; the `:2710` method-list entry fails the "every method checked" test if left |
| `apps/ui/src/components/pickups/PickupsPage.tsx:82`, `:86-88`, `:148-160`, `:226-231` | caller | goes with the page |
| `apps/ui/src/components/pickups/PickupsPage.test.tsx:127-145` | test | goes with the page |
| `apps/ui/src/interactionFeedback/pickups.ts:24` | feedback row | remove (a stale key likely fails `apps/ui/src/interactionFeedback.test.ts`; **unverified**) |
| `apps/ui/src/interactionFeedback/teleprompter.ts:157` | prose only ("over the same round trip pickupsPunch uses") | reword |
| `apps/ui/tests/visual/catalog/pickups.ts:32-37`, `drivers/pickups.ts:48-56` | visual state `next-punch-enabled` | remove; edit the `next` description. No baseline PNG found by name (**unverified**) |
| `docs/guides/using-the-app/pickups.md:33-34`, `:45` | guide | reword |

**`hostAPIVersion` bumps.** It is 84 (`apps/desktop/app.go:65`, `apps/desktop/app_test.go:42-45`, `apps/ui/src/hostApi.ts:2`). The rule is "additive changes need no bump; removing, renaming, retyping or newly requiring a field bumps" (`.claude/skills/wire-contract-change/SKILL.md:26`, `docs/architecture/wire-contracts.md:33`, ADR 0069); ADR 0353 treats dropping bindings as a bump. A removed binding is the stricter break, so SNQ-9 takes main's value plus one in all three files and regenerates `Host.*`. `hostAPIVersion` is a serial point.

Trust boundary: `docs/architecture/threat-model.md:131` (row 5m) covers the REAPER punch commands, which stay; a re-read is owed, no edit. `SECURITY.md` has no punch entry.

## Wire and sidecar surface

Starting list for SNQ-2 and SNQ-5. Additive JSON fields need no `hostAPIVersion` bump; an added binding argument or a new binding does (ADR 0351 precedent).

| Field | Sits in | Changes | Goldens |
| - | - | - | - |
| `cleared` (and an open count) | `Summary` in `apps/desktop/internal/findings/query.go:57-67`, `summarize` `:177`, `countStatus` `:203`; `FindingsSummary` in `apps/desktop/bindings_findings.go:95-103`; `apps/ui/src/api/contracts/findings.ts`, `schemas/findings.ts:97`, `findingsMock.ts:314`, `wailsClient.ts:588` | derive from statuses plus the pickup marker; no migration | `tests/fixtures/contracts/findings-summary.json` (written by `apps/desktop/bindings_findings_contract_test.go:114`, registered `apps/ui/src/api/contractGoldens/review.ts:34`); `wireContracts.test.ts:2096`, `:2099`, `:2899` |
| `evidenceKey` / `seen` | Likely not needed (finding 2). If wanted: `Decision` in `apps/desktop/internal/findings/store.go:34-39`, `applyDecision` `:162`; a fifth argument on `FindingsReview` is a bump | UI keeps the shown finding | `tests/fixtures/contracts/findings-review.json`, `findings-list*.json` if `Finding` changes |
| `gaps[]` with `kind` (missing, extra, misread) | Sidecar: `sidecars/transcript-compare/core/coverage_mode.py` (`_report` `:497-538`; a new tag is additive, ADR 0127); Go: `apps/desktop/internal/coverage/report.go` (`RegionLine` `:107`), `view.go:61-110` (`ReportView` has no tokens or extras today; those reach the UI through `WorkspaceAlignment`, `bindings_coverage.go:168`); UI: `contracts/coverage.ts`, `schemas/coverage.ts:131` | misread and extra exist only per token; misreads count as read (ADR 0126, `recording_coverage.py:251-264`) | `sidecars/transcript-compare/tests/fixtures/coverage/results.golden.json` pinned by `test_coverage_results_golden.py` (only four tags; a new tag must join `MEASUREMENT_TAGS` `:21`); `tests/fixtures/contracts/coverage-result-{current,stale,never,unmapped,cascade}.json` and `workspace-alignment-*.json` from `apps/desktop/internal/coverage/contract_test.go`; `apps/ui/src/api/contractGoldens/coverage.ts`, `workspace.ts`; `wireContracts.test.ts:187-210`, `:2164-2218` |
| `unfinished` | map from region kinds `head` and `tail` (`recording_coverage.py:45`); today an unread tail is a missing region and fails `text_complete` | new field or reclassification | same as `gaps[]` |
| `confidence` (nullable), `confReason` | No source: words are `(text, start, end)` (`coverage_mode.py:78`, `_parse_words` `:213-241`) and `word.probability` is never read. A null with a reason needs no sidecar change; scores need a `WORDS_SCHEMA_VERSION` bump and invalidate caches (`apps/desktop/internal/coverage/params.go`) | split SNQ-5 into the null-with-reason step and the scoring step | `results.golden.json` |
| Engines list | None. `WhisperCatalog()` (`apps/desktop/bindings.go:89`), cascade settings (`apps/desktop/internal/coverage/settings.go:30-31`) | new read binding (bump) or an additive `WhisperCatalog` field | `whisper` goldens (**unverified** names) |
| Pickup sources, include set, hand-added lines | None; `PickupsMoment` is `{position, tag, note}` | new host model (SNQ-8) | new |

UI mocks needing fields: `apps/ui/src/api/mockApi.ts:125`, `apps/ui/src/api/mockHost/chapterTracks.ts`, `apps/ui/src/api/mockFixtures.ts`, `apps/ui/src/api/workspaceMock.ts`.

## Slice adjustments

- **SNQ-2 larger.** No shared open definition exists; seven readers (above) must converge, the badge changes meaning, and "fixed" and "take kept" have no stored fact. Add a contract test that the badge, the page and the stage engine give the same number for one chapter.
- **SNQ-3 smaller.** No history list (finding 1); no new wire field (finding 2). Adds the type select, step buttons and evidence-changed banner.
- **SNQ-4 mixed.** Sort and the Sources line are true at book level already; the chapter view, find in notes, the "In view" filter and the takes badge are missing. The Filters popover is replaced by chips.
- **SNQ-5 larger.** Taxonomy needs a new gap output (nothing exposes misread or extra in the report view) and confidence needs the words-file change; split it.
- **SNQ-6 larger.** The card has three of four states and no findings or accept/ignore; the findings review store (`findingReviews` in the mock) has no host counterpart; the Check recordings dialog and engines list are new.
- **SNQ-7 larger.** Lanes and the badge are new on Proof; the existing panel is a different (managing) feature and is removed with the workspace.
- **SNQ-8 larger.** See finding 3. Done write-through is already true through the REAPER markers.
- **SNQ-9 larger.** Adds the `hostAPIVersion` bump, 111 feedback rows, the orphans above, the 18 doc screenshots and `proof.md` sections for deleted states, and the `mock-match` mapping.

## Owner decisions and checks

To #992 (decisions register #993):

1. Keep the real proofer CSV import and export, or drop it with `NotesHeader` (the Pickups mock has none; the Proof mock shows stub icons; the PRD says not built).
2. Build the mock's notes thread on a finding (the PRD does not list it; one review note exists today).
3. Play ±3 s: the mock has it, the PRD lists it as not built.
4. Take review (scan, reads, comparison in the detail panel) has no Proof mock equivalent; D98 removes it from Proof's notes, ADR 0124 and DQ-15 say the take suggestion lives on Editing.

Owner checks: none needed for this note. Unverified items above need a read before the slice that owns them starts.
