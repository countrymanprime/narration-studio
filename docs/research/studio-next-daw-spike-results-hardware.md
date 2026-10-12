# Studio Next DAW spikes 1f and 1g: play position and Audacity backups

**Status: results pending, structure written 2026-10-11.** The owner has not returned spikes 1f and 1g of [the spike runbook](../operations/daw-spike-run-sheet.md), so neither has a result. A "pending" cell is not a failure: it means no table row has come back. A worker has no audio interface, no REAPER and no Audacity, so nothing here is a guess. Tracking: issue #1146, part of #1016.

Spikes SND-S6 and SND-S7 of [the DAW PRD](../prds/studio-next-daw-ports-and-capabilities.prd.md). Style and limits follow [REAPER spike S6](reaper-spike-s6-daw-reachability.md) and [ADR 0355](../adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md).

## How to fill this note

Copy from the owner's returned row only: the version, the date, the result, the output files and the owner's notes. If a row comes back empty, keep the owner's reason ("no interface", "no pipe", "pipe module off") and leave the spike pending.

## 1f Play position (SND-S6)

| Item | Value |
| --- | --- |
| Question | Is `GetPlayPosition` or `GetPlayPosition2` accurate over the file bridge for the Booth's resume anchor (REAPER spike S4)? |
| Needs | An audio interface (this plays audio) |
| Script | `1f` in the runbook; files `spike-1f-report.txt`, `spike-1f-samples.csv` |
| REAPER version and date | pending |
| Result | pending |
| Buffer size, sample rate, audible offset | pending (from the samples CSV and the owner's notes) |
| Not proved | pending |

Consequence for the Booth resume anchor: pending. Once the table is back, one sentence says which of the two calls anchors a word, at what offset and buffer size, and what that means for [ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md)'s polled anchor. It is a sentence, not a decision.

What each outcome would change in the DAW PRD (from the runbook's 1f table): see the runbook section "1f Play position".

## 1g Audacity backups (SND-S7)

| Item | Value |
| --- | --- |
| Question | Can the scripting pipe clone a time range to a backups track and restore it, and what does two minutes cost? |
| Needs | Audacity 3 with `mod-script-pipe` enabled |
| Script | `1g` in the runbook; file `spike-1g-report.json` |
| Audacity 3 version and date | pending |
| Cloned to a Backups track and restored | pending |
| Clone seconds, restore seconds (tested window) | pending |
| Audacity 4 | Not applicable: 4.0 has no scripting pipe (ADR 0355). The runbook records "not reachable" for it. |
| Not proved | pending |

Consequence: pending. SN-D81 (Audacity backups) is built on this section. If 1g says the pipe cannot clone and restore a range, comment on SN-D81 and #989 instead of building it. See the runbook's 1g table for each outcome.

## Related

- [Runbook](../operations/daw-spike-run-sheet.md): scripts, results table and outcome tables.
- Spikes 1a to 1e are in the REAPER results note, written by SN-D11.
