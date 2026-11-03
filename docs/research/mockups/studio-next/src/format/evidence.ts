import type { Evidence, Payload } from '@/domain/extraction'

export interface ParaText { id: string; chapterId: string; text: string }

/** Typographic quotes, dashes' spaces and non-breaking spaces compare as their plain forms. One character stays one character, so offsets stay valid. */
const plain = (s: string): string => s.replace(/[‘’‛]/g, "'").replace(/[“”‟]/g, '"').replace(/[   ]/g, ' ')

export interface QuoteHint { paragraphId?: string; chapterId?: string }

/**
 * Find a quote in the manuscript and say exactly where it is. The paragraph named by the hint is tried first, then the rest of its
 * chapter, then the whole book. Offsets are computed here from the text itself, never taken from a provider; `text` is the slice of the manuscript.
 * Returns null when the quote cannot be found (the claim then needs verification).
 */
export function verifyEvidence(paragraphs: ParaText[], quote: string, hint: QuoteHint = {}): Evidence | null {
  const q = plain(quote.trim())
  if (!q) return null
  const first = hint.paragraphId ? paragraphs.filter((p) => p.id === hint.paragraphId) : []
  const chapter = hint.chapterId ? paragraphs.filter((p) => p.chapterId === hint.chapterId && !first.includes(p)) : []
  const rest = paragraphs.filter((p) => !first.includes(p) && !chapter.includes(p))
  for (const p of [...first, ...chapter, ...rest]) {
    const at = plain(p.text).indexOf(q)
    if (at >= 0) return { paragraphId: p.id, start: at, end: at + q.length, text: p.text.slice(at, at + q.length) }
  }
  return null
}

const norm = (s: string): string => plain(s).toLowerCase().replace(/\s+/g, ' ').trim()

/** What a suggestion is about, so the same thing offered again (or one the narrator rejected) is recognised. */
export function fingerprint(p: Payload): string {
  switch (p.kind) {
    case 'entry': return 'entry|' + norm(p.name)
    case 'alias': return 'alias|' + norm(p.entry) + '|' + norm(p.alias)
    case 'property': return 'property|' + norm(p.entry) + '|' + norm(p.key) + '|' + norm(p.value)
    case 'relationship': return 'relationship|' + norm(p.entry) + '|' + norm(p.relation) + '|' + norm(p.to)
    case 'claim': return 'claim|' + norm(p.entry) + '|' + p.claim + '|' + norm(p.text)
    case 'speaker': return 'speaker|' + norm(p.quote) + '|' + norm(p.speaker)
  }
}

/** A confidence as a whole percent. */
export const pct = (c: number): number => Math.round(c * 100)
