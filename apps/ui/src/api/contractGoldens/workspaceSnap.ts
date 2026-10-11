// The golden payloads for WorkspaceSnap (ADR 0855): which schema owns each file in tests/fixtures/contracts/ (see index.ts).
import type { z } from 'zod';
import { workspaceSnapResultSchema } from '../schemas/workspaceSnap';

export const workspaceSnapGoldens: Record<string, z.ZodType> = {
  // A cut moved to the nearest crossing of a real sine, and a refusal (an item the project no longer has).
  'workspace-snap-moved.json': workspaceSnapResultSchema,
  'workspace-snap-refused.json': workspaceSnapResultSchema,
};
