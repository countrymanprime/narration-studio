import type { BookData, Chapter, LimitKey, Limits, MasterRow } from '@/domain/schemas'
import { chName } from './chapters'
import { pickupList, isDone } from './pickups'

export const LIMIT_KEYS: LimitKey[] = ['rms', 'peak', 'nf', 'head', 'tail']

export const masterRowFor = (b: BookData, id: string): MasterRow | undefined => b.masterRows.find((r) => r.id === id)

export function rule(limits: Limits, k: LimitKey, v: number): boolean {
  const r = limits[k]
  return (r.lo == null || v >= r.lo) && (r.hi == null || v <= r.hi)
}

/** "−23 to −18 dB", "at most −3 dB", "at least 0.5 s". */
export function limText(limits: Limits, k: LimitKey): string {
  const r = limits[k]
  return r.lo != null && r.hi != null ? r.lo + ' to ' + r.hi + ' ' + r.u : r.hi != null ? 'at most ' + r.hi + ' ' + r.u : 'at least ' + r.lo + ' ' + r.u
}

export function masterFails(row: MasterRow, limits: Limits): LimitKey[] {
  if (row.waiting) return []
  return LIMIT_KEYS.filter((k) => {
    const v = row[k]
    return v != null && !rule(limits, k, v)
  })
}

const QC_SHORT: Record<LimitKey, string> = { rms: 'RMS', peak: 'PEAK', nf: 'FLOOR', head: 'HEAD', tail: 'TAIL' }
/** The QC cell: the one check that failed, or FAIL when several did. */
export const qcLabel = (fails: LimitKey[]): string => (fails.length === 1 ? QC_SHORT[fails[0]] : 'FAIL')

/** The label of a master row: the chapter's name, or the row's own label (the retail sample). */
export function masterLabel(b: BookData, row: MasterRow): string {
  const c = b.chapters.find((x) => x.id === row.id)
  return c ? chName(b, c) : row.label ?? row.id
}

/** What a waiting row says: it waits on open pickups for its chapter. */
export function waitingText(b: BookData, row: MasterRow): string | undefined {
  if (!row.waiting) return undefined
  if (row.waiting !== 'pickups') return row.waiting
  const n = pickupList(b).filter((x) => x.chapterId === row.id && !isDone(b, x.id)).length
  return n ? 'Waiting on ' + n + ' pickup' + (n === 1 ? '' : 's') : 'Not mastered yet'
}

export type ChapterState = { c: Chapter; k: 'ok' | 'bad' | 'wait'; t: string }

/** One line per chapter for the delivery preflight. */
export function chapterStates(b: BookData, limits: Limits, allPass: boolean): ChapterState[] {
  return b.chapters.map((c) => {
    if (allPass) return { c, k: 'ok' as const, t: 'Pass' }
    const r = masterRowFor(b, c.id)
    if (!r) return { c, k: 'wait' as const, t: 'Not mastered' }
    if (r.waiting) return { c, k: 'wait' as const, t: waitingText(b, r) ?? 'Not mastered' }
    const f = masterFails(r, limits)
    return f.length ? { c, k: 'bad' as const, t: 'Fails ' + f.length + ' ' + (f.length > 1 ? 'checks' : 'check') } : { c, k: 'ok' as const, t: 'Pass' }
  })
}

/** RMS by file against the ACX range; spread across files. */
export function consistency(b: BookData): { rows: Array<{ row: MasterRow; rms: number }>; spread: number } {
  const rows = b.masterRows.filter((r) => !r.waiting && r.id !== 'sample' && r.rms != null).map((row) => ({ row, rms: row.rms as number }))
  const v = rows.map((r) => r.rms)
  return { rows, spread: v.length ? Math.max(...v) - Math.min(...v) : 0 }
}
