import type { Annotation, BibleEntry, BookData, Chapter, MarkColour } from '@/domain/schemas'
import { reEsc } from '@/format/text'
import { chTag, paragraphsOf } from './chapters'
import { phrasesOf } from './phrases'
import { speakerCandidates } from './speakers'

export const entryById = (b: BookData, id: string | null | undefined): BibleEntry | undefined => (id ? b.bible.find((e) => e.id === id) : undefined)
export const entryByName = (b: BookData, name: string): BibleEntry | undefined => b.bible.find((e) => e.name === name)

/** Colour token for a Story Bible type. */
export const typeColour = (b: BookData, kind: string): MarkColour | 'faint' => b.bibleTypes.find((t) => t.k === kind)?.c ?? 'faint'
/** The soft background token that goes with a colour token. */
export const softOf = (c: string): string => (c === 'copper' ? 'copper-soft' : c + '-soft')

/** How a name is said: its own pronunciation, or the entry's for its first name. */
export function sayOf(e: BibleEntry, a: string): string {
  return (e.sayA && e.sayA[a]) || (a === e.aka[0] && e.say ? e.say : '')
}

/** How a name is said and where that came from. A pronunciation with no recorded source was typed by the narrator. */
export function pronOfName(e: BibleEntry, a: string): { say: string; src: string } {
  const say = sayOf(e, a)
  return { say, src: say ? e.saySrc?.[a] || 'manual' : '' }
}
/** How a flagged word is said and where that came from. */
export function pronOfWord(b: BookData, w: string): { say: string; src: string } {
  const p = b.pronunciations[w]
  return { say: p?.say ?? '', src: p?.say ? p.src || 'manual' : '' }
}

const nameRe = (aka: string[]): RegExp => new RegExp('\\b(?:' + aka.slice().sort((x, y) => y.length - x.length).map(reEsc).join('|') + ')\\b')

/** Chapters (with text) that mention an entry by any of its names. Chapters only: how often is not counted. */
export function appearsIn(b: BookData, e: BibleEntry | undefined): Chapter[] {
  if (!e || !e.aka.length) return []
  const re = nameRe(e.aka)
  return b.chapters.filter((c) => {
    const ps = paragraphsOf(b, c.id)
    return ps.length > 0 && re.test(ps.map((x) => x.text).join(' '))
  })
}

/** How many chapters each entry appears in, by entry id. */
export function chapterCounts(b: BookData): Map<string, number> {
  return new Map(b.bible.map((e) => [e.id, appearsIn(b, e).length]))
}

/** The entry (other than this one) that already has this name among its names, ignoring case. */
export function nameOwner(b: BookData, entryId: string, name: string): BibleEntry | undefined {
  const k = name.trim().toLowerCase()
  return k ? b.bible.find((e) => e.id !== entryId && e.aka.some((a) => a.toLowerCase() === k)) : undefined
}

/** Needs review: it arrived with the manuscript import and the narrator has not looked at it yet. */
export const needsReview = (e: BibleEntry): boolean => !!e.review && (e.review.entry || e.review.aliases.length > 0)
export const aliasNeedsReview = (e: BibleEntry, alias: string): boolean => !!e.review?.aliases.includes(alias)
/** Something is waiting for the narrator on this entry: an import flag, or a suggestion to verify (see selectors/extraction.ts). */
export const entryNeedsReview = (b: Pick<BookData, 'suggestions'>, e: BibleEntry): boolean =>
  needsReview(e) || b.suggestions.some((s) => s.status === 'needs-verification' && s.entryId === e.id)
export const reviewCount = (b: BookData): number => b.bible.filter((e) => entryNeedsReview(b, e)).length

export type BibleSortKey = 'name' | 'type' | 'chapters'
/** The list in the order chosen. Ties fall back to the name, so the order is always the same. */
export function sortEntries(b: BookData, list: BibleEntry[], sort: BibleSortKey, counts: Map<string, number>): BibleEntry[] {
  const byName = (x: BibleEntry, y: BibleEntry): number => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' })
  const typeIx = (e: BibleEntry): number => {
    const i = b.bibleTypes.findIndex((t) => t.k === e.kind)
    return i < 0 ? b.bibleTypes.length : i
  }
  const cmp =
    sort === 'type' ? (x: BibleEntry, y: BibleEntry) => typeIx(x) - typeIx(y) || byName(x, y)
    : sort === 'chapters' ? (x: BibleEntry, y: BibleEntry) => (counts.get(y.id) ?? 0) - (counts.get(x.id) ?? 0) || byName(x, y)
    : byName
  return list.slice().sort(cmp)
}

/** Entries mentioned in a chapter. */
export function entriesInChapter(b: BookData, chapterId: string): BibleEntry[] {
  const ps = paragraphsOf(b, chapterId)
  if (!ps.length) return []
  const txt = ps.map((x) => x.text).join(' ')
  return b.bible.filter((e) => e.aka.some((a) => new RegExp('\\b' + reEsc(a) + '\\b').test(txt)))
}

export const firstLabel = (b: BookData, e: BibleEntry): string => {
  const c = b.chapters.find((x) => x.id === e.first)
  return c ? chTag(b, c) : e.first ?? '—'
}

/** Quoted phrases an entry speaks: those whose speaker is one of its names. */
export function linesOf(b: BookData, e: BibleEntry): Array<{ pid: string; chapterId: string; spk: string; s: number; e: number; t: string }> {
  const names = new Set(speakerCandidates(b).filter((c) => c.entryId === e.id).map((c) => c.alias))
  if (!names.size) return []
  const out: Array<{ pid: string; chapterId: string; spk: string; s: number; e: number; t: string }> = []
  b.paragraphs.forEach((p) =>
    phrasesOf(p, b).forEach((ph) => {
      if (ph.q && names.has(ph.spk)) out.push({ pid: p.id, chapterId: p.chapterId, spk: ph.spk, s: ph.s, e: ph.e, t: p.text.slice(ph.s, ph.e) })
    }),
  )
  return out
}

/** Entries matching a search over names and other names. */
export function findEntries(b: BookData, q: string, kind: string): BibleEntry[] {
  const t = q.trim().toLowerCase()
  return b.bible.filter((e) => (kind === 'All' || e.kind === kind) && (!t || e.name.toLowerCase().includes(t) || e.aka.some((a) => a.toLowerCase().includes(t))))
}

/** Pronunciation words flagged in the text for a chapter. */
export function wordsInChapter(b: BookData, chapterId: string): string[] {
  const pids = new Set(paragraphsOf(b, chapterId).map((p) => p.id))
  return [...new Set(b.annotations.filter((a: Annotation) => a.type === 'pron' && pids.has(a.p) && a.key).map((a) => a.key as string))]
}
export const pronStatus = (b: BookData, w: string): 'Set' | 'Not set' | 'Not flagged' =>
  b.pronunciations[w] ? (b.pronunciations[w].say ? 'Set' : 'Not set') : 'Not flagged'
