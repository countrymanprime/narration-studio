# Studio Next undo: mock commands and their real inverses

**Date:** 2026-10-11. **Mock:** `docs/research/mockups/studio-next/` as of `c171071`. **Host:** `apps/desktop/*.go` as of `b3e0c8e`.
**Decisions:** [ADR 0770](../adr/0770-the-ui-store-caches-host-reads-and-journals-commands-and-the-go-host-stays-the-source-of-truth.md) (store and journal) and [ADR 0771](../adr/0771-undo-is-one-in-memory-journal-that-refuses-with-a-reason-and-reaches-the-daw-only-for-its-last-action.md) (undo scope and refusals).

This is a dated inventory. It pairs every `act(...)` call in the mock's `src/state/commands/` with the host binding that makes the change in the real app and the binding that takes it back. It is the starting set for the journal (owner ruling SNS-Q4); the slices that add the missing commands update their rows.

## How the rows were found

```sh
grep -rn "act(" docs/research/mockups/studio-next/src/state/commands | wc -l
# 47
grep -rnw "act(" docs/research/mockups/studio-next/src/state/commands | grep -v '^[^:]*:[0-9]*: \*' | wc -l
# 44
```

The first command is the one the slice issue names. Three of its 47 hits are not calls: the doc comment at `editing.ts:3` and `draftImpact(` at `editing.ts:344` and `editing.ts:360`. The second command matches `act(` as a word and drops comment lines, and gives the 44 rows below.

Bindings were read from the `func (h *Host)` methods in `apps/desktop/*.go` and the services they call. A row names a binding only when that method exists and its doc comment or service code shows the effect. Where nothing in the host makes the change today, the row says so and names the PRD that builds it; no binding name is guessed.

## Columns

- **Kind:** `Host` (the change and its inverse are host commands), `DAW` (the change is made in the DAW; [ADR 0771](../adr/0771-undo-is-one-in-memory-journal-that-refuses-with-a-reason-and-reaches-the-daw-only-for-its-last-action.md) rule 4 applies), `UI only` (nothing outside the UI changes), or `None` (not undoable in-app).
- **Touches:** the read-model keys the entry claims, in ADR 0771's `domain/id` form. Two entries conflict when one key is a prefix of the other.
- **Forward:** the binding that makes the change today, or "none yet".
- **Inverse:** the binding and arguments that undo it, or "not undoable in-app" and why.

## The table

| # | Mock call | Label | Kind | Touches | Forward | Inverse |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `backups.ts:54` | Put back *backup* | DAW | `backups/<id>`, `daw/<chapter>` | none yet (SND, spike 5) | Not undoable in-app: no host command restores a backup today; once SND adds one, rule 4 applies |
| 2 | `bible.ts:194` | Merged *A* into *B* | None | `bible/<from>`, `bible/<into>`, `relationships` | `GuideMerge(sourceID, targetID)` | Not undoable in-app: the sidecar deletes the source entity and repoints its relationships; no command splits an entity back |
| 3 | `bible.ts:219` | Marked *name* reviewed | None | `bible/<id>` | `GuideEdit(id, values)` (the sidecar sets `review_state` to `reviewed` on any edit) | Not undoable in-app: no command sets `review_state` back to `needs review` |
| 4 | `bible.ts:226` | Marked *alias* reviewed | None | `bible/<id>` | none yet (Story Bible aliases have no review state; SNB) | Not undoable in-app: no host command |
| 5 | `bookmarks.ts:24` | Added a bookmark | Host | `bookmarks/<id>` | `ManuscriptCreateBookmark(values)` | `ManuscriptDeleteBookmark(id)` with the id the create returned |
| 6 | `bookmarks.ts:36` | Edited a bookmark | None | `bookmarks/<id>` | none yet (no binding edits a bookmark; SNB) | Not undoable in-app: no host command; the binding SNB adds must take the old label and note as its inverse |
| 7 | `bookmarks.ts:44` | Deleted a bookmark | Host | `bookmarks/<id>` | `ManuscriptDeleteBookmark(id)` | `ManuscriptCreateBookmark(values)` with the deleted bookmark's values from the read model; the host gives it a new id (ADR 0771 rule 6) |
| 8 | `booth.ts:190` | *n* pickups marked recorded, and suspected lines added | DAW | `pickups/<id>` each, `daw/<chapter>` | `PickupsResolve(position)` per pickup (renames the REAPER marker to `PICKUP_DONE:`, one undo step); suspected lines: none yet (SNO) | DAW rule 4; no host command reopens a resolved pickup |
| 9 | `booth.ts:218` | Dismissed a suspected line | Host | `findings/<id>` | `TeleprompterSaveFlags(chapterID, flags)` records the dismissal as a findings decision | `FindingsReview(id, evidenceVersion, "unreviewed", "")`; refused if the evidence changed |
| 10 | `checkcard.ts:58` | Accepted a finding at *t* | Host | `findings/<id>` | `FindingsReview(id, evidenceVersion, "accepted", note)` | `FindingsReview(id, evidenceVersion, "unreviewed", "")`; refused if the evidence changed |
| 11 | `checkcard.ts:77` | Ignored a finding at *t* | Host | `findings/<id>` | `FindingsReview(id, evidenceVersion, "dismissed", "")` | `FindingsReview(id, evidenceVersion, "unreviewed", "")`; refused if the evidence changed |
| 12 | `companion.ts:14` | Decision *X* at *t* (Companion) | None | `findings/<id>` | not carried over | Not undoable in-app: the mock's Companion page is not translated and the real companion stays as built (rebuild PRD "What We're NOT Building", DQ-13) |
| 13 | `editing.ts:59` | Kept *take*; the other takes are muted | DAW | `passages/<id>`, `findings/<id>` each, `daw/<chapter>` | `WorkspaceUseTake(chapterID, firstToken, lastToken, candidateID)` or `RetakeLanesPick(lineID, itemGUID)` (one REAPER undo step, [ADR 0233](../adr/0233-the-app-may-make-a-take-active-by-guid-in-one-undo-step.md)); the take notes: `FindingsReview` | DAW rule 4, then `FindingsReview(..., "unreviewed")` for the notes |
| 14 | `editing.ts:94` | Hid *n* other takes | DAW | `passages/<id>`, `daw/<chapter>` | none yet (SND) | Not undoable in-app: no host command |
| 15 | `editing.ts:128` | *Prep step* at *t* | DAW | `passages/<id>`, `daw/<chapter>` | `CleanupApply(chapterID)` (trim silence) or `LevelMatchApply(...)` (normalise), each one REAPER undo block; trim breaths: none yet | DAW rule 4 |
| 16 | `editing.ts:150` | Split a duplicate read at *t* | DAW | `passages/<id>`, `daw/<chapter>` | none yet (SND) | Not undoable in-app: no host command |
| 17 | `editing.ts:281` | *Clean-up fix* (applied rows) | DAW | `findings/<id>` each, `detections/<id>` each, `daw/<chapter>` | `CleanupApply(chapterID)` or `LevelMatchApply(...)`, one REAPER undo block; the notes: `FindingsReview` | DAW rule 4, then `FindingsReview(..., "unreviewed")` for the notes |
| 18 | `editing.ts:366` | Added *effect* to *range* | DAW | `fx/<id>`, `daw/<chapter>` | `WorkspaceApplyFXChain(chapterID, chain)` (track) or `WorkspaceAddTakeFX(chapterID, firstToken, lastToken, plugin)` (part of a take), one REAPER undo step ([ADR 0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md)) | DAW rule 4 |
| 19 | `editing.ts:383` | Removed *effect* | DAW | `fx/<id>`, `daw/<chapter>` | none yet (SND) | Not undoable in-app: no host command |
| 20 | `editing.ts:400` | Bypassed or turned on *effect* | DAW | `fx/<id>`, `daw/<chapter>` | none yet (SND) | Not undoable in-app: no host command |
| 21 | `extraction.ts:22` | Accepted, Edited and accepted, Rejected, or Reviewed *suggestion* | None | `suggestions/<id>`, `bible/<entry>`; UI: `bible.selSug`, `bible.sel` | none yet (the host keeps no suggestion list; SNX) | Not undoable in-app: no host command |
| 22 | `extraction.ts:70` | Scanned the manuscript (*source*) | None | `suggestions` | none yet (SNX); `GuideBuild` rebuilds the whole Story Bible as a job | Not undoable in-app: a scan is a job with no inverse |
| 23 | `extraction.ts:78` | Imported *n* from a file | None | `suggestions` | none yet (SNX) | Not undoable in-app: no host command |
| 24 | `extraction.ts:99` | Scanned the manuscript (*sources*) | None | `suggestions` | none yet (SNX) | Not undoable in-app: a scan is a job with no inverse |
| 25 | `pickups.ts:105` | Removed a pickup | None | `pickups/<id>` | none yet (real pickups are REAPER markers and no binding removes one; SNQ) | Not undoable in-app: no host command |
| 26 | `pickups.ts:134` | Added *n* markers in *DAW* | DAW | `daw/<chapter>` each | `PickupsImport(csvText)` adds the pickup markers in REAPER | DAW rule 4 |
| 27 | `pickups.ts:210` | Added *n* pickups from the check | None | `pickups` | none yet (SNQ) | Not undoable in-app: no host command |
| 28 | `pronunciation.ts:31` | Changed a pronunciation, or Pronunciation: *source* (words only; names go through the Story Bible edit, which the mock does not journal) | None | `pronunciations/<word>` | none yet (no binding stores a word's pronunciation outside the Story Bible; SNB) | Not undoable in-app: no host command |
| 29 | `proof.ts:135` | Decision *X* at *t* | Host | `findings/<id>`; UI: `proof.sel` | `FindingsReview(id, evidenceVersion, status, note)` | `FindingsReview(id, evidenceVersion, "unreviewed", "")`; refused if the evidence changed. The selection is restored from the UI part of the entry |
| 30 | `proof.ts:223` | Added a marker in *DAW* | DAW | `daw/<chapter>` | `FindingsAddMarker(id)` (one REAPER take marker) | DAW rule 4 |
| 31 | `proof.ts:297` | Deleted a note (one message of a proof note's thread) | None | `findings/<id>` | none yet (a decision holds one note in an append-only history, [ADR 0120](../adr/0120-findings-are-read-and-decided-through-four-generic-bindings-and-a-decision-carries-the-evidence-version-it-was-made-against.md); SNQ) | Not undoable in-app: no host command deletes a message |
| 32 | `readiness.ts:47` | Moved *chapter* to *stage* | Host | `stages/<chapter>` | `StageConfirm(chapterID, target, basisKey)` | `StageRevert(chapterID)` |
| 33 | `readiness.ts:64` | Dismissed the suggestion for *chapter* | None | `stages/<chapter>` | `StageDismiss(chapterID, target, basisKey)` | Not undoable in-app: the dismissal is an appended decision and no command withdraws it; it lifts when the basis changes |
| 34 | `readiness.ts:81` | Reverted *chapter* to *stage* | Host | `stages/<chapter>` | `StageRevert(chapterID)` | `StageConfirm(chapterID, target, basisKey)` with the reverted confirmation's target and basis; refused when the basis has changed |
| 35 | `report.ts:13` | Exported a status report | None | `reports` | `ProductionStatusReport(includeContractedAmount)` writes an HTML and a JSON file | Not undoable in-app: the files are on disk and may already be shared; no command deletes them |
| 36 | `schedule.ts:40` | Add milestone, or Edit milestone | Host | `milestones` | `ProductionSaveMilestones(milestones)` replaces the whole list | `ProductionSaveMilestones(previous)` with the list from the read model before the change |
| 37 | `schedule.ts:52` | Remove milestone | Host | `milestones` | `ProductionSaveMilestones(milestones)` | `ProductionSaveMilestones(previous)` |
| 38 | `script.ts:250` | Deleted a message | Host | `notes/<id>` | `ManuscriptDeleteNote(id)` (real notes have no thread: the message is the whole note) | `ManuscriptCreateNote(chapterID, paragraphID, text, anchorText, anchorStart, anchorEnd)` with the deleted note's fields; the host gives it a new id (ADR 0771 rule 6) |
| 39 | `scriptedit.ts:293` | Kept *n* flagged words as read | None | `accepted` | none yet (SNE) | Not undoable in-app: no host command |
| 40 | `scriptedit.ts:397` | Muted or Deleted *n* words (and their audio) at *t* | DAW | `cuts/<id>` each, `daw/<chapter>` | none yet (SND, spike 2) | Not undoable in-app: no host command |
| 41 | `scriptedit.ts:500` | Added *chain* to *n* words at *t* | DAW | `wordFx/<id>`, `daw/<chapter>`; UI: `editing.fx` | `WorkspaceAddTakeFX(...)` puts one plug-in on a passage; a saved chain on a word range: none yet (SND, spike 3) | DAW rule 4 |
| 42 | `scriptedit.ts:518` | Took *chain* off *words* | DAW | `wordFx/<id>`, `daw/<chapter>` | none yet (SND) | Not undoable in-app: no host command |
| 43 | `stacking.ts:136` | Stacked *n* takes | DAW | `passages/<id>` each, `daw/<chapter>` | none yet (SND, spike 4) | Not undoable in-app: no host command |
| 44 | `stacking.ts:151` | Moved *n* takes back to where they were recorded | DAW | `passages/<id>`, `daw/<chapter>` | none yet (SND) | Not undoable in-app: no host command |

## Counts

| Kind | Rows | Of which the forward command exists today |
| --- | --- | --- |
| Host, with a real inverse | 11 (5, 7, 9, 10, 11, 29, 32, 34, 36, 37, 38) | 11 |
| DAW | 17 (1, 8, 13, 14, 15, 16, 17, 18, 19, 20, 26, 30, 40, 41, 42, 43, 44) | 8 (8, 13, 15, 17, 18, 26, 30, 41) |
| UI only | 0 | 0 |
| None | 16 (2, 3, 4, 6, 12, 21, 22, 23, 24, 25, 27, 28, 31, 33, 35, 39) | 4 (2, 3, 33, 35) |
| **Total** | **44** | **23** |

No mock command is wholly UI-only in the real app: every one changes data the host owns. Four carry a UI part (rows 21, 29 and 41 restore a selection; row 12 is not carried over), which the journal restores with a copy-on-write closure ([ADR 0770](../adr/0770-the-ui-store-caches-host-reads-and-journals-commands-and-the-go-host-stays-the-source-of-truth.md)).

## What the counts say about the PRD's targets

- The domain-state PRD's success metric asks that at least 90% of the mock's `act(...)` calls have a real inverse. Today 11 of 44 do (25%). Of the 23 whose forward command exists, 11 have a host inverse (48%), 8 are DAW changes whose undo waits on spike 6, and 4 have none.
- The PRD's Key Hypothesis fails "if journal entries cannot be inverted by host commands for more than a third of the undoable commands". On today's host it fails: 33 of 44 rows have no host inverse. Most of them (21) have no forward command yet either, so the measure can only be taken again once the page PRDs land their commands. Each of those slices owes its inverse with its command: the rows above say which.
- The DAW rows decide the rest. If spike 6 shows the app can undo its own last DAW action, the 8 DAW rows with a forward command become undoable under rule 4, and the in-app share of rows with an existing command rises to 19 of 23.
