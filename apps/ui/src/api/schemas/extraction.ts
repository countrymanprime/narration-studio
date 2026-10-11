import { z } from 'zod';
import { listFromNull } from './base';
import {
  CLAIM_KINDS,
  SUGGESTION_KINDS,
  SUGGESTION_SOURCES,
  SUGGESTION_STATUSES,
  type ExtractionDecision,
  type ExtractionSuggestion,
  type SuggestionApplied,
  type SuggestionEvidence,
  type SuggestionPayload,
} from '../contracts/extraction';

const text = z.string().min(1);

const suggestionEvidenceSchema = z
  .object({ paragraphId: text, start: z.number().int().nonnegative(), end: z.number().int().nonnegative(), text: z.string() })
  .strict()
  .refine((evidence) => evidence.start < evidence.end, 'a quote starts before it ends') satisfies z.ZodType<SuggestionEvidence>;

const suggestionPayloadSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('entry'),
      name: text,
      type: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      description: z.string().optional(),
      appearsIn: z.array(z.string()).optional(),
    })
    .strict(),
  z.object({ kind: z.literal('alias'), entry: text, alias: text }).strict(),
  z.object({ kind: z.literal('property'), entry: text, key: text, value: text }).strict(),
  z.object({ kind: z.literal('relationship'), entry: text, to: text, relation: text }).strict(),
  z.object({ kind: z.literal('claim'), entry: text, claim: z.enum(CLAIM_KINDS), text }).strict(),
  z.object({ kind: z.literal('speaker'), quote: text, speaker: text }).strict(),
]) satisfies z.ZodType<SuggestionPayload>;

const suggestionAppliedSchema = z
  .object({
    entryId: z.string().optional(),
    created: z.boolean().optional(),
    aliases: z.array(z.string()).optional(),
    relId: z.number().int().optional(),
    phraseKey: z.string().optional(),
  })
  .strict() satisfies z.ZodType<SuggestionApplied>;

export const extractionSuggestionSchema = z
  .object({
    id: text,
    kind: z.enum(SUGGESTION_KINDS),
    payload: suggestionPayloadSchema,
    entryId: z.string().min(1).nullable(),
    evidence: listFromNull(suggestionEvidenceSchema),
    confidence: z.number().min(0).max(1).nullable(),
    source: z.enum(SUGGESTION_SOURCES),
    status: z.enum(SUGGESTION_STATUSES),
    unverifiedQuote: z.string().optional(),
    reason: z.string().optional(),
    fp: text,
    flag: z.literal('duplicate').optional(),
    note: z.string().optional(),
    chapterId: z.string().optional(),
    applied: suggestionAppliedSchema.optional(),
    createdAt: z.string(),
  })
  .strict()
  .refine((suggestion) => suggestion.payload.kind === suggestion.kind, 'a suggestion and its payload have one kind') satisfies z.ZodType<ExtractionSuggestion>;

export const extractionSuggestionsSchema = z.array(extractionSuggestionSchema) satisfies z.ZodType<ExtractionSuggestion[]>;

export const extractionDecisionSchema = z
  .object({ suggestion: extractionSuggestionSchema, settled: z.array(extractionSuggestionSchema), entryIds: z.array(text) })
  .strict() satisfies z.ZodType<ExtractionDecision>;
