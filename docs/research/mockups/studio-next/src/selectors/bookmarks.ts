import type { BookData, Bookmark, Chapter, Paragraph } from '@/domain/schemas'
import { wordsIn } from '@/format/text'
import { boothUnits, unitAtPosition, type BoothUnit } from './booth'
import { paragraphById } from './chapters'

/** A place in the manuscript: a paragraph and a character offset in its text. */
export interface Spot { pid: string; offset: number }

/** Paragraph id -> its place in the book (the order of `paragraphs` is the book's order). */
const paraOrder = (b: BookData): Map<string, number> => new Map(b.paragraphs.map((p, i) => [p.id, i]))

/** The bookmarks in the order of the book. */
export function sortedBookmarks(b: BookData): Bookmark[] {
  const at = paraOrder(b)
  const pos = (x: Bookmark): number => at.get(x.pid) ?? Number.MAX_SAFE_INTEGER
  return [...b.bookmarks].sort((x, y) => pos(x) - pos(y) || x.offset - y.offset)
}

export const bookmarkById = (b: BookData, id: string | null | undefined): Bookmark | undefined => (id == null ? undefined : b.bookmarks.find((x) => x.id === id))
export const bookmarkAt = (b: BookData, s: Spot): Bookmark | undefined => b.bookmarks.find((x) => x.pid === s.pid && x.offset === s.offset)

/** The bookmarks of each chapter that has any, chapters in the book's order, bookmarks in reading order. */
export function bookmarksByChapter(b: BookData): Array<{ chapter: Chapter; items: Bookmark[] }> {
  const all = sortedBookmarks(b)
  return b.chapters
    .map((chapter) => ({ chapter, items: all.filter((x) => x.chapterId === chapter.id) }))
    .filter((g) => g.items.length)
}

/** The words the mark sits on, for naming it when it has no label: from the start of its word, cut at `max` characters. */
export function bookmarkSnippet(b: BookData, x: Bookmark, max = 56): string {
  const text = paragraphById(b, x.pid)?.text ?? ''
  let from = Math.min(x.offset, text.length)
  while (from > 0 && /\S/.test(text[from - 1]) && /\S/.test(text[from] ?? ' ')) from--
  const rest = text.slice(from).replace(/\s+/g, ' ').trim()
  if (rest.length <= max) return rest
  const cut = rest.slice(0, max)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2))).trimEnd() + '…'
}

/** What the mark is called: its label, or the words it sits on. */
export const bookmarkTitle = (b: BookData, x: Bookmark): string => x.label.trim() || bookmarkSnippet(b, x)

/** What its tooltip says: the label and the note, or the words when it has neither. */
export function bookmarkTip(b: BookData, x: Bookmark): string {
  const t = [x.label.trim(), x.note.trim()].filter(Boolean).join(': ')
  return t || bookmarkSnippet(b, x)
}

/**
 * The bookmark after (`dir` 1) or before (-1) a place, wrapping round the book. A place that holds a bookmark does not count as after or before itself.
 * With no place, the first (or last) one. Null when there are none.
 */
export function stepBookmark(b: BookData, from: Spot | null, dir: 1 | -1): Bookmark | null {
  const all = sortedBookmarks(b)
  if (!all.length) return null
  if (!from) return dir > 0 ? all[0] : all[all.length - 1]
  const at = paraOrder(b)
  const here = (at.get(from.pid) ?? -1) * 1e9 + from.offset
  const key = (x: Bookmark): number => (at.get(x.pid) ?? -1) * 1e9 + x.offset
  const hit = dir > 0 ? all.find((x) => key(x) > here) : [...all].reverse().find((x) => key(x) < here)
  return hit ?? (dir > 0 ? all[0] : all[all.length - 1])
}

/** The character offset where the nth word of a phrase starts in its paragraph. */
export function wordStart(para: Paragraph, unit: BoothUnit, word: number): number {
  const re = /\S+/g
  const seg = para.text.slice(unit.s, unit.e)
  let m: RegExpExecArray | null
  let i = 0
  let last = 0
  while ((m = re.exec(seg))) {
    last = m.index
    if (i++ >= word) break
  }
  return unit.s + last
}

/** Where the Booth's reading position is in the text. */
export function boothSpot(paras: Paragraph[], units: BoothUnit[], cur: number, wcur: number): Spot | null {
  const u = units[cur]
  const p = u && paras[u.pi]
  return u && p ? { pid: p.id, offset: wordStart(p, u, Math.max(0, Math.min(u.nw - 1, wcur))) } : null
}

/** The phrase and word of a chapter's reading position a bookmark is at, or null when its paragraph is not in the chapter. */
export function boothPositionOf(b: BookData, x: Bookmark): { cur: number; wcur: number } | null {
  const { paras, units } = boothUnits(b, x.chapterId)
  const text = paras.find((p) => p.id === x.pid)?.text
  return text == null ? null : unitAtPosition(paras, units, x.pid, wordsIn(text.slice(0, x.offset)))
}
