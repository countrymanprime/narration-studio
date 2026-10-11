/**
 * Stacking retries. The narrator chooses how retries are kept (stacked on the first read's spot, or left where they were recorded), and
 * nothing is moved until they confirm: the dialog says what will move and how the DAW undoes it. A stack goes to the DAW first (REAPER does
 * it as takes of one item; the built-in recorder is the app's own; Audacity needs backups and is done in several edits); only when the DAW
 * accepts is the book changed, and the change is one undoable step in the app's history. Nothing is ever deleted: leaving the takes where they
 * are ends with hiding the reads that were not kept, as Hide other takes does.
 */
import type { Draft } from 'immer'
import { dawOk, type DawResult } from '@/domain/daw'
import type { Passage, RetryMode } from '@/domain/schemas'
import { modals } from '@/app/modals'
import { capsOf } from '@/selectors/daw'
import { passageStart } from '@/selectors/editing'
import {
  STACK_TEXT, canCleanUp, canStack, canUnstack, groupOf, otherReads, stackGeometry, stackPlan, stackable, unstackGeometry, unstackPlan,
} from '@/selectors/stacking'
import { daw } from '@/state/daw'
import { confirmDialog } from '@/ui/ConfirmDialog'
import { toast, toastUndo } from '@/ui/overlay'
import { act, getState, update } from '../store'
import type { StudioState } from '../types'
import { backupBefore } from './backups'
import { hideOtherTakes } from './editing'

const round1 = (n: number): number => Math.round(n * 10) / 10
const EPS = 0.05
const plural = (n: number, one: string, many: string): string => n + ' ' + (n === 1 ? one : many)

/** The built-in recorder is the app's own, so the app makes the change itself; every other DAW is asked first and may refuse. */
const viaDaw = (fn: () => DawResult, own: string): DawResult => (capsOf(getState().mock).daw === 'builtin' ? dawOk(own, { undoSteps: 0 }) : fn())
const passageIn = (id: string): Passage | undefined => getState().data.passages.find((p) => p.id === id)

/* ---- The choice ---- */
export type RetryScope = { chapter: string } | { passage: string } | 'project'
/** Choose how retries are kept for the project, a chapter or one passage. `null` takes the setting above it back (a passage follows its chapter). */
export function setRetryMode(scope: RetryScope, mode: RetryMode | null): void {
  update((d) => {
    if (scope === 'project') { if (mode) d.data.editor.retryMode = mode; return }
    if ('chapter' in scope) {
      if (mode) d.data.editor.retryChapters[scope.chapter] = mode
      else delete d.data.editor.retryChapters[scope.chapter]
      return
    }
    const p = d.data.passages.find((x) => x.id === scope.passage)
    if (!p) return
    if (mode) p.retryMode = mode
    else delete p.retryMode
  })
}

/* ---- Moving the audio ---- */
/** The audio that follows a group moves with it: other passages, findings, effects and notes that begin where the group ended. */
export function shiftAfter(d: Draft<StudioState>, chapterId: string, boundary: number, delta: number, except: string, round: (n: number) => number = round1): void {
  if (Math.abs(delta) < EPS) return
  const at = (sec: number): boolean => sec >= boundary - EPS
  d.data.passages.forEach((p) => {
    if (p.chapterId !== chapterId || p.id === except) return
    p.takes.forEach((t) => { if (at(t.start)) t.start = round(Math.max(0, t.start + delta)) })
  })
  d.data.detections.forEach((x) => { if (x.chapterId === chapterId && at(x.sec)) x.sec = round(Math.max(0, x.sec + delta)) })
  d.data.fxRegions.forEach((r) => {
    if (r.chapterId !== chapterId || !at(r.start)) return
    r.start = round(Math.max(0, r.start + delta))
    r.end = round(Math.max(r.start + 0.1, r.end + delta))
  })
  d.data.proofNotes.forEach((n) => { if (n.chapterId === chapterId && at(n.sec)) n.sec = round(Math.max(0, n.sec + delta)) })
}

/** Stack the takes named (all that can be) on the first read, on a draft; the audio that follows moves up. Returns the takes moved. */
function stackIn(d: Draft<StudioState>, passageId: string, ids: string[] | undefined, backupId?: string): number {
  const p = d.data.passages.find((x) => x.id === passageId)
  if (!p) return 0
  const g = stackGeometry(p as Passage, ids)
  if (!g.moves.length) return 0
  const stack = p.stack ?? { id: 'stk-' + p.id, base: g.base.id, offsets: {} as Record<string, number> }
  g.moves.forEach((m) => {
    stack.offsets[m.takeId] = round1(m.from - g.base.start)
    p.takes.find((t) => t.id === m.takeId)!.start = m.to
  })
  if (backupId) stack.backupId = backupId
  p.stack = stack
  shiftAfter(d, p.chapterId, g.before.end, g.shift, p.id)
  return g.moves.length
}
/** Put stacked takes back where they were recorded, on a draft; the audio that follows moves back down. Returns the takes moved. */
function unstackIn(d: Draft<StudioState>, passageId: string, ids: string[] | undefined): number {
  const p = d.data.passages.find((x) => x.id === passageId)
  if (!p || !p.stack) return 0
  const g = unstackGeometry(p as Passage, ids)
  if (!g.moves.length) return 0
  g.moves.forEach((m) => {
    p.takes.find((t) => t.id === m.takeId)!.start = m.to
    delete p.stack!.offsets[m.takeId]
  })
  if (!Object.keys(p.stack.offsets).length) delete p.stack
  shiftAfter(d, p.chapterId, g.before.end, g.shift, p.id)
  return g.moves.length
}

/* ---- Asking ---- */
/** Ask before stacking: the dialog lists what moves. With no passages named, every retry group of the chapter set to be stacked. */
export function requestStack(chapterId: string, passageIds?: string[]): void {
  const s = getState()
  const ids = passageIds ?? stackable(s.data, chapterId).map((p) => p.id)
  const plan = stackPlan(s.data, s.mock, ids.map(passageIn).filter((p): p is Passage => !!p && canStack(p)))
  if (!plan.groups.length) { toast('There are no retries to stack.'); return }
  if (!plan.gate.ok) { toast(plan.gate.reason); return }
  modals.stackTakes({ kind: 'stack', chapterId, passageIds: plan.groups.map((g) => g.passage.id) })
}
/** Ask before taking stacked takes back to where they were recorded (the takes named, else all of the passage's). */
export function requestUnstack(passageId: string, takeIds?: string[]): void {
  const s = getState()
  const p = passageIn(passageId)
  if (!p || !canUnstack(p)) return
  const plan = unstackPlan(s.data, s.mock, [p], takeIds)
  if (!plan.groups.length) return
  if (!plan.gate.ok) { toast(plan.gate.reason); return }
  modals.stackTakes({ kind: 'unstack', chapterId: p.chapterId, passageIds: [p.id], takeIds })
}

/* ---- Doing ---- */
/**
 * Stack the retries of these passages on their first reads. The DAW is asked first (Audacity: after a backup of the region, since it does this in
 * several edits); a refusal changes nothing in the app. One undoable step in the history.
 */
export function stackRetries(chapterId: string, passageIds: string[]): boolean {
  const s = getState()
  const plan = stackPlan(s.data, s.mock, passageIds.map(passageIn).filter((p): p is Passage => !!p && canStack(p)))
  if (!plan.groups.length) { toast('There are no retries to stack.'); return false }
  if (!plan.gate.ok) { toast(plan.gate.reason); return false }
  const label = 'Stacked ' + plural(plan.takes, 'retry', 'retries') + ' as takes'
  const backup = plan.backup && plan.region ? backupBefore(chapterId, (plan.region.start + plan.region.end) / 2, 'Stack retries as takes', undefined, plan.region) : null
  if (plan.backup && !backup) { toast('The audio could not be backed up, so nothing was changed.'); return false }
  const res = viaDaw(() => daw().stackTakes({ chapterId, groups: plan.groups.map(groupOf), shift: plan.shift }), 'Stacked ' + plural(plan.takes, 'take', 'takes') + ' in the app.')
  if (res.refused) { toast(res.refused); return false }
  const e = act(label, (d) => { plan.groups.forEach((g) => stackIn(d, g.passage.id, g.moves.map((m) => m.takeId), backup?.id)) }, { daw: true })
  toastUndo(res.message, e, 8000)
  return true
}

/** Put stacked takes back where they were recorded. Refused once a take is kept. One undoable step. */
export function unstackRetries(passageId: string, takeIds?: string[]): boolean {
  const s = getState()
  const p = passageIn(passageId)
  if (!p || !canUnstack(p)) { toast('Undo the kept take first.'); return false }
  const plan = unstackPlan(s.data, s.mock, [p], takeIds)
  if (!plan.groups.length) return false
  if (!plan.gate.ok) { toast(plan.gate.reason); return false }
  const res = viaDaw(() => daw().unstackTakes({ chapterId: p.chapterId, groups: plan.groups.map(groupOf), shift: plan.shift }), 'Moved ' + plural(plan.takes, 'take', 'takes') + ' back in the app.')
  if (res.refused) { toast(res.refused); return false }
  const e = act('Moved ' + plural(plan.takes, 'take', 'takes') + ' back to where ' + (plan.takes === 1 ? 'it was' : 'they were') + ' recorded', (d) => { unstackIn(d, passageId, plan.groups[0].moves.map((m) => m.takeId)) }, { daw: true })
  toastUndo(res.message, e, 8000)
  return true
}

/* ---- Leaving them where they are ---- */
/** What the clean-up says it will do, for the question. */
export function cleanUpText(p: Passage, backs: boolean): string {
  const ids = otherReads(p).map((t) => t.id)
  return 'Hide ' + plural(ids.length, 'other read', 'other reads') + ' (' + ids.join(', ') + ') of this passage. They are muted and put out of the way, never deleted, and Undo brings them back.'
    + (backs ? ' A backup of the audio around them is made first.' : '')
}
/** After keeping a take of a passage that was left in place: offer to hide the other reads. Asks first. */
export function requestCleanUp(passageId: string): void {
  const s = getState()
  const p = passageIn(passageId)
  if (!p || !canCleanUp(s.data, p)) return
  const backs = !!capsOf(s.mock).caps.backups?.available
  confirmDialog({ title: STACK_TEXT.cleanup, body: cleanUpText(p, backs), confirmLabel: 'Hide the other reads', focus: 'cancel', onConfirm: () => cleanUpOtherReads(passageId) })
}
/** Hide the reads that were not kept, non-destructively (as Hide other takes does). In a DAW that keeps backups, the audio around them is cloned first. */
export function cleanUpOtherReads(passageId: string): void {
  const s = getState()
  const p = passageIn(passageId)
  if (!p || !canCleanUp(s.data, p)) return
  const reads = otherReads(p)
  const start = Math.min(...reads.map((t) => t.start))
  const end = Math.max(...reads.map((t) => t.start + t.len))
  backupBefore(p.chapterId, passageStart(p), 'Clean up the other reads', undefined, { start, end })
  hideOtherTakes(passageId)
}
