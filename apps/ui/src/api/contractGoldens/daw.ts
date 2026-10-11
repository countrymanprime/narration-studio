// The DAW port's golden files: the capability payload (written by apps/desktop/bindings_daw_test.go), the transport
// (bindings_daw_transport_test.go), the project state (bindings_daw_projectstate_test.go) and the call result (internal/dawport/result_test.go), all with UPDATE_CONTRACTS=1. Which schema owns each file in
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
};
