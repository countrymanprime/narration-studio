import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { closePop, closeTopModal, getOverlay } from '@/ui/overlay'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Production from '@/pages/Production'
import { OverlayHost } from '@/ui/OverlayHost'
import '@/app/context'
import { DEADLINES } from '@/state/slices/mock'
import { calc } from '@/selectors/progress'
import { chName } from '@/selectors/chapters'
import { contextItemsFor } from '@/app/registry'
import { createInitialState, getState, resetState, update } from '@/state/store'
import type { HeadingStyle } from '@/format/headings'

const mount = () => render(<><Production /><OverlayHost /></>)
const upd = (fn: Parameters<typeof update>[0]) => rtlAct(() => update(fn))
const fresh = (opts: Parameters<typeof createInitialState>[0] = {}) => resetState(createInitialState({ prefs: undefined, ...opts }))
beforeEach(() => fresh())
afterEach(() => {
  cleanup()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
})

const setDeadline = (k: 'ok' | 'tight' | 'behind') => rtlAct(() => update((d) => { d.mock.deadline = k; d.data.due = DEADLINES[k] }))

describe('Production', () => {
  it('names the delivered stage plainly and carries no manuscript panel', () => {
    mount()
    const legend = document.querySelector('.legend') as HTMLElement
    expect(within(legend).getByText(/^Delivered/)).toBeInTheDocument()
    expect(legend.textContent).not.toContain('master-checked')
    expect(screen.queryByRole('heading', { name: 'Manuscript' })).toBeNull()
  })

  it('puts the stage bar, This week and Recording check in one row above the pipeline', () => {
    mount()
    const row = document.querySelector('.pstats') as HTMLElement
    expect(row.querySelector('.side-stage')).not.toBeNull()
    expect(row.querySelector('.side-week')).not.toBeNull()
    expect(row.querySelector('.side-check')).not.toBeNull()
    const side = document.querySelector('.pgrid > .stack:last-child') as HTMLElement
    expect(side.querySelectorAll(':scope > section')).toHaveLength(2)
  })

  it('shows the verdict pill for each deadline', () => {
    const expected = { ok: 'On track', tight: 'Tight', behind: 'Behind' } as const
    for (const k of ['ok', 'tight', 'behind'] as const) {
      cleanup()
      fresh()
      setDeadline(k)
      expect(calc(getState().data).verdict).toBe(k)
      mount()
      const pill = document.querySelector('[data-vp]') as HTMLElement
      expect(pill.textContent).toContain(expected[k])
      expect(pill.className).toContain(k === 'ok' ? 'ok' : k === 'tight' ? 'warn' : 'bad')
      if (k === 'behind') expect(pill.textContent).toMatch(/needs \d+\.\d h\/day/)
    }
  })

  it('the verdict pill opens the schedule', () => {
    mount()
    fireEvent.click(document.querySelector('[data-vp]')!)
    expect(getState().ui.page).toBe('schedule')
  })

  it('shows the empty state with no manuscript', () => {
    upd((d) => { d.mock.hasManuscript = false })
    mount()
    expect(screen.getByText('Start by importing your manuscript')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set a due date' }))
    expect(getState().ui.page).toBe('schedule')
  })

  it('REAPER not running: banner, disabled Start session and Open Booth, Retry toasts', () => {
    upd((d) => { d.mock.setup = 'reaper-off' })
    mount()
    expect(screen.getAllByText('REAPER is not running.').length).toBeGreaterThan(0)
    expect(document.querySelector('.banner')!.textContent).toContain('REAPER is not running.')
    expect(screen.getByRole('button', { name: /Start session/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open Booth' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText('Still not running. Start REAPER and try again.')).toBeInTheDocument()
  })

  it('Start session opens the Booth on the chapter being recorded', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Start session/ }))
    expect(getState().ui.page).toBe('booth')
    expect(getState().ui.chapter).toBe('7')
  })

  it('Export status report opens the dialog; Export saves the report and says its file name', () => {
    mount()
    fireEvent.click(screen.getByLabelText('Export status report'))
    expect(screen.getByRole('dialog', { name: 'Export status report' })).toBeInTheDocument()
    fireEvent.click(document.querySelector('#rp-export')!)
    expect(screen.getByText(/Status report saved as .*-status-2026-09-26\.html/)).toBeInTheDocument()
  })

  it('pipeline cells open the stage for the chapter; Edit explains itself per setup', () => {
    mount()
    const row = document.querySelector('tr[data-chrow="6"]')!
    const cells = row.querySelectorAll('button.cell')
    fireEvent.click(within(row as HTMLElement).getByText('62%'))
    expect(screen.getByText(/Editing happens in REAPER\. Jumped to /)).toBeInTheDocument()
    expect(cells.length).toBeGreaterThan(3)
    fireEvent.click(row.querySelector('[data-cell="booth:6"]')!)
    expect(getState().ui.page).toBe('booth')
    expect(getState().ui.chapter).toBe('6')
  })

  it('the Edit cell in the built-in setup says the recorder does not edit', () => {
    upd((d) => { d.mock.setup = 'builtin' })
    mount()
    fireEvent.click(document.querySelector('[data-cell="edit:6"]')!)
    expect(screen.getByText(/The built-in recorder does not edit/)).toBeInTheDocument()
  })

  it('flags a changed chapter and opens the review dialog; the pipeline shows no author-query pill', () => {
    upd((d) => { d.data.chapters.find((c) => c.id === '3')!.flag = { text: 'Text changed: 12 words edited.', type: 'text' } })
    mount()
    fireEvent.click(screen.getByText('Text changed'))
    expect(screen.getByRole('dialog', { name: 'Chapters to review' })).toBeInTheDocument()
    cleanup()
    fresh()
    mount()
    expect(document.querySelector('[data-qj]')).toBeNull()
    expect(screen.queryByText(/^\d+ quer(y|ies)$/)).toBeNull()
  })

  it('lists what is next, derived from the data', () => {
    mount()
    expect(screen.getByText(/Finish recording /)).toBeInTheDocument()
    expect(screen.getByText(/Pickup session · \d+ lines/)).toBeInTheDocument()
    expect(screen.getByText(/fails 2 ACX checks/)).toBeInTheDocument()
  })

  it('the pipeline row menu offers the chapter actions and REAPER only when linked', () => {
    mount()
    const row = document.querySelector('tr[data-chrow="6"]')!
    const items = contextItemsFor(row, { clientX: 0, clientY: 0 })!
    const find = (l: string) => items.find((i) => 'l' in i && i.l === l) as { l: string; disabled?: boolean }
    expect(find('Open in Booth').disabled).toBe(false)
    expect(find('Go to this chapter in REAPER').disabled).toBe(false)
    upd((d) => { d.mock.setup = 'reaper-off' })
    const off = contextItemsFor(row, { clientX: 0, clientY: 0 })!
    expect((off.find((i) => 'l' in i && i.l === 'Open in Booth') as { disabled?: boolean }).disabled).toBe(true)
  })

  it.each<[HeadingStyle]>([['gutenberg'], ['numbered'], ['colon']])('names chapters in the %s heading style', (headingStyle) => {
    fresh({ headingStyle })
    mount()
    const { data } = getState()
    const c = data.chapters.find((x) => x.id === '7')!
    const row = document.querySelector('tr[data-chrow="7"] td')!
    expect(row.textContent).toContain(c.title)
    expect(row.textContent).toContain(chName(data, c).replace(c.title, '').trim())
    // Next up names the chapter in the manuscript's style.
    expect(screen.getByText('Finish recording ' + chName(data, c))).toBeInTheDocument()
  })

  it('renders a 40-chapter book with a row per chapter', () => {
    fresh({ chapters: 40 })
    mount()
    const { data } = getState()
    expect(document.querySelectorAll('tr[data-chrow]')).toHaveLength(data.chapters.length)
    expect(document.querySelector('.phead .sub')!.textContent).toContain('40 chapters')
  })
})
