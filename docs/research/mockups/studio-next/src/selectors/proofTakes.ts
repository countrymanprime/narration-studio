/**
 * Takes at a flagged spot, as Proof shows them: read-only. A note whose spot (the passage it points at) has several takes gets a count,
 * the other takes drawn as thinner lanes under the waveform, and a list in the inspector. Choosing, keeping or hiding takes is Editing's.
 */
import type { BookData, Passage, ProofNote } from '@/domain/schemas'
import { diffWords } from '@/format/diff'
import { activeTake, passageOfNote, passageScript } from './editing'

export interface SpotTake {
  id: string
  /** "Take 1": the take's place in time order at this spot. */
  label: string
  n: number
  start: number
  len: number
  /** What the speech check heard in this take. */
  text: string
  /** The take that plays, and whether the narrator chose it (kept). */
  active: boolean
  kept: boolean
  hidden: boolean
}
export interface Spot { passageId: string; chapterId: string; script: string; takes: SpotTake[] }

/** The several takes at a note's spot; null when the spot has one take (or none), so nothing extra is drawn. */
export function spotOf(b: BookData, note: Pick<ProofNote, 'chapterId' | 'pid'>): Spot | null {
  const p: Passage | undefined = passageOfNote(b, note)
  if (!p || p.takes.length < 2) return null
  const on = activeTake(p)
  const takes = p.takes.slice().sort((a, c) => a.start - c.start).map((t, i) => ({
    id: t.id, label: 'Take ' + (i + 1), n: i + 1, start: t.start, len: t.len, text: t.text, active: t.id === on?.id, kept: p.kept && t.id === on?.id, hidden: !!t.hidden,
  }))
  return { passageId: p.id, chapterId: p.chapterId, script: passageScript(b, p), takes }
}

/** How many takes each note's spot has, for the notes that have several. */
export function takeCounts(b: BookData, notes: ProofNote[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const n of notes) {
    const s = spotOf(b, n)
    if (s) m.set(n.id, s.takes.length)
  }
  return m
}

/** What a take heard, with the script's words that were not said struck through (and words said that are not in the script marked). */
export function heardMarkup(script: string, heard: string): string {
  return diffWords(script, heard).map((p) => (p.k === 'same' ? p.w : p.k === 'del' ? '<del>' + p.w + '</del>' : '<ins>' + p.w + '</ins>')).join(' ')
}
