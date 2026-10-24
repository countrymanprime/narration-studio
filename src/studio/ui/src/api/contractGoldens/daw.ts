// The DAW port's golden files: the capability payload (written by src/studio/desktop/bindings_daw_test.go), the transport
// (bindings_daw_transport_test.go), the project state (bindings_daw_projectstate_test.go), the hidden takes (bindings_workspace_hide_test.go), the roll (bindings_daw_roll_test.go), the range cut (bindings_daw_range_test.go), the chain on a range (bindings_daw_fx_range_test.go), the stack (bindings_daw_stack_test.go), the backups bindings (bindings_daw_backups_test.go), the file bindings (bindings_daw_files_test.go), the Audacity backups table (internal/dawport/audacity/backups_contract_test.go) and the call result (internal/dawport/result_test.go), all with UPDATE_CONTRACTS=1. Which schema owns each file in
// tests/fixtures/contracts/ (see index.ts).
import type { z } from 'zod';
import {
  audacityLinkSchema,
  dawBackupsFileSchema,
  dawCapabilitiesSchema,
  dawChoiceSchema,
  dawFxRangeCompareSchema,
  dawFxRangeSettingsSchema,
  dawLastActionSchema,
  dawMetersSchema,
  dawMonitorLevelSchema,
  dawPunchPrerollSchema,
  dawPlaceSchema,
  dawPositionSchema,
  dawProjectStateSchema,
  dawResultSchema,
  dawTransportSchema,
} from '../schemas/daw';

export const dawGoldens: Record<string, z.ZodType> = {
  // AudacityLink (bindings_audacity_link_test.go): the link state at each point on the way to a working link.
  'audacity-link-answering-linked.json': audacityLinkSchema,
  'audacity-link-not-running.json': audacityLinkSchema,
  'audacity-link-first-start.json': audacityLinkSchema,
  'audacity-link-dialog.json': audacityLinkSchema,
  'audacity-link-not-chosen.json': audacityLinkSchema,
  'daw-capabilities-standalone.json': dawCapabilitiesSchema,
  'daw-capabilities-reaper.json': dawCapabilitiesSchema,
  'daw-capabilities-audacity.json': dawCapabilitiesSchema,
  'daw-capabilities-builtin.json': dawCapabilitiesSchema,
  'daw-choice-default.json': dawChoiceSchema,
  'daw-choice-found.json': dawChoiceSchema,
  'daw-choice-linked.json': dawChoiceSchema,
  'daw-choice-starting.json': dawChoiceSchema,
  'daw-transport-stopped.json': dawTransportSchema,
  'daw-transport-playing.json': dawTransportSchema,
  'daw-transport-recording.json': dawTransportSchema,
  'daw-transport-builtin-recording.json': dawTransportSchema,
  'daw-project-state-idle.json': dawProjectStateSchema,
  'daw-project-state-saved.json': dawProjectStateSchema,
  'daw-project-state-unsaved.json': dawProjectStateSchema,
  'daw-project-state-recording.json': dawProjectStateSchema,
  'daw-project-state-builtin-recording.json': dawProjectStateSchema,
  'daw-result-ok.json': dawResultSchema,
  'daw-result-refused-stale.json': dawResultSchema,
  'daw-result-multi-step.json': dawResultSchema,
  // WorkspaceHideTakes (bindings_workspace_hide_test.go): other takes muted, nothing to mute, and a capability refusal.
  'daw-hide-takes-done.json': dawResultSchema,
  'daw-hide-takes-nothing.json': dawResultSchema,
  'daw-hide-takes-refused.json': dawResultSchema,
  // DawRoll (bindings_daw_roll_test.go): rolled with no undo point of its own, refused until confirmed where punch is destructive, a stale track.
  'daw-roll-done.json': dawResultSchema,
  'daw-roll-refused-confirm.json': dawResultSchema,
  'daw-roll-refused-stale.json': dawResultSchema,
  // DawDeleteRange (bindings_daw_range_test.go): a close cut and a gap cut (one undo step each), a stale token range, the capability's refusal.
  'daw-delete-range-done.json': dawResultSchema,
  'daw-delete-range-gap.json': dawResultSchema,
  'daw-delete-range-refused-stale.json': dawResultSchema,
  'daw-delete-range-refused-capability.json': dawResultSchema,
  'daw-delete-range-pad-room-tone.json': dawResultSchema,
  'daw-delete-range-pad-refused-close.json': dawResultSchema,
  'daw-delete-range-pad-refused-no-room-tone.json': dawResultSchema,
  // DawTrimRange (bindings_daw_range_test.go, SN-E112): a gap shortened in REAPER (one undo step), a gap no longer inside its item, the
  // capability's refusal.
  'daw-trim-range-done.json': dawResultSchema,
  'daw-trim-range-refused-stale.json': dawResultSchema,
  'daw-trim-range-refused-capability.json': dawResultSchema,
  // DawApplyFxToRange and DawRemoveFxFromRange (bindings_daw_fx_range_test.go): a chain put on one word and taken off (one undo step each),
  // and the capability's refusal.
  'daw-apply-fx-range-done.json': dawResultSchema,
  'daw-apply-fx-range-refused.json': dawResultSchema,
  'daw-remove-fx-range-done.json': dawResultSchema,
  // DawFxRangeParams, DawSetFxRangeParam and DawBypassFxRange (bindings_daw_fx_range_test.go, SN-E104): a chain's settings read, the
  // capability's refusal of a read, a setting changed and a chain bypassed (one undo step each), and a chain no longer on the words.
  'daw-fx-range-params-done.json': dawFxRangeSettingsSchema,
  'daw-fx-range-params-refused.json': dawFxRangeSettingsSchema,
  'daw-fx-range-params-set-done.json': dawResultSchema,
  'daw-fx-range-bypass-done.json': dawResultSchema,
  'daw-fx-range-bypass-refused-stale.json': dawResultSchema,
  // DawCompareFxRange and DawStopFxCompare (bindings_daw_fx_compare_test.go, SN-E113): a Compare started (no undo step, each pass's
  // length), a chain no longer on the words, and a Compare stopped.
  'daw-fx-range-compare-done.json': dawFxRangeCompareSchema,
  'daw-fx-range-compare-refused-stale.json': dawFxRangeCompareSchema,
  'daw-fx-range-compare-stopped.json': dawResultSchema,
  // DawStackTakes and DawUnstackTakes (bindings_daw_stack_test.go): a stack and an un-stack in REAPER (one undo step each), a stack in a
  // DAW that makes it in steps, and REAPER's stale refusal.
  'daw-stack-done.json': dawResultSchema,
  'daw-stack-steps.json': dawResultSchema,
  'daw-unstack-done.json': dawResultSchema,
  'daw-stack-refused-stale.json': dawResultSchema,
  // DawSplitTake (bindings_daw_split_test.go): a cut in REAPER (one undo step), REAPER's stale refusal and the takes capability's refusal.
  'daw-split-take-done.json': dawResultSchema,
  'daw-split-take-refused-stale.json': dawResultSchema,
  'daw-split-take-refused-capability.json': dawResultSchema,
  // DawReduceRangeGain (bindings_daw_reduce_range_gain_test.go): two stretches lowered in REAPER (one undo step), REAPER's stale refusal
  // and the range_gain capability's refusal.
  'daw-reduce-range-gain-done.json': dawResultSchema,
  'daw-reduce-range-gain-refused-stale.json': dawResultSchema,
  'daw-reduce-range-gain-refused-capability.json': dawResultSchema,
  // DawRepairClick (bindings_daw_repair_click_test.go): two clicks repaired in REAPER (one undo step), REAPER's stale refusal and the
  // click_repair capability's refusal.
  'daw-repair-click-done.json': dawResultSchema,
  'daw-repair-click-refused-stale.json': dawResultSchema,
  'daw-repair-click-refused-capability.json': dawResultSchema,
  // DawLastAction and DawUndoLast (bindings_daw_undo_last_test.go): a cut on top and a capability refused; a cut undone in REAPER, two of
  // three, REAPER's refusal when its last action is not the cut, and the undo_last capability's refusal.
  'daw-last-action-this.json': dawLastActionSchema,
  'daw-last-action-unknown.json': dawLastActionSchema,
  'daw-undo-last-done.json': dawResultSchema,
  'daw-undo-last-partial.json': dawResultSchema,
  'daw-undo-last-refused-not-last.json': dawResultSchema,
  'daw-undo-last-refused-capability.json': dawResultSchema,
  // A take undone in REAPER (record_take): one take however many points it left.
  'daw-undo-last-take-done.json': dawResultSchema,
  // DawPunchPreroll (bindings_daw_preroll_test.go): REAPER's pre-roll on record at 1.5 measures, and the punch_preroll capability's refusal.
  'daw-punch-preroll-held.json': dawPunchPrerollSchema,
  'daw-punch-preroll-refused.json': dawPunchPrerollSchema,
  // DawMonitorLevel and DawSetMonitorLevel (bindings_daw_levels_test.go): the level the DAW holds, and the monitor_level capability's refusal.
  'daw-monitor-level-ok.json': dawMonitorLevelSchema,
  'daw-monitor-level-refused.json': dawMonitorLevelSchema,
  // DawMeters (bindings_daw_meters_test.go): an armed track and the output, no armed track, and the daw_meters capability's refusal.
  'daw-meters-armed.json': dawMetersSchema,
  'daw-meters-unarmed.json': dawMetersSchema,
  'daw-meters-refused.json': dawMetersSchema,
  // DawPlace and DawGoToChapter (bindings_daw_place_test.go): where the narrator is, the follow_position capability's refusal, and a move to a chapter.
  'daw-place-ok.json': dawPlaceSchema,
  'daw-place-refused.json': dawPlaceSchema,
  'daw-go-to-chapter-done.json': dawResultSchema,
  'daw-go-to-chapter-refused.json': dawResultSchema,
  // DawTransportSync and daw_position_changed (internal/transportsync): a done and a refused answer, and the position event playing, recording and
  // stopped with another project open.
  'daw-transport-sync-ok.json': dawResultSchema,
  'daw-transport-sync-refused.json': dawResultSchema,
  'daw-position-playing.json': dawPositionSchema,
  'daw-position-recording.json': dawPositionSchema,
  'daw-position-stopped-other-project.json': dawPositionSchema,
  // <app>/backups.json, the file the host reads back (backups_contract_test.go): an empty table and one with two rows.
  'daw-backups-empty.json': dawBackupsFileSchema,
  'daw-backups-two.json': dawBackupsFileSchema,
  // DawBackupAround, DawRestoreBackup and DawBackups (bindings_daw_backups_test.go): a backup and a restore in Audacity, REAPER's
  // refusal, and the list, newest first.
  'daw-backup-done.json': dawResultSchema,
  'daw-backup-restored.json': dawResultSchema,
  'daw-backup-refused.json': dawResultSchema,
  'daw-backups-list.json': dawBackupsFileSchema,
  // DawPreviewFileRange, DawStopFilePreview and DawRevealFile (bindings_daw_files_test.go): a stretch playing, a preview stopped, a file
  // shown, and the host's refusals of a path the narrator did not pick and of a stretch over 60 s.
  'daw-file-preview-playing.json': dawResultSchema,
  'daw-file-preview-stopped.json': dawResultSchema,
  'daw-file-revealed.json': dawResultSchema,
  // MasterPlayQuietest and MasterOpenInDaw (bindings_master_files_test.go): the quietest 5 s playing, a file shown, and the host's
  // refusals of a file not in the last measurement (code stale) and of one with no quietest window.
  'master-file-play-quietest.json': dawResultSchema,
  'master-file-opened.json': dawResultSchema,
  'master-file-refused-not-in-run.json': dawResultSchema,
  'master-file-refused-no-quiet-stretch.json': dawResultSchema,
  'daw-file-refused-not-picked.json': dawResultSchema,
  'daw-file-refused-bad-stretch.json': dawResultSchema,
};
