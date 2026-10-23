// The golden payloads for item gain (apps/desktop/bindings_cleanup.go).
import type { z } from 'zod';
import { levelMatchApplyResultSchema, levelMatchPreviewResultSchema } from '../schemas/cleanup';

export const cleanupGoldens: Record<string, z.ZodType> = {
  'level-match-preview.json': levelMatchPreviewResultSchema,
  'level-match-apply.json': levelMatchApplyResultSchema,
};
