import { z } from 'zod';
import type { GainCandidate, GainChange, LevelMatchApplyResult, LevelMatchPreviewResult, StaleGainCandidate } from '../contracts/cleanup';

const gainCandidateSchema = z.object({
  itemGuid: z.string(),
  deltaDb: z.number(),
}) satisfies z.ZodType<GainCandidate>;

export const levelMatchPreviewResultSchema = z.object({
  candidates: z.array(gainCandidateSchema),
}) satisfies z.ZodType<LevelMatchPreviewResult>;

const gainChangeSchema = z.object({
  itemGuid: z.string(),
  beforeVolume: z.number(),
  afterVolume: z.number(),
}) satisfies z.ZodType<GainChange>;

const staleGainCandidateSchema = z.object({
  findingId: z.string(),
  itemGuid: z.string(),
  reason: z.string(),
}) satisfies z.ZodType<StaleGainCandidate>;

export const levelMatchApplyResultSchema = z.object({
  changed: z.array(gainChangeSchema),
  stale: z.array(staleGainCandidateSchema),
}) satisfies z.ZodType<LevelMatchApplyResult>;
