import { z } from 'zod';
import type { WorkspaceSnapResult } from '../contracts/workspaceSnap';

// WorkspaceSnap's answer (apps/desktop/bindings_workspace_snap.go). Strict: a key the host never sends is drift.
const base = {
  chapterId: z.string(),
  itemGuid: z.string(),
  sourceTime: z.number().nonnegative(),
  time: z.number().nonnegative(),
  // 2 ms, and the rounding of a frame back to seconds.
  moved: z
    .number()
    .min(-0.002 - 1e-9)
    .max(0.002 + 1e-9),
};

export const workspaceSnapResultSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ ...base, outcome: z.literal('snapped') }),
  z.strictObject({
    ...base,
    outcome: z.literal('refused'),
    moved: z.literal(0),
    reason: z.enum(['no_track', 'stale', 'no_audio', 'silent', 'no_crossing']),
    message: z.string().min(1),
  }),
]) satisfies z.ZodType<WorkspaceSnapResult>;
