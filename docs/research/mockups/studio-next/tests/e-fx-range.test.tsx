import { act as rtlAct, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DawResult, FxList, FxRangeRequest } from '@/domain/daw'
import { WordFx } from '@/domain/schemas'
import { createMockFxChains, fxChains, setFxChainProvider } from '@/providers/fxchains'
import { capabilitiesFor, guidOf, rangePlanOf } from '@/selectors/daw'
import { coverage } from '@/selectors/editing'
import { buildDoc, rangeKeys, summarize } from '@/selectors/scriptedit'
import { daw } from '@/state/daw'
import { applyWordFx, deleteWords, DEFAULT_CUT, fxListNow, fxPlanFor, requestFx, selectKeys } from '@/state/commands/scriptedit'
import { contextItemsFor } from '@/app/registry'
import { createInitialState, getState, resetState, undoLast, update as rawUpdate } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import { chooseOption } from './helpers/select'
import EditingPage from '@/pages/Editing'
import '@/pages'

const update: typeof rawUpdate = (fn) => { rtlAct(() => rawUpdate(fn)) }
const act = (fn: () => void) => rtlAct(fn)
const setup = (mock: Partial<ReturnType<typeof getState>['mock']> = {}, data: (d: ReturnType<typeof getState>['data']) => void = () => {}) => {
  const s = createInitialState({ prefs: undefined })
  s.ui.page = 'editing'
  s.ui.chapter = '5'
  s.mock = { ...s.mock, ...mock }
  data(s.data)
  resetState(s)
  daw().calls.length = 0
}
const calls = (n: string) => daw().calls.filter((c) => c.name === n)
const toasts = () => getOverlay().toasts.map((t) => t.msg)
const doc = () => buildDoc(getState().data, '5')
/** "I think I must have been": six words that are in the script. */
const six = () => rangeKeys(doc(), '5-3:33', '5-3:38')
const mount = () => render(<><OverlayHost /><EditingPage /></>)
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })
const original = fxChains()

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  setFxChainProvider(original)
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('applyFxToRange: the capability behind Add FX on words', () => {
  it('the matrix: REAPER splits and adds a chain, the recorder keeps an effect entry, Audacity applies to the selection after a backup', () => {
    const gate = (s: string, backups = false) => capabilitiesFor(s as 'reaper', backups).caps.fxRange
    expect(gate('reaper')).toMatchObject({ available: true, mode: 'native' })
    expect(gate('builtin')).toMatchObject({ available: true, mode: 'app' })
    expect(gate('audacity')).toMatchObject({ available: false, reason: 'Turn on backups to add effects in Audacity. It changes the audio itself.' })
    expect(gate('audacity', true)).toMatchObject({ available: true, mode: 'steps' })
    expect(gate('reaper-off')).toMatchObject({ available: false, reason: 'REAPER is not running.' })
    expect(rangePlanOf({ setup: 'reaper' }).fx).toBe('REAPER splits the item at both ends, then adds the chain to the middle piece.')
    expect(rangePlanOf({ setup: 'reaper' }).fxButton).toBe('Split and add effect')
    expect(rangePlanOf({ setup: 'audacity' }).fxButton).toBe('Apply to selection')
    expect(rangePlanOf({ setup: 'builtin' }).fxSteps).toBe(0)
  })
  it('the list is the DAW’s own, from the provider, one list for each DAW', () => {
    expect(fxListNow().source).toBe('Your REAPER FX chains')
    expect(fxListNow().choices.map((c) => c.name)).toEqual(['Voice polish (EQ, compressor, de-esser)', 'De-esser only', 'Room tone match', 'Telephone', 'Whisper boost'])
    update((d) => { d.mock.setup = 'builtin' })
    expect(fxListNow()).toMatchObject({ source: 'Built-in effects' })
    expect(fxListNow().choices).toHaveLength(4)
    update((d) => { d.mock.setup = 'audacity' })
    expect(fxListNow()).toMatchObject({ source: 'Your Audacity macros' })
    expect(fxListNow().choices[0].name).toBe('Voice polish (macro)')
    for (const k of ['reaper', 'builtin', 'audacity']) expect(() => FxList.parse(original.list(k))).not.toThrow()
  })
  it('a different provider changes the menu with no change to the screen', () => {
    setFxChainProvider(createMockFxChains({ reaper: { source: 'Chains from the test', choices: [{ id: 'one', name: 'Only chain' }] } }))
    mount()
    act(() => selectKeys(six()))
    const items = contextItemsFor(document.querySelector('[data-k="5-3:35"]')!, { clientX: 0, clientY: 0 })!
    const add = items.find((i) => 'sub' in i && i.l === 'Add FX') as { sub: Array<{ l?: string; label?: string }> }
    expect(add.sub.map((i) => i.l ?? i.label)).toEqual(['Chains from the test', 'Only chain', undefined, 'Manage in REAPER…'])
  })
  it('the DAW takes a request that passes the schema and answers a result that does, with the undo steps of its kind', () => {
    const r = { chapterId: '5', itemKey: 'ps5-3', itemGuid: guidOf('item', 'ps5-3'), start: 170, end: 171.4, words: 6, chainId: 'voice-polish', chainName: 'Voice polish', fadeMs: 8 }
    expect(() => FxRangeRequest.parse(r)).not.toThrow()
    const res = daw().applyFxToRange(r)
    expect(() => DawResult.parse(res)).not.toThrow()
    expect(res).toMatchObject({ ok: true, undoSteps: 1, message: 'Added Voice polish to 6 words in REAPER.' })
    setup({ setup: 'audacity' }, (d) => { d.editor.backups = true })
    expect(daw().applyFxToRange(r)).toMatchObject({ ok: true, undoSteps: 2 })
    setup({ setup: 'builtin' })
    expect(daw().applyFxToRange(r)).toMatchObject({ ok: true, undoSteps: 0 })
    setup({ dawStale: true })
    expect(daw().applyFxToRange(r)).toMatchObject({ ok: false, refused: 'That item changed in REAPER since the app read it. Nothing was changed.' })
  })
})

describe('the DAW’s live project', () => {
  it('splits the item at both ends of the words, so the chain sits on the middle piece alone', () => {
    const track = () => daw().tracks().find((t) => t.chapterId === '5')!
    const end = track().items[0].end
    act(() => { applyWordFx(six(), 'deesser') })
    const r = calls('applyFxToRange')[0].args[0] as { start: number; end: number }
    expect(track().items.map((i) => [i.start, i.end])).toEqual([[0, r.start], [r.start, r.end], [r.end, end]])
  })
})

describe('Add FX from the right-click menu', () => {
  it('right-click on a word selects it and lists what the DAW offers under Add FX, with Delete and Mute beside it', () => {
    mount()
    const items = contextItemsFor(document.querySelector('[data-k="5-3:35"]')!, { clientX: 0, clientY: 0 })!
    const labels = items.map((i) => ('l' in i ? i.l : 'label' in i ? i.label : '—'))
    expect(labels.slice(0, 2)).toEqual(['1 word selected', 'Play selection'])
    expect(labels).toContain('Add FX')
    expect(labels).toContain('Mute these words (keep the audio)')
    expect(labels).toContain('Delete words and audio…')
    const add = items.find((i) => 'sub' in i && i.l === 'Add FX') as { sub: Array<{ l?: string; label?: string }> }
    expect(add.sub[0]).toEqual({ label: 'Your REAPER FX chains' })
    expect(add.sub.filter((i) => i.l).map((i) => i.l)).toEqual(['Voice polish (EQ, compressor, de-esser)', 'De-esser only', 'Room tone match', 'Telephone', 'Whisper boost', 'Manage in REAPER…'])
    expect(getState().ui.editing.sel).toEqual({ anchor: '5-3:35', head: '5-3:35' })
    // Inside an existing selection the menu keeps it.
    act(() => selectKeys(six()))
    expect((contextItemsFor(document.querySelector('[data-k="5-3:35"]')!, { clientX: 0, clientY: 0 })![0] as { label: string }).label).toBe('6 words selected')
  })
  it('a DAW that cannot says why on the item; Audacity with backups lists its macros', () => {
    setup({ setup: 'audacity' })
    mount()
    act(() => selectKeys(six()))
    const items = contextItemsFor(document.querySelector('[data-k="5-3:35"]')!, { clientX: 0, clientY: 0 })!
    const add = items.find((i) => 'sub' in i && i.l === 'Add FX') as { disabled?: boolean; title?: string }
    expect(add.disabled).toBe(true)
    expect(add.title).toBe('Turn on backups to add effects in Audacity. It changes the audio itself.')
    cleanup()
    setup({ setup: 'audacity' }, (d) => { d.editor.backups = true })
    mount()
    act(() => selectKeys(six()))
    const on = contextItemsFor(document.querySelector('[data-k="5-3:35"]')!, { clientX: 0, clientY: 0 })!.find((i) => 'sub' in i && i.l === 'Add FX') as { disabled?: boolean; sub: Array<{ l?: string }> }
    expect(on.disabled).toBeFalsy()
    expect(on.sub.filter((i) => i.l)[0].l).toBe('Voice polish (macro)')
  })
})

describe('the preview, before anything is applied', () => {
  it('choosing a chain opens the split-and-apply preview and applies nothing', () => {
    mount()
    act(() => selectKeys(six()))
    act(() => requestFx(undefined, 'deesser'))
    const dlg = document.querySelector('#fxdlg')!
    expect(document.querySelector('.dlg h2')!.textContent).toBe('Add “De-esser only” to 6 words?')
    expect(dlg.querySelector('#fxsplit')!.textContent).toMatch(/^\d\d:\d\d\.\d and \d\d:\d\d\.\d · \d\.\d s in the middle$/)
    expect([...dlg.querySelectorAll('#fxpieces span')].map((s) => s.className)).toEqual(['p1', 'p2', 'p3'])
    expect(dlg.querySelector('#fxpieces .p2')!.textContent).toBe('Piece 2 · De-esser only')
    expect(dlg.textContent).toContain('8 ms fades at both splits, snapped to zero crossings')
    expect(document.querySelector('#fxnote')!.textContent).toContain('One undo step in REAPER: Edit > Undo “Narration Studio: add De-esser only to 6 words”.')
    expect(document.querySelector('#fxgo')!.textContent).toBe('Split and add effect')
    expect(getState().data.wordFx).toHaveLength(0)
    expect(calls('applyFxToRange')).toHaveLength(0)
  })
  it('the chain can be changed in the preview, and Cancel changes nothing', async () => {
    mount()
    act(() => selectKeys(six()))
    act(() => requestFx(undefined, 'deesser'))
    await chooseOption('#fxchain', 'Telephone')
    expect(document.querySelector('.dlg h2')!.textContent).toBe('Add “Telephone” to 6 words?')
    click('.dlg .df .btn:not(.primary)')
    expect(getState().data.wordFx).toHaveLength(0)
    expect(calls('applyFxToRange')).toHaveLength(0)
  })
  it('Audacity: says it applies to the selection after a backup of the stretch, and the recorder says it keeps an effect entry', () => {
    setup({ setup: 'audacity' }, (d) => { d.editor.backups = true })
    mount()
    act(() => selectKeys(six()))
    act(() => requestFx(undefined, 'noise-reduction'))
    expect(document.querySelector('#fxgo')!.textContent).toBe('Apply to selection')
    expect(document.querySelector('#fxnote')!.textContent).toMatch(/applies the effect to the selection\. It changes the audio itself, so the stretch from \d\d:\d\d\.\d to \d\d:\d\d\.\d is backed up first/)
    cleanup()
    closeTopModal()
    setup({ setup: 'builtin' })
    mount()
    act(() => selectKeys(six()))
    act(() => requestFx(undefined, 'low-cut'))
    expect(document.querySelector('#fxnote')!.textContent).toContain('keeps the effect in the edit list for this range')
    expect(document.querySelector('#fxgo')!.textContent).toBe('Add effect')
  })
  it('the split geometry: the pieces are the range and what is either side of it, snapped to a zero crossing', () => {
    const p = fxPlanFor(six())
    expect(p.refusal).toBe('')
    const r = p.range!
    const sum = summarize(getState().data, doc(), six())
    expect(r.start).toBeLessThan(r.end)
    expect(r.items).toHaveLength(6)
    expect(Math.abs(r.start - sum.items[0].t0!)).toBeLessThanOrEqual(0.0021)
    expect(p.split).toMatchObject({ start: r.start, end: r.end })
    expect(r.takeId).toBe('T05-5')
  })
})

describe('applying: one confirmed, undoable step', () => {
  it('the DAW is asked first, the effect is recorded on those words with the DAW’s chain, and it is one undo step', () => {
    mount()
    act(() => selectKeys(six()))
    act(() => requestFx(undefined, 'voice-polish'))
    click('#fxgo')
    const f = WordFx.parse(getState().data.wordFx[0])
    expect(f).toMatchObject({ chapterId: '5', pid: '5-3', takeId: 'T05-5', keys: six(), chainId: 'voice-polish', chainName: 'Voice polish (EQ, compressor, de-esser)', source: 'Your REAPER FX chains', fadeMs: 8, daw: 'reaper' })
    expect(f.text).toBe('I think I must have been')
    expect(FxRangeRequest.parse(calls('applyFxToRange')[0].args[0])).toMatchObject({ chainId: 'voice-polish', words: 6, itemKey: 'ps5-3', fadeMs: 8 })
    expect(getState().history).toHaveLength(1)
    expect(getState().history[0]).toMatchObject({ label: expect.stringMatching(/^Added Voice polish \(EQ, compressor, de-esser\) to 6 words at \d\d:\d\d\.\d$/), daw: true })
    act(() => { undoLast() })
    expect(getState().data.wordFx).toHaveLength(0)
  })
  it('the words are underlined with an FX marker at the end, and the marker removes the effect', () => {
    mount()
    act(() => { applyWordFx(six(), 'voice-polish') })
    expect(document.querySelectorAll('.w.fx')).toHaveLength(6)
    const marker = document.querySelector('.fxmark') as HTMLElement
    expect(marker).not.toBeNull()
    expect(marker.getAttribute('aria-label')).toBe('Voice polish (EQ, compressor, de-esser) on I think I must have been. Options')
    expect(marker.previousElementSibling!.getAttribute('data-k')).toBe('5-3:38')
    click('.fxmark')
    const item = screen.getByRole('menuitem', { name: 'Remove the effect' })
    rtlAct(() => { fireEvent.click(item) })
    expect(getState().data.wordFx).toHaveLength(0)
    expect(calls('removeFxFromRange')).toHaveLength(1)
    expect(getState().history.at(-1)!.label).toBe('Took Voice polish (EQ, compressor, de-esser) off I think I must have been')
    expect(document.querySelector('.fxmark')).toBeNull()
  })
  it('it can be removed from the drawer, and the Effects tab counts it', () => {
    mount()
    act(() => { applyWordFx(six(), 'deesser') })
    update((d) => { d.ui.editing.drawer = 'effects' })
    expect(screen.getByRole('tab', { name: /Effects · 4/ })).toBeInTheDocument()
    const row = document.querySelector('[data-wfx]') as HTMLElement
    expect(row.textContent).toContain('De-esser only')
    expect(row.textContent).toContain('“I think I must have been”')
    click('[data-wfx-select]')
    expect(getState().ui.editing.sel).toEqual({ anchor: '5-3:33', head: '5-3:38' })
    click('[data-wfx-remove]')
    expect(getState().data.wordFx).toHaveLength(0)
  })
  it('it is kept where the words sound when audio before it is cut', () => {
    act(() => { applyWordFx(six(), 'deesser') })
    const f = getState().data.wordFx[0]
    const before = fxPlanFor(six()).range!.start
    act(() => { deleteWords(rangeKeys(doc(), '5-3:x0', '5-3:x3'), DEFAULT_CUT) })
    const after = summarize(getState().data, doc(), six()).ranges[0]
    expect(after.start).toBeLessThan(before)
    expect(coverage(getState().data, '5', 'reaper').segs.some((s) => Math.abs(s.start - after.start) < 0.01)).toBe(true)
    expect(f.a).toBeCloseTo(before, 1)
  })
  it('a selection across two takes is refused for FX, with the reason', () => {
    const keys = rangeKeys(doc(), '5-3:38', '5-4:2')
    expect(fxPlanFor(keys).refusal).toBe('These words sit in more than one take. An effect needs words from one take.')
    act(() => { expect(applyWordFx(keys, 'deesser')).toBe(false) })
    expect(toasts()).toContain('These words sit in more than one take. An effect needs words from one take.')
    expect(getState().data.wordFx).toHaveLength(0)
  })
  it('a refusal by the DAW changes nothing in the app, in the DAW’s own words', () => {
    setup({ dawStale: true })
    act(() => { expect(applyWordFx(six(), 'deesser')).toBe(false) })
    expect(toasts()).toContain('That item changed in REAPER since the app read it. Nothing was changed.')
    expect(getState().data.wordFx).toHaveLength(0)
    expect(getState().history).toHaveLength(0)
  })
  it('Audacity: the stretch is backed up first, then the DAW is asked; and it refuses without backups', () => {
    setup({ setup: 'audacity' })
    act(() => { expect(applyWordFx(six(), 'noise-reduction')).toBe(false) })
    expect(toasts()).toContain('Turn on backups to add effects in Audacity. It changes the audio itself.')
    cleanup()
    setup({ setup: 'audacity' }, (d) => { d.editor.backups = true })
    act(() => { expect(applyWordFx(six(), 'noise-reduction')).toBe(true) })
    expect(daw().calls.map((c) => c.name).filter((n) => ['backupAround', 'applyFxToRange'].includes(n))).toEqual(['backupAround', 'applyFxToRange'])
    expect(getState().data.wordFx[0].backupId).toBe(getState().data.backups[0].id)
    expect(getState().data.backups[0].label).toBe('Add Noise reduction 12 dB')
  })
  it('the built-in recorder keeps an effect entry and asks no DAW', () => {
    setup({ setup: 'builtin' })
    act(() => { expect(applyWordFx(six(), 'low-cut')).toBe(true) })
    expect(calls('applyFxToRange')).toHaveLength(0)
    expect(getState().data.wordFx[0]).toMatchObject({ daw: 'builtin', chainName: 'Low cut 80 Hz', source: 'Built-in effects' })
  })
  it('it counts toward the coverage of effects, and over the cap the button says Add anyway and the command asks for confirmation', () => {
    update((d) => { d.data.editor.fxCapPct = 0.1 })
    mount()
    act(() => selectKeys(six()))
    act(() => requestFx(undefined, 'deesser'))
    expect(document.querySelector('#fxwarn')).not.toBeNull()
    expect(document.querySelector('#fxwarn')!.textContent).toMatch(/over the 0\.1% cap/)
    expect(document.querySelector('#fxgo')!.textContent).toBe('Add anyway')
    act(() => { expect(applyWordFx(six(), 'deesser', false)).toBe(false) })
    expect(getState().data.wordFx).toHaveLength(0)
    click('#fxgo')
    expect(getState().data.wordFx).toHaveLength(1)
    expect(coverage(getState().data, '5', 'reaper').pct).toBeGreaterThan(4.58)
  })
})
