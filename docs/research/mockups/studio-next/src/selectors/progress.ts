import type { BookData, Chapter, PlatformCapability } from '@/domain/schemas'
import { addDays, diffDays, parseIso } from '@/format/time'
import { openPickups } from './pickups'
import { noteProgress } from './proof'
import { masterFails, masterRowFor, qcLabel } from './master'
import { getState } from '@/state/store'
import { wphOf } from './pace'

import { CHECKPOINT_MINUTES, PACE, PICKUP_HOURS, RATIO, WARN_DAYS, WPH } from '@/config/estimates'
export { PACE, RATIO, WPH }

export interface ChapterVals {
  rec: number
  edit: number
  proof: number
  pick: number
  master: boolean
  qc: string | null
}

/** Stage progress for a chapter. Proof, pickups and the master check come from their own data, not from a copy on the chapter. */
export function vals(b: BookData, c: Chapter): ChapterVals {
  const notes = b.proofNotes.filter((n) => n.chapterId === c.id)
  const pick = openPickups(b, c.id)
  /* Proof is the share of notes cleared, not decided, and it cannot read 100 while a pickup is open. */
  const raw = notes.length ? noteProgress(b, notes).pct : c.proof
  const proof = pick > 0 ? Math.min(raw, 99) : raw
  const row = masterRowFor(b, c.id)
  const measured = !!row && !row.waiting
  const fails = measured && row ? masterFails(row, activeLimits(b)) : []
  return { rec: c.rec, edit: c.edit, proof, pick, master: measured, qc: measured ? (fails.length ? qcLabel(fails) : 'PASS') : null }
}

/** The limits of the profile in use: the one chosen on the Delivery page unless a key is given. */
export function activeLimits(b: BookData, profileKey: string = getState().ui.delivery.profile) {
  return (b.profiles.find((p) => p.key === profileKey) ?? b.profiles[0]).limits
}

export const today = (b: BookData): Date => parseIso(b.today)
export const dueDate = (b: BookData): Date => parseIso(b.due)

export interface Calc {
  W: number; fh: number; rw: number; ew: number; pw: number; mw: number; pick: number; pass: number; fail: number; measured: number
  recLeft: number; editLeft: number; proofLeft: number; pickH: number; remain: number; days: number; finish: Date
  daysLeft: number; slack: number; verdict: 'ok' | 'tight' | 'behind'; recTotal: number; editTotal: number; reqPace: number
  /** The words per finished hour the figures are worked out on (the standard, or the narrator's own when chosen). */
  wph: number
}

export function calc(b: BookData): Calc {
  let W = 0, rw = 0, ew = 0, pw = 0, mw = 0, pick = 0, pass = 0, fail = 0, measured = 0
  b.chapters.forEach((c) => {
    const v = vals(b, c)
    W += c.words
    rw += (c.words * v.rec) / 100
    ew += (c.words * v.edit) / 100
    pw += (c.words * v.proof) / 100
    if (v.master) {
      mw += c.words
      measured++
      v.qc === 'PASS' ? pass++ : fail++
    }
    pick += v.pick
  })
  const wph = wphOf(b)
  const fh = W / wph
  const recLeft = ((W - rw) / wph) * RATIO.rec
  const editLeft = ((W - ew) / wph) * RATIO.edit
  const proofLeft = ((W - pw) / wph) * RATIO.proof
  const pickH = pick * PICKUP_HOURS
  const remain = recLeft + editLeft + proofLeft + pickH
  const days = remain / PACE
  const td = today(b)
  const finish = addDays(td, Math.ceil(days))
  const daysLeft = diffDays(dueDate(b), td)
  const slack = daysLeft - days
  const verdict = slack >= 3 ? 'ok' : slack >= 0 ? 'tight' : 'behind'
  return {
    wph, W, fh, rw, ew, pw, mw, pick, pass, fail, measured, recLeft, editLeft, proofLeft, pickH, remain, days, finish, daysLeft, slack, verdict,
    recTotal: fh * RATIO.rec, editTotal: fh * (RATIO.edit + RATIO.proof), reqPace: daysLeft > 0 ? remain / daysLeft : Infinity,
  }
}

export type Tone = 'neutral' | 'warn' | 'danger' | 'success'

/** The book is finished when every chapter has been delivered (master-checked) and none fails. */
export const isFinished = (k: Calc): boolean => k.W > 0 && k.mw >= k.W && k.fail === 0

/**
 * How the due date reads. The days left set it: neutral beyond a week, a warning within a week while unfinished, danger once past,
 * success when finished. The projection can only make it worse, and only when there is work left to project.
 */
export function deadlineTone(b: BookData, k: Calc): Tone {
  if (isFinished(k)) return 'success'
  const days = diffDays(dueDate(b), today(b))
  let tone: Tone = days < 0 ? 'danger' : days <= WARN_DAYS ? 'warn' : 'neutral'
  if (k.remain > 0) {
    if (k.verdict === 'behind') tone = 'danger'
    else if (k.verdict === 'tight' && tone === 'neutral') tone = 'warn'
  }
  return tone
}

/** The contract's worth: a rate per finished hour times the finished hours. There is no value without a per-finished-hour rate. */
export function contractValue(b: BookData): number | null {
  const { payment, amount } = b.contract
  if (payment !== 'pfh' || amount == null) return null
  return amount * (b.chapters.reduce((a, c) => a + c.words, 0) / WPH)
}

/** The plan starts on the first of the month the work began in. */
export const planStart = (b: BookData): Date => {
  const td = today(b)
  return new Date(td.getFullYear(), td.getMonth(), 1)
}

/** What a milestone can measure. A custom milestone has no estimate and is marked done by hand. `needs` is a delivery-profile capability. */
export interface MeasureDef { id: string; label: string; needs?: PlatformCapability }
export const MEASURES: MeasureDef[] = [
  { id: 'custom', label: 'Custom: no estimate' },
  { id: 'rec', label: 'All recorded' },
  { id: 'edit', label: 'All edited' },
  { id: 'proof', label: 'All proofed' },
  { id: 'editproof', label: 'All edited and proofed' },
  { id: 'chN', label: 'First N chapters edited and proofed' },
  { id: 'minN', label: 'First N finished minutes, recorded, edited and proofed' },
  { id: 'checkpoint', label: '15-minute checkpoint', needs: 'checkpoint15' },
  { id: 'all', label: 'Whole book' },
]
/** The scope stored for the checkpoint measure; it reads as the first CHECKPOINT_MINUTES finished minutes. */
export const CHECKPOINT_SCOPE = 'checkpoint'
export const measOf = (sc: string | undefined): string =>
  !sc || sc === 'custom' ? 'custom' : /^ch\d+$/.test(sc) ? 'chN' : /^min\d+$/.test(sc) ? 'minN' : sc
/** The N of "first N finished minutes". */
export const minutesOf = (sc: string | undefined): number => {
  if (sc === CHECKPOINT_SCOPE) return CHECKPOINT_MINUTES
  const m = /^min(\d+)$/.exec(sc || '')
  return m ? +m[1] : CHECKPOINT_MINUTES
}
export const nOf = (sc: string | undefined): number => {
  const m = /^ch(\d+)$/.exec(sc || '')
  return m ? +m[1] : 6
}

/** Work-hours left to reach a milestone's measure. */
export function remainFor(b: BookData, scope: string): number {
  let h = 0
  if (/^min\d+$/.test(scope) || scope === CHECKPOINT_SCOPE) {
    // The first N finished minutes of the book, in reading order: each chapter in the window counts for the share of it that falls inside.
    let words = (minutesOf(scope) / 60) * WPH
    for (const c of b.chapters) {
      if (words <= 0) break
      if (!c.words) continue
      const part = Math.min(1, words / c.words)
      words -= c.words
      const v = vals(b, c)
      h += (c.words / WPH) * part * ((1 - v.rec / 100) * RATIO.rec + (1 - v.edit / 100) * RATIO.edit + (1 - v.proof / 100) * RATIO.proof)
    }
    return h
  }
  const N = /^ch\d+$/.test(scope) ? nOf(scope) : null
  b.chapters.forEach((c) => {
    const v = vals(b, c)
    const fh = c.words / WPH
    if (N != null && !(c.id === 'open' || (c.n && c.n <= N))) return
    if (scope === 'rec' || scope === 'all') h += fh * (1 - v.rec / 100) * RATIO.rec
    if (N != null || scope === 'edit' || scope === 'editproof' || scope === 'all') h += fh * (1 - v.edit / 100) * RATIO.edit
    if (N != null || scope === 'proof' || scope === 'editproof' || scope === 'all') h += fh * (1 - v.proof / 100) * RATIO.proof
  })
  return h
}
