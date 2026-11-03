import { entryOfSpeaker, speakerColourOf } from '@/selectors/speakers'
import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption } from './helpers/select'
import { useGlobalKeys } from '@/app/keys'
import { contextItemsFor } from '@/app/registry'
import type { HeadingStyle } from '@/format/headings'
import { boothUnits } from '@/selectors/booth'
import { chName } from '@/selectors/chapters'
import { WPH } from '@/selectors/progress'
import { openPickMode } from '@/state/commands/pickups'
import { go } from '@/state/commands/nav'
import { stopBoothTimers } from '@/state/commands/booth'
import { createInitialState, getState, resetState, update as rawUpdate } from '@/state/store'
import { initialPrefs } from '@/state/slices/ui'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import BoothPage from '@/pages/Booth'
import '@/pages'

function Harness() {
  useGlobalKeys()
  return <><OverlayHost /><BoothPage /></>
}
const setup = (opts: Parameters<typeof createInitialState>[0] = {}) => {
  const s = createInitialState({ ...opts, prefs: initialPrefs })
  s.ui.page = 'booth'
  resetState(s)
}
const update: typeof rawUpdate = (fn) => { rtlAct(() => rawUpdate(fn)) }
const key = (k: string, init: KeyboardEventInit = {}) => rtlAct(() => { fireEvent.keyDown(document.body, { key: k, ...init }) })
const tick = (ms: number) => rtlAct(() => { vi.advanceTimersByTime(ms) })
const units = () => boothUnits(getState().data, getState().ui.chapter).units

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  stopBoothTimers()
  vi.useRealTimers()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('Booth text', () => {
  it('lights one phrase, dims the ones read, and marks exactly one word with no trailing space', () => {
    render(<Harness />)
    update((d) => { d.ui.booth.cur = 3; d.ui.booth.wcur = 2 })
    expect(document.querySelectorAll('.bu.cur')).toHaveLength(1)
    expect(document.querySelectorAll('.bu.done')).toHaveLength(3)
    const now = document.querySelectorAll('.w.now')
    expect(now).toHaveLength(1)
    expect(now[0].textContent).toMatch(/^\S+$/)
    expect(document.querySelectorAll('.w.said')).toHaveLength(2)
    expect(document.querySelector('.bu.cur')!.querySelectorAll('.w').length).toBe(units()[3].nw)
    /* The space after the word sits outside the span. */
    expect(now[0].nextSibling?.textContent).toMatch(/^\s*$/)
  })

  it('tints Story Bible names, underlines marked words and shows notes under the paragraph', () => {
    render(<Harness />)
    expect(document.querySelectorAll('.w.bent').length).toBeGreaterThan(0)
    expect(document.querySelector<HTMLElement>('.w.bent')!.style.getPropertyValue('--ek')).toMatch(/^var\(--/)
    expect(document.querySelectorAll('.w.bm').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('.bnote').length).toBeGreaterThan(0)
  })

  it('a click puts the reading position on that word', async () => {
    render(<Harness />)
    const w = document.querySelectorAll<HTMLElement>('.bu[data-u="2"] .w')[1]
    await userEvent.click(w)
    expect(getState().ui.booth).toMatchObject({ cur: 2, wcur: 1 })
  })

  it('text size and font come from the saved choices', () => {
    update((d) => { d.ui.booth.textSize = 52; d.ui.prefs.readerFont = 'Verdana' })
    render(<Harness />)
    const b = document.querySelector<HTMLElement>('.booth')!
    expect(b.style.getPropertyValue('--tsize')).toBe('52px')
    expect(b.style.getPropertyValue('--bf')).toContain('Verdana')
  })

  it('the text popover writes the reader font and the Booth size (24 to 72 in steps of 4)', async () => {
    render(<Harness />)
    await userEvent.click(document.getElementById('btext')!)
    const r = document.getElementById('bt-s') as HTMLInputElement
    expect([r.min, r.max, r.step]).toEqual(['24', '72', '4'])
    fireEvent.change(r, { target: { value: '60' } })
    expect(getState().ui.booth.textSize).toBe(60)
    await chooseOption(document.getElementById('bt-f')!, 'Verdana')
    expect(getState().ui.prefs.readerFont).toBe('Verdana')
  })

  it.each<[HeadingStyle, 12 | 40]>([['gutenberg', 12], ['numbered', 12], ['colon', 12], ['colon', 40], ['numbered', 40]])(
    'names the chapter in the manuscript style (%s, %i)', (headingStyle, chapters) => {
      setup({ headingStyle, chapters })
      update((d) => { d.ui.chapter = '5' })
      render(<Harness />)
      const { data } = getState()
      expect(document.querySelector('#chapsel .cl')!.textContent).toBe(chName(data, data.chapters.find((c) => c.id === '5')!))
      expect(document.getElementById('bprog')!.textContent).toMatch(/^¶ 1 of 16 · /)
    })

  it('shows a placeholder for a chapter with no text yet', () => {
    update((d) => { d.ui.chapter = '10' })
    render(<Harness />)
    expect(document.getElementById('tele')!.textContent?.trim()).toBe('Chapter text appears here.')
  })

  it('asks for a manuscript when there is none', () => {
    update((d) => { d.mock.hasManuscript = false })
    render(<Harness />)
    expect(screen.getByText('Import manuscript')).toBeInTheDocument()
  })
})

describe('Speakers', () => {
  it('a suggested chip is dashed; confirming from its menu writes the shared speaker', async () => {
    render(<Harness />)
    const chip = document.querySelector<HTMLElement>('.bchip.sug:not([data-spk="?"])')!
    const k = chip.dataset.pk2!
    const spk = chip.dataset.spk!
    await userEvent.click(chip)
    await userEvent.click(screen.getByRole('option', { name: new RegExp('Confirm “' + spk + '”') }))
    expect(getState().data.confirmedSpeakers[k]).toBe(spk)
    expect(document.querySelector(`[data-pk2="${k}"]`)!.classList.contains('sug')).toBe(false)
  })

  it('the menu can set another speaker, and has no Narrator option', async () => {
    render(<Harness />)
    const chip = document.querySelector<HTMLElement>('.bchip.sug')!
    await userEvent.click(chip)
    expect(screen.queryByRole('option', { name: /narrator/i })).toBeNull()
    await userEvent.type(screen.getByLabelText('Search speakers'), 'queen')
    await userEvent.click(screen.getAllByRole('option', { name: /^Queen/ })[0])
    expect(getState().data.confirmedSpeakers[chip.dataset.pk2!]).toBe('Queen')
  })

  it('chips are coloured with their speaker\'s colour and shown uppercase by CSS', () => {
    render(<Harness />)
    const chip = document.querySelector<HTMLElement>('.bchip[data-spk]:not([data-spk="?"])')!
    const colour = speakerColourOf(entryOfSpeaker(getState().data, chip.dataset.spk!)!)
    expect(chip.style.getPropertyValue('--spk-c')).toBe('var(--' + colour + ')')
    expect(chip.textContent).toBe(chip.dataset.spk)
  })
})

describe('Following the voice', () => {
  it('advances at the standard rate while recording', () => {
    vi.useFakeTimers()
    render(<Harness />)
    fireEvent.click(document.getElementById('brec')!)
    expect(getState().ui.booth.rec).toBe(true)
    tick(10_000)
    const us = units()
    const { cur, wcur } = getState().ui.booth
    const read = us.slice(0, cur).reduce((a, u) => a + u.nw, 0) + wcur
    expect(read).toBe(Math.floor((10 * WPH) / 3600))
    expect(document.querySelectorAll('.w.now')).toHaveLength(1)
    expect(document.getElementById('btimer')!.textContent).toBe('00:10')
    expect(document.getElementById('bstate')!.textContent!.trim()).toBe('REC')
  })

  it('stops by itself at the end of the chapter', () => {
    vi.useFakeTimers()
    update((d) => { d.ui.booth.cur = units().length - 1; d.ui.booth.wcur = units().at(-1)!.nw - 3 })
    render(<Harness />)
    fireEvent.click(document.getElementById('brec')!)
    tick(5_000)
    expect(getState().ui.booth.rec).toBe(false)
    expect(screen.getByText('Take saved')).toBeInTheDocument()
  })

  it('REAPER off: Record is disabled and Space does nothing', () => {
    update((d) => { d.mock.setup = 'reaper-off' })
    render(<Harness />)
    expect(document.getElementById('brec')).toBeDisabled()
    expect(screen.getByText('REAPER is not running.')).toBeInTheDocument()
    expect(document.getElementById('bsetup')!.textContent).toBe('REAPER')
    expect(document.getElementById('bsetup')!.title).toContain('REAPER is not running')
    key(' ')
    expect(getState().ui.booth.rec).toBe(false)
  })

  it('if the Booth goes away mid-take (the safety net; leaving by the app asks first) the take is stopped and the timers cleared', () => {
    vi.useFakeTimers()
    const { unmount } = render(<Harness />)
    key(' ')
    expect(getState().ui.booth.rec).toBe(true)
    tick(3_000)
    unmount()
    expect(getState().ui.booth).toMatchObject({ rec: false, take: 4, recAll: 3 })
    expect(screen.queryByText('Take saved')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    const at = { ...getState().ui.booth }
    tick(5_000)
    expect(getState().ui.booth).toEqual(at)
  })

  it('the setup chip goes to Settings; during a take it asks to stop first', () => {
    render(<Harness />)
    fireEvent.click(document.getElementById('bsetup')!)
    expect(getState().ui.page).toBe('settings')
    rtlAct(() => go('booth'))
    key(' ')
    fireEvent.click(document.getElementById('bsetup')!)
    expect(getState().ui.page).toBe('booth')
    expect(getState().ui.booth.rec).toBe(true)
    expect(screen.getByText('Stop recording?')).toBeInTheDocument()
  })

  it('shows the recorder by name in the chip; its status and take are in the tooltip', () => {
    render(<Harness />)
    expect(document.getElementById('bsetup')!.textContent).toBe('REAPER')
    expect(document.getElementById('bsetup')!.title).toContain('take 3')
    update((d) => { d.mock.setup = 'builtin' })
    expect(document.getElementById('bsetup')!.textContent).toBe('Built-in recorder')
  })
})

describe('Booth keys', () => {
  it('Space records and stops', () => {
    render(<Harness />)
    key(' ')
    expect(getState().ui.booth.rec).toBe(true)
    key(' ')
    expect(getState().ui.booth.rec).toBe(false)
    expect(screen.getByText('Take saved')).toBeInTheDocument()
  })

  it('down is the next phrase; up and Backspace go back; left and right step a word', () => {
    render(<Harness />)
    key('ArrowDown'); key('ArrowDown')
    expect(getState().ui.booth).toMatchObject({ cur: 2, wcur: 0 })
    key('ArrowRight'); key('ArrowRight')
    expect(getState().ui.booth.wcur).toBe(2)
    key('ArrowLeft')
    expect(getState().ui.booth.wcur).toBe(1)
    key('ArrowUp')
    expect(getState().ui.booth).toMatchObject({ cur: 1, wcur: 0 })
    key('Backspace')
    expect(getState().ui.booth.cur).toBe(0)
    key('ArrowUp')
    expect(getState().ui.booth.cur).toBe(0)
  })

  it('a word step past the end of a phrase starts the next one, and back again', () => {
    render(<Harness />)
    const n = units()[0].nw
    for (let i = 0; i < n; i++) key('ArrowRight')
    expect(getState().ui.booth).toMatchObject({ cur: 1, wcur: 0 })
    key('ArrowLeft')
    expect(getState().ui.booth).toMatchObject({ cur: 0, wcur: n - 1 })
  })

  it('R punches and rolls only while recording, from the current phrase when none was chosen', () => {
    render(<Harness />)
    key('ArrowDown'); key('ArrowDown')
    key('r')
    expect(screen.getByText('Start recording first.')).toBeInTheDocument()
    expect(getState().ui.booth.punches).toHaveLength(0)
    key(' ')
    key('ArrowDown')
    key('r')
    expect(getState().ui.booth.punches).toEqual([{ pi: units()[3].pi, at: '00:00' }])
    /* The current phrase, never the one before it. */
    expect(getState().ui.booth.cur).toBe(3)
    expect(within(document.getElementById('brail')!).getByText('Rolled from ¶ ' + (units()[3].pi + 1) + ' · 00:00')).toBeInTheDocument()
  })

  it('R rolls again from the phrase chosen with Start from here', () => {
    render(<Harness />)
    const items = contextItemsFor(document.querySelector('.bu[data-u="1"] .w')!, { clientX: 0, clientY: 0 })!
    const start = items.find((i) => 'l' in i && i.l === 'Start from here') as { fn: () => void }
    rtlAct(() => start.fn())
    expect(getState().ui.booth).toMatchObject({ punchAt: 1, cur: 1, wcur: 0, rec: false })
    key(' ')
    key('ArrowDown'); key('ArrowDown'); key('ArrowDown')
    key('r')
    expect(getState().ui.booth).toMatchObject({ cur: 1, wcur: 0, punchAt: 1 })
    expect(getState().ui.booth.punches).toEqual([{ pi: units()[1].pi, at: '00:00' }])
    expect(document.querySelector('.bu.pa')!.getAttribute('data-u')).toBe('1')
  })

  it('Start from here while recording punches in: the take keeps rolling from that phrase', () => {
    vi.useFakeTimers()
    render(<Harness />)
    key(' ')
    tick(2_000)
    key('ArrowDown'); key('ArrowDown')
    const items = contextItemsFor(document.querySelector('.bu[data-u="0"] .w')!, { clientX: 0, clientY: 0 })!
    rtlAct(() => (items.find((i) => 'l' in i && i.l === 'Start from here') as { fn: () => void }).fn())
    expect(getState().ui.booth).toMatchObject({ rec: true, cur: 0, wcur: 0, punchAt: 0, paused: false })
    expect(getState().ui.booth.punches).toEqual([{ pi: units()[0].pi, at: '00:02' }])
  })

  it('there are no F or P bindings: nothing is flagged or added to the pickups from the Booth', () => {
    render(<Harness />)
    key('f'); key('p')
    expect(getState().ui.booth).not.toHaveProperty('flags')
    expect(getState().data.pickups.filter((y) => y.src === 'you')).toHaveLength(0)
    expect(screen.queryByText(/Flagged for edit/)).toBeNull()
    expect(screen.queryByText(/Marked as a pickup/)).toBeNull()
  })

  it('Page Down and Page Up scroll the view without moving the reading position', () => {
    sized()
    render(<Harness />)
    key('PageDown')
    expect(getState().ui.booth).toMatchObject({ cur: 0, browse: true })
    key('PageUp')
    expect(getState().ui.booth).toMatchObject({ cur: 0, browse: false })
  })

  it('+ and - change the text size within 24 to 72', () => {
    render(<Harness />)
    key('+')
    expect(getState().ui.booth.textSize).toBe(44)
    key('=')
    expect(getState().ui.booth.textSize).toBe(48)
    for (let i = 0; i < 20; i++) key('-')
    expect(getState().ui.booth.textSize).toBe(24)
    for (let i = 0; i < 20; i++) key('+')
    expect(getState().ui.booth.textSize).toBe(72)
  })

  it('Escape exits to Script; a popover closes first; during a take it asks "Stop recording?" instead of stopping', async () => {
    render(<Harness />)
    await userEvent.click(document.getElementById('btext')!)
    key('Escape')
    expect(document.querySelector('.pop')).toBeNull()
    expect(getState().ui.page).toBe('booth')
    key(' ')
    key('Escape')
    expect(getState().ui.page).toBe('booth')
    expect(getState().ui.booth.rec).toBe(true)
    expect(screen.getByText('Stop recording?')).toBeInTheDocument()
  })

  it('Escape with no take running exits to Script', () => {
    render(<Harness />)
    key('Escape')
    expect(getState().ui.page).toBe('script')
  })

  it('ignores keys while typing and with Ctrl held', () => {
    render(<Harness />)
    const inp = document.createElement('input')
    document.body.append(inp)
    inp.focus()
    rtlAct(() => { fireEvent.keyDown(inp, { key: 'ArrowDown' }) })
    expect(getState().ui.booth.cur).toBe(0)
    key('ArrowDown', { ctrlKey: true })
    expect(getState().ui.booth.cur).toBe(0)
    inp.remove()
  })

  it('N and Shift+N only work in a pickup session', () => {
    render(<Harness />)
    key('n')
    expect(getState().ui.pickups.at).toBeNull()
  })

  it('right-click offers the phrase, take and text commands', () => {
    render(<Harness />)
    const items = contextItemsFor(document.body, { clientX: 0, clientY: 0 })!
    const labels = items.map((i) => ('l' in i ? i.l : ''))
    expect(labels).toEqual(expect.arrayContaining(['Next phrase', 'Back one phrase', 'Punch and roll', 'Larger text', 'Smaller text', 'Exit Booth']))
    expect(labels).not.toContain('Mirror text')
    expect(labels).not.toContain('Flag for edit')
    expect(labels).not.toContain('Mark as a pickup')
    /* Start from here needs a phrase under the pointer. */
    expect(labels).not.toContain('Start from here')
    expect(contextItemsFor(document.querySelector('.bu .w')!, { clientX: 0, clientY: 0 })!.map((i) => ('l' in i ? i.l : ''))[0]).toBe('Start from here')
  })

  it('there is no mirror text', () => {
    render(<Harness />)
    expect(document.querySelector('.mir')).toBeNull()
    key('m')
    expect(document.querySelector('.mir')).toBeNull()
  })
})

describe('Pickup session', () => {
  const start = (ids: string[]) => {
    rtlAct(() => openPickMode(ids))
  }

  it('marks the lines with a bar, lists them in the side panel and counts the open ones', () => {
    start(['c3a', 'c3b', 'c3c'])
    render(<Harness />)
    expect(getState().ui.chapter).toBe('3')
    expect(document.querySelectorAll('p.pkp')).toHaveLength(3)
    expect(screen.getAllByText('Pickups · 3 open')).toHaveLength(2)
    expect(document.querySelectorAll('.pkrow')).toHaveLength(3)
    expect(document.querySelector('.pkrow.on')!.getAttribute('data-pj')).toBe('c3a')
    expect(screen.getByText(/Next pickup/)).toBeInTheDocument()
  })

  it('N goes to the next pickup (even in another chapter), Shift+N back, and wraps', () => {
    start(['c3a', 'c3c', 'p1'])
    render(<Harness />)
    key('n')
    expect(getState().ui.pickups.at).toBe('c3c')
    expect(getState().ui.booth.cur).toBe(units().findIndex((u) => u.pid === '3-4'))
    key('n')
    expect(getState().ui.pickups.at).toBe('p1')
    expect(getState().ui.chapter).toBe('5')
    key('n')
    expect(getState().ui.pickups.at).toBe('c3a')
    key('n', { shiftKey: true })
    expect(getState().ui.pickups.at).toBe('p1')
  })

  it('clicking a pickup in the side panel jumps to it; not while recording', async () => {
    start(['c3a', 'c3c'])
    render(<Harness />)
    await userEvent.click(document.querySelector('[data-pj="c3c"]')!)
    expect(getState().ui.pickups.at).toBe('c3c')
    key(' ')
    await userEvent.click(document.querySelector('[data-pj="c3a"]')!)
    expect(getState().ui.pickups.at).toBe('c3c')
    expect(screen.getByText('Stop recording first.')).toBeInTheDocument()
  })

  it('a take that ran over a line marks it recorded, and the toast can undo that', () => {
    vi.useFakeTimers()
    start(['c3a', 'c3b', 'c3c'])
    render(<Harness />)
    key(' ')
    key('ArrowDown'); key('ArrowDown')
    const c = getState().ui.booth.cur
    key(' ')
    const idx = (pid: string) => units().findIndex((u) => u.pid === pid)
    const expected = [['c3a', '3-1'], ['c3b', '3-2'], ['c3c', '3-4']].filter(([, pid]) => idx(pid) <= c).map(([id]) => id)
    expect(expected.length).toBeGreaterThan(0)
    expect(getState().data.pickDone).toEqual(expected)
    expect(getState().history.at(-1)?.label).toBe(expected.length + ' ' + (expected.length > 1 ? 'pickups' : 'pickup') + ' marked recorded')
    expect(document.querySelectorAll('.pkrow.done')).toHaveLength(expected.length)
    fireEvent.click(within(document.getElementById('toasts')!).getByRole('button', { name: 'Undo' }))
    expect(getState().data.pickDone).toEqual([])
  })

  it('a take that stopped before the line leaves it open', () => {
    start(['c3c'])
    update((d) => { d.ui.booth.cur = 0 })
    render(<Harness />)
    key(' ')
    key(' ')
    expect(getState().data.pickDone).toEqual([])
    expect(screen.getByText('Take saved')).toBeInTheDocument()
  })

  it('leaving mid-take marks recorded lines quietly', () => {
    start(['c3a'])
    const { unmount } = render(<Harness />)
    key(' ')
    unmount()
    expect(getState().data.pickDone).toEqual(['c3a'])
    expect(getState().history).toHaveLength(0)
  })

  it('exit goes back to Pickups; entering the Booth any other way ends the session', () => {
    start(['c3a'])
    render(<Harness />)
    key('Escape')
    expect(getState().ui.page).toBe('pickups')
    go('booth')
    expect(getState().ui.pickups).toMatchObject({ mode: false, lines: [] })
  })

  it('the pickup list is empty outside a session', () => {
    render(<Harness />)
    expect(document.querySelectorAll('.pkrow')).toHaveLength(0)
    expect(document.querySelector('p.pkp')).toBeNull()
  })
})

describe('Side panel and top bar', () => {
  it('shows the voices nearby with their Story Bible voice note, coming-up words and the session numbers', () => {
    update((d) => { d.ui.booth.cur = 5 })
    render(<Harness />)
    const rail = document.getElementById('brail')!
    for (const t of ['Last punch', 'Voices in this scene', 'Coming up', 'This session']) expect(within(rail).getByText(t)).toBeInTheDocument()
    expect(within(rail).getByText('No punches yet')).toBeInTheDocument()
    expect(within(rail).getByText(/0 punches/)).toBeInTheDocument()
    expect(within(rail).queryByText(/flag|pickups/)).toBeNull()
    expect(rail.querySelectorAll('.brow').length).toBeGreaterThan(0)
  })

  it('the side panel can be hidden', async () => {
    render(<Harness />)
    await userEvent.click(document.getElementById('brailbtn')!)
    expect(document.querySelector('.bmain')!.classList.contains('norail')).toBe(true)
  })

  it('levels menu (mic and levels): REAPER says where the mic is chosen; built-in offers a choice; off disables levels', async () => {
    render(<Harness />)
    await userEvent.click(document.getElementById('blevels')!)
    expect(screen.getByText('Chosen in REAPER')).toBeInTheDocument()
    expect(document.getElementById('amic')).toBeNull()
    closePop()
    update((d) => { d.mock.setup = 'builtin' })
    await userEvent.click(document.getElementById('blevels')!)
    await chooseOption(document.getElementById('amic')!, 'USB microphone')
    expect(getState().ui.booth.mic).toBe('USB microphone')
    closePop()
    update((d) => { d.mock.setup = 'reaper-off' })
    await userEvent.click(document.getElementById('blevels')!)
    expect(screen.getByText('REAPER is not running')).toBeInTheDocument()
    expect(document.getElementById('ain')).toBeDisabled()
    expect(document.getElementById('aout')).toBeDisabled()
  })

  it('the chapter cannot change during a take', async () => {
    render(<Harness />)
    key(' ')
    await userEvent.click(screen.getByRole('button', { name: /Next chapter/ }))
    expect(getState().ui.chapter).toBe('8')
    expect(screen.getByText('Stop recording first.')).toBeInTheDocument()
  })
})

describe('Header and footer', () => {
  it('has no Ready chip, and shows REC only while recording', () => {
    render(<Harness />)
    expect(screen.queryByText('READY')).toBeNull()
    expect(document.getElementById('bstate')).toBeNull()
    key(' ')
    expect(document.getElementById('bstate')!.textContent!.trim()).toBe('REC')
    key(' ')
    expect(document.getElementById('bstate')).toBeNull()
  })

  it('has no exit button on top; Esc Exit is a key reminder on the footer\'s own row', () => {
    render(<Harness />)
    expect(document.getElementById('bx')).toBeNull()
    expect(document.querySelector('.btop')!.querySelector('[aria-label*="Exit"]')).toBeNull()
    const keys = document.getElementById('bkeys')!
    expect(keys.closest('.bfoot')).not.toBeNull()
    expect(within(keys).getByText('Esc')).toBeInTheDocument()
    expect(within(keys).getByText(/Exit/)).toBeInTheDocument()
    expect(within(keys).queryByText('F')).toBeNull()
    expect(within(keys).queryByText('P')).toBeNull()
    /* Record, the timer and Levels are a row of their own above the reminders. */
    expect(document.querySelector('.bfoot-main')!.contains(document.getElementById('brec'))).toBe(true)
    expect(keys.contains(document.getElementById('brec'))).toBe(false)
  })
})

describe('Side panel drawer', () => {
  afterEach(() => document.body.classList.remove('md'))

  it('at 1280 and below it starts closed, the toggle opens and closes it, and Esc closes it before exiting', async () => {
    document.body.classList.add('md')
    render(<Harness />)
    const main = document.querySelector('.bmain')!
    expect(main.classList.contains('norail')).toBe(true)
    await userEvent.click(document.getElementById('brailbtn')!)
    expect(main.classList.contains('norail')).toBe(false)
    expect(document.getElementById('brailbtn')).toHaveAttribute('aria-pressed', 'true')
    key('Escape')
    expect(main.classList.contains('norail')).toBe(true)
    expect(getState().ui.page).toBe('booth')
    key('Escape')
    expect(getState().ui.page).toBe('script')
  })

  it('in the drawer layout a click outside the panel closes it, but a click inside, or on the toggle, does not', async () => {
    document.body.classList.add('md')
    render(<Harness />)
    const main = document.querySelector('.bmain')!
    await userEvent.click(document.getElementById('brailbtn')!)
    expect(main.classList.contains('norail')).toBe(false)
    await userEvent.click(document.getElementById('brail')!)
    expect(main.classList.contains('norail')).toBe(false)
    await userEvent.click(document.querySelector<HTMLElement>('.bu[data-u="2"] .w')!)
    expect(main.classList.contains('norail')).toBe(true)
  })

  it('above 1280 clicking the text does not close the inline panel', async () => {
    render(<Harness />)
    await userEvent.click(document.querySelector<HTMLElement>('.bu[data-u="2"] .w')!)
    expect(document.querySelector('.bmain')!.classList.contains('norail')).toBe(false)
  })

  it('above 1280 it stays inline and open, and Esc exits', () => {
    render(<Harness />)
    expect(document.querySelector('.bmain')!.classList.contains('norail')).toBe(false)
    key('Escape')
    expect(getState().ui.page).toBe('script')
  })
})

describe('Reference', () => {
  it('clicking a Story Bible name opens the side panel on that entry, read-only, and a plain word clears it', async () => {
    document.body.classList.add('md')
    render(<Harness />)
    expect(document.getElementById('bref')).toBeNull()
    const w = document.querySelector<HTMLElement>('.w.bent')!
    const entry = getState().data.bible.find((e) => e.id === w.dataset.ent)!
    await userEvent.click(w)
    expect(document.querySelector('.bmain')!.classList.contains('norail')).toBe(false)
    const ref = document.getElementById('bref')!
    expect(ref.compareDocumentPosition(document.querySelector('#brail .bl:not(.bref .bl)')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(ref).getByText(entry.name)).toBeInTheDocument()
    expect(within(ref).getByText(entry.kind)).toBeInTheDocument()
    if (entry.sum) expect(within(ref).getByText(entry.sum)).toBeInTheDocument()
    expect(ref.querySelector('input,textarea')).toBeNull()
    /* The click still moves the reading position, and the sections below stay. */
    expect(getState().ui.booth.cur).toBe(+w.closest<HTMLElement>('.bu')!.dataset.u!)
    expect(within(document.getElementById('brail')!).getByText('Last punch')).toBeInTheDocument()
    await userEvent.click(within(ref).getByRole('button', { name: 'Open in Story Bible' }))
    expect(getState().ui.page).toBe('bible')
    expect(getState().ui.bible.sel).toBe(entry.id)
    document.body.classList.remove('md')
  })

  it('a Character shows how they talk and how each name is said', async () => {
    render(<Harness />)
    const chars = getState().data.bible.filter((e) => e.kind === 'Character' && e.voice)
    const w = [...document.querySelectorAll<HTMLElement>('.w.bent')].find((x) => chars.some((c) => c.id === x.dataset.ent))!
    const entry = chars.find((c) => c.id === w.dataset.ent)!
    await userEvent.click(w)
    const ref = document.getElementById('bref')!
    expect(within(ref).getByText('How they talk')).toBeInTheDocument()
    expect(within(ref).getByText(entry.voice)).toBeInTheDocument()
    entry.aka.forEach((a) => expect(within(ref).getByText(a)).toBeInTheDocument())
  })

  it('clicking a marked word shows the note and its thread', async () => {
    render(<Harness />)
    const w = document.querySelector<HTMLElement>('.w.bm[data-ann]')!
    const ann = getState().data.annotations.find((a) => a.id === w.dataset.ann)!
    await userEvent.click(w)
    const ref = document.getElementById('bref')!
    if (ann.text) expect(within(ref).getByText(ann.text)).toBeInTheDocument()
    expect(ref.textContent).toContain(ann.q)
  })

  it('a note under a paragraph opens its text, and clicking empty space or a plain word clears the reference', async () => {
    render(<Harness />)
    const note = document.querySelector<HTMLElement>('.bnote')!
    await userEvent.click(note)
    expect(document.getElementById('bref')).not.toBeNull()
    await userEvent.click(document.getElementById('sa')!)
    expect(document.getElementById('bref')).toBeNull()
    await userEvent.click(note)
    const plain = document.querySelector<HTMLElement>('.w:not(.bent):not(.bm)')!
    await userEvent.click(plain)
    expect(document.getElementById('bref')).toBeNull()
    expect(getState().ui.booth.cur).toBe(+plain.closest<HTMLElement>('.bu')!.dataset.u!)
  })
})

describe('Menus hold the take', () => {
  const rightClick = () => rtlAct(() => { fireEvent.contextMenu(document.querySelector('.bu .w')!, { clientX: 20, clientY: 20 }) })

  it('opening a menu while recording pauses the take; closing it without choosing resumes', () => {
    vi.useFakeTimers()
    render(<Harness />)
    key(' ')
    tick(3_000)
    const at = { ...getState().ui.booth }
    rightClick()
    expect(getOverlay().ctx).not.toBeNull()
    expect(getState().ui.booth.paused).toBe(true)
    expect(document.getElementById('bstate')!.textContent).toMatch(/paused/)
    tick(5_000)
    expect(getState().ui.booth).toMatchObject({ recSec: at.recSec, cur: at.cur, wcur: at.wcur })
    key('Escape')
    expect(getState().ui.booth.paused).toBe(false)
    expect(getState().ui.page).toBe('booth')
    tick(2_000)
    expect(getState().ui.booth.recSec).toBe(at.recSec + 2)
  })

  it('an outside click resumes too', () => {
    vi.useFakeTimers()
    render(<Harness />)
    key(' ')
    rightClick()
    expect(getState().ui.booth.paused).toBe(true)
    rtlAct(() => { fireEvent.mouseDown(document.body) })
    expect(getState().ui.booth.paused).toBe(false)
  })

  it('choosing Start from here resumes and rolls from the chosen phrase', async () => {
    vi.useFakeTimers()
    render(<Harness />)
    key(' ')
    tick(1_000)
    key('ArrowDown'); key('ArrowDown')
    rightClick()
    await rtlAct(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /Start from here/ })) })
    expect(getState().ui.booth).toMatchObject({ paused: false, rec: true, cur: 0, punchAt: 0 })
  })

  it('a menu opened when not recording does not start anything', () => {
    render(<Harness />)
    rightClick()
    key('Escape')
    expect(getState().ui.booth).toMatchObject({ rec: false, paused: false })
  })
})

/** jsdom has no layout: give the reader a box tall enough to scroll in. */
function sized(): void {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(5000)
}

describe('Scrolling', () => {
  const wheel = (dy: number) => rtlAct(() => { fireEvent.wheel(document.getElementById('sa')!, { deltaY: dy }) })

  it('the wheel scrolls by the pixels it is given, with no easing, and never moves the reading position', () => {
    sized()
    render(<Harness />)
    const tele = document.getElementById('tele')!
    const y0 = tele.style.transform
    wheel(30)
    expect(getState().ui.booth).toMatchObject({ cur: 0, browse: true })
    expect(tele.style.transition).toBe('none')
    const y1 = parseFloat(/-?[\d.]+(?=px)/.exec(tele.style.transform)![0])
    wheel(30)
    const y2 = parseFloat(/-?[\d.]+(?=px)/.exec(tele.style.transform)![0])
    expect(y1 - y2).toBeCloseTo(30)
    expect(y0).not.toBe(tele.style.transform)
    wheel(-60)
    expect(getState().ui.booth).toMatchObject({ cur: 0, browse: false })
  })

  it('starting a take brings the view back to the reading position', () => {
    sized()
    render(<Harness />)
    wheel(100)
    expect(getState().ui.booth.browse).toBe(true)
    key(' ')
    expect(getState().ui.booth).toMatchObject({ rec: true, cur: 0, browse: false })
  })

  it('choosing another spot to start from moves the reading position and the view', async () => {
    render(<Harness />)
    wheel(100)
    await userEvent.click(document.querySelectorAll<HTMLElement>('.bu[data-u="3"] .w')[0])
    expect(getState().ui.booth).toMatchObject({ cur: 3, browse: false })
  })

  it('the key reminders are centred, show arrow icons (named for screen readers) for movement and no backspace', () => {
    render(<Harness />)
    const keys = document.getElementById('bkeys')!
    expect(getComputedStyle(keys).justifyContent).toBeDefined()
    expect(keys.querySelector('kbd[data-key="ArrowUp"] svg')).not.toBeNull()
    expect(keys.querySelector('kbd[data-key="ArrowDown"] .sr')!.textContent).toBe('Down arrow')
    expect(keys.textContent).not.toContain('⌫')
    expect(keys.querySelector('kbd[data-key="Backspace"]')).toBeNull()
  })

  it('a click on a word still sets the reading position', async () => {
    render(<Harness />)
    wheel(100)
    await userEvent.click(document.querySelectorAll<HTMLElement>('.bu[data-u="3"] .w')[0])
    expect(getState().ui.booth).toMatchObject({ cur: 3, wcur: 0 })
  })
})

describe('Record from here', () => {
  it('opens the Booth on the sentence and word holding the selection start, marked as the place to start from', async () => {
    const { recordFromHere } = await import('@/state/commands/booth')
    const { boothUnits } = await import('@/selectors/booth')
    const s = getState()
    const { units, paras } = boothUnits(s.data, s.ui.chapter)
    const target = units[Math.min(2, units.length - 1)]
    const para = paras[target.pi]
    const off = target.s + target.t.indexOf(' ') + 1
    rtlAct(() => recordFromHere(para.id, off))
    const b = getState().ui
    expect(b.page).toBe('booth')
    expect(b.chapter).toBe(para.chapterId)
    expect(b.booth.punchAt).toBe(units.indexOf(target))
    expect(b.booth).toMatchObject({ cur: units.indexOf(target), wcur: 1, browse: false })
  })
})
