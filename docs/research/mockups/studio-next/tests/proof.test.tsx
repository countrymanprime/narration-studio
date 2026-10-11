import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { chooseOption } from './helpers/select'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { modals } from '@/app/modals'
import { contextItemsFor, keyHandlersFor } from '@/app/registry'
import type { HeadingStyle } from '@/format/headings'
import { chName } from '@/selectors/chapters'
import { WAVE_TOTAL, stripIsDense, visibleRows } from '@/selectors/proof'
import { daw } from '@/state/daw'
import { dragWindow, releaseWindow, selectNote, viewOf } from '@/state/commands/proof'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { clusterPins } from '@/pages/proof/Wave'
import { Markup } from '@/ui/Markup'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import ProofPage from '@/pages/Proof'
import '@/pages'

const mount = () => render(<><OverlayHost /><ProofPage /></>)
const setup = (opts: Parameters<typeof createInitialState>[0] = {}, ui: (u: ReturnType<typeof getState>['ui']) => void = () => {}) => {
  const s = createInitialState({ ...opts, prefs: undefined })
  s.ui.page = 'proof'
  ui(s.ui)
  resetState(s)
}
/** Chapter view of chapter 5, where the fixture's notes are. */
const chapter5 = (u: ReturnType<typeof getState>['ui']) => { u.proof = { ...u.proof, scope: 'chapter' }; u.chapter = '5' }
const note = (id: number) => getState().data.proofNotes.find((n) => n.id === id)!
const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) => {
  let used = false
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  Object.defineProperty(e, 'target', { value: target })
  rtlAct(() => { for (const h of keyHandlersFor('proof')) if (h(e, { typing: false, hadPop: false, plain: !(init.ctrlKey || init.metaKey || init.altKey) })) used = true })
  return used
}
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })
const toasts = () => getOverlay().toasts.map((t) => t.msg)
const undoToast = () => rtlAct(() => { fireEvent.click(within(document.getElementById('toasts')!).getAllByRole('button', { name: 'Undo' }).slice(-1)[0]) })

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('Proof: all chapters', () => {
  it.each<[HeadingStyle, 12 | 40]>([['gutenberg', 12], ['numbered', 12], ['colon', 12], ['gutenberg', 40], ['numbered', 40]])(
    'draws a strip tile per chapter, named from the chapter data (%s, %i)',
    (headingStyle, chapters) => {
      setup({ headingStyle, chapters })
      mount()
      const { data } = getState()
      const tiles = document.querySelectorAll('.cstrip button.cs')
      expect(tiles).toHaveLength(data.chapters.length)
      expect(document.querySelector('.cstrip')!.classList.contains('dense')).toBe(chapters === 40)
      expect(stripIsDense(data)).toBe(chapters === 40)
      const c5 = data.chapters.find((c) => c.id === '5')!
      expect(screen.getByLabelText(chName(data, c5) + ': 9 open of 10').textContent).toContain(chapters === 40 ? '●' : '9')
      // The list is grouped under the chapter's own heading.
      expect(document.querySelector('.grprow')!.textContent).toContain(chName(data, c5))
      expect(document.querySelectorAll('tr[data-r]')).toHaveLength(10)
    },
  )
  it('uses the chapter number as the tile label, every fifth when dense', () => {
    setup({ chapters: 40 })
    mount()
    const labels = [...document.querySelectorAll('.cstrip .cs .n')].map((n) => n.textContent)
    expect(labels).toContain('5')
    expect(labels).not.toContain('6')
    expect(labels[0]).toBe('In')
    expect(labels[labels.length - 1]).toBe('Out')
  })
  it('opens a chapter from its tile', () => {
    mount()
    click('[data-cs="5"]')
    expect(getState().ui.proof.scope).toBe('chapter')
    expect(getState().ui.chapter).toBe('5')
    expect(document.querySelector('#wave svg')).not.toBeNull()
  })
  it('opens the chapter from a click on a note', () => {
    mount()
    click('tr[data-r="4"]')
    expect(getState().ui.proof.sel).toBe(4)
    expect(getState().ui.proof.scope).toBe('chapter')
  })
})

describe('Proof: decisions', () => {
  it('records a decision, moves to the next note and undoes both from the toast', () => {
    setup({}, chapter5)
    mount()
    expect(note(1).res).toBe('pickup')
    click('[data-d="waive"]')
    expect(note(1).res).toBe('waive')
    // On to the next note still to review.
    expect(getState().ui.proof.sel).toBe(10)
    expect(toasts()).toContain('02:14.6 · Waive')
    expect(getState().history.at(-1)!.label).toBe('Decision “Waive” at 02:14.6')
    undoToast()
    expect(note(1).res).toBe('pickup')
    expect(getState().ui.proof.sel).toBe(1)
  })
  it('decides with the P E W D keys; the left and right arrows no longer decide (they step the chapter)', () => {
    setup({}, chapter5)
    mount()
    expect(press('e')).toBe(true)
    expect(note(1).res).toBe('edit')
    expect(getState().ui.proof.sel).toBe(10)
    press('ArrowRight')
    press('ArrowLeft')
    expect(note(10).res).toBeNull()
    expect(note(1).res).toBe('edit')
  })
  it('left and right step to the next and previous chapter without Alt', () => {
    setup({}, chapter5)
    mount()
    expect(press('ArrowRight')).toBe(true)
    expect(getState().ui.chapter).toBe('6')
    expect(press('ArrowLeft')).toBe(true)
    expect(press('ArrowLeft')).toBe(true)
    expect(getState().ui.chapter).toBe('4')
  })
  it('a focused slider (the overview window) keeps its own arrow keys', () => {
    setup({}, chapter5)
    mount()
    const mini = document.querySelector('#wmini')!
    expect(press('ArrowRight', {}, mini)).toBe(false)
    expect(getState().ui.chapter).toBe('5')
  })
  it('reopens a decided note', () => {
    setup({}, (u) => { chapter5(u); u.proof.sel = 9 })
    mount()
    expect(note(9).res).toBe('pickup')
    click('#reopen')
    expect(note(9).res).toBeNull()
  })
  it('changes the type of finding', async () => {
    setup({}, chapter5)
    mount()
    await chooseOption(document.querySelector<HTMLElement>('#ptype')!, 'pron')
    expect(note(1).ty).toBe('pron')
  })
  it('Escape goes back to all chapters', () => {
    setup({}, chapter5)
    mount()
    expect(press('Escape')).toBe(true)
    expect(getState().ui.proof.scope).toBe('all')
  })
  it('right-click on a note offers the decisions', () => {
    mount()
    const tr = document.querySelector('tr[data-r="2"]')!
    const items = contextItemsFor(tr, { clientX: 0, clientY: 0 })!
    const labels = items.map((i) => ('l' in i ? i.l : 'label' in i ? i.label : '—'))
    expect(labels).toContain('Needs pickup')
    expect(labels).toContain('Open this chapter in Booth')
    const pick = items.find((i) => 'l' in i && i.l === 'Needs pickup') as { fn: () => void }
    rtlAct(() => pick.fn())
    expect(note(2).res).toBe('pickup')
  })
})

describe('Proof: waveform window', () => {
  it('lists only the notes in the window, with an In view chip to see them all', () => {
    setup({}, (u) => { chapter5(u); u.proof.winStart = 200; u.proof.winLen = 60; u.proof.sel = 2; u.proof.winFor = 2 })
    mount()
    expect(document.querySelectorAll('tr[data-r]')).toHaveLength(3)
    expect(screen.getByText('Notes · 3 of 10')).toBeInTheDocument()
    click('[data-wf]')
    expect(document.querySelectorAll('tr[data-r]')).toHaveLength(10)
    expect(screen.getByText('Notes · 10')).toBeInTheDocument()
  })
  it('hides the In view chip when the whole chapter is shown', () => {
    setup({}, (u) => { chapter5(u); u.proof.winLen = WAVE_TOTAL })
    mount()
    expect(document.querySelector('[data-wf]')).toBeNull()
  })
  it('selection follows the window: moving off the selected note selects the earliest note in view', () => {
    setup({}, (u) => { chapter5(u); u.proof.winStart = 100; u.proof.winLen = 60; u.proof.sel = 1; u.proof.winFor = 1 })
    mount()
    rtlAct(() => { dragWindow(500); releaseWindow() })
    // 500 centres a 60 s window on 470 to 530: notes 6 (475.7) and 7 (492.1).
    expect(getState().ui.proof.winStart).toBe(470)
    expect(getState().ui.proof.sel).toBe(6)
    // A window with nothing in it leaves nothing selected.
    rtlAct(() => { dragWindow(60); releaseWindow() })
    expect(getState().ui.proof.sel).toBeNull()
    expect(document.querySelector('.insp .pb')).toBeNull()
  })
  it('keeps the selection when the window still contains it', () => {
    setup({}, (u) => { chapter5(u); u.proof.winStart = 100; u.proof.winLen = 120; u.proof.sel = 1; u.proof.winFor = 1 })
    mount()
    rtlAct(() => { dragWindow(130); releaseWindow() })
    expect(getState().ui.proof.sel).toBe(1)
  })
  it('zooms through the window lengths and clamps to the chapter', () => {
    setup({}, chapter5)
    mount()
    click('#wzout')
    expect(getState().ui.proof.winLen).toBe(120)
    click('#wzin'); click('#wzin'); click('#wzin')
    expect(getState().ui.proof.winLen).toBe(30)
    expect((document.querySelector('#wzin') as HTMLButtonElement).disabled).toBe(true)
    rtlAct(() => { dragWindow(10_000) })
    expect(getState().ui.proof.winStart + getState().ui.proof.winLen).toBe(WAVE_TOTAL)
  })
  it('moves the window with the arrow keys on the overview', () => {
    setup({}, (u) => { chapter5(u); u.proof.winStart = 100; u.proof.winLen = 60; u.proof.sel = 1; u.proof.winFor = 1 })
    mount()
    const mini = document.querySelector('#wmini')!
    rtlAct(() => { fireEvent.keyDown(mini, { key: 'ArrowRight' }) })
    expect(getState().ui.proof.winStart).toBe(130)
  })
  it('centres the window on a newly selected note', () => {
    setup({}, (u) => { chapter5(u); u.proof.winStart = 100; u.proof.winLen = 60; u.proof.sel = 1; u.proof.winFor = 1 })
    mount()
    rtlAct(() => { selectNote(7) })
    expect(getState().ui.proof.winStart).toBeCloseTo(492.1 - 30)
    expect(document.getElementById('wlabel')!.textContent).toBe('07:42–08:42')
  })
  it('pins that would touch merge into a count unless one is selected', () => {
    const rows = getState().data.proofNotes.filter((n) => [2, 3, 10].includes(n.id))
    const merged = clusterPins(rows, 0, 760, 752, null)
    expect(merged).toHaveLength(1)
    expect(merged[0].items).toHaveLength(3)
    const split = clusterPins(rows, 0, 760, 752, 10)
    expect(split.length).toBeGreaterThan(1)
    setup({}, (u) => { chapter5(u); u.proof.winStart = 0; u.proof.winLen = WAVE_TOTAL; u.proof.sel = 1; u.proof.winFor = 1 })
    mount()
    const group = document.querySelector('g[data-cl]')!
    expect(group.getAttribute('aria-label')).toMatch(/notes close together/)
    const first = +group.getAttribute('data-cl')!.split(',')[0]
    rtlAct(() => { fireEvent.click(group) })
    expect(getState().ui.proof.sel).toBe(first)
  })
})

describe('Proof: takes', () => {
  const takes = () => setup({}, (u) => { chapter5(u); u.proof.sel = 10; u.proof.winFor = 10 })
  it('shows the passage and points to Editing instead of managing takes itself', () => {
    takes()
    mount()
    expect(screen.getByText('Takes at this spot · 3')).toBeInTheDocument()
    expect(document.querySelector('[data-tkeep]')).toBeNull()
    expect(document.querySelector('#tall')).toBeNull()
  })
  it('opens Editing at the passage from "Manage takes in Editing"', () => {
    takes()
    mount()
    click('#toediting')
    const ed = getState().ui
    expect(ed.page).toBe('editing')
    expect(ed.chapter).toBe('5')
    expect(ed.editing.openTakes).toEqual(['ps5-5'])
    expect(ed.editing.passage).toBe('ps5-5')
  })
  it('says which take was kept in Editing', () => {
    takes()
    update((d) => { const p = d.data.passages.find((x) => x.id === 'ps5-5')!; p.kept = true; p.takes.forEach((t) => { t.active = t.id === 'T05-2' }) })
    mount()
    expect(within(document.querySelector('[data-take="T05-2"]') as HTMLElement).getByText('Kept')).toBeInTheDocument()
  })
  it('has no manage button on other kinds of note', () => {
    setup({}, (u) => { chapter5(u); u.proof.sel = 1; u.proof.winFor = 1 })
    mount()
    expect(document.querySelector('#toediting')).toBeNull()
  })
})

describe('Proof: cleanup', () => {
  it('no longer has a Clean up menu; the cleanup operations live in Editing', () => {
    setup({}, chapter5)
    mount()
    expect(screen.queryByText('Clean up ▾')).toBeNull()
    expect(document.querySelector('#cleanup')).toBeNull()
    for (const id of ['#pfopen', '#imp', '#exp', '#chk']) expect(document.querySelector(id), id).not.toBeNull()
  })
  it('trims one gap from the note’s right-click menu as one DAW change with an undo', () => {
    setup({}, (u) => { chapter5(u); u.proof.sel = 5; u.proof.winFor = 5; u.proof.winStart = 348 })
    mount()
    const tr = document.querySelector('tr[data-r="5"]')!
    const items = contextItemsFor(tr, { clientX: 0, clientY: 0 })!
    const trim = items.find((i) => 'l' in i && i.l.startsWith('Trim the gap'))
    expect(trim).toBeTruthy()
    rtlAct(() => { (trim as { fn: () => void }).fn() })
    expect(note(5).res).toBe('fixed')
    expect(toasts()).toContain('Shortened 1 gap in REAPER')
    expect(getState().history.at(-1)).toMatchObject({ label: 'Shortened 1 gap', daw: true })
    expect(daw().calls.some((c) => c.name === 'trimGaps' && c.args[0] === 1)).toBe(true)
    undoToast()
    expect(note(5).res).toBeNull()
  })
  it('checks the chapter’s recording from the icon, and is off when REAPER is not running', () => {
    setup({}, chapter5)
    const spy = vi.fn()
    mount()
    modals.checkRecordings = spy
    click('#chk')
    expect(spy).toHaveBeenCalledWith(['5'])
    cleanup()
    update((d) => { d.mock.setup = 'reaper-off' })
    mount()
    expect((document.querySelector('#chk') as HTMLButtonElement).disabled).toBe(true)
  })
  it('trims a single gap from the inspector', () => {
    setup({}, (u) => { chapter5(u); u.proof.sel = 5; u.proof.winFor = 5 })
    mount()
    click('#trim')
    expect(note(5).res).toBe('fixed')
    expect(document.querySelector('#trim')).toBeNull()
  })
})

describe('Proof: notes thread', () => {
  const thread = () => (note(2).thread ?? [])
  it('shows the first note as the proofer’s message and adds a reply', () => {
    setup({}, (u) => { chapter5(u); u.proof.sel = 2; u.proof.winFor = 2 })
    mount()
    const ta = document.querySelector<HTMLTextAreaElement>('#preply')!
    rtlAct(() => { fireEvent.change(ta, { target: { value: 'Re-read' } }) })
    click('[data-pwho="you"]')
    click('#paddreply')
    expect(thread().at(-1)).toMatchObject({ who: 'you', text: 'Re-read', at: 'Sep 26' })
    expect(ta.value).toBe('')
    click('#paddreply')
    expect(toasts()).toContain('Write the note first.')
  })
  it('edits a message in place', () => {
    setup({}, (u) => { chapter5(u); u.proof.sel = 3; u.proof.winFor = 3 })
    mount()
    click('[data-medit="0"]')
    const ta = document.querySelector<HTMLTextAreaElement>('#pedtxt')!
    rtlAct(() => { ta.value = 'Edited'; fireEvent.change(ta) })
    click('#pedsave')
    expect(note(3).thread![0].text).toBe('Edited')
    expect(getState().ui.proof.edit).toBeNull()
    click('[data-medit="0"]')
    click('#pedcancel')
    expect(note(3).thread![0].text).toBe('Edited')
  })
  it('deletes a message with an undo', () => {
    setup({}, (u) => { chapter5(u); u.proof.sel = 3; u.proof.winFor = 3 })
    mount()
    click('[data-mdel="0"]')
    expect(note(3).thread).toHaveLength(0)
    expect(screen.getByText('No notes yet.')).toBeInTheDocument()
    expect(toasts()).toContain('Note deleted.')
    undoToast()
    expect(note(3).thread).toBeUndefined()
    expect(screen.getByText('Small wet click.')).toBeInTheDocument()
  })
})

describe('Proof: finding, filters, play', () => {
  it('Ctrl+F opens find in notes and filters by what was written or said', () => {
    mount()
    expect(press('f', { ctrlKey: true })).toBe(true)
    expect(getState().ui.proof.findOpen).toBe(true)
    const f = document.querySelector<HTMLInputElement>('#pfind')!
    rtlAct(() => { fireEvent.change(f, { target: { value: 'hookah' } }) })
    expect(document.querySelectorAll('tr[data-r]')).toHaveLength(1)
    expect(screen.getByText('Notes · 1 of 10')).toBeInTheDocument()
    rtlAct(() => { fireEvent.keyDown(f, { key: 'Escape' }) })
    expect(getState().ui.proof.query).toBe('')
    expect(getState().ui.proof.findOpen).toBe(false)
  })
  it('filters by decision and clears the filters', () => {
    mount()
    click('[data-f="pickup"]')
    expect(document.querySelectorAll('tr[data-r]')).toHaveLength(4)
    rtlAct(() => { update((d) => { d.ui.proof.query = 'zzz' }) })
    expect(screen.getByText('No notes match')).toBeInTheDocument()
    click('#clearf')
    expect(document.querySelectorAll('tr[data-r]')).toHaveLength(10)
  })
  it('says so when a chapter has no notes', () => {
    setup({}, (u) => { u.proof.scope = 'chapter'; u.chapter = '8' })
    mount()
    expect(screen.getByText('No notes for this chapter')).toBeInTheDocument()
  })
  it('plays ±3 s with a moving playhead and stops by itself', () => {
    vi.useFakeTimers()
    setup({}, chapter5)
    mount()
    click('#play')
    expect(getState().ui.proof.play).toBeCloseTo(131.6)
    rtlAct(() => { vi.advanceTimersByTime(1000) })
    expect(getState().ui.proof.play).toBeGreaterThan(132)
    expect(document.querySelector('#wave svg line[stroke-width="2"][y1="0"]')).not.toBeNull()
    rtlAct(() => { vi.advanceTimersByTime(6000) })
    expect(getState().ui.proof.play).toBeNull()
    expect(daw().calls.some((c) => c.name === 'playAround')).toBe(true)
  })
  it('Space toggles play and stops when the selection moves', () => {
    vi.useFakeTimers()
    setup({}, chapter5)
    mount()
    press(' ')
    expect(getState().ui.proof.play).not.toBeNull()
    press('j')
    expect(getState().ui.proof.play).toBeNull()
  })
  it('sends REAPER the position and a marker, or explains why not', () => {
    setup({}, chapter5)
    mount()
    click('#reaper')
    click('#marker')
    expect(toasts()).toEqual(expect.arrayContaining(['REAPER cursor moved', 'Marker added in REAPER']))
    cleanup()
    update((d) => { d.mock.setup = 'builtin' })
    mount()
    expect((document.querySelector('#reaper') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Not available with the built-in recorder.')).toBeInTheDocument()
  })
  it('import and export say what they did', () => {
    mount()
    click('#imp')
    click('#exp')
    expect(toasts()).toEqual(expect.arrayContaining(['Choose the proofer’s CSV.', 'Exported 10 notes for the proofer.']))
  })
  it('shows the import prompt until there is a manuscript', () => {
    update((d) => { d.mock.hasManuscript = false })
    mount()
    expect(screen.getByText('Import manuscript')).toBeInTheDocument()
  })
})

describe('Markup', () => {
  it('renders only <i> <b> <del> <ins> and keeps everything else as text', () => {
    const { container } = render(<p><Markup text={'“Who <del>are</del> <ins>you</ins>?” <b>x</b> <i>y</i> <script>alert(1)</script> <b>open'} /></p>)
    expect(container.querySelector('del')!.textContent).toBe('are')
    expect(container.querySelector('ins')!.textContent).toBe('you')
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })
})

describe('selectors', () => {
  it('filter by window only inside a chapter view', () => {
    const s = getState()
    const v = { ...viewOf({ ...s.ui, chapter: '5', proof: { ...s.ui.proof, scope: 'chapter', winStart: 200, winLen: 60 } }) }
    expect(visibleRows(s.data, v).map((r) => r.id)).toEqual([2, 10, 3])
    expect(visibleRows(s.data, { ...v, scope: 'all' })).toHaveLength(10)
  })
})
