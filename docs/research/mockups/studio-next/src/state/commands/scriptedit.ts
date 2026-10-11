/**
 * Editing from the script. The text is never edited: the narrator places a cursor, selects words, and acts on them. Every change goes to the
 * DAW first (DawAdapter.deleteRange / applyFxToRange, behind the `cutRange` and `fxRange` capabilities) and is only made in the app when the
 * DAW accepts; it is one undo step in the app's history. Nothing is ever applied by looking: a cut and an effect are always asked first.
 */
import type { Draft } from 'immer'
import { dawOk, type DawResult } from '@/domain/daw'
import type { EditCut, WordFx } from '@/domain/schemas'
import { clock } from '@/format/time'
import { guidOf } from '@/format/guid'
import { alignment } from '@/providers/alignment'
import { fxChains } from '@/providers/fxchains'
import { modals } from '@/app/modals'
import { STRIP_MIN_WIDTH } from '@/app/layout'
import { capsOf, dawLabel, editGateOf, rangePlanOf } from '@/selectors/daw'
import { coverage, capState, chapterSeconds, passagesOf, activeTake, spanFor } from '@/selectors/editing'
import { curTime } from '@/selectors/cuts'
import {
  buildDoc, firstFrom, flagOf, flagged, itemAt, itemKeyOf, laterAudio, rangeKeys, scriptSpan, selKeys, stepKey, stepPhrase, summarize,
  type ChapterDoc, type DocItem, type FlagKind, type SelSummary,
} from '@/selectors/scriptedit'
import { daw } from '@/state/daw'
import { announce, toast, toastUndo } from '@/ui/overlay'
import { act, getState, undoEntry, update } from '../store'
import type { HistoryEntry, StudioState } from '../types'
import { backupBefore } from './backups'
import { addPickupByHand } from './pickups'
import { copyText, saveMark } from './script'
import { shiftAfter } from './stacking'
import { keepTake, hideOtherTakes, toggleHideOthers, keepFocusedTake, splitDuplicate, stopEditPlay } from './editing'

const r3 = (n: number): number => Math.round(n * 1000) / 1000
const plural = (n: number, one: string, many: string): string => n + ' ' + (n === 1 ? one : many)

/* ---- The document under the cursor ---- */
let cache: { data: StudioState['data']; chapter: string; aln: string; doc: ChapterDoc } | null = null
/** The chapter's script set against what was heard, as of now. Built again only when the book, the chapter or the transcription changes. */
export function docNow(): ChapterDoc {
  const s = getState()
  if (cache && cache.data === s.data && cache.chapter === s.ui.chapter && cache.aln === s.mock.alignment) return cache.doc
  const doc = buildDoc(s.data, s.ui.chapter)
  cache = { data: s.data, chapter: s.ui.chapter, aln: s.mock.alignment, doc }
  return doc
}
export const selectedKeys = (): string[] => {
  const ed = getState().ui.editing
  const doc = docNow()
  return ed.sel ? selKeys(doc, ed.sel) : ed.cursor && doc.index.has(ed.cursor) ? [ed.cursor] : []
}
const itemOf = (key: string | null): DocItem | null => {
  const doc = docNow()
  return key == null ? null : doc.items[doc.index.get(key) ?? -1] ?? null
}
/** What the narrator hears of the selection said aloud: for the screen reader. */
function announceSel(): void {
  const s = getState()
  const ed = s.ui.editing
  if (!ed.sel) return
  const sum = summarize(s.data, docNow(), selKeys(docNow(), ed.sel))
  announce(plural(sum.items.length, 'word', 'words') + ' selected' + (sum.audible.length ? ', ' + clock(sum.start) + ' to ' + clock(sum.end) : '') + (sum.allExtra ? ', not in the script' : ''))
}

/* ---- Cursor and selection ---- */
const passageOfKey = (key: string | null): string | null => {
  if (!key) return null
  const s = getState()
  const pid = key.split(':')[0]
  return passagesOf(s.data, s.ui.chapter).find((p) => p.pid === pid)?.id ?? null
}
function place(d: Draft<StudioState>, key: string | null, sel: { anchor: string; head: string } | null): void {
  const e = d.ui.editing
  e.cursor = key
  e.sel = sel
  const ps = passageOfKey(key)
  if (ps && ps !== e.passage) { e.passage = ps; e.take = null; e.abA = null; e.abB = null }
  if (key && e.flag && e.flag !== key && !e.flag.startsWith('dup:')) e.flag = null
}
/** Put the cursor on a word (a click). With Shift the selection runs from where the cursor was. */
export function clickWord(key: string, shift = false): void {
  const ed = getState().ui.editing
  if (shift && (ed.cursor || ed.sel)) {
    const anchor = ed.sel?.anchor ?? ed.cursor!
    update((d) => place(d, key, { anchor, head: key }))
    announceSel()
    return
  }
  const it = itemOf(key)
  /* A flagged word that is not an extra run (a misread, a word not read, one the recogniser was unsure of) opens its card. */
  update((d) => { place(d, key, null); if (it && it.st !== 'extra' && flagOf(it)) d.ui.editing.flag = key })
}
/** Select from one word to another (a drag). */
export function selectBetween(anchor: string, head: string): void {
  update((d) => place(d, head, { anchor, head }))
  announceSel()
}
/** Select one whole word (a double click). */
export const selectWord = (key: string): void => selectBetween(key, key)
export function selectKeys(keys: string[]): void {
  if (!keys.length) return
  update((d) => place(d, keys[keys.length - 1], { anchor: keys[0], head: keys[keys.length - 1] }))
  announceSel()
}
/** Left and right: the word before or after. A selection collapses to its end first. */
export function moveCursor(d: number): void {
  const ed = getState().ui.editing
  const from = ed.sel?.head ?? ed.cursor
  const to = stepKey(docNow(), from, d)
  if (to) update((x) => place(x, to, null))
}
/** Ctrl with left and right: the Booth's step by phrase. */
export function movePhrase(d: 1 | -1): void {
  const ed = getState().ui.editing
  const to = stepPhrase(docNow(), ed.sel?.head ?? ed.cursor, d)
  if (to) update((x) => place(x, to, null))
}
/** Shift with left and right: one word more or less in the selection. */
export function extendSel(d: number): void {
  const ed = getState().ui.editing
  const doc = docNow()
  const anchor = ed.sel?.anchor ?? ed.cursor ?? stepKey(doc, null, 1)
  const head = ed.sel?.head ?? ed.cursor ?? anchor
  if (!anchor || !head) return
  /* A selection that starts at the cursor holds that word and the one stepped to. */
  const to = stepKey(doc, head, d)
  if (!to) return
  update((x) => place(x, to, { anchor, head: to }))
  announceSel()
}
/** Escape: close the card, then clear the selection, then let the cursor go. Returns whether it did anything. */
export function clearSel(): boolean {
  const ed = getState().ui.editing
  if (ed.flag) { update((d) => { d.ui.editing.flag = null }); return true }
  if (ed.sel) { update((d) => { d.ui.editing.sel = null }); announce('Selection cleared'); return true }
  if (ed.take) { update((d) => { d.ui.editing.take = null }); return true }
  return false
}
/** The next or previous flagged word: extra words, a misread, a word not read, a word the recogniser was unsure of. */
export function jumpFlag(d: 1 | -1, kind?: FlagKind): void {
  const ed = getState().ui.editing
  const doc = docNow()
  const k = kind ?? (ed.flagKind as FlagKind | null) ?? undefined
  const list = k ? flagged(doc, k) : flagged(doc)
  if (!list.length) { toast('Nothing is flagged in this chapter.'); return }
  /* From the end of a selection going on, from its start going back, so a run of extra words is not found again. */
  const idx = (key: string | null | undefined): number => (key == null ? -1 : doc.index.get(key) ?? -1)
  const ends = ed.sel ? [idx(ed.sel.anchor), idx(ed.sel.head)] : [idx(ed.cursor)]
  const from = d > 0 ? Math.max(...ends) : Math.min(...ends)
  const hit = (d > 0 ? list.find((x) => (doc.index.get(x.key) ?? 0) > from) : [...list].reverse().find((x) => (doc.index.get(x.key) ?? 0) < from)) ?? (d > 0 ? list[0] : list[list.length - 1])
  focusFlag(hit)
}
/** Put the cursor on a flagged word: an extra run is selected whole, and the card opens for a word. */
export function focusFlag(it: DocItem): void {
  const doc = docNow()
  if (it.st === 'extra') {
    const run = doc.items.filter((x) => x.pid === it.pid && x.st === 'extra' && x.run === it.run && !x.cut)
    const dup = run.some((x) => x.dup)
    update((d) => {
      place(d, run[run.length - 1].key, { anchor: run[0].key, head: run[run.length - 1].key })
      d.ui.editing.flag = dup ? 'dup:' + it.pid : run[0].key
    })
    announceSel()
    return
  }
  update((d) => { place(d, it.key, null); d.ui.editing.flag = it.key })
}
export const openFlag = (key: string | null): void => update((d) => { d.ui.editing.flag = key })
export const setFlagKind = (kind: FlagKind | null): void => update((d) => { d.ui.editing.flagKind = kind })

/* ---- Listening ---- */
let tick: ReturnType<typeof setInterval> | undefined
export function stopScript(): void {
  if (tick) clearInterval(tick)
  tick = undefined
  if (getState().ui.editing.playT != null) update((d) => { d.ui.editing.playT = null; d.ui.editing.playTo = null })
}
const endOf = (doc: ChapterDoc): number => doc.items.reduce((a, i) => (i.t1 != null && !i.cut ? Math.max(a, i.t1) : a), 0)
function runTick(): void {
  if (tick) clearInterval(tick)
  tick = setInterval(() => {
    const ed = getState().ui.editing
    if (ed.playT == null) { if (tick) clearInterval(tick); tick = undefined; return }
    const doc = docNow()
    const end = ed.playTo ?? endOf(doc)
    const t = r3(ed.playT + 0.1)
    if (t >= end) {
      const last = itemAt(doc, end)
      stopScript()
      if (last) update((d) => { d.ui.editing.cursor = last.key })
      return
    }
    update((d) => { d.ui.editing.playT = t })
  }, 100)
}
/** Play from a moment, on to the end of the chapter or of `to`. The text follows the word until the narrator scrolls by hand. */
export function playFrom(t: number, to?: number, label = 'from here'): void {
  stopEditPlay()
  toast(daw().playRange(t, to ?? endOf(docNow()), label).message)
  update((d) => { d.ui.editing.playT = t; d.ui.editing.playTo = to ?? null; d.ui.editing.follow = true })
  runTick()
}
export const isPlayingScript = (): boolean => getState().ui.editing.playT != null
/** The word playing now. */
export const playingKey = (): string | null => {
  const t = getState().ui.editing.playT
  return t == null ? null : itemAt(docNow(), t)?.key ?? null
}
/** Space: play from the cursor, or play the selection; again, pause where it is. */
export function togglePlay(): void {
  const s = getState()
  const ed = s.ui.editing
  if (ed.playT != null) {
    const at = playingKey()
    stopScript()
    if (at) update((d) => { d.ui.editing.cursor = at })
    return
  }
  const doc = docNow()
  if (!doc.aligned) { toast('Nothing has been transcribed yet.'); return }
  if (ed.sel) {
    const sum = summarize(s.data, doc, selKeys(doc, ed.sel))
    if (sum.audible.length) { playFrom(sum.start, sum.end, 'the selection'); return }
  }
  const from = firstFrom(doc, ed.cursor)
  if (!from || from.t0 == null) { toast('Nothing was recorded from here.'); return }
  playFrom(from.t0)
}
/** Play the words the menu was opened on. */
export function playSelection(): void {
  const s = getState()
  const doc = docNow()
  const sum = summarize(s.data, doc, selectedKeys())
  if (sum.audible.length) playFrom(sum.start, sum.end, 'the selection')
  else toast('Nothing was recorded for these words.')
}
/** Step the playing position a word on (or back) while it plays, or the cursor when it does not. */
export function skipWord(d: 1 | -1): void {
  if (getState().ui.editing.playT == null) { moveCursor(d); return }
  const doc = docNow()
  const now = itemAt(doc, getState().ui.editing.playT!)
  const to = stepKey(doc, now?.key ?? null, d)
  const it = itemOf(to)
  if (it?.t0 != null) update((x) => { x.ui.editing.playT = it.t0! })
}
export const setFollow = (on: boolean): void => update((d) => { if (d.ui.editing.follow !== on) d.ui.editing.follow = on })

/* ---- The drawer and the strip ---- */
export const stripFits = (): boolean => document.documentElement.clientWidth >= STRIP_MIN_WIDTH
/** S: the timeline strip under the script where it fits; where it does not, the timeline in the drawer. */
export function toggleStrip(): void {
  if (stripFits()) update((d) => { d.ui.editing.strip = !d.ui.editing.strip })
  else update((d) => { d.ui.editing.drawer = d.ui.editing.drawer === 'timeline' ? null : 'timeline' })
}

/* ---- Takes from the text ---- */
const passageIn = (id: string | null) => (id ? getState().data.passages.find((p) => p.id === id) : undefined)
export function toggleTakes(passageId: string): void {
  update((d) => {
    const o = d.ui.editing.openTakes
    const i = o.indexOf(passageId)
    if (i >= 0) o.splice(i, 1)
    else o.push(passageId)
    d.ui.editing.passage = passageId
  })
}
/** The passage the keys are in: the one under the cursor, else the one last chosen. */
export const currentPassage = (): string | null => {
  const s = getState()
  return s.ui.editing.cursor ? passageOfKey(s.ui.editing.cursor) : s.ui.editing.passage ?? passagesOf(s.data, s.ui.chapter)[0]?.id ?? null
}
/** T: open the takes under the line; again, move the keys to the next take. Shift+T: the one before. */
export function cycleTake(d: 1 | -1): void {
  const s = getState()
  const id = currentPassage()
  const p = passageIn(id)
  if (!p) { toast('This line has one take.'); return }
  const shown = s.ui.editing.revealed.includes(p.id) ? p.takes : p.takes.filter((t) => !t.hidden)
  if (!s.ui.editing.openTakes.includes(p.id)) {
    update((x) => { x.ui.editing.openTakes.push(p.id); x.ui.editing.passage = p.id; x.ui.editing.take = (activeTake(p) ?? shown[0])?.id ?? null })
    return
  }
  const cur = shown.findIndex((t) => t.id === (s.ui.editing.take ?? activeTake(p)?.id))
  const next = shown[(Math.max(0, cur) + d + shown.length) % shown.length]
  update((x) => { x.ui.editing.passage = p.id; x.ui.editing.take = next.id })
}
export { keepFocusedTake, toggleHideOthers, keepTake, hideOtherTakes, splitDuplicate }

/* ---- Words the narrator accepts ---- */
/** "Keep this addition" / "It is right": the words stop being flagged. Recorded; Undo puts the flag back. */
export function acceptWords(keys: string[]): void {
  const doc = docNow()
  const fresh = keys.filter((k) => doc.index.has(k) && !getState().data.accepted.includes(k))
  if (!fresh.length) return
  const e = act('Kept ' + plural(fresh.length, 'flagged word', 'flagged words') + ' as read', (d) => { fresh.forEach((k) => d.data.accepted.push(k)) })
  update((d) => { d.ui.editing.flag = null })
  toastUndo('Not flagged any more.', e, 6000)
}

/* ---- Marks, notes, pickups ---- */
export function markWords(keys: string[], markKey: string, text = ''): boolean {
  const s = getState()
  const items = keys.map((k) => itemOf(k)).filter((i): i is DocItem => !!i)
  const para = s.data.paragraphs.find((p) => p.id === items[0]?.pid)
  const g = para ? scriptSpan(para, items) : null
  if (!g) { toast('Only words of the script can be marked.'); return false }
  return saveMark(g, markKey, text)
}
export function markForPickup(keys: string[]): void {
  const s = getState()
  const sum = summarize(s.data, docNow(), keys)
  const first = sum.items[0]
  if (!first) return
  const para = s.data.paragraphs.find((p) => p.id === first.pid)
  const scriptWords = sum.items.filter((i) => i.kind === 'w').map((i) => i.text).join(' ')
  const line = scriptWords || (para ? para.text.slice(0, 60) : '')
  if (addPickupByHand(s.ui.chapter, first.t0 != null ? clock(first.t0) : '', line)) toast('Added to Pickups.')
}
export function copyWords(keys: string[]): void {
  copyText(summarize(getState().data, docNow(), keys).items.map((i) => i.text).join(' '))
}

/* ---- Cutting ---- */
export interface CutOptions { mode: 'close' | 'gap'; fadeMs: number; padMs: number }
export const DEFAULT_CUT: CutOptions = { mode: 'close', fadeMs: 12, padMs: 0 }
export const FADE_CHOICES = [0, 6, 12, 25] as const
export const PAD_CHOICES = [0, 50, 100] as const
/** The default join of a split for an effect, in milliseconds. */
export const FX_FADE_MS = 8

const viaDaw = (fn: () => DawResult, own: string): DawResult => (capsOf(getState().mock).daw === 'builtin' ? dawOk(own, { undoSteps: 0 }) : fn())
const cutId = (b: StudioState['data']): string => 'cut' + (b.cuts.reduce((m, c) => Math.max(m, +c.id.replace(/\D/g, '') || 0), 0) + 1)
const fxId = (b: StudioState['data']): string => 'wfx' + (b.wordFx.reduce((m, c) => Math.max(m, +c.id.replace(/\D/g, '') || 0), 0) + 1)
const cutEntries = new Map<string, HistoryEntry>()
const fxEntries = new Map<string, HistoryEntry>()

/** Why the selection cannot be cut, in words; empty when it can. */
export function cutRefusal(sum: SelSummary): string {
  const gate = editGateOf(getState().mock, 'cutRange')
  if (!gate.ok) return gate.reason
  if (!sum.audible.length) return sum.hasCut ? 'These words are cut already.' : 'There is no audio for these words.'
  return ''
}
/** Ask before cutting: the dialog shows what will go. */
export function requestDelete(keys = selectedKeys(), mute = false): void {
  const sum = summarize(getState().data, docNow(), keys)
  const why = cutRefusal(sum)
  if (why) { toast(why); return }
  modals.cutWords({ keys, mute })
}

/** Shift the audio after a closed cut up by its length: the takes, findings, effects and notes that follow it. */
function ripple(d: Draft<StudioState>, chapterId: string, r: { start: number; end: number; takeId?: string }): void {
  const exact = r.end - r.start
  d.data.passages.forEach((p) => {
    p.takes.forEach((t) => {
      if (t.id === r.takeId) t.len = Math.max(0.1, r3(t.len - exact))
    })
  })
  shiftAfter(d, chapterId, r.end, -exact, '', r3)
  d.data.fxRegions.forEach((x) => {
    if (x.chapterId === chapterId && x.start < r.start && x.end > r.end) x.end = r3(Math.max(x.start + 0.1, x.end - exact))
  })
}

/**
 * Cut the words (and their audio) from the script. The DAW is asked first for each range; a refusal changes nothing. Audacity, which changes
 * the audio itself, has the stretch backed up before. One undo step in the app, and the words stay in the text, struck through, until undone.
 */
export function deleteWords(keys: string[], opt: CutOptions = DEFAULT_CUT, mute = false): boolean {
  const s = getState()
  const doc = docNow()
  const sum = summarize(s.data, doc, keys, opt.padMs)
  const why = cutRefusal(sum)
  if (why) { toast(why); return false }
  const plan = rangePlanOf(s.mock)
  const chapterId = s.ui.chapter
  const made: EditCut[] = []
  const backups: Array<string | undefined> = []
  for (const r of sum.ranges) {
    if (plan.backup) {
      const bk = backupBefore(chapterId, (r.start + r.end) / 2, mute ? 'Mute words' : 'Delete words', undefined, { start: r.start, end: r.end })
      if (!bk) { toast('The audio could not be backed up, so nothing was changed.'); return false }
      backups.push(bk.id)
    } else backups.push(undefined)
  }
  const results: DawResult[] = []
  for (const r of sum.ranges) {
    const key = itemKeyOf(s.data, chapterId, r.pid)
    const res = viaDaw(
      () => daw().deleteRange({ chapterId, itemKey: key, itemGuid: guidOf('item', key), start: r.start, end: r.end, words: r.items.length, mode: opt.mode, fadeMs: opt.fadeMs }),
      'Added the cut to the edit list.',
    )
    if (res.refused) { toast(res.refused); return false }
    results.push(res)
  }
  const n = sum.audible.length
  const label = (mute ? 'Muted ' : 'Deleted ') + plural(n, 'word', 'words') + (mute ? '' : ' and their audio') + ' at ' + clock(sum.start)
  const e = act(label, (d) => {
    sum.ranges.forEach((r, i) => {
      const id = cutId(d.data)
      d.data.cuts.push({
        id, chapterId, pid: r.pid, ...(r.takeId ? { takeId: r.takeId } : {}), keys: r.keys, text: r.text, a: r.a, b: r.b, off0: r.off0, off1: r.off1,
        mode: opt.mode, fadeMs: opt.fadeMs, daw: plan.daw, guid: guidOf('cut', id + '/' + chapterId), ...(backups[i] ? { backupId: backups[i] } : {}), at: d.data.today,
      })
      made.push(d.data.cuts[d.data.cuts.length - 1] as EditCut)
      if (opt.mode === 'close') ripple(d, chapterId, r)
    })
    d.ui.editing.sel = null
    d.ui.editing.flag = null
  }, { daw: true })
  made.forEach((c) => cutEntries.set(c.id, e))
  toastUndo(results[0].message, e, 8000)
  return true
}

/** Put cut words back: the cut is undone (one step, as it was made). Refused with the reason when something later touched the same audio. */
export function restoreCut(id: string): boolean {
  const e = cutEntries.get(id)
  if (e && getState().history.some((h) => h.id === e.id)) {
    const r = undoEntry(e)
    toast(r.message)
    return r.ok
  }
  const s = getState()
  toast('Undo it in ' + dawLabel(capsOf(s.mock).daw) + ' (Edit > Undo). The app can only undo what it did this session.')
  return false
}
export function restoreWords(keys: string[]): void {
  const ids = [...new Set(keys.map((k) => itemOf(k)?.cut).filter((x): x is string => !!x))]
  ids.forEach(restoreCut)
}

/* ---- Effects on words ---- */
export interface FxPlan {
  sum: SelSummary
  range: SelSummary['ranges'][number] | null
  /** Why the effect cannot go on these words, in words; empty when it can. */
  refusal: string
  /** Three pieces: where the item is split, the middle one carries the chain. */
  split: { start: number; end: number; before: number; after: number } | null
  coverage: { before: number; after: number; over: boolean; far: boolean }
}
/** What adding an effect to the selected words comes to. A selection that crosses a take is refused: an effect needs one stretch. */
export function fxPlanFor(keys: string[]): FxPlan {
  const s = getState()
  const sum = summarize(s.data, docNow(), keys, 0)
  const gate = editGateOf(s.mock, 'fxRange')
  const range = sum.ranges[0] ?? null
  let refusal = ''
  if (!gate.ok) refusal = gate.reason
  else if (!sum.audible.length) refusal = 'There is no audio for these words.'
  else if (sum.ranges.length > 1) refusal = 'These words sit in more than one take. An effect needs words from one take.'
  const total = chapterSeconds(s.data, s.ui.chapter)
  const cov = coverage(s.data, s.ui.chapter, s.mock.setup)
  const after = range ? coverage(s.data, s.ui.chapter, s.mock.setup, [spanFor('section', range.start, range.end, total)]) : cov
  const st = capState(after.pct, s.data.editor.fxCapPct)
  const firstT = docNow().items.find((i) => i.pid === range?.pid && i.t0 != null && !i.cut && i.st !== 'miss')
  return {
    sum, range, refusal,
    split: range ? { start: range.start, end: range.end, before: Math.max(0, range.start - (firstT?.t0 ?? range.start)), after: 0 } : null,
    coverage: { before: cov.pct, after: after.pct, over: st !== 'within', far: st === 'far' },
  }
}
/** The chains the connected DAW offers for Add FX (the DAW's own list, never named by a screen). */
export const fxListNow = () => fxChains().list(capsOf(getState().mock).daw)
/** Ask before an effect goes on words: the dialog shows the split, the chain and how the DAW undoes it. */
export function requestFx(keys = selectedKeys(), chainId?: string): void {
  const p = fxPlanFor(keys)
  if (p.refusal) { toast(p.refusal); return }
  modals.wordFx({ keys, chainId })
}
/**
 * Split at the range and put the chain on the middle piece. The DAW is asked first (Audacity: after a backup, since it changes the audio itself).
 * `over` says the narrator has seen that it takes effect coverage over the cap. One undo step.
 */
export function applyWordFx(keys: string[], chainId: string, over = false): boolean {
  const s = getState()
  const p = fxPlanFor(keys)
  if (p.refusal || !p.range) { toast(p.refusal || 'Nothing to add the effect to.'); return false }
  if (p.coverage.over && !over) return false
  const list = fxListNow()
  const choice = list.choices.find((c) => c.id === chainId)
  if (!choice) { toast('That effect is not in the list any more.'); return false }
  const plan = rangePlanOf(s.mock)
  const r = p.range
  const chapterId = s.ui.chapter
  let backupId: string | undefined
  if (plan.backup) {
    const bk = backupBefore(chapterId, (r.start + r.end) / 2, 'Add ' + choice.name, undefined, { start: r.start, end: r.end })
    if (!bk) { toast('The audio could not be backed up, so nothing was changed.'); return false }
    backupId = bk.id
  }
  const key = itemKeyOf(s.data, chapterId, r.pid)
  const res = viaDaw(
    () => daw().applyFxToRange({ chapterId, itemKey: key, itemGuid: guidOf('item', key), start: r.start, end: r.end, words: r.items.length, chainId: choice.id, chainName: choice.name, fadeMs: FX_FADE_MS }),
    'Added the effect to the edit list.',
  )
  if (res.refused) { toast(res.refused); return false }
  const id = fxId(s.data)
  const label = 'Added ' + choice.name + ' to ' + plural(r.items.length, 'word', 'words') + ' at ' + clock(r.start)
  const entry = act(label, (d) => {
    d.data.wordFx.push({
      id, chapterId, pid: r.pid, ...(r.takeId ? { takeId: r.takeId } : {}), keys: r.keys, text: r.text, a: r.a, b: r.b, off0: r.off0, off1: r.off1,
      chainId: choice.id, chainName: choice.name, source: list.source, fadeMs: FX_FADE_MS, daw: plan.daw, guid: guidOf('wordfx', id + '/' + chapterId),
      ...(backupId ? { backupId } : {}), at: d.data.today,
    } satisfies WordFx)
    d.ui.editing.fx = id
  }, { daw: true })
  fxEntries.set(id, entry)
  toastUndo(res.message, entry, 8000)
  return true
}
/** Take the effect off the words again. */
export function removeWordFx(id: string): boolean {
  const f = getState().data.wordFx.find((x) => x.id === id)
  if (!f) return false
  const res = viaDaw(() => daw().removeFxFromRange(f.guid, f.chainName), 'Removed the effect from the edit list.')
  if (res.refused) { toast(res.refused); return false }
  const e = act('Took ' + f.chainName + ' off ' + f.text, (d) => { d.data.wordFx = d.data.wordFx.filter((x) => x.id !== id) }, { daw: true })
  toastUndo(res.message, e, 8000)
  return true
}
/** The effect on a word, for the underline and the menu. */
export const wordFxOf = (key: string): WordFx | undefined => getState().data.wordFx.find((f) => f.keys.includes(key))
/** Where a word effect sits now, in seconds. */
export const wordFxSpan = (f: WordFx): { start: number; end: number } => ({ start: curTime(getState().data.cuts, f.a), end: curTime(getState().data.cuts, f.b) })

/** What "Later audio" says in the delete dialog. */
export const laterOf = (sum: SelSummary): { before: number; after: number } | null => (sum.ranges.length ? laterAudio(docNow(), sum.ranges[sum.ranges.length - 1]) : null)
export { rangeKeys, alignment }
