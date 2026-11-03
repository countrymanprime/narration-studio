/**
 * Sample data behind the mock alignment provider: how the recording differs from the script, by the id of the take (or, where a stretch of
 * the recording has no take of its own, the paragraph). The mock builds what the recogniser would have heard from this and from the text; a
 * real provider (a recogniser with word timestamps) answers the same questions from the audio and nothing in a screen changes.
 * Word numbers count the words of the text the stretch was read from, from 0.
 */
import { z } from 'zod'
import { HEAR_EDITS } from './speech'

export const ENGINE = { id: 'whisper-aligned', name: 'Whisper with word timestamps' } as const

export const HeardEdit = z.discriminatedUnion('op', [
  /** Words that were said and are not in the script, said just before word `at`. */
  z.object({ op: z.literal('add'), at: z.number().int().nonnegative(), words: z.string().min(1), conf: z.number().min(0).max(1) }),
  /** A word that was heard as another word. */
  z.object({ op: z.literal('sub'), at: z.number().int().nonnegative(), heard: z.string().min(1), conf: z.number().min(0).max(1) }),
  /** A word that was not read. */
  z.object({ op: z.literal('drop'), at: z.number().int().nonnegative() }),
  /** A word that was read as written, but the recogniser was unsure of. */
  z.object({ op: z.literal('low'), at: z.number().int().nonnegative(), conf: z.number().min(0).max(1) }),
])
export type HeardEdit = z.infer<typeof HeardEdit>

const add = (at: number, words: string, conf: number): HeardEdit => ({ op: 'add', at, words, conf })
const sub = (at: number, heard: string, conf: number): HeardEdit => ({ op: 'sub', at, heard, conf })
const drop = (at: number): HeardEdit => ({ op: 'drop', at })
const low = (at: number, conf: number): HeardEdit => ({ op: 'low', at, conf })

/** What the sample recordings of Chapter V sound like where they differ from the script. */
export const HEARD_EDITS: Record<string, HeardEdit[]> = {
  'T05-5': [low(1, 0.62), add(4, 'um, sorry, one second,', 0.93), sub(18, 'mourning,', 0.54), add(19, 'so,', 0.88), drop(27)],
  'T05-3': [low(3, 0.66), add(7, 'uh,', 0.9), low(12, 0.66)],
  'T05-9': [add(8, 'er,', 0.86), low(18, 0.66)],
  '5-7': [add(12, 'you know,', 0.91)],
}

/** The speech check's own findings (missing, added or swapped words), seen here too so the script and the check agree. */
export function fromSpeechEdits(pid: string): HeardEdit[] {
  const chapter = pid.split('-')[0]
  return (HEAR_EDITS[chapter] ?? []).filter((e) => e.pid === pid).flatMap((e): HeardEdit[] => {
    if (e.op === 'skip') return []
    if (e.op === 'add') return [add(e.at, e.words, e.conf ?? 0.8)]
    if (e.op === 'drop') return Array.from({ length: e.to - e.from }, (_, k) => drop(e.from + k))
    const heard = e.words.split(/\s+/)
    return Array.from({ length: e.to - e.from }, (_, k) => (heard[k] ? sub(e.from + k, heard[k], e.conf ?? 0.8) : drop(e.from + k)))
  })
}
