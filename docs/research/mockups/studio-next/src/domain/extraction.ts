import { z } from 'zod'
import { EXTRACTION_SOURCE_IDS } from '@/config/extraction'

/** A quoted stretch of one paragraph; start/end are computed by code (verifyEvidence), never taken from a provider. */
export const Evidence = z.object({
  paragraphId: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: z.string(),
})
export type Evidence = z.infer<typeof Evidence>

export const ClaimKind = z.enum(['talk', 'act', 'know'])
export type ClaimKind = z.infer<typeof ClaimKind>

export const SuggestionKind = z.enum(['entry', 'alias', 'property', 'relationship', 'claim', 'speaker'])
export type SuggestionKind = z.infer<typeof SuggestionKind>

/** What each kind carries. `entry` names an entry by its id, name or any of its names. */
export const Payload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('entry'), name: z.string().min(1), type: z.string(), aliases: z.array(z.string()), description: z.string(), appearsIn: z.array(z.string()).default([]) }),
  z.object({ kind: z.literal('alias'), entry: z.string().min(1), alias: z.string().min(1) }),
  z.object({ kind: z.literal('property'), entry: z.string().min(1), key: z.string().min(1), value: z.string().min(1) }),
  z.object({ kind: z.literal('relationship'), entry: z.string().min(1), to: z.string().min(1), relation: z.string().min(1) }),
  z.object({ kind: z.literal('claim'), entry: z.string().min(1), claim: ClaimKind, text: z.string().min(1) }),
  z.object({ kind: z.literal('speaker'), quote: z.string().min(1), speaker: z.string().min(1) }),
])
export type Payload = z.infer<typeof Payload>

export const SuggestionStatus = z.enum(['accepted-auto', 'needs-verification', 'accepted', 'rejected'])
export type SuggestionStatus = z.infer<typeof SuggestionStatus>

/** What applying a suggestion changed in the Story Bible, so rejecting it can take that back. */
export const Applied = z.object({
  entryId: z.string().optional(),
  created: z.boolean().optional(),
  aliases: z.array(z.string()).optional(),
  relId: z.number().optional(),
  phraseKey: z.string().optional(),
})
export type Applied = z.infer<typeof Applied>

export const ExtractionSuggestion = z.object({
  id: z.string(),
  kind: SuggestionKind,
  payload: Payload,
  /** The entry this belongs to, once there is one. */
  entryId: z.string().nullable().default(null),
  evidence: z.array(Evidence),
  /** 0..1, or null when the source gave none (never made up). */
  confidence: z.number().min(0).max(1).nullable(),
  source: z.enum(EXTRACTION_SOURCE_IDS),
  status: SuggestionStatus,
  /** The quote a source gave that could not be found in the manuscript. */
  unverifiedQuote: z.string().optional(),
  /** Why it needs verification (worked out from the rest; kept so lists can show it). */
  reason: z.string().optional(),
  /** Fingerprint of what was first offered: a rejected one stays as a tombstone so it is not offered again. */
  fp: z.string(),
  /** A source can mark a suggestion it thinks repeats something else (a split group of mentions): shown as a flag, with its note. */
  flag: z.literal('duplicate').optional(),
  note: z.string().optional(),
  /** Chapter the claim holds in (knowledge is time-bound). */
  chapterId: z.string().optional(),
  applied: Applied.optional(),
  createdAt: z.string(),
})
export type ExtractionSuggestion = z.infer<typeof ExtractionSuggestion>
