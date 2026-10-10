import type { Annotation, BookData, MarkType } from '@/domain/schemas'
import { paragraphChapter } from './chapters'

export const annById = (b: BookData, id: string | null | undefined): Annotation | undefined => (id ? b.annotations.find((a) => a.id === id) : undefined)
export const markOf = (b: BookData, a: Annotation): MarkType => b.marks.find((x) => x.k === a.mark) ?? b.marks[0]
export const isAsk = (b: BookData, a: Annotation): boolean => a.type === 'mark' && !!markOf(b, a).ask
export const annsInChapter = (b: BookData, chapterId: string): Annotation[] => b.annotations.filter((a) => paragraphChapter(b, a.p) === chapterId)
export const openQueries = (b: BookData): Annotation[] => b.annotations.filter((a) => isAsk(b, a) && a.status !== 'resolved')

/** A note and a query are the same thing: a thread on a passage. */
export interface AnnMessage { who: 'you' | 'author' | 'proofer'; text: string; at: string; i: number }
export function annMessages(a: Annotation): AnnMessage[] {
  const out: AnnMessage[] = []
  if (a.text) out.push({ who: 'you', text: a.text, at: '', i: -1 })
  ;(a.thread ?? []).forEach((m, i) => out.push({ ...m, i }))
  return out
}

/** The "3 marks · 1 open query · 2 without pronunciation" line on a chapter card. */
export function chapterFacts(b: BookData, chapterId: string, unattributedCount: number): string {
  const a = annsInChapter(b, chapterId)
  const marks = a.filter((x) => x.type === 'mark' && !isAsk(b, x)).length
  const q = a.filter((x) => isAsk(b, x) && x.status !== 'resolved').length
  const pr = a.filter((x) => x.type === 'pron' && x.key && b.pronunciations[x.key] && !b.pronunciations[x.key].say).length
  return `${marks} ${marks === 1 ? 'mark' : 'marks'} · ${q} open ${q === 1 ? 'query' : 'queries'} · ${pr} without pronunciation${unattributedCount ? ' · ' + unattributedCount + ' without a speaker' : ''}`
}
