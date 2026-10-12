import { z } from 'zod';
import type { EditCut, EditCuts, EditCutsChange } from '../contracts/editCuts';

export const editCutSchema = z
  .object({
    id: z.string().min(1),
    chapterId: z.string(),
    pid: z.string(),
    takeId: z.string().optional(),
    keys: z.array(z.string().regex(/^[^:]+:(0|[1-9]\d*)$/)),
    words: z.array(z.string().min(1)),
    text: z.string().min(1),
    a: z.number().nonnegative(),
    b: z.number().positive(),
    off0: z.number(),
    off1: z.number(),
    mode: z.enum(['close', 'gap']),
    fadeMs: z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(25)]),
    daw: z.string().min(1),
    guid: z.string().min(1),
    undoSteps: z.number().int().nonnegative(),
    backupId: z.string().optional(),
    at: z.string(),
    paragraph: z.number().int().nullable(),
    stale: z.boolean(),
    staleReason: z.enum(['paragraph_missing', 'word_missing', 'text_changed']).optional(),
  })
  .strict()
  .refine((cut) => cut.b > cut.a && cut.words.length === cut.keys.length && (cut.pid === '') === (cut.keys.length === 0), {
    message: 'a cut ends after it starts, has a text for each key, and names a paragraph exactly when it names words',
  }) satisfies z.ZodType<EditCut>;

export const editCutsSchema = z
  .object({
    chapterId: z.string(),
    cuts: z.array(editCutSchema),
  })
  .strict() satisfies z.ZodType<EditCuts>;

export const editCutsChangeSchema = editCutsSchema.extend({ changed: z.array(z.string()) }).strict() satisfies z.ZodType<EditCutsChange>;
