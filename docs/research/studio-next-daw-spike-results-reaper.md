# Studio Next DAW spikes 1a to 1e: REAPER results

**Status: results pending, structure written 2026-10-11.** The owner has not returned the results table of [the spike runbook](../operations/daw-spike-run-sheet.md) for spikes 1a to 1e, so no spike below has a result. Every "Result" cell reads "pending" and stays empty until the table comes back on #992. A worker cannot run REAPER, so nothing here is a guess. Tracking: issue #1145, part of #1016.

Spikes SND-S1 to SND-S5 of [the DAW PRD](../prds/studio-next-daw-ports-and-capabilities.prd.md). The questions are the PRD's, copied from the runbook. Each section follows the shape of [REAPER spike S7](reaper-spike-s7-fixed-lanes.md): question, setup, what was observed, what was not proved, consequence.

## How to fill this note

For each spike, copy from the owner's returned row: the REAPER version, the date, the result (yes / no / partly), the undo points (number and names from the report's `UNDO_POINTS` line) and the output files. Add no number or label that is not in the table or an attached report. A spike returned with an empty result keeps the owner's reason (no interface, wrong version) and is marked "not run", not failed. Then replace the consequence line with the outcome row that matches.

## 1a Roll (SND-S1)

| Item | Value |
| --- | --- |
| Question | Can a roll while recording be one command that keeps the earlier audio as a take in REAPER, and what undo points result? |
| Script | `1a-fake` (scripted, no device) and `1a-real` (audio interface) in the runbook; reports `spike-1a-fake-report.txt`, `spike-1a-real-report.txt` |
| REAPER version and date | pending |
| Result, fake | pending |
| Result, real record | pending (record the recording mode, input and buffer size) |
| Undo points | pending |
| Not proved | pending |

Consequence, by outcome:

| Result | Consequence for the PRD |
| --- | --- |
| Yes | Roll ships as one command (`roll`, SND-6a). The note names the recording mode that kept the earlier audio; the command refuses with that mode named when the project is in another, and never changes preferences. |
| No | SND-6a is dropped from the Booth; [ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md)'s cursor-only roll stays. |
| Partly | Roll ships only for the mode(s) that kept the audio, and refuses otherwise. List the modes and any extra undo points. |

## 1b Cut (SND-S2)

| Item | Value |
| --- | --- |
| Question | Is "split at both ends, move middle to a muted Cuts track" one undo block, and does closing up later audio stay correct for other items? |
| Script | `1b`; report `spike-1b-report.txt` |
| REAPER version and date | pending |
| Result | pending |
| Undo points | pending |
| Not proved | pending |

Consequence: pending. It must say whether the cut and the move to the muted Cuts track are one undo block, and whether closing up later audio is correct for other items. Outcomes are in the runbook's 1b table; they decide SND-6b (`delete_range`) and SNE-6a, and relate to [ADR 0262](../adr/0262-cleanup-trims-are-found-by-matching-the-measured-file-to-a-live-item-and-applied-as-a-split-and-delete-inside-one-undo-block.md).

## 1c Chain on range (SND-S3)

| Item | Value |
| --- | --- |
| Question | Does `TakeFX_AddByName` load a saved `.RfxChain` onto a split piece, and how is it undone? |
| Script | `1c`; report `spike-1c-report.txt` |
| REAPER version and date | pending |
| Result | pending (record which name form loaded the chain) |
| Undo points | pending |
| Not proved | pending |

Consequence: pending. It must say which name form of `TakeFX_AddByName` loads a saved chain and how it is undone. Outcomes are in the runbook's 1c table; they decide SND-6c (`apply_fx_range`), SNE-6b and the ADR A9, and relate to [ADR 0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md) and [ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md).

## 1d Stack (SND-S4)

| Item | Value |
| --- | --- |
| Question | Can later reads become takes of the first item in one undo block? |
| Script | `1d`; report `spike-1d-report.txt` |
| REAPER version and date | pending |
| Result | pending |
| Undo points | pending |
| Not proved | pending |

Consequence: pending. It must say whether later reads become takes of the first item in one block. Outcomes are in the runbook's 1d table; they decide SND-7 and SNE-7, and relate to [ADR 0147](../adr/0147-retakes-on-fixed-lanes-are-chosen-by-lane-play-state-and-the-app-never-converts-takes-and-lanes.md).

## 1e Undo reach (SND-S5)

| Item | Value |
| --- | --- |
| Question | Can the app trigger the DAW's undo only for its own last block safely? |
| Script | `1e-script` and `1e-live` (a 40-second hand edit); reports `spike-1e-report.txt`, `spike-1e-live-report.txt` |
| REAPER version and date | pending |
| Result | pending (record the exact hand-edit labels) |
| Undo points | pending |
| Not proved | pending |

Consequence: pending. It must say whether the app may trigger undo and which labels it can tell apart. Until then [ADR 0771](../adr/0771-undo-is-one-in-memory-journal-that-refuses-with-a-reason-and-reaches-the-daw-only-for-its-last-action.md) rule 4 refuses every DAW undo in-app with "Use Edit > Undo in REAPER", so nothing waits on this spike. 1e only changes the wording of the undo rule.

## Related

- [Runbook](../operations/daw-spike-run-sheet.md): scripts, the results table and the outcome tables.
- Spikes 1f and 1g (play position, Audacity backups) are recorded in the hardware note, written by SN-D12.
- SN-D13 (the ADR for these results) needs 1a to 1d recorded.
