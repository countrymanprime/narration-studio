import { REASONS, VERIFY_BELOW } from '@/config/extraction'
import type { ExtractionSuggestion, SuggestionKind } from '@/domain/extraction'
import type { BibleEntry, BookData } from '@/domain/schemas'
import { pct } from '@/format/evidence'
import { appearsIn } from './bible'

type Slice = Pick<BookData, 'bible' | 'suggestions'>

/** The entry a reference points at: its id, its name or any of its names (ignoring case). */
export function resolveEntry(b: Pick<BookData, 'bible'>, ref: string): BibleEntry | undefined {
  const k = ref.trim().toLowerCase()
  if (!k) return undefined
  return b.bible.find((e) => e.id === k) ?? b.bible.find((e) => e.name.toLowerCase() === k) ?? b.bible.find((e) => e.aka.some((a) => a.toLowerCase() === k))
}

/** The kinds that say something about an entry in the text: no quote, no claim. */
export const NEEDS_QUOTE: SuggestionKind[] = ['property', 'claim', 'speaker']
/** The kinds that belong to an entry already in the Story Bible. */
export const NEEDS_ENTRY: SuggestionKind[] = ['alias', 'property', 'relationship', 'claim']

/** True when the confidence is enough to be accepted without the narrator: at or above the threshold. Null never is. */
export const confident = (c: number | null): boolean => c != null && c >= VERIFY_BELOW

/** Why a suggestion cannot be accepted on its own. Empty: it can. */
export function reasonsOf(s: Pick<ExtractionSuggestion, 'kind' | 'confidence' | 'evidence' | 'unverifiedQuote' | 'entryId'>): string[] {
  const out: string[] = []
  if (s.confidence == null) out.push(REASONS.noConfidence)
  else if (s.confidence < VERIFY_BELOW) out.push(REASONS.lowConfidence)
  if (!s.evidence.length) {
    if (s.unverifiedQuote) out.push(REASONS.quoteNotFound)
    else if (NEEDS_QUOTE.includes(s.kind)) out.push(REASONS.noEvidence)
  }
  if (NEEDS_ENTRY.includes(s.kind) && !s.entryId) out.push(REASONS.unknownEntry)
  return out
}
/** The status a suggestion has before the narrator decides: under the threshold, or with something missing, needs verification. */
export const autoStatus = (s: Parameters<typeof reasonsOf>[0]): 'accepted-auto' | 'needs-verification' => (reasonsOf(s).length ? 'needs-verification' : 'accepted-auto')

export const suggestionsOf = (b: Slice, entryId: string): ExtractionSuggestion[] => b.suggestions.filter((s) => s.entryId === entryId && s.status !== 'rejected')
/** To verify: under the threshold, or missing something. */
export const toVerify = (b: Slice): ExtractionSuggestion[] => b.suggestions.filter((s) => s.status === 'needs-verification')
export const verifyCount = (b: Slice): number => toVerify(b).length
export const verifyOf = (b: Slice, entryId: string): number => b.suggestions.filter((s) => s.status === 'needs-verification' && s.entryId === entryId).length
/** Suggestions with no entry in the Story Bible yet (a new entry offered, or something about an entry that is not there). */
export const unattached = (b: Slice): ExtractionSuggestion[] => b.suggestions.filter((s) => !s.entryId && s.status === 'needs-verification')
/** What the narrator still has to look at for an entry: to verify first, then accepted automatically and not yet reviewed. */
export function reviewable(b: Slice, entryId: string): ExtractionSuggestion[] {
  const rank = (s: ExtractionSuggestion): number => (s.status === 'needs-verification' ? 0 : 1)
  return b.suggestions.filter((s) => s.entryId === entryId && (s.status === 'needs-verification' || s.status === 'accepted-auto')).sort((x, y) => rank(x) - rank(y))
}
/** Accepted claims (by the narrator, or automatically) of one kind. */
export const claimsOf = (b: Slice, entryId: string, claim: 'talk' | 'act' | 'know'): ExtractionSuggestion[] =>
  b.suggestions.filter((s) => s.entryId === entryId && s.payload.kind === 'claim' && s.payload.claim === claim && (s.status === 'accepted' || s.status === 'accepted-auto'))
export const propertiesOf = (b: Slice, entryId: string): ExtractionSuggestion[] =>
  b.suggestions.filter((s) => s.entryId === entryId && s.payload.kind === 'property' && (s.status === 'accepted' || s.status === 'accepted-auto'))

/** The words behind a confidence chip: the percent, why, whether the quote was found and how many chapters mention the entry. */
export function confidenceWhy(b: BookData, s: ExtractionSuggestion): string {
  const parts: string[] = []
  parts.push(s.confidence == null ? 'No confidence was given, so you check it.' : pct(s.confidence) + '% ' + (s.confidence >= VERIFY_BELOW ? 'is at or above ' : 'is under ') + pct(VERIFY_BELOW) + '%' + (s.confidence >= VERIFY_BELOW ? ', so it was accepted for you.' : ', so you check it.'))
  if (s.evidence.length) parts.push('The quote was found in the text.')
  else if (s.unverifiedQuote) parts.push('The quote was not found in the text.')
  else if (NEEDS_QUOTE.includes(s.kind)) parts.push('It has no quote.')
  const e = s.entryId ? b.bible.find((x) => x.id === s.entryId) : undefined
  if (e) {
    const n = appearsIn(b, e).length
    parts.push('“' + e.name + '” is mentioned in ' + n + (n === 1 ? ' chapter.' : ' chapters.'))
  }
  return parts.join(' ')
}

/** The one text of a suggestion the narrator can change while accepting it. */
export function editableText(p: ExtractionSuggestion['payload']): string {
  switch (p.kind) {
    case 'entry': return p.name
    case 'alias': return p.alias
    case 'property': return p.value
    case 'relationship': return p.relation
    case 'claim': return p.text
    case 'speaker': return p.speaker
  }
}
export function withText(p: ExtractionSuggestion['payload'], text: string): ExtractionSuggestion['payload'] {
  const t = text.trim()
  switch (p.kind) {
    case 'entry': return { ...p, name: t }
    case 'alias': return { ...p, alias: t }
    case 'property': return { ...p, value: t }
    case 'relationship': return { ...p, relation: t }
    case 'claim': return { ...p, text: t }
    case 'speaker': return { ...p, speaker: t }
  }
}
export const CLAIM_LABEL = { talk: 'Says', act: 'Does', know: 'Knows' } as const
/** What kind of thing a suggestion is, for a label. */
export const kindLabel = (p: ExtractionSuggestion['payload']): string =>
  p.kind === 'claim' ? CLAIM_LABEL[p.claim] : ({ entry: 'New entry', alias: 'Name', property: 'Detail', relationship: 'Relationship', speaker: 'Speaker' } as const)[p.kind]
/** The suggestion in a line. */
export function summaryOf(p: ExtractionSuggestion['payload']): string {
  switch (p.kind) {
    case 'entry': return p.name + (p.type ? ' (' + p.type + ')' : '') + (p.description ? ': ' + p.description : '')
    case 'alias': return p.alias
    case 'property': return p.key + ': ' + p.value
    case 'relationship': return p.entry + ' ' + p.relation + ' ' + p.to
    case 'claim': return p.text
    case 'speaker': return p.quote + ' spoken by ' + p.speaker
  }
}
