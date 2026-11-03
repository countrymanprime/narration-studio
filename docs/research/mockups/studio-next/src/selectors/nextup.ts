import type { BookData } from '@/domain/schemas'
import { openQueries } from './annotations'
import { masterFails } from './master'
import { PICKUP_HOURS, RATIO, WPH } from '@/config/estimates'
import { recordingChapterOf } from './chapters'
import { activeLimits, type Calc } from './progress'

export type NextKind = 'rec' | 'pick' | 'fail' | 'flags'

/** Where an item sits among the stages of the pipeline (Prep, Record, Edit, Proof, Pickups, Master): the least advanced comes first on a tie. */
export const STAGE = { prep: 0, record: 1, edit: 2, proof: 3, pickups: 4, master: 5 } as const
/** Groups: in progress and not ready, other in progress, ready to confirm, not started. */
export type NextGroup = 0 | 1 | 2 | 3

export interface NextItem {
  kind: NextKind
  group: NextGroup
  stage: number
  /** Work-hours the item stands for. Items that block the work without a time estimate carry none. */
  risk: number
}

/**
 * What to do next, ranked by risk to the due date: the most work-hours first. Items of equal risk are ordered by group
 * (in progress and not ready, other in progress, ready to confirm, not started), then least advanced stage first.
 */
export function nextUp(b: BookData, k: Calc): NextItem[] {
  const items: NextItem[] = []
  const rec = recordingChapterOf(b)
  if (rec) items.push({ kind: 'rec', group: 1, stage: STAGE.record, risk: (rec.words / WPH) * (1 - rec.rec / 100) * RATIO.rec })
  if (k.pick) items.push({ kind: 'pick', group: 1, stage: STAGE.pickups, risk: k.pick * PICKUP_HOURS })
  if (k.fail && b.masterRows.some((r) => masterFails(r, activeLimits(b)).length)) items.push({ kind: 'fail', group: 0, stage: STAGE.master, risk: 0 })
  if (b.chapters.some((c) => c.flag)) items.push({ kind: 'flags', group: 1, stage: STAGE.prep, risk: 0 })
  const r = (x: NextItem): number => Math.round(x.risk * 100)
  return items
    .map((x, i) => ({ x, i }))
    .sort((a, c) => r(c.x) - r(a.x) || a.x.group - c.x.group || a.x.stage - c.x.stage || a.i - c.i)
    .map((e) => e.x)
}
