/**
 * The finished-hour target. The standard rate (words per finished hour) is a fixed input; the narrator's own rate is worked out from the
 * chapters that have a measured finished length. The schedule uses one of the two (the book's `rateBasis`), and falls back to the
 * standard while nothing is measured.
 */
import type { BookData, RateBasis } from '@/domain/schemas'
import { MIN_OWN_RATE_CHAPTERS, WPH } from '@/config/estimates'
import { measurements, type Measured } from '@/providers/measurements'

export interface OwnRate {
  /** Words per finished hour, over the measured chapters. */
  wph: number
  words: number
  /** Their finished length in seconds. */
  seconds: number
  /** The chapters it was worked out from, in book order. */
  chapters: string[]
}

export function ownRate(b: BookData): Measured<OwnRate> {
  const m = measurements().chapterLengths()
  if (!m.ok) return m
  const have = b.chapters.filter((c) => c.words > 0 && (m.value[c.id] ?? 0) > 0)
  if (have.length < MIN_OWN_RATE_CHAPTERS) {
    return { ok: false, reason: 'Needs ' + MIN_OWN_RATE_CHAPTERS + ' chapters with a measured length; ' + have.length + ' so far.' }
  }
  const words = have.reduce((a, c) => a + c.words, 0)
  const seconds = have.reduce((a, c) => a + m.value[c.id], 0)
  return { ok: true, value: { wph: Math.round((words / seconds) * 3600), words, seconds, chapters: have.map((c) => c.id) } }
}

/** The basis the schedule really uses: the narrator's own rate only when it was chosen and is measured. */
export function basisOf(b: BookData): RateBasis {
  return b.rateBasis === 'own' && ownRate(b).ok ? 'own' : 'standard'
}
export function wphOf(b: BookData): number {
  const r = ownRate(b)
  return basisOf(b) === 'own' && r.ok ? r.value.wph : WPH
}

/** The book's finished hours both ways; `own` is null while nothing is measured. */
export function targetHours(b: BookData): { standard: number; own: number | null } {
  const words = b.chapters.reduce((a, c) => a + c.words, 0)
  const r = ownRate(b)
  return { standard: words / WPH, own: r.ok ? words / r.value.wph : null }
}
