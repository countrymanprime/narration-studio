/**
 * The interchange format for bringing a Story Bible in from a spreadsheet (CSV) or a JSON blob made by any tool or LLM. Pure functions:
 * text in, validated records (with the row each came from) and per-row errors out. Nothing here knows about the book.
 *
 * JSON: { "entries": [ { name, type, aliases[], description, properties ({key: value} or [{key, value, evidence, chapter, paragraph, confidence}]),
 *   relationships [{to, relation, confidence}], appears_in [chapter], confidence 0..1,
 *   claims [{kind: talk|act|know, text, evidence (a verbatim quote), chapter, paragraph, confidence}] } ],
 *   "speakers": [ {quote, speaker, paragraph, confidence} ] }
 * CSV: one record per row; `record` is entry | property | relationship | claim | speaker; see CSV_COLUMNS.
 * Confidence is 0 to 1 (a CSV cell may also say 85%); empty or missing means "not given".
 */
import { z } from 'zod'

export const RECORDS = ['entry', 'property', 'relationship', 'claim', 'speaker'] as const
export const CSV_COLUMNS = ['record', 'name', 'type', 'aliases', 'description', 'appears_in', 'key', 'value', 'to', 'relation', 'kind', 'text', 'evidence', 'chapter', 'paragraph', 'quote', 'speaker', 'confidence'] as const
export const CLAIM_KINDS = ['talk', 'act', 'know'] as const

const required = z.string({ message: 'is required' }).trim().min(1, 'is required')
const optional = z.string().trim().optional().default('')
const list = z.array(z.string().trim().min(1)).optional().default([])

/** 0..1, or null when not given. A cell may say "85%". */
const confidence = z.unknown().transform((v, ctx): number | null => {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return null
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    const t = v.trim()
    n = t.endsWith('%') ? Number(t.slice(0, -1)) / 100 : Number(t)
  } else n = NaN
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    ctx.addIssue({ code: 'custom', message: 'must be a number from 0 to 1 (' + JSON.stringify(v) + ' is not)' })
    return z.NEVER
  }
  return n
})

export const ImportItem = z.discriminatedUnion('record', [
  z.object({ record: z.literal('entry'), name: required, type: optional, aliases: list, description: optional, appearsIn: list, confidence }),
  z.object({ record: z.literal('property'), entry: required, key: required, value: required, evidence: optional, chapter: optional, paragraph: optional, confidence }),
  z.object({ record: z.literal('relationship'), entry: required, to: required, relation: required, confidence }),
  z.object({ record: z.literal('claim'), entry: required, kind: z.enum(CLAIM_KINDS, { message: 'must be talk, act or know' }), text: required, evidence: optional, chapter: optional, paragraph: optional, confidence }),
  z.object({ record: z.literal('speaker'), quote: required, speaker: required, paragraph: optional, confidence }),
])
export type ImportItem = z.infer<typeof ImportItem>

export interface ParsedRow { row: number; where: string; item: ImportItem }
export interface RowError { row: number; where: string; reason: string }
export interface ParseResult { format: 'csv' | 'json'; rows: ParsedRow[]; errors: RowError[] }

const issueText = (e: z.ZodError): string => {
  const i = e.issues[0]
  const path = i.path.filter((p) => p !== 'record').join('.')
  return (path ? path + ' ' : '') + i.message
}

function check(raw: unknown, row: number, where: string, out: ParseResult): void {
  const r = ImportItem.safeParse(raw)
  if (r.success) out.rows.push({ row, where, item: r.data })
  else out.errors.push({ row, where, reason: issueText(r.error) })
}

/* ---------- JSON ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const strList = (v: unknown): unknown => (typeof v === 'string' ? splitList(v) : v)
const splitList = (s: string): string[] => s.split(/[;|]/).map((x) => x.trim()).filter(Boolean)

export function parseJson(text: string): ParseResult {
  const out: ParseResult = { format: 'json', rows: [], errors: [] }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    out.errors.push({ row: 0, where: '', reason: 'Not valid JSON: ' + (e instanceof Error ? e.message : 'unreadable') })
    return out
  }
  const root = Array.isArray(data) ? { entries: data } : data
  if (!isObj(root) || (!('entries' in root) && !('speakers' in root))) {
    out.errors.push({ row: 0, where: '', reason: 'Expected an object with “entries” and/or “speakers”.' })
    return out
  }
  let row = 0
  const at = (): number => ++row
  const entries = root.entries ?? []
  if (!Array.isArray(entries)) out.errors.push({ row: at(), where: 'entries', reason: '“entries” must be a list.' })
  else {
    entries.forEach((e, i) => {
      const where = 'entries[' + i + ']'
      if (!isObj(e)) { out.errors.push({ row: at(), where, reason: 'An entry must be an object.' }); return }
      check({ record: 'entry', name: e.name, type: e.type, aliases: strList(e.aliases), description: e.description, appearsIn: strList(e.appears_in), confidence: e.confidence }, at(), where, out)
      const props = e.properties
      const propList = isObj(props) ? Object.entries(props).map(([key, value]) => ({ key, value })) : Array.isArray(props) ? props : props == null ? [] : null
      if (!propList) out.errors.push({ row: at(), where: where + '.properties', reason: 'properties must be a list or an object of key: value.' })
      else propList.forEach((p, j) => {
        const w = where + '.properties[' + j + ']'
        if (!isObj(p)) { out.errors.push({ row: at(), where: w, reason: 'A property must be an object.' }); return }
        check({ record: 'property', entry: e.name, key: p.key, value: p.value == null ? p.value : String(p.value), evidence: p.evidence, chapter: p.chapter == null ? p.chapter : String(p.chapter), paragraph: p.paragraph, confidence: 'confidence' in p ? p.confidence : e.confidence }, at(), w, out)
      })
      const sub = (field: 'relationships' | 'claims', fn: (x: Record<string, unknown>) => unknown): void => {
        const v = e[field]
        if (v == null) return
        if (!Array.isArray(v)) { out.errors.push({ row: at(), where: where + '.' + field, reason: field + ' must be a list.' }); return }
        v.forEach((x, j) => {
          const w = where + '.' + field + '[' + j + ']'
          if (!isObj(x)) { out.errors.push({ row: at(), where: w, reason: 'Must be an object.' }); return }
          check(fn(x), at(), w, out)
        })
      }
      sub('relationships', (x) => ({ record: 'relationship', entry: e.name, to: x.to, relation: x.relation, confidence: x.confidence }))
      sub('claims', (x) => ({ record: 'claim', entry: e.name, kind: x.kind, text: x.text, evidence: x.evidence, chapter: x.chapter == null ? x.chapter : String(x.chapter), paragraph: x.paragraph, confidence: x.confidence }))
    })
  }
  const speakers = root.speakers ?? []
  if (!Array.isArray(speakers)) out.errors.push({ row: at(), where: 'speakers', reason: '“speakers” must be a list.' })
  else speakers.forEach((s, i) => {
    const where = 'speakers[' + i + ']'
    if (!isObj(s)) { out.errors.push({ row: at(), where, reason: 'A speaker must be an object.' }); return }
    check({ record: 'speaker', quote: s.quote, speaker: s.speaker, paragraph: s.paragraph, confidence: s.confidence }, at(), where, out)
  })
  if (!out.rows.length && !out.errors.length) out.errors.push({ row: 0, where: '', reason: 'Nothing to import.' })
  return out
}

/* ---------- CSV ---------- */

/** RFC 4180: quoted cells may hold the delimiter, doubled quotes and line breaks. Each record keeps the line it started on. */
export function parseCsvText(text: string, delimiter: string): Array<{ line: number; cells: string[] }> {
  const rows: Array<{ line: number; cells: string[] }> = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let start = 1
  const endCell = (): void => { cells.push(cell); cell = '' }
  const endRow = (): void => {
    endCell()
    if (cells.some((c) => c.trim() !== '')) rows.push({ line: start, cells })
    cells = []
  }
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++ } else quoted = false }
      else { cell += c; if (c === '\n') line++ }
    } else if (c === '"' && cell === '') quoted = true
    else if (c === delimiter) endCell()
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      endRow()
      line++
      start = line
    } else cell += c
  }
  if (cell !== '' || cells.length) endRow()
  return rows
}

const sniffDelimiter = (text: string): string => {
  const head = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  return [',', ';', '\t'].map((d) => [d, head.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
}

export function parseCsv(text: string): ParseResult {
  const out: ParseResult = { format: 'csv', rows: [], errors: [] }
  const table = parseCsvText(text, sniffDelimiter(text))
  if (!table.length) { out.errors.push({ row: 0, where: '', reason: 'Nothing to import.' }); return out }
  const head = table[0].cells.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'))
  if (!head.includes('record')) { out.errors.push({ row: table[0].line, where: 'header', reason: 'The first row must have a “record” column (entry, property, relationship, claim or speaker).' }); return out }
  const col = (cells: string[], name: string): string => (head.includes(name) ? (cells[head.indexOf(name)] ?? '').trim() : '')
  for (const { line, cells } of table.slice(1)) {
    const rec = col(cells, 'record').toLowerCase()
    const where = 'row ' + line
    const conf = col(cells, 'confidence')
    let raw: Record<string, unknown>
    switch (rec) {
      case 'entry': raw = { record: rec, name: col(cells, 'name'), type: col(cells, 'type'), aliases: splitList(col(cells, 'aliases')), description: col(cells, 'description'), appearsIn: splitList(col(cells, 'appears_in')), confidence: conf }; break
      case 'property': raw = { record: rec, entry: col(cells, 'name'), key: col(cells, 'key'), value: col(cells, 'value'), evidence: col(cells, 'evidence'), chapter: col(cells, 'chapter'), paragraph: col(cells, 'paragraph'), confidence: conf }; break
      case 'relationship': raw = { record: rec, entry: col(cells, 'name'), to: col(cells, 'to'), relation: col(cells, 'relation'), confidence: conf }; break
      case 'claim': raw = { record: rec, entry: col(cells, 'name'), kind: col(cells, 'kind').toLowerCase(), text: col(cells, 'text'), evidence: col(cells, 'evidence'), chapter: col(cells, 'chapter'), paragraph: col(cells, 'paragraph'), confidence: conf }; break
      case 'speaker': raw = { record: rec, quote: col(cells, 'quote'), speaker: col(cells, 'speaker'), paragraph: col(cells, 'paragraph'), confidence: conf }; break
      default:
        out.errors.push({ row: line, where, reason: rec ? '“' + rec + '” is not a record type (use ' + RECORDS.join(', ') + ').' : 'record is required' })
        continue
    }
    check(raw, line, where, out)
  }
  if (!out.rows.length && !out.errors.length) out.errors.push({ row: 0, where: '', reason: 'Nothing to import.' })
  return out
}

/** JSON when it opens like JSON (or the hint says so), otherwise CSV. */
export function parseImport(text: string, hint?: 'csv' | 'json'): ParseResult {
  const t = text.replace(/^﻿/, '').trimStart()
  if (!t) return { format: hint ?? 'csv', rows: [], errors: [{ row: 0, where: '', reason: 'Nothing to import.' }] }
  const json = hint ? hint === 'json' : t.startsWith('{') || t.startsWith('[')
  return json ? parseJson(text) : parseCsv(text)
}
