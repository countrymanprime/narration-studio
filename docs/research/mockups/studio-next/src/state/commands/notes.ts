/** Changing what a proof note says about its own state. Every change of decision is a line in the note's history; nothing is ever removed from it. */
import type { Draft } from 'immer'
import type { ProofNote, Resolution } from '@/domain/schemas'
import type { StudioState } from '../types'

/**
 * Set a note's decision and append it to the history, with the evidence it was made on and what the narrator typed with it.
 * Deciding what is already decided, with nothing typed, changes nothing and adds no line (so toggling never piles up lines).
 * Returns whether anything changed.
 */
export function setNoteRes(d: Draft<StudioState>, n: Draft<ProofNote>, res: Resolution | null, note = ''): boolean {
  if (n.res === res && !note.trim()) return false
  n.res = res
  n.history.push({ res, at: d.data.today, note, evidence: n.evidence, heard: n.heard })
  return true
}
