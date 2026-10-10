import { z } from 'zod'
import { EXTRACTION_SOURCE_IDS } from '@/config/extraction'

/** One optional download that makes the Story Bible scan better. Everything the dialogs and Settings say about it comes from here. */
export const ComponentSpec = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** What it does, in plain words. */
  does: z.string().min(1),
  sizeMB: z.number().positive(),
  /** Where the download comes from. */
  host: z.string().min(1),
  /** The licence, in a sentence the narrator can read. */
  licence: z.string().min(1),
  /** Memory it needs, in GB. */
  ramGB: z.number().positive(),
  /** About how long one book takes; null when not known. */
  minutesPerBook: z.number().positive().nullable(),
  /** The extraction source its findings are filed under; null when it is not a scanner yet. */
  source: z.enum(EXTRACTION_SOURCE_IDS).nullable(),
  /** Of two components behind one source, the higher rank is used when both are installed. */
  rank: z.number().default(0),
  /** Offered together on the first scan. */
  recommended: z.boolean().default(false),
  /** Set when it cannot be downloaded at all: the reason is shown instead of a Download button. */
  unavailable: z.string().optional(),
})
export type ComponentSpec = z.infer<typeof ComponentSpec>

/** What a download is doing right now. No job means nothing is in progress. */
export const ComponentJob = z.object({
  phase: z.enum(['downloading', 'verifying', 'failed']),
  pct: z.number().min(0).max(100),
  reason: z.string().optional(),
})
export type ComponentJob = z.infer<typeof ComponentJob>

export type ComponentStatus = 'installed' | 'downloading' | 'verifying' | 'failed' | 'not-installed' | 'unavailable'

/** The states the mock host can be in (Mock states > Analysis tools). */
export const ANALYSIS_HOSTS = ['reachable', 'blocked', 'lowdisk'] as const
export type AnalysisHost = (typeof ANALYSIS_HOSTS)[number]
