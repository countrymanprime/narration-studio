/**
 * Sample data behind stage readiness: the stages of the pipeline in order, and the decisions and suggestions the sample book already
 * holds. A real host replaces the provider; screens render whatever it lists.
 */
import type { StageDecision, StageId } from '@/domain/schemas'

export interface StageDef {
  id: StageId
  label: string
  /** Where the stage's own cell is in the chapter pipeline table. */
  column: 'prep' | 'record' | 'edit' | 'proof' | 'pickups' | 'qc'
}

export const STAGES: StageDef[] = [
  { id: 'prep', label: 'Prep', column: 'prep' },
  { id: 'record', label: 'Record', column: 'record' },
  { id: 'edit', label: 'Edit', column: 'edit' },
  { id: 'proof', label: 'Proof', column: 'proof' },
  { id: 'pickups', label: 'Pickups', column: 'pickups' },
  { id: 'master', label: 'Master check', column: 'qc' },
  { id: 'delivery', label: 'Delivery', column: 'qc' },
]

const dec = (id: number, chapterId: string, kind: StageDecision['kind'], from: StageId, to: StageId, at: string): StageDecision =>
  ({ id, chapterId, kind, from, to, at, evidence: '' })

/** Decisions already made on the sample book (oldest first). The evidence key is filled in when the book is made. */
export const STAGE_DECISIONS: StageDecision[] = [
  dec(1, '2', 'confirmed', 'edit', 'proof', '2026-09-18'),
  dec(2, '2', 'reverted', 'proof', 'edit', '2026-09-19'),
  dec(3, '2', 'confirmed', 'edit', 'proof', '2026-09-20'),
  dec(4, '2', 'confirmed', 'proof', 'master', '2026-09-23'),
  dec(5, '3', 'confirmed', 'proof', 'pickups', '2026-09-22'),
  dec(6, '3', 'reverted', 'pickups', 'proof', '2026-09-23'),
  dec(7, '3', 'confirmed', 'proof', 'pickups', '2026-09-24'),
]

/** What the evidence looked like when the app last suggested moving on, for chapters whose evidence has changed since. */
export const STAGE_SUGGESTIONS: Array<{ chapterId: string; stage: StageId; at: string; values: Record<string, string> }> = [
  { chapterId: '3', stage: 'pickups', at: '2026-09-25', values: { edited: '100%', proofed: '100%', pickups: '0', master: 'Not run' } },
]
