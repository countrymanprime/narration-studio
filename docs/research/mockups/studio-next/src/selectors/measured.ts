/**
 * Figures that come from measurements. Each answers with a value or with the reason there is none, so a screen shows
 * "not measured yet" instead of a made-up number.
 */
import type { BookData } from '@/domain/schemas'
import type { TakeLogEntry } from '@/fixtures/measurements'
import { DAY, diffDays, parseIso } from '@/format/time'
import { measurements, type Measured } from '@/providers/measurements'
import { dueDate, planStart, WPH } from './progress'

export const NOT_MEASURED = 'not measured yet'

const startOfDay = (at: string): Date => parseIso(at.slice(0, 10))

/** The room tone of the microphone in use, in dB. */
export const roomTone = (mic: string): Measured<number> => measurements().roomTone(mic)

/** "Room −64.1 dB", or why there is no reading. */
export function roomToneLabel(mic: string): string {
  const r = roomTone(mic)
  return r.ok ? 'Room ' + r.value.toFixed(1).replace('-', '−') + ' dB' : 'Room ' + NOT_MEASURED
}

/** Recorded audio by day, as the cumulative finished hours at the end of each day, counted in days from the start of the plan. */
export function recordedSeries(b: BookData): Measured<Array<[number, number]>> {
  const log = measurements().takeLog()
  if (!log.ok) return log
  const start = planStart(b)
  const byDay = new Map<number, number>()
  for (const e of log.value) {
    const d = diffDays(startOfDay(e.at), start)
    if (d >= 0) byDay.set(d, (byDay.get(d) ?? 0) + e.seconds)
  }
  let total = 0
  const pts: Array<[number, number]> = [[0, 0]]
  for (const d of [...byDay.keys()].sort((x, y) => x - y)) {
    total += byDay.get(d)!
    pts.push([d, total / 3600])
  }
  return { ok: true, value: pts }
}

const within = (log: TakeLogEntry[], from: Date, to: Date): number =>
  log.filter((e) => { const t = new Date(e.at).getTime(); return t > from.getTime() && t <= to.getTime() }).reduce((a, e) => a + e.seconds, 0)

export interface WeekFigures {
  /** Seconds of finished audio recorded in the last seven days. */
  week: Measured<number>
  /** What the plan asks for in a week, in seconds: the finished length spread evenly from the start of the plan to the due date. */
  target: number | null
  /** Seconds of finished audio recorded in the last 24 hours. */
  last24h: Measured<number>
}

export function weekFigures(b: BookData): WeekFigures {
  const log = measurements().takeLog()
  if (!log.ok) return { week: log, target: null, last24h: log }
  const end = new Date(parseIso(b.today).getTime() + DAY - 60000)
  const planDays = diffDays(dueDate(b), planStart(b))
  const finished = b.chapters.reduce((a, c) => a + c.words, 0) / WPH
  return {
    week: { ok: true, value: within(log.value, new Date(end.getTime() - 7 * DAY), end) },
    target: planDays > 0 ? Math.round((finished * 3600 * 7) / planDays) : null,
    last24h: { ok: true, value: within(log.value, new Date(end.getTime() - DAY), end) },
  }
}

/** Minutes in the booth to redo these pickups. */
export function sessionMinutes(ids: string[]): Measured<number> {
  const r = measurements().pickupSessionSeconds(ids)
  return r.ok ? { ok: true, value: r.value ? Math.max(1, Math.round(r.value / 60)) : 0 } : r
}
