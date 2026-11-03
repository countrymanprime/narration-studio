import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DawResult, DeleteRangeRequest } from '@/domain/daw'
import { EditCut } from '@/domain/schemas'
import { capabilitiesFor, guidOf, rangePlanOf } from '@/selectors/daw'
import { curTime } from '@/selectors/cuts'
import { duplicateRead } from '@/selectors/editing'
import { buildDoc, rangeKeys } from '@/selectors/scriptedit'
import { daw } from '@/state/daw'
import { deleteWords, requestDelete, restoreCut, restoreWords, selectKeys, cutRefusal, DEFAULT_CUT } from '@/state/commands/scriptedit'
import { summarize } from '@/selectors/scriptedit'
import { createInitialState, getState, resetState, undoLast } from '@/state/store'
import { chooseOption } from './helpers/select'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import EditingPage from '@/pages/Editing'
import '@/pages'

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
const runKeys = () => rangeKeys(doc(), '5-3:x0', '5-3:x3')
const take = (pid: string, id: string) => getState().data.passages.find((p) => p.id === pid)!.takes.find((t) => t.id === id)!
const mount = () => render(<><OverlayHost /><EditingPage /></>)
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('deleteRange: the capability behind Delete words and audio', () => {
  it('the matrix: REAPER and the built-in recorder can, Audacity only with backups, nothing while the DAW is not running', () => {
    const gate = (setupName: string, backups = false) => capabilitiesFor(setupName as 'reaper', backups).caps.cutRange
    expect(gate('reaper')).toMatchObject({ available: true, mode: 'native' })
    expect(gate('builtin')).toMatchObject({ available: true, mode: 'app' })
    expect(gate('audacity')).toMatchObject({ available: false })
    expect(gate('audacity')!.reason).toBe('Turn on backups to cut audio in Audacity. It changes the audio itself.')
    expect(gate('audacity', true)).toMatchObject({ available: true, mode: 'steps' })
    expect(gate('reaper-off')).toMatchObject({ available: false, reason: 'REAPER is not running.' })
  })
  it('each DAW says in its own words where the audio goes and how it is undone', () => {
    expect(rangePlanOf({ setup: 'reaper' })).toMatchObject({ mode: 'native', cutSteps: 1, backup: false })
    expect(rangePlanOf({ setup: 'reaper' }).cut).toContain('REAPER splits the item at both ends')
    expect(rangePlanOf({ setup: 'builtin' })).toMatchObject({ mode: 'app', cutSteps: 0 })
    expect(rangePlanOf({ setup: 'builtin' }).cut).toContain('edit list')
    expect(rangePlanOf({ setup: 'audacity' })).toMatchObject({ mode: 'steps', cutSteps: 2, backup: true })
    expect(rangePlanOf({ setup: 'audacity' }).cutUndo).toContain('Two undo steps in Audacity')
  })
  it('the DAW answers a request that passes the schema with a result that passes the schema, and says how many undo steps it added', () => {
    const r = { chapterId: '5', itemKey: 'ps5-3', itemGuid: guidOf('item', 'ps5-3'), start: 166.5, end: 167.9, words: 4, mode: 'close', fadeMs: 12 }
    expect(() => DeleteRangeRequest.parse(r)).not.toThrow()
    const res = daw().deleteRange(DeleteRangeRequest.parse(r))
    expect(() => DawResult.parse(res)).not.toThrow()
    expect(res).toMatchObject({ ok: true, changed: true, undoSteps: 1 })
    expect(res.message).toBe('Deleted 4 words and their audio in REAPER.')
  })
  it('refuses with the capability’s own reason, and a call whose item changed since the app read it', () => {
    setup({ setup: 'audacity' })
    const r = { chapterId: '5', itemKey: 'ps5-3', itemGuid: guidOf('item', 'ps5-3'), start: 1, end: 2, words: 1, mode: 'close' as const, fadeMs: 12 }
    expect(daw().deleteRange(r)).toMatchObject({ ok: false, changed: false, refused: 'Turn on backups to cut audio in Audacity. It changes the audio itself.' })
    setup({ dawStale: true })
    expect(daw().deleteRange(r)).toMatchObject({ ok: false, refused: 'That item changed in REAPER since the app read it. Nothing was changed.' })
  })
})

describe('the DAW’s live project', () => {
  const track = () => daw().tracks().find((t) => t.chapterId === '5')!
  it('a cut that closes the gap splits the item and takes the middle out, so the track is shorter by its length', () => {
    const before = track().items.at(-1)!.end
    const items = track().items.length
    const r = DeleteRangeRequest.parse({ chapterId: '5', itemKey: 'ps5-3', itemGuid: guidOf('item', 'ps5-3'), start: 166.5, end: 168, words: 4, mode: 'close', fadeMs: 12 })
    act(() => { daw().deleteRange(r) })
    expect(track().items.length).toBe(items + 1)
    expect(track().items.at(-1)!.end).toBeCloseTo(before - 1.5, 3)
    expect(track().items.map((i) => [i.start, i.end]).slice(0, 2)).toEqual([[0, 166.5], [166.5, before - 1.5]])
  })
  it('a mute keeps three pieces and the length', () => {
    const before = track().items.at(-1)!.end
    act(() => { daw().deleteRange({ chapterId: '5', itemKey: 'ps5-3', itemGuid: guidOf('item', 'ps5-3'), start: 166.5, end: 168, words: 4, mode: 'gap', fadeMs: 12 }) })
    expect(track().items).toHaveLength(3)
    expect(track().items.at(-1)!.end).toBe(before)
  })
})

describe('Delete words and audio', () => {
  it('asks first: nothing is cut until the dialog is confirmed, and Cancel changes nothing', () => {
    mount()
    act(() => selectKeys(runKeys()))
    act(() => requestDelete())
    const dlg = document.querySelector('#cutdlg')!
    expect(dlg).not.toBeNull()
    expect(within(document.querySelector('.dlg') as HTMLElement).getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-autofocus')
    expect(getState().data.cuts).toHaveLength(0)
    expect(calls('deleteRange')).toHaveLength(0)
    click('.dlg .df .btn:not(.primary)')
    expect(getState().data.cuts).toHaveLength(0)
    expect(calls('deleteRange')).toHaveLength(0)
  })
  it('shows what will be cut: the words, the time range, where it is, where the later audio goes, the choices and how REAPER undoes it', () => {
    mount()
    act(() => selectKeys(runKeys()))
    act(() => requestDelete())
    expect(document.querySelector('.dlg h2')!.textContent).toBe('Delete 4 words and their audio?')
    expect(document.querySelector('#cutwords')!.textContent).toBe('um, sorry, one second')
    expect(document.querySelector('#cutrange')!.textContent).toMatch(/^\d\d:\d\d\.\d to \d\d:\d\d\.\d · \d\.\d s$/)
    expect(document.querySelector('#cutin')!.textContent).toContain('take T05-5')
    expect(document.querySelector('#cutin')!.textContent).toContain('track “Advice from a Caterpillar”')
    expect(document.querySelector('#cutlater')!.textContent).toMatch(/^moves \d\.\d s earlier in this chapter \(\d\d:\d\d\.\d becomes \d\d:\d\d\.\d\)$/)
    expect(screen.getByRole('radio', { name: /Close the gap/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /room tone/ })).not.toBeChecked()
    expect(document.querySelector('#cutfade')!.textContent).toContain('12 ms')
    expect(document.querySelector('#cutkeep')).not.toBeNull()
    expect(document.querySelector('#cutnote')!.textContent).toContain('One undo step in REAPER: Edit > Undo “Narration Studio: delete 4 words and audio”.')
    expect(document.querySelectorAll('.sx-before-after .strip')).toHaveLength(2)
  })
  it('built-in recorder: an entry in the app’s edit list, undone in the app, no DAW call', () => {
    setup({ setup: 'builtin' })
    mount()
    act(() => selectKeys(runKeys()))
    act(() => requestDelete())
    expect(document.querySelector('#cutnote')!.textContent).toContain('edit list')
    expect(document.querySelector('#cutnote')!.textContent).toContain('Undo in the app (Ctrl+Z)')
    expect(document.querySelector('#cutin')!.textContent).toContain('the recorder’s file')
    click('#cutgo')
    expect(getState().data.cuts).toHaveLength(1)
    expect(getState().data.cuts[0].daw).toBe('builtin')
    expect(calls('deleteRange')).toHaveLength(0)
  })
  it('Audacity: the backup is required and shown, and it is made before the DAW is asked', () => {
    setup({ setup: 'audacity' }, (d) => { d.editor.backups = true })
    mount()
    act(() => selectKeys(runKeys()))
    act(() => requestDelete())
    expect(screen.getByRole('checkbox', { name: /Back up the track around the cut \(required\)/ })).toHaveAttribute('data-disabled')
    expect(document.querySelector('#cutnote')!.textContent).toMatch(/copies the track from \d\d:\d\d\.\d to \d\d:\d\d\.\d to Backups/)
    expect(document.querySelector('#cutnote')!.textContent).toContain('Two undo steps in Audacity')
    click('#cutgo')
    const order = daw().calls.map((c) => c.name).filter((n) => ['backupAround', 'deleteRange'].includes(n))
    expect(order).toEqual(['backupAround', 'deleteRange'])
    expect(getState().data.backups).toHaveLength(1)
    expect(getState().data.backups[0].label).toBe('Delete words')
    expect(getState().data.cuts[0].backupId).toBe(getState().data.backups[0].id)
    expect(getState().data.cuts[0].mode).toBe('close')
  })
  it('Audacity without backups is refused with the DAW’s reason, in the toast and on the control', () => {
    setup({ setup: 'audacity' })
    mount()
    act(() => selectKeys(runKeys()))
    act(() => requestDelete())
    expect(toasts()).toContain('Turn on backups to cut audio in Audacity. It changes the audio itself.')
    expect(document.querySelector('#cutdlg')).toBeNull()
    const del = document.querySelector('#sxdel') as HTMLButtonElement
    expect(del.disabled).toBe(true)
    expect(del.getAttribute('title')).toBe('Turn on backups to cut audio in Audacity. It changes the audio itself.')
    expect(getState().data.cuts).toHaveLength(0)
  })
  it('closing the gap: the cut is recorded, the take shortens, the audio after it moves up by the length, and the words are struck', () => {
    const before = doc()
    const sum = summarize(getState().data, before, runKeys())
    const len = sum.ranges[0].end - sum.ranges[0].start
    const lenBefore = take('ps5-3', 'T05-5').len
    const later = { take: take('ps5-5', 'T05-3').start, region: getState().data.fxRegions.find((r) => r.id === 'fx2')!.start, det: getState().data.detections.find((d) => d.id === 'd3')!.sec }
    const nextWord = before.items[before.index.get('5-3:17')!]
    act(() => { deleteWords(runKeys(), DEFAULT_CUT) })
    const s = getState().data
    expect(s.cuts).toHaveLength(1)
    const cut = EditCut.parse(s.cuts[0])
    expect(cut).toMatchObject({ chapterId: '5', pid: '5-3', takeId: 'T05-5', mode: 'close', fadeMs: 12, daw: 'reaper', keys: runKeys(), text: 'um, sorry, one second' })
    expect(cut.b - cut.a).toBeCloseTo(len, 3)
    expect(cut.guid).toMatch(/^\{[0-9A-F-]+\}$/)
    expect(calls('deleteRange')).toHaveLength(1)
    expect(DeleteRangeRequest.parse(calls('deleteRange')[0].args[0])).toMatchObject({ words: 4, mode: 'close', fadeMs: 12, itemKey: 'ps5-3' })
    // The take is shorter by the cut, and everything after it moved up by the same length.
    expect(take('ps5-3', 'T05-5').len).toBeCloseTo(lenBefore - len, 2)
    expect(take('ps5-5', 'T05-3').start).toBeCloseTo(later.take - len, 2)
    expect(s.fxRegions.find((r) => r.id === 'fx2')!.start).toBeCloseTo(later.region - len, 2)
    expect(s.detections.find((d) => d.id === 'd3')!.sec).toBeCloseTo(later.det - len, 2)
    // The words after the cut move up consistently with that; the cut words are struck and have no length.
    const after = doc()
    expect(after.items[after.index.get('5-3:17')!].t0!).toBeCloseTo(nextWord.t0! - len, 2)
    expect(after.items[after.index.get('5-4:0')!].t0!).toBeCloseTo(before.items[before.index.get('5-4:0')!].t0! - len, 2)
    expect(after.items[after.index.get('5-5:0')!].t0!).toBeCloseTo(before.items[before.index.get('5-5:0')!].t0! - len, 2)
    runKeys().forEach((k) => { const it = after.items[after.index.get(k)!]; expect(it.cut).toBe(cut.id); expect(it.t1).toBe(it.t0) })
    expect(after.counts.extra).toBe(5)
    // Word times are placed from the cuts alone, so the same cut gives the same times however the take moved.
    expect(curTime(s.cuts, cut.b)).toBeCloseTo(cut.a, 6)
  })
  it('leaving a gap: nothing after it moves, the take keeps its length', () => {
    const before = doc()
    const lenBefore = take('ps5-3', 'T05-5').len
    const next = take('ps5-5', 'T05-3').start
    act(() => { deleteWords(runKeys(), { ...DEFAULT_CUT, mode: 'gap' }) })
    expect(getState().data.cuts[0].mode).toBe('gap')
    expect(take('ps5-3', 'T05-5').len).toBe(lenBefore)
    expect(take('ps5-5', 'T05-3').start).toBe(next)
    const after = doc()
    expect(after.items[after.index.get('5-3:17')!].t0).toBe(before.items[before.index.get('5-3:17')!].t0)
  })
  it('the crossfade and the pad chosen in the dialog go to the DAW, and a pad cuts less', async () => {
    const full = summarize(getState().data, doc(), runKeys(), 0).len
    mount()
    act(() => selectKeys(runKeys()))
    act(() => requestDelete())
    const whole = document.querySelector('#cutrange')!.textContent
    await chooseOption('#cutfade', '25 ms')
    await chooseOption('#cutpad', '100 ms')
    expect(document.querySelector('#cutrange')!.textContent).not.toBe(whole)
    click('#cutgo')
    expect(calls('deleteRange').at(-1)!.args[0]).toMatchObject({ fadeMs: 25 })
    expect(getState().data.cuts[0].fadeMs).toBe(25)
    const r = getState().data.cuts[0]
    expect(r.b - r.a).toBeCloseTo(full - 0.2, 1)
  })
  it('choosing the room-tone gap in the dialog leaves the length', () => {
    mount()
    act(() => selectKeys(runKeys()))
    act(() => requestDelete())
    click('#cutgap')
    expect(document.querySelector('#cutlater')!.textContent).toMatch(/^does not move; room tone fills/)
    click('#cutgo')
    expect(getState().data.cuts[0].mode).toBe('gap')
  })
  it('one undo step in the app’s history, named, a DAW change; Undo brings the words, the take and the audio after it back', () => {
    const snap = JSON.stringify(getState().data.passages)
    act(() => { deleteWords(runKeys(), DEFAULT_CUT) })
    expect(getState().history.at(-1)).toMatchObject({ label: expect.stringMatching(/^Deleted 4 words and their audio at \d\d:\d\d\.\d$/), daw: true })
    expect(JSON.stringify(getState().data.passages)).not.toBe(snap)
    act(() => { undoLast() })
    expect(getState().data.cuts).toHaveLength(0)
    expect(JSON.stringify(getState().data.passages)).toBe(snap)
    expect(doc().counts.extra).toBe(6)
  })
  it('struck words come back with Restore: the cut is undone, and refused with the reason when something later changed the same audio', () => {
    act(() => { deleteWords(runKeys(), DEFAULT_CUT) })
    const id = getState().data.cuts[0].id
    act(() => { deleteWords(rangeKeys(doc(), '5-5:5', '5-5:7'), DEFAULT_CUT) })
    act(() => { restoreCut(id) })
    expect(toasts().some((m) => m.startsWith('Undo “'))).toBe(true)
    expect(getState().data.cuts).toHaveLength(2)
    act(() => { undoLast() })
    act(() => { restoreWords(runKeys()) })
    expect(getState().data.cuts).toHaveLength(0)
  })
  it('muting is the same cut with the audio kept in place: the gap stays, the words are struck', () => {
    mount()
    act(() => selectKeys(runKeys()))
    act(() => requestDelete(undefined, true))
    expect(document.querySelector('.dlg h2')!.textContent).toBe('Mute 4 words and keep their audio?')
    expect(screen.queryByRole('radio')).toBeNull()
    click('#cutgo')
    expect(getState().data.cuts[0].mode).toBe('gap')
    expect(getState().history.at(-1)!.label).toMatch(/^Muted 4 words at /)
  })
  it('a refusal by the DAW changes nothing in the app (the item changed since it was read)', () => {
    setup({ dawStale: true })
    act(() => { expect(deleteWords(runKeys(), DEFAULT_CUT)).toBe(false) })
    expect(toasts()).toContain('That item changed in REAPER since the app read it. Nothing was changed.')
    expect(getState().data.cuts).toHaveLength(0)
    expect(getState().history).toHaveLength(0)
  })
  it('words with no audio, or already cut, are not offered; low-confidence words are named in the dialog', () => {
    const sum = summarize(getState().data, doc(), ['5-3:40'])
    expect(cutRefusal(sum)).toBe('There is no audio for these words.')
    mount()
    act(() => selectKeys(rangeKeys(doc(), '5-3:13', '5-3:16')))
    act(() => requestDelete())
    expect(document.querySelector('#cutlow')!.textContent).toBe('Includes 1 low-confidence word.')
    closeTopModal()
    act(() => { deleteWords(runKeys(), DEFAULT_CUT) })
    expect(cutRefusal(summarize(getState().data, doc(), runKeys()))).toBe('These words are cut already.')
  })
  it('a selection across two paragraphs is one cut for each, run together as one undo step', () => {
    const keys = rangeKeys(doc(), '5-3:38', '5-4:2')
    act(() => { deleteWords(keys, DEFAULT_CUT) })
    expect(getState().data.cuts.map((c) => c.pid)).toEqual(['5-3', '5-4'])
    expect(calls('deleteRange')).toHaveLength(2)
    expect(getState().history).toHaveLength(1)
    act(() => { undoLast() })
    expect(getState().data.cuts).toHaveLength(0)
  })
  it('cutting the second read of a line that was read twice settles the duplicate', () => {
    const keys = ['5-15:x0', '5-15:x1', '5-15:x2', '5-15:x3']
    expect(duplicateRead(getState().data, getState().data.passages.find((p) => p.id === 'ps5-15')!)).not.toBeNull()
    act(() => { deleteWords(keys, DEFAULT_CUT) })
    expect(duplicateRead(getState().data, getState().data.passages.find((p) => p.id === 'ps5-15')!)).toBeNull()
    expect(take('ps5-15', 'T05-12').len).toBeLessThan(5)
  })
  it('the struck words stay in the text and Restore is offered on the bar', () => {
    mount()
    act(() => { deleteWords(runKeys(), DEFAULT_CUT) })
    expect(document.querySelectorAll('.xw.cutw')).toHaveLength(4)
    act(() => selectKeys(runKeys()))
    expect(document.querySelector('#sxrestore')).not.toBeNull()
    expect(document.querySelector('#sxdel')).toBeNull()
    click('#sxrestore')
    expect(getState().data.cuts).toHaveLength(0)
    expect(document.querySelectorAll('.xw.cutw')).toHaveLength(0)
  })
})
