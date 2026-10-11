import { z } from 'zod';
import type { TakeEvidence, TakeEvidenceMeasure, TakeEvidenceResult, TakeFigure } from '../contracts/takeEvidence';

// A figure is a value or a reason, never both and never neither.
export const takeFigureSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.number() }).strict(),
  z.object({ ok: z.literal(false), reason: z.string().min(1) }).strict(),
]) satisfies z.ZodType<TakeFigure>;

const takeEvidenceMeasureSchema = z
  .object({ pause: takeFigureSchema, rms: takeFigureSchema, nf: takeFigureSchema, clarity: takeFigureSchema, breaths: takeFigureSchema })
  .strict() satisfies z.ZodType<TakeEvidenceMeasure>;

const takeEvidenceSchema = z
  .object({ id: z.string().min(1), matched: takeFigureSchema, measure: takeEvidenceMeasureSchema, via: z.enum(['map', 'aligned']) })
  .strict() satisfies z.ZodType<TakeEvidence>;

export const takeEvidenceResultSchema = z
  .object({
    chapterId: z.string(),
    firstToken: z.number().int().nonnegative(),
    lastToken: z.number().int().nonnegative(),
    firstParagraph: z.number().int().nonnegative(),
    lastParagraph: z.number().int().nonnegative(),
    message: z.string().optional(),
    takes: z.array(takeEvidenceSchema),
  })
  .strict() satisfies z.ZodType<TakeEvidenceResult>;
