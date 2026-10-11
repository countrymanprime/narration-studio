// The golden payloads of the Script page's marks (apps/desktop/bindings_marks.go).
import type { z } from 'zod';
import { markSchema, marksSchema } from '../schemas/marks';

export const marksGoldens: Record<string, z.ZodType> = {
  'marks-add.json': markSchema,
  'marks-list.json': marksSchema,
  'marks-remove.json': marksSchema,
  'marks-types.json': marksSchema,
};
