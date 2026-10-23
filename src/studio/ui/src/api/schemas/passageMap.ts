import { z } from 'zod';
import { PASSAGE_MAP_MAX_ID, PASSAGE_MAP_MAX_SECONDS, type PassageMark } from '../contracts/passageMap';

const id = z.string().min(1);
const word = z.number().int().nonnegative();
const place = z.object({ pid: id.max(PASSAGE_MAP_MAX_ID), word }).strict();

export const passageMarkSchema = z
  .object({
    id,
    run: id,
    chapterId: id.max(PASSAGE_MAP_MAX_ID),
    pid: id.max(PASSAGE_MAP_MAX_ID),
    word,
    sec: z.number().nonnegative().max(PASSAGE_MAP_MAX_SECONDS),
    kind: z.enum(['start', 'roll', 'stop']),
    prev: place.optional(),
    itemGuid: z.string().max(PASSAGE_MAP_MAX_ID),
    takeGuid: z.string().max(PASSAGE_MAP_MAX_ID),
    stale: z.boolean(),
    staleReason: z.enum(['paragraph_missing', 'word_out_of_range']).optional(),
  })
  .strict() satisfies z.ZodType<PassageMark>;

/** What PassageMapRecordRun and PassageMapList answer: a list of marks. */
export const passageMapSchema = z.array(passageMarkSchema) satisfies z.ZodType<PassageMark[]>;
