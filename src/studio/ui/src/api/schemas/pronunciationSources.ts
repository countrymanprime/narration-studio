import { z } from 'zod';
import type { PronunciationCandidate, PronunciationSource, PronunciationSourceList } from '../contracts/pronunciationSources';

export const pronunciationSourceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(['generated', 'lookup', 'manual']),
    needs: z.enum(['localDictionary', 'network']).optional(),
    available: z.boolean(),
    reason: z.string().optional(),
  })
  .strict() satisfies z.ZodType<PronunciationSource>;

export const pronunciationSourcesSchema = z
  .object({ sources: z.array(pronunciationSourceSchema), default: z.string() })
  .strict() satisfies z.ZodType<PronunciationSourceList>;

// `ok:true` carries `say` and no reason; `ok:false` carries the reason sentence.
export const pronunciationCandidateSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), say: z.string().min(1) }).strict(),
  z.object({ ok: z.literal(false), reason: z.string().min(1) }).strict(),
]) satisfies z.ZodType<PronunciationCandidate>;
