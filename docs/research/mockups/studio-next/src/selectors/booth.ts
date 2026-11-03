import type { BookData, Paragraph, Pickup } from '@/domain/schemas'
import { wordsIn } from '@/format/text'
import { annsInChapter, isAsk, markOf } from './annotations'
import { typeColour } from './bible'
import { paragraphsOf } from './chapters'
import { phrasesOf } from './phrases'
import { NARRATOR } from './speakers'
import { reEsc } from '@/format/text'
import { WPH } from '@/config/estimates'
import type { ResumePoint } from '@/domain/daw'

export const MICS = ['USB audio interface · Input 1', 'USB microphone', 'Built-in microphone']

/** One phrase of the chapter: the unit the Booth follows and speaker attribution applies to. */
export interface BoothUnit {
  key: string
  pid: string
  /** Index of the paragraph in the chapter */
  pi: number
  s: number
  e: number
  spk: string
  q: boolean
  conf: boolean
  t: string
  nw: number
  /** A later sentence of the same quoted phrase: it has no speaker chip of its own */
  cont?: boolean
}

/** The chapter's paragraphs, or one placeholder paragraph when the chapter has no text yet. */
export function boothParagraphs(b: BookData, chapterId: string): Paragraph[] {
  const ps = paragraphsOf(b, chapterId)
  return ps.length ? ps : [{ id: 'x-1', chapterId, speaker: NARRATOR, text: 'Chapter text appears here.' }]
}

const ABBREV = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|Prof|Capt)\.$/
/** The sentences of a stretch of text, as [start, end) ranges that cover it exactly (trailing space stays with the sentence before). */
export function sentenceRanges(text: string, s: number, e: number): Array<[number, number]> {
  const seg = text.slice(s, e)
  const out: Array<[number, number]> = []
  const re = /[.!?…]["”’)]*\s+(?=["“‘(]?[A-Z0-9])/g
  let from = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(seg))) {
    const end = m.index + m[0].length
    if (ABBREV.test(seg.slice(from, m.index + 1))) continue
    out.push([s + from, s + end])
    from = end
  }
  if (from < seg.length || !out.length) out.push([s + from, e])
  return out
}

export function boothUnits(b: Pick<BookData, 'paragraphs' | 'bible' | 'bibleTypes' | 'confirmedSpeakers'>, chapterId: string): { paras: Paragraph[]; units: BoothUnit[] } {
  const own = b.paragraphs.filter((p) => p.chapterId === chapterId)
  const paras = own.length ? own : [{ id: 'x-1', chapterId, speaker: NARRATOR, text: 'Chapter text appears here.' }]
  const units: BoothUnit[] = []
  paras.forEach((p, pi) =>
    phrasesOf(p, b).forEach((ph) => {
      /* The Booth moves a sentence at a time, so a narration paragraph with no quotation marks is not one jump. */
      sentenceRanges(p.text, ph.s, ph.e).forEach(([a, z], k) => {
        const t = p.text.slice(a, z)
        units.push({ key: k === 0 ? ph.key : ph.key + '#' + a, pid: p.id, pi, s: a, e: z, spk: ph.spk, q: ph.q, conf: ph.confirmed, t, nw: Math.max(1, wordsIn(t)), cont: k > 0 || undefined })
      })
    }),
  )
  return { paras, units }
}

/** Where a pickup sits in the chapter's phrases, or -1. */
export const pickUnit = (x: Pickup, units: BoothUnit[]): number => (x.pid ? units.findIndex((u) => u.pid === x.pid) : -1)

export interface WordTok {
  /** The word, without the space after it */
  text: string
  /** Whitespace that follows it (never part of the word's highlight) */
  gap: string
  i: number
  mark?: { name: string; colour: string }
  /** Colour token of the Story Bible entry the word belongs to */
  entity?: string
  /** The Story Bible entry the word belongs to, and the annotation that marks it */
  entryId?: string
  annId?: string
}
export interface UnitWords { lead: string; words: WordTok[] }

/** Every word is its own token so the one being read can be shown. Marked words keep their underline; Story Bible names get a tint. */
export function unitWords(b: BookData, p: Paragraph, s: number, e: number): UnitWords {
  const ents: Array<{ s: number; e: number; kind: string; id: string }> = []
  b.bible.forEach((en) =>
    en.aka.forEach((al) => {
      const re = new RegExp('\\b' + reEsc(al) + '\\b', 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(p.text))) ents.push({ s: m.index, e: m.index + al.length, kind: en.kind, id: en.id })
    }),
  )
  const anns = annsInChapter(b, p.chapterId).filter((a) => a.p === p.id && a.type === 'mark' && a.s < e && a.e > s)
  const txt = p.text.slice(s, e)
  const words: WordTok[] = []
  const re = /\S+\s*/g
  let m: RegExpExecArray | null
  let wi = 0
  while ((m = re.exec(txt))) {
    const a0 = s + m.index
    const text = m[0].trimEnd()
    const a1 = a0 + text.length
    const cv = anns.find((x) => x.s < a1 && x.e > a0)
    const en = ents.find((x) => x.s < a1 && x.e > a0)
    const mk = cv ? markOf(b, cv) : null
    words.push({
      text, gap: m[0].slice(text.length), i: wi++,
      mark: mk ? { name: mk.name, colour: mk.c } : undefined,
      entity: en ? typeColour(b, en.kind) : undefined,
      entryId: en?.id,
      annId: cv?.id,
    })
  }
  return { lead: txt.match(/^\s*/)?.[0] ?? '', words }
}

/** Notes (not queries to the author) shown under a paragraph. */
export function paragraphNotes(b: BookData, p: Paragraph): Array<{ id: string; name: string; text: string }> {
  return annsInChapter(b, p.chapterId)
    .filter((a) => a.p === p.id && a.type === 'mark' && a.text && !isAsk(b, a))
    .map((a) => ({ id: a.id, name: markOf(b, a).name, text: a.text as string }))
}

/** Seconds into a straight read of the chapter (at the standard rate) where a phrase starts. */
export function unitSeconds(units: BoothUnit[], idx: number): number {
  const words = units.slice(0, Math.max(0, idx)).reduce((a, u) => a + u.nw, 0)
  return (words / WPH) * 3600
}

/** The paragraph and the word in it where the reading position is. */
export function positionOf(paras: Paragraph[], units: BoothUnit[], cur: number, wcur: number): { pid: string; word: number } | null {
  const u = units[cur]
  const p = u && paras[u.pi]
  return u && p ? { pid: p.id, word: wordsIn(p.text.slice(0, u.s)) + Math.max(0, Math.min(u.nw - 1, wcur)) } : null
}

/** The phrase and word for a paragraph and word number, or null when the paragraph is not in the chapter. */
export function unitAtPosition(paras: Paragraph[], units: BoothUnit[], pid: string, word: number): { cur: number; wcur: number } | null {
  const own = units.map((u, i) => ({ u, i })).filter((x) => x.u.pid === pid)
  if (!own.length) return null
  const text = paras.find((p) => p.id === pid)?.text ?? ''
  let hit = own[0]
  for (const x of own) if (wordsIn(text.slice(0, x.u.s)) <= word) hit = x
  return { cur: hit.i, wcur: Math.max(0, Math.min(hit.u.nw - 1, word - wordsIn(text.slice(0, hit.u.s)))) }
}

/** The paragraph and word a share of the chapter's words in (0 to 1) falls on. */
export function pointAtFraction(paras: Paragraph[], fraction: number): { pid: string; word: number } | null {
  const total = paras.reduce((a, p) => a + wordsIn(p.text), 0)
  if (!total) return null
  let left = Math.min(total - 1, Math.floor(fraction * total))
  for (const p of paras) {
    const n = wordsIn(p.text)
    if (left < n) return { pid: p.id, word: left }
    left -= n
  }
  return null
}

/** What Resume at … offers: the place in the chapter and which phrase that is. */
export interface ResumeOffer { point: ResumePoint; cur: number; wcur: number; para: number }
export function resumeOffer(paras: Paragraph[], units: BoothUnit[], point: ResumePoint | null | undefined): ResumeOffer | null {
  if (!point) return null
  const at = unitAtPosition(paras, units, point.pid, point.word)
  return at ? { point, ...at, para: units[at.cur].pi } : null
}

/** Suspected skips and restarts found while reading this chapter that are still open. */
export function suspectedLines(b: BookData, chapterId: string): Pickup[] {
  const gone = new Set(b.pickGone)
  return b.pickups.filter((x) => x.live && x.chapterId === chapterId && !gone.has(x.id) && !b.pickDone.includes(x.id))
}
