import type { Annotation, BookData, Paragraph } from '@/domain/schemas'
import { reEsc } from '@/format/text'
import { annsInChapter } from './annotations'
import { phrasesOf, type Phrase } from './phrases'
import type { Match } from './search'

/** A stretch of a paragraph with everything that covers it. The reader renders one element per cover, outermost last. */
export type Cover =
  | { kind: 'entity'; entryId: string; entryKind: string }
  | { kind: 'find'; current: boolean }
  | { kind: 'phrase'; phrase: Phrase; first: boolean }
  | { kind: 'annotation'; ann: Annotation; end: boolean }

export interface Segment { text: string; start: number; end: number; covers: Cover[] }

interface Range { s: number; e: number; cover: Cover; order: number }

/** Split a paragraph at every boundary of an annotation, a Story Bible name, a phrase or a find match. */
export function segmentsOf(b: BookData, p: Paragraph, find: { matches: Match[]; current: number } | null): Segment[] {
  const t = p.text
  const ranges: Range[] = []
  annsInChapter(b, p.chapterId).filter((a) => a.p === p.id).forEach((a) => ranges.push({ s: a.s, e: a.e, cover: { kind: 'annotation', ann: a, end: false }, order: 1 }))
  b.bible.forEach((en) =>
    en.aka.forEach((al) => {
      const re = new RegExp('\\b' + reEsc(al) + '\\b', 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(t))) ranges.push({ s: m.index, e: m.index + al.length, cover: { kind: 'entity', entryId: en.id, entryKind: en.kind }, order: 0 })
    }),
  )
  phrasesOf(p, b).forEach((ph) => { if (ph.q) ranges.push({ s: ph.s, e: ph.e, cover: { kind: 'phrase', phrase: ph, first: true }, order: 3 }) })
  if (find) find.matches.forEach((m, i) => { if (m.pid === p.id) ranges.push({ s: m.s, e: m.e, cover: { kind: 'find', current: i === find.current }, order: 2 }) })
  const cuts = new Set<number>([0, t.length])
  ranges.forEach((r) => { cuts.add(r.s); cuts.add(r.e) })
  const pts = [...cuts].sort((x, y) => x - y)
  const out: Segment[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const z = pts[i + 1]
    if (a === z) continue
    const covers = ranges
      .filter((r) => r.s <= a && r.e >= z)
      .sort((x, y) => x.order - y.order)
      .map((r): Cover => {
        if (r.cover.kind === 'phrase') return { kind: 'phrase', phrase: r.cover.phrase, first: a === r.s }
        if (r.cover.kind === 'annotation') return { kind: 'annotation', ann: r.cover.ann, end: r.e === z }
        return r.cover
      })
    out.push({ text: t.slice(a, z), start: a, end: z, covers })
  }
  return out
}
