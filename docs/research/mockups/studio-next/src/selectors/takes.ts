/**
 * Choosing between takes. The app suggests a take from what it can measure (words read as written, clarity, the noise floor); the
 * narrator decides, and nothing is applied by the suggestion. Takes recorded at different levels cannot be compared, so the suggestion
 * says so (no confidence, with the reason) and offers the preparation steps first. Confidence rises as the steps are applied.
 */
import {
  CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, DEAD_AIR_LIMIT, LEVEL_TOLERANCE_DB, NOISE_RANGE_DB, SCORE_WEIGHTS, SUGGEST_MARGIN_FULL, UNTRIMMED_PENALTY,
} from '@/config/estimates'
import type { BookData, Passage, Take } from '@/domain/schemas'
import { PREP_STEPS, type TakeMeasure } from '@/fixtures/takes'
import { takeMeasures } from '@/providers/takes'
import type { Measured } from '@/providers/measurements'
import { passageScript, shownTakes, takeMatch } from './editing'

export interface TakeEvidence {
  take: Take
  /** Share of the script's words the take read as written (percent). */
  matched: number
  /** What was measured on the take as it is now, or why nothing was. */
  measured: Measured<TakeMeasure>
  /** 0 to 1: matched words, clarity and noise floor together. Null when the take could not be measured. */
  score: number | null
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))
const noiseScore = (nf: number): number => clamp01((NOISE_RANGE_DB.worst - nf) / (NOISE_RANGE_DB.worst - NOISE_RANGE_DB.best))

/** The evidence for each take of a passage: the words read, and what the measurement provider reports with the passage's prep steps applied. */
export function takeEvidence(b: BookData, p: Passage): TakeEvidence[] {
  const script = passageScript(b, p)
  return shownTakes(p).map((take) => {
    const measured = takeMeasures().measure(take.id, p.prepped ?? [])
    const matched = takeMatch(script, take.text).pct
    const score = measured.ok
      ? SCORE_WEIGHTS.matched * (matched / 100) + SCORE_WEIGHTS.clarity * measured.value.clarity + SCORE_WEIGHTS.noise * noiseScore(measured.value.nf)
      : null
    return { take, matched, measured, score }
  })
}

export interface PrepStatus { id: string; label: string; why: string; kind: 'trim' | 'level'; done: boolean; needed: boolean }
export const confidenceLabel = (c: number | null): string => (c == null ? 'Not comparable yet' : c >= CONFIDENCE_HIGH ? 'High' : c >= CONFIDENCE_MEDIUM ? 'Medium' : 'Low')

export interface Suggestion {
  /** The take the measurements favour. Null when there is nothing to suggest (one take, or nothing could be measured and nothing was read). */
  take: Take | null
  /** 0 to 1, or null with `reason` when the takes cannot be compared. Never made up. */
  confidence: number | null
  reason: string
  /** How far apart the takes' levels are (dB), when they could be measured. */
  spread: number | null
  steps: PrepStatus[]
  evidence: TakeEvidence[]
}

/** The preparation steps for a passage, which are done and which would help. */
function prepSteps(p: Passage, ev: TakeEvidence[], comparable: boolean): PrepStatus[] {
  const applied = p.prepped ?? []
  const ms = ev.map((e) => (e.measured.ok ? e.measured.value : null)).filter((m): m is TakeMeasure => !!m)
  return PREP_STEPS.map((s) => {
    const done = applied.includes(s.id)
    const needed = !done && (s.id === 'trim-silence' ? ms.some((m) => m.pause > DEAD_AIR_LIMIT) : s.id === 'trim-breaths' ? ms.some((m) => m.breaths > 0) : !comparable)
    return { ...s, done, needed }
  })
}

export function suggestTake(b: BookData, p: Passage): Suggestion {
  const ev = takeEvidence(b, p)
  const measuredAll = ev.length > 0 && ev.every((e) => e.measured.ok)
  const levels = ev.map((e) => (e.measured.ok ? e.measured.value.rms : null)).filter((x): x is number => x != null)
  const spread = measuredAll && levels.length ? Math.max(...levels) - Math.min(...levels) : null
  const comparable = spread != null && spread <= LEVEL_TOLERANCE_DB
  const steps = prepSteps(p, ev, comparable)
  /* Without measurements the takes are only told apart by the words they read. */
  const ranked = ev.slice().sort((a, c) => (c.score ?? c.matched / 100) - (a.score ?? a.matched / 100) || p.takes.indexOf(c.take) - p.takes.indexOf(a.take))
  const best = ranked[0]
  const out = (confidence: number | null, reason: string): Suggestion => ({ take: best?.take ?? null, confidence, reason, spread, steps, evidence: ev })
  if (ev.length < 2) return { take: null, confidence: null, reason: 'There is only one take to choose from.', spread, steps, evidence: ev }
  if (!measuredAll) {
    const why = ev.map((e) => (e.measured.ok ? null : e.measured.reason)).find(Boolean)
    return out(null, (why ?? 'Nothing has been measured yet.') + ' The suggestion goes by the words read.')
  }
  if (!comparable) return out(null, 'The takes were recorded ' + spread!.toFixed(1) + ' dB apart, so their loudness, noise and clarity cannot be compared yet. Normalise them first.')
  const margin = (ranked[0].score ?? 0) - (ranked[1].score ?? 0)
  const trimsLeft = steps.filter((s) => s.kind === 'trim' && s.needed).length
  const confidence = Math.round(clamp01(margin / SUGGEST_MARGIN_FULL) * clamp01(1 - UNTRIMMED_PENALTY * trimsLeft) * 100) / 100
  return out(confidence, trimsLeft ? 'Long pauses and breaths still colour the measurements. Trim them to be surer.' : 'Measured on takes at one level, with pauses and breaths trimmed.')
}
