/**
 * Stacking retries. A narrator who restarts a line leaves several takes of it spread along the chapter. Stacking puts the later reads on the
 * first read's spot (REAPER: as takes of one item), so a passage's takes share one place in time and the audio that follows moves up to close
 * the space the retries took. Leaving them keeps every read where it was recorded and offers a clean-up when one is kept.
 * Everything here is a pure function of the book; the commands in state/commands/stacking.ts do the changes.
 */
import type { BookData, Passage, RetryMode, Take } from '@/domain/schemas'
import type { StackGroup, StackMove } from '@/domain/daw'
import { guidOf } from '@/format/guid'
import type { MockState } from '@/state/slices/mock'
import { editGateOf, stackPlanOf } from './daw'
import { passageStart, passagesOf, shownTakes } from './editing'

export const RETRY_MODES: Array<[RetryMode, string]> = [['stack', 'Stack'], ['leave', 'Leave']]
/** The two ways, as the narrator would say them. */
export const RETRY_LABEL: Record<RetryMode, string> = {
  stack: 'Stack takes at the first read’s spot',
  leave: 'Leave takes where they are and clean up when I keep one',
}
export const STACK_TEXT = {
  action: 'Stack retries as takes',
  unstack: 'Un-stack the takes',
  cleanup: 'Clean up the other reads',
  howKept: 'How retries are kept',
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const EPS = 0.05

/** How the retries of a chapter are kept unless a passage says otherwise. */
export const chapterRetryMode = (b: Pick<BookData, 'editor'>, chapterId: string): RetryMode => b.editor.retryChapters[chapterId] ?? b.editor.retryMode
/** How the retries of a passage are kept: its own choice, else its chapter's, else the project's. */
export const retryModeOf = (b: Pick<BookData, 'editor'>, p: Pick<Passage, 'chapterId' | 'retryMode'>): RetryMode => p.retryMode ?? chapterRetryMode(b, p.chapterId)

/** The first read: the take that begins first. It stays where it is and the others stack on it. */
export const baseTake = (p: Passage): Take => p.takes.reduce((a, t) => (t.start < a.start ? t : a), p.takes[0])
export const takeEnd = (t: Pick<Take, 'start' | 'len'>): number => t.start + t.len
/** Where the passage's audio ends: the end of its last take. */
export const passageEnd = (p: Passage): number => Math.max(...p.takes.map(takeEnd))
/** Takes that sit on the first read's spot because they were stacked. */
export const stackedTakes = (p: Passage): Take[] => p.takes.filter((t) => !!p.stack && t.id in p.stack.offsets)
export const isStacked = (p: Passage): boolean => stackedTakes(p).length > 0
/** Takes that could be stacked: later reads that are not on the first read's spot. */
export function movableTakes(p: Passage): Take[] {
  if (p.takes.length < 2) return []
  const base = baseTake(p)
  return p.takes.filter((t) => t.id !== base.id && Math.abs(t.start - base.start) > EPS)
}
/** A retry group: a passage whose later reads are still where they were recorded and no take has been kept. */
export const canStack = (p: Passage): boolean => !p.kept && movableTakes(p).length > 0
/** Takes can go back to where they were recorded while no keep decision has been confirmed. */
export const canUnstack = (p: Passage): boolean => !p.kept && isStacked(p)

export interface StackGeometry {
  passage: Passage
  base: Take
  moves: StackMove[]
  /** The span the takes cover before and after the change. */
  before: { start: number; end: number }
  after: { start: number; end: number }
  /** Seconds the audio that follows moves: negative when it moves earlier (stacking), positive when a take goes back out. */
  shift: number
}

function geometry(p: Passage, ids: string[], to: (t: Take) => number): StackGeometry {
  const base = baseTake(p)
  const moves = p.takes.filter((t) => ids.includes(t.id)).map((t) => ({ takeId: t.id, from: round1(t.start), to: round1(to(t)), len: t.len }))
  const end = (shift: (t: Take) => number): number => Math.max(...p.takes.map((t) => shift(t) + t.len))
  const dest = (t: Take): number => moves.find((m) => m.takeId === t.id)?.to ?? t.start
  const e0 = round1(passageEnd(p))
  const e1 = round1(end(dest))
  return { passage: p, base, moves, before: { start: round1(passageStart(p)), end: e0 }, after: { start: round1(passageStart(p)), end: e1 }, shift: round1(e1 - e0) }
}
/** Where the takes of a passage would go if the ones named (all that can be stacked by default) were stacked on the first read. */
export function stackGeometry(p: Passage, ids: string[] = movableTakes(p).map((t) => t.id)): StackGeometry {
  const base = baseTake(p)
  return geometry(p, ids, () => base.start)
}
/** Where the stacked takes named (all of them by default) would go back to. */
export function unstackGeometry(p: Passage, ids: string[] = stackedTakes(p).map((t) => t.id)): StackGeometry {
  const base = baseTake(p)
  return geometry(p, ids, (t) => base.start + (p.stack?.offsets[t.id] ?? 0))
}

/** The id the DAW knows the passage's item by, as the app last read it. */
export const itemGuidOf = (p: Passage): string => guidOf('item', p.id)
export const groupOf = (g: StackGeometry): StackGroup => ({ passageId: g.passage.id, itemGuid: itemGuidOf(g.passage), base: g.base.id, moves: g.moves })

/** The retry groups of a chapter that the narrator asked to stack, in time order. */
export function stackable(b: BookData, chapterId: string): Passage[] {
  return passagesOf(b, chapterId).filter((p) => canStack(p) && retryModeOf(b, p) === 'stack')
}
/** All retry groups of a chapter, whatever the mode. */
export const retryGroups = (b: BookData, chapterId: string): Passage[] => passagesOf(b, chapterId).filter(canStack)
/** "2 retries can be stacked": how many takes of the chapter would move. */
export const stackableCount = (b: BookData, chapterId: string): number => stackable(b, chapterId).reduce((a, p) => a + movableTakes(p).length, 0)
export const stackedPassages = (b: BookData, chapterId: string): Passage[] => passagesOf(b, chapterId).filter(isStacked)

/** What a stack (or un-stack) would do, in words and numbers, for the confirmation dialog. */
export interface StackPlan {
  chapterId: string
  /** The passages, in the order they are stacked (time order). `ahead` is how far the groups before this one moved the audio that reaches it. */
  groups: Array<StackGeometry & { ahead: number }>
  takes: number
  /** Seconds the audio that follows moves, summed. */
  shift: number
  gate: { ok: boolean; label: string; reason: string }
  mode: 'native' | 'app' | 'steps'
  undo: string
  undoSteps: number
  steps: string[]
  /** The DAW keeps a backup of the region before it changes. */
  backup: boolean
  /** The region that is backed up, when it is. */
  region: { start: number; end: number } | null
}

/** Groups are planned in time order, each on the book as the one before it left it, so the numbers add up. */
function plan(b: BookData, m: Pick<MockState, 'setup'>, ps: Passage[], pick: (p: Passage) => StackGeometry): StackPlan {
  let ahead = 0
  const groups = ps.slice().sort((a, c) => passageStart(a) - passageStart(c)).map(pick).filter((g) => g.moves.length).map((g) => {
    const out = { ...g, ahead: round1(ahead) }
    ahead += g.shift
    return out
  })
  const gate = editGateOf(m, 'stackTakes')
  const how = stackPlanOf(m)
  const backup = how.mode === 'steps'
  const region = groups.length ? { start: Math.min(...groups.map((g) => g.before.start)), end: Math.max(...groups.map((g) => g.before.end)) } : null
  return {
    chapterId: ps[0]?.chapterId ?? '', groups, takes: groups.reduce((a, g) => a + g.moves.length, 0), shift: round1(groups.reduce((a, g) => a + g.shift, 0)),
    gate, mode: how.mode, undo: how.undo, undoSteps: how.undoSteps, steps: how.steps, backup, region,
  }
}
export const stackPlan = (b: BookData, m: Pick<MockState, 'setup'>, ps: Passage[]): StackPlan => plan(b, m, ps, (p) => stackGeometry(p))
export const unstackPlan = (b: BookData, m: Pick<MockState, 'setup'>, ps: Passage[], ids?: string[]): StackPlan => plan(b, m, ps, (p) => unstackGeometry(p, ids))

/** Reads that would be muted by cleaning up a passage that was left in place: the ones that are not the kept take and are still shown. */
export const otherReads = (p: Passage): Take[] => p.takes.filter((t) => !t.active && !t.hidden)
/** The clean-up is offered for a kept passage whose reads were left where they are. */
export const canCleanUp = (b: BookData, p: Passage): boolean => p.kept && !isStacked(p) && retryModeOf(b, p) === 'leave' && otherReads(p).length > 0

/** The shown takes of a passage on one line each: for the lanes of the waveform. */
export const laneOf = (p: Passage, t: Take): number => Math.max(0, shownTakes(p).findIndex((x) => x.id === t.id))
