/**
 * What can be measured on a take: its longest pause, level, noise floor, clarity and breaths. Screens ask this interface and show
 * "not measured yet" when it cannot answer; they never invent a figure. The mock reads sample data (a take it has no data for
 * is measured in a stable range); a real implementation, measuring the audio, replaces it without any screen changing.
 */
import { DEAD_AIR_LIMIT, TARGET_RMS_DB } from '@/config/estimates'
import { MEASURE_RANGES, TAKE_MEASURES, type TakeMeasure } from '@/fixtures/takes'
import { getState } from '@/state/store'
import type { Measured } from './measurements'

export interface TakeMeasureProvider {
  /** The take as it measures now, with these preparation steps (ids) applied to it. */
  measure(takeId: string, applied: readonly string[]): Measured<TakeMeasure>
}

/** A figure inside [lo, hi] that depends only on the take id and the figure's name. */
function within(takeId: string, name: string, [lo, hi]: readonly [number, number]): number {
  let h = 2166136261
  for (const c of takeId + '/' + name) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return lo + ((h % 1000) / 1000) * (hi - lo)
}
const r1 = (n: number): number => Math.round(n * 10) / 10
const r2 = (n: number): number => Math.round(n * 100) / 100

export function createMockTakeMeasures(data: Record<string, TakeMeasure> = TAKE_MEASURES): TakeMeasureProvider {
  return {
    measure(takeId, applied) {
      if (getState().mock.measurements === 'none') return { ok: false, reason: 'Nothing has been measured yet.' }
      const base: TakeMeasure = data[takeId] ?? {
        pause: r1(within(takeId, 'pause', MEASURE_RANGES.pause)), rms: r1(within(takeId, 'rms', MEASURE_RANGES.rms)), nf: r1(within(takeId, 'nf', MEASURE_RANGES.nf)),
        clarity: r2(within(takeId, 'clarity', MEASURE_RANGES.clarity)), breaths: Math.round(within(takeId, 'breaths', MEASURE_RANGES.breaths)),
      }
      let v = { ...base }
      if (applied.includes('trim-silence')) v.pause = Math.min(v.pause, DEAD_AIR_LIMIT)
      if (applied.includes('trim-breaths')) v.breaths = 0
      if (applied.includes('normalise')) {
        // Turning a take up turns its noise up with it.
        const gain = TARGET_RMS_DB - v.rms
        v = { ...v, rms: TARGET_RMS_DB, nf: r1(v.nf + gain) }
      }
      return { ok: true, value: v }
    },
  }
}

let current: TakeMeasureProvider = createMockTakeMeasures()
export const takeMeasures = (): TakeMeasureProvider => current
/** Swap the provider (a real one, or a test double). */
export function setTakeMeasureProvider(p: TakeMeasureProvider): void {
  current = p
}
