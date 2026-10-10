# Studio Next DAW Ports and Capabilities: A Result Object, Capability Depth and the Bridge Commands the Mock Assumes

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); the owner's DAW rulings in `studio-next/research/repo-compare-decisions.md` ("DAW state rulings", "Takes, restarts, punch and roll", "Owner follow-up on takes and Audacity", "FX exception"); the mock's `studio-next/src/state/daw.ts`, `studio-next/src/domain/daw.ts`, `studio-next/src/fixtures/daw.ts`, `studio-next/src/selectors/daw.ts`.

**Builds on:** [ADR 0300](../adr/0300-every-daw-is-reached-through-one-port-of-small-role-interfaces-and-callers-ask-a-resolver-what-it-supports.md) to [ADR 0306](../adr/0306-mastering-is-a-provider-port-and-measurement-stays-one-in-process-judge.md) (the DAW port, delivered), [ADR 0230](../adr/0230-reaper-commands-built-before-the-verification-pass-are-refused-by-the-host-while-the-experimental-switch-is-off.md) and [ADR 0400](../adr/0400-promoting-a-reaper-command-from-experimental-to-supported-is-a-one-line-daw-port-declaration-change.md) (experimental commands and promotion), [ADR 0066](../adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md) to [ADR 0068](../adr/0068-bridge-events-fan-out-to-subscribers-by-tag-and-run-and-every-error-names-its-run.md) (the harness, registry, event fan-out), [ADR 0233](../adr/0233-the-app-may-make-a-take-active-by-guid-in-one-undo-step.md), [ADR 0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md), [ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md), [ADR 0355](../adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md), [ADR 0455](../adr/0455-the-built-in-recorder-records-each-take-to-a-partial-file-in-the-projects-recordings-folder-and-links-it-to-its-take-name.md), Audacity Integration (old PRD `audacity-integration.prd.md`, recoverable from git history), Native Recording Suite (old PRD `native-recording-suite.prd.md`, recoverable from git history), Booth Actions Enablement (old PRD `booth-actions-enablement.prd.md`, recoverable from git history), REAPER Automation Follow-Through (old PRD `reaper-automation-follow-through.prd.md`, recoverable from git history), Edit and Proof Workspace (old PRD `edit-and-proof-workspace.prd.md`, recoverable from git history).

**Status (2026-10-10):** draft. This PRD is lane K and lane B work. Spikes come first; nothing that writes to REAPER is built before its spike result is committed, and every new command ships Experimental ([ADR 0230](../adr/0230-reaper-commands-built-before-the-verification-pass-are-refused-by-the-host-while-the-experimental-switch-is-off.md)).

## Problem Statement

The real app already reaches every DAW through one port of small roles with a resolver ([ADR 0300](../adr/0300-every-daw-is-reached-through-one-port-of-small-role-interfaces-and-callers-ask-a-resolver-what-it-supports.md)), which is the right shape. What the mock adds, and the owner ruled on, is depth the port does not have: a **result object** every call answers (`ok`, `changed`, `message`, `undoSteps`, a refusal reason, the edits a multi-step DAW performed), capabilities that carry **why not**, whether a roll is **destructive**, and **how** a multi-edit change is made (native, by the app, or in steps); saved-versus-live project state; item and take identity by GUID with a uniform stale refusal; and commands the bridge does not have: range cut, effect on a range, stack and unstack takes, hide other takes, a roll that keeps the earlier audio, and a backups mechanism so Audacity 3 can be non-destructive. Without these, the Booth, Proof and Editing rulings cannot be built DAW-neutrally.

## Evidence

**Mock** (`studio-next/ARCHITECTURE.md`, "DAW plumbing (batch C1)"): `DawCapabilities {daw, reachable, caps{level, available, reason?, destructive?, mode?}}`; `DawResult {ok, changed, message, undoSteps, refused?, steps?}`; `DawProjectState {savedAt, unsavedChanges, playState, playPosition}`; `DawAdapter` with record, roll, markers, takes, stack, `deleteRange`, `applyFxToRange`, backups; `capabilitiesFor(setup, backups)` makes Audacity's roll non-destructive exactly when backups are on; stale ids refuse (`mock.dawStale`). Tests: `studio-next/tests/daw.test.ts`, `studio-next/tests/booth-daw.test.tsx`, `studio-next/tests/daw-wording.test.tsx`, `studio-next/tests/d3-stacking.test.tsx`, `studio-next/tests/e-delete-range.test.tsx`, `studio-next/tests/e-fx-range.test.tsx`.

**Repo** (at `550a7d1`):

| Mock concept | Repo today | Gap |
| --- | --- | --- |
| Capability with level and reason | `DawCapabilitySupport {level, available, reason?, message?}` (`apps/ui/src/api/contracts/daw.ts`); levels snake case (`not_yet_available`); message worded by resolver or adapter (`dawport.Explainer`, [ADR 0302](../adr/0302-dawport-roles-exchange-the-bridges-own-types-through-aliases-and-an-asynchronous-role-is-one-method-per-command.md)) | No `destructive`, no `mode`; mock levels are camel case |
| `DawResult` | No common result. Roles return typed values and errors; the host maps them to per-feature result types (for example `WorkspaceFXResult` with a reason, [ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md)) | Add one result type and a UI facade; map the existing ones |
| Capability names | 24 in `apps/desktop/internal/dawport/capability.go` | Add `cut_range`, `fx_range`, `stack_takes`, `backups`; extend `punch` with a destructive roll flag |
| Saved versus live | `chapter_track_state` returns rpp path, `unsaved`, `changeCount` ([ADR 0231](../adr/0231-chapter-track-state-is-one-read-only-answer-of-the-transport-the-arms-the-input-device-and-one-tracks-items.md)); `project_state` ([ADR 0210](../adr/0210-chapter-sync-watches-the-saved-rpp-and-reapers-edit-counter-and-sends-reaper-nothing.md)); the workspace says "as of the project's last save" | A `savedAt` time and one wire type |
| GUID identity and stale | `TRACK_STALE`, `ITEM_STALE`, `FINDING_STALE`; refusals as results ([ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md)) | One refusal code `stale` across features |
| Pickup markers as DAW truth | `PICKUP:` and `PICKUP_DONE:` markers exist in `integrations/reaper/narration_pickups.lua` (`import_pickups`, `resolve_pickup`, `next_pickup`) | App-side write-through and reconcile on opening Booth and Pickups |
| One undo block per command | Each Lua command opens one block; `play_position`, `punch_to` open none | Report `undoSteps` in the result |
| Set active take, hide other takes | `set_active_take` (one undo step, [ADR 0233](../adr/0233-the-app-may-make-a-take-active-by-guid-in-one-undo-step.md)); no hide or mute command; `removeTakes` is not a command | `hide_takes` (mute, never delete) |
| Roll as one command | `punch_to` moves the cursor only ([ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md)); record start and stop exist ([ADR 0232](../adr/0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md)) | Roll command, after a spike |
| Range cut and range FX | `add_take_fx` (one plug-in on a passage), `apply_fx_chain` (track or master) ([ADR 0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md)) | Cut and chain-on-range, exception A9 |
| Stack and unstack | None | New command, after a spike |
| Audacity backups | `audacity` adapter has `navigate`, `markers`, `macro_render` only (`dawport/audacity/audacity.go`) | Backups table adapter, after a spike |
| Built-in recorder as a DAW kind | Recording engine exists ([ADR 0455](../adr/0455-the-built-in-recorder-records-each-take-to-a-partial-file-in-the-projects-recordings-folder-and-links-it-to-its-take-name.md)); `DawKind` is `REAPER`, `Audacity`, `none` | Adapter row with its own capabilities |

## Proposed Solution

1. **Settle three ADRs** (A6 undo scope with the DAW flag, A7 result object and capability fields, A8 roll and range commands as supersession of parts of [ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md), [ADR 0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md) and [ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md)), each after its spike.
2. **Result and capability depth, additive on the wire.** Add `destructive?: boolean` and `mode?: 'native' | 'app' | 'steps'` to `DawCapabilitySupport`; keep snake case and the existing `reason` and `message`. Add `DawResult` (Go `dawport.Result`, TS `dawResultSchema`) and a UI `DawClient` that maps the existing per-feature results to it. A refusal carries the capability's own sentence; controls never word their own ([CapabilityGate](../adr/0360-studio-primitives-land-as-flat-leaf-files-after-one-token-batch-and-capability-gating-is-a-primitive.md) already does this).
3. **New capabilities** as normal catalogue rows: `cut_range`, `fx_range`, `stack_takes`, `backups`, each with a role interface, a conformance case in `dawporttest` and a declaration per adapter.
4. **New Lua commands**, harness test first, mutation entries for each guard, `wire.go` rows, threat-model and `SECURITY.md` rows, all Experimental: `hide_takes`, `roll`, `delete_range`, `apply_fx_range`, `stack_takes`, `unstack_takes`. Each is one undo block and answers `undoSteps`.
5. **Saved versus live** as one wire type (`DawProjectState`), with `savedAt` from the saved file's modification time (host-read, not Lua).
6. **Audacity backups** as an adapter-owned table (clone a window of audio, default about two minutes either side, around a punch or edit; retention days), with restore; Audacity gains `takes`, roll non-destructive, `stack_takes`, `cut_range`, `fx_range` only when backups are on (`mode: 'steps'`).
7. **Parity.** The `DawClient` mock implements the mock's setups (REAPER, REAPER off, built-in, Audacity with and without backups); one contract suite runs over the mock and the host adapter fed by golden payloads.

## Key Hypothesis

If every DAW call answers one result shape and every capability says why and how, the Booth, Proof and Editing pages can word nothing themselves and run unchanged on a second DAW. We are wrong if a page slice needs a DAW-name conditional (the boundary test in `dawport/boundary_test.go` forbids it) or if a spike shows REAPER cannot do a roll, cut or range effect in one undo block.

## What We're NOT Building

- Audacity 4 (no scripting there; revisit when it exists, `docs/research/audacity-4-scripting-spec.md`).
- Redo; app undo that drives the DAW's own history (spike SND-S5; the owner's QA step).
- Deleting audio in any DAW ("hide, never delete"); a delete is the DAW's job.
- Multi-item range edits (one item per request, as [ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md)).
- Regions beyond what exists ("regions (later)" in the rulings).
- A DAW-neutral rewrite of value types (the aliases of [ADR 0302](../adr/0302-dawport-roles-exchange-the-bridges-own-types-through-aliases-and-an-asynchronous-role-is-one-method-per-command.md) stay).
- Mac or Linux adapters ([ADR 0412](../adr/0412-windows-is-the-only-supported-platform-for-now.md)).

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Commands with harness test and mutation check | 100% of new commands | `registry_test.lua` and `mutations.json` |
| Commands answering a `DawResult` | All DAW calls used by the series' pages | `DawClient` contract suite |
| Capability refusals worded by the resolver or adapter | 100% (no UI-worded refusal) | Scan for strings in `CapabilityGate` callers |
| Unverified behaviours with a committed spike result | 100% before their implementation slice | `docs/research/` notes |
| Pending owner REAPER steps | Listed on #510; none blocking | #510 |

## Open Questions

- [ ] **SND-Q1. App undo reaching the DAW (owner ruling 13: "not explicitly ruled").** Recommendation: spike first; ship a toast that says "Use Edit > Undo in REAPER" for DAW entries beyond the last, as the mock does.
- [ ] **SND-Q2. Dropping `removeTakes` for hide or mute.** Recommendation: hide only; no delete anywhere.
- [ ] **SND-Q3. Roll when REAPER is the DAW.** The ruling says REAPER can create a take automatically. Recommendation: confirm in the spike which record mode gives that; if it needs a user preference, the command refuses with that reason instead of changing preferences.
- [ ] **SND-Q4. Capability names.** Recommendation: snake case `cut_range`, `fx_range`, `stack_takes`, `backups`; `roll` stays under `punch`.
- [ ] **SND-Q5. `DawKind` for the built-in recorder.** Recommendation: `Built-in` added to the union with the adapter slice, not before.
- [ ] **SND-Q6. Backup window and retention defaults.** The mock: about two minutes either side, retention days as a setting. Recommendation: 2 minutes, 7 days, both settings.

## Users & Context

Narrators using REAPER (primary), Audacity 3 (secondary) or the built-in recorder; the page workers who consume `DawClient`; the owner running scripted REAPER checks on a copy of a project (isolated `-cfgfile`, never touching the `Challenges_001` folder, D3 in the plan (deleted PRD `implementation-plan`)). Hardware steps are pending on #510.

## Solution Detail

### Acceptance criteria tied to the mock

| Behaviour | Mock reference | Acceptance |
| --- | --- | --- |
| A refusal names why | `studio-next/tests/daw-wording.test.tsx` | A control for a capability that is unavailable shows the capability's sentence and is `aria-disabled` |
| Stale ids refuse | `studio-next/tests/daw.test.ts` (`setActiveTake` with `mock.dawStale`) | A call with an old item GUID changes nothing and answers `refused: stale` |
| Roll keeps the earlier audio | `studio-next/tests/booth-daw.test.tsx` | In REAPER the earlier recording stays as a take; in Audacity it asks first unless backups are on |
| Stack retries | `studio-next/tests/d3-stacking.test.tsx` | One undo step natively; `steps` listed for Audacity; refused without backups |
| Cut words | `studio-next/tests/e-delete-range.test.tsx` | The item is split and the middle moves to a muted track in one undo block; later audio closes up or a gap is filled with room tone |
| Chain on a word range | `studio-next/tests/e-fx-range.test.tsx` | The DAW's own saved chain is applied to the split piece; removing it joins the piece back |
| Saved versus live | `studio-next/src/domain/daw.ts` `DawProjectState` | "As of last save HH:MM" shows when `unsavedChanges` is true |
| Pickup markers as truth | `studio-next/src/state/commands/pickups.ts` (`writeThroughDone`, `reconcilePickupMarkers`) | Marking a pickup done renames its marker; opening Booth or Pickups takes the DAW's markers |

### Spikes (each is a slice; result written to `docs/research/`)

| Spike | Question | Needs |
| --- | --- | --- |
| SND-S1 Roll | Can a roll while recording be one command that keeps the earlier audio as a take in REAPER, and what undo points result? | REAPER on a copy; audio device for real record, else a scripted fake |
| SND-S2 Cut | Is "split at both ends, move middle to a muted Cuts track" one undo block, and does closing up later audio stay correct for other items? | REAPER on a copy |
| SND-S3 Chain on range | Does `TakeFX_AddByName` load a saved `.RfxChain` onto a split piece, and how is it undone? | REAPER on a copy |
| SND-S4 Stack | Can later reads become takes of the first item in one undo block? | REAPER on a copy |
| SND-S5 Undo reach | Can the app trigger the DAW's undo only for its own last block safely? | REAPER on a copy |
| SND-S6 Play position | Is `GetPlayPosition` or `GetPlayPosition2` accurate over the file bridge for the Booth's resume anchor (REAPER spike S4)? | Owner at the audio interface: pending |
| SND-S7 Audacity backups | Can the scripting pipe clone a time range to a backups track and restore it, and what does two minutes cost? | Audacity 3 with `mod-script-pipe`, owner's pass ([ADR 0355](../adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md)) |

### Interfaces and contracts

- Go: `dawport.Result{OK, Changed bool; Message string; UndoSteps int; Refused string; Steps []string}`; role methods for new capabilities return it. Roles: `RangeCutter`, `RangeFXApplier`, `TakeStacker`, `BackupKeeper`, `TakeHider` (or `hide` on `TakeSelector`).
- Wire: `DawCapabilitySupport` gains `destructive`, `mode`; new `DawResult` schema and golden; new `DawProjectState` schema and golden; events `daw_capabilities_changed` (existing) and a project-state event (existing `project_state` poll mapped).
- Bridge commands (new): `hide_takes(run, item_guid, keep_take_guid)`, `roll(run, track_guid, at)`, `delete_range(run, item_guid, start, end, mode, fade_ms)`, `apply_fx_range(run, item_guid, start, end, chain, fade_ms)` (chain name from `list_fx_chains`, never a path), `stack_takes(run, payload_path)`, `unstack_takes(run, payload_path)`; events `TAKES_HIDDEN`, `ROLLED`, `RANGE_CUT`, `RANGE_FX_APPLIED`, `TAKES_STACKED`, `TAKES_UNSTACKED` in `apps/desktop/internal/bridge/wire.go`. Names are proposals until the spikes fix the arguments.
- UI: `DawClient` in `apps/ui/src/ports/daw.ts` (adapters: `hostDawClient`, `mockDawClient` driven by `fixtures/daw.ts`); `useCapability` unchanged, gains the new fields.

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth for the rebuild; an old ADR stays in force for code not yet migrated until the superseding ADR is merged ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0300](../adr/0300-every-daw-is-reached-through-one-port-of-small-role-interfaces-and-callers-ask-a-resolver-what-it-supports.md) to [ADR 0306](../adr/0306-mastering-is-a-provider-port-and-measurement-stays-one-in-process-judge.md) | KEEP / EXTEND | Same port; [ADR 0302](../adr/0302-dawport-roles-exchange-the-bridges-own-types-through-aliases-and-an-asynchronous-role-is-one-method-per-command.md) wire shapes extended (A7) |
| [ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md) | SUPERSEDE (roll) | Roll as one command (A8) after SND-S1 |
| [ADR 0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md), [ADR 0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md) | SUPERSEDE (range part) | FX on a range (A9) after SND-S3 |
| [ADR 0147](../adr/0147-retakes-on-fixed-lanes-are-chosen-by-lane-play-state-and-the-app-never-converts-takes-and-lanes.md) | DISCUSS (DQ-7) | Stacking |
| [ADR 0262](../adr/0262-cleanup-trims-are-found-by-matching-the-measured-file-to-a-live-item-and-applied-as-a-split-and-delete-inside-one-undo-block.md) | DISCUSS (DQ-8) | Cleanup trims |
| [ADR 0660](../adr/0660-audacitys-finding-detail-hides-reapers-take-management-instead-of-disabling-it-through-capabilitygate.md) | SUPERSEDE, DISCUSS (DQ-18) | Capability-driven Audacity takes |
| [ADR 0230](../adr/0230-reaper-commands-built-before-the-verification-pass-are-refused-by-the-host-while-the-experimental-switch-is-off.md), [ADR 0400](../adr/0400-promoting-a-reaper-command-from-experimental-to-supported-is-a-one-line-daw-port-declaration-change.md) | KEEP | Every new command is Experimental first |
| [ADR 0232](../adr/0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md), [ADR 0233](../adr/0233-the-app-may-make-a-take-active-by-guid-in-one-undo-step.md) | EXTEND / KEEP | Arms and active take |
| [ADR 0412](../adr/0412-windows-is-the-only-supported-platform-for-now.md) | KEEP | Windows only |

## Technical Approach

**Architecture.** All new behaviour sits behind `internal/dawport` roles; `internal/bridge` keeps command names ([ADR 0302](../adr/0302-dawport-roles-exchange-the-bridges-own-types-through-aliases-and-an-asynchronous-role-is-one-method-per-command.md)); a new Lua file per feature registered in `FEATURE_FILES` ([ADR 0067](../adr/0067-bridge-commands-are-registered-by-name-and-each-feature-lives-in-its-own-lua-file.md)) (`narration_takes.lua`, `narration_range.lua`); Audacity backups are in `dawport/audacity` with a project-sidecar table (threat-model row: a file the app writes under the project folder); the host never accepts a path or action name from the page for FX (names from the listing only, [ADR 0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md)).

**Test plan.** Harness test first for each command (fake REAPER in `integrations/reaper/tests/fake_reaper.lua`: stale GUID, recording refusal, unknown chain name, one undo block, no spurious undo point), mutation entries; `dawporttest.Run` extended per new role; Go golden tests for `DawResult` and `DawProjectState` (`UPDATE_CONTRACTS=1`); `wireContracts.test.ts` rows; `DawClient` parity suite; scripted REAPER runs recorded in `docs/research/`; owner steps on #510.

**Rollout.** Every command Experimental; promotion is a one-line declaration change after the verification pass ([ADR 0400](../adr/0400-promoting-a-reaper-command-from-experimental-to-supported-is-a-one-line-daw-port-declaration-change.md)). Settings shows each capability with its reason, destructive flag and mode ([Master, Delivery and Settings](studio-next-master-delivery-and-settings.prd.md)).

**ADRs.** A6 (undo scope), A7 (result object and capability fields; amends [ADR 0302](../adr/0302-dawport-roles-exchange-the-bridges-own-types-through-aliases-and-an-asynchronous-role-is-one-method-per-command.md)'s wire shapes only), A8 (roll as one command, range cut and range FX, stack; supersedes the roll part of [ADR 0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md) and the "chain only on tracks" limit of [ADR 0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md) for ranges).

**Trust boundaries.** `docs/architecture/threat-model.md` rows 5 (bridge) and the Audacity row, `SECURITY.md`, `docs/architecture/reaper-bridge.md` commands table and the diagram in `docs/architecture/` that names the moved files; re-read at each Lua slice (CLAUDE.md step 6).

**Risks.** A roll that REAPER cannot make non-destructive without changing the narrator's record preferences (mitigation: refuse with a reason); range edits corrupting later items (mitigation: harness fixtures with several items and mutation entries); Audacity backups growing large (mitigation: retention and a size cap in the settings); the `Challenges_001` rule (work only on copies).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Spikes | SND-S1..S5 scripted, S6 pending hardware, S7 Audacity | pending | all | SN0-1 | 2.5 | - |
| 2 | Result and capability wire | `Result`, `destructive`, `mode`, schemas, goldens, `DawClient` and mock setups | pending | 3 | SN0-1 | 2.0 | - |
| 3 | Catalogue and conformance | New capabilities, roles, `dawporttest` cases, declarations | pending | 2 | 2 | 1.5 | - |
| 4 | Project state and stale | `DawProjectState`, `savedAt`, uniform `stale` refusal, pickup write-through | pending | - | 2 | 1.5 | - |
| 5 | Take commands | `hide_takes`; `set_active_take` result mapping | pending | 6 | 3, S-results | 1.0 | - |
| 6 | Roll and range commands | `roll`, `delete_range`, `apply_fx_range` | pending | 5 | 3, S1..S3 | 2.5 | - |
| 7 | Stacking | `stack_takes`, `unstack_takes` | pending | 6 | 3, S4 | 1.0 | - |
| 8 | Audacity backups | Backups table, restore, capability flips, retention | pending | - | 3, S7 | 1.5 | - |
| 9 | Built-in recorder row | Adapter declaration, capabilities, engine chip | pending | - | 3 | 0.8 | - |
| 10 | Close-out | Docs, threat model, promotion plan | pending | - | all | 0.2 | - |

### Phase Details

- **Phase 1.** Each spike is a script under `integrations/reaper/spikes/` run in an isolated REAPER on a copy of a project, with a note under `docs/research/` stating what was proved and what was not. No product code.
- **Phase 2.** Additive wire change: no `hostAPIVersion` bump unless a field is required; if a binding is added, bump (three places, regenerate `Host.*`).
- **Phase 4.** Pickup write-through uses the existing `import_pickups`, `resolve_pickup` and marker names; this phase adds the app-side state (`pickSync` for writes made while the DAW was away).
- **Phase 6.** The three commands may be separate worker streams in the same Lua file only if `FEATURE_FILES`, `mutations.json` and `wire.go` rows are append-only; otherwise serialise.

### Parallelism Notes

Phase 1 spikes run in parallel with Phase 2. Phases 5 to 8 are independent after Phase 3 and their own spikes; they share `wire.go`, `mutations.json` and the threat model (append-only rows).

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 1 | `integrations/reaper/spikes/`, `docs/research/` | REAPER Automation Follow-Through (old PRD `reaper-automation-follow-through.prd.md`, recoverable from git history) spikes (same runner) |
| 2 | `apps/desktop/internal/dawport/**`, `apps/ui/src/api/{contracts,schemas}/daw.ts`, goldens, `hostAPIVersion` | Every binding PRD (serial bump) |
| 3 | `internal/dawport/{capability,roles}.go`, `dawporttest/` | Lane K only |
| 4 | `narration_project_state.lua`, `bindings_projectstate.go`, pickups bindings | Booth and Pickups slices |
| 5 to 7 | new `integrations/reaper/narration_takes.lua`, `narration_range.lua`, `tests/*_test.lua`, `mutations.json`, `wire.go`, `scripts/release/reaper-files.mjs` | Every Lua-touching PRD |
| 8 | `internal/dawport/audacity/**` | Audacity Integration (old PRD `audacity-integration.prd.md`, recoverable from git history) phases |
| 9 | `internal/dawport/builtin/**` (new), `internal/recording` | Native Recording Suite (old PRD `native-recording-suite.prd.md`, recoverable from git history) |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SND-1a..1e | Spikes S1 to S5 (one slice each) | SN0-1 | yes | Research note committed; script re-runnable |
| SND-1f | Spike S6 play position | SN0-1, owner hardware | yes | Pending on #510; never blocks |
| SND-1g | Spike S7 Audacity backups | SN0-1, owner pass | yes | Research note |
| SND-2 | Result and capability wire | SN0-1 | yes | Goldens, `wireContracts.test.ts`, `DawClient` parity |
| SND-3 | Catalogue and conformance | SND-2 | yes | `dawporttest`, boundary test |
| SND-4 | Project state, stale, pickup write-through | SND-2 | yes | Harness (existing pickups tests extended), goldens |
| SND-5 | `hide_takes` | SND-3 | yes | Harness first, mutation, threat model |
| SND-6a | `roll` | SND-3, SND-1a | yes | Harness first, mutation, REAPER scripted run |
| SND-6b | `delete_range` | SND-3, SND-1b | yes | Same |
| SND-6c | `apply_fx_range` | SND-3, SND-1c | yes | Same |
| SND-7 | Stacking | SND-3, SND-1d | yes | Same |
| SND-8 | Audacity backups | SND-3, SND-1g | yes | Adapter tests with fake pipe; owner pass pending |
| SND-9 | Built-in recorder row | SND-3 | yes | `dawporttest` |
| SND-10 | Close-out | all | no | Docs, threat model dates |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Reuse the port (proposed) | Extend `dawport` | Rebuild to the mock's `DawAdapter` | It already satisfies the interface-segregation and inversion rules |
| Additive wire (proposed) | New optional fields, snake case kept | Rename to camel case | Avoids a `hostAPIVersion` break |
| Hide, never delete (owner) | `hide_takes` mutes | `removeTakes` | Non-destructive editing ruling |
| Spike before command (proposed) | S1..S7 first | Build and verify later | Unverified REAPER and Audacity behaviour |

## Research Summary

Read: the mock's DAW files and tests, the owner's rulings, `capability.go`, the REAPER and Audacity declarations, `reaper-bridge.md` commands, ADRs 0230 to 0246, `daw-integration.md`. Not done: nothing run in REAPER or Audacity; the claim that `PICKUP_DONE:` is already written by Lua is from reading `narration_pickups.lua`, not from a run.

## Visual Spec

No page. Settings rows for capabilities are in [Master, Delivery and Settings](studio-next-master-delivery-and-settings.prd.md); the Mock-states DAW group is `studio-next/src/app/mock-states.tsx`.
