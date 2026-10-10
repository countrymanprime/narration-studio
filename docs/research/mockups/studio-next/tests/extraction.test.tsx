import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import BiblePage from '@/pages/Bible'
import { ImportDialog } from '@/pages/bible/ImportDialog'
import { EXTRACTION_SOURCES, VERIFY_BELOW } from '@/config/extraction'
import { PROMPT_TEMPLATE } from '@/config/extractionPrompt'
import { EXAMPLE_CSV, EXAMPLE_JSON } from '@/fixtures/extractionExample'
import { RULES_FINDINGS } from '@/fixtures/extraction'
import { fingerprint, verifyEvidence } from '@/format/evidence'
import { CSV_COLUMNS, parseCsv, parseCsvText, parseImport, parseJson } from '@/format/extractionImport'
import { buildPrompt } from '@/format/extractionPrompt'
import { createMockLocalModel, createMockRules, extractionProvider, setExtractionProvider } from '@/providers/extraction'
import { entryById, reviewCount } from '@/selectors/bible'
import { autoStatus, claimsOf, confidenceWhy, reasonsOf, resolveEntry, reviewable, toVerify, unattached, verifyCount } from '@/selectors/extraction'
import { planImport } from '@/selectors/extractionImport'
import { markEntryReviewed } from '@/state/commands/bible'
import { acceptSuggestionCmd, confirmImport, openEvidence, rejectSuggestionCmd, reviewSuggestionCmd, runExtraction } from '@/state/commands/extraction'
import { finishImport, newProject } from '@/state/commands/manuscript'
import { ingestRaw, type RawSuggestion } from '@/state/extractionCore'
import { createInitialState, getState, resetState, undoLast, update } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'

const run = <T,>(fn: () => T): T => { let r!: T; rtlAct(() => { r = fn() }); return r }
const data = () => getState().data
const sug = (pred: (s: ReturnType<typeof data>['suggestions'][number]) => boolean) => data().suggestions.find(pred)!
const boot = (): void => {
  const s = createInitialState()
  s.ui.page = 'bible'
  resetState(s)
  setExtractionProvider(createMockRules())
}
const ingest = (raws: RawSuggestion[], source: 'rules' | 'imported' = 'rules') => run(() => { update((d) => { ingestRaw(d.data, raws, source, d.data.today) }) })
const raw = (over: Partial<RawSuggestion> & Pick<RawSuggestion, 'payload'>): RawSuggestion => ({ confidence: 0.9, quotes: [], ...over })
beforeEach(boot)
afterEach(() => {
  cleanup()
  while (getOverlay().modals.length) closeTopModal()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('the threshold', () => {
  it('lives in one place: 75%', () => {
    expect(VERIFY_BELOW).toBe(0.75)
  })
  it('exactly 0.75 is accepted automatically; just under, and no confidence at all, need verification', () => {
    const base = { kind: 'entry' as const, evidence: [], unverifiedQuote: undefined, entryId: null }
    expect(autoStatus({ ...base, confidence: 0.75 })).toBe('accepted-auto')
    expect(autoStatus({ ...base, confidence: 0.7499 })).toBe('needs-verification')
    expect(autoStatus({ ...base, confidence: 1 })).toBe('accepted-auto')
    expect(autoStatus({ ...base, confidence: 0 })).toBe('needs-verification')
    expect(autoStatus({ ...base, confidence: null })).toBe('needs-verification')
    expect(reasonsOf({ ...base, confidence: null })).toEqual(['No confidence was given.'])
  })
  it('the stored status follows the rule at ingest', () => {
    ingest([
      raw({ payload: { kind: 'entry', name: 'Edge A', type: 'Item', aliases: [], description: '', appearsIn: [] }, confidence: 0.75 }),
      raw({ payload: { kind: 'entry', name: 'Edge B', type: 'Item', aliases: [], description: '', appearsIn: [] }, confidence: 0.74 }),
      raw({ payload: { kind: 'entry', name: 'Edge C', type: 'Item', aliases: [], description: '', appearsIn: [] }, confidence: null }),
    ])
    expect(sug((s) => s.payload.kind === 'entry' && s.payload.name === 'Edge A').status).toBe('accepted-auto')
    expect(sug((s) => s.payload.kind === 'entry' && s.payload.name === 'Edge B').status).toBe('needs-verification')
    expect(sug((s) => s.payload.kind === 'entry' && s.payload.name === 'Edge C').status).toBe('needs-verification')
    /* Accepted automatically means in the Story Bible, flagged for review; under it, not yet. */
    expect(resolveEntry(data(), 'Edge A')?.review?.entry).toBe(true)
    expect(resolveEntry(data(), 'Edge B')).toBeUndefined()
  })
})

describe('verifyEvidence', () => {
  const paras = [{ id: 'a', chapterId: '1', text: 'It was “a dark and stormy” night, she’s sure.' }, { id: 'b', chapterId: '2', text: 'The storm came. It was a dark and stormy night.' }]
  it('finds a quote and computes the offsets from the text itself', () => {
    const ev = verifyEvidence(paras, 'dark and stormy', { paragraphId: 'b' })!
    expect(ev).toMatchObject({ paragraphId: 'b' })
    expect(paras[1].text.slice(ev.start, ev.end)).toBe('dark and stormy')
    expect(ev.text).toBe('dark and stormy')
  })
  it('straight quotes and apostrophes match typographic ones, and the text is the manuscript\'s', () => {
    const ev = verifyEvidence(paras, 'she\'s sure', { paragraphId: 'a' })!
    expect(ev.text).toBe('she’s sure')
    expect(verifyEvidence(paras, '"a dark and stormy"')!.text).toBe('“a dark and stormy”')
  })
  it('tries the named paragraph first, then the chapter, then the book; a missing quote is null', () => {
    expect(verifyEvidence(paras, 'dark and stormy', { paragraphId: 'b' })!.paragraphId).toBe('b')
    expect(verifyEvidence(paras, 'dark and stormy', { chapterId: '2' })!.paragraphId).toBe('b')
    expect(verifyEvidence(paras, 'dark and stormy')!.paragraphId).toBe('a')
    expect(verifyEvidence(paras, 'bright and sunny')).toBeNull()
    expect(verifyEvidence(paras, '   ')).toBeNull()
  })
  it('a quote that is not in the text makes the suggestion need verification, with the reason', () => {
    ingest([raw({ payload: { kind: 'claim', entry: 'Alice', claim: 'talk', text: 'Says something' }, confidence: 0.99, quotes: [{ text: 'a sentence nobody wrote' }] })])
    const s = sug((x) => x.payload.kind === 'claim' && x.payload.text === 'Says something')
    expect(s.status).toBe('needs-verification')
    expect(s.reason).toContain('quote not found')
    expect(s.evidence).toEqual([])
    expect(s.unverifiedQuote).toBe('a sentence nobody wrote')
  })
  it('a claim with no quote at all also needs verification', () => {
    ingest([raw({ payload: { kind: 'claim', entry: 'Alice', claim: 'act', text: 'Sits' }, confidence: 0.99 })])
    expect(sug((x) => x.payload.kind === 'claim' && x.payload.text === 'Sits').reason).toContain('No evidence quote')
  })
})

describe('the sample book\'s review queue (mock rules provider, fixture data)', () => {
  it('has both kinds: accepted automatically at 75% or more, and to verify under it', () => {
    const all = data().suggestions
    expect(all.some((s) => s.status === 'accepted-auto')).toBe(true)
    expect(all.some((s) => s.status === 'needs-verification')).toBe(true)
    all.filter((s) => s.confidence != null && s.confidence >= VERIFY_BELOW && s.evidence.length).forEach((s) => expect(s.status).toBe('accepted-auto'))
    all.filter((s) => s.confidence == null || s.confidence < VERIFY_BELOW).forEach((s) => expect(s.status).toBe('needs-verification'))
    expect(all.every((s) => s.source === 'rules')).toBe(true)
  })
  it('has properties and talk, act and know claims, each with a quote at the offsets the code found', () => {
    const all = data().suggestions
    expect(all.some((s) => s.kind === 'property')).toBe(true)
    for (const k of ['talk', 'act', 'know'] as const) expect(all.some((s) => s.payload.kind === 'claim' && s.payload.claim === k)).toBe(true)
    all.filter((s) => s.evidence.length).forEach((s) => s.evidence.forEach((ev) => {
      const p = data().paragraphs.find((x) => x.id === ev.paragraphId)!
      expect(p.text.slice(ev.start, ev.end)).toBe(ev.text)
    }))
    expect(all.some((s) => s.reason?.includes('quote not found'))).toBe(true)
    expect(all.some((s) => s.confidence === null)).toBe(true)
  })
  it('its source is in the registry', () => {
    expect(EXTRACTION_SOURCES.map((s) => s.id)).toEqual(expect.arrayContaining(['rules', 'imported', 'local-model']))
  })
  it('needs verification counts as needing review, on the entry', () => {
    const n = verifyCount(data())
    expect(n).toBe(toVerify(data()).length)
    expect(reviewCount(data())).toBeGreaterThan(0)
    expect(unattached(data()).every((s) => !s.entryId)).toBe(true)
  })
})

describe('deciding', () => {
  it('Accept applies it, and it is one undo step', () => {
    const s = sug((x) => x.payload.kind === 'alias' && x.payload.alias === 'Rabbit')
    expect(s.status).toBe('needs-verification')
    expect(entryById(data(), 'white-rabbit')!.aka).not.toContain('Rabbit')
    expect(run(() => acceptSuggestionCmd(s.id)).ok).toBe(true)
    expect(sug((x) => x.id === s.id).status).toBe('accepted')
    expect(entryById(data(), 'white-rabbit')!.aka).toContain('Rabbit')
    expect(entryById(data(), 'white-rabbit')!.review).toBeUndefined()
    rtlAct(() => { undoLast() })
    expect(sug((x) => x.id === s.id).status).toBe('needs-verification')
    expect(entryById(data(), 'white-rabbit')!.aka).not.toContain('Rabbit')
  })
  it('Accept with the text edited stores the edit', () => {
    const s = sug((x) => x.payload.kind === 'claim' && x.payload.text === 'Speaks sternly')
    run(() => acceptSuggestionCmd(s.id, { ...(s.payload as Extract<typeof s.payload, { kind: 'claim' }>), text: 'Speaks sternly and slowly' }))
    expect(claimsOf(data(), s.entryId!, 'talk').map((c) => (c.payload as { text: string }).text)).toContain('Speaks sternly and slowly')
  })
  it('Reject takes back what an automatic acceptance did, and a rejected one is a tombstone that is not offered again', () => {
    const dodo = sug((x) => x.payload.kind === 'entry' && x.payload.name === 'The Dodo')
    expect(resolveEntry(data(), 'The Dodo')).toBeDefined()
    run(() => rejectSuggestionCmd(dodo.id))
    expect(resolveEntry(data(), 'The Dodo')).toBeUndefined()
    expect(sug((x) => x.id === dodo.id).status).toBe('rejected')
    const before = data().suggestions.length
    ingest(RULES_FINDINGS)
    expect(data().suggestions).toHaveLength(before)
    expect(resolveEntry(data(), 'The Dodo')).toBeUndefined()
    rtlAct(() => { undoLast() })
    expect(resolveEntry(data(), 'The Dodo')).toBeDefined()
  })
  it('a tombstone survives an edited re-offer of the same thing, and Scan skips rejected items', async () => {
    const s = sug((x) => x.payload.kind === 'property' && x.payload.key === 'Habit')
    run(() => rejectSuggestionCmd(s.id))
    const n = data().suggestions.length
    await rtlAct(async () => { await runExtraction('rules') })
    expect(data().suggestions).toHaveLength(n)
    expect(sug((x) => x.id === s.id).status).toBe('rejected')
  })
  it('Mark reviewed on an automatic acceptance makes it the narrator\'s', () => {
    const s = sug((x) => x.status === 'accepted-auto' && x.payload.kind === 'property')
    run(() => reviewSuggestionCmd(s.id))
    expect(sug((x) => x.id === s.id).status).toBe('accepted')
    expect(reviewable(data(), s.entryId!).map((x) => x.id)).not.toContain(s.id)
  })
  it('an entry with something to verify cannot be marked reviewed', () => {
    const id = 'duchess'
    expect(verifyCount(data())).toBeGreaterThan(0)
    expect(entryById(data(), id)!.review).toBeDefined()
    run(() => markEntryReviewed(id))
    expect(entryById(data(), id)!.review).toBeDefined()
    reviewable(data(), id).filter((s) => s.status === 'needs-verification').forEach((s) => run(() => rejectSuggestionCmd(s.id)))
    run(() => markEntryReviewed(id))
    expect(entryById(data(), id)!.review).toBeUndefined()
  })
  it('accepting a new entry offered under the threshold puts it in the Story Bible, already reviewed', () => {
    const mouse = sug((x) => x.payload.kind === 'entry' && x.payload.name === 'The Mouse')
    expect(mouse.status).toBe('needs-verification')
    expect(unattached(data()).map((x) => x.id)).toContain(mouse.id)
    run(() => acceptSuggestionCmd(mouse.id))
    const e = resolveEntry(data(), 'The Mouse')!
    expect(e.kind).toBe('Character')
    expect(e.review).toBeUndefined()
  })
  it('a claim about an entry not in the Story Bible waits, then attaches when the entry arrives', () => {
    ingest([raw({ payload: { kind: 'claim', entry: 'Zed', claim: 'know', text: 'Knows a secret' }, confidence: 0.9, quotes: [{ paragraphId: '5-1', text: 'languid, sleepy voice' }] })])
    const c = () => sug((x) => x.payload.kind === 'claim' && x.payload.text === 'Knows a secret')
    expect(c().status).toBe('needs-verification')
    expect(c().reason).toContain('not in the Story Bible')
    ingest([raw({ payload: { kind: 'entry', name: 'Zed', type: 'Character', aliases: [], description: '', appearsIn: [] }, confidence: 0.9 })])
    expect(c().entryId).toBe('zed')
    expect(c().status).toBe('accepted-auto')
  })
  it('the evidence goes to the line in the Script', () => {
    const s = sug((x) => x.evidence.some((e) => e.paragraphId === '8-13'))
    rtlAct(() => openEvidence(s.evidence[0]))
    expect(getState().ui.page).toBe('script')
    expect(getState().ui.script.pendingPid).toBe('8-13')
    expect(getState().ui.chapter).toBe('8')
  })
  it('the confidence tooltip says why: the percent, the quote and the mentions', () => {
    const s = sug((x) => x.payload.kind === 'property' && x.payload.key === 'Habit')
    const why = confidenceWhy(data(), s)
    expect(why).toContain('93%')
    expect(why).toContain('quote was found')
    expect(why).toMatch(/mentioned in \d+ chapters?/)
    expect(confidenceWhy(data(), sug((x) => x.confidence === null))).toContain('No confidence was given')
  })
})

describe('replacing the manuscript', () => {
  it('clears every suggestion', () => {
    expect(data().suggestions.length).toBeGreaterThan(0)
    run(() => finishImport('replace'))
    expect(data().suggestions).toEqual([])
  })
  it('a new project starts with none', () => {
    run(() => newProject())
    expect(data().suggestions).toEqual([])
  })
})

describe('providers', () => {
  it('the local model says why it cannot run, with no network', async () => {
    expect(extractionProvider('local-model')!.available()).toEqual({ ok: false, reason: expect.stringContaining('No local model') })
    const n = data().suggestions.length
    await rtlAct(async () => { await runExtraction('local-model') })
    expect(data().suggestions).toHaveLength(n)
    expect(getOverlay().toasts.at(-1)!.msg).toContain('No local model')
  })
  it('a different provider replaces the mock without any screen changing', async () => {
    setExtractionProvider({ id: 'local-model', available: () => ({ ok: true }), run: async () => [raw({ payload: { kind: 'entry', name: 'Test Entry', type: 'Item', aliases: [], description: '' , appearsIn: [] }, confidence: 0.8 })] })
    await rtlAct(async () => { await runExtraction('local-model') })
    expect(resolveEntry(data(), 'Test Entry')).toBeDefined()
    expect(sug((x) => x.payload.kind === 'entry' && x.payload.name === 'Test Entry').source).toBe('local-model')
    setExtractionProvider(createMockLocalModel())
  })
})

describe('the interchange format: CSV', () => {
  it('reads quoted cells with commas, doubled quotes and line breaks, and numbers each record by its line', () => {
    const t = parseCsvText('a,b\r\n"x, y","say ""hi""\nthere"\n\n3,4', ',')
    expect(t.map((r) => r.line)).toEqual([1, 2, 5])
    expect(t[1].cells).toEqual(['x, y', 'say "hi"\nthere'])
  })
  it('parses every record type; confidence may be 0.8, 80% or empty', () => {
    const r = parseCsv(['record,name,type,aliases,description,key,value,to,relation,kind,text,evidence,quote,speaker,confidence',
      'entry,Zed,Character,Z;Zee,Tall,,,,,,,,,,0.9',
      'property,Zed,,,,Height,Tall,,,,,"he, was tall",,,80%',
      'relationship,Zed,,,,,,Alice,knows,,,,,,',
      'claim,Zed,,,,,,,,act,Runs,,,,0.5',
      'speaker,,,,,,,,,,,,“Hi”,Zed,1'].join('\n'))
    expect(r.errors).toEqual([])
    expect(r.rows.map((x) => x.item.record)).toEqual(['entry', 'property', 'relationship', 'claim', 'speaker'])
    expect(r.rows.map((x) => x.item.confidence)).toEqual([0.9, 0.8, null, 0.5, 1])
    expect(r.rows[0].item).toMatchObject({ aliases: ['Z', 'Zee'] })
    expect(r.rows[1].item).toMatchObject({ evidence: 'he, was tall' })
  })
  it('reports each bad row with its row number and the reason', () => {
    const r = parseCsv(['record,name,type,kind,text,to,relation,confidence',
      'entry,,Character,,,,,0.9',
      'claim,Zed,,shout,Yells,,,0.9',
      'entry,Zed,Character,,,,,1.4',
      'banana,Zed,,,,,,',
      'relationship,Zed,,,,Alice,,0.5',
      'entry,Fine,Character,,,,,0.9'].join('\n'))
    expect(r.rows).toHaveLength(1)
    expect(r.errors.map((e) => [e.row, e.reason])).toEqual([
      [2, expect.stringContaining('name is required')],
      [3, expect.stringContaining('must be talk, act or know')],
      [4, expect.stringContaining('from 0 to 1')],
      [5, expect.stringContaining('not a record type')],
      [6, expect.stringContaining('relation is required')],
    ])
  })
  it('needs a record column', () => {
    expect(parseCsv('name,type\nZed,Character').errors[0].reason).toContain('“record” column')
  })
  it('a semicolon or tab separated sheet works too', () => {
    expect(parseCsv('record;name;type\nentry;Zed;Character').rows).toHaveLength(1)
    expect(parseCsv('record\tname\nentry\tZed').rows).toHaveLength(1)
  })
})

describe('the interchange format: JSON', () => {
  it('parses entries with nested properties, relationships and claims, and speakers; a property map takes the entry\'s confidence', () => {
    const r = parseJson(JSON.stringify({ entries: [{ name: 'Zed', type: 'Character', aliases: 'Z; Zee', confidence: 0.8, properties: { Height: 'Tall', Age: 30 }, relationships: [{ to: 'Alice', relation: 'knows' }], claims: [{ kind: 'know', text: 'A secret', evidence: 'q', confidence: 0.4 }] }], speakers: [{ quote: '“Hi”', speaker: 'Zed' }] }))
    expect(r.errors).toEqual([])
    expect(r.rows.map((x) => x.item.record)).toEqual(['entry', 'property', 'property', 'relationship', 'claim', 'speaker'])
    expect(r.rows.map((x) => x.row)).toEqual([1, 2, 3, 4, 5, 6])
    expect(r.rows[0].item).toMatchObject({ aliases: ['Z', 'Zee'] })
    expect(r.rows[2].item).toMatchObject({ value: '30', confidence: 0.8 })
    expect(r.rows[5].where).toBe('speakers[0]')
  })
  it('names the row and the place for each error', () => {
    const r = parseJson(JSON.stringify({ entries: [{ name: 'Zed', confidence: 'high', claims: [{ kind: 'talk' }] }, 'nope'] }))
    expect(r.errors.map((e) => [e.row, e.where])).toEqual([[1, 'entries[0]'], [2, 'entries[0].claims[0]'], [3, 'entries[1]']])
    expect(r.errors[0].reason).toContain('confidence')
    expect(r.errors[1].reason).toContain('text is required')
  })
  it('bad JSON and the wrong shape say so', () => {
    expect(parseJson('{ nope').errors[0].reason).toContain('Not valid JSON')
    expect(parseJson('{"a":1}').errors[0].reason).toContain('entries')
    expect(parseImport('   ').errors[0].reason).toBe('Nothing to import.')
  })
  it('the format is told apart by how it opens, or by the hint', () => {
    expect(parseImport('{"entries":[]}').format).toBe('json')
    expect(parseImport('record,name\nentry,A').format).toBe('csv')
    expect(parseImport('record,name\nentry,A', 'json').errors[0].reason).toContain('Not valid JSON')
  })
  it('the documented examples parse clean, in both formats, and give the same rows', () => {
    const j = parseImport(EXAMPLE_JSON)
    const c = parseImport(EXAMPLE_CSV)
    expect(j.errors).toEqual([])
    expect(c.errors).toEqual([])
    expect(c.rows.map((r) => r.item.record).sort()).toEqual(j.rows.map((r) => r.item.record).sort())
  })
  it('the prompt carries the format, the example and the threshold', () => {
    const json = buildPrompt(PROMPT_TEMPLATE, 'json', EXAMPLE_JSON)
    const csv = buildPrompt(PROMPT_TEMPLATE, 'csv', EXAMPLE_CSV)
    expect(json).toContain('"claims"')
    expect(json).toContain('75%')
    expect(json).not.toContain('{{')
    CSV_COLUMNS.forEach((c) => expect(csv).toContain(c))
    expect(csv).toContain(EXAMPLE_CSV)
  })
})

describe('import plan and confirm', () => {
  const rowsOf = (t: string) => parseImport(t)
  it('merges onto an existing entry by name or alias, adds new ones, and nothing is deleted', () => {
    const p = rowsOf(JSON.stringify({ entries: [
      { name: 'The Queen', type: 'Character', aliases: ['Queen', 'Her Majesty'], description: 'ignored: the entry has one', confidence: 0.9 },
      { name: 'Hatter', type: 'Character', aliases: [], confidence: 0.9 },
    ] }))
    const plan = planImport(data(), p.rows, p.errors)
    expect(plan.lines.map((l) => [l.label.split(' · ')[0], l.action])).toEqual([['The Queen', 'merge'], ['Hatter', 'add']])
    expect(plan.lines[0].note).toContain('Her Majesty')
    const before = data().bible.map((e) => e.id)
    run(() => { confirmImport(plan) })
    expect(data().bible.map((e) => e.id)).toEqual(expect.arrayContaining(before))
    expect(entryById(data(), 'queen-of-hearts')!.aka).toEqual(expect.arrayContaining(['Queen', 'Queen of Hearts', 'Her Majesty']))
    expect(entryById(data(), 'queen-of-hearts')!.review?.aliases).toContain('Her Majesty')
    expect(resolveEntry(data(), 'Hatter')).toBeDefined()
    expect(data().suggestions.filter((s) => s.source === 'imported').length).toBe(2)
  })
  it('null, missing and under-75% confidence land as needs verification; 75% and up is accepted', () => {
    const p = rowsOf('record,name,type,confidence\nentry,Aa,Item,\nentry,Bb,Item,0.74\nentry,Cc,Item,0.75\nentry,Dd,Item,')
    const plan = planImport(data(), p.rows, p.errors)
    expect(plan.lines.map((l) => l.status)).toEqual(['needs-verification', 'needs-verification', 'accepted-auto', 'needs-verification'])
    run(() => { confirmImport(plan) })
    expect(resolveEntry(data(), 'Cc')).toBeDefined()
    expect(resolveEntry(data(), 'Aa')).toBeUndefined()
    expect(sug((s) => s.payload.kind === 'entry' && s.payload.name === 'Aa').status).toBe('needs-verification')
  })
  it('a quote that is not in the manuscript is flagged in the preview', () => {
    const p = rowsOf('record,name,kind,text,evidence,paragraph,confidence\nclaim,Alice,talk,Says it,nobody wrote this,5-5,0.99')
    const plan = planImport(data(), p.rows, p.errors)
    expect(plan.lines[0].status).toBe('needs-verification')
    expect(plan.lines[0].note).toContain('quote not found')
  })
  it('a row about an entry that is nowhere is an error with its row number; the others still import', () => {
    const p = rowsOf('record,name,type,kind,text,evidence,confidence\nclaim,Nobody,,talk,Hello,,0.9\nentry,Fine,Item,,,,0.9\nclaim,Fine,,act,Waits,,0.9')
    const plan = planImport(data(), p.rows, p.errors)
    expect(plan.errors).toEqual([expect.objectContaining({ row: 2, reason: expect.stringContaining('No entry “Nobody”') })])
    expect(plan.lines.map((l) => l.row)).toEqual([3, 4])
    run(() => { confirmImport(plan) })
    expect(claimsOf(data(), 'fine', 'act')).toHaveLength(0)
    expect(sug((s) => s.payload.kind === 'claim' && s.payload.text === 'Waits').status).toBe('needs-verification')
  })
  it('skips what was already offered or rejected before', () => {
    const t = JSON.stringify({ entries: [{ name: 'Hatter', type: 'Character', confidence: 0.9 }] })
    const first = planImport(data(), parseImport(t).rows)
    run(() => { confirmImport(first) })
    const again = planImport(data(), parseImport(t).rows)
    expect(again.lines[0]).toMatchObject({ action: 'skip', note: 'Already suggested' })
    expect(again.raws).toHaveLength(0)
    run(() => rejectSuggestionCmd(sug((s) => s.payload.kind === 'entry' && s.payload.name === 'Hatter').id))
    expect(planImport(data(), parseImport(t).rows).lines[0].note).toBe('Rejected before')
  })
  it('an entry already complete in the Story Bible adds nothing', () => {
    const p = rowsOf('record,name,type,aliases,confidence\nentry,Alice,Character,Alice,0.9')
    const plan = planImport(data(), p.rows)
    expect(plan.lines[0]).toMatchObject({ action: 'skip', note: 'Already in the Story Bible' })
    expect(plan.raws).toHaveLength(0)
  })
  it('the whole import is one undo step', () => {
    const p = rowsOf(EXAMPLE_JSON)
    const n = data().suggestions.length
    const histBefore = getState().history.length
    run(() => { confirmImport(planImport(data(), p.rows)) })
    expect(getState().history.length).toBe(histBefore + 1)
    expect(data().suggestions.length).toBeGreaterThan(n)
    rtlAct(() => { undoLast() })
    expect(data().suggestions).toHaveLength(n)
    expect(resolveEntry(data(), 'The Mad Hatter')).toBeUndefined()
  })
  it('a speaker row confirms the speaker of the quoted line when it is accepted', () => {
    const p = rowsOf('record,quote,speaker,paragraph,confidence\nspeaker,“Who are you?”,Caterpillar,5-2,0.95')
    run(() => { confirmImport(planImport(data(), p.rows)) })
    expect(data().confirmedSpeakers['5-2:0']).toBe('Caterpillar')
    run(() => rejectSuggestionCmd(sug((s) => s.kind === 'speaker' && s.source === 'imported').id))
    expect(data().confirmedSpeakers['5-2:0']).toBeUndefined()
  })
})

describe('fingerprints', () => {
  it('ignore case, spacing and typographic quotes', () => {
    const a = fingerprint({ kind: 'claim', entry: 'Alice', claim: 'talk', text: 'Says  “hi”' })
    expect(a).toBe(fingerprint({ kind: 'claim', entry: ' alice', claim: 'talk', text: 'says "hi"' }))
    expect(a).not.toBe(fingerprint({ kind: 'claim', entry: 'Alice', claim: 'act', text: 'Says  “hi”' }))
  })
})

describe('the Story Bible page', () => {
  const page = () => render(<><BiblePage /><OverlayHost /></>)
  it('has a Needs verification chip that filters to entries with something to verify, and lists the loose suggestions', async () => {
    page()
    const u = userEvent.setup()
    const n = verifyCount(data())
    await u.click(screen.getByRole('button', { name: 'Needs verification · ' + n }))
    const ids = [...document.querySelectorAll<HTMLElement>('[data-sbe]')].map((x) => x.dataset.sbe!)
    expect(ids.length).toBeGreaterThan(0)
    ids.forEach((id) => expect(toVerify(data()).some((s) => s.entryId === id)).toBe(true))
    expect(document.querySelectorAll('[data-sbs]').length).toBe(unattached(data()).length)
    await u.click(document.querySelector('[data-sbs]')!)
    expect(document.querySelector('[data-suggested] [data-sug]')).not.toBeNull()
  })
  it('an entry lists its suggestions with the quote, a percent chip with a tooltip, and Accept / Edit / Reject', async () => {
    page()
    const u = userEvent.setup()
    await u.click(document.querySelector('[data-sbe="alice"]')!)
    const box = document.querySelector('[data-suggested]') as HTMLElement
    expect(box).not.toBeNull()
    const row = box.querySelector('[data-sug]') as HTMLElement
    expect(within(row).getByRole('button', { name: 'Accept this suggestion' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Edit this suggestion' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Reject this suggestion' })).toBeTruthy()
    const chip = row.querySelector('[data-conf]') as HTMLElement
    expect(chip.textContent).toMatch(/^\d+%$/)
    expect(chip.getAttribute('data-tip')).toContain('%')
    expect(row.querySelector('[data-evidence]')).not.toBeNull()
  })
  it('clicking the quote goes to the line in the Script', async () => {
    page()
    const u = userEvent.setup()
    await u.click(document.querySelector('[data-sbe="alice"]')!)
    const q = document.querySelector('[data-suggested] [data-evidence]') as HTMLElement
    const pid = q.getAttribute('data-evidence')
    await u.click(q)
    expect(getState().ui.script.pendingPid).toBe(pid)
    expect(getState().ui.page).toBe('script')
  })
  it('Accept moves a claim to the labelled read-only view with its evidence; Reject removes it from the list; Undo works', async () => {
    page()
    const u = userEvent.setup()
    await u.click(document.querySelector('[data-sbe="the-gardeners"]')!)
    const talkless = document.querySelector('[data-claim-group="know"]')
    expect(talkless).not.toBeNull()
    const verifyRow = [...document.querySelectorAll<HTMLElement>('[data-suggested] [data-sug]')].find((r) => r.dataset.status === 'needs-verification')
    if (verifyRow) {
      const id = verifyRow.dataset.sug!
      await u.click(within(verifyRow).getByRole('button', { name: 'Reject this suggestion' }))
      expect(document.querySelector('[data-sug="' + id + '"]')).toBeNull()
      expect(sug((s) => s.id === id).status).toBe('rejected')
    }
    const alice = [...document.querySelectorAll<HTMLElement>('[data-sbe]')].find((x) => x.dataset.sbe === 'alice')!
    await u.click(alice)
    const kRow = [...document.querySelectorAll<HTMLElement>('[data-suggested] [data-sug]')].find((r) => r.textContent?.includes('Knows who she was'))!
    await u.click(within(kRow).getByRole('button', { name: 'Accept this suggestion' }))
    const group = document.querySelector('[data-claim-group="know"]') as HTMLElement
    expect(within(group).getByText(/Knows who she was/)).toBeTruthy()
    expect(group.previousElementSibling?.textContent ?? group.querySelector('.label')?.textContent).toContain('Knows')
    expect(group.querySelector('[data-evidence]')).not.toBeNull()
    expect(document.querySelector('[data-sug="' + kRow.dataset.sug + '"]')).toBeNull()
    rtlAct(() => { undoLast() })
    expect(document.querySelector('[data-sug="' + kRow.dataset.sug + '"]')).not.toBeNull()
  })
  it('Edit changes the text and accepts it in one step', async () => {
    page()
    const u = userEvent.setup()
    await u.click(document.querySelector('[data-sbe="alice"]')!)
    const row = [...document.querySelectorAll<HTMLElement>('[data-suggested] [data-sug]')].find((r) => r.textContent?.includes('Knows who she was'))!
    await u.click(within(row).getByRole('button', { name: 'Edit this suggestion' }))
    const input = within(row).getByRole('textbox')
    await u.clear(input)
    await u.type(input, 'Knows her own mind')
    await u.click(within(row).getByRole('button', { name: 'Save and accept' }))
    const s = sug((x) => x.id === row.dataset.sug)
    expect(s.status).toBe('accepted')
    expect((s.payload as { text: string }).text).toBe('Knows her own mind')
  })
  it('Mark this suggestion reviewed works per item on an automatic acceptance', async () => {
    page()
    const u = userEvent.setup()
    await u.click(document.querySelector('[data-sbe="the-gardeners"]')!)
    const row = document.querySelector<HTMLElement>('[data-suggested] [data-sug][data-status="accepted-auto"]')!
    await u.click(within(row).getByRole('button', { name: 'Mark this suggestion reviewed' }))
    expect(sug((x) => x.id === row.dataset.sug).status).toBe('accepted')
  })
  it('the import button has its tooltip and opens the dialog', async () => {
    page()
    const u = userEvent.setup()
    const b = screen.getByRole('button', { name: 'Import entries (CSV or JSON)' })
    expect(b.getAttribute('data-tip')).toBe('Import entries (CSV or JSON)')
    await u.click(b)
    expect(await screen.findByRole('button', { name: 'Copy prompt for your own LLM' })).toBeTruthy()
  })
})

describe('the import dialog', () => {
  const dlg = () => render(<ImportDialog close={() => undefined} />)
  const paste = (t: string) => fireEvent.change(screen.getByLabelText('Paste JSON or CSV'), { target: { value: t } })
  it('previews a valid blob and adds it in one go', async () => {
    dlg()
    paste(EXAMPLE_JSON)
    expect(document.querySelectorAll('[data-improw]').length).toBe(parseJson(EXAMPLE_JSON).rows.length)
    expect(screen.getByText(/to add/)).toBeTruthy()
    const add = screen.getByRole('button', { name: /^Add \d+ to the Story Bible$/ })
    await userEvent.click(add)
    expect(resolveEntry(data(), 'The Mad Hatter')).toBeDefined()
    expect(data().suggestions.some((s) => s.source === 'imported')).toBe(true)
  })
  it('shows each bad row with its row number and keeps Add off when nothing is valid', () => {
    dlg()
    paste('record,name,type\nentry,,Item\nbanana,x,y')
    const errs = [...document.querySelectorAll<HTMLElement>('[data-imperr]')]
    expect(errs.map((e) => e.dataset.imperr)).toEqual(['2', '3'])
    expect((screen.getByRole('button', { name: /to the Story Bible/ }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('reads a chosen file (.csv or .json) with FileReader', async () => {
    dlg()
    const input = document.querySelector('#impfile') as HTMLInputElement
    expect(input.accept).toBe('.csv,.json')
    const file = new File([EXAMPLE_CSV], 'sheet.csv', { type: 'text/csv' })
    await rtlAct(async () => { fireEvent.change(input, { target: { files: [file] } }); await new Promise((r) => setTimeout(r, 30)) })
    expect((screen.getByLabelText('Paste JSON or CSV') as HTMLTextAreaElement).value).toBe(EXAMPLE_CSV)
    expect(document.querySelector('[data-impname]')?.textContent).toBe('sheet.csv')
    expect(document.querySelectorAll('[data-improw]').length).toBeGreaterThan(0)
  })
  it('copies the prompt, and shows the example in a copyable box', async () => {
    const u = userEvent.setup()
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => { written.push(t); return Promise.resolve() } } })
    dlg()
    await u.click(screen.getByRole('button', { name: 'Copy prompt for your own LLM' }))
    expect(written[0]).toContain('MANUSCRIPT')
    expect(written[0]).toContain('75%')
    await u.click(screen.getByRole('button', { name: 'Show the format example' }))
    expect(document.querySelector('#impex')?.textContent).toBe(EXAMPLE_JSON)
    await u.click(screen.getByRole('button', { name: 'CSV' }))
    expect(document.querySelector('#impex')?.textContent).toBe(EXAMPLE_CSV)
    await u.click(screen.getByRole('button', { name: 'Copy the example' }))
    expect(written[1]).toBe(EXAMPLE_CSV)
  })
})
