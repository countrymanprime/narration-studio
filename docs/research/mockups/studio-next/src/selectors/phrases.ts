import type { BookData, Paragraph } from '@/domain/schemas'
import { candidateOf, NARRATOR, speakerIn, UNKNOWN_SPEAKER } from './speakers'

export interface Phrase {
  key: string
  s: number
  e: number
  /** Quoted: someone speaks. Otherwise narration. */
  q: boolean
  spk: string
  /** The narrator confirmed (or it is narration); otherwise the speaker is a suggestion. */
  confirmed: boolean
}

/** A paragraph is split into quoted phrases (someone speaks) and narration. Each quoted phrase gets a suggested speaker, or "?" when nothing says who. */
export function phrasesOf(p: Paragraph, b: Pick<BookData, 'bible' | 'bibleTypes' | 'confirmedSpeakers'>): Phrase[] {
  const t = p.text
  const raw: Array<{ s: number; e: number; q: boolean }> = []
  const re = /“[^”]*”?/g
  let m: RegExpExecArray | null
  let last = 0
  while ((m = re.exec(t))) {
    if (m.index > last) raw.push({ s: last, e: m.index, q: false })
    raw.push({ s: m.index, e: m.index + m[0].length, q: true })
    last = m.index + m[0].length
  }
  if (last < t.length) raw.push({ s: last, e: t.length, q: false })
  return raw.map((ph, i) => {
    const key = p.id + ':' + ph.s
    if (!ph.q) return { ...ph, key, spk: NARRATOR, confirmed: true }
    const ov = b.confirmedSpeakers[key]
    if (ov && candidateOf(b, ov)) return { ...ph, key, spk: candidateOf(b, ov)!.alias, confirmed: true }
    const n = raw[i + 1]
    const pr = raw[i - 1]
    const nxt = n && !n.q ? t.slice(n.s, Math.min(n.e, n.s + 70)) : ''
    const prv = pr && !pr.q ? t.slice(Math.max(pr.s, pr.e - 70), pr.e) : ''
    return { ...ph, key, spk: speakerIn(nxt, b) || speakerIn(prv, b) || UNKNOWN_SPEAKER, confirmed: false }
  })
}


/** Quoted phrases in a chapter that nothing attributes to a speaker. */
export function unattributed(b: BookData, chapterId: string): number {
  let n = 0
  b.paragraphs.filter((p) => p.chapterId === chapterId).forEach((p) => phrasesOf(p, b).forEach((ph) => { if (ph.q && ph.spk === UNKNOWN_SPEAKER) n++ }))
  return n
}
