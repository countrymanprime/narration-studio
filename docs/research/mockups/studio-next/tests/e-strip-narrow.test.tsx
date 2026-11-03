import { act as rtlAct, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { daw } from '@/state/daw'
import { stopEditPlay } from '@/state/commands/editing'
import { clickWord, selectKeys, stopScript, togglePlay } from '@/state/commands/scriptedit'
import { createInitialState, getState, resetState, update as rawUpdate } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import EditingPage from '@/pages/Editing'
import '@/pages'

const update: typeof rawUpdate = (fn) => { rtlAct(() => rawUpdate(fn)) }
const width = (n: number) => Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => n })
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

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  rtlAct(() => { stopEditPlay(); stopScript() })
  vi.useRealTimers()
  delete (document.documentElement as unknown as Record<string, unknown>).clientWidth
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('the timeline strip (1360 and wider)', () => {
  it('is offered at 1360 and wider, off to begin with, and the toggle shows and hides it', () => {
    width(1440)
    mount()
    const btn = document.querySelector('#striptoggle') as HTMLElement
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(btn.getAttribute('data-tip')).toBe('Timeline strip (S)')
    expect(document.querySelector('#timeline')).toBeNull()
    click('#striptoggle')
    expect(document.querySelector('#timeline')).not.toBeNull()
    expect(document.querySelector('#striptoggle')!.getAttribute('aria-pressed')).toBe('true')
    click('#striptoggle')
    expect(document.querySelector('#timeline')).toBeNull()
  })
  it('follows the line the cursor is on: the audio and one lane for each take on one axis', () => {
    width(1440)
    update((d) => { d.ui.editing.strip = true })
    mount()
    expect(document.querySelectorAll('#timeline [data-lane]')).toHaveLength(0)
    rtlAct(() => clickWord('5-9:3'))
    const lanes = [...document.querySelectorAll('#timeline [data-lane]')].map((l) => l.getAttribute('data-lane'))
    expect(lanes).toEqual(['T05-6', 'T05-7', 'T05-8', 'T05-9'])
    expect(document.querySelector('#timeline [data-lane="T05-9"]')!.textContent).toContain('Active')
    expect(document.querySelector('#timeline [data-lane="T05-6"]')!.textContent).toContain('Muted')
    expect(document.querySelector('#timeline .tl-main svg.wv')).not.toBeNull()
    // A line with one take has only the audio.
    rtlAct(() => clickWord('5-2:1'))
    expect(document.querySelectorAll('#timeline [data-lane]')).toHaveLength(0)
    expect(document.querySelector('#timeline .tl-main')).not.toBeNull()
  })
  it('mirrors the selection as a band on the active take and on the audio, and shows its length', () => {
    width(1440)
    update((d) => { d.ui.editing.strip = true })
    mount()
    rtlAct(() => selectKeys(['5-9:x0']))
    expect(document.querySelector('#timeline .lns-selband')).not.toBeNull()
    expect(document.querySelector('#timeline .wv-sel')).not.toBeNull()
    expect(document.querySelector('#timeline .tl-h')!.textContent).toMatch(/\d\.\d s/)
  })
  it('dragging on the audio selects the words under it', () => {
    width(1440)
    update((d) => { d.ui.editing.strip = true })
    mount()
    rtlAct(() => clickWord('5-9:3'))
    const audio = document.querySelector('[data-tl-audio]') as HTMLElement
    audio.getBoundingClientRect = () => ({ left: 0, right: 1000, top: 0, bottom: 40, width: 1000, height: 40, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    rtlAct(() => { fireEvent.mouseDown(audio, { clientX: 800, buttons: 1 }) })
    rtlAct(() => { fireEvent.mouseMove(audio, { clientX: 960, buttons: 1 }) })
    rtlAct(() => { fireEvent.mouseUp(audio) })
    const sel = getState().ui.editing.sel
    expect(sel).not.toBeNull()
    expect(sel!.anchor).not.toBe(sel!.head)
    expect(sel!.anchor.startsWith('5-9')).toBe(true)
  })
  it('shows the playhead on the audio and every lane while the script plays', () => {
    vi.useFakeTimers()
    width(1440)
    update((d) => { d.ui.editing.strip = true })
    mount()
    rtlAct(() => clickWord('5-9:0'))
    rtlAct(() => togglePlay())
    expect(document.querySelectorAll('#timeline .lns-now').length).toBeGreaterThanOrEqual(0)
    rtlAct(() => { vi.advanceTimersByTime(600) })
    expect(getState().ui.editing.playT).not.toBeNull()
  })
  it('a lane plays its take', () => {
    width(1440)
    update((d) => { d.ui.editing.strip = true })
    mount()
    rtlAct(() => clickWord('5-9:3'))
    click('#timeline [data-lane="T05-7"] .lns-t')
    expect(daw().calls.filter((c) => c.name === 'playRange').at(-1)!.args[2]).toBe('T05-7')
  })
})

describe('narrow windows', () => {
  it('at 1280 and below the legend is short with no counts, the strip is not offered, and the drawer overlays the text', () => {
    width(1250)
    mount()
    expect(document.querySelector('#striptoggle')).toBeNull()
    expect(document.querySelector('[data-legend="extra"]')!.textContent).toBe('Extra')
    expect(document.querySelector('[data-legend="low"]')!.textContent).toBe('Low')
    click('#drawertoggle')
    expect(document.querySelector('.page.with-drawer')).toBeNull()
    expect(document.querySelector('#drawer')).not.toBeNull()
  })
  it('at 1440 the legend names each kind and counts it, and the drawer is a column beside the text', () => {
    width(1440)
    mount()
    expect(document.querySelector('[data-legend="extra"]')!.textContent).toBe('Not in the script · 6')
    expect(document.querySelector('[data-legend="miss"]')!.textContent).toBe('In the script, not read · 1')
    expect(document.querySelector('[data-legend="mis"]')!.textContent).toBe('Misread · 2')
    expect(document.querySelector('[data-legend="low"]')!.textContent).toBe('Low confidence · 4')
    click('#drawertoggle')
    expect(document.querySelector('.page.with-drawer')).not.toBeNull()
    click('#drawerclose')
    expect(document.querySelector('#drawer')).toBeNull()
  })
  it('where the strip does not fit, the timeline is a tab of the drawer', () => {
    width(1100)
    mount()
    click('#drawertoggle')
    const tabs = screen.getAllByRole('tab').map((t) => t.getAttribute('data-tab'))
    expect(tabs).toEqual(['cleanup', 'effects', 'timeline'])
    rtlAct(() => { fireEvent.click(screen.getByRole('tab', { name: 'Timeline' })) })
    expect(document.querySelector('#drawer #timeline')).not.toBeNull()
    width(1440)
    cleanup()
    mount()
    update((d) => { d.ui.editing.drawer = 'timeline' })
    // Where the strip fits there is no timeline in the drawer: it has nothing to show there.
    expect(document.querySelector('#drawer')).toBeNull()
    click('#drawertoggle')
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('data-tab'))).toEqual(['cleanup', 'effects'])
  })
  it('the floating toolbar sits under the selection with the same actions as the bar, and is gone while playing', () => {
    width(1440)
    mount()
    rtlAct(() => selectKeys(['5-3:x0', '5-3:x1']))
    const tb = document.querySelector('.seltb')
    expect(tb).not.toBeNull()
    expect([...tb!.querySelectorAll('button')].map((b) => b.getAttribute('data-tip') ?? b.textContent!.trim())).toEqual([
      'Play the selection (Space)', 'Add FX (F)', 'Mute, keep the audio (M)', 'Takes of this line (T)', 'Delete',
    ])
    update((d) => { d.ui.editing.playT = 1 })
    expect(document.querySelector('.seltb')).toBeNull()
  })
  it('the bar says what the selection can do, with the reason on a control the DAW cannot do', () => {
    width(1440)
    setup({ setup: 'audacity' })
    mount()
    rtlAct(() => selectKeys(['5-3:x0']))
    const fx = document.querySelector('#sxfx') as HTMLButtonElement
    expect(fx.disabled).toBe(true)
    expect(fx.getAttribute('data-tip')).toBe('Add FX (F) — Turn on backups to add effects in Audacity. It changes the audio itself.')
    expect(document.querySelector('#sxsel')!.textContent).toContain('1 word')
    expect(document.querySelector('#sxsel')!.textContent).toContain('Not in the script')
  })
})
