import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { chooseOption } from './helpers/select'
import { closePop, closeTopModal, getOverlay } from '@/ui/overlay'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Schedule from '@/pages/Schedule'
import { OverlayHost } from '@/ui/OverlayHost'
import { DEADLINES } from '@/state/slices/mock'
import { act as rtlAct } from '@testing-library/react'
import { createInitialState, getState, resetState, update } from '@/state/store'
const upd = (fn: Parameters<typeof update>[0]) => rtlAct(() => update(fn))

const mount = () => render(<><Schedule /><OverlayHost /></>)
beforeEach(() => resetState(createInitialState()))
afterEach(() => {
  cleanup()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
})
const rowOf = (id: number) => document.querySelector(`[data-msrow="${id}"]`) as HTMLElement
const ms = (id: number) => getState().data.milestones.find((m) => m.id === id)!
const dlg = () => screen.getByRole('dialog')

describe('Schedule', () => {
  it('shows the verdict for each deadline', () => {
    for (const k of ['ok', 'tight', 'behind'] as const) {
      cleanup()
      resetState(createInitialState())
      upd((d) => { d.mock.deadline = k; d.data.due = DEADLINES[k] })
      mount()
      expect(document.querySelector('[data-vp]')!.textContent).toContain({ ok: 'On track', tight: 'Tight', behind: 'Behind' }[k])
    }
  })

  it('asks for a manuscript first', () => {
    upd((d) => { d.mock.hasManuscript = false })
    mount()
    expect(screen.getByText('This project has no manuscript yet. Import one to begin.')).toBeInTheDocument()
  })

  it('estimates a milestone with a measure and says "Not estimated" for a custom one', () => {
    mount()
    expect(within(rowOf(1)).getByRole('img', { name: 'Done' })).toBeInTheDocument()
    upd((d) => { d.data.milestones[0].done = false })
    expect(within(rowOf(1)).getByRole('img', { name: 'Not estimated' })).toBeInTheDocument()
    expect(within(rowOf(3)).getByRole('img', { name: /\((est\. [A-Z][a-z]{2} \d+)\)/ })).toBeInTheDocument()
    expect(within(rowOf(3)).getByRole('img', { name: /^(Late by|At risk|On track)/ })).toBeInTheDocument()
  })

  it('shows a late milestone as late', () => {
    upd((d) => { d.data.milestones.find((m) => m.id === 3)!.date = '2026-09-27' })
    mount()
    expect(within(rowOf(3)).getByRole('img', { name: /^Late by \d+ d/ })).toBeInTheDocument()
  })

  it('marks a milestone done with a toggle button that carries its state', () => {
    mount()
    const t = screen.getByRole('button', { name: 'Mark All chapters recorded complete' })
    expect(t).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(t)
    expect(ms(3).done).toBe(true)
    expect(screen.getByRole('button', { name: 'Mark All chapters recorded complete' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(rowOf(3)).getByRole('img', { name: 'Done' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark All chapters recorded complete' }))
    expect(ms(3).done).toBeFalsy()
  })

  it('the table is read-only: no inputs in a milestone row, and the measure reads as its value', () => {
    upd((d) => { d.data.milestones.push({ id: 7, name: 'Sample', date: '2026-10-05', scope: 'min20' }, { id: 8, name: 'Early', date: '2026-10-06', scope: 'ch4' }) })
    mount()
    for (const m of getState().data.milestones) expect(rowOf(m.id).querySelector('input, textarea, select')).toBeNull()
    expect(rowOf(7).querySelector('[data-msmeasure]')!.textContent).toBe('First 20 finished minutes')
    expect(rowOf(8).querySelector('[data-msmeasure]')!.textContent).toBe('First 4 chapters edited and proofed')
    expect(rowOf(3).querySelector('[data-msmeasure]')!.textContent).toBe('All recorded')
    expect(rowOf(1).querySelector('[data-msmeasure]')!.textContent).toBe('Custom')
    for (const r of document.querySelectorAll('[data-msmeasure]')) expect(r.textContent).not.toMatch(/\bN\b/)
  })

  it('sorts the rows by date', () => {
    upd((d) => { d.data.milestones.push({ id: 9, name: 'Earliest', date: '2026-01-01', scope: 'custom' }) })
    mount()
    expect([...document.querySelectorAll('[data-msrow]')].map((r) => r.getAttribute('data-msrow'))[0]).toBe('9')
  })

  it('edits every detail in a dialog: name (empty refused), date, measure with its N, note and done', async () => {
    mount()
    fireEvent.click(document.querySelector('[data-msedit="3"]')!)
    const d = within(dlg())
    expect((d.getByLabelText('Name') as HTMLInputElement).value).toBe('All chapters recorded')
    fireEvent.change(d.getByLabelText('Name'), { target: { value: '  ' } })
    fireEvent.click(d.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Give the milestone a name and a date.')).toBeInTheDocument()
    expect(ms(3).name).toBe('All chapters recorded')
    fireEvent.change(d.getByLabelText('Name'), { target: { value: 'Everything recorded' } })
    fireEvent.change(d.getByLabelText('Due'), { target: { value: '2026-10-09' } })
    expect(d.queryByLabelText('How many chapters')).toBeNull()
    await chooseOption(d.getByRole('combobox', { name: 'What the milestone measures' }), /First N chapters/)
    fireEvent.change(d.getByLabelText('How many chapters'), { target: { value: '4' } })
    fireEvent.change(d.getByLabelText('Note'), { target: { value: 'Proofer wants the sample first' } })
    fireEvent.click(d.getByRole('checkbox', { name: 'Done' }))
    fireEvent.click(d.getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(ms(3)).toMatchObject({ name: 'Everything recorded', date: '2026-10-09', scope: 'ch4', note: 'Proofer wants the sample first', done: true })
  })

  it('clamps the chapter count to the book and Cancel changes nothing', async () => {
    mount()
    fireEvent.click(document.querySelector('[data-msedit="3"]')!)
    const d = within(dlg())
    await chooseOption(d.getByRole('combobox', { name: 'What the milestone measures' }), /First N chapters/)
    fireEvent.change(d.getByLabelText('How many chapters'), { target: { value: '99' } })
    fireEvent.blur(d.getByLabelText('How many chapters'))
    fireEvent.click(d.getByRole('button', { name: 'Save' }))
    expect(ms(3).scope).toBe('ch12')
    fireEvent.click(document.querySelector('[data-msedit="3"]')!)
    fireEvent.change(within(dlg()).getByLabelText('Name'), { target: { value: 'Nope' } })
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Cancel' }))
    expect(ms(3).name).toBe('All chapters recorded')
  })

  it('every stored milestone measure is one of the offered measures', async () => {
    upd((d) => { d.data.deliveryProfile = 'none'; d.data.milestones.push({ id: 7, name: 'Checkpoint', date: '2026-10-05', scope: 'checkpoint' }) })
    mount()
    fireEvent.click(document.querySelector('[data-msedit="7"]')!)
    expect(within(dlg()).getByRole('combobox', { name: 'What the milestone measures' })).toHaveTextContent('15-minute checkpoint')
  })

  it('removes a milestone with an Undo, and adds one from the dialog', () => {
    mount()
    fireEvent.click(document.querySelector('[data-msx="2"]')!)
    expect(getState().data.milestones.map((m) => m.id)).toEqual([1, 3, 4])
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(getState().data.milestones.map((m) => m.id).sort()).toEqual([1, 2, 3, 4])
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Add milestone' }))
    expect(screen.getByText('Give the milestone a name and a date.')).toBeInTheDocument()
    fireEvent.change(within(dlg()).getByLabelText('Name'), { target: { value: 'Retail sample' } })
    fireEvent.change(within(dlg()).getByLabelText('Due'), { target: { value: '2026-10-02' } })
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Add milestone' }))
    expect(getState().data.milestones.at(-1)).toMatchObject({ id: 5, name: 'Retail sample', date: '2026-10-02', scope: 'custom' })
  })

  it('a sticky-note button shows the note as its tooltip, or offers to add one, and opens the note', () => {
    mount()
    const none = document.querySelector('[data-msnote="2"]') as HTMLElement
    expect(none.getAttribute('data-tip')).toBe('Add a note')
    expect(none.querySelector('svg')!.getAttribute('data-prefix')).toBe('far')
    fireEvent.click(none)
    fireEvent.change(within(dlg()).getByLabelText('Note'), { target: { value: 'Proofer wants the sample first' } })
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Save' }))
    const has = document.querySelector('[data-msnote="2"]') as HTMLElement
    expect(has.getAttribute('data-tip')).toBe('Proofer wants the sample first')
    expect(has.querySelector('svg')!.getAttribute('data-prefix')).toBe('fas')
    fireEvent.click(has)
    fireEvent.change(within(dlg()).getByLabelText('Note'), { target: { value: '  ' } })
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Save' }))
    expect(ms(2).note).toBeUndefined()
  })

  it('has no "from template" choice, and the 15-minute checkpoint is a measure only ACX offers', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(screen.queryByText(/template/i)).toBeNull()
    await chooseOption(within(dlg()).getByRole('combobox', { name: 'What the milestone measures' }), '15-minute checkpoint')
    fireEvent.change(within(dlg()).getByLabelText('Name'), { target: { value: 'Checkpoint' } })
    fireEvent.change(within(dlg()).getByLabelText('Due'), { target: { value: '2026-10-02' } })
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Add milestone' }))
    expect(ms(5).scope).toBe('checkpoint')
    expect(rowOf(5).querySelector('[data-msmeasure]')!.textContent).toBe('First 15 finished minutes')
    cleanup()
    upd((d) => { d.data.deliveryProfile = 'none' })
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    await userEvent.click(within(dlg()).getByRole('combobox', { name: 'What the milestone measures' }))
    expect(within(await screen.findByRole('listbox')).queryByRole('option', { name: '15-minute checkpoint' })).toBeNull()
  })

  it('changing the due date updates the data and marks the deadline custom', () => {
    mount()
    fireEvent.change(document.getElementById('duedt')!, { target: { value: '2026-11-01' } })
    expect(getState().data.due).toBe('2026-11-01')
    expect(getState().mock.deadline).toBe('custom')
    expect(screen.getByText(/Due/, { selector: '.sub' }).textContent).toContain('Nov 1')
  })
})
