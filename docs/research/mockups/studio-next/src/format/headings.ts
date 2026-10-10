import type { Chapter } from '@/domain/schemas'

/** How the manuscript writes a chapter heading. One formatter per idea: every page uses these. */
export type HeadingStyle = 'gutenberg' | 'numbered' | 'colon'

const ROMAN_PAIRS: Array<[number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
]
export function roman(n: number): string {
  let out = ''
  for (const [v, s] of ROMAN_PAIRS) {
    while (n >= v) {
      out += s
      n -= v
    }
  }
  return out
}

const LABELS: Record<HeadingStyle, (n: number) => string> = {
  gutenberg: (n) => 'CHAPTER ' + roman(n) + '.',
  numbered: (n) => n + '.',
  colon: (n) => 'Chapter ' + n + ':',
}

export const HEADING_STYLES: Array<{ key: HeadingStyle; example: string }> = [
  { key: 'gutenberg', example: 'CHAPTER I. Down the Rabbit-Hole' },
  { key: 'numbered', example: '1. Down the Rabbit-Hole' },
  { key: 'colon', example: 'Chapter 1: Down the Rabbit-Hole' },
]

/** The label before the title ("CHAPTER I."). Empty for credits. */
export function chapterLabel(c: Chapter, style: HeadingStyle): string {
  return c.kind === 'credits' || c.n == null ? '' : LABELS[style](c.n)
}

/** Short tag: "CHAPTER I", "1", "Chapter 1", or the credits title. */
export function chapterTag(c: Chapter, style: HeadingStyle): string {
  return c.kind === 'credits' ? c.title : chapterLabel(c, style).replace(/[.:]$/, '')
}

/** Full heading: "CHAPTER I. Down the Rabbit-Hole". */
export function chapterName(c: Chapter, style: HeadingStyle): string {
  return c.kind === 'credits' ? c.title : chapterLabel(c, style) + ' ' + c.title
}
