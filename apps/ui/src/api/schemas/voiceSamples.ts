import { z } from 'zod';
import {
  VOICE_SAMPLE_LABEL_MAX,
  VOICE_SAMPLE_NOTE_MAX,
  type VoiceSample,
  type VoiceSampleAnswer,
  type VoiceSampleLimits,
  type VoiceSampleSource,
  type VoiceSamples,
  type VoiceSamplesChanged,
  type VoiceSamplesRemoved,
} from '../contracts/voiceSamples';

const voiceSampleSourceSchema = z
  .object({
    chapterId: z.string().min(1),
    chapterTitle: z.string(),
    text: z.string(),
    startKey: z.string().min(1),
    endKey: z.string().min(1),
    state: z.enum(['ok', 'text_changed', 'chapter_missing']),
  })
  .strict() satisfies z.ZodType<VoiceSampleSource>;

const voiceSampleSchema = z
  .object({
    id: z.string().min(1),
    characterId: z.string().min(1),
    label: z.string().max(VOICE_SAMPLE_LABEL_MAX),
    note: z.string().max(VOICE_SAMPLE_NOTE_MAX),
    primary: z.boolean(),
    createdAt: z.string(),
    durationMs: z.number().int().positive(),
    bytes: z.number().int().positive(),
    clipState: z.enum(['ok', 'missing', 'size_changed', 'hash_changed']),
    source: voiceSampleSourceSchema,
  })
  .strict() satisfies z.ZodType<VoiceSample>;

const limitsSchema = z
  .object({
    minSeconds: z.number().positive(),
    maxSeconds: z.number().positive(),
    perCharacter: z.number().int().positive(),
    projectBytes: z.number().int().positive(),
    labelUnits: z.number().int().positive(),
    noteUnits: z.number().int().positive(),
  })
  .strict() satisfies z.ZodType<VoiceSampleLimits>;

export const voiceSamplesSchema = z
  .object({
    samples: z.array(voiceSampleSchema),
    totals: z.object({ count: z.number().int().nonnegative(), bytes: z.number().int().nonnegative() }).strict(),
    limits: limitsSchema,
  })
  .strict() satisfies z.ZodType<VoiceSamples>;

export const voiceSampleAnswerSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('saved'), sample: voiceSampleSchema }).strict(),
  z
    .object({
      status: z.literal('refused'),
      reason: z.enum([
        'stale_alignment',
        'not_heard',
        'spans_takes',
        'spans_cut',
        'too_short',
        'too_long',
        'unsupported_source',
        'source_missing',
        'project_unreadable',
        'character_limit',
        'project_limit',
        'not_found',
      ]),
      message: z.string().min(1),
    })
    .strict(),
]) satisfies z.ZodType<VoiceSampleAnswer>;

export const voiceSamplesRemovedSchema = z
  .object({ removed: z.number().int().nonnegative(), bytes: z.number().int().nonnegative() })
  .strict() satisfies z.ZodType<VoiceSamplesRemoved>;

export const voiceSamplesChangedSchema = z.object({ revision: z.number().int().positive() }).strict() satisfies z.ZodType<VoiceSamplesChanged>;
