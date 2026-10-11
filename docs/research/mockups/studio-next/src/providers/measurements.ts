/**
 * What the recorder and the take log can measure. Screens ask this interface and show "not measured yet" when it cannot
 * answer; they never invent a figure. The mock reads sample data; a real implementation replaces it without any screen changing.
 */
import { CHAPTER_LENGTHS, PICKUP_BOOTH, ROOM_TONE_DB, TAKE_LOG, type TakeLogEntry } from '@/fixtures/measurements'
import { getState } from '@/state/store'

export type Measured<T> = { ok: true; value: T } | { ok: false; reason: string }

export interface MeasurementProvider {
  /** The room tone the microphone reports, in dB. */
  roomTone(mic: string): Measured<number>
  /** The recorded takes: when each was made and how much finished audio it added. */
  takeLog(): Measured<TakeLogEntry[]>
  /** Time in the booth to redo these pickups, in seconds. */
  pickupSessionSeconds(ids: string[]): Measured<number>
  /** The finished length of the chapters that have been measured, in seconds, by chapter id. */
  chapterLengths(): Measured<Record<string, number>>
}

export function createMockMeasurements(
  roomTone: Record<string, number> = ROOM_TONE_DB,
  log: TakeLogEntry[] = TAKE_LOG,
  booth: typeof PICKUP_BOOTH = PICKUP_BOOTH,
  lengths: Record<string, number> = CHAPTER_LENGTHS,
): MeasurementProvider {
  const off = (): boolean => getState().mock.measurements === 'none'
  const NONE = { ok: false, reason: 'Nothing has been measured yet.' } as const
  return {
    roomTone(mic) {
      const db = roomTone[mic]
      return off() || db == null ? NONE : { ok: true, value: db }
    },
    chapterLengths: () => (off() || !Object.keys(lengths).length ? { ok: false, reason: 'No chapter has a measured length yet.' } : { ok: true, value: lengths }),
    takeLog: () => (off() || !log.length ? NONE : { ok: true, value: log }),
    pickupSessionSeconds(ids) {
      const known = Object.values(booth.seconds)
      if (off() || !known.length) return NONE
      if (!ids.length) return { ok: true, value: 0 }
      // A pickup nobody has redone yet takes what the measured ones took on average.
      const mean = known.reduce((a, s) => a + s, 0) / known.length
      return { ok: true, value: booth.setupSeconds + ids.reduce((a, id) => a + (booth.seconds[id] ?? mean), 0) }
    },
  }
}

let current: MeasurementProvider = createMockMeasurements()
export const measurements = (): MeasurementProvider => current
/** Swap the provider (a real one, or a test double). */
export function setMeasurementProvider(p: MeasurementProvider): void {
  current = p
}
