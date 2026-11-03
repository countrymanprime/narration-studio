/**
 * Comparing what a speech check heard with the manuscript. A stretch of the script that was not said is `missing`, words said that are
 * not in the script are `extra`, and other words said in place of the script's are a `misread`. Only gaps inside the part that was
 * read are lines to redo: paragraphs left unread at the start or the end are unfinished recording, not pickups.
 */
import type { GapKind, Paragraph } from '@/domain/schemas'
import { diffWords, tokens } from '@/format/diff'

export interface Gap {
  pid: string
  kind: GapKind
  /** The script words [from, to) the gap covers: words not said (missing, misread) or the place the extra words were said at. */
  words: [number, number]
  /** The script words involved (empty for extra words) and what was said in their place. */
  script: string
  heard: string
}

export interface GapResult {
  gaps: Gap[]
  /** Paragraphs left unread before the first read one and after the last. */
  unfinished: { start: number; end: number }
  /** How many paragraphs were read, from the first read one to the last, and how many the chapter has. */
  readTo: number
  paras: number
}

const join = (w: string[]): string => w.reduce((a, x) => (a ? a + (a.endsWith('—') ? '' : ' ') + x : x), '')

/** `heard[i]` is what was said for paragraph `i`, or null when nothing was. */
export function classifyGaps(paras: Paragraph[], heard: ReadonlyArray<string | null>): GapResult {
  const read = heard.map((h) => h != null)
  const first = read.indexOf(true)
  const last = read.lastIndexOf(true)
  const gaps: Gap[] = []
  if (first < 0) return { gaps, unfinished: { start: paras.length, end: 0 }, readTo: 0, paras: paras.length }
  paras.forEach((p, i) => {
    if (i < first || i > last) return
    const n = tokens(p.text).length
    const said = heard[i]
    if (said == null) {
      gaps.push({ pid: p.id, kind: 'missing', words: [0, n], script: p.text, heard: '' })
      return
    }
    const parts = diffWords(p.text, said)
    let at = 0
    let k = 0
    while (k < parts.length) {
      if (parts[k].k === 'same') { at++; k++; continue }
      const from = at
      const del: string[] = []
      const ins: string[] = []
      while (k < parts.length && parts[k].k !== 'same') {
        if (parts[k].k === 'del') { del.push(parts[k].w); at++ } else ins.push(parts[k].w)
        k++
      }
      const kind: GapKind = del.length && ins.length ? 'misread' : del.length ? 'missing' : 'extra'
      gaps.push({ pid: p.id, kind, words: [from, at], script: join(del), heard: join(ins) })
    }
  })
  return { gaps, unfinished: { start: first, end: paras.length - 1 - last }, readTo: last - first + 1, paras: paras.length }
}

/** The finding type a gap is listed as. */
export const GAP_TYPE = { missing: 'skip', extra: 'repeat', misread: 'misread' } as const
export const GAP_LABEL: Record<GapKind, string> = { missing: 'Left out', extra: 'Extra words', misread: 'Misread' }
