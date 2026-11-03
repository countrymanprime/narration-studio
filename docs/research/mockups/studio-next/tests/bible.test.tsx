import { act as rtlAct, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import BiblePage from '@/pages/Bible'
import { OverlayHost } from '@/ui/OverlayHost'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { chName } from '@/selectors/chapters'
import { appearsIn, entryById } from '@/selectors/bible'
import { setTypeColour } from '@/state/commands/settings'
import { startEdit } from '@/state/commands/bible'

/** Entries open read-only; most tests need to edit, so they start in edit mode unless asked not to. */
const mount = (opts: Record<string, unknown> = {}, edit = true) => {
  resetState(createInitialState({ prefs: undefined, ...opts }))
  update((d) => { d.ui.page = 'bible' })
  if (edit) startEdit(getState().ui.bible.sel as string)
  return render(<><BiblePage /><OverlayHost /></>)
}
afterEach(cleanup)
beforeEach(() => resetState(createInitialState()))

describe('Story Bible', { timeout: 20000 }, () => {
  it('asks for a manuscript when there is none', () => {
    resetState(createInitialState())
    update((d) => { d.mock.hasManuscript = false })
    render(<BiblePage />)
    expect(screen.getByText('Import manuscript')).toBeInTheDocument()
  })

  it('lists entries with mention counts and filters by kind chip and search', async () => {
    mount()
    const u = userEvent.setup()
    expect(screen.getAllByRole('button').some((b) => b.hasAttribute('data-sbe'))).toBe(true)
    await u.click(screen.getByRole('button', { name: 'Location' }))
    const items = [...document.querySelectorAll('[data-sbe]')]
    expect(items.length).toBeGreaterThan(0)
    items.forEach((i) => expect(i.textContent).toContain('Location'))
    await u.click(screen.getByRole('button', { name: 'All' }))
    await u.type(screen.getByLabelText('Find an entry'), 'zzzz')
    expect(screen.getByText('No entries match.')).toBeInTheDocument()
  })

  it('colours the list border and chips from the type colour, and follows Settings edits', () => {
    mount()
    const sw = () => document.querySelector<HTMLElement>('[data-sbe="alice"] .swatch')!
    expect(sw().style.getPropertyValue('--mc')).toContain('var(--violet)')
    rtlAct(() => setTypeColour(0, 'bad'))
    expect(sw().style.getPropertyValue('--mc')).toContain('var(--bad)')
    expect(document.querySelector<HTMLElement>('[data-sbe="alice"]')!.style.borderLeft).toBe('')
  })

  it('"Appears in" counts match the selector and open the chapter in Script', async () => {
    mount()
    const u = userEvent.setup()
    await u.click(document.querySelector('[data-sbe="queen-of-hearts"]')!)
    rtlAct(() => startEdit('queen-of-hearts'))
    const { data } = getState()
    const e = entryById(data, 'queen-of-hearts')!
    const app = appearsIn(data, e)
    expect(app.length).toBeGreaterThan(0)
    expect(screen.getByText('Appears in · ' + app.length + (app.length === 1 ? ' chapter' : ' chapters'))).toBeInTheDocument()
    const rows = document.querySelectorAll('[data-sbl]')
    expect(rows).toHaveLength(app.length)
    expect(within(rows[0] as HTMLElement).getByText(chName(data, app[0]))).toBeInTheDocument()
    await u.click(within(rows[0] as HTMLElement).getByRole('button', { name: 'Go to chapter' }))
    expect(getState().ui.page).toBe('script')
    expect(getState().ui.script.pendingJump).toBe(app[0].id)
  })

  it('shows voice, acts and knows for characters only', async () => {
    mount()
    const u = userEvent.setup()
    expect(screen.getByLabelText('How they talk')).toBeInTheDocument()
    await u.click(document.querySelector('[data-sbe="the-garden"]')!)
    rtlAct(() => startEdit('the-garden'))
    expect(screen.queryByLabelText('How they talk')).toBeNull()
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
  })

  it('renaming keeps relationships, because they point at ids', async () => {
    mount()
    const u = userEvent.setup()
    await u.click(document.querySelector('[data-sbe="queen-of-hearts"]')!)
    rtlAct(() => startEdit('queen-of-hearts'))
    const before = getState().data.relationships.filter((r) => r.a === 'queen-of-hearts' || r.b === 'queen-of-hearts').length
    expect(before).toBeGreaterThan(0)
    const name = screen.getByLabelText('Name')
    await u.clear(name)
    await u.type(name, 'Red Queen{Enter}')
    const { data } = getState()
    expect(entryById(data, 'queen-of-hearts')!.name).toBe('Red Queen')
    expect(entryById(data, 'queen-of-hearts')!.aka).toContain('Red Queen')
    expect(data.relationships.filter((r) => r.a === 'queen-of-hearts' || r.b === 'queen-of-hearts')).toHaveLength(before)
    expect(screen.getAllByRole('button', { name: /Red Queen/ }).length).toBeGreaterThan(0)
  })

  it('refuses an empty or taken name', async () => {
    mount()
    const u = userEvent.setup()
    const name = screen.getByLabelText('Name')
    await u.clear(name)
    await u.type(name, 'Duchess{Enter}')
    expect(entryById(getState().data, 'queen-of-hearts')!.name).toBe('Queen of Hearts')
  })

  it('adds a name with Enter, and the last name cannot be removed', async () => {
    mount()
    const u = userEvent.setup()
    await u.click(document.querySelector('[data-sbe="alice"]')!)
    rtlAct(() => startEdit('alice'))
    expect(screen.getByLabelText('Remove Alice')).toBeDisabled()
    await u.type(screen.getByLabelText('Add a name'), 'Ally{Enter}')
    expect(entryById(getState().data, 'alice')!.aka).toEqual(['Alice', 'Ally'])
    await u.click(screen.getByLabelText('Remove Ally'))
    expect(entryById(getState().data, 'alice')!.aka).toEqual(['Alice'])
  })

  it('stores how each name is said; the first name sets the entry pronunciation', async () => {
    mount()
    const u = userEvent.setup()
    await u.click(document.querySelector('[data-sbe="the-gardeners"]')!)
    rtlAct(() => startEdit('the-gardeners'))
    const inp = screen.getByLabelText('How I say Five')
    await u.type(inp, 'fyve')
    const e = entryById(getState().data, 'the-gardeners')!
    expect(e.sayA!.Five).toBe('fyve')
    expect(e.say).toBe('fyve')
    await u.type(screen.getByLabelText('How I say Seven'), 'SEV-un')
    expect(entryById(getState().data, 'the-gardeners')!.say).toBe('fyve')
  })

  it('play and record are toasts', async () => {
    mount()
    const u = userEvent.setup()
    await u.click(screen.getByLabelText('Hear a reference clip for Queen'))
    expect(await screen.findByText('Playing the reference clip')).toBeInTheDocument()
    await u.click(screen.getByLabelText('Record my own clip for Queen'))
    expect(await screen.findByText('Recording your own clip')).toBeInTheDocument()
  })

  it('find in the manuscript opens Find with the name', async () => {
    mount()
    await userEvent.click(screen.getByLabelText('Find in the manuscript'))
    expect(getState().ui.page).toBe('script')
    expect(getState().ui.script.find.q).toBe('Queen of Hearts')
  })

  it('deleting an entry removes its relationships, clears the selection and toasts', async () => {
    mount()
    const u = userEvent.setup()
    await u.click(screen.getByLabelText('Delete this entry'))
    const { data } = getState()
    expect(entryById(data, 'queen-of-hearts')).toBeUndefined()
    expect(data.relationships.some((r) => r.a === 'queen-of-hearts' || r.b === 'queen-of-hearts')).toBe(false)
    expect(await screen.findByText('Deleted “Queen of Hearts”.')).toBeInTheDocument()
    expect(getState().ui.bible.sel).toBeNull()
  })

  it('a new entry is named, selected, focused and uses the filtered kind', async () => {
    mount()
    const u = userEvent.setup()
    await u.click(screen.getByRole('button', { name: 'Item' }))
    await u.click(screen.getByLabelText('New entry'))
    const e = getState().data.bible.find((x) => x.name === 'New entry')!
    expect(e.kind).toBe('Item')
    expect(getState().ui.bible.sel).toBe(e.id)
    expect(getState().ui.bible.kind).toBe('All')
    expect(screen.getByLabelText('Name')).toHaveFocus()
    await u.click(screen.getByRole('button', { name: 'Save' }))
    await u.click(screen.getByLabelText('New entry'))
    expect(getState().data.bible.some((x) => x.name === 'New entry 2')).toBe(true)
  })

  it('relationship picker searches entries; text is editable; add and remove work', async () => {
    mount()
    const u = userEvent.setup()
    const rel = () => getState().data.relationships.find((r) => r.id === 1)!
    await u.click(screen.getByLabelText('To: King of Hearts'))
    await u.type(screen.getByLabelText('Search entries'), 'caterp')
    const opts = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(opts).toHaveLength(1)
    expect(opts[0]).toHaveTextContent('The Caterpillar')
    await u.click(opts[0])
    expect(rel().b).toBe('the-caterpillar')
    expect(screen.queryByLabelText('Search entries')).toBeNull()
    await u.click(screen.getByLabelText('To: The Caterpillar'))
    await u.type(screen.getByLabelText('Search entries'), 'zzzz')
    expect(screen.getByText('No entries match.')).toBeInTheDocument()
    await u.keyboard('{Escape}')
    const text = screen.getAllByLabelText('Relationship')[0]
    await u.clear(text)
    await u.type(text, 'hates')
    expect(rel().rel).toBe('hates')
    expect(document.querySelectorAll('#rel-sugg option').length).toBeGreaterThan(5)
    const count = getState().data.relationships.length
    await u.click(screen.getByLabelText('Add a relationship'))
    const added = getState().data.relationships.at(-1)!
    expect(getState().data.relationships).toHaveLength(count + 1)
    expect(added.a).toBe('queen-of-hearts')
    expect(added.b).not.toBe('queen-of-hearts')
    await u.click(screen.getAllByLabelText('Remove this relationship')[0])
    expect(getState().data.relationships).toHaveLength(count)
  })

  it('relationships show only the relationship and the other entry, with incoming ones marked', () => {
    mount({}, false)
    const head = [...document.querySelectorAll('table th')].map((t) => t.textContent)
    expect(head).toContain('Relationship')
    expect(head).toContain('To')
    expect(head).not.toContain('Entry')
    expect(screen.getByText('is married to')).toBeInTheDocument()
    expect(screen.getByText('King of Hearts', { selector: 'span' })).toBeInTheDocument()
    expect(document.querySelector('[data-tip="The gardeners serve Queen of Hearts"]')).not.toBeNull()
  })

  it('opens read-only; Edit, then Save keeps and Cancel puts everything back', async () => {
    mount({}, false)
    const u = userEvent.setup()
    expect(document.querySelector('#sbsum')?.tagName).toBe('DIV')
    expect(screen.queryByLabelText('Add a name')).toBeNull()
    await u.click(screen.getByRole('button', { name: 'Edit' }))
    await u.type(screen.getByLabelText('Description'), ' EXTRA')
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(entryById(getState().data, 'queen-of-hearts')!.sum).not.toContain('EXTRA')
    await u.click(screen.getByRole('button', { name: 'Edit' }))
    await u.type(screen.getByLabelText('Description'), ' EXTRA')
    await u.click(screen.getByRole('button', { name: 'Save' }))
    expect(entryById(getState().data, 'queen-of-hearts')!.sum).toContain('EXTRA')
    expect(document.querySelector('#sbsum')?.tagName).toBe('DIV')
  })

  it('"Appears in" sits after the editable parts', () => {
    mount({}, false)
    const text = document.body.textContent ?? ''
    expect(text.indexOf('Relationships')).toBeLessThan(text.indexOf('Appears in'))
  })

  it('arrow keys move through the list', async () => {
    mount()
    const u = userEvent.setup()
    const first = document.querySelector<HTMLElement>('[data-sbe]')!
    first.focus()
    await u.keyboard('{ArrowDown}')
    const second = document.querySelectorAll<HTMLElement>('[data-sbe]')[1]
    expect(second).toHaveFocus()
    expect(second.tabIndex).toBe(0)
    await u.keyboard('{ArrowUp}')
    expect(first).toHaveFocus()
  })

  for (const headingStyle of ['gutenberg', 'numbered', 'colon'] as const) {
    it('shows chapter names in the ' + headingStyle + ' style, with 40 chapters', () => {
      mount({ headingStyle, chapters: 40 })
      const { data } = getState()
      const app = appearsIn(data, entryById(data, 'queen-of-hearts'))
      expect(app.length).toBeGreaterThan(0)
      const cells = [...document.querySelectorAll('[data-sbl] td:first-child')].map((x) => x.textContent)
      expect(cells).toEqual(app.map((c) => chName(data, c)))
    })
  }
})
