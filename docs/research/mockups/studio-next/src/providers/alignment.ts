/**
 * What the recording sounds like, word by word: the alignment provider. Given a stretch of the recording (a take, or a paragraph that has no
 * take of its own) it answers what the recogniser heard with when each word began and ended and how sure it was. The screens never align
 * anything themselves: they ask this, and set the heard words against the manuscript (selectors/scriptedit.ts), so extra words, missing
 * words and misreads come out of a real transcript and are never invented. The mock builds the transcript from the text it is given and
 * the sample data in fixtures/alignment.ts; a real recogniser replaces it without any screen changing.
 *
 * Words are timed from the start of the stretch (seconds). The recogniser is a different tool from the one that checks pickups, but the
 * sample data of both agrees.
 */
import { ENGINE, HEARD_EDITS, fromSpeechEdits, type HeardEdit } from '@/fixtures/alignment'
import { getState } from '@/state/store'

export interface HeardWord { text: string; off0: number; off1: number; conf: number; /** Said, but not in the text the stretch was read from. */ added?: boolean }
export interface Heard { words: HeardWord[]; len: number }
export interface HeardRequest {
  /** The take, or the paragraph, this stretch is. */
  id: string
  /** What was read: a take's transcript, or the script where the stretch has none of its own. */
  text: string
  /** How long the stretch lasts, when it is known (a take). Otherwise the words are timed at the reading pace. */
  len?: number
}
export interface AlignmentProvider {
  engine(): { id: string; name: string }
  /** What was heard, or null when nothing has been transcribed (the recogniser has not run). */
  heard(req: HeardRequest): Heard | null
  /** A cut point moved to the nearest zero crossing of the audio, seconds, within about 2 ms. */
  snap(sec: number): number
}

const hashOf = (s: string): number => {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return h
}
const weight = (w: string): number => 0.1 + 0.034 * w.replace(/[^\p{L}]/gu, '').length
const rest = (w: string): number => (/[.!?]”?$/.test(w) ? 0.35 : /[,;:—]”?$/.test(w) ? 0.16 : 0.04)
const r3 = (n: number): number => Math.round(n * 1000) / 1000
/** The score of a word read as written: stable for the same word of the same stretch. */
const plainConf = (id: string, i: number): number => 0.93 + (hashOf(id + '#' + i) % 70) / 1000

export function createMockAlignment(edits: Record<string, HeardEdit[]> = HEARD_EDITS, extra: (id: string) => HeardEdit[] = fromSpeechEdits): AlignmentProvider {
  return {
    engine: () => ENGINE,
    heard({ id, text, len }) {
      if (getState().mock.alignment === 'none') return null
      const base = text.split(/\s+/).filter(Boolean)
      const own = [...(edits[id] ?? []), ...extra(id)]
      const out: Array<{ text: string; conf: number; added: boolean; pauseBefore: number; pauseAfter: number }> = []
      base.forEach((w, i) => {
        own.filter((e): e is Extract<HeardEdit, { op: 'add' }> => e.op === 'add' && e.at === i).forEach((e) =>
          e.words.split(/\s+/).forEach((x, k, all) => out.push({ text: x, conf: e.conf, added: true, pauseBefore: k === 0 ? 0.38 : 0, pauseAfter: k === all.length - 1 ? 0.3 : 0 })))
        if (own.some((e) => e.op === 'drop' && e.at === i)) return
        const s = own.find((e): e is Extract<HeardEdit, { op: 'sub' }> => e.op === 'sub' && e.at === i)
        const l = own.find((e): e is Extract<HeardEdit, { op: 'low' }> => e.op === 'low' && e.at === i)
        out.push({ text: s ? s.heard : w, conf: s ? s.conf : l ? l.conf : plainConf(id, i), added: false, pauseBefore: 0, pauseAfter: 0 })
      })
      own.filter((e): e is Extract<HeardEdit, { op: 'add' }> => e.op === 'add' && e.at >= base.length).forEach((e) =>
        e.words.split(/\s+/).forEach((x, k, all) => out.push({ text: x, conf: e.conf, added: true, pauseBefore: k === 0 ? 0.38 : 0, pauseAfter: k === all.length - 1 ? 0.3 : 0 })))
      const natural = out.reduce((a, w) => a + w.pauseBefore + weight(w.text) + rest(w.text) + w.pauseAfter, 0)
      const pad = len != null ? 0.15 : 0
      const scale = len != null && natural > 0 ? Math.max(0.2, (len - 2 * pad) / natural) : 1
      let t = pad
      const words = out.map((w) => {
        t += w.pauseBefore * scale
        const off0 = t
        t += weight(w.text) * scale
        const off1 = t
        t += (rest(w.text) + w.pauseAfter) * scale
        return { text: w.text, off0: r3(off0), off1: r3(off1), conf: w.conf, ...(w.added ? { added: true } : {}) }
      })
      return { words, len: len ?? r3(t + 0.15) }
    },
    snap(sec) {
      const ms = Math.round(sec * 1000)
      return r3((ms + ((hashOf('zc' + ms) % 5) - 2)) / 1000)
    },
  }
}

let current: AlignmentProvider = createMockAlignment()
export const alignment = (): AlignmentProvider => current
/** Swap the provider (a real one, or a test double). */
export function setAlignmentProvider(p: AlignmentProvider): void {
  current = p
}
