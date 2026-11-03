/**
 * Stage readiness commands. The app only suggests; these are the narrator's decisions. Each is one undo step, and a decision made on
 * evidence that changed since the narrator looked is refused (the same guard Proof uses), with the reason.
 */
import { confirmedMoves, stageLabel, stageReadiness, unstamped } from '@/selectors/readiness'
import { chName } from '@/selectors/chapters'
import { toast, toastUndo } from '@/ui/overlay'
import { act, getState, update } from '../store'
import type { Draft } from 'immer'
import type { StudioState } from '../types'

const nextId = (d: Draft<StudioState>): number => d.data.stageDecisions.reduce((a, x) => Math.max(a, x.id), 0) + 1
const chapterOf = (id: string) => getState().data.chapters.find((c) => c.id === id)

/** The app makes a suggestion for every chapter whose evidence is complete and has none on record. It is not a decision and not an undo step. */
export function stampSuggestions(): void {
  const b = getState().data
  const ids = unstamped(b)
  if (!ids.length) return
  update((d) => {
    for (const id of ids) {
      const c = d.data.chapters.find((x) => x.id === id)
      if (!c) continue
      const r = stageReadiness(d.data as typeof b, c)
      if (r.verdict !== 'ready') continue
      d.data.stageSuggestions.push({ chapterId: id, stage: r.stage, key: r.key, at: d.data.today, values: Object.fromEntries(r.items.map((i) => [i.id, i.value])) })
    }
  })
}

/** Refuse a decision made on evidence the narrator did not see. Returns the reason, or null. */
function staleReason(chapterId: string, seenKey: string): string | null {
  const c = chapterOf(chapterId)
  if (!c) return 'That chapter is not in the book.'
  return stageReadiness(getState().data, c).key !== seenKey ? 'The evidence for this stage changed since you looked at it. Read what changed, then decide.' : null
}

/** Confirm moving a chapter on to the next stage. Only a Ready stage can be confirmed. */
export function confirmStage(chapterId: string, seenKey: string): boolean {
  const c = chapterOf(chapterId)
  if (!c) return false
  const stale = staleReason(chapterId, seenKey)
  if (stale) { toast(stale); return false }
  const r = stageReadiness(getState().data, c)
  if (r.verdict !== 'ready' || !r.next) { toast('This stage is not ready to move on.'); return false }
  const next = r.next
  const e = act('Moved ' + chName(getState().data, c) + ' to ' + stageLabel(next), (d) => {
    d.data.stageDecisions.push({ id: nextId(d), chapterId, kind: 'confirmed', from: r.stage, to: next, at: d.data.today, evidence: r.key })
    d.data.stageSuggestions = d.data.stageSuggestions.filter((x) => !(x.chapterId === chapterId && x.stage === r.stage))
  })
  toastUndo('Moved to ' + stageLabel(next) + '.', e, 7000)
  return true
}

/** Dismiss the suggestion: it is logged, and the evidence as it is now becomes the one the next suggestion is measured against. */
export function dismissStage(chapterId: string, seenKey: string): boolean {
  const c = chapterOf(chapterId)
  if (!c) return false
  const stale = staleReason(chapterId, seenKey)
  if (stale) { toast(stale); return false }
  const r = stageReadiness(getState().data, c)
  if (!r.next) return false
  const next = r.next
  const e = act('Dismissed the suggestion for ' + chName(getState().data, c), (d) => {
    d.data.stageDecisions.push({ id: nextId(d), chapterId, kind: 'dismissed', from: r.stage, to: next, at: d.data.today, evidence: r.key })
    const at = d.data.stageSuggestions.findIndex((x) => x.chapterId === chapterId && x.stage === r.stage)
    if (at >= 0) d.data.stageSuggestions[at] = { chapterId, stage: r.stage, key: r.key, at: d.data.today, values: Object.fromEntries(r.items.map((i) => [i.id, i.value])) }
  })
  toastUndo('Suggestion dismissed.', e, 7000)
  return true
}

/** Put a chapter back at the stage it was moved from. A new line in the list; nothing is removed from it. */
export function revertStage(chapterId: string): boolean {
  const c = chapterOf(chapterId)
  if (!c) return false
  const r = stageReadiness(getState().data, c)
  if (!r.canRevert) return false
  const top = confirmedMoves(r.decisions).pop()
  if (!top) return false
  const e = act('Reverted ' + chName(getState().data, c) + ' to ' + stageLabel(top.from), (d) => {
    d.data.stageDecisions.push({ id: nextId(d), chapterId, kind: 'reverted', from: r.stage, to: top.from, at: d.data.today, evidence: r.key })
  })
  toastUndo('Back to ' + stageLabel(top.from) + '.', e, 7000)
  return true
}
