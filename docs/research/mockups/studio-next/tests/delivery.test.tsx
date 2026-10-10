import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeadingStyle } from '@/format/headings'
import { chName } from '@/selectors/chapters'
import { chapterStates } from '@/selectors/master'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import DeliveryPage from '@/pages/Delivery'
import MasterPage from '@/pages/Master'
import '@/pages'

const mount = () => render(<><OverlayHost /><DeliveryPage /></>)
const setup = (opts: Parameters<typeof createInitialState>[0] = {}) => {
  const s = createInitialState({ ...opts, prefs: undefined })
  s.ui.page = 'delivery'
  resetState(s)
}
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })
const toasts = () => getOverlay().toasts.map((t) => t.msg)
const edit = (sel: string, value: string) => rtlAct(() => {
  const i = document.querySelector<HTMLInputElement>(sel)!
  i.value = value
  fireEvent.blur(i)
})
const chooseProfile = (name: RegExp) => {
  click('#dprof')
  rtlAct(() => { fireEvent.click(screen.getByRole('menuitemradio', { name })) })
}

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('Delivery: preflight and build', () => {
  it('blocks the build while chapters fail or are not ready, and says how many', () => {
    mount()
    const { data } = getState()
    const st = chapterStates(data, data.profiles[0].limits, false)
    const bad = st.filter((x) => x.k === 'bad').length
    const wait = st.filter((x) => x.k === 'wait').length
    expect(bad).toBe(1)
    expect((document.querySelector('#dbuild') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(`${bad} failing, ${wait} not ready`)).toBeInTheDocument()
    expect(screen.getByText('Fails 2 checks')).toBeInTheDocument()
    expect(screen.getByText('Waiting on 3 pickups')).toBeInTheDocument()
    expect(screen.getByText(`${st.filter((x) => x.k === 'ok').length} of ${st.length}`)).toBeInTheDocument()
    expect(screen.getByText('Build ACX package')).toBeInTheDocument()
  })
  it('builds when everything passes, lists what was written and opens the folder', () => {
    update((d) => { d.mock.deliveryReady = true })
    mount()
    const b = document.querySelector('#dbuild') as HTMLButtonElement
    expect(b.disabled).toBe(false)
    expect(screen.getByText('Every chapter passes.')).toBeInTheDocument()
    expect(screen.queryByText('Built')).toBeNull()
    click('#dbuild')
    expect(toasts()).toContain('Built the ACX package.')
    const { data } = getState()
    expect(screen.getByText(`${data.chapters.length + 1} files`)).toBeInTheDocument()
    expect(screen.getAllByText('Written')).toHaveLength(data.chapters.length + 1)
    expect(screen.getAllByText('Retail sample').length).toBeGreaterThan(1)
    click('#dopen')
    expect(toasts()).toContain('Opened C:\\Audiobooks\\Alice\\delivery')
  })
  it('the built list goes away if the chapters stop passing', () => {
    update((d) => { d.mock.deliveryReady = true })
    mount()
    click('#dbuild')
    expect(screen.getByText('Built')).toBeInTheDocument()
    rtlAct(() => { update((d) => { d.mock.deliveryReady = false }) })
    expect(screen.queryByText('Built')).toBeNull()
  })
  it('keeps the output folder', () => {
    mount()
    edit('#dout', 'D:\\Out')
    expect(getState().ui.delivery.out).toBe('D:\\Out')
  })
  it('links each chapter to Master & QC', () => {
    mount()
    click('[data-dch="4"]')
    expect(getState().ui.page).toBe('master')
    expect(getState().ui.master.row).toBe('4')
    expect(getState().ui.chapter).toBe('4')
    update((d) => { d.ui.page = 'delivery' })
    click('#dmaster')
    expect(getState().ui.page).toBe('master')
  })
  it.each<[HeadingStyle, 12 | 40]>([['gutenberg', 12], ['numbered', 12], ['colon', 12], ['gutenberg', 40], ['numbered', 40]])(
    'names every chapter from its data (%s, %i chapters)',
    (headingStyle, chapters) => {
      setup({ headingStyle, chapters })
      mount()
      const { data } = getState()
      const rows = document.querySelectorAll('[data-dch]')
      expect(rows).toHaveLength(data.chapters.length)
      data.chapters.forEach((c, i) => expect(rows[i].textContent).toContain(chName(data, c)))
    },
  )
  it('asks for the manuscript first', () => {
    update((d) => { d.mock.hasManuscript = false })
    mount()
    expect(screen.getByText('Import manuscript')).toBeInTheDocument()
  })
})

describe('Delivery: profiles', () => {
  it('ACX is built in: its limits are read-only text', () => {
    mount()
    expect(screen.getByText('Built in')).toBeInTheDocument()
    expect(screen.getByText('-23 to -18 dB')).toBeInTheDocument()
    expect(screen.getByText('at most -3 dB')).toBeInTheDocument()
    expect(document.querySelector('input[type="number"]')).toBeNull()
    expect(document.querySelector('#pname')).toBeNull()
  })
  it('Custom has editable limits, format and name', () => {
    mount()
    chooseProfile(/Custom/)
    expect(getState().ui.delivery.profile).toBe('custom')
    expect(document.querySelectorAll('input[type="number"]')).toHaveLength(8)
    expect(screen.getAllByText('no lowest')).toHaveLength(2)
    edit('#pname', 'Studio')
    expect(getState().data.profiles[1].name).toBe('Studio')
    expect(screen.getByRole('button', { name: 'Delivery profile: Studio' })).toBeInTheDocument()
    expect(screen.getByText('Build Studio package')).toBeInTheDocument()
    edit('input[aria-label="Sample rate"]', '48 kHz')
    expect(getState().data.profiles[1].format.rate).toBe('48 kHz')
    // The built-in profile is untouched.
    expect(getState().data.profiles[0].format.rate).toBe('44.1 kHz')
    edit('#pname', '  ')
    expect(getState().data.profiles[1].name).toBe('Studio')
  })
  it('changing the profile or a limit drops the built state', () => {
    update((d) => { d.mock.deliveryReady = true })
    mount()
    click('#dbuild')
    expect(getState().ui.delivery.built).toBe(true)
    chooseProfile(/Custom/)
    expect(getState().ui.delivery.built).toBe(false)
    click('#dbuild')
    edit('input[aria-label="RMS loudness highest"]', '-19')
    expect(getState().ui.delivery.built).toBe(false)
  })
  it('a custom limit edit flips a chapter from pass to fail, on Delivery and on Master', () => {
    mount()
    expect(screen.getAllByText('Pass')).toHaveLength(3)
    chooseProfile(/Custom/)
    edit('input[aria-label="RMS loudness highest"]', '-20')
    expect(getState().data.profiles[1].limits.rms.hi).toBe(-20)
    expect(getState().data.profiles[0].limits.rms.hi).toBe(-18)
    // Chapter 1 (-19.6 dB) and chapter 2 (-19.9 dB) now fail the loudness check.
    expect(screen.getAllByText('Pass')).toHaveLength(1)
    expect(screen.getAllByText('Fails 1 check')).toHaveLength(2)
    cleanup()
    update((d) => { d.ui.page = 'master' })
    render(<><OverlayHost /><MasterPage /></>)
    expect(within(document.querySelector('tr[data-mr="1"]') as HTMLElement).getByText('Fail')).toBeInTheDocument()
    expect(within(document.querySelector('tr[data-mr="2"]') as HTMLElement).getByText('Fail')).toBeInTheDocument()
    expect(within(document.querySelector('tr[data-mr="open"]') as HTMLElement).getByText('Pass')).toBeInTheDocument()
  })
  it('ignores a limit that is not a number', () => {
    mount()
    chooseProfile(/Custom/)
    edit('input[aria-label="RMS loudness highest"]', '')
    expect(getState().data.profiles[1].limits.rms.hi).toBe(-18)
  })
  it('the active limits follow the chosen profile for the rest of the app', async () => {
    const { activeLimits } = await import('@/selectors/progress')
    mount()
    chooseProfile(/Custom/)
    edit('input[aria-label="Peak level highest"]', '-5')
    expect(activeLimits(getState().data).peak.hi).toBe(-5)
    update((d) => { d.ui.delivery.profile = 'acx' })
    expect(activeLimits(getState().data).peak.hi).toBe(-3)
  })
})
