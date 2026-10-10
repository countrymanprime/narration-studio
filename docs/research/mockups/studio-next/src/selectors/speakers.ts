import { MarkColour, type BibleEntry, type BookData } from '@/domain/schemas'
import { reEsc } from '@/format/text'

/** Internal value of a phrase that is not quoted: the narration. It is never offered as a speaker. */
export const NARRATOR = 'NARR'
/** A quoted phrase nobody is named for. */
export const UNKNOWN_SPEAKER = '?'

type SpeakerData = Pick<BookData, 'bible' | 'bibleTypes'>

/** The colours a speaker can have: the colour tokens the app already defines. */
export const SPEAKER_PALETTE: readonly MarkColour[] = MarkColour.options

/** A small stable hash (FNV-1a), so the same id always lands on the same palette colour. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * The colour of a speaker's chips and swatches. It belongs to the entry, so every name of the entry shares it. The narrator's
 * choice wins; otherwise the colour is assigned from the palette by the entry id, which never changes when other entries come or go.
 */
export const speakerColourOf = (e: Pick<BibleEntry, 'id' | 'colour'>): MarkColour => e.colour ?? SPEAKER_PALETTE[hash(e.id) % SPEAKER_PALETTE.length]

export interface SpeakerCandidate {
  /** The name exactly as the Story Bible spells it: what a phrase stores as its speaker. */
  alias: string
  entryId: string
  entryName: string
  /** Story Bible type of the entry */
  kind: string
  /** Colour token of that type ('faint' when the type is gone) */
  colour: MarkColour | 'faint'
  /** The speaker's own colour (see speakerColourOf) */
  speakerColour: MarkColour
}

const cache = new WeakMap<BibleEntry[], WeakMap<object, SpeakerCandidate[]>>()

/** Every alias of every entry whose Story Bible type can speak. Derived, so a Story Bible edit changes who can be picked. */
export function speakerCandidates(data: SpeakerData): SpeakerCandidate[] {
  let byTypes = cache.get(data.bible)
  if (!byTypes) cache.set(data.bible, (byTypes = new WeakMap()))
  const hit = byTypes.get(data.bibleTypes)
  if (hit) return hit
  const speaking = new Set(data.bibleTypes.filter((t) => t.speaker).map((t) => t.k))
  const colours = new Map(data.bibleTypes.map((t) => [t.k, t.c]))
  const seen = new Set<string>()
  const out: SpeakerCandidate[] = []
  data.bible.forEach((e) => {
    if (!speaking.has(e.kind)) return
    e.aka.forEach((alias) => {
      const k = alias.toLowerCase()
      if (!alias.trim() || seen.has(k)) return
      seen.add(k)
      out.push({ alias, entryId: e.id, entryName: e.name, kind: e.kind, colour: colours.get(e.kind) ?? 'faint', speakerColour: speakerColourOf(e) })
    })
  })
  byTypes.set(data.bibleTypes, out)
  return out
}

/** The candidate an alias stands for (exact spelling first, then ignoring case). */
export function candidateOf(data: SpeakerData, alias: string): SpeakerCandidate | undefined {
  const all = speakerCandidates(data)
  return all.find((c) => c.alias === alias) ?? all.find((c) => c.alias.toLowerCase() === alias.toLowerCase())
}

/** The Story Bible entry whose names include this alias, if its type can speak. */
export function entryOfSpeaker(data: SpeakerData, alias: string): BibleEntry | undefined {
  const c = candidateOf(data, alias)
  return c ? data.bible.find((e) => e.id === c.entryId) : undefined
}

/** Inline custom properties that colour a speaker chip with the speaker's own colour. No style for narration or an unknown speaker. */
export function speakerVars(data: SpeakerData, alias: string): Record<string, string> | undefined {
  const c = alias === NARRATOR || alias === UNKNOWN_SPEAKER ? undefined : candidateOf(data, alias)
  if (!c) return undefined
  return { '--spk-c': 'var(--' + c.speakerColour + ')', '--spk-soft': 'var(--' + c.speakerColour + '-soft)' }
}

const SAY_RE = /\b(said|asked|replied|cried|shouted|called out|began|screamed|remarked|exclaimed|answered|say)\b/i

/** Which speaker does a stretch of text name next to a verb of speech ("said Five")? Aliases of speaking entries, longest first. */
export function speakerIn(seg: string, data: SpeakerData): string | null {
  const v = seg.match(SAY_RE)
  if (!v || v.index == null) return null
  let best: string | null = null
  let bd = 1e9
  const byLength = speakerCandidates(data).slice().sort((a, b) => b.alias.length - a.alias.length)
  for (const c of byLength) {
    const re = new RegExp('\\b' + reEsc(c.alias) + '\\b', 'ig')
    let m: RegExpExecArray | null
    while ((m = re.exec(seg))) {
      const d = Math.abs(m.index - v.index)
      if (d < bd) {
        bd = d
        best = c.alias
      }
    }
  }
  return best
}
