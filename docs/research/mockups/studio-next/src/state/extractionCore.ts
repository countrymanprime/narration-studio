/**
 * Extraction suggestions, as plain changes to the book data (no store, so the sample book can be built with them and the
 * commands can run them inside one undoable step). A provider only ever offers `RawSuggestion`s; this module owns
 * verification, storage, applying and taking back.
 */
import type { Draft } from 'immer'
import { REASONS, type ExtractionSourceId } from '@/config/extraction'
import type { Applied, ExtractionSuggestion, Payload } from '@/domain/extraction'
import type { BibleEntry, BookData } from '@/domain/schemas'
import { fingerprint, verifyEvidence } from '@/format/evidence'
import { mergedEntry } from '@/selectors/bibleMerge'
import { autoStatus, NEEDS_ENTRY, reasonsOf, resolveEntry } from '@/selectors/extraction'

/** What a provider offers: no ids, no offsets, no status. Quotes are looked up by code. */
export interface RawSuggestion {
  payload: Payload
  /** 0..1, or null when the source gave none. */
  confidence: number | null
  /** Quotes that back it up. The paragraph is a hint; the text is what is searched for. */
  quotes: Array<{ paragraphId?: string; text: string }>
  chapterId?: string
  /** The source thinks this repeats something else; the note says what. */
  flag?: 'duplicate'
  note?: string
}

type Data = Draft<BookData> | BookData

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entry'
function freeId(d: Pick<BookData, 'bible'>, name: string): string {
  const base = slug(name)
  let id = base
  let k = 1
  while (d.bible.some((e) => e.id === id)) id = base + '-' + ++k
  return id
}
const nextSug = (d: Pick<BookData, 'suggestions'>): string => {
  let n = d.suggestions.length + 1
  while (d.suggestions.some((s) => s.id === 's' + n)) n++
  return 's' + n
}
const lower = (s: string): string => s.toLowerCase()

/** The entry (other than any being created) that has this name among its names. */
const ownerOfName = (d: Pick<BookData, 'bible'>, name: string): BibleEntry | undefined => d.bible.find((e) => e.aka.some((a) => lower(a) === lower(name)))

function typeFor(d: Pick<BookData, 'bibleTypes'>, type: string): string {
  const t = d.bibleTypes.find((x) => lower(x.k) === lower(type))
  return t ? t.k : d.bibleTypes.find((x) => x.k === 'Other')?.k ?? d.bibleTypes[0]?.k ?? 'Other'
}

/** Put one suggestion into the Story Bible. Returns the reason it could not be, or null. */
function applyOne(d: Data, s: ExtractionSuggestion): string | null {
  const p = s.payload
  const mut = d as BookData
  if (p.kind === 'entry') {
    const hit = resolveEntry(mut, p.name) ?? p.aliases.map((a) => ownerOfName(mut, a)).find(Boolean)
    if (hit) {
      const incoming: BibleEntry = { id: '', name: p.name, kind: hit.kind, aka: [p.name, ...p.aliases], sum: p.description, voice: '', acts: '', knows: '', first: null, say: '' }
      const merged = mergedEntry(hit, incoming)
      const added = merged.aka.filter((a) => !hit.aka.includes(a))
      if (added.length) merged.review = { entry: merged.review?.entry ?? false, aliases: [...(merged.review?.aliases ?? []), ...added] }
      Object.assign(hit, merged)
      s.entryId = hit.id
      s.applied = { entryId: hit.id, aliases: added }
      return null
    }
    const id = freeId(mut, p.name)
    const aka = [p.name, ...p.aliases.filter((a, i, all) => lower(a) !== lower(p.name) && all.findIndex((x) => lower(x) === lower(a)) === i && !ownerOfName(mut, a))]
    mut.bible.push({ id, name: p.name, kind: typeFor(mut, p.type), aka, sum: p.description, voice: '', acts: '', knows: '', first: null, say: '', review: { entry: true, aliases: [] } })
    s.entryId = id
    s.applied = { entryId: id, created: true }
    return null
  }
  const e = 'entry' in p ? resolveEntry(mut, p.entry) : undefined
  if (NEEDS_ENTRY.includes(s.kind) && !e) return REASONS.unknownEntry
  if (e) s.entryId = e.id
  if (p.kind === 'alias' && e) {
    const owner = ownerOfName(mut, p.alias)
    if (owner && owner.id !== e.id) return '“' + p.alias + '” is already a name of ' + owner.name + '.'
    if (!e.aka.some((a) => lower(a) === lower(p.alias))) {
      e.aka.push(p.alias)
      e.review = { entry: e.review?.entry ?? false, aliases: [...(e.review?.aliases ?? []), p.alias] }
      s.applied = { entryId: e.id, aliases: [p.alias] }
    }
    return null
  }
  if (p.kind === 'relationship' && e) {
    const to = resolveEntry(mut, p.to)
    if (!to) return 'There is no entry “' + p.to + '”.'
    if (to.id === e.id) return 'An entry cannot be related to itself.'
    const dup = mut.relationships.find((r) => r.a === e.id && r.b === to.id && lower(r.rel) === lower(p.relation))
    if (dup) { s.applied = undefined; return null }
    const id = mut.relationships.reduce((m, r) => Math.max(m, r.id), 0) + 1
    mut.relationships.push({ id, a: e.id, rel: p.relation, b: to.id })
    s.applied = { entryId: e.id, relId: id }
    return null
  }
  if (p.kind === 'speaker') {
    const who = resolveEntry(mut, p.speaker)
    if (!who || !mut.bibleTypes.find((t) => t.k === who.kind)?.speaker) return 'There is no speaking entry “' + p.speaker + '”.'
    const para = mut.paragraphs.find((x) => x.id === s.evidence[0]?.paragraphId)
    const m = para && [...para.text.matchAll(/“[^”]*”?/g)].find((x) => x.index != null && x.index <= s.evidence[0].start && x.index + x[0].length >= s.evidence[0].end)
    if (!para || !m || m.index == null) return 'The quoted line is not in the text.'
    const key = para.id + ':' + m.index
    mut.confirmedSpeakers[key] = who.aka.find((a) => lower(a) === lower(p.speaker)) ?? who.name
    s.entryId = who.id
    s.applied = { entryId: who.id, phraseKey: key }
  }
  return null
}

/** Take back what applying a suggestion changed. Names, relationships and speakers go; an entry only when the import made it and nobody has reviewed it. */
function reverseOne(d: Data, s: ExtractionSuggestion): void {
  const a: Applied | undefined = s.applied
  const mut = d as BookData
  if (!a) return
  const e = a.entryId ? mut.bible.find((x) => x.id === a.entryId) : undefined
  if (a.created && e && e.review?.entry) {
    mut.bible.splice(mut.bible.indexOf(e), 1)
    mut.relationships = mut.relationships.filter((r) => r.a !== e.id && r.b !== e.id)
    s.entryId = null
  } else if (e && a.aliases?.length) {
    for (const al of a.aliases) {
      const i = e.aka.findIndex((x) => x === al)
      if (i >= 0 && e.aka.length > 1) e.aka.splice(i, 1)
      if (e.review) e.review.aliases = e.review.aliases.filter((x) => x !== al)
    }
  }
  if (a.relId != null) mut.relationships = mut.relationships.filter((r) => r.id !== a.relId)
  if (a.phraseKey) delete mut.confirmedSpeakers[a.phraseKey]
  s.applied = undefined
}

const ORDER: Record<string, number> = { entry: 0, alias: 1, relationship: 2, property: 3, claim: 3, speaker: 4 }

/**
 * After anything changed: point loose suggestions at entries that now exist, give each undecided one the status its data says, and
 * apply the ones that are accepted automatically. Decisions by the narrator (accepted, rejected) are never touched.
 */
export function settle(d: Data): void {
  const mut = d as BookData
  /* An entry made in one pass can be what a claim in the next was waiting for. */
  for (let pass = 0; pass < 2; pass++) {
    for (const s of mut.suggestions) {
      if (s.status === 'rejected' || s.status === 'accepted' || s.entryId) continue
      const ref = s.payload.kind === 'entry' ? s.payload.name : 'entry' in s.payload ? s.payload.entry : ''
      const e = ref ? resolveEntry(mut, ref) : undefined
      if (e) s.entryId = e.id
    }
    const undecided = mut.suggestions.filter((s) => s.status === 'accepted-auto' || s.status === 'needs-verification').sort((x, y) => ORDER[x.kind] - ORDER[y.kind])
    for (const s of undecided) {
      const was = s.status
      const next = autoStatus(s)
      if (next === 'accepted-auto' && !s.applied) {
        const problem = applyOne(mut, s)
        if (problem) { s.status = 'needs-verification'; s.reason = problem; continue }
      }
      if (next === 'needs-verification' && was === 'accepted-auto') reverseOne(mut, s)
      s.status = next
      const why = reasonsOf(s)
      if (why.length) s.reason = why.join(' ')
      else delete s.reason
    }
  }
}

/**
 * Store what a provider offered. Each quote is looked up in the manuscript; a quote that is not there makes the suggestion
 * need verification. Anything already offered, or rejected before, is skipped. Returns how many were added and skipped.
 */
export function ingestRaw(d: Data, raws: RawSuggestion[], source: ExtractionSourceId, at: string): { added: ExtractionSuggestion[]; skipped: RawSuggestion[] } {
  const mut = d as BookData
  const added: ExtractionSuggestion[] = []
  const skipped: RawSuggestion[] = []
  const paras = mut.paragraphs.map((p) => ({ id: p.id, chapterId: p.chapterId, text: p.text }))
  for (const raw of raws) {
    const fp = fingerprint(raw.payload)
    if (mut.suggestions.some((s) => s.fp === fp || fingerprint(s.payload) === fp)) { skipped.push(raw); continue }
    const evidence = []
    let missing: string | undefined
    for (const q of raw.quotes) {
      const ev = verifyEvidence(paras, q.text, { paragraphId: q.paragraphId, chapterId: raw.chapterId })
      if (ev) evidence.push(ev)
      else missing ??= q.text
    }
    const base: ExtractionSuggestion = {
      id: nextSug(mut), kind: raw.payload.kind, payload: raw.payload, entryId: null, evidence, confidence: raw.confidence, source,
      status: 'needs-verification', fp, createdAt: at, ...(raw.chapterId ? { chapterId: raw.chapterId } : {}), ...(raw.flag ? { flag: raw.flag } : {}), ...(raw.note ? { note: raw.note } : {}), ...(missing ? { unverifiedQuote: missing } : {}),
    }
    mut.suggestions.push(base)
    added.push(mut.suggestions[mut.suggestions.length - 1])
  }
  settle(mut)
  return { added: added.map((s) => mut.suggestions.find((x) => x.id === s.id)!), skipped }
}

export type Decision = { ok: true } | { ok: false; reason: string }

/** The narrator accepts a suggestion, perhaps with the text changed. It is applied if it was not already. */
export function acceptSuggestion(d: Data, id: string, payload?: Payload): Decision {
  const mut = d as BookData
  const s = mut.suggestions.find((x) => x.id === id)
  if (!s) return { ok: false, reason: 'That suggestion is gone.' }
  if (payload && payload.kind !== s.kind) return { ok: false, reason: 'The kind of a suggestion cannot change.' }
  if (payload) { reverseOne(mut, s); s.payload = payload }
  if (!s.applied) {
    const problem = applyOne(mut, s)
    if (problem) return { ok: false, reason: problem }
  }
  /* Accepting an entry or a name is the review of it. */
  if (s.applied?.entryId) {
    const e = mut.bible.find((x) => x.id === s.applied!.entryId)
    if (e?.review) {
      if (s.applied.created) e.review.entry = false
      e.review.aliases = e.review.aliases.filter((a) => !s.applied!.aliases?.includes(a))
      if (!e.review.entry && !e.review.aliases.length) delete e.review
    }
  }
  s.status = 'accepted'
  delete s.reason
  settle(mut)
  return { ok: true }
}

/** The narrator rejects it. What it changed is taken back; it stays as a tombstone so it is not offered again. */
export function rejectSuggestion(d: Data, id: string): Decision {
  const mut = d as BookData
  const s = mut.suggestions.find((x) => x.id === id)
  if (!s) return { ok: false, reason: 'That suggestion is gone.' }
  reverseOne(mut, s)
  s.status = 'rejected'
  delete s.reason
  settle(mut)
  return { ok: true }
}

/** Looked at and kept: an automatic acceptance becomes the narrator's. Needs verification is decided with Accept, not this. */
export function reviewSuggestion(d: Data, id: string): Decision {
  const s = (d as BookData).suggestions.find((x) => x.id === id)
  if (!s || s.status !== 'accepted-auto') return { ok: false, reason: 'Nothing to review.' }
  return acceptSuggestion(d, id)
}

/** A new manuscript has other paragraphs: nothing offered for the old one survives. */
export function clearSuggestions(d: Data): void {
  ;(d as BookData).suggestions = []
}
