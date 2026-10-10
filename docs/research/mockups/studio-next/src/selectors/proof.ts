import type { BookData, Chapter, FindingType, ProofNote, Resolution, ThreadMessage } from '@/domain/schemas'
import { chapterById } from './chapters'

export const WAVE_TOTAL = 760
export const WLENS = [30, 60, 120, 300, 760]

export const RES_LABEL: Record<Resolution, string> = {
  pickup: 'Needs pickup', edit: 'Fix in edit', waive: 'Waive', defer: 'Defer', keep: 'Kept a take', fixed: 'Fixed by cleanup',
}
/** Characters of the longest resolution label (or "To review"): the width every resolution chip is given so a decision never moves the table. */
export const TO_REVIEW_LABEL = 'To review'
export const RES_CHIP_CH = Math.max(TO_REVIEW_LABEL.length, ...Object.values(RES_LABEL).map((l) => l.length))
export const RES_CLASS: Record<Resolution, string> = { pickup: 'copper', edit: 'info', waive: 'ok', defer: 'neutral', keep: 'ok', fixed: 'ok' }

export const LANES: Array<[string, FindingType[]]> = [
  ['Text', ['misread', 'skip', 'pron']],
  ['Sound', ['mouth', 'plosive', 'noise', 'breath']],
  ['Timing', ['pacing', 'repeat', 'takes']],
]
export const FINDING_COLOUR: Record<FindingType, string> = {
  misread: 'var(--bad)', skip: 'var(--bad)', mouth: 'var(--warn)', plosive: 'var(--warn)', noise: 'var(--warn)',
  pron: 'var(--info)', pacing: 'var(--copper)', repeat: 'var(--copper)', takes: 'var(--violet)', breath: 'var(--warn)',
}
export const FINDING_TYPES = Object.keys(FINDING_COLOUR) as FindingType[]
/** Characters of the longest finding type: every type chip gets this width, so a changed type never moves the table. */
export const TYPE_CHIP_CH = Math.max(...FINDING_TYPES.map((t) => t.length))

/** How serious a kind of finding is for the listener, 3 highest. Notes sort by this when the narrator asks for severity. */
export const FINDING_SEVERITY: Record<FindingType, number> = {
  misread: 3, skip: 3, pron: 2, repeat: 2, takes: 2, mouth: 1, plosive: 1, noise: 1, pacing: 1, breath: 1,
}

export interface ProofView {
  scope: 'all' | 'chapter'
  chapter: string
  filter: 'all' | 'open' | 'unfixed' | 'done' | 'pickup'
  sort?: 'time' | 'confidence' | 'severity'
  query: string
  winStart: number
  winLen: number
  winFilter: boolean
}

/** A note's thread; a note's first text is the proofer's first message. */
export function threadOf(n: ProofNote): ThreadMessage[] {
  return n.thread ?? (n.note ? [{ who: 'proofer', text: n.note, at: 'Sep 24' }] : [])
}

/** Notes for the chapter in view (or every chapter), in time order. */
export function baseRows(b: BookData, v: Pick<ProofView, 'scope' | 'chapter'>): ProofNote[] {
  const rows = v.scope === 'all' ? b.proofNotes.slice() : b.proofNotes.filter((r) => r.chapterId === v.chapter)
  const order = (id: string) => b.chapters.findIndex((c) => c.id === id)
  return rows.sort((a, c) => (a.chapterId === c.chapterId ? a.sec - c.sec : order(a.chapterId) - order(c.chapterId)))
}

export const inWin = (r: ProofNote, v: ProofView): boolean =>
  v.scope === 'all' || v.winLen >= WAVE_TOTAL || !v.winFilter || (r.sec >= v.winStart && r.sec <= v.winStart + v.winLen)

export function visibleRows(b: BookData, v: ProofView, noWin = false): ProofNote[] {
  const q = v.query.trim().toLowerCase()
  const rows = baseRows(b, v).filter(
    (r) =>
      (noWin || inWin(r, v)) &&
      (v.filter === 'all' || (v.filter === 'open' && !r.res) || (v.filter === 'unfixed' && isOpenNote(b, r)) || (v.filter === 'done' && !!r.res) || (v.filter === 'pickup' && r.res === 'pickup')) &&
      (!q || (r.h + ' ' + r.script + ' ' + r.heard + ' ' + r.from + ' ' + threadOf(r).map((m) => m.text).join(' ')).toLowerCase().includes(q)),
  )
  return sortNotes(b, rows, v.sort ?? 'time')
}

/**
 * Order notes inside each chapter by confidence (surest first, notes with no score last) or by severity (most serious first). Ties keep
 * their time order. Time order is the default.
 */
export function sortNotes(b: BookData, rows: ProofNote[], sort: 'time' | 'confidence' | 'severity'): ProofNote[] {
  if (sort === 'time') return rows
  const order = (id: string) => b.chapters.findIndex((c) => c.id === id)
  const key = (n: ProofNote): number => (sort === 'confidence' ? (n.conf == null ? -1 : n.conf) : FINDING_SEVERITY[n.ty])
  return rows
    .map((n, i) => ({ n, i }))
    .sort((a, c) => order(a.n.chapterId) - order(c.n.chapterId) || key(c.n) - key(a.n) || a.i - c.i)
    .map((x) => x.n)
}

/** The sources the notes come from, each with how many it gave. Only sources that have notes are listed. */
export function sourcesOf(rows: ProofNote[]): Array<{ source: string; n: number }> {
  const m = new Map<string, number>()
  rows.forEach((r) => m.set(r.from, (m.get(r.from) ?? 0) + 1))
  return [...m].map(([source, n]) => ({ source, n })).sort((a, c) => c.n - a.n || a.source.localeCompare(c.source))
}

/** Names what a note was found on: the text that was heard and how sure the check was. A re-check that changes either changes the key. */
export function evidenceKey(n: Pick<ProofNote, 'heard' | 'conf'>): string {
  let h = 5381
  const s = n.heard + '|' + (n.conf ?? 'none')
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return 'ev-' + h.toString(36)
}

/** The evidence the narrator is shown against the evidence a decision was made on, when they differ. */
export interface EvidenceChange { was: string; now: string; wasKey: string; nowKey: string }
export function evidenceChange(n: ProofNote, seen: { key: string; heard: string } | undefined): EvidenceChange | null {
  const last = n.history[n.history.length - 1]
  const base = seen ?? (last ? { key: last.evidence, heard: last.heard } : undefined)
  return base && base.key !== n.evidence ? { was: base.heard, now: n.heard, wasKey: base.key, nowKey: n.evidence } : null
}

/**
 * A note is cleared once it is fixed, dismissed or waived: a waive, a fix by cleanup, a take kept, or a pickup that was recorded or
 * removed. Anything else is still open, including a deferred note, a note decided "Fix in edit" until it is fixed, and a note that
 * needs a pickup nobody has redone.
 */
export function isCleared(b: Pick<BookData, 'pickDone' | 'pickGone'>, n: ProofNote): boolean {
  if (n.res === 'waive' || n.res === 'fixed' || n.res === 'keep') return true
  if (n.res === 'pickup') return b.pickDone.includes('p' + n.id) || b.pickGone.includes('p' + n.id)
  return false
}
export const isOpenNote = (b: Pick<BookData, 'pickDone' | 'pickGone'>, n: ProofNote): boolean => !isCleared(b, n)

/** The two counters: notes decided, and notes cleared. Proof reads the cleared share, so it cannot say 100 while a pickup is open. */
export function noteProgress(b: BookData, notes: ProofNote[] = b.proofNotes): { total: number; decided: number; cleared: number; pct: number } {
  const decided = notes.filter((n) => n.res).length
  const cleared = notes.filter((n) => isCleared(b, n)).length
  return { total: notes.length, decided, cleared, pct: notes.length ? Math.round((cleared / notes.length) * 100) : 0 }
}

export const clampWin = (start: number, len: number): { winStart: number; winLen: number } => {
  const winLen = Math.min(len, WAVE_TOTAL)
  return { winLen, winStart: Math.max(0, Math.min(WAVE_TOTAL - winLen, start)) }
}

/** The shortest part of the chapter the window can be dragged down to: the closest zoom step. */
export const MIN_WINDOW = WLENS[0]

/**
 * Drag one edge of the window to a time. The other edge stays where it is; the window never gets shorter than `MIN_WINDOW`
 * and never leaves the chapter (0 to `total`).
 */
export function resizeWindow(start: number, len: number, edge: 'start' | 'end', to: number, total: number = WAVE_TOTAL): { winStart: number; winLen: number } {
  const end = start + len
  const min = Math.min(MIN_WINDOW, total)
  if (edge === 'start') {
    const s = Math.max(0, Math.min(end - min, to))
    return { winStart: s, winLen: end - s }
  }
  const e = Math.min(total, Math.max(start + min, to))
  return { winStart: start, winLen: e - start }
}

/** The next zoom step in a direction from a window length that may lie between steps (after an edge was dragged). Null at the end of the steps. */
export function stepLen(len: number, dir: 1 | -1): number | null {
  const next = dir > 0 ? WLENS.find((l) => l > len + 1e-6) : [...WLENS].reverse().find((l) => l < len - 1e-6)
  return next ?? null
}

/** Notes still open per chapter, for the chapter strip. */
export function chapterNoteCounts(b: BookData): Array<{ id: string; total: number; open: number }> {
  return b.chapters.map((c) => {
    const rs = b.proofNotes.filter((r) => r.chapterId === c.id)
    return { id: c.id, total: rs.length, open: rs.filter((r) => isOpenNote(b, r)).length }
  })
}

export const noteChapterName = (b: BookData, n: ProofNote) => chapterById(b, n.chapterId)
export const openProof = (b: BookData): number => b.proofNotes.filter((r) => isOpenNote(b, r)).length

/** The chapter strip is dense (a thin bar per chapter) once the book has more chapters than fit as tiles. */
export const STRIP_DENSE_OVER = 18
export const stripIsDense = (b: BookData): boolean => b.chapters.length > STRIP_DENSE_OVER

/** What a chapter strip tile says. Numbered chapters show their number (every fifth when dense); the credits are placed by position. */
export function stripLabel(b: BookData, c: Chapter, dense: boolean): string {
  if (c.n != null) return !dense || c.n % 5 === 0 ? String(c.n) : ''
  const first = b.chapters[0]?.id === c.id
  return dense ? (first ? 'In' : 'Out') : first ? 'Open' : 'Close'
}
