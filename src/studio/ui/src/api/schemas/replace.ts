import { z } from 'zod';
import type {
  Narrator,
  NarratorFile,
  Narrators,
  NarratorsChange,
  ReplaceAnswer,
  ReplaceFileAnswer,
  ReplaceFilePeaks,
  ReplacePlan,
  Replacement,
  Replacements,
  ReplacementsChange,
} from '../contracts/replace';
import { REPLACE_MAX_GAIN_DB } from '../contracts/replace';
import { listFromNull, optionalFromNull } from './base';
import { dawResultSchema } from './daw';
import { peaksSchema } from './workspace';

// Replace audio's payloads: src/studio/desktop/bindings_replace.go and internal/editlog (narrators.go, replacements.go).

const KEY = /^[^:]+:(0|[1-9]\d*)$/;

const narratorFileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    size: z.number().int().positive(),
    length: z.number().positive(),
    daw: z.string().min(1),
    addedAt: z.string(),
    state: z.enum(['ok', 'missing', 'changed']),
  })
  .strict() satisfies z.ZodType<NarratorFile>;

const narratorSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(80),
    addedAt: z.string(),
    files: listFromNull(narratorFileSchema),
  })
  .strict() satisfies z.ZodType<Narrator>;

export const narratorsSchema = z.object({ narrators: listFromNull(narratorSchema) }).strict() satisfies z.ZodType<Narrators>;

export const narratorsChangeSchema = z
  .object({ narrators: listFromNull(narratorSchema), changed: listFromNull(z.string()) })
  .strict() satisfies z.ZodType<NarratorsChange>;

export const replaceFileAnswerSchema = z
  .object({ result: dawResultSchema, fileId: z.string(), narrators: narratorsSchema })
  .strict()
  .refine((answer) => answer.fileId === '' || answer.result.ok, 'a new file comes only with a change the DAW made') satisfies z.ZodType<ReplaceFileAnswer>;

const gainSchema = z.number().min(-REPLACE_MAX_GAIN_DB).max(REPLACE_MAX_GAIN_DB);

export const replacePlanSchema = z
  .object({
    result: dawResultSchema,
    narrator: z.string(),
    words: z.number().int().nonnegative(),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    sourceStart: z.number().nonnegative(),
    sourceEnd: z.number().nonnegative(),
    shift: z.number(),
    measuredLufs: z.number().nullable(),
    targetLufs: z.number().min(-70).max(0),
    gainDb: gainSchema,
    clamped: z.boolean(),
    loudnessNote: z.string(),
  })
  .strict()
  .refine((plan) => !plan.result.ok || (plan.end > plan.start && plan.sourceEnd > plan.sourceStart && plan.words > 0), {
    message: 'a plan the host made has words and a stretch that each end after they start',
  })
  .refine(
    (plan) => plan.measuredLufs !== null || plan.gainDb === 0,
    'a level change is proposed only from a measured loudness',
  ) satisfies z.ZodType<ReplacePlan>;

const replacementSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    chapterId: z.string().min(1),
    keys: z.array(z.string().regex(KEY)).min(1),
    words: z.array(z.string().min(1)),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    narratorId: z.string().min(1),
    narratorName: z.string().min(1).max(80),
    fileId: z.string().min(1),
    sourceStart: z.number().nonnegative(),
    sourceEnd: z.number().positive(),
    gainDb: gainSchema,
    measuredLufs: z.number().nullable(),
    targetLufs: z.number().min(-70).max(0),
    fadeMs: z.number().int().min(0).max(500),
    shift: z.number(),
    daw: z.string().min(1),
    undoSteps: z.number().int().nonnegative(),
    at: z.string(),
    restoredAt: z.string().nullable(),
    active: z.boolean(),
    paragraph: z.number().int().nullable(),
    stale: z.boolean(),
    staleReason: optionalFromNull(z.enum(['paragraph_missing', 'word_missing', 'text_changed'])),
  })
  .strict()
  .refine((r) => r.end > r.start && r.sourceEnd > r.sourceStart && r.words.length === r.keys.length && r.active === (r.restoredAt === null), {
    message: 'a replacement ends after it starts, has a text for each key, and is active exactly while it was not put back',
  }) satisfies z.ZodType<Replacement>;

export const replacementsSchema = z.object({ chapterId: z.string(), replacements: listFromNull(replacementSchema) }).strict() satisfies z.ZodType<Replacements>;

export const replacementsChangeSchema = z
  .object({ chapterId: z.string(), replacements: listFromNull(replacementSchema), changed: listFromNull(z.string()) })
  .strict() satisfies z.ZodType<ReplacementsChange>;

export const replaceAnswerSchema = z
  .object({ result: dawResultSchema, replacementId: z.string(), replacements: replacementsSchema })
  .strict() satisfies z.ZodType<ReplaceAnswer>;

export const replaceFilePeaksSchema = z
  .object({
    fileId: z.string().min(1),
    length: z.number().nonnegative(),
    peaks: optionalFromNull(peaksSchema),
    reason: optionalFromNull(z.string()),
  })
  .strict()
  .refine(
    (answer) => (answer.peaks === undefined) !== (answer.reason === undefined),
    'peaks, or the reason there are none',
  ) satisfies z.ZodType<ReplaceFilePeaks>;
