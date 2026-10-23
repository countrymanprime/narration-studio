import { z } from 'zod';
import type { AcceptedWord, AcceptedWords, AcceptedWordsChange } from '../contracts/editLog';

export const acceptedWordSchema = z
  .object({
    key: z.string().regex(/^[^:]+:(0|[1-9]\d*)$/),
    paragraphId: z.string().min(1),
    ordinal: z.number().int().nonnegative(),
    text: z.string().min(1),
    acceptedAt: z.string(),
    paragraph: z.number().int().nullable(),
    stale: z.boolean(),
    staleReason: z.enum(['paragraph_missing', 'word_missing', 'text_changed']).optional(),
  })
  .strict() satisfies z.ZodType<AcceptedWord>;

export const acceptedWordsSchema = z
  .object({
    chapterId: z.string(),
    words: z.array(acceptedWordSchema),
  })
  .strict() satisfies z.ZodType<AcceptedWords>;

export const acceptedWordsChangeSchema = acceptedWordsSchema.extend({ changed: z.array(z.string()) }).strict() satisfies z.ZodType<AcceptedWordsChange>;
