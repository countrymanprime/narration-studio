import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contextItemsFor } from '@/app/registry'
import type { HeadingStyle } from '@/format/headings'
import { chName, chTag } from '@/selectors/chapters'
import { masterFails } from '@/selectors/master'
import { activeLimits } from '@/selectors/progress'
import { daw } from '@/state/daw'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import MasterPage from '@/pages/Master'
import '@/pages'

const mount = () => render(<><OverlayHost /><MasterPage /></>)
const setup = (opts: Parameters<typeof createInitialState>[0] = {}) => {
  const s = createInitialState({ ...opts, prefs: undefined })
  s.ui.page = 'master'
  resetState(s)
}
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })
const toasts = () => getOverlay().toasts.map((t) => t.msg)
const row = (id: string) => document.querySelector(`tr[data-mr="${id}"]`) as HTMLElement

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('Master & QC', () => {
  it.each<[HeadingStyle, 12 | 40]>([['gutenberg', 12], ['numbered', 12], ['colon', 12], ['gutenberg', 40], ['colon', 40]])(
    'labels each file with the chapter heading (%s, %i chapters)',
    (headingStyle, chapters) => {
      setup({ headingStyle, chapters })
      mount()
      const { data } = getState()
      expect(document.querySelectorAll('tr[data-mr]')).toHaveLength(6)
      for (const id of ['1', '2', '3', '4']) expect(within(row(id)).getByText(chName(data, data.chapters.find((c) => c.id === id)!))).toBeInTheDocument()
      expect(within(row('sample')).getByText('Retail sample')).toBeInTheDocument()
      // The package list names the failing chapter by its tag.
      expect(screen.getByText(chTag(data, data.chapters.find((c) => c.id === '4')!) + ' fails 2 checks')).toBeInTheDocument()
    },
  )
  it('opens on the first file that fails, and the chapter bar says so', () => {
    mount()
    expect(getState().ui.master.row).toBe('4')
    expect(row('4').getAttribute('aria-selected')).toBe('true')
    const { data } = getState()
    expect(document.querySelector('#chapsel .cl')!.textContent).toBe(chName(data, data.chapters.find((c) => c.id === '4')!))
  })
  it('chapter 4 fails two checks: the cells are red and the detail says why', () => {
    mount()
    const r = row('4')
    expect(within(r).getByText('Fail')).toBeInTheDocument()
    expect([...r.querySelectorAll('.bad-t')].map((x) => x.textContent)).toEqual(['-57.8', '0.4'])
    const { data } = getState()
    expect(masterFails(data.masterRows.find((x) => x.id === '4')!, activeLimits(data))).toEqual(['nf', 'head'])
    expect(screen.getByText(/· Why it fails/)).toBeInTheDocument()
    const fails = [...document.querySelectorAll('.pb .optrow')].filter((o) => o.querySelector('.pill.bad'))
    expect(fails).toHaveLength(2)
    expect(fails[0].textContent).toContain('Noise floor')
    expect(fails[0].textContent).toContain('limit: at most -60 dB')
    expect(fails[1].textContent).toContain('Room tone at the start')
    expect(fails[1].textContent).toContain('limit: 0.5 to 1 s')
    expect(within(row('1')).getByText('Pass')).toBeInTheDocument()
  })
  it('a waiting row says what it waits on, and its detail says it is not mastered', () => {
    mount()
    expect(within(row('3')).getByText('Waiting on 3 pickups · not mastered')).toBeInTheDocument()
    expect(within(row('3')).getByText('Waiting')).toBeInTheDocument()
    click('tr[data-mr="3"]')
    expect(getState().ui.master.row).toBe('3')
    expect(getState().ui.chapter).toBe('3')
    expect(screen.getByText(/· Not mastered/)).toBeInTheDocument()
    expect(screen.getByText('Waiting on 3 pickups.')).toBeInTheDocument()
    expect(document.querySelector('#quiet')).toBeNull()
  })
  it('a chapter with no file yet reads Not mastered yet', () => {
    mount()
    rtlAct(() => { update((d) => { d.ui.master.row = '9'; d.ui.chapter = '9' }) })
    expect(screen.getByText('Not mastered yet.')).toBeInTheDocument()
    expect(document.querySelector('tr[aria-selected="true"]')).toBeNull()
  })
  it('selecting a file moves the shared chapter; the arrow keys move between files', () => {
    mount()
    click('tr[data-mr="2"]')
    expect(getState().ui.chapter).toBe('2')
    rtlAct(() => { fireEvent.keyDown(row('2'), { key: 'ArrowDown' }) })
    expect(getState().ui.master.row).toBe('3')
    rtlAct(() => { fireEvent.keyDown(row('3'), { key: 'ArrowUp' }) })
    expect(getState().ui.master.row).toBe('2')
    click('#chapsel')
    rtlAct(() => { fireEvent.click(screen.getByRole('menuitemradio', { name: /Pool of Tears/ })) })
    expect(getState().ui.master.row).toBe('2')
  })
  it('shows book consistency and the package checks, drawn from the profile', () => {
    mount()
    expect(screen.getByText('Spread 0.8 dB across 4 files.')).toBeInTheDocument()
    expect(screen.getByText('Mono · 44.1 kHz · MP3 192 kbps CBR')).toBeInTheDocument()
    expect(screen.getByText('Every file under 120 min')).toBeInTheDocument()
    expect(screen.getByText('Retail sample 4:40 (1 to 5 min)')).toBeInTheDocument()
    expect(screen.getByText('1 failing and 10 not ready.')).toBeInTheDocument()
    expect(screen.getByText('10 chapters not ready')).toBeInTheDocument()
    expect(screen.getByText(/Delivery package · ACX/)).toBeInTheDocument()
  })
  it('counts nothing as not ready once the mock says everything passes', () => {
    update((d) => { d.mock.deliveryReady = true })
    mount()
    expect(screen.getByText('1 failing and 0 not ready.')).toBeInTheDocument()
    expect(screen.getByText('0 chapters not ready')).toBeInTheDocument()
  })
  it('uses the limits of the active profile: a custom edit flips a pass to a fail', () => {
    update((d) => {
      d.ui.delivery.profile = 'custom'
      d.data.profiles.find((p) => p.key === 'custom')!.name = 'Studio'
      d.data.profiles.find((p) => p.key === 'custom')!.limits.rms.hi = -20
    })
    mount()
    expect(within(row('1')).getByText('Fail')).toBeInTheDocument()
    expect(row('1').querySelector('.bad-t')!.textContent).toBe('-19.6')
    expect(screen.getAllByText('Studio').length).toBeGreaterThan(0)
    expect(screen.getByText('4 failing and 10 not ready.')).toBeInTheDocument()
    cleanup()
    update((d) => { d.ui.delivery.profile = 'acx' })
    mount()
    expect(within(row('1')).getByText('Pass')).toBeInTheDocument()
  })
  it('rechecks, plays and opens in REAPER through the DAW', () => {
    mount()
    click('#recheck')
    expect(toasts()).toContain('Checked 5 files again.')
    expect(daw().calls.some((c) => c.name === 'checkAgain' && c.args[0] === 5)).toBe(true)
    click('#quiet')
    click('#openr')
    expect(toasts()).toContain('Opened in REAPER')
    expect(toasts().some((m) => m.startsWith('Playing the quietest 5 s of '))).toBe(true)
    cleanup()
    update((d) => { d.mock.setup = 'reaper-off' })
    mount()
    expect((document.querySelector('#openr') as HTMLButtonElement).disabled).toBe(true)
  })
  it('opens Delivery from the profile pill and the package panel', () => {
    mount()
    click('#mprof')
    expect(getState().ui.page).toBe('delivery')
    update((d) => { d.ui.page = 'master' })
    click('#todeliv')
    expect(getState().ui.page).toBe('delivery')
  })
  it('right-click on a file offers its checks', () => {
    mount()
    const items = contextItemsFor(row('3'), { clientX: 0, clientY: 0 })!
    const labels = items.map((i) => ('l' in i ? i.l : 'label' in i ? i.label : '—'))
    expect(labels).toEqual(expect.arrayContaining(['Show the checks', 'Play the quietest 5 s', 'Open in REAPER', 'Check the files again']))
    expect((items.find((i) => 'l' in i && i.l === 'Play the quietest 5 s') as { disabled?: boolean }).disabled).toBe(true)
  })
  it('asks for the manuscript first', () => {
    update((d) => { d.mock.hasManuscript = false })
    mount()
    expect(screen.getByText('Import manuscript')).toBeInTheDocument()
  })
})
