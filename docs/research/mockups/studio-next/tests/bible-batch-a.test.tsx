import { act as rtlAct, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import BiblePage from '@/pages/Bible'
import ScriptPage from '@/pages/Script'
import { createMockPronunciation, pronunciation, setPronunciationProvider } from '@/providers/pronunciation'
import { aliasNeedsReview, appearsIn, chapterCounts, entryById, entryNeedsReview, needsReview, nameOwner, pronOfName, pronOfWord, reviewCount, sortEntries } from '@/selectors/bible'
import { SPEAKER_PALETTE, speakerCandidates, speakerColourOf } from '@/selectors/speakers'
import {
  addName, cancelEdit, markAliasReviewed, markEntryReviewed, mergeEntries, newEntry, saveEdit, selectEntry, setBibleSort, setEntryColour, startEdit,
} from '@/state/commands/bible'
import { setPronSource, setPronText } from '@/state/commands/pronunciation'
import { flagWord } from '@/state/commands/script'
import { createInitialState, getState, resetState, undoLast, update } from '@/state/store'
import { openSpeakerPicker } from '@/ui/SpeakerPicker'
import { OverlayHost } from '@/ui/OverlayHost'

const upd = (fn: Parameters<typeof update>[0]): void => { rtlAct(() => update(fn)) }
const run = <T,>(fn: () => T): T => { let r!: T; rtlAct(() => { r = fn() }); return r }
const data = () => getState().data
const boot = (page: 'bible' | 'script' = 'bible'): void => {
  const s = createInitialState()
  s.ui.page = page
  resetState(s)
  setPronunciationProvider(createMockPronunciation())
}
beforeEach(() => boot())
afterEach(cleanup)

describe('pronunciation sources', () => {
  it('the provider lists the sources and gives a candidate per word from fixture data', () => {
    const p = pronunciation()
    const ids = p.sources().map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining([p.defaultSource(), 'manual']))
    expect(p.sources().every((s) => s.label && s.icon)).toBe(true)
    expect(p.candidate('Croquet', p.defaultSource())).toEqual({ ok: true, say: expect.any(String) })
    const none = p.candidate('zzzz', p.defaultSource())
    expect(none.ok).toBe(false)
    expect(p.candidate('croquet', 'manual').ok).toBe(false)
  })

  it('a different provider replaces the mock without any screen changing', () => {
    setPronunciationProvider({
      sources: () => [{ id: 'x', label: 'Test engine', icon: 'globe', kind: 'generated' }, { id: 'manual', label: 'By hand', icon: 'pencil', kind: 'manual' }],
      defaultSource: () => 'x',
      candidate: (w) => ({ ok: true, say: w.toUpperCase() + '!' }),
    })
    expect(setPronSource({ kind: 'word', word: 'Knave' }, 'x')).toBe(true)
    expect(data().pronunciations.Knave).toEqual({ say: 'KNAVE!', src: 'x' })
  })

  it('a flagged word takes the default source, and typing makes the value the narrator\'s own', () => {
    upd((d) => { d.data.paragraphs.find((p) => p.id === '8-3')!.text += ' hookah' })
    const p = data().paragraphs.find((x) => x.id === '8-3')!
    rtlAct(() => flagWord({ pid: '8-3', s: p.text.length - 6, e: p.text.length, q: 'hookah' }))
    expect(pronOfWord(data(), 'hookah')).toEqual({ say: 'HOO-kuh', src: pronunciation().defaultSource() })
    rtlAct(() => setPronText({ kind: 'word', word: 'hookah' }, 'HOO-kah'))
    expect(pronOfWord(data(), 'hookah')).toEqual({ say: 'HOO-kah', src: 'manual' })
  })

  it('overriding with another source is reversible (undo, or pick the default again)', () => {
    const w = { kind: 'word', word: 'croquet' } as const
    expect(pronOfWord(data(), 'croquet').src).toBe('online')
    run(() => setPronSource(w, 'auto'))
    expect(pronOfWord(data(), 'croquet')).toEqual({ say: 'KROH-kit', src: 'auto' })
    rtlAct(() => { undoLast() })
    expect(pronOfWord(data(), 'croquet')).toEqual({ say: 'kroh-KAY', src: 'online' })
    run(() => setPronSource(w, 'online'))
    expect(pronOfWord(data(), 'croquet').say).toBe('kroh-KAY')
  })

  it('a source that cannot answer leaves the value as it is and says why', () => {
    const w = { kind: 'word', word: 'croquet' } as const
    upd((d) => { d.mock.net = 'offline' })
    expect(run(() => setPronSource(w, 'online'))).toBe(false)
    expect(run(() => setPronSource({ kind: 'word', word: 'Knave' }, 'auto'))).toBe(true)
    expect(run(() => setPronSource({ kind: 'word', word: 'hedgehogs' }, 'dictionary'))).toBe(true)
    upd((d) => { d.mock.dictLocal = 'missing' })
    expect(run(() => setPronSource({ kind: 'word', word: 'timidly' }, 'dictionary'))).toBe(false)
    expect(pronOfWord(data(), 'croquet').src).toBe('online')
  })

  it('choosing "entered by me" keeps the text and marks it as the narrator\'s', () => {
    run(() => setPronSource({ kind: 'word', word: 'croquet' }, 'manual'))
    expect(pronOfWord(data(), 'croquet')).toEqual({ say: 'kroh-KAY', src: 'manual' })
  })

  it('names carry a source too; typing is manual, a source fills the value, the first name sets the entry', () => {
    const t = { kind: 'name', entryId: 'the-gardeners', name: 'Five' } as const
    rtlAct(() => setPronText(t, 'fyve'))
    expect(pronOfName(entryById(data(), 'the-gardeners')!, 'Five')).toEqual({ say: 'fyve', src: 'manual' })
    run(() => setPronSource(t, 'auto'))
    const e = entryById(data(), 'the-gardeners')!
    expect(pronOfName(e, 'Five')).toEqual({ say: 'fyve', src: 'auto' })
    expect(e.say).toBe('fyve')
    expect(pronOfName(entryById(data(), 'alice')!, 'Alice').src).toBe('auto')
    expect(pronOfName(entryById(data(), 'duchess')!, 'Duchess')).toEqual({ say: '', src: '' })
  })

  it('a name added to an entry takes the default source\'s pronunciation when there is one', () => {
    expect(addName('alice', 'Cheshire')).toBe(true)
    expect(pronOfName(entryById(data(), 'alice')!, 'Cheshire')).toEqual({ say: 'CHESH-er', src: 'auto' })
    expect(addName('alice', 'Zzyzx')).toBe(true)
    expect(pronOfName(entryById(data(), 'alice')!, 'Zzyzx')).toEqual({ say: '', src: '' })
  })

  it('there are no query / confirmed / researched states on names', () => {
    startEdit('queen-of-hearts')
    render(<><BiblePage /><OverlayHost /></>)
    expect(document.body.textContent).not.toMatch(/query sent|researched|author confirmed|confirmed by/i)
  })

  it('the Story Bible shows the source icon and name, and a menu of the data-driven sources switches it', async () => {
    startEdit('the-gardeners')
    render(<><BiblePage /><OverlayHost /></>)
    const u = userEvent.setup()
    await u.click(document.querySelector('[data-sbe="the-gardeners"]')!)
    rtlAct(() => startEdit('the-gardeners'))
    await u.type(screen.getByLabelText('How I say Seven'), 'SEV-un')
    const tag = screen.getByLabelText('Pronunciation source for Seven: Entered by me')
    expect(tag.textContent).toContain('Entered by me')
    expect(tag.querySelector('svg')).not.toBeNull()
    await u.click(tag)
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitemradio').map((x) => x.textContent?.replace('✓', ''))).toEqual(pronunciation().sources().map((s) => s.label))
    await u.click(within(menu).getByRole('menuitemradio', { name: 'Auto-generated' }))
    expect(pronOfName(entryById(data(), 'the-gardeners')!, 'Seven')).toEqual({ say: 'SEV-un', src: 'auto' })
    expect(screen.getByLabelText('Pronunciation source for Seven: Auto-generated')).toBeInTheDocument()
  })

  it('the Words tab shows the source of the word and switches it', async () => {
    boot('script')
    upd((d) => { d.ui.script.tab = 'pron'; d.ui.script.word = 'croquet' })
    render(<><OverlayHost /><ScriptPage /></>)
    const u = userEvent.setup()
    const tag = screen.getByLabelText('Source of the pronunciation: Online service')
    expect(tag.textContent).toContain('Online service')
    await u.click(tag)
    await u.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Auto-generated' }))
    expect(pronOfWord(data(), 'croquet').src).toBe('auto')
    expect((document.getElementById('sayit') as HTMLInputElement).value).toBe('KROH-kit')
    await u.clear(document.getElementById('sayit') as HTMLInputElement)
    await u.type(document.getElementById('sayit') as HTMLInputElement, 'my way')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    expect(pronOfWord(data(), 'croquet')).toEqual({ say: 'my way', src: 'manual' })
  })

  it('"Use" on a definition records the definition source', async () => {
    boot('script')
    upd((d) => { d.ui.prefs.dictSource = 'local'; d.ui.script.tab = 'pron'; d.ui.script.word = 'Knave' })
    render(<><OverlayHost /><ScriptPage /></>)
    await userEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(pronOfWord(data(), 'Knave')).toEqual({ say: 'nayv', src: 'dictionary' })
  })
})

describe('merge on a name collision', () => {
  it('nameOwner finds another entry with the name, ignoring case; the add is refused', () => {
    expect(nameOwner(data(), 'alice', 'queen')?.id).toBe('queen-of-hearts')
    expect(nameOwner(data(), 'queen-of-hearts', 'Queen')).toBeUndefined()
    expect(addName('alice', 'Queen')).toBe(false)
    expect(entryById(data(), 'alice')!.aka).toEqual(['Alice'])
  })

  it('combines names and say-values, re-points relationships by id, and is one undo', () => {
    upd((d) => {
      d.data.bible.find((e) => e.id === 'king-of-hearts')!.say = 'KING'
      d.data.relationships.push({ id: 90, a: 'white-rabbit', rel: 'serves', b: 'queen-of-hearts' })
    })
    const rels = data().relationships.length
    expect(run(() => mergeEntries('queen-of-hearts', 'king-of-hearts'))).toBe(true)
    const q = entryById(data(), 'queen-of-hearts')!
    expect(q.aka).toEqual(['Queen', 'Queen of Hearts', 'King'])
    expect(q.sayA!.King).toBe('KING')
    expect(entryById(data(), 'king-of-hearts')).toBeUndefined()
    expect(data().relationships.some((r) => r.a === 'king-of-hearts' || r.b === 'king-of-hearts')).toBe(false)
    expect(data().relationships.some((r) => r.a === 'queen-of-hearts' && r.b === 'queen-of-hearts')).toBe(false)
    expect(data().relationships.length).toBeLessThan(rels)
    expect(appearsIn(data(), q).map((c) => c.id)).toContain('8')
    rtlAct(() => { undoLast() })
    expect(entryById(data(), 'king-of-hearts')).toBeDefined()
    expect(entryById(data(), 'queen-of-hearts')!.aka).toEqual(['Queen', 'Queen of Hearts'])
    expect(data().relationships).toHaveLength(rels)
  })

  it('appears-in is the union of both entries, and confirmed speakers keep resolving', () => {
    const before = new Set([...appearsIn(data(), entryById(data(), 'alice')!), ...appearsIn(data(), entryById(data(), 'duchess')!)].map((c) => c.id))
    run(() => mergeEntries('alice', 'duchess'))
    expect(new Set(appearsIn(data(), entryById(data(), 'alice')!).map((c) => c.id))).toEqual(before)
    expect(speakerCandidates(data()).find((c) => c.alias === 'Duchess')?.entryId).toBe('alice')
  })

  it('the Names box offers "Merge into this entry" instead of adding a copy', async () => {
    startEdit('alice')
    render(<><BiblePage /><OverlayHost /></>)
    upd((d) => { d.ui.bible.sel = 'alice' })
    const u = userEvent.setup()
    await u.type(screen.getByLabelText('Add a name'), 'Duchess{Enter}')
    expect(document.getElementById('sbclash')!.textContent).toContain('already a name of Duchess')
    expect(entryById(data(), 'alice')!.aka).toEqual(['Alice'])
    await u.click(screen.getByRole('button', { name: 'Merge into this entry' }))
    expect(entryById(data(), 'alice')!.aka).toEqual(['Alice', 'Duchess'])
    expect(entryById(data(), 'duchess')).toBeUndefined()
    expect(getState().ui.bible.editing?.id).toBe('alice')
  })

  it('the merge offer and the typed name do not follow to another entry', async () => {
    startEdit('alice')
    render(<><BiblePage /><OverlayHost /></>)
    upd((d) => { d.ui.bible.sel = 'alice' })
    const u = userEvent.setup()
    await u.type(screen.getByLabelText('Add a name'), 'Duchess{Enter}')
    expect(document.getElementById('sbclash')).not.toBeNull()
    rtlAct(() => { newEntry() })
    expect(document.getElementById('sbclash')).toBeNull()
    expect((screen.getByLabelText('Add a name') as HTMLInputElement).value).toBe('')
  })

  it('Cancel after a merge does not bring the merged entry back', () => {
    startEdit('alice')
    run(() => mergeEntries('alice', 'duchess'))
    rtlAct(() => cancelEdit())
    expect(entryById(data(), 'duchess')).toBeUndefined()
    expect(entryById(data(), 'alice')!.aka).toContain('Duchess')
  })
})

describe('drafts', () => {
  it('Cancel on a new, unsaved entry drops it and its relationships', () => {
    const n = data().bible.length
    const id = run(() => newEntry())
    expect(data().bible).toHaveLength(n + 1)
    upd((d) => { d.data.relationships.push({ id: 91, a: id, rel: 'knows', b: 'alice' }) })
    rtlAct(() => cancelEdit())
    expect(data().bible).toHaveLength(n)
    expect(entryById(data(), id)).toBeUndefined()
    expect(data().relationships.some((r) => r.a === id || r.b === id)).toBe(false)
    expect(getState().ui.bible.editing).toBeNull()
    expect(getState().ui.bible.sel).toBeNull()
  })

  it('Save keeps it; leaving an unsaved draft for another entry drops it; an existing entry is never dropped', () => {
    const n = data().bible.length
    const a = run(() => newEntry())
    rtlAct(() => saveEdit())
    expect(entryById(data(), a)).toBeDefined()
    const b = run(() => newEntry())
    rtlAct(() => selectEntry('alice'))
    expect(entryById(data(), b)).toBeUndefined()
    startEdit('alice')
    rtlAct(() => cancelEdit())
    expect(entryById(data(), 'alice')).toBeDefined()
    expect(data().bible).toHaveLength(n + 1)
  })

  it('starting another new entry drops the unsaved one', () => {
    const n = data().bible.length
    run(() => newEntry())
    run(() => newEntry())
    expect(data().bible).toHaveLength(n + 1)
  })

  it('the Cancel button of a new entry removes it from the list', async () => {
    render(<><BiblePage /><OverlayHost /></>)
    const u = userEvent.setup()
    await u.click(screen.getByLabelText('New entry'))
    expect(document.querySelector('[data-sbe="new-entry"]')).not.toBeNull()
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.querySelector('[data-sbe="new-entry"]')).toBeNull()
  })
})

describe('sorting the list', () => {
  const names = () => [...document.querySelectorAll('[data-sbe] b')].map((b) => b.textContent)
  it('sorts by name, by type and by chapters, with the name as the tie-break', () => {
    const b = data()
    const counts = chapterCounts(b)
    const byName = sortEntries(b, b.bible, 'name', counts).map((e) => e.name)
    expect(byName).toEqual([...byName].sort((x, y) => x.localeCompare(y)))
    const byType = sortEntries(b, b.bible, 'type', counts)
    const order = b.bibleTypes.map((t) => t.k)
    expect(byType.map((e) => order.indexOf(e.kind))).toEqual([...byType.map((e) => order.indexOf(e.kind))].sort((x, y) => x - y))
    const byCh = sortEntries(b, b.bible, 'chapters', counts)
    expect(byCh.map((e) => counts.get(e.id))).toEqual([...byCh.map((e) => counts.get(e.id) ?? 0)].sort((x, y) => y - x))
    expect(byCh[0].id).not.toBe(byCh[byCh.length - 1].id)
  })

  it('the control sorts the list and the choice is kept in ui state', async () => {
    render(<><BiblePage /><OverlayHost /></>)
    const u = userEvent.setup()
    expect(getState().ui.bible.sort).toBe('name')
    const before = names()
    expect(before).toEqual([...before].sort((x, y) => (x ?? '').localeCompare(y ?? '')))
    await u.click(screen.getByLabelText('Sort entries'))
    await u.click(screen.getByRole('option', { name: 'By chapters' }))
    expect(getState().ui.bible.sort).toBe('chapters')
    const counts = chapterCounts(data())
    const shown = [...document.querySelectorAll<HTMLElement>('[data-sbe]')].map((x) => counts.get(x.dataset.sbe!) ?? 0)
    expect(shown).toEqual([...shown].sort((x, y) => y - x))
    cleanup()
    render(<><BiblePage /><OverlayHost /></>)
    expect(screen.getByLabelText('Sort entries').textContent).toContain('By chapters')
    rtlAct(() => setBibleSort('type'))
    expect(getState().ui.bible.sort).toBe('type')
  })
})

describe('counts in the list', () => {
  it('each row shows its names and its chapters, and no mention counts', () => {
    render(<><BiblePage /><OverlayHost /></>)
    const row = document.querySelector('[data-sbe="the-gardeners"]')!
    const e = entryById(data(), 'the-gardeners')!
    expect(row.textContent).toContain(e.aka.length + ' names')
    expect(row.textContent).toContain(appearsIn(data(), e).length + ' chapter')
    expect(document.querySelector('[data-sbe="alice"]')!.textContent).toContain('1 name ')
    expect(document.body.textContent).not.toMatch(/mention/i)
  })
})

describe('appears in: chapters only', () => {
  it('lists chapters with a button to go to each, and no mention or line counts', async () => {
    render(<><BiblePage /><OverlayHost /></>)
    const e = entryById(data(), 'queen-of-hearts')!
    const chapters = appearsIn(data(), e)
    expect(screen.getByText('Appears in · ' + chapters.length + (chapters.length === 1 ? ' chapter' : ' chapters'))).toBeInTheDocument()
    expect([...document.querySelectorAll('table th')].map((t) => t.textContent)).not.toContain('Mentions')
    expect(document.querySelectorAll('[data-sbgo]')).toHaveLength(chapters.length)
    await userEvent.click(document.querySelector(`[data-sbgo="${chapters[0].id}"]`)!)
    expect(getState().ui.page).toBe('script')
    expect(getState().ui.script.pendingJump).toBe(chapters[0].id)
  })
})

describe('speaker colours', () => {
  it('are stable per entry, from the palette, and the same for every name of the entry', () => {
    const cands = speakerCandidates(data())
    const colourOf = (id: string) => speakerColourOf({ id })
    cands.forEach((c) => {
      expect(SPEAKER_PALETTE).toContain(c.speakerColour)
      expect(c.speakerColour).toBe(colourOf(c.entryId))
    })
    const five = cands.find((c) => c.alias === 'Five')!
    expect(cands.find((c) => c.alias === 'Seven')!.speakerColour).toBe(five.speakerColour)
    const before = new Map(cands.map((c) => [c.alias, c.speakerColour]))
    addName('alice', 'Cheshire')
    upd((d) => { d.data.bible.push({ id: 'new-speaker', name: 'New speaker', kind: 'Character', aka: ['New speaker'], sum: '', voice: '', acts: '', knows: '', first: null, say: '' }) })
    speakerCandidates(data()).filter((c) => before.has(c.alias)).forEach((c) => expect(c.speakerColour).toBe(before.get(c.alias)))
  })

  it('give the main speakers of the book more than one colour', () => {
    const colours = new Set(['alice', 'queen-of-hearts', 'the-gardeners', 'white-rabbit', 'duchess', 'king-of-hearts'].map((id) => speakerColourOf({ id })))
    expect(colours.size).toBeGreaterThanOrEqual(4)
  })

  it('the narrator\'s choice wins and can be put back to automatic', () => {
    const auto = speakerColourOf({ id: 'alice' })
    const other = SPEAKER_PALETTE.find((c) => c !== auto)!
    rtlAct(() => setEntryColour('alice', other))
    expect(speakerCandidates(data()).find((c) => c.alias === 'Alice')!.speakerColour).toBe(other)
    rtlAct(() => setEntryColour('alice', null))
    expect(speakerCandidates(data()).find((c) => c.alias === 'Alice')!.speakerColour).toBe(auto)
  })

  it('the speaker picker shows each speaker\'s swatch', () => {
    render(<OverlayHost />)
    rtlAct(() => openSpeakerPicker({ x: 100, y: 100 }, '8-2:0', 'Queen', false))
    const row = document.querySelector('[data-spk-pick="Queen"]')!
    const sw = row.querySelector<HTMLElement>('.swatch')!
    expect(sw.style.getPropertyValue('--mc')).toBe('var(--' + speakerColourOf({ id: 'queen-of-hearts' }) + ')')
  })

  it('the editor offers a colour for speaking types only', async () => {
    startEdit('alice')
    render(<><BiblePage /><OverlayHost /></>)
    upd((d) => { d.ui.bible.sel = 'alice' })
    expect(screen.getByLabelText('Speaker colour')).toBeInTheDocument()
    cleanup()
    startEdit('the-garden')
    upd((d) => { d.ui.bible.sel = 'the-garden' })
    render(<><BiblePage /><OverlayHost /></>)
    expect(screen.queryByLabelText('Speaker colour')).toBeNull()
  })
})

describe('needs review for imported items', () => {
  it('the fixture import flags some entries and names; the narrator\'s own entries are not flagged', () => {
    const flagged = data().bible.filter(needsReview)
    expect(flagged.length).toBeGreaterThan(0)
    /* Something to verify also needs review (batch H), so the count is the flagged entries and those with a suggestion to verify. */
    expect(reviewCount(data())).toBe(data().bible.filter((e) => entryNeedsReview(data(), e)).length)
    expect(reviewCount(data())).toBeGreaterThanOrEqual(flagged.length)
    expect(flagged.every((e) => !e.user)).toBe(true)
    expect(data().bible.some((e) => e.review && e.review.aliases.length > 0)).toBe(true)
  })

  it('a filter chip with the count shows only the entries that need review', async () => {
    render(<><BiblePage /><OverlayHost /></>)
    const u = userEvent.setup()
    const n = reviewCount(data())
    const chip = screen.getByRole('button', { name: 'Needs review · ' + n })
    await u.click(chip)
    const ids = [...document.querySelectorAll<HTMLElement>('[data-sbe]')].map((x) => x.dataset.sbe!)
    expect(ids.length).toBe(n)
    ids.forEach((id) => expect(entryNeedsReview(data(), entryById(data(), id)!)).toBe(true))
    expect(document.querySelectorAll('[data-sbreview-pill]')).toHaveLength(n)
  })

  it('Mark reviewed clears the entry and all its names, can be undone, and the count follows', () => {
    const n = reviewCount(data())
    rtlAct(() => markEntryReviewed('knave-of-hearts'))
    expect(entryById(data(), 'knave-of-hearts')!.review).toBeUndefined()
    expect(reviewCount(data())).toBe(n - 1)
    rtlAct(() => { undoLast() })
    expect(reviewCount(data())).toBe(n)
  })

  it('a name is reviewed on its own; the entry is reviewed when nothing is left', () => {
    const g = () => entryById(data(), 'the-gardeners')!
    expect(aliasNeedsReview(g(), 'gardeners')).toBe(true)
    expect(needsReview(g())).toBe(true)
    rtlAct(() => markAliasReviewed('the-gardeners', 'gardeners'))
    expect(aliasNeedsReview(g(), 'gardeners')).toBe(false)
    expect(needsReview(g())).toBe(false)
    expect(g().review).toBeUndefined()
  })

  it('the editor shows the flags and the buttons clear them; Cancel does not bring a flag back', async () => {
    render(<><BiblePage /><OverlayHost /></>)
    const u = userEvent.setup()
    await u.click(document.querySelector('[data-sbe="the-gardeners"]')!)
    expect(screen.getAllByText('Needs review').length).toBeGreaterThan(0)
    rtlAct(() => startEdit('the-gardeners'))
    await u.click(screen.getByLabelText('Mark gardeners reviewed'))
    expect(aliasNeedsReview(entryById(data(), 'the-gardeners')!, 'gardeners')).toBe(false)
    rtlAct(() => cancelEdit())
    expect(entryById(data(), 'the-gardeners')!.review).toBeUndefined()
    await u.click(document.querySelector('[data-sbe="knave-of-hearts"]')!)
    await u.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    expect(entryById(data(), 'knave-of-hearts')!.review).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
  })

  it('merging keeps the flags of both entries on the result', () => {
    run(() => mergeEntries('knave-of-hearts', 'duchess'))
    expect(entryById(data(), 'knave-of-hearts')!.review?.entry).toBe(true)
  })
})
