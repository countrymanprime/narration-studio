// The DAW port's golden files: the capability payload (written by apps/desktop/bindings_daw_test.go), the transport
// (bindings_daw_transport_test.go), the project state (bindings_daw_projectstate_test.go), the hidden takes (bindings_workspace_hide_test.go), the roll (bindings_daw_roll_test.go), the range cut (bindings_daw_range_test.go), the chain on a range (bindings_daw_fx_range_test.go) and the call result (internal/dawport/result_test.go), all with UPDATE_CONTRACTS=1. Which schema owns each file in
// tests/fixtures/contracts/ (see index.ts).
import type { z } from 'zod';
import { dawCapabilitiesSchema, dawProjectStateSchema, dawResultSchema, dawTransportSchema } from '../schemas/daw';

export const dawGoldens: Record<string, z.ZodType> = {
  'daw-capabilities-standalone.json': dawCapabilitiesSchema,
  'daw-capabilities-reaper.json': dawCapabilitiesSchema,
  'daw-capabilities-audacity.json': dawCapabilitiesSchema,
  'daw-capabilities-builtin.json': dawCapabilitiesSchema,
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
  // DawApplyFxToRange and DawRemoveFxFromRange (bindings_daw_fx_range_test.go): a chain put on one word and taken off (one undo step each),
  // and the capability's refusal.
  'daw-apply-fx-range-done.json': dawResultSchema,
  'daw-apply-fx-range-refused.json': dawResultSchema,
  'daw-remove-fx-range-done.json': dawResultSchema,
};
