import { act as rtlAct, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalKeys } from '@/app/keys'
import { allCommands } from '@/app/registry'
import { daw } from '@/state/daw'
import { stopEditPlay } from '@/state/commands/editing'
import { docNow, stopScript } from '@/state/commands/scriptedit'
import { createInitialState, getState, resetState, update as rawUpdate } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import EditingPage from '@/pages/Editing'
import '@/pages'

function Harness() {
  useGlobalKeys()
  return <><OverlayHost /><main id="main"><EditingPage /></main></>
}
type Opts = Parameters<typeof createInitialState>[0]
const setup = (opts: Opts = {}, ui: (u: ReturnType<typeof getState>['ui']) => void = () => {}) => {
  const s = createInitialState({ ...opts, prefs: undefined })
  s.ui.page = 'editing'
  s.ui.chapter = '5'
  ui(s.ui)
  resetState(s)
}
const update: typeof rawUpdate = (fn) => { rtlAct(() => rawUpdate(fn)) }
/** Press a key on an element; returns whether the page asked the browser not to do its own thing (scroll, activate). */
const key = (k: string, init: KeyboardEventInit = {}, el: Element = document.body): boolean => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  rtlAct(() => { el.dispatchEvent(e) })
  return e.defaultPrevented
}
const ed = () => getState().ui.editing
const passage = (id: string) => getState().data.passages.find((p) => p.id === id)!
const toasts = () => getOverlay().toasts.map((t) => t.msg)
const calls = (name: string) => daw().calls.filter((c) => c.name === name)
const mount = () => render(<Harness />)
const at = (k: string) => update((d) => { d.ui.editing.cursor = k; d.ui.editing.sel = null })
const hints = () => [...document.querySelectorAll('.keyfoot .bkey')].map((h) => h.textContent!.trim())

beforeEach(() => { setup(); daw().calls.length = 0 })
afterEach(() => {
  cleanup()
  rtlAct(() => { stopEditPlay(); stopScript() })
  vi.useRealTimers()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('Editing: key hints footer', () => {
  it('uses the shared key hints with the keys of the script editor', () => {
    mount()
    const foot = document.querySelector('.keyfoot')!
    expect(foot.getAttribute('role')).toBe('note')
    expect(hints().join('|')).toMatch(/Play from here.*Word.*Select words.*Delete words and audio.*Add FX.*Takes.*Keep take.*Hide others.*Timeline.*Clear/)
    for (const k of ['Space', 'Enter', 'Escape']) expect(foot.querySelector(`kbd[data-key="${k}"]`)).not.toBeNull()
  })
})

describe('Editing: words', () => {
  it('left and right move the cursor a word, and a click puts it where it was clicked', () => {
    mount()
    key('ArrowRight')
    expect(ed().cursor).toBe('5-1:0')
    key('ArrowRight'); key('ArrowRight')
    expect(ed().cursor).toBe('5-1:2')
    key('ArrowLeft')
    expect(ed().cursor).toBe('5-1:1')
    rtlAct(() => { fireEvent.mouseDown(document.querySelector('[data-k="5-3:15"]')!) })
    expect(ed().cursor).toBe('5-3:15')
    expect(ed().sel).toBeNull()
  })
  it('Shift with left and right selects whole words, one more or less each press, and says so', () => {
    mount()
    at('5-3:15')
    key('ArrowRight', { shiftKey: true }); key('ArrowRight', { shiftKey: true })
    // The next two words after "know," are "sir," and the first word that was said and is not in the script.
    expect(ed().sel).toEqual({ anchor: '5-3:15', head: '5-3:x0' })
    expect(document.querySelectorAll('.w.sel,.xw.sel')).toHaveLength(3)
    expect(getOverlay().announcement).toMatch(/^3 words selected, \d\d:\d\d\.\d to \d\d:\d\d\.\d/)
    key('ArrowLeft', { shiftKey: true })
    expect(ed().sel).toEqual({ anchor: '5-3:15', head: '5-3:16' })
  })
  it('a drag selects from one word to another, and a double click selects one word', () => {
    mount()
    rtlAct(() => { fireEvent.mouseDown(document.querySelector('[data-k="5-3:x0"]')!) })
    rtlAct(() => { fireEvent.mouseOver(document.querySelector('[data-k="5-3:x3"]')!, { buttons: 1 }) })
    expect(ed().sel).toEqual({ anchor: '5-3:x0', head: '5-3:x3' })
    rtlAct(() => { fireEvent.mouseDown(document.querySelector('[data-k="5-5:3"]')!, { detail: 2 }) })
    expect(ed().sel).toEqual({ anchor: '5-5:3', head: '5-5:3' })
  })
  it('Ctrl with left and right, and up and down, move by phrase (the Booth’s sentence step)', () => {
    mount()
    at('5-3:0')
    key('ArrowRight', { ctrlKey: true })
    const doc = docNow()
    const first = doc.items[doc.index.get('5-3:0')!]
    const next = doc.items[doc.index.get(ed().cursor!)!]
    expect(next.uKey).not.toBe(first.uKey)
    expect(next.pid).toBe('5-3')
    key('ArrowLeft', { ctrlKey: true })
    expect(ed().cursor).toBe('5-3:0')
    key('ArrowDown')
    expect(docNow().items[docNow().index.get(ed().cursor!)!].uKey).not.toBe(first.uKey)
  })
  it('[ and ] step through the flagged words and open the card; Enter on a flagged word opens it too', () => {
    mount()
    key(']')
    expect(ed().cursor).toBe('5-3:14')
    expect(ed().flag).toBe('5-3:14')
    expect(document.querySelector('[data-flagcard="low"]')).not.toBeNull()
    key(']')
    // The next flag is a run of extra words, selected whole.
    expect(ed().sel).toEqual({ anchor: '5-3:x0', head: '5-3:x3' })
    key('[')
    expect(ed().cursor).toBe('5-3:14')
    update((d) => { d.ui.editing.flag = null })
    key('Enter')
    expect(ed().flag).toBe('5-3:14')
  })
  it('Escape closes the card, then clears the selection', () => {
    mount()
    key(']'); key(']')
    expect(ed().flag).not.toBeNull()
    key('Escape')
    expect(ed().flag).toBeNull()
    expect(ed().sel).not.toBeNull()
    key('Escape')
    expect(ed().sel).toBeNull()
  })
})

describe('Editing: Space', () => {
  it('plays from the cursor, lights the playing word, does not scroll the page, and pauses on the word it reached', () => {
    vi.useFakeTimers()
    mount()
    at('5-3:15')
    expect(key(' ')).toBe(true)
    expect(calls('playRange')).toHaveLength(1)
    expect(ed().playT).not.toBeNull()
    const t0 = ed().playT!
    rtlAct(() => { vi.advanceTimersByTime(1500) })
    expect(ed().playT!).toBeGreaterThan(t0 + 1.3)
    expect(document.querySelector('.w.now')).not.toBeNull()
    const lit = document.querySelector('.w.now,.xw.now')!.getAttribute('data-k')
    expect(key(' ')).toBe(true)
    expect(ed().playT).toBeNull()
    expect(ed().cursor).toBe(lit)
  })
  it('plays the selection and stops at its end', () => {
    vi.useFakeTimers()
    mount()
    update((d) => { d.ui.editing.cursor = '5-3:x3'; d.ui.editing.sel = { anchor: '5-3:x0', head: '5-3:x3' } })
    key(' ')
    expect(calls('playRange').at(-1)!.args[2]).toBe('the selection')
    expect(ed().playTo).not.toBeNull()
    rtlAct(() => { vi.advanceTimersByTime(4000) })
    expect(ed().playT).toBeNull()
  })
  it('a hand scroll stops the text following the voice until the next play', () => {
    vi.useFakeTimers()
    mount()
    at('5-3:15')
    key(' ')
    expect(ed().follow).toBe(true)
    rtlAct(() => { fireEvent.wheel(document.querySelector('[data-script]')!) })
    expect(ed().follow).toBe(false)
    key(' '); key(' ')
    expect(ed().follow).toBe(true)
  })
  it('leaves Space to a button that has the focus', () => {
    mount()
    expect(key(' ', {}, document.querySelector('#striptoggle,#drawertoggle')!)).toBe(false)
    expect(calls('playRange')).toHaveLength(0)
  })
  it('says so when nothing was recorded from the cursor', () => {
    setup({}, (u) => { u.chapter = '8' })
    mount()
    at('8-1:0')
    key(' ')
    expect(toasts().at(-1)).toBe('Nothing was recorded from here.')
    expect(ed().playT).toBeNull()
  })
})

describe('Editing: Delete, M and F', () => {
  const pick = () => update((d) => { d.ui.editing.cursor = '5-3:x3'; d.ui.editing.sel = { anchor: '5-3:x0', head: '5-3:x3' } })
  it('Delete opens the confirmation and never cuts at once', () => {
    mount()
    pick()
    expect(key('Delete')).toBe(true)
    expect(document.querySelector('#cutdlg')).not.toBeNull()
    expect(getState().data.cuts).toHaveLength(0)
    expect(calls('deleteRange')).toHaveLength(0)
  })
  it('M opens the same question for muting, and F lists the DAW’s own effects at the selection', () => {
    mount()
    pick()
    key('m')
    expect(document.querySelector('.dlg')!.getAttribute('aria-label')).toBe('Mute words')
    closeTopModal()
    key('f')
    expect(document.querySelector('.pop.ctx')).not.toBeNull()
    expect([...document.querySelectorAll('.pop.ctx button.item')].map((b) => b.textContent)).toContain('Voice polish (EQ, compressor, de-esser)')
  })
  it('F with nothing selected says so, and with a DAW that cannot, gives its reason', () => {
    mount()
    key('f')
    expect(toasts().at(-1)).toBe('Select some words first.')
    update((d) => { d.mock.setup = 'audacity' })
    pick()
    key('f')
    expect(toasts().at(-1)).toBe('Turn on backups to add effects in Audacity. It changes the audio itself.')
  })
})

describe('Editing: the context menu from the keyboard', () => {
  it('Shift+F10 opens the menu on the word the cursor is on, with the same items as a right-click', () => {
    mount()
    at('5-3:35')
    const box = document.querySelector('[data-script]') as HTMLElement
    box.focus()
    key('F10', { shiftKey: true }, box)
    const menu = document.querySelector('.pop.ctx')!
    expect(menu).not.toBeNull()
    expect(menu.textContent).toContain('1 word selected')
    expect(menu.textContent).toContain('Add FX')
    expect(menu.textContent).toContain('Delete words and audio…')
  })
})

describe('Editing: takes from the text', () => {
  it('T opens the takes under the line, then moves the keys through them; Shift+T goes back', () => {
    mount()
    at('5-5:0')
    key('t')
    expect(ed().openTakes).toContain('ps5-5')
    expect(ed().take).toBe('T05-3')
    key('t')
    expect(ed().take).toBe('T05-1')
    key('t', { shiftKey: true })
    expect(ed().take).toBe('T05-3')
    key('t', { shiftKey: true })
    expect(ed().take).toBe('T05-2')
    const lane = (id: string) => document.querySelector(`[data-take="${id}"]`)!
    expect(lane('T05-2').getAttribute('aria-current')).toBe('true')
    expect(ed().passage).toBe('ps5-5')
  })
  it('Enter keeps the take the keys are on, with the usual undo offer; again, it says it is kept already', () => {
    mount()
    at('5-5:0')
    key('t'); key('t', { shiftKey: true })
    key('Enter')
    const p = passage('ps5-5')
    expect(p.kept).toBe(true)
    expect(p.takes.find((t) => t.active)!.id).toBe('T05-2')
    expect(getState().history.at(-1)).toMatchObject({ label: 'Kept T05-2; the other takes are muted', daw: true })
    const n = getState().history.length
    key('Enter')
    expect(toasts().at(-1)).toBe('T05-2 is already the kept take.')
    expect(getState().history).toHaveLength(n)
  })
  it('shows the refusal in the setup’s own words when the take cannot be kept', () => {
    mount()
    update((d) => { d.mock.setup = 'reaper-off' })
    at('5-5:0')
    key('t'); key('t')
    key('Enter')
    expect(passage('ps5-5').kept).toBe(false)
    expect(toasts().length).toBeGreaterThan(0)
  })
  it('H asks for a kept take first, then hides the others, then looks at them and puts them away', () => {
    mount()
    at('5-5:0')
    key('h')
    expect(toasts().at(-1)).toBe('Keep a take first.')
    key('t'); key('Enter')
    key('h')
    expect(passage('ps5-5').takes.filter((t) => t.hidden).map((t) => t.id)).toEqual(['T05-1', 'T05-2'])
    key('h')
    expect(ed().revealed).toContain('ps5-5')
    key('h')
    expect(ed().revealed).not.toContain('ps5-5')
  })
  it('a line with one take says so on T', () => {
    mount()
    at('5-2:0')
    update((d) => { d.ui.editing.passage = null })
    key('t')
    expect(toasts().at(-1)).toBe('This line has one take.')
  })
})

describe('Editing: the timeline and the drawer', () => {
  const width = (n: number) => Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => n })
  afterEach(() => { delete (document.documentElement as unknown as Record<string, unknown>).clientWidth })
  it('S shows and hides the timeline strip where it fits (1360 and wider)', () => {
    width(1400)
    mount()
    expect(document.querySelector('#timeline')).toBeNull()
    key('s')
    expect(ed().strip).toBe(true)
    expect(document.querySelector('#timeline')).not.toBeNull()
    key('s')
    expect(document.querySelector('#timeline')).toBeNull()
  })
  it('below that, S opens the timeline in the drawer instead, and the strip toggle is not offered', () => {
    width(1280)
    mount()
    expect(document.querySelector('#striptoggle')).toBeNull()
    key('s')
    expect(ed().drawer).toBe('timeline')
    expect(document.querySelector('#drawer #timeline')).not.toBeNull()
    key('s')
    expect(ed().drawer).toBeNull()
  })
  it('Ctrl+Shift+C opens and closes the clean-up drawer', () => {
    mount()
    key('c', { ctrlKey: true, shiftKey: true })
    expect(document.querySelector('#drawer')).not.toBeNull()
    key('c', { ctrlKey: true, shiftKey: true })
    expect(document.querySelector('#drawer')).toBeNull()
  })
})

describe('Editing: chapters and the jump menu', () => {
  it('left and right are words now; Alt with up and down step the chapter, and the chapter bar says so', () => {
    mount()
    key('ArrowRight')
    expect(getState().ui.chapter).toBe('5')
    key('ArrowDown', { altKey: true })
    expect(getState().ui.chapter).toBe('6')
    key('ArrowUp', { altKey: true })
    expect(getState().ui.chapter).toBe('5')
    expect(document.querySelector('.chapbar .ibtn[data-tip^="Next chapter"]')!.getAttribute('data-tip')).toBe('Next chapter (Alt+↓)')
  })
  it('lists the commands of the script editor with their keys while Editing is open', () => {
    mount()
    const cmds = allCommands().filter((c) => c.g === 'Editing')
    expect(cmds.find((c) => c.l === 'Next chapter')!.k).toBe('Alt+↓')
    expect(cmds.find((c) => c.l === 'Delete the selected words and audio')!.k).toBe('Del')
    expect(cmds.find((c) => c.l === 'Add FX to the selected words')!.k).toBe('F')
    expect(cmds.find((c) => c.l === 'Next flagged word')!.k).toBe(']')
    expect(cmds.find((c) => c.l === 'Show or hide the timeline')!.k).toBe('S')
    expect(cmds.find((c) => c.l === 'Keep the take the keys are on')!.k).toBe('Enter')
    expect(cmds.find((c) => c.l === 'Hide or show the other takes')!.k).toBe('H')
    update((d) => { d.ui.page = 'proof' })
    expect(allCommands().some((c) => c.g === 'Editing' && c.l === 'Next chapter')).toBe(false)
  })
})
