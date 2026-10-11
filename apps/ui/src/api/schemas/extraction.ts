import { z } from 'zod';
import { listFromNull } from './base';
import {
  CLAIM_KINDS,
  IMPORT_ACTIONS,
  IMPORT_FORMATS,
  IMPORT_RECORDS,
  SUGGESTION_KINDS,
  SUGGESTION_SOURCES,
  SUGGESTION_STATUSES,
  type ExtractionDecision,
  type ExtractionImportError,
  type ExtractionImportLine,
  type ExtractionImportPlan,
  type ExtractionImportPrompt,
  type ExtractionImportResult,
  type ExtractionScanJob,
  type ExtractionSource,
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

export const extractionSourceSchema = z
  .object({
    id: z.enum(SUGGESTION_SOURCES),
    label: text,
    icon: text,
    runs: z.boolean(),
    available: z.boolean(),
    reason: z.string().min(1).optional(),
  })
  .strict()
  .refine((source) => source.available || source.reason !== undefined, 'a source that cannot run says why') satisfies z.ZodType<ExtractionSource>;

export const extractionSourcesSchema = z.array(extractionSourceSchema) satisfies z.ZodType<ExtractionSource[]>;

const count = z.number().int().nonnegative();

export const extractionScanJobSchema = z
  .object({
    id: z.string().min(1).nullable(),
    kind: z.literal('extraction_scan'),
    phase: z.enum(['idle', 'running', 'success', 'cancelled', 'error']),
    message: z.string(),
    percent: z.number().int().min(0).max(100),
    logs: listFromNull(z.string()),
    elapsed: z.number().nonnegative(),
    error: z.string().optional(),
    sources: listFromNull(z.enum(SUGGESTION_SOURCES)),
    added: count,
    skipped: count,
  })
  .strict()
  .refine((job) => job.percent < 100 || job.phase === 'success', 'a scan reads 100 only once it has ended') satisfies z.ZodType<ExtractionScanJob>;

const extractionImportLineSchema = z
  .object({
    row: z.number().int().positive(),
    where: text,
    kind: z.enum(IMPORT_RECORDS),
    label: z.string(),
    action: z.enum(IMPORT_ACTIONS),
    status: z.enum(['accepted-auto', 'needs-verification']).optional(),
    confidence: z.number().min(0).max(1).nullable(),
    note: z.string(),
  })
  .strict()
  .refine(
    (line) => (line.action === 'skip') === (line.status === undefined),
    'a line has a status unless it is skipped',
  ) satisfies z.ZodType<ExtractionImportLine>;

const extractionImportErrorSchema = z
  .object({ row: z.number().int().nonnegative(), where: z.string(), reason: text })
  .strict() satisfies z.ZodType<ExtractionImportError>;

/** The import preview (the PRD's `extractionImportPlan`). */
export const extractionImportPlanSchema = z
  .object({
    format: z.enum(IMPORT_FORMATS).optional(),
    lines: listFromNull(extractionImportLineSchema),
    errors: listFromNull(extractionImportErrorSchema),
    offered: count,
  })
  .strict()
  .refine(
    (plan) => plan.offered === plan.lines.filter((line) => line.action !== 'skip').length,
    'offered counts the lines that add or merge',
  ) satisfies z.ZodType<ExtractionImportPlan>;

export const extractionImportResultSchema = z
  .object({ suggestions: z.array(extractionSuggestionSchema), entryIds: z.array(text), skipped: count })
  .strict()
  .refine(
    (result) => result.suggestions.every((s) => s.source === 'imported'),
    'an import stores imported suggestions',
  ) satisfies z.ZodType<ExtractionImportResult>;

export const extractionImportPromptSchema = z
  .object({ format: z.enum(IMPORT_FORMATS), prompt: text, example: text, maxBytes: z.number().int().positive() })
  .strict()
  .refine((prompt) => prompt.prompt.includes(prompt.example), 'the prompt contains its example') satisfies z.ZodType<ExtractionImportPrompt>;
