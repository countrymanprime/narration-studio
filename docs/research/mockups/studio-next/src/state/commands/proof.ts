/**
 * Proof commands: decisions, the waveform window and the notes thread.
 * `decideNote` and `moveNote` are shared with the Companion window.
 */
import type { Draft } from 'immer'
import type { FindingType, ProofNote, Resolution } from '@/domain/schemas'
import { fmtD, parseIso } from '@/format/time'
import { daw } from '@/state/daw'
import { speech } from '@/providers/speech'
import { RES_LABEL, WAVE_TOTAL, clampWin, evidenceChange, evidenceKey, resizeWindow, stepLen, threadOf, visibleRows, baseRows, type ProofView } from '@/selectors/proof'
import { setNoteRes } from './notes'
import { dawLabel } from '@/selectors/daw'
import { toast, toastUndo } from '@/ui/overlay'
import { act, getState, update } from '../store'
import type { StudioState } from '../types'
import { shortenGaps } from './editing'
import type { UiState } from '../slices/ui'

export const viewOf = (ui: UiState): ProofView => ({
  scope: ui.proof.scope, chapter: ui.chapter, filter: ui.proof.filter, sort: ui.proof.sort, query: ui.proof.query,
  winStart: ui.proof.winStart, winLen: ui.proof.winLen, winFilter: ui.proof.winFilter,
})

const noteIn = (d: Draft<StudioState>, id: number): Draft<ProofNote> | undefined => d.data.proofNotes.find((x) => x.id === id)
const noteOf = (id: number | null): ProofNote | undefined => (id == null ? undefined : getState().data.proofNotes.find((x) => x.id === id))

/** Put the window around a note. */
function centerOn(d: Draft<StudioState>, r: { id: number; sec: number }): void {
  const w = clampWin(r.sec - d.ui.proof.winLen / 2, d.ui.proof.winLen)
  d.ui.proof.winStart = w.winStart
  d.ui.proof.winLen = w.winLen
  d.ui.proof.winFor = r.id
}
/** Keep the window valid after it moved or zoomed. */
function clampOn(d: Draft<StudioState>): void {
  const w = clampWin(d.ui.proof.winStart, d.ui.proof.winLen)
  d.ui.proof.winStart = w.winStart
  d.ui.proof.winLen = w.winLen
}
/** When the window moves off the selected note, the earliest note in view is selected instead. */
function syncSelToWin(d: Draft<StudioState>): void {
  const p = d.ui.proof
  if (p.scope === 'all' || p.winLen >= WAVE_TOTAL) return
  const r = d.ui.proof.sel == null ? undefined : noteIn(d, d.ui.proof.sel)
  if (r && r.chapterId === d.ui.chapter && r.sec >= p.winStart && r.sec <= p.winStart + p.winLen) return
  const inView = visibleRows(d.data, viewOf(d.ui as UiState), true).filter((x) => x.sec >= p.winStart && x.sec <= p.winStart + p.winLen)
  p.sel = inView.length ? inView[0].id : null
  p.winFor = p.sel
}

let playTimer: ReturnType<typeof setInterval> | undefined
export function stopPlay(): void {
  if (playTimer) clearInterval(playTimer)
  playTimer = undefined
  update((d) => { d.ui.proof.play = null })
}
export function togglePlay(): void {
  const s = getState()
  if (s.ui.proof.play != null) { stopPlay(); return }
  const r = noteOf(s.ui.proof.sel)
  if (!r) return
  daw().playAround(r.sec, 3)
  update((d) => { d.ui.proof.play = r.sec - 3 })
  playTimer = setInterval(() => {
    const p = getState().ui.proof.play
    if (p == null || p + 0.1 >= r.sec + 3) { stopPlay(); return }
    update((d) => { d.ui.proof.play = p + 0.1 })
  }, 100)
}

const focusRow = (id: number): void => {
  setTimeout(() => document.querySelector<HTMLElement>(`tr[data-r="${id}"]`)?.focus({ preventScroll: true }), 0)
}

/** A click or Enter on a note opens its chapter; arrow keys only move the selection. */
export function selectNote(id: number, openScope = false): void {
  stopPlay()
  update((d) => {
    const r = noteIn(d, id)
    d.ui.proof.sel = id
    d.ui.proof.edit = null
    if (r) {
      d.ui.chapter = r.chapterId
      if (openScope && d.ui.proof.scope === 'all') d.ui.proof.scope = 'chapter'
      centerOn(d, r)
    }
  })
  focusRow(id)
}
/** Select the next (+1) or previous (-1) note in the list, ignoring the waveform window. */
export function moveNote(delta: number): void {
  const s = getState()
  const rows = visibleRows(s.data, viewOf(s.ui), true)
  if (!rows.length) return
  let i = rows.findIndex((r) => r.id === s.ui.proof.sel)
  i = Math.min(rows.length - 1, Math.max(0, i + delta))
  selectNote(rows[i].id)
}

/** The narrator has looked at a note: remember the evidence they saw, so a re-check that changes it cannot slip a decision through. */
export function markSeen(id: number): void {
  const n = noteOf(id)
  if (!n || getState().ui.proof.seen[id]) return
  update((d) => { d.ui.proof.seen[id] = { key: n.evidence, heard: n.heard } })
}
/** The narrator has read what changed and takes the new evidence as the one to decide on. */
export function acceptEvidence(id: number): void {
  const n = noteOf(id)
  if (n) update((d) => { d.ui.proof.seen[id] = { key: n.evidence, heard: n.heard } })
}
/**
 * A decision made on evidence that has changed since the narrator looked is refused: nothing is decided, the page shows what changed and the
 * note typed with the decision stays. Returns the reason, or null when the evidence is the one the narrator saw.
 */
function staleReason(n: ProofNote): string | null {
  return evidenceChange(n, getState().ui.proof.seen[n.id]) ? 'The evidence for this note changed since you looked at it. Read what changed, then decide.' : null
}

export const setDecisionNote = (id: number, text: string): void => update((d) => { d.ui.proof.dnote[id] = text })

/** Decide a note, with Undo; the selection moves on to the next note still to review. Refused when the evidence changed under the narrator. */
export function decideNote(id: number, res: Resolution): boolean {
  const s = getState()
  const r = s.data.proofNotes.find((x) => x.id === id)
  if (!r) return false
  stopPlay()
  update((d) => { d.ui.proof.sel = id })
  const why = staleReason(r)
  if (why) { toast(why); return false }
  const typed = (s.ui.proof.dnote[id] ?? '').trim()
  /* The same decision again, with nothing typed, is no decision: no history line, no undo step, no toast. */
  if (r.res === res && !typed) return true
  const pool = baseRows(s.data, viewOf(s.ui))
  const nx = pool.find((x) => !x.res && x.id !== r.id && x.sec > r.sec) ?? pool.find((x) => !x.res && x.id !== r.id)
  const e = act('Decision “' + RES_LABEL[res] + '” at ' + r.t, (d) => {
    setNoteRes(d, noteIn(d, id)!, res, typed)
    delete d.ui.proof.dnote[id]
    d.ui.proof.seen[id] = { key: r.evidence, heard: r.heard }
    if (nx && s.ui.proof.filter !== 'done') d.ui.proof.sel = nx.id
  }, { restoreUi: ['proof.sel'] })
  toastUndo(r.t + ' · ' + RES_LABEL[res], e, 7000)
  return true
}

export function reopenNote(id: number): void {
  update((d) => {
    const r = noteIn(d, id)
    if (!r) return
    setNoteRes(d, r, null)
  })
}
export function setNoteType(id: number, ty: FindingType): void {
  update((d) => { const r = noteIn(d, id); if (r) r.ty = ty })
}

/** Shorten these gap findings to the limit in one step with Undo. The cleanup operations themselves live in Editing. */
export function cleanDeadAir(ids: number[]): void {
  shortenGaps(ids.filter((id) => { const r = noteOf(id); return r?.ty === 'pacing' && !r.res }))
}

/* The waveform window. */
export function dragWindow(centerSec: number): void {
  update((d) => {
    d.ui.proof.winStart = centerSec - d.ui.proof.winLen / 2
    d.ui.proof.winFor = d.ui.proof.sel
    clampOn(d)
  })
}
export function releaseWindow(): void {
  update((d) => syncSelToWin(d))
}
export function nudgeWindow(dir: 1 | -1): void {
  update((d) => {
    d.ui.proof.winStart += (dir * d.ui.proof.winLen) / 2
    d.ui.proof.winFor = d.ui.proof.sel
    clampOn(d)
    syncSelToWin(d)
  })
}
/** Drag one edge of the window (the part of the chapter shown) to a time; `to` is in seconds. The other edge stays. */
export function resizeWin(edge: 'start' | 'end', to: number): void {
  update((d) => {
    const w = resizeWindow(d.ui.proof.winStart, d.ui.proof.winLen, edge, to)
    d.ui.proof.winStart = w.winStart
    d.ui.proof.winLen = w.winLen
    d.ui.proof.winFor = d.ui.proof.sel
    clampOn(d)
  })
}
export function zoomWindow(dir: 1 | -1): void {
  update((d) => {
    const p = d.ui.proof
    const n = stepLen(p.winLen, dir)
    if (n == null) return
    const c = p.winStart + p.winLen / 2
    p.winLen = n
    p.winStart = c - n / 2
    p.winFor = p.sel
    clampOn(d)
    syncSelToWin(d)
  })
}
/** The window follows the selected note: when a note is chosen elsewhere, centre on it. */
export function followSelection(): void {
  update((d) => {
    const r = d.ui.proof.sel == null ? undefined : noteIn(d, d.ui.proof.sel)
    if (r && d.ui.proof.winFor !== r.id) centerOn(d, r)
  })
}

export const setFilter = (f: UiState['proof']['filter']): void => update((d) => { d.ui.proof.filter = f })
export const setSort = (v: UiState['proof']['sort']): void => update((d) => { d.ui.proof.sort = v })

/**
 * Add a marker for a note to the DAW, named by what kind of finding it is ("MISREAD: …") so it reads on a crowded timeline.
 * The DAW answers; a refusal shows the DAW's own reason. One undo point.
 */
export function addMarkerFor(id: number): void {
  const r = noteOf(id)
  if (!r) return
  const res = daw().addMarker(r.chapterId, r.sec, r.h, r.ty.toUpperCase())
  if (res.refused || !res.changed) { toast(res.message); return }
  const e = act('Added a marker in ' + dawLabel(daw().capabilities().daw), () => {}, { daw: true })
  toastUndo(res.message, e, 6000)
}

/**
 * A new check of these chapters: notes whose evidence it hears differently take the new evidence. A decision made on the old evidence is
 * not carried over silently; the page shows what changed. Returns how many notes changed.
 */
export function recheckNotes(chapterIds?: string[]): number {
  const s = getState()
  const ids = chapterIds ?? [...new Set(s.data.proofNotes.map((n) => n.chapterId))]
  const hits = speech().recheck(ids)
  let changed = 0
  update((d) => {
    for (const h of hits) {
      const n = noteIn(d, h.id)
      if (!n) continue
      const key = evidenceKey({ heard: h.heard, conf: h.conf })
      if (key === n.evidence) continue
      n.heard = h.heard
      n.conf = h.conf
      n.confReason = h.confReason
      n.evidence = key
      changed++
    }
  })
  return changed
}
export const clearFilters = (): void => update((d) => { d.ui.proof.filter = 'all'; d.ui.proof.query = '' })
export const toggleInView = (): void => update((d) => { d.ui.proof.winFilter = !d.ui.proof.winFilter })
export const setQuery = (q: string): void => update((d) => { d.ui.proof.query = q })
export const openFindNotes = (): void => {
  update((d) => { d.ui.proof.findOpen = true })
  setTimeout(() => {
    const f = document.querySelector<HTMLInputElement>('#pfind')
    f?.focus()
    f?.select()
  }, 0)
}
export const toggleFindNotes = (): void => {
  const open = getState().ui.proof.findOpen
  update((d) => { d.ui.proof.findOpen = !open })
  if (!open) setTimeout(() => document.querySelector<HTMLInputElement>('#pfind')?.focus(), 0)
}
export const closeFindNotes = (): void => update((d) => { d.ui.proof.query = ''; d.ui.proof.findOpen = false })
export const allChapters = (): void => update((d) => { d.ui.proof.scope = 'all' })
export const setWho = (w: 'proofer' | 'you'): void => update((d) => { d.ui.proof.who = w })

/* The notes thread on a finding. */
export function addMessage(id: number, text: string): boolean {
  const tx = text.trim()
  if (!tx) { toast('Write the note first.'); return false }
  update((d) => {
    const r = noteIn(d, id)
    if (!r) return
    const t = (r.thread ??= threadOf(r))
    t.push({ who: d.ui.proof.who, text: tx, at: fmtD(parseIso(d.data.today)) })
  })
  return true
}
export const editMessage = (i: number | null): void => update((d) => { d.ui.proof.edit = i })
export function saveMessage(id: number, text: string): void {
  const v = text.trim()
  update((d) => {
    const r = noteIn(d, id)
    const i = d.ui.proof.edit
    if (r && v && i != null) {
      const t = (r.thread ??= threadOf(r))
      if (t[i]) t[i].text = v
    }
    d.ui.proof.edit = null
  })
}
export function deleteMessage(id: number, i: number): void {
  const e = act('Deleted a note', (d) => {
    const r = noteIn(d, id)
    if (!r) return
    const t = (r.thread ??= threadOf(r))
    t.splice(i, 1)
  })
  toastUndo('Note deleted.', e, 6000)
}
