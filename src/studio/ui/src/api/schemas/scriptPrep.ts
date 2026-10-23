import { z } from 'zod';
import {
  PREP_STATES,
  SCRIPT_SAY_MAX,
  SCRIPT_WORD_MAX,
  WORD_STATUSES,
  type ScriptPrep,
  type ScriptPrepChapter,
  type ScriptWord,
  type ScriptWordFlag,
} from '../contracts/scriptPrep';

export const scriptPrepChapterSchema = z
  .object({
    chapterId: z.string().min(1),
    state: z.enum(PREP_STATES),
  })
  .strict() satisfies z.ZodType<ScriptPrepChapter>;

export const scriptWordFlagSchema = z
  .object({
    id: z.string().min(1),
    chapterId: z.string().min(1),
    paragraphId: z.string().min(1),
    paragraph: z.number().int().nullable(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    quote: z.string().min(1).max(SCRIPT_WORD_MAX),
    createdAt: z.string(),
    stale: z.boolean(),
    staleReason: z.enum(['paragraph_missing', 'range_out_of_range', 'text_changed']).optional(),
  })
  .strict()
  .refine((flag) => flag.start < flag.end, 'a flag starts before it ends') satisfies z.ZodType<ScriptWordFlag>;

export const scriptWordSchema = z
  .object({
    word: z.string().min(1).max(SCRIPT_WORD_MAX),
    say: z.string().max(SCRIPT_SAY_MAX),
    source: z.string(),
    status: z.enum(WORD_STATUSES),
    flags: z.array(scriptWordFlagSchema),
  })
  .strict()
  .refine((word) => (word.status === 'not_flagged') === (word.flags.length === 0), 'a word is not flagged exactly when it has no flags')
  .refine((word) => (word.status === 'set') === (word.say !== ''), 'a word is set exactly when it has a say-value')
  .refine((word) => (word.say === '') === (word.source === ''), 'a say-value carries its source') satisfies z.ZodType<ScriptWord>;

export const scriptPrepSchema = z
  .object({
    chapters: z.array(scriptPrepChapterSchema),
    words: z.array(scriptWordSchema),
  })
  .strict() satisfies z.ZodType<ScriptPrep>;
