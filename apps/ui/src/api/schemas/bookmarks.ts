import { z } from 'zod';
import { BOOKMARK_LABEL_MAX, BOOKMARK_NOTE_MAX, type Bookmark } from '../contracts/bookmarks';

export const bookmarkSchema = z
  .object({
    id: z.string().min(1),
    chapterId: z.string().min(1),
    paragraphId: z.string().min(1),
    paragraph: z.number().int().nullable(),
    offset: z.number().int().nonnegative(),
    label: z.string().max(BOOKMARK_LABEL_MAX),
    note: z.string().max(BOOKMARK_NOTE_MAX),
    createdAt: z.string(),
    stale: z.boolean(),
    staleReason: z.enum(['paragraph_missing', 'offset_out_of_range']).optional(),
  })
  .strict() satisfies z.ZodType<Bookmark>;

export const bookmarksSchema = z.array(bookmarkSchema) satisfies z.ZodType<Bookmark[]>;
