// The golden payloads of the Script page's prep states and flagged words (apps/desktop/bindings_scriptprep.go).
import type { z } from 'zod';
import { scriptPrepChapterSchema, scriptPrepSchema, scriptWordSchema } from '../schemas/scriptPrep';

export const scriptPrepGoldens: Record<string, z.ZodType> = {
  'script-prep-list.json': scriptPrepSchema,
  'script-prep-chapter.json': scriptPrepChapterSchema,
  'script-prep-word.json': scriptWordSchema,
};
