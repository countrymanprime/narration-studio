// The DAW port's golden files: the capability payload (written by apps/desktop/bindings_daw_test.go), the transport
// (bindings_daw_transport_test.go), the project state (bindings_daw_projectstate_test.go), the hidden takes (bindings_workspace_hide_test.go), the roll (bindings_daw_roll_test.go), the range cut (bindings_daw_range_test.go), the chain on a range (bindings_daw_fx_range_test.go), the stack (bindings_daw_stack_test.go), the backups bindings (bindings_daw_backups_test.go), the file bindings (bindings_daw_files_test.go), the Audacity backups table (internal/dawport/audacity/backups_contract_test.go) and the call result (internal/dawport/result_test.go), all with UPDATE_CONTRACTS=1. Which schema owns each file in
// tests/fixtures/contracts/ (see index.ts).
import type { z } from 'zod';
import {
  dawBackupsFileSchema,
  dawCapabilitiesSchema,
  dawChoiceSchema,
  dawFxRangeCompareSchema,
  dawFxRangeSettingsSchema,
  dawProjectStateSchema,
  dawResultSchema,
  dawTransportSchema,
} from '../schemas/daw';

export const dawGoldens: Record<string, z.ZodType> = {
  'daw-capabilities-standalone.json': dawCapabilitiesSchema,
  'daw-capabilities-reaper.json': dawCapabilitiesSchema,
  'daw-capabilities-audacity.json': dawCapabilitiesSchema,
  'daw-capabilities-builtin.json': dawCapabilitiesSchema,
  'daw-choice-default.json': dawChoiceSchema,
  'daw-choice-found.json': dawChoiceSchema,
  'daw-choice-linked.json': dawChoiceSchema,
  'daw-transport-stopped.json': dawTransportSchema,
  'daw-transport-playing.json': dawTransportSchema,
  'daw-transport-recording.json': dawTransportSchema,
  'daw-project-state-idle.json': dawProjectStateSchema,
  'daw-project-state-saved.json': dawProjectStateSchema,
  'daw-project-state-unsaved.json': dawProjectStateSchema,
  'daw-project-state-recording.json': dawProjectStateSchema,
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
  // narration-utils/backups.json, the file the host reads back (backups_contract_test.go): an empty table and one with two rows.
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
