/**
 * Stage readiness. For each chapter: the stage it is in, the evidence the app can measure for that stage, and a verdict about moving on.
 * Everything is a pure function of the book (plus the stage list from the readiness provider). The app only suggests: a decision is
 * recorded when the narrator confirms, and a change in the evidence after a suggestion is shown, never applied.
 */
import type { BookData, Chapter, StageDecision, StageId, StageSuggestion } from '@/domain/schemas'
import { num } from '@/format/time'
import { readiness } from '@/providers/readiness'
import { keyOfValues } from './readinessKey'
import type { StageDef } from '@/fixtures/readiness'
import { checkState } from './checks'
import { limText, masterFails, masterRowFor } from './master'
import { isDone, pickupList, typeLabel } from './pickups'
import { activeLimits, vals } from './progress'
import { isOpenNote, noteProgress } from './proof'

export type Verdict = 'ready' | 'notready' | 'notchecked' | 'progress' | 'changed' | 'confirmed'
export const VERDICT_LABEL: Record<Verdict, string> = {
  ready: 'Ready', notready: 'Not ready', notchecked: 'Not checked', progress: 'In progress', changed: 'Evidence changed', confirmed: 'Confirmed',
}
export const VERDICT_ICON = { ready: 'check', notready: 'notReady', notchecked: 'unknown', progress: 'circleHalf', changed: 'alert', confirmed: 'done' } as const
export const VERDICT_KIND = { ready: 'ok', notready: 'bad', notchecked: 'neutral', progress: 'info', changed: 'warn', confirmed: 'ok' } as const

export type ItemState = 'met' | 'unmet' | 'partial' | 'none'
export interface EvidenceItem {
  id: string
  label: string
  value: string
  /** The small line under the label: the limit, the count it is out of. */
  note?: string
  state: ItemState
  /** Only blocking items decide whether the stage is ready; the others are shown for the narrator. */
  blocking: boolean
  /** More about the value (the open pickups, one by one). */
  detail?: string
}

const MINUS = '−'
const signed = (n: number, digits = 1): string => n.toFixed(digits).replace('-', MINUS)

const percent = (p: number): ItemState => (p >= 100 ? 'met' : p > 0 ? 'partial' : 'none')

/** The evidence for one stage of a chapter, from what the app can measure. */
export function stageItems(b: BookData, c: Chapter, stage: StageId): EvidenceItem[] {
  const v = vals(b, c)
  const words = (p: number): string => num(Math.round((c.words * p) / 100)) + ' of ' + num(c.words) + ' words'
  const open = pickupList(b).filter((x) => x.chapterId === c.id && !isDone(b, x.id))
  const pickupItem = (label = 'Open pickups', blocking = true): EvidenceItem => ({
    id: 'pickups', label, value: String(open.length), state: open.length ? 'unmet' : 'met', blocking,
    detail: open.length ? open.map((x) => typeLabel(x).replace(/^./, (ch) => ch.toUpperCase()) + ' at ' + x.t).join(' · ') : undefined,
  })
  const notes = b.proofNotes.filter((n) => n.chapterId === c.id)
  const row = masterRowFor(b, c.id)
  const measured = !!row && !row.waiting
  switch (stage) {
    case 'prep':
      return [{ id: 'prep', label: 'Prepared', value: c.prep === 'prepped' ? 'Prepped' : c.prep === 'progress' ? 'In progress' : 'Not started', state: c.prep === 'prepped' ? 'met' : c.prep === 'progress' ? 'partial' : 'none', blocking: true }]
    case 'record': {
      const k = checkState(b, c.id)
      return [
        { id: 'rec', label: 'Recorded', value: v.rec + '%', note: words(v.rec), state: percent(v.rec), blocking: true },
        { id: 'check', label: 'Recording check', value: k === 'current' ? 'Up to date' : k === 'stale' ? 'Out of date' : 'Not checked', state: k === 'current' ? 'met' : k === 'stale' ? 'partial' : 'none', blocking: false },
      ]
    }
    case 'edit': {
      const left = b.detections.filter((d) => d.chapterId === c.id && !d.res).length
      return [
        { id: 'edit', label: 'Edited', value: v.edit + '%', note: words(v.edit), state: percent(v.edit), blocking: true },
        { id: 'cleanup', label: 'Cleanup findings left', value: String(left), state: left ? 'partial' : 'met', blocking: false },
      ]
    }
    case 'proof': {
      const left = notes.filter((n) => isOpenNote(b, n)).length
      return [
        { id: 'proofed', label: 'Proofed', value: v.proof + '%', note: notes.length ? (notes.length - left) + ' of ' + notes.length + ' notes cleared' : 'no notes', state: percent(v.proof), blocking: true },
        { id: 'notes', label: 'Notes left open', value: String(left), state: left ? 'partial' : 'met', blocking: false },
      ]
    }
    case 'pickups': {
      /* The pickups are what holds Proof under 100 here, so this line shows the notes' own progress. */
      const rawProof = notes.length ? noteProgress(b, notes).pct : c.proof
      return [
        { id: 'edited', label: 'Edited', value: v.edit + '%', note: words(v.edit), state: percent(v.edit), blocking: false },
        { id: 'proofed', label: 'Proofed', value: rawProof + '%', note: notes.length && !notes.some((n) => isOpenNote(b, n)) ? 'no notes left open' : notes.length ? 'notes still open' : 'no notes left open', state: percent(rawProof), blocking: false },
        pickupItem(),
        { id: 'master', label: 'Master check', value: measured ? 'Run' : 'Not run', note: measured ? undefined : 'waits on the open pickups', state: measured ? 'met' : 'none', blocking: false },
      ]
    }
    case 'master': {
      const limits = activeLimits(b)
      if (!row || row.waiting) {
        return [{ id: 'mc', label: 'Master check', value: 'Not run', note: row?.waiting === 'pickups' ? 'waits on the open pickups' : undefined, state: 'none', blocking: true }, pickupItem()]
      }
      const fails = masterFails(row, limits)
      const lim = (k: 'rms' | 'peak' | 'nf'): EvidenceItem => ({
        id: k, label: limits[k].l, value: row[k] != null ? signed(row[k] as number) + ' ' + limits[k].u : '—', note: limText(limits, k).replace(/-/g, MINUS),
        state: fails.includes(k) ? 'unmet' : 'met', blocking: false,
      })
      return [
        { id: 'mc', label: 'Master check', value: fails.length ? 'FAIL' : 'PASS', note: 5 - fails.length + ' of 5 limits met', state: fails.length ? 'unmet' : 'met', blocking: true },
        lim('rms'), lim('peak'), lim('nf'),
        {
          id: 'tone', label: 'Room tone', value: (row.head != null ? row.head.toFixed(1) : '—') + ' · ' + (row.tail != null ? row.tail.toFixed(1) : '—') + ' s', note: 'start ' + limText(limits, 'head').replace('at least ', '') + ' · end ' + limText(limits, 'tail').replace('at least ', ''),
          state: fails.includes('head') || fails.includes('tail') ? 'unmet' : 'met', blocking: false,
        },
        { id: 'clicks', label: 'Clicks', value: row.clicks ?? '—', note: 'found in the recording', state: 'met', blocking: false },
        pickupItem(),
      ]
    }
    case 'delivery':
      return []
  }
}

export { keyOfValues }

const stagesOf = (): StageDef[] => readiness().stages()
export const stageLabel = (id: StageId): string => stagesOf().find((s) => s.id === id)?.label ?? id
const indexOf = (id: StageId): number => stagesOf().findIndex((s) => s.id === id)
/** The stage after this one, or null at the last. */
export const nextStage = (id: StageId): StageId | null => stagesOf()[indexOf(id) + 1]?.id ?? null

const complete = (items: EvidenceItem[]): boolean => items.filter((i) => i.blocking).every((i) => i.state === 'met')

/** The stage a chapter is in when no decision says otherwise: the first one whose evidence is not complete (the last one with work, once all are). */
export function derivedStage(b: BookData, c: Chapter): StageId {
  const work = stagesOf().filter((s) => s.id !== 'delivery')
  for (const s of work) if (!complete(stageItems(b, c, s.id))) return s.id
  return work[work.length - 1].id
}

/** Replay a chapter's decisions: each confirmed move goes on a stack, a revert takes the last one off. The top says where the chapter is. */
export function confirmedMoves(decisions: StageDecision[]): Array<{ from: StageId; to: StageId }> {
  const stack: Array<{ from: StageId; to: StageId }> = []
  for (const d of decisions) {
    if (d.kind === 'confirmed') stack.push({ from: d.from, to: d.to })
    else if (d.kind === 'reverted') stack.pop()
  }
  return stack
}
export const decisionsOf = (b: BookData, chapterId: string): StageDecision[] => b.stageDecisions.filter((d) => d.chapterId === chapterId)
export function currentStage(b: BookData, c: Chapter): StageId {
  const top = confirmedMoves(decisionsOf(b, c.id)).pop()
  return top ? top.to : derivedStage(b, c)
}

export interface Change { id: string; label: string; was: string; now: string }
export interface Readiness {
  chapterId: string
  stage: StageId
  column: StageDef['column']
  next: StageId | null
  items: EvidenceItem[]
  verdict: Verdict
  key: string
  /** The suggestion made earlier for this stage, if there is one. */
  suggestion: StageSuggestion | undefined
  /** What changed in the evidence since that suggestion. */
  changes: Change[]
  /** The decision that moved the chapter here, and whether it can be reverted. */
  canRevert: boolean
  decisions: StageDecision[]
}

export function stageReadiness(b: BookData, c: Chapter): Readiness {
  const stage = currentStage(b, c)
  const items = stageItems(b, c, stage)
  const values = Object.fromEntries(items.map((i) => [i.id, i.value]))
  const key = keyOfValues(stage, values)
  const suggestion = b.stageSuggestions.find((s) => s.chapterId === c.id && s.stage === stage)
  const changes: Change[] = suggestion && suggestion.key !== key
    ? items.filter((i) => suggestion.values[i.id] !== i.value).map((i) => ({ id: i.id, label: i.label, was: suggestion.values[i.id] ?? '—', now: i.value }))
    : []
  const blocking = items.filter((i) => i.blocking)
  let verdict: Verdict
  if (stage === 'delivery') verdict = 'confirmed'
  else if (suggestion && suggestion.key !== key) verdict = 'changed'
  else if (blocking.some((i) => i.state === 'unmet')) verdict = 'notready'
  else if (complete(items)) verdict = 'ready'
  else if (blocking.some((i) => i.state === 'partial')) verdict = 'progress'
  else verdict = 'notchecked'
  const def = stagesOf().find((s) => s.id === stage)
  return {
    chapterId: c.id, stage, column: def?.column ?? 'qc', next: nextStage(stage), items, verdict, key, suggestion, changes,
    canRevert: confirmedMoves(decisionsOf(b, c.id)).length > 0, decisions: decisionsOf(b, c.id),
  }
}

/** Chapters whose evidence is complete and have no suggestion on record for the stage they are in: the app makes one. */
export function unstamped(b: BookData): string[] {
  return b.chapters.filter((c) => {
    const r = stageReadiness(b, c)
    return r.verdict === 'ready' && !r.suggestion
  }).map((c) => c.id)
}

/** One line of the decision list. */
export function decisionText(d: StageDecision): { kind: string; text: string } {
  if (d.kind === 'confirmed') return { kind: 'Confirmed', text: stageLabel(d.from) + ' → ' + stageLabel(d.to) }
  if (d.kind === 'reverted') return { kind: 'Reverted', text: 'Back to ' + stageLabel(d.to) }
  return { kind: 'Dismissed', text: 'Stayed in ' + stageLabel(d.from) }
}
