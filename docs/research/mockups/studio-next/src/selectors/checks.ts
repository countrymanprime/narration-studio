import type { BookData, RecordingCheck } from '@/domain/schemas'
import { paragraphsOf } from './chapters'

/** A short fingerprint of a chapter's text, to tell later whether the text a check ran on has changed. */
export function textKey(b: Pick<BookData, 'paragraphs'>, chapterId: string): string {
  let h = 5381
  for (const p of paragraphsOf(b as BookData, chapterId)) for (let i = 0; i < p.text.length; i++) h = ((h * 33) ^ p.text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export type CheckState = 'none' | 'current' | 'stale'

export const checkOf = (b: BookData, chapterId: string): RecordingCheck | undefined => b.checks.find((c) => c.chapterId === chapterId)
export const isChecked = (b: BookData, chapterId: string): boolean => !!checkOf(b, chapterId)

/**
 * Where a chapter's recording check stands. The result is as of the last save of the project: it holds until the chapter's text
 * changes or more of it is recorded, and then it is out of date.
 */
export function checkState(b: BookData, chapterId: string, basis?: string): CheckState {
  const k = checkOf(b, chapterId)
  const c = b.chapters.find((x) => x.id === chapterId)
  if (!k || !c) return 'none'
  /* `basis` is the project as saved now; a check made against another save, or in another recorder, is out of date. */
  const moved = basis !== undefined && k.basis !== undefined && k.basis !== basis
  return k.textKey === textKey(b, chapterId) && k.rec === c.rec && !moved ? 'current' : 'stale'
}

/** How the recorded chapters stand for the check. A chapter with nothing recorded has nothing to check. */
export function checkSummary(b: BookData, basis?: string): { current: string[]; stale: string[]; none: string[] } {
  const out = { current: [] as string[], stale: [] as string[], none: [] as string[] }
  for (const c of b.chapters) {
    if (c.rec <= 0) continue
    out[checkState(b, c.id, basis)].push(c.id)
  }
  return out
}
