import { produce } from 'immer'
import type { BookData } from '@/domain/schemas'
import type { ExtractionSuggestion } from '@/domain/extraction'
import type { ParsedRow, RowError } from '@/format/extractionImport'
import { fingerprint } from '@/format/evidence'
import { ingestRaw, type RawSuggestion } from '@/state/extractionCore'
import { chName } from './chapters'
import { resolveEntry } from './extraction'

export type ImportAction = 'add' | 'merge' | 'skip'
export interface PreviewLine {
  row: number
  where: string
  kind: ParsedRow['item']['record']
  /** What the row is about, in a few words. */
  label: string
  action: ImportAction
  /** accepted automatically, or needs the narrator to verify. Not set for a skipped row. */
  status?: 'accepted-auto' | 'needs-verification'
  confidence: number | null
  /** Why it is skipped, or what a merge adds, or why it needs verification. */
  note: string
}
export interface ImportPlan { lines: PreviewLine[]; errors: RowError[]; raws: RawSuggestion[] }

/** The chapter a cell names: an id, a chapter number or a heading. */
export function chapterRef(b: Pick<BookData, 'chapters' | 'manuscript'>, ref: string): string | undefined {
  const k = ref.trim().toLowerCase()
  if (!k) return undefined
  const c = b.chapters.find((x) => x.id === k) ?? b.chapters.find((x) => x.n != null && String(x.n) === k) ?? b.chapters.find((x) => chName(b as BookData, x).toLowerCase() === k)
  return c?.id
}

function rawOf(b: BookData, r: ParsedRow, note: string[]): RawSuggestion {
  const it = r.item
  const quote = (text: string, paragraph: string) => (text ? [{ paragraphId: paragraph || undefined, text }] : [])
  const chapterOf = (ref: string): string | undefined => {
    const id = chapterRef(b, ref)
    if (ref && !id) note.push('chapter “' + ref + '” not found')
    return id
  }
  switch (it.record) {
    case 'entry': {
      it.appearsIn.forEach((c) => { if (!chapterRef(b, c)) note.push('chapter “' + c + '” not found') })
      return { payload: { kind: 'entry', name: it.name, type: it.type, aliases: it.aliases, description: it.description, appearsIn: it.appearsIn }, confidence: it.confidence, quotes: [] }
    }
    case 'property': return { payload: { kind: 'property', entry: it.entry, key: it.key, value: it.value }, confidence: it.confidence, quotes: quote(it.evidence, it.paragraph), chapterId: chapterOf(it.chapter) }
    case 'relationship': return { payload: { kind: 'relationship', entry: it.entry, to: it.to, relation: it.relation }, confidence: it.confidence, quotes: [] }
    case 'claim': return { payload: { kind: 'claim', entry: it.entry, claim: it.kind, text: it.text }, confidence: it.confidence, quotes: quote(it.evidence, it.paragraph), chapterId: chapterOf(it.chapter) }
    case 'speaker': return { payload: { kind: 'speaker', quote: it.quote, speaker: it.speaker }, confidence: it.confidence, quotes: quote(it.quote, it.paragraph) }
  }
}

const labelOf = (r: ParsedRow): string => {
  const it = r.item
  switch (it.record) {
    case 'entry': return it.name + (it.type ? ' · ' + it.type : '')
    case 'property': return it.entry + ': ' + it.key + ' = ' + it.value
    case 'relationship': return it.entry + ' ' + it.relation + ' ' + it.to
    case 'claim': return it.entry + ' ' + ({ talk: 'says', act: 'does', know: 'knows' } as const)[it.kind] + ': ' + it.text
    case 'speaker': return it.speaker + ': ' + it.quote
  }
}

/**
 * What adding these rows would do, worked out on a copy of the book by the same code that does it. A row about an entry that is
 * neither in the Story Bible nor in the file is an error. Rows already offered (or rejected before) are skipped. Nothing is deleted.
 */
export function planImport(book: BookData, rows: ParsedRow[], parseErrors: RowError[] = []): ImportPlan {
  const errors = [...parseErrors]
  const inFile = new Set(rows.flatMap((r) => (r.item.record === 'entry' ? [r.item.name.toLowerCase(), ...r.item.aliases.map((a) => a.toLowerCase())] : [])))
  const known = (ref: string): boolean => !!resolveEntry(book, ref) || inFile.has(ref.trim().toLowerCase())
  const ok: Array<{ r: ParsedRow; raw: RawSuggestion; note: string[] }> = []
  for (const r of rows) {
    const it = r.item
    const refs = it.record === 'property' || it.record === 'claim' ? [it.entry] : it.record === 'relationship' ? [it.entry, it.to] : it.record === 'speaker' ? [it.speaker] : []
    const bad = refs.find((x) => !known(x))
    if (bad) { errors.push({ row: r.row, where: r.where, reason: 'No entry “' + bad + '” in the Story Bible or in this file.' }); continue }
    const note: string[] = []
    ok.push({ r, raw: rawOf(book, r, note), note })
  }
  const lines: PreviewLine[] = []
  const raws: RawSuggestion[] = []
  /* Entries first, as when they are added: the rest may be about them. */
  const order = [...ok].sort((x, y) => Number(y.r.item.record === 'entry') - Number(x.r.item.record === 'entry'))
  produce(book, (d) => {
    for (const { r, raw, note } of order) {
      const dup = d.suggestions.find((s) => s.fp === fingerprint(raw.payload) || fingerprint(s.payload) === fingerprint(raw.payload))
      const res = ingestRaw(d, [raw], 'imported', book.today)
      const line = (l: Omit<PreviewLine, 'row' | 'where' | 'kind' | 'label' | 'confidence'>): void => {
        lines.push({ row: r.row, where: r.where, kind: r.item.record, label: labelOf(r), confidence: raw.confidence, ...l })
      }
      if (!res.added.length) {
        line({ action: 'skip', note: dup?.status === 'rejected' ? 'Rejected before' : 'Already suggested' })
        continue
      }
      const s: ExtractionSuggestion = res.added[0]
      const merges = raw.payload.kind === 'entry' && (s.applied ? !s.applied.created : !!s.entryId)
      if (merges && s.applied && !s.applied.aliases?.length) {
        line({ action: 'skip', note: 'Already in the Story Bible' })
        continue
      }
      raws.push(raw)
      line({
        action: merges ? 'merge' : 'add',
        status: s.status === 'needs-verification' ? 'needs-verification' : 'accepted-auto',
        note: [merges && s.applied?.aliases?.length ? 'adds ' + s.applied.aliases.join(', ') : '', s.status === 'needs-verification' ? s.reason ?? '' : '', ...note].filter(Boolean).join('. '),
      })
    }
  })
  lines.sort((a, b) => a.row - b.row)
  errors.sort((a, b) => a.row - b.row)
  return { lines, errors, raws }
}
