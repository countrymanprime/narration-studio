import { act as rtlAct, cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contextItemsFor } from '@/app/registry'
import { buildDoc } from '@/selectors/scriptedit'
import { daw } from '@/state/daw'
import { setRetryMode, stackRetries } from '@/state/commands/stacking'
import { focusFlag, toggleTakes } from '@/state/commands/scriptedit'
import { createInitialState, getState, resetState, update as rawUpdate } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import EditingPage from '@/pages/Editing'
import '@/pages'

const update: typeof rawUpdate = (fn) => { rtlAct(() => rawUpdate(fn)) }
const setup = (mock: Partial<ReturnType<typeof getState>['mock']> = {}) => {
  const s = createInitialState({ prefs: undefined })
  s.ui.page = 'editing'
  s.ui.chapter = '5'
  s.mock = { ...s.mock, ...mock }
  resetState(s)
  daw().calls.length = 0
}
const mount = () => render(<><OverlayHost /><EditingPage /></>)
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })
const toasts = () => getOverlay().toasts.map((t) => t.msg)
const passage = (id: string) => getState().data.passages.find((p) => p.id === id)!
const calls = (n: string) => daw().calls.filter((c) => c.name === n)
const mark = (key: string) => rtlAct(() => { fireEvent.mouseDown(document.querySelector(`[data-k="${key}"]`)!) })

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('takes inline, under the line', () => {
  it('a passage with more than one take has a chip under its line: how many, which is active, whether it is chosen', () => {
    mount()
    const chip = document.querySelector('[data-tchip="ps5-9"]') as HTMLElement
    expect(chip.textContent).toContain('4 takes')
    expect(chip.textContent).toContain('T05-9')
    expect(chip.textContent).toContain('To choose')
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-takes="ps5-9"]')).toBeNull()
    // The gutter badge opens the same takes.
    click('.sp[data-pid="5-9"] .pbadge')
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelectorAll('[data-takes="ps5-9"] [data-take]')).toHaveLength(4)
    click('[data-tchip="ps5-9"]')
    expect(document.querySelector('[data-takes="ps5-9"]')).toBeNull()
  })
  it('each take is a sub-line with its level drawing, how much it read as written, what was measured and what it read against the script', () => {
    mount()
    rtlAct(() => toggleTakes('ps5-9'))
    const lane = document.querySelector('[data-takes="ps5-9"] [data-take="T05-8"]') as HTMLElement
    expect(lane.textContent).toContain('98%')
    expect(lane.querySelector('svg.mini')).not.toBeNull()
    expect(lane.querySelector('.ev')!.textContent).toMatch(/Matched 98%/)
    expect(lane.querySelector('ins')!.textContent).toBe('don’t')
    expect(lane.querySelector('del')!.textContent).toBe('won’t')
    expect(within(lane).getByText('Muted')).toBeInTheDocument()
  })
  it('choose, play, hide the others and look at them again from the text; nothing is deleted', () => {
    mount()
    rtlAct(() => toggleTakes('ps5-5'))
    click('[data-tkeep="T05-2"]')
    expect(passage('ps5-5').kept).toBe(true)
    expect(document.querySelector('[data-tchip="ps5-5"]')!.textContent).toContain('Kept')
    click('#thide')
    expect(passage('ps5-5').takes).toHaveLength(3)
    expect(passage('ps5-5').takes.filter((t) => t.hidden)).toHaveLength(2)
    expect(calls('removeTakes')).toHaveLength(0)
    click('[data-tchip="ps5-5"]')
    click('[data-tchip="ps5-5"]')
    click('[data-tplay="T05-2"]')
    expect(toasts()).toContain('Playing T05-2')
  })
  it('the suggestion comes with its evidence and the prep steps, never applied by itself', () => {
    mount()
    rtlAct(() => toggleTakes('ps5-9'))
    expect(document.querySelector('#sugg')!.textContent).toContain('Suggested: T05-9')
    expect(document.querySelector('#sugg')!.textContent).toContain('Not comparable yet')
    expect([...document.querySelectorAll('#sugg [data-prep]')].map((b) => b.textContent!.trim())).toEqual(['Trim white space', 'Trim breaths', 'Normalise'])
    expect(passage('ps5-9').prepped ?? []).toEqual([])
    click('[data-prep="trim-silence"]')
    expect(passage('ps5-9').prepped).toEqual(['trim-silence'])
  })
  it('the retry mode of the passage is a choice in its takes, and stacking and un-stacking are offered there', () => {
    mount()
    rtlAct(() => toggleTakes('ps5-5'))
    expect(document.querySelector('#tstack')).toBeNull()
    rtlAct(() => setRetryMode({ passage: 'ps5-5' }, 'stack'))
    click('#tstack')
    expect(document.querySelector('.dlg #stackdlg')).not.toBeNull()
    click('#stackgo')
    expect(passage('ps5-5').stack).toBeDefined()
    expect(document.querySelector('[data-tchip="ps5-5"]')!.textContent).toContain('Stacked')
    expect(document.querySelector('#tunstack')).not.toBeNull()
    expect(document.querySelectorAll('[data-takes="ps5-5"] [data-tunstack]').length).toBeGreaterThan(0)
  })
  it('the right-click menu on a word of the line offers keep, hide the others, the takes and stacking', () => {
    mount()
    const items = contextItemsFor(document.querySelector('[data-k="5-5:0"]')!, { clientX: 0, clientY: 0 })!
    const labels = items.map((i) => ('l' in i ? i.l : ''))
    expect(labels).toEqual(expect.arrayContaining(['Show takes of this line', 'Keep T05-1', 'Keep T05-2', 'Keep T05-3', 'Hide the other takes']))
    const keep = items.find((i) => 'l' in i && i.l === 'Keep T05-2') as { fn: () => void }
    rtlAct(() => keep.fn())
    expect(passage('ps5-5').kept).toBe(true)
  })
  it('the chapter’s retry choice and “stack all” are in the drawer, with the count only when stacking', () => {
    mount()
    update((d) => { d.ui.editing.drawer = 'cleanup' })
    expect(document.querySelector('#stackcount')).toBeNull()
    click('[aria-label="How retries are kept in this chapter"] button:nth-child(1)')
    expect(document.querySelector('#stackcount')!.textContent).toMatch(/can be stacked$/)
    stackRetries('5', ['ps5-5'])
  })
})

describe('a line read twice', () => {
  const open = () => {
    mount()
    const doc = buildDoc(getState().data, '5')
    rtlAct(() => focusFlag(doc.items[doc.index.get('5-15:x0')!]))
  }
  it('selects the second read and opens a card with three answers, and deletes nothing', () => {
    open()
    expect(getState().ui.editing.sel).toEqual({ anchor: '5-15:x0', head: '5-15:x3' })
    expect(getState().ui.editing.flag).toBe('dup:5-15')
    const card = document.querySelector('[data-flagcard="dup"]') as HTMLElement
    expect(card.textContent).toContain('The line is read twice')
    expect([...card.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Stack as 2 takes', 'Leave in place', 'Delete second read…'])
    expect(getState().data.cuts).toHaveLength(0)
    expect(passage('ps5-15').takes).toHaveLength(1)
  })
  it('Stack as 2 takes cuts the take in two (a split in the DAW, nothing deleted)', () => {
    open()
    click('#fcstack')
    expect(calls('splitTake')).toHaveLength(1)
    expect(passage('ps5-15').takes.map((t) => t.id)).toEqual(['T05-12a', 'T05-12b'])
    expect(document.querySelector('[data-flagcard]')).toBeNull()
  })
  it('Leave in place closes the card and changes nothing', () => {
    open()
    click('#fcleave')
    expect(document.querySelector('[data-flagcard]')).toBeNull()
    expect(passage('ps5-15').takes).toHaveLength(1)
    expect(getState().history).toHaveLength(0)
  })
  it('Delete second read… opens the same question as deleting words, with the second read in it', () => {
    open()
    click('#fcdelete')
    expect(document.querySelector('#cutdlg')).not.toBeNull()
    expect(document.querySelector('#cutwords')!.textContent).toBe('“Serpent!” screamed the Pigeon.')
  })
})

describe('a flagged word, in its card', () => {
  it('a misread: what was heard, how sure, and three answers; looking changes nothing', () => {
    mount()
    mark('5-3:31')
    const card = document.querySelector('[data-flagcard="mis"]') as HTMLElement
    expect(card.textContent).toContain('Heard “mourning”, the script says “morning”')
    expect(card.textContent).toMatch(/54% · heard at \d\d:\d\d\.\d/)
    expect(within(card).getByRole('button', { name: /Hear the word/ })).toBeInTheDocument()
    expect(getState().data.accepted).toEqual([])
    expect(getState().history).toHaveLength(0)
  })
  it('accepting it clears the flag and records it; Undo puts the flag back', () => {
    mount()
    mark('5-3:31')
    click('#fcaccept')
    expect(getState().data.accepted).toEqual(['5-3:31'])
    expect(document.querySelector('[data-flagcard]')).toBeNull()
    expect(document.querySelector('[data-k="5-3:31"]')!.className).not.toContain('st-mis')
    expect(document.querySelector('[data-legend="mis"]')!.textContent).toBe('Misread')
    rtlAct(() => { getOverlay().toasts.at(-1)!.undo!() })
    expect(getState().data.accepted).toEqual([])
  })
  it('a low-confidence word and a word not read have their cards; Mark for pickup adds a pickup', () => {
    mount()
    mark('5-3:14')
    expect(document.querySelector('[data-flagcard="low"]')!.textContent).toContain('The recogniser was unsure of “hardly”')
    const before = getState().data.pickups.length
    click('#fcpickup')
    expect(getState().data.pickups.length).toBe(before + 1)
    expect(getState().data.pickups.at(-1)).toMatchObject({ chapterId: '5', pid: '5-3', src: 'you', script: '“hardly”' })
    mark('5-3:40')
    expect(document.querySelector('[data-flagcard="miss"]')!.textContent).toContain('The script has “several”, it was not heard')
  })
  it('words said and not written: Keep this addition clears the flag, and Delete words and audio asks first', () => {
    mount()
    const doc = buildDoc(getState().data, '5')
    rtlAct(() => focusFlag(doc.items[doc.index.get('5-5:x0')!]))
    const card = document.querySelector('[data-flagcard="extra"]') as HTMLElement
    expect(card.textContent).toContain('Heard “uh”')
    click('#fcdelete')
    expect(document.querySelector('#cutwords')!.textContent).toBe('uh')
    expect(getState().data.cuts).toHaveLength(0)
    closeTopModal()
    click('#fckeep')
    expect(getState().data.accepted).toEqual(['5-5:x0'])
    expect(document.querySelector('[data-k="5-5:x0"]')!.className).toContain('acc')
    expect(getState().data.cuts).toHaveLength(0)
  })
})

describe('marks, notes and pickups from the text', () => {
  it('Mark as lists the narrator’s mark types, and marking uses the Script page’s own command', () => {
    mount()
    mark('5-5:3')
    const items = contextItemsFor(document.querySelector('[data-k="5-5:3"]')!, { clientX: 0, clientY: 0 })!
    const sub = items.find((i) => 'sub' in i && i.l === 'Mark as') as { sub: Array<{ l: string; fn: () => void }> }
    expect(sub.sub.map((i) => i.l)).toEqual(getState().data.marks.map((m) => m.name))
    const n = getState().data.annotations.length
    rtlAct(() => sub.sub[0].fn())
    expect(getState().data.annotations).toHaveLength(n + 1)
    expect(getState().data.annotations.at(-1)).toMatchObject({ p: '5-5', type: 'mark', q: 'myself,' })
  })
  it('Add note… writes a note on the words; words that were only said cannot be marked', () => {
    mount()
    mark('5-5:3')
    const items = contextItemsFor(document.querySelector('[data-k="5-5:3"]')!, { clientX: 0, clientY: 0 })!
    rtlAct(() => (items.find((i) => 'l' in i && i.l === 'Add note…') as { fn: () => void }).fn())
    expect(document.querySelector('#notedlg')).not.toBeNull()
    rtlAct(() => { fireEvent.change(document.querySelector('#notetext')!, { target: { value: 'Slow down here.' } }) })
    click('#notesave')
    expect(getState().data.annotations.at(-1)).toMatchObject({ p: '5-5', text: 'Slow down here.' })
    const x = contextItemsFor(document.querySelector('[data-k="5-5:x0"]')!, { clientX: 0, clientY: 0 })!
    expect((x.find((i) => 'sub' in i && i.l === 'Mark as') as { disabled?: boolean }).disabled).toBe(true)
  })
})
