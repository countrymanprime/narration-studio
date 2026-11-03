import type { BookData, Chapter, Paragraph } from '@/domain/schemas'
import { chapterLabel, chapterName, chapterTag } from '@/format/headings'

export const chapterById = (b: BookData, id: string | null | undefined): Chapter | undefined =>
  id == null ? undefined : b.chapters.find((c) => c.id === id)

/** The full heading, in the manuscript's style: "CHAPTER I. Down the Rabbit-Hole". */
export const chName = (b: BookData, c: Chapter): string => chapterName(c, b.manuscript.headingStyle)
/** The short tag: "CHAPTER I", "1", "Chapter 1", or the credits title. */
export const chTag = (b: BookData, c: Chapter): string => chapterTag(c, b.manuscript.headingStyle)
/** The label before the title. Empty for credits. */
export const chLabel = (b: BookData, c: Chapter): string => chapterLabel(c, b.manuscript.headingStyle)

export const numberedChapters = (b: BookData): Chapter[] => b.chapters.filter((c) => c.n != null)

export const paragraphsOf = (b: BookData, chapterId: string): Paragraph[] => b.paragraphs.filter((p) => p.chapterId === chapterId)
export const hasText = (b: BookData, chapterId: string): boolean => b.paragraphs.some((p) => p.chapterId === chapterId)
export const paragraphById = (b: BookData, pid: string | null | undefined): Paragraph | undefined =>
  pid == null ? undefined : b.paragraphs.find((p) => p.id === pid)
export const paragraphChapter = (b: BookData, pid: string): string => paragraphById(b, pid)?.chapterId ?? pid.split('-')[0]

/** "CHAPTER V · ¶ 4" — where a paragraph is. */
export function pidLabel(b: BookData, pid: string): string {
  const p = paragraphById(b, pid)
  const c = chapterById(b, p?.chapterId)
  const n = p ? paragraphsOf(b, p.chapterId).findIndex((x) => x.id === pid) + 1 : 0
  return (c ? chTag(b, c) : pid) + ' · ¶ ' + n
}

/** Chapter heading for the credits uses 'Opening pages' / 'Closing pages' in the import outline. */
export function outlineName(b: BookData, c: Chapter): string {
  return c.kind === 'credits' ? (c.id === 'open' ? 'Opening pages' : 'Closing pages') : chName(b, c)
}

/** The chapter being recorded now: the first one that is started but not finished. */
export const recordingChapterOf = (b: BookData): Chapter | undefined => b.chapters.find((c) => c.rec > 0 && c.rec < 100)
