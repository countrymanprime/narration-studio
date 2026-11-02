import { z } from 'zod';
import { PREP_STATES, type ScriptPrep, type ScriptPrepChapter } from '../contracts/scriptPrep';

export const scriptPrepChapterSchema = z
  .object({
    chapterId: z.string().min(1),
    state: z.enum(PREP_STATES),
  })
  .strict() satisfies z.ZodType<ScriptPrepChapter>;

export const scriptPrepSchema = z
  .object({
    chapters: z.array(scriptPrepChapterSchema),
  })
  .strict() satisfies z.ZodType<ScriptPrep>;
