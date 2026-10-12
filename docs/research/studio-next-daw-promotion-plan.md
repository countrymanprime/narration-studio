# Studio Next DAW commands: the promotion plan

**Status: written 2026-10-12 (SN-D10, [#1208](https://github.com/countrymanprime/narration-utils/issues/1208)); promotes nothing.** Each command and capability that [the DAW PRD](../prds/studio-next-daw-ports-and-capabilities.prd.md) added is Experimental. This note lists, for each one, where it is declared Experimental, the harness tests and mutation checks that exist, the check in REAPER or Audacity still owed, and the change that promotes it once that check passes ([ADR 0400](../adr/0400-promoting-a-reaper-command-from-experimental-to-supported-is-a-one-line-daw-port-declaration-change.md)). No check in a real REAPER or Audacity has run: the owner deferred all of them to the QA pass, [#1495](https://github.com/countrymanprime/narration-utils/issues/1495), on 2026-10-12. Counts are from `main` at `ad961a1`.

## How a promotion is made

- **REAPER.** In one PR, after the command's verification-pass row passes and is recorded ([switching a command on](../operations/reaper-verification-pass.md#switching-a-command-on)): delete the command's line from `experimentalCommands` in `apps/desktop/internal/bridge/actions.go`, and, once every command of its capability is off that list, change the capability's line in `declares` in `apps/desktop/internal/dawport/reaper/reaper.go` from `dawport.Experimental` to `dawport.Supported`. `dawport/reaper`'s tests parse the list and fail when the two disagree. Then regenerate [the matrix](../reference/daw/matrix.md) (`UPDATE_DAW_DOCS=1 go test ./internal/dawport/dawportdoc` from `apps/desktop`) and update the capability's "Checked" line.
- **Audacity 3.x.** Audacity has no command list: the resolver gates on the declaration alone. `declares` in `apps/desktop/internal/dawport/audacity/audacity.go` sets `backups` Experimental on its own line and every capability in `needBackups` Experimental in a loop, so promoting one of those is one added line after the loop (`d[dawport.CapCutRange] = dawport.Supported`, for example). Promote `backups` before anything that requires it: the resolver refuses a capability whose requirement is unavailable.

## REAPER

Harness counts are `H.test` cases in the file named and entries in `integrations/reaper/tests/mutations.json` named for the command; all 551 tests pass and all 273 mutations are caught (`python integrations/reaper/tests/run_lua_tests.py --mutations`, run for this note on 2026-10-12, Linux, Lua 5.4 through lupa).

| Command | Capability, declared in | Harness tests | Mutation checks | Check still owed | Promoted by |
| --- | --- | --- | --- | --- | --- |
| `hide_takes` | `takes`, Experimental (`reaper.go`); on `experimentalCommands` | `takes_test.lua`, 8 | 11 | Verification pass row C1; [#1495](https://github.com/countrymanprime/narration-utils/issues/1495) body, "Editing Hide the other takes" (SN-E54) | Delete `"hide_takes": true`; `CapTakes` goes Supported only when `set_active_take` (row A6) has passed too |
| `roll` | `punch`, Experimental; on `experimentalCommands` | `roll_test.lua`, 28 | 19 | Row C2 (needs Part B's recording); eight items in [#1495, comment 6117745093](https://github.com/countrymanprime/narration-utils/issues/1495#issuecomment-6117745093) and ADR 0860's open points in [comment 6117574265](https://github.com/countrymanprime/narration-utils/issues/1495#issuecomment-6117574265); spike SND-1a ([#992](https://github.com/countrymanprime/narration-utils/issues/992)) | Delete `"roll": true`; `CapPunch` goes Supported only when `play_position` and `punch_to` (rows A9b, A9c, B9) have passed too |
| `delete_range` | `cut_range`, Experimental; on `experimentalCommands` | `range_test.lua`, 21 | 17 | Row C3; [#1495, comment 6118507491](https://github.com/countrymanprime/narration-utils/issues/1495#issuecomment-6118507491) and [comment 6118555312](https://github.com/countrymanprime/narration-utils/issues/1495#issuecomment-6118555312); spike SND-1b (#992) | Delete `"delete_range": true` and change `CapCutRange` to Supported |
| `apply_fx_range` | `fx_range`, Experimental; on `experimentalCommands` | `fx_range_test.lua`, 38 (both commands) | 14 | Row C4; #1495 body, the SN-D63 line; spike SND-1c (#992) | Delete `"apply_fx_range": true`; `CapFXRange` with `remove_fx_range` |
| `remove_fx_range` | `fx_range`, as above | as above | 13 | Row C5; as above | Delete `"remove_fx_range": true` and change `CapFXRange` to Supported |
| `stack_takes` | `stack_takes`, Experimental; on `experimentalCommands` | `stack_test.lua`, 40 (both commands) | 24, plus 9 on the payload file | Row C6; #1495 body, the SN-D71 line and the [#1543](https://github.com/countrymanprime/narration-utils/pull/1543) hardening line; spike SND-1d (#992) | Delete `"stack_takes": true`; `CapStackTakes` with `unstack_takes` |
| `unstack_takes` | `stack_takes`, as above | as above | 14 | Row C7; as above | Delete `"unstack_takes": true` and change `CapStackTakes` to Supported |
| `reopen_pickup` | `pickups`, **Supported** already; not on `experimentalCommands` | `pickups_test.lua`, 6 | 1 of its own, plus the rename's shared checks | Row C8; not named on #1495 or #992: the nearest is #1495's "Booth pickup session" line (SN-O82) | Nothing to promote: a failure is a bug to fix |
| `list_pickup_markers` | `pickups`, as above | `pickups_test.lua`, 3 | 2 | Row C9; as above | Nothing to promote |

The stack payload file is checked by the Lua (size, group and move bounds, GUID and number shapes) and by the 9 payload mutations; it has no row of its own because it is the host's file in the session folder (threat model row 5l).

## Audacity 3.x

Built from the published scripting spec and tested over a fake pipe ([ADR 0355](../adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md)); `go test ./internal/dawport/audacity/` passes (2026-10-12). Test counts are `func Test` in each file.

| Capability | Declared in `audacity.go` | Tests | Check still owed | Promoted by |
| --- | --- | --- | --- | --- |
| `backups` | `d[dawport.CapBackups] = dawport.Experimental` | `backups_test.go` 19, `backups_prune_test.go` 3, `backups_label_test.go` 3, `backups_contract_test.go` 1; `bindings_daw_backups_test.go` 13 | The Backups table of [the Audacity pass](../operations/audacity-verification-pass.md#backups-pending-not-in-part-a-yet), which no part runs yet; nine items in [#1495, comment 6122537699](https://github.com/countrymanprime/narration-utils/issues/1495#issuecomment-6122537699); spike SND-1g (#992) | Change that line to `dawport.Supported`, first |
| `punch` (roll after a backup) | the `needBackups` loop | `steps_test.go`, 9 (all five edits) | Audacity pass Part C row C6 | One line after the loop |
| `cut_range` | the `needBackups` loop | as above | Part C rows C1, C2 and C7 | One line after the loop |
| `fx_range` | the `needBackups` loop | as above | Part C row C3 (needs the narrator's macro) | One line after the loop |
| `stack_takes` | the `needBackups` loop | as above | Part C rows C4 and C5; #1495 body, "Editing Stack retries and Un-stack" (SN-E73), the only #1495 line for an edit made in steps | One line after the loop |
| `takes` | the `needBackups` loop | no test of a take edit: setting and hiding a take are not built for Audacity | Nothing to check until they are built | Not promoted while its roles answer "not available yet" |

## Built-in recorder

`builtin.go` declares `record` and `takes` Experimental until the owner's hardware pass (SN-D9, [#1413](https://github.com/countrymanprime/narration-utils/pull/1413)). The PRD added neither command, so this note lists them only to say they are not promoted here.

## Success Metrics, as measured

The PRD's [Success Metrics](../prds/studio-next-daw-ports-and-capabilities.prd.md#success-metrics), each measured on 2026-10-12 at `ad961a1` or marked pending.

| Metric | Target | Measured |
| --- | --- | --- |
| Commands with harness test and mutation check | 100% of new commands | Met: 9 of 9 commands in the REAPER table above have tests and mutation checks; 551 tests pass and 273 of 273 mutations are caught |
| Commands answering a `DawResult` | All DAW calls used by the series' pages | Met for the calls this PRD added: `apps/ui/src/ports/daw.contract.test.ts` has a host-adapter and a mock case for `hideTakes`, `roll`, `deleteRange`, `applyFxToRange` and `removeFxFromRange`, `stackTakes` and `unstackTakes`, the backups calls and the pickup markers; 81 tests pass under Vitest |
| Capability refusals worded by the resolver or adapter | 100% (no UI-worded refusal) | Met for capability refusals: a scan of the four `<CapabilityGate>` uses outside tests and stories (`CleanupAction.tsx` twice, `CreateChapterRegionsDialog.tsx`, `CompareRun.tsx`) finds each passing `useCapability`'s entry or `dawCapabilityGate`'s reason, which is the capability's own message. One sentence is the UI's: `CompareRun.tsx` words "Link a REAPER project (.rpp) file to start a comparison." for a chapter with no linked project, a setup precondition rather than a capability refusal |
| Unverified behaviours with a committed spike result | 100% before their implementation slice | Not met: 0 of 7 spikes have a result. The owner deferred them to #1495 on 2026-10-12, the write-ups SN-D11 and SN-D12 were closed as not planned, and the slices were built from the documented REAPER behaviour ([ADR 0860](../adr/0860-a-roll-keeps-the-earlier-audio-as-a-take-and-a-range-cut-a-chain-on-a-range-and-stacking-move-audio-and-never-delete-it.md)). Pending, owner |
| Pending owner REAPER steps | Listed on #510; none blocking | The steps now live on #1495 (the comments named above) and #992 (the spikes); none blocks a merge, since every command is Experimental. Pending, owner |
