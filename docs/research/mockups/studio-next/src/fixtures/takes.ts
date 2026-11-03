/**
 * Sample data behind the mock take measurements: what the measurement provider reports for each take, and the preparation steps the
 * narrator can run before choosing between takes. A real provider (the audio engine) replaces the mock without any screen changing.
 */
import { z } from 'zod'

export const TakeMeasure = z.object({
  /** The longest pause in the take, seconds. */
  pause: z.number().nonnegative(),
  /** Average level (RMS) and noise floor, dB full scale. */
  rms: z.number(),
  nf: z.number(),
  /** How clear the voice is against the noise, 0 to 1. */
  clarity: z.number().min(0).max(1),
  /** Breaths in the take. */
  breaths: z.number().int().nonnegative(),
})
export type TakeMeasure = z.infer<typeof TakeMeasure>

const m = (pause: number, rms: number, nf: number, clarity: number, breaths: number): TakeMeasure => ({ pause, rms, nf, clarity, breaths })

/** What was measured on each take of the sample book. */
export const TAKE_MEASURES: Record<string, TakeMeasure> = {
  'T03-1': m(0.9, -21.4, -62.1, 0.84, 1),
  'T03-2': m(0.8, -21.0, -62.4, 0.88, 1),
  'T03-3': m(1.1, -22.8, -61.0, 0.8, 2),
  'T03-4': m(1.9, -19.2, -60.5, 0.86, 2),
  'T03-5': m(1.0, -20.6, -61.8, 0.9, 2),
  'T05-1': m(2.2, -24.5, -58.2, 0.74, 1),
  'T05-2': m(1.6, -22.1, -59.0, 0.8, 2),
  'T05-3': m(1.3, -20.2, -60.4, 0.87, 2),
  'T05-4': m(1.4, -22.6, -60.1, 0.81, 2),
  'T05-5': m(1.1, -20.4, -61.2, 0.9, 3),
  'T05-6': m(2.4, -23.9, -57.6, 0.72, 2),
  'T05-7': m(1.9, -21.8, -59.1, 0.79, 3),
  'T05-8': m(1.2, -20.0, -60.7, 0.88, 3),
  'T05-9': m(1.0, -20.3, -61.5, 0.91, 3),
  'T05-10': m(1.7, -22.0, -60.2, 0.8, 2),
  'T05-11': m(1.2, -20.9, -61.0, 0.86, 2),
  'T05-12': m(1.5, -20.8, -60.9, 0.85, 1),
}

/** The range a take recorded in the Booth is measured in (the same take always measures the same): [low, high] for each figure. */
export const MEASURE_RANGES = {
  pause: [0.8, 2.4], rms: [-24.5, -19.0], nf: [-62.5, -57.5], clarity: [0.72, 0.92], breaths: [1, 3],
} as const

/** Steps that make takes comparable. Trim steps clear what colours the measurements; Normalise brings every take to one level. */
export const PREP_STEPS: Array<{ id: string; label: string; kind: 'trim' | 'level'; why: string }> = [
  { id: 'trim-silence', label: 'Trim white space', kind: 'trim', why: 'Cuts the long pauses at the start, the end and inside the take.' },
  { id: 'trim-breaths', label: 'Trim breaths', kind: 'trim', why: 'Turns the breaths down.' },
  { id: 'normalise', label: 'Normalise', kind: 'level', why: 'Brings every take to the same level.' },
]
