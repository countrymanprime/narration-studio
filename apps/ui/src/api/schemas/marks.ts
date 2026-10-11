import { z } from 'zod';
import { MARK_COLOURS, MARK_STYLES, MARK_TEXT_MAX, MARK_TYPE_NAME_MAX, type Mark, type MarkType, type Marks } from '../contracts/marks';

export const markTypeSchema = z
  .object({
    key: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    name: z.string().min(1).max(MARK_TYPE_NAME_MAX),
    colour: z.enum(MARK_COLOURS),
    style: z.enum(MARK_STYLES),
    asks: z.boolean(),
  })
  .strict() satisfies z.ZodType<MarkType>;

const markMessageSchema = z
  .object({
    who: z.enum(['you', 'author', 'proofer']),
    text: z.string().max(MARK_TEXT_MAX),
    at: z.string(),
  })
  .strict();

export const markSchema = z
  .object({
    id: z.string().min(1),
    chapterId: z.string().min(1),
    paragraphId: z.string().min(1),
    paragraph: z.number().int().nullable(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    quote: z.string(),
    type: z.string().min(1),
    text: z.string().max(MARK_TEXT_MAX),
    status: z.enum(['open', 'resolved']).optional(),
    thread: z.array(markMessageSchema),
    createdAt: z.string(),
    stale: z.boolean(),
    staleReason: z.enum(['paragraph_missing', 'range_out_of_range', 'text_changed']).optional(),
  })
  .strict()
  .refine((mark) => mark.start <= mark.end, 'a mark starts before it ends') satisfies z.ZodType<Mark>;

export const marksSchema = z
  .object({
    types: z.array(markTypeSchema).min(1),
    marks: z.array(markSchema),
  })
  .strict() satisfies z.ZodType<Marks>;
