import { z } from 'zod';
import type { WordFx, WordFxChange, WordFxList } from '../contracts/wordFx';

/** A chain id or name as the DAW lists it: never blank, no control character, backslash or drive colon, and no empty, `.`
 * or `..` part between slashes (apps/desktop/internal/editlog/wordfx.go listName). */
const listName = z
  .string()
  .refine((name) => name.trim() !== '' && !/[\\:\p{Cc}]/u.test(name) && name.split('/').every((part) => part !== '' && part !== '.' && part !== '..'), {
    message: 'a chain is named as the DAW lists it, never by a path',
  });

export const wordFxSchema = z
  .object({
    id: z.string().min(1),
    chapterId: z.string(),
    pid: z.string().min(1),
    takeId: z.string().optional(),
    keys: z.array(z.string().regex(/^[^:]+:(0|[1-9]\d*)$/)).min(1),
    words: z.array(z.string().min(1)).min(1),
    text: z.string().min(1),
    a: z.number().nonnegative(),
    b: z.number().positive(),
    off0: z.number(),
    off1: z.number(),
    chainId: listName,
    chainName: listName,
    source: z.string().min(1),
    fadeMs: z.number().int().nonnegative().max(1000),
    daw: z.string().min(1),
    guid: z.string().min(1),
    backupId: z.string().optional(),
    at: z.string(),
    paragraph: z.number().int().nullable(),
    stale: z.boolean(),
    staleReason: z.enum(['paragraph_missing', 'word_missing', 'text_changed']).optional(),
  })
  .strict()
  .refine((fx) => fx.b > fx.a && fx.words.length === fx.keys.length, {
    message: 'an effect ends after it starts and has a text for each key',
  }) satisfies z.ZodType<WordFx>;

export const wordFxListSchema = z
  .object({
    chapterId: z.string(),
    effects: z.array(wordFxSchema),
  })
  .strict() satisfies z.ZodType<WordFxList>;

export const wordFxChangeSchema = wordFxListSchema
  .extend({ changed: z.array(z.string()), over: z.array(z.string()) })
  .strict() satisfies z.ZodType<WordFxChange>;
