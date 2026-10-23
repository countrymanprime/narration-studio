// The golden payloads of the narrator's word effects (apps/desktop/bindings_editlog_wordfx.go).
import type { z } from 'zod';
import { wordFxChangeSchema, wordFxListSchema } from '../schemas/wordFx';

export const wordFxGoldens: Record<string, z.ZodType> = {
  'edit-wordfx-list.json': wordFxListSchema,
  'edit-wordfx-record.json': wordFxChangeSchema,
  'edit-wordfx-remove.json': wordFxChangeSchema,
  'edit-wordfx-bypass.json': wordFxChangeSchema,
};
