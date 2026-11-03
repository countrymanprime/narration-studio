/**
 * Editing commands: choosing takes, cleaning up findings and putting effects on parts of a chapter.
 * Every change the DAW also makes goes through `act(..., { daw: true })` with a toast that offers Undo.
 */
import { dawOk, type DawResult } from '@/domain/daw'
import type { Passage, Take } from '@/domain/schemas'
import { clock } from '@/format/time'
import {
  EDIT_TEXT, EFFECTS, activeTake, amountOf, appliedLabel, capState, chapterSeconds, chapterTakes, cleanupRows, coverage, duplicateRead, initialParams,
  levelOf, nextRegionId, opSpec, passagesOf, passageStart, proposals, regionName, regionsOf, selectedRows, shownTakes, spanFor,
  type CleanupKind, type CleanupParams, type CleanupRow, type DrawerTab, type Level, type ParamKey,
} from '@/selectors/editing'
import { suggestTake } from '@/selectors/takes'
import { capsOf, editGateOf } from '@/selectors/daw'
import { PREP_STEPS } from '@/fixtures/takes'
import { TARGET_RMS_DB } from '@/config/estimates'
import { setNoteRes } from './notes'
import { backupBefore } from './backups'
import { DEAD_AIR_LIMIT } from '@/config/estimates'
import { daw } from '@/state/daw'
import { toast, toastUndo } from '@/ui/overlay'
import { act, getState, undoEntry, update } from '../store'
import type { HistoryEntry, StudioState } from '../types'
import type { FxDraft } from '../slices/ui'

const round1 = (n: number): number => Math.round(n * 10) / 10
/**
 * Changes that live in the DAW go to the DAW. The built-in recorder is the app's own, so there the app makes the change itself and says so.
 * The DAW is asked first: a change it refuses (stale ids, a capability it lacks, not running) is not made in the app either, and the
 * refusal, in the DAW's own words, is shown.
 */
const viaDaw = (fn: () => DawResult, own: string): DawResult => (capsOf(getState().mock).daw === 'builtin' ? dawOk(own) : fn())
function refusedBy(r: DawResult): boolean {
  if (r.refused) toast(r.refused)
  return !!r.refused
}

/** Open the drawer on a part, or close it when that part is already showing. */
export function toggleDrawer(tab: DrawerTab): void {
  update((d) => { d.ui.editing.drawer = d.ui.editing.drawer === tab ? null : tab })
}
export const openDrawer = (tab: DrawerTab): void => update((d) => { d.ui.editing.drawer = tab })
export const closeDrawer = (): void => update((d) => { d.ui.editing.drawer = null })

/* ---- Takes ---- */
const passageIn = (id: string | null): Passage | undefined => (id == null ? undefined : getState().data.passages.find((p) => p.id === id))

/** The undo entry of each kept take, so "Undo choice" can undo exactly that change. */
const keepEntries = new Map<string, HistoryEntry>()
/**
 * Keep a take: it becomes the active one and the others are muted. Nothing is deleted. A proof note about these takes is decided with it.
 */
export function keepTake(passageId: string, takeId: string): void {
  const p = passageIn(passageId)
  const t = p?.takes.find((x) => x.id === takeId)
  if (!p || !t) return
  const res = viaDaw(() => daw().setActiveTake(takeId, passageId), takeId + ' is the active take; the others are muted.')
  if (refusedBy(res)) return
  const e = act('Kept ' + takeId + '; the other takes are muted', (d) => {
    const dp = d.data.passages.find((x) => x.id === passageId)!
    dp.takes.forEach((x) => { x.active = x.id === takeId })
    dp.kept = true
    d.data.proofNotes.forEach((n) => { if (n.ty === 'takes' && n.chapterId === p.chapterId && n.pid === p.pid && !n.res) setNoteRes(d, n, 'keep') })
  }, { daw: true })
  keepEntries.set(passageId, e)
  toastUndo(res.message, e, 8000)
}
export function undoKeep(passageId: string): void {
  const e = keepEntries.get(passageId)
  if (e && getState().history.some((h) => h.id === e.id)) {
    const r = undoEntry(e)
    if (!r.ok) toast(r.message)
    return
  }
  update((d) => {
    const dp = d.data.passages.find((x) => x.id === passageId)
    if (!dp) return
    dp.kept = false
    d.data.proofNotes.forEach((n) => { if (n.ty === 'takes' && n.chapterId === dp.chapterId && n.pid === dp.pid && n.res === 'keep') setNoteRes(d, n, null) })
  })
}
/**
 * Hide the takes that are not active: they are muted and put out of the way, and one undo brings them back. Nothing is deleted; deleting
 * a take is left to the DAW.
 */
export function hideOtherTakes(passageId: string): void {
  const p = passageIn(passageId)
  if (!p || !p.kept) return
  const n = p.takes.filter((t) => !t.active && !t.hidden).length
  if (!n) return
  const label = 'Hid ' + n + ' other ' + (n > 1 ? 'takes' : 'take')
  const res = viaDaw(() => daw().hideTakes(n), label + '. They are still in the project.')
  if (refusedBy(res)) return
  const e = act(label, (d) => {
    d.data.passages.find((x) => x.id === passageId)!.takes.forEach((t) => { if (!t.active) t.hidden = true })
    d.ui.editing.revealed = d.ui.editing.revealed.filter((x) => x !== passageId)
  }, { daw: true })
  toastUndo(res.message, e, 8000)
}
/** Look at the hidden takes of a passage, or put them away again. Nothing changes in the DAW. */
export function toggleRevealed(passageId: string): void {
  update((d) => {
    const r = d.ui.editing.revealed
    const i = r.indexOf(passageId)
    if (i >= 0) r.splice(i, 1)
    else r.push(passageId)
  })
}

/**
 * Apply one preparation step (trim white space, trim breaths, normalise) to the takes of a passage. It is never done by the suggestion:
 * the narrator chooses, and the suggestion is worked out again from the prepared takes. In Audacity the audio around it is backed up first.
 */
export function applyPrep(passageId: string, stepId: string): void {
  const p = passageIn(passageId)
  const step = PREP_STEPS.find((x) => x.id === stepId)
  if (!p || !step || (p.prepped ?? []).includes(stepId)) return
  const n = p.takes.filter((t) => !t.hidden).length
  const label = step.label + ' at ' + clock(passageStart(p))
  const ok = editGateOf(getState().mock, 'cleanup')
  if (!ok.ok) { toast(ok.reason); return }
  backupBefore(p.chapterId, passageStart(p), step.label)
  const res = viaDaw(
    () => (stepId === 'trim-silence' ? daw().trimGaps(n, DEAD_AIR_LIMIT) : daw().applyFix(label, stepId === 'normalise' ? 'normalise' : 'breaths', n, stepId === 'normalise' ? TARGET_RMS_DB : opSpec('breaths').levels.standard.reduce ?? 0)),
    step.label + ' done.',
  )
  if (refusedBy(res)) return
  const e = act(label, (d) => {
    const dp = d.data.passages.find((x) => x.id === passageId)!
    dp.prepped = [...(dp.prepped ?? []), stepId]
  }, { daw: true })
  toastUndo(res.message, e, 8000)
}

/**
 * A take that reads the line twice is cut at the second read so each read is a take of its own. Where the DAW can make the cut it does
 * (and the audio around it is backed up first); the built-in recorder cuts its own take.
 */
export function splitDuplicate(passageId: string): void {
  const s = getState()
  const p = passageIn(passageId)
  const dup = p ? duplicateRead(s.data, p) : null
  if (!p || !dup) return
  const t = p.takes[0]
  const ok = editGateOf(s.mock, 'takes')
  if (!ok.ok) { toast(ok.reason); return }
  backupBefore(p.chapterId, dup.at, 'Split a duplicate read')
  const res = viaDaw(() => daw().splitTake(t.id, dup.at), 'Split ' + t.id + ' in the app.')
  if (refusedBy(res)) return
  const e = act('Split a duplicate read at ' + clock(dup.at), (d) => {
    const dp = d.data.passages.find((x) => x.id === passageId)!
    const a: Take = { ...t, id: t.id + 'a', len: Math.round((dup.at - t.start) * 10) / 10, text: dup.first, active: false }
    const b: Take = { ...t, id: t.id + 'b', start: dup.at, len: Math.round((t.start + t.len - dup.at) * 10) / 10, text: dup.second, active: true }
    dp.takes = [a, b]
    dp.kept = false
  }, { daw: true })
  toastUndo(res.message, e, 8000)
}

/* ---- Keyboard: the take the keys are on, playing it, keeping it, hiding the others ---- */
/** The take the keyboard is on in this passage: the one chosen with Shift and the arrows, else the active one, else the first shown. */
export function focusedTake(p: Passage, ed: { take: string | null; revealed: string[] }): Take | undefined {
  const shown = ed.revealed.includes(p.id) ? p.takes : shownTakes(p)
  return shown.find((t) => t.id === ed.take) ?? activeTake(p) ?? shown[0]
}
let playTimer: ReturnType<typeof setTimeout> | undefined
/** Stop the take that is playing (the DAW has no transport in the mock: this is the page's own state). */
export function stopEditPlay(): void {
  if (playTimer) clearTimeout(playTimer)
  playTimer = undefined
  if (getState().ui.editing.playing != null) update((d) => { d.ui.editing.playing = null })
}
/** Play a take; played again while it plays, it stops. It ends by itself when the take does. The script's own playback gives way to it. */
export function playTake(passageId: string, takeId: string): void {
  const t = passageIn(passageId)?.takes.find((x) => x.id === takeId)
  if (!t) return
  if (getState().ui.editing.playing === takeId) { stopEditPlay(); toast('Stopped ' + t.id + '.'); return }
  stopEditPlay()
  toast(daw().playRange(t.start, t.start + t.len, t.id).message)
  update((d) => { d.ui.editing.playing = takeId; d.ui.editing.playT = null; d.ui.editing.playTo = null })
  playTimer = setTimeout(stopEditPlay, t.len * 1000)
}
/** Enter: keep the take the keys are on. Refused with the reason when the setup cannot do it; a take that is already kept says so. */
export function keepFocusedTake(): void {
  const s = getState()
  const p = passageIn(s.ui.editing.passage ?? passagesOf(s.data, s.ui.chapter)[0]?.id ?? null)
  const t = p && focusedTake(p, s.ui.editing)
  if (!p || !t) return
  const gate = editGateOf(s.mock, 'takes')
  if (!gate.ok) { toast(gate.reason); return }
  if (p.kept && t.active) { toast(t.id + ' is already the kept take.'); return }
  keepTake(p.id, t.id)
}
/** H: hide the other takes once one is kept; with them hidden, look at them or put them away again. */
export function toggleHideOthers(): void {
  const s = getState()
  const p = passageIn(s.ui.editing.passage ?? passagesOf(s.data, s.ui.chapter)[0]?.id ?? null)
  if (!p) return
  if (!p.kept) { toast(EDIT_TEXT.keepFirst + '.'); return }
  const others = p.takes.filter((t) => !t.active && !t.hidden).length
  if (others) hideOtherTakes(p.id)
  else if (p.takes.some((t) => t.hidden)) toggleRevealed(p.id)
}
export function playAllTakes(passageId: string): void {
  const p = passageIn(passageId)
  if (p) toast(daw().playSequence(p.takes.map((t) => [t.start, t.start + t.len] as [number, number]), 'every take in order').message)
}
/** The two takes being compared: what the narrator chose, else the active one against the suggested one. */
export function abPair(p: Passage, a: string | null, b: string | null, suggested: Take | undefined): [Take, Take] {
  const has = (id: string | null): Take | undefined => p.takes.find((t) => t.id === id)
  const ta = has(a) ?? activeTake(p) ?? p.takes[0]
  const tb = has(b) && has(b)!.id !== ta.id ? has(b)! : suggested && suggested.id !== ta.id ? suggested : p.takes.find((t) => t.id !== ta.id)!
  return [ta, tb]
}
export function playAB(passageId: string): void {
  const s = getState()
  const p = passageIn(passageId)
  const pool = p ? shownTakes(p) : []
  if (!p || pool.length < 2) return
  const [a, b] = abPair({ ...p, takes: pool }, s.ui.editing.abA, s.ui.editing.abB, suggestTake(s.data, p).take ?? undefined)
  toast(daw().playSequence([[a.start, a.start + a.len], [b.start, b.start + b.len]], a.id + ', then ' + b.id).message)
}
export const setAB = (which: 'abA' | 'abB', id: string): void => update((d) => { d.ui.editing[which] = id })

/* ---- Cleanup ---- */
export const setOp = (k: CleanupKind): void => update((d) => { d.ui.editing.op = k; d.ui.editing.row = null })
export function selectRow(key: string, _sec?: number): void {
  update((d) => { d.ui.editing.row = key })
}
export function setLevel(kind: CleanupKind, level: Level): void {
  update((d) => {
    d.ui.editing.level[kind] = level
    d.ui.editing.params[kind] = { ...opSpec(kind).levels[level] }
  })
}
export function setParam(kind: CleanupKind, key: ParamKey, value: number): void {
  update((d) => {
    const p = d.ui.editing.params[kind]
    p[key] = value
    d.ui.editing.level[kind] = levelOf(kind, p)
  })
}
export const resetParams = (): void => update((d) => { d.ui.editing.params = initialParams() })
export const toggleRow = (key: string, on: boolean): void => update((d) => {
  const s = d.ui.editing.skip
  const i = s.indexOf(key)
  if (on && i >= 0) s.splice(i, 1)
  else if (!on && i < 0) s.push(key)
})
export function setRows(keys: string[], on: boolean): void {
  update((d) => {
    const s = d.ui.editing.skip.filter((k) => !keys.includes(k))
    d.ui.editing.skip = on ? s : [...s, ...keys]
  })
}
export const setAdvanced = (open: boolean): void => update((d) => { if (d.ui.editing.advanced !== open) d.ui.editing.advanced = open })

const around = (r: CleanupRow): [number, number] => [Math.max(0, r.sec - 2), r.sec + r.dur + 2]
export function playRow(r: CleanupRow): void {
  toast(daw().playRange(...around(r), 'the finding at ' + clock(r.sec) + ', with 2 s before and after').message)
}
/** Preview the first few selected findings, each with 2 s before and after, before anything is applied. */
export function previewCleanup(kind: CleanupKind): void {
  const s = getState()
  const rows = selectedRows(proposals(s.data, s.ui.chapter, kind, s.ui.editing.params[kind]), s.ui.editing.skip)
  if (!rows.length) return
  const first = rows.slice(0, 3)
  toast(daw().playSequence(first.map(around), 'the first ' + first.length + ' of ' + rows.length + ' selected, with 2 s before and after').message)
}

/** Fix these findings in one step with Undo. Proof notes of the kind are marked fixed; so are the app's own detections. */
export function applyRows(kind: CleanupKind, rows: CleanupRow[], p: CleanupParams): void {
  const todo = rows.filter((r) => !r.done)
  if (!todo.length) return
  const n = todo.length
  const label = appliedLabel(kind, n, p)
  const notes = new Set(todo.filter((r) => r.src === 'note').map((r) => +r.id))
  const found = new Set(todo.filter((r) => r.src === 'detection').map((r) => r.id))
  const res = viaDaw(() => (kind === 'gaps' ? daw().trimGaps(n, amountOf(kind, p)) : daw().applyFix(label, kind, n, amountOf(kind, p))), label)
  if (refusedBy(res)) return
  const e = act(label, (d) => {
    d.data.proofNotes.forEach((x) => { if (notes.has(x.id)) setNoteRes(d, x, 'fixed') })
    d.data.detections.forEach((x) => { if (found.has(x.id)) x.res = 'fixed' })
  }, { daw: true })
  toastUndo(res.message, e, 8000)
}
/** Apply the selected proposals of one operation. */
export function applyCleanup(kind: CleanupKind): void {
  const s = getState()
  const p = s.ui.editing.params[kind]
  applyRows(kind, selectedRows(proposals(s.data, s.ui.chapter, kind, p), s.ui.editing.skip), p)
}
/** Shorten these gap findings (proof notes) to the limit. Proof's single-finding shortcut. */
export function shortenGaps(noteIds: number[]): void {
  const s = getState()
  const keys = noteIds.map((id) => 'note:' + id)
  const chapters = [...new Set(s.data.proofNotes.filter((n) => noteIds.includes(n.id)).map((n) => n.chapterId))]
  applyRows('gaps', chapters.flatMap((c) => cleanupRows(s.data, c, 'gaps')).filter((r) => keys.includes(r.key)), { limit: DEAD_AIR_LIMIT })
}

/* ---- Effects ---- */
export const selectFx = (id: string): void => update((d) => { d.ui.editing.fx = id })
export function moveFx(delta: number): void {
  const s = getState()
  const list = regionsOf(s.data, s.ui.chapter)
  if (!list.length) return
  const i = Math.max(0, list.findIndex((r) => r.id === s.ui.editing.fx))
  selectFx(list[Math.max(0, Math.min(list.length - 1, i + delta))].id)
}
export function setCap(pct: number): void { update((d) => { d.data.editor.fxCapPct = pct }) }

export function openAdd(at = 60): void {
  update((d) => {
    const e = d.ui.editing
    const total = chapterSeconds(d.data, d.ui.chapter)
    const start = Math.max(0, Math.min(total - 10, round1(at - 5)))
    e.drawer = 'effects'
    e.adding = true
    e.draft = { start, end: round1(start + 10), preset: d.data.fxPresets[0]?.id ?? '', scope: 'section', takeId: null }
  })
}
export const closeAdd = (): void => update((d) => { d.ui.editing.adding = false })

/** Change the draft; a take-level effect takes the range of its take and a whole-track one takes the whole chapter. */
export function setDraft(patch: Partial<FxDraft>): void {
  update((d) => {
    const dr = d.ui.editing.draft
    Object.assign(dr, patch)
    const total = chapterSeconds(d.data, d.ui.chapter)
    if (dr.scope === 'take') {
      const takes = chapterTakes(d.data, d.ui.chapter)
      const t = takes.find((x) => x.id === dr.takeId) ?? takes[0]
      dr.takeId = t?.id ?? null
      if (t) { dr.start = t.start; dr.end = round1(t.start + t.len) }
    } else {
      dr.takeId = null
      if (dr.scope === 'track') { dr.start = 0; dr.end = total }
    }
  })
}
export const draftValid = (dr: FxDraft, total: number): boolean => dr.end > dr.start && dr.end <= total && dr.start >= 0 && (dr.scope !== 'take' || !!dr.takeId)

/** What adding the draft would do to the chapter's coverage. */
export function draftImpact(s: StudioState): { before: number; after: number; over: boolean; far: boolean } {
  const dr = s.ui.editing.draft
  const total = chapterSeconds(s.data, s.ui.chapter)
  const before = coverage(s.data, s.ui.chapter, s.mock.setup).pct
  const after = coverage(s.data, s.ui.chapter, s.mock.setup, [spanFor(dr.scope, dr.start, dr.end, total)]).pct
  const st = capState(after, s.data.editor.fxCapPct)
  return { before, after, over: st !== 'within', far: st === 'far' }
}

/** Add the effect in the draft. Over the cap it only goes ahead when `confirmed` says the narrator saw the warning. */
export function addRegion(confirmed = false): boolean {
  const s = getState()
  const dr = s.ui.editing.draft
  const preset = s.data.fxPresets.find((p) => p.id === dr.preset)
  const total = chapterSeconds(s.data, s.ui.chapter)
  if (!preset || !draftValid(dr, total)) return false
  if (draftImpact(s).over && !confirmed) return false
  const id = nextRegionId(s.data)
  const whole = dr.scope === 'track'
  const label = 'Added ' + preset.name + (whole ? ' to the whole track' : ' to ' + clock(dr.start) + '–' + clock(dr.end))
  const res = viaDaw(() => daw().addFx(preset.name, dr.start, dr.end, dr.scope), label + '.')
  if (refusedBy(res)) return false
  const e = act(label, (d) => {
    d.data.fxRegions.push({
      id, chapterId: s.ui.chapter, start: dr.start, end: dr.end, scope: dr.scope, takeId: dr.scope === 'take' ? dr.takeId ?? undefined : undefined,
      effect: preset.effect, presetId: preset.id, params: { ...preset.params }, bypass: false,
    })
  }, { daw: true })
  update((d) => { d.ui.editing.adding = false; d.ui.editing.fx = id })
  toastUndo(res.message, e, 8000)
  return true
}
export function removeRegion(id: string): void {
  const s = getState()
  const r = s.data.fxRegions.find((x) => x.id === id)
  if (!r) return
  const name = regionName(s.data, r)
  const res = viaDaw(() => daw().removeFx(name), 'Removed ' + name + '.')
  if (refusedBy(res)) return
  const e = act('Removed ' + name, (d) => { d.data.fxRegions = d.data.fxRegions.filter((x) => x.id !== id) }, { daw: true })
  toastUndo(res.message, e, 8000)
}
/** Bypass or turn on. Turning on can raise coverage over the cap, so it needs `confirmed` like adding does. */
export function setBypass(id: string, bypass: boolean, confirmed = false): boolean {
  const s = getState()
  const r = s.data.fxRegions.find((x) => x.id === id)
  if (!r || r.bypass === bypass) return false
  const name = regionName(s.data, r)
  if (!bypass && !confirmed) {
    const total = chapterSeconds(s.data, r.chapterId)
    const after = coverage(s.data, r.chapterId, s.mock.setup, [spanFor(r.scope, r.start, r.end, total)]).pct
    if (capState(after, s.data.editor.fxCapPct) !== 'within') return false
  }
  const label = (bypass ? 'Bypassed ' : 'Turned on ') + name
  const res = viaDaw(() => daw().bypassFx(name, bypass), label + '.')
  if (refusedBy(res)) return false
  const e = act(label, (d) => { d.data.fxRegions.find((x) => x.id === id)!.bypass = bypass }, { daw: true })
  toastUndo(res.message, e, 6000)
  return true
}
export function setFxParam(id: string, key: string, value: number): void {
  const s = getState()
  const r = s.data.fxRegions.find((x) => x.id === id)
  if (!r || !(key in EFFECTS[r.effect].params.reduce((a, p) => ({ ...a, [p.key]: 1 }), {}))) return
  update((d) => { d.data.fxRegions.find((x) => x.id === id)!.params[key] = value })
  if (capsOf(s.mock).daw !== 'builtin') daw().setFxParam(regionName(s.data, r), key, value)
}
export function previewRegion(id: string): void {
  const s = getState()
  const r = s.data.fxRegions.find((x) => x.id === id)
  if (r) toast(daw().playRange(Math.max(0, r.start - 2), r.end + 2, regionName(s.data, r) + ' at ' + clock(r.start) + ', with 2 s before and after').message)
}
export function compareRegion(id: string): void {
  const s = getState()
  const r = s.data.fxRegions.find((x) => x.id === id)
  if (r) toast(daw().compareFx(regionName(s.data, r), r.start, r.end).message)
}
