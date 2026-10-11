// The golden payloads of the narrator's Editing records (apps/desktop/bindings_editlog.go).
import type { z } from 'zod';
import { acceptedWordsChangeSchema, acceptedWordsSchema } from '../schemas/editLog';

export const editLogGoldens: Record<string, z.ZodType> = {
  'edit-accepted-list-empty.json': acceptedWordsSchema,
  'edit-accepted-list.json': acceptedWordsSchema,
  'edit-accepted-accept.json': acceptedWordsChangeSchema,
  'edit-accepted-unaccept.json': acceptedWordsChangeSchema,
};
