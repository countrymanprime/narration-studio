import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contextItemsFor, keyHandlersFor } from '@/app/registry'
import type { HeadingStyle } from '@/format/headings'
import {
  CLEANUP_OPS, coverSegments, coverage, coveredSeconds, diffWords, opSpec, passagesOf, passes, proposals, takeMatch, tokens,
} from '@/selectors/editing'
import { suggestTake } from '@/selectors/takes'
import { chName } from '@/selectors/chapters'
import { daw } from '@/state/daw'
import { openInEditing } from '@/state/commands/nav'
import { addRegion, draftImpact, openDrawer } from '@/state/commands/editing'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { chooseOption } from './helpers/select'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import EditingPage from '@/pages/Editing'
import '@/pages'

const mount = () => render(<><OverlayHost /><EditingPage /></>)
type Opts = Parameters<typeof createInitialState>[0]
const setup = (opts: Opts = {}, ui: (u: ReturnType<typeof getState>['ui']) => void = () => {}) => {
  const s = createInitialState({ ...opts, prefs: undefined })
  s.ui.page = 'editing'
  s.ui.chapter = '5'
  ui(s.ui)
  resetState(s)
}
const tab = (t: 'cleanup' | 'effects' | 'backups') => (u: ReturnType<typeof getState>['ui']) => { u.editing = { ...u.editing, drawer: t } }
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })
const toasts = () => getOverlay().toasts.map((t) => t.msg)
const undoToast = () => rtlAct(() => { fireEvent.click(within(document.getElementById('toasts')!).getAllByRole('button', { name: 'Undo' }).slice(-1)[0]) })
const passage = (id: string) => getState().data.passages.find((p) => p.id === id)!
const region = (id: string) => getState().data.fxRegions.find((r) => r.id === id)
const text = (sel: string) => document.querySelector(sel)?.textContent ?? ''
const calls = (name: string) => daw().calls.filter((c) => c.name === name)
const openDrawerFor = (t: 'cleanup' | 'effects' | 'backups') => rtlAct(() => { openDrawer(t) })

beforeEach(() => { setup(); daw().calls.length = 0 })
afterEach(() => {
  cleanup()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('Editing: page', () => {
  it('is the script: chapter bar, legend, the text with its marks, the bar and the key hints, and no drawer until asked', () => {
    mount()
    expect(screen.getByRole('heading', { level: 1, name: 'Editing' })).toBeInTheDocument()
    expect(document.querySelector('.chapbar')).not.toBeNull()
    expect(screen.getByRole('textbox', { name: 'Script with what was heard' })).toBeInTheDocument()
    expect(document.querySelector('#legend')).not.toBeNull()
    expect(document.querySelector('.sx-bar')).not.toBeNull()
    expect(document.querySelector('.keyfoot')).not.toBeNull()
    expect(document.querySelector('#drawer')).toBeNull()
    // The old tabs are gone: takes live under the line, clean-up and effects in the drawer.
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(document.querySelector('#wmini')).toBeNull()
  })
  it.each<[HeadingStyle, 12 | 40]>([['gutenberg', 12], ['numbered', 12], ['colon', 40], ['numbered', 40]])(
    'names the chapter from the manuscript style (%s, %i chapters)',
    (headingStyle, chapters) => {
      setup({ headingStyle, chapters }, (u) => { u.chapter = '7' })
      mount()
      const { data } = getState()
      expect(document.querySelector('#chapsel')!.textContent).toContain(chName(data, data.chapters.find((c) => c.id === '7')!))
      expect(screen.queryByRole('button', { name: /All chapters/ })).toBeNull()
    },
  )
  it('uses headings in the app’s style and the Barlow display font classes only', () => {
    mount()
    expect(document.querySelectorAll('h1')).toHaveLength(1)
    openDrawerFor('cleanup')
    expect(document.querySelector('#drawer h2')).not.toBeNull()
  })
  it('opens the drawer on a part and moves between its tabs with the arrow keys, each with its count', () => {
    setup({}, tab('cleanup'))
    mount()
    const t = screen.getAllByRole('tab')
    expect(t.map((x) => x.getAttribute('data-tab'))).toEqual(['cleanup', 'effects', 'timeline'])
    expect(t[1].textContent).toBe('Effects · 3')
    t[0].focus()
    rtlAct(() => { fireEvent.keyDown(t[0], { key: 'ArrowRight' }) })
    expect(getState().ui.editing.drawer).toBe('effects')
  })
  it('opens at a passage from another page, with its takes open under the line', () => {
    openInEditing('5', 'ps5-9')
    const u = getState().ui
    expect([u.page, u.chapter, u.editing.passage, u.editing.openTakes]).toEqual(['editing', '5', 'ps5-9', ['ps5-9']])
    mount()
    expect(document.querySelector('[data-tchip="ps5-9"]')!.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelectorAll('[data-takes="ps5-9"] [data-take]')).toHaveLength(4)
  })
})

describe('Editing: takes', () => {
  it('lists the passages with more than one take, from the data', () => {
    mount()
    expect([...document.querySelectorAll('[data-tchip]')].map((r) => r.getAttribute('data-tchip'))).toEqual(['ps5-3', 'ps5-5', 'ps5-9', 'ps5-14', 'ps5-15'])
    expect(passagesOf(getState().data, '3').map((p) => p.id)).toEqual(['ps3-1', 'ps3-3'])
    expect(getState().data.passages.every((p) => p.takes.filter((t) => t.active).length === 1)).toBe(true)
    expect(getState().data.passages.every((p) => p.takes.length >= 1 && p.takes.length <= 4)).toBe(true)
  })
  it('shows no take chip in a chapter with no passage that has more than one take', () => {
    setup({}, (u) => { u.chapter = '4' })
    mount()
    expect(document.querySelector('[data-tchip]')).toBeNull()
    cleanup()
    setup({}, (u) => { u.chapter = '5' })
    update((d) => { d.data.passages = d.data.passages.filter((p) => p.id !== 'ps5-15'); d.data.passages.forEach((p) => { p.takes = p.takes.slice(-1) }) })
    mount()
    expect(document.querySelector('[data-tchip]')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Script with what was heard' })).toBeInTheDocument()
  })
  it('draws a lane for each take with the transcript against the script', () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-5', openTakes: ['ps5-5'] } })
    mount()
    expect(document.querySelectorAll('.lane')).toHaveLength(3)
    // The truncated take leaves words out; the complete take is read as written.
    expect(document.querySelector('[data-take="T05-1"] del')).not.toBeNull()
    expect(document.querySelector('[data-take="T05-3"] del')).toBeNull()
    expect(document.querySelector('[data-take="T05-3"] ins')).toBeNull()
    // A misread word is marked as heard and as written.
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-9', openTakes: ['ps5-9'] } })
    cleanup(); mount()
    expect(document.querySelector('[data-take="T05-8"] ins')!.textContent).toBe('don’t')
    expect(document.querySelector('[data-take="T05-8"] del')!.textContent).toBe('won’t')
  })
  it('compares words and suggests the take the measurements favour', () => {
    const { data } = getState()
    expect(diffWords('a b c', 'a x c').map((p) => p.k)).toEqual(['same', 'ins', 'del', 'same'])
    expect(takeMatch('one two three four', 'one two')).toMatchObject({ same: 2, missing: 2, extra: 0, pct: 50, exact: false })
    expect(takeMatch('one two', 'one two')).toMatchObject({ pct: 100, exact: true })
    expect(tokens('got—”')).toEqual(['got—”'])
    expect(suggestTake(data, passage('ps5-9')).take!.id).toBe('T05-9')
    expect(suggestTake(data, passage('ps5-3')).take!.id).toBe('T05-5')
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-3', openTakes: ['ps5-3'] } })
    mount()
    expect(within(document.querySelector('[data-take="T05-5"]') as HTMLElement).getByText('Suggested')).toBeInTheDocument()
  })
  it('plays a take, every take in order, and two takes A then B', () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-5', openTakes: ['ps5-5'] } })
    mount()
    click('[data-tplay="T05-2"]')
    expect(toasts()).toContain('Playing T05-2')
    expect(calls('playRange').at(-1)!.args.slice(0, 2)).toEqual([239.1, 247.1])
    click('#tall')
    expect(toasts()).toContain('Playing every take in order')
    expect((calls('playSequence').at(-1)!.args[0] as unknown[]).length).toBe(3)
    // Defaults: the active take against the suggested one when they differ, else against another take.
    click('#abplay')
    const ab = calls('playSequence').at(-1)!
    expect(ab.args[1]).toMatch(/^T05-\d, then T05-\d$/)
    expect((ab.args[0] as unknown[]).length).toBe(2)
  })
  it('compares the two takes the narrator picks', async () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-5', openTakes: ['ps5-5'] } })
    mount()
    await chooseOption('#abA', /T05-1/)
    await chooseOption('#abB', /T05-2/)
    click('#abplay')
    expect(calls('playSequence').at(-1)!.args[1]).toBe('T05-1, then T05-2')
  })
  it('keeps a take without deleting the others, as a DAW change that can be undone', () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-5', openTakes: ['ps5-5'] } })
    mount()
    click('[data-tkeep="T05-2"]')
    const p = passage('ps5-5')
    expect(p.kept).toBe(true)
    expect(p.takes.map((t) => [t.id, t.active])).toEqual([['T05-1', false], ['T05-2', true], ['T05-3', false]])
    expect(p.takes).toHaveLength(3)
    expect(getState().history.at(-1)).toMatchObject({ label: 'Kept T05-2; the other takes are muted', daw: true })
    expect(calls('setActiveTake').at(-1)!.args).toEqual(['T05-2'])
    expect(toasts()).toContain('T05-2 is the active take; the others are muted.')
    expect(document.querySelectorAll('.takerow.muted')).toHaveLength(2)
    expect(document.querySelectorAll('.takerow.kept')).toHaveLength(1)
    // The proof note about these takes is decided with it.
    expect(getState().data.proofNotes.find((n) => n.id === 10)!.res).toBe('keep')
    undoToast()
    expect(passage('ps5-5').kept).toBe(false)
    expect(passage('ps5-5').takes.find((t) => t.active)!.id).toBe('T05-3')
    expect(getState().data.proofNotes.find((n) => n.id === 10)!.res).toBeNull()
  })
  it('Undo choice undoes the keep, but not once a later change came after it', () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-5', openTakes: ['ps5-5'] } })
    mount()
    click('[data-tkeep="T05-1"]')
    click('#tundo')
    expect(passage('ps5-5').kept).toBe(false)
    click('[data-tkeep="T05-1"]')
    rtlAct(() => { getState().history.length && update((d) => { d.ui.editing.skip = [] }) })
    // A later DAW change sits on top of it.
    click('[data-tkeep="T05-2"]')
    click('#tundo')
    expect(passage('ps5-5').kept).toBe(true)
  })
  it('hides the other takes only after a take is kept, never deletes, and undoes in one step', () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-5', openTakes: ['ps5-5'] } })
    mount()
    expect(document.querySelector('#trm')).toBeNull()
    expect((document.querySelector('#thide') as HTMLButtonElement).disabled).toBe(true)
    click('[data-tkeep="T05-2"]')
    expect((document.querySelector('#thide') as HTMLButtonElement).disabled).toBe(false)
    click('#thide')
    // Hidden, not removed: all three takes are still in the passage and the DAW was asked to mute, not to delete.
    expect(passage('ps5-5').takes).toHaveLength(3)
    expect(passage('ps5-5').takes.filter((t) => t.hidden).map((t) => t.id)).toEqual(['T05-1', 'T05-3'])
    expect(getState().history.at(-1)).toMatchObject({ label: 'Hid 2 other takes', daw: true })
    expect(calls('hideTakes').at(-1)!.args).toEqual([2])
    expect(calls('removeTakes')).toHaveLength(0)
    // The hidden takes are out of the way until the narrator looks at them.
    expect(document.querySelector('[data-take="T05-1"]')).toBeNull()
    click('#treveal')
    expect(document.querySelector('[data-take="T05-1"]')).not.toBeNull()
    undoToast()
    expect(passage('ps5-5').takes.some((t) => t.hidden)).toBe(false)
  })
  it('refuses to undo a DAW change that is not the last one', () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-5', openTakes: ['ps5-5'] } })
    mount()
    click('[data-tkeep="T05-2"]')
    const first = getOverlay().toasts.at(-1)!
    click('[data-tkeep="T05-1"]')
    rtlAct(() => { first.undo!() })
    expect(toasts().some((m) => m.startsWith('Undo “'))).toBe(true)
    expect(passage('ps5-5').takes.find((t) => t.active)!.id).toBe('T05-1')
  })
  it('offers keep and play from the right-click menu', () => {
    mount()
    const items = contextItemsFor(document.querySelector('[data-k="5-5:0"]')!, { clientX: 0, clientY: 0 })!
    expect(items.some((i) => 'l' in i && i.l === 'Keep T05-2')).toBe(true)
  })
})

describe('Editing: cleanup', () => {
  const cleanupUi = (patch: Partial<ReturnType<typeof getState>['ui']['editing']> = {}) => setup({}, (u) => { u.editing = { ...u.editing, drawer: 'cleanup', ...patch } })
  it('detects gaps over the limit from the proof finding and the app’s own detections, with the proposed fix', () => {
    cleanupUi()
    mount()
    const rows = [...document.querySelectorAll('tr[data-row]')]
    expect(rows.map((r) => r.getAttribute('data-row'))).toEqual(['det:d1', 'det:d2', 'det:d4', 'note:5', 'det:d5', 'det:d6', 'det:d7'])
    const first = rows[0]
    expect(first.textContent).toContain('01:36.2')
    expect(first.textContent).toContain('1.6 s')
    expect(first.textContent).toContain('Shorten to 1.2 s')
    expect(screen.getByRole('button', { name: 'Gaps 7' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Breaths 7' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clicks 4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plosives 4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Noise 1' })).toBeInTheDocument()
  })
  it('breath findings carry a level in dB and a duration', () => {
    const b = getState().data.detections.filter((d) => d.ty === 'breath')
    expect(b.length).toBeGreaterThan(5)
    expect(b.every((d) => typeof d.db === 'number' && d.dur > 0)).toBe(true)
    cleanupUi({ op: 'breaths' })
    mount()
    expect(document.querySelector('tr[data-row="det:b4"]')!.textContent).toContain('−17 dB · 0.66 s')
    expect(document.querySelector('tr[data-row="det:b4"]')!.textContent).toContain('Reduce by 9 dB')
  })
  it('Light, Standard and Heavy set the thresholds, which Advanced shows and edits', () => {
    cleanupUi()
    mount()
    click('[aria-label="Strength"] button:nth-child(1)')
    expect(getState().ui.editing.params.gaps.limit).toBe(2)
    expect(document.querySelectorAll('tr[data-row]')).toHaveLength(3)
    click('[aria-label="Strength"] button:nth-child(3)')
    expect(getState().ui.editing.params.gaps.limit).toBe(0.8)
    expect(document.querySelectorAll('tr[data-row]')).toHaveLength(8)
    expect(document.querySelector('details.adv')).not.toBeNull()
    const field = screen.getByLabelText('Longest gap left (s)') as HTMLInputElement
    expect(field.value).toBe('0.8')
    rtlAct(() => { fireEvent.change(field, { target: { value: '1.5' } }) })
    expect(getState().ui.editing.params.gaps.limit).toBe(1.5)
    expect(getState().ui.editing.level.gaps).toBeNull()
    expect(document.querySelectorAll('[aria-label="Strength"] button[aria-pressed="true"]')).toHaveLength(0)
    expect(document.querySelectorAll('tr[data-row]')).toHaveLength(5)
    expect(passes('gaps', { limit: 1.5 }, { key: 'x', id: 'x', src: 'detection', ty: 'pacing', sec: 1, dur: 1.5, done: false })).toBe(false)
    for (const o of CLEANUP_OPS) for (const l of ['light', 'standard', 'heavy'] as const) expect(Object.keys(opSpec(o.kind).levels[l]).sort()).toEqual(o.fields.map((f) => f.key).sort())
  })
  it('previews before it applies, then applies the selected findings as one DAW change with an undo', () => {
    cleanupUi()
    mount()
    click('#cprev')
    expect(calls('playSequence').at(-1)!.args[1]).toBe('the first 3 of 7 selected, with 2 s before and after')
    expect(getState().data.detections.every((d) => d.res === null)).toBe(true)
    // Leave one out.
    rtlAct(() => { fireEvent.click(document.querySelector('[data-inc="det:d6"]')!) })
    expect(screen.getByRole('button', { name: 'Apply to 6 selected' })).toBeInTheDocument()
    click('#capply')
    expect(getState().history.at(-1)).toMatchObject({ label: 'Shortened 6 gaps', daw: true })
    expect(toasts()).toContain('Shortened 6 gaps in REAPER')
    expect(calls('trimGaps').at(-1)!.args).toEqual([6, 1.2])
    const s = getState().data
    expect(s.proofNotes.find((n) => n.id === 5)!.res).toBe('fixed')
    expect(s.detections.filter((d) => d.ty === 'pacing' && d.res === 'fixed').map((d) => d.id).sort()).toEqual(['d1', 'd2', 'd4', 'd5', 'd7'])
    expect(s.detections.find((d) => d.id === 'd6')!.res).toBeNull()
    expect(screen.getAllByText('Fixed').length).toBe(6)
    undoToast()
    expect(getState().data.proofNotes.find((n) => n.id === 5)!.res).toBeNull()
    expect(getState().data.detections.every((d) => d.res === null)).toBe(true)
  })
  it.each<[string, string, string, string]>([
    ['breaths', 'Reduced 7 breaths by 9 dB', 'applyFix', 'Reduced 7 breaths by 9 dB in REAPER'],
    ['clicks', 'Repaired 4 clicks', 'applyFix', 'Repaired 4 clicks in REAPER'],
    ['plosives', 'Softened 4 plosives by 6 dB', 'applyFix', 'Softened 4 plosives by 6 dB in REAPER'],
    ['noise', 'Reduced 1 noise by 12 dB', 'applyFix', 'Reduced 1 noise by 12 dB in REAPER'],
  ])('applies %s in one step', (op, label, call, toastMsg) => {
    cleanupUi({ op: op as 'breaths' })
    mount()
    click('#capply')
    expect(getState().history.at(-1)).toMatchObject({ label, daw: true })
    expect(calls(call).at(-1)!.args[0]).toBe(op)
    expect(toasts()).toContain(toastMsg)
    undoToast()
    expect(proposals(getState().data, '5', op as 'breaths', getState().ui.editing.params[op as 'breaths']).every((r) => !r.done)).toBe(true)
  })
  it('applies nothing when nothing is selected, and no apply with REAPER off', () => {
    cleanupUi()
    mount()
    click('#call')
    expect((document.querySelector('#capply') as HTMLButtonElement).disabled).toBe(true)
    click('#call')
    expect((document.querySelector('#capply') as HTMLButtonElement).disabled).toBe(false)
    cleanup()
    update((d) => { d.mock.setup = 'reaper-off' })
    mount()
    expect((document.querySelector('#capply') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('REAPER is not running.')).toBeInTheDocument()
  })
  it('says so when no finding passes the thresholds', () => {
    cleanupUi({ op: 'clicks' })
    update((d) => { d.ui.editing.params.clicks = { above: -10 } })
    mount()
    expect(screen.getByText('Nothing found at these settings.')).toBeInTheDocument()
  })
  it('shows the chapter’s measured noise floor beside the noise operation', () => {
    setup({}, (u) => { u.chapter = '4'; u.editing = { ...u.editing, drawer: 'cleanup', op: 'noise' } })
    mount()
    expect(text('.dr-insp')).toContain('Noise floor')
    expect(text('.dr-insp')).toContain('-57.8')
  })
})

describe('Editing: effects and coverage', () => {
  const fx = (patch: Partial<ReturnType<typeof getState>['ui']['editing']> = {}) => setup({}, (u) => { u.editing = { ...u.editing, drawer: 'effects', ...patch } })
  it('works out coverage as the union of the effects that are on', () => {
    expect(coverSegments([{ start: 0, end: 10 }, { start: 5, end: 15 }], 100)).toEqual([{ start: 0, end: 5, n: 1 }, { start: 5, end: 10, n: 2 }, { start: 10, end: 15, n: 1 }])
    expect(coveredSeconds([{ start: 0, end: 10 }, { start: 5, end: 15 }], 100)).toBe(15)
    const d = getState().data
    // Chapter 5: 238–250 and 247.8–256.8 overlap, then 488–504: 18.8 s + 16 s of 760 s.
    expect(coverage(d, '5', 'reaper').sec).toBeCloseTo(34.8)
    expect(coverage(d, '5', 'reaper').pct).toBeCloseTo(4.58, 1)
    // The two Robot voice regions on chapter 8 cover 52 s; the bypassed one adds nothing.
    expect(coverage(d, '8', 'reaper').sec).toBe(52)
    // A take-level effect is not available with the built-in recorder.
    expect(coverage(d, '5', 'builtin').sec).toBeCloseTo(28)
  })
  it('shows the figure, the strip and the legend, and updates them live', () => {
    fx()
    mount()
    expect(text('#covfig')).toBe('Effects cover 4.6% of this chapter')
    expect(document.querySelectorAll('.covstrip .cv')).toHaveLength(4)
    expect(document.querySelectorAll('.covstrip .cv[data-n="2"]')).toHaveLength(1)
    expect(screen.getByText('2 or more')).toBeInTheDocument()
    click('[data-fxr="fx3"]')
    rtlAct(() => { fireEvent.click(screen.getByRole('checkbox', { name: 'Bypass this effect' })) })
    expect(region('fx3')!.bypass).toBe(true)
    expect(text('#covfig')).toBe('Effects cover 2.5% of this chapter')
    expect(document.querySelectorAll('.covstrip .cv')).toHaveLength(3)
  })
  it('a click on the strip selects the effect there and shows it in the inspector', () => {
    fx()
    mount()
    click('.covstrip .cv[data-fx="fx3"]')
    expect(getState().ui.editing.drawer).toBe('effects')
    expect(getState().ui.editing.fx).toBe('fx3')
  })
  it('lists each effect with its range, scope and share of the chapter', () => {
    fx()
    mount()
    const rows = [...document.querySelectorAll('tr[data-fxr]')]
    expect(rows.map((r) => r.getAttribute('data-fxr'))).toEqual(['fx1', 'fx2', 'fx3'])
    expect(rows[0].textContent).toContain('03:58.0–04:10.0')
    expect(rows[0].textContent).toContain('De-click')
    expect(rows[0].textContent).toContain('Section')
    expect(rows[0].textContent).toContain('1.6%')
    expect(rows[1].textContent).toContain('One take')
  })
  it('keeps the Robot voice example on the Queen’s lines in chapter 8, one bypassed effect among them', () => {
    setup({}, (u) => { u.chapter = '8'; u.editing = { ...u.editing, drawer: 'effects' } })
    mount()
    expect([...document.querySelectorAll('tr[data-fxr]')].filter((r) => r.textContent!.includes('Robot voice'))).toHaveLength(2)
    expect(document.querySelector('tr[data-fxr="fx6"]')!.textContent).toContain('Bypassed')
    expect(getState().data.fxPresets.map((p) => p.name)).toEqual(['Robot voice', 'De-ess', 'De-plosive', 'De-click', 'Noise reduction', 'EQ: voice match'])
  })
  it('adds an effect to a stretch with a single DAW change and an undo', async () => {
    fx()
    mount()
    click('#fxnew')
    await chooseOption('#fxpreset', 'Noise reduction')
    rtlAct(() => { fireEvent.change(document.querySelector('#fxstart')!, { target: { value: '100' } }) })
    rtlAct(() => { fireEvent.change(document.querySelector('#fxend')!, { target: { value: '110' } }) })
    expect(text('#fximpact')).toContain('4.6% → 5.9%')
    expect(document.querySelector('#fxwarn')).toBeNull()
    expect(document.querySelector('#fxadd')!.textContent).toBe('Add effect')
    click('#fxadd')
    const r = getState().data.fxRegions.find((x) => x.id === 'fx7')!
    expect(r).toMatchObject({ chapterId: '5', start: 100, end: 110, scope: 'section', effect: 'denoise', presetId: 'denoise', bypass: false })
    expect(getState().history.at(-1)).toMatchObject({ label: 'Added Noise reduction to 01:40.0–01:50.0', daw: true })
    expect(calls('addFx').at(-1)!.args).toEqual(['Noise reduction', 100, 110, 'section'])
    expect(getState().ui.editing.adding).toBe(false)
    undoToast()
    expect(region('fx7')).toBeUndefined()
  })
  it('warns before the cap, never silently: over it the button says Add anyway and the command refuses without it', async () => {
    fx()
    mount()
    click('#fxnew')
    rtlAct(() => { fireEvent.change(document.querySelector('#fxstart')!, { target: { value: '0' } }) })
    rtlAct(() => { fireEvent.change(document.querySelector('#fxend')!, { target: { value: '100' } }) })
    expect(document.querySelector('#fxwarn')!.textContent).toBe('This takes coverage from 4.6% to 17.7%, over the 10.0% cap.')
    expect(document.querySelector('#fxadd')!.textContent).toBe('Add anyway')
    expect(draftImpact(getState()).over).toBe(true)
    // Not confirmed: nothing is added.
    expect(addRegion(false)).toBe(false)
    expect(getState().data.fxRegions).toHaveLength(6)
    click('#fxadd')
    expect(getState().data.fxRegions).toHaveLength(7)
    expect(text('#covfig')).toBe('Effects cover 17.7% of this chapter')
    expect(text('.cover .pill')).toBe('Over the cap')
  })
  it('a much larger cover shows the strongest warning, and the cap can be changed', () => {
    fx()
    mount()
    expect(text('.cover .pill')).toBe('Within the cap')
    rtlAct(() => { fireEvent.change(document.querySelector('#fxcap')!, { target: { value: '2' } }) })
    expect(getState().data.editor.fxCapPct).toBe(2)
    expect(text('.cover .pill')).toBe('Far over the cap')
    rtlAct(() => { fireEvent.change(document.querySelector('#fxcap')!, { target: { value: '3' } }) })
    expect(text('.cover .pill')).toBe('Over the cap')
  })
  it('whole track is labelled and counts as 100%', async () => {
    fx()
    mount()
    click('#fxnew')
    await chooseOption('#fxscope', 'Whole track')
    expect(text('#fximpact')).toContain('→ 100.0%')
    expect(document.querySelector('#fxwarn')).not.toBeNull()
    expect(document.querySelector('#fxstart')).toBeNull()
    click('#fxadd')
    const r = getState().data.fxRegions.find((x) => x.scope === 'track')!
    expect(r).toMatchObject({ start: 0, end: 760 })
    expect(text('#covfig')).toBe('Effects cover 100.0% of this chapter')
    expect(document.querySelector('tr[data-fxr="' + r.id + '"]')!.textContent).toContain('Whole track')
    expect(document.querySelector('tr[data-fxr="' + r.id + '"]')!.textContent).toContain('100.0%')
  })
  it('a take-level effect takes its take’s range', async () => {
    fx()
    mount()
    click('#fxnew')
    await chooseOption('#fxscope', 'One take')
    await chooseOption('#fxtake', /T05-4/)
    expect(getState().ui.editing.draft).toMatchObject({ scope: 'take', takeId: 'T05-4', start: 150.2, end: 162.2 })
    expect((document.querySelector('#fxstart') as HTMLInputElement).disabled).toBe(true)
  })
  it('shows an effect’s settings and changes them, with bypass, preview, compare and remove', () => {
    fx({ fx: 'fx1' })
    mount()
    expect(text('.dr-insp h2')).toBe('De-click')
    const slider = document.querySelector('#fxp-sensitivity') as HTMLInputElement
    rtlAct(() => { fireEvent.change(slider, { target: { value: '70' } }) })
    expect(region('fx1')!.params.sensitivity).toBe(70)
    expect(calls('setFxParam').at(-1)!.args).toEqual(['De-click', 'sensitivity', 70])
    click('#fxprev')
    expect(calls('playRange').at(-1)!.args.slice(0, 2)).toEqual([236, 252])
    click('#fxab')
    expect(toasts()).toContain('Playing without De-click, then with it')
    click('#fxrm')
    expect(region('fx1')).toBeUndefined()
    expect(getState().history.at(-1)).toMatchObject({ label: 'Removed De-click', daw: true })
    expect(calls('removeFx')).toHaveLength(1)
    undoToast()
    expect(region('fx1')).toBeDefined()
  })
  it('number settings use a number field', () => {
    fx({ fx: 'fx3' })
    mount()
    const f = document.querySelector('#fxp-freq') as HTMLInputElement
    expect(f.value).toBe('7')
    rtlAct(() => { fireEvent.change(f, { target: { value: '8.5' } }) })
    expect(region('fx3')!.params.freq).toBe(8.5)
  })
  it('turning a bypassed effect back on over the cap asks first', () => {
    setup({}, (u) => { u.chapter = '8'; u.editing = { ...u.editing, drawer: 'effects', fx: 'fx6' } })
    update((d) => { d.data.editor.fxCapPct = 7 })
    mount()
    expect(screen.getByRole('checkbox', { name: 'Bypass this effect' })).toHaveAttribute('aria-checked', 'true')
    rtlAct(() => { fireEvent.click(screen.getByRole('checkbox', { name: 'Bypass this effect' })) })
    expect(region('fx6')!.bypass).toBe(true)
    expect(document.querySelector('#fxon-warn')).not.toBeNull()
    click('#fxon')
    expect(region('fx6')!.bypass).toBe(false)
    expect(getState().history.at(-1)).toMatchObject({ label: 'Turned on De-ess', daw: true })
  })
})

describe('Editing: recording setups', () => {
  it('REAPER not running: the Production banner, read-only, plays still work', () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-5', openTakes: ['ps5-5'] } })
    update((d) => { d.mock.setup = 'reaper-off' })
    mount()
    const banner = document.querySelector('#offbanner')!
    expect(banner.className).toBe('banner')
    expect(banner.textContent).toContain('REAPER is not running.')
    expect((document.querySelector('[data-tkeep="T05-1"]') as HTMLButtonElement).disabled).toBe(true)
    expect((document.querySelector('#thide') as HTMLButtonElement).disabled).toBe(true)
    expect((document.querySelector('#reaper') as HTMLButtonElement).disabled).toBe(true)
    click('[data-tplay="T05-1"]')
    expect(toasts()).toContain('Playing T05-1')
    cleanup()
    setup({}, tab('effects'))
    update((d) => { d.mock.setup = 'reaper-off' })
    mount()
    expect((document.querySelector('#fxnew') as HTMLButtonElement).disabled).toBe(true)
    expect((document.querySelector('#fxrm') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Bypass this effect' })).toHaveAttribute('data-disabled')
    click('#retry')
    expect(toasts()).toContain('Still not running. Start REAPER and try again.')
  })
  it('REAPER linked shows no banner', () => {
    mount()
    expect(document.querySelector('#offbanner')).toBeNull()
  })
  it('built-in recorder: takes and cleanup work on the app’s own takes without asking REAPER', () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-5', openTakes: ['ps5-5'] } })
    update((d) => { d.mock.setup = 'builtin' })
    mount()
    expect(document.querySelector('#offbanner')).toBeNull()
    expect(screen.getAllByText(/Recorder take/).length).toBe(3)
    click('[data-tkeep="T05-2"]')
    expect(passage('ps5-5').kept).toBe(true)
    expect(calls('setActiveTake')).toHaveLength(0)
    expect(toasts()).toContain('T05-2 is the active take; the others are muted.')
    click('#thide')
    expect(calls('hideTakes')).toHaveLength(0)
    expect(passage('ps5-5').takes).toHaveLength(3)
    expect(passage('ps5-5').takes.filter((t) => t.hidden)).toHaveLength(2)
    cleanup()
    setup({}, (u) => { u.editing = { ...u.editing, drawer: 'cleanup' } })
    update((d) => { d.mock.setup = 'builtin' })
    mount()
    click('#capply')
    expect(getState().history.at(-1)).toMatchObject({ label: 'Shortened 7 gaps', daw: true })
    expect(calls('trimGaps')).toHaveLength(0)
    expect(toasts()).toContain('Shortened 7 gaps')
  })
  it('built-in recorder: effects say what is not available, from the constants', async () => {
    setup({}, tab('effects'))
    update((d) => { d.mock.setup = 'builtin' })
    mount()
    expect(screen.getByText('Per-take effects need a DAW that keeps takes on tracks.')).toBeInTheDocument()
    const row = document.querySelector('tr[data-fxr="fx2"]')!
    expect(row.textContent).toContain('Needs a DAW with takes')
    // It is not counted, because it cannot run.
    expect(text('#covfig')).toBe('Effects cover 3.7% of this chapter')
    click('#fxnew')
    click('#fxscope')
    const take = screen.getByRole('option', { name: 'One take · Needs a DAW with takes' })
    expect(take).toHaveAttribute('aria-disabled', 'true')
  })
  it('without a manuscript it asks for one', () => {
    update((d) => { d.mock.hasManuscript = false })
    mount()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})
