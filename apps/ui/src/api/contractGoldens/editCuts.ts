// The golden payloads of the narrator's cuts (apps/desktop/bindings_editlog_cuts.go).
import type { z } from 'zod';
import { editCutsChangeSchema, editCutsSchema } from '../schemas/editCuts';

export const editCutsGoldens: Record<string, z.ZodType> = {
  'edit-cuts-list.json': editCutsSchema,
  'edit-cuts-record.json': editCutsChangeSchema,
  'edit-cuts-record-wordless.json': editCutsChangeSchema,
  'edit-cuts-remove.json': editCutsChangeSchema,
};
