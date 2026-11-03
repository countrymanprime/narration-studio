import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalKeys } from '@/app/keys'
import { setTakeMeasureProvider, createMockTakeMeasures, takeMeasures } from '@/providers/takes'
import { backupsDue, backupsOf } from '@/selectors/backups'
import { capabilitiesFor } from '@/selectors/daw'
import { duplicateRead, passagesOf, tabsFor } from '@/selectors/editing'
import { mergePassages, passagesFromMap, spansOf } from '@/selectors/passagemap'
import { confidenceLabel, suggestTake } from '@/selectors/takes'
import { backupBefore, pruneBackups, restoreBackup, setBackupSetting } from '@/state/commands/backups'
import { applyPrep, keepTake, splitDuplicate } from '@/state/commands/editing'
import { startFromHere, stopBoothTimers } from '@/state/commands/booth'
import { daw } from '@/state/daw'
import { initialPrefs } from '@/state/slices/ui'
import { createInitialState, getState, resetState, update as rawUpdate } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import BoothPage from '@/pages/Booth'
import EditingPage from '@/pages/Editing'
import '@/pages'

const update: typeof rawUpdate = (fn) => { rtlAct(() => rawUpdate(fn)) }
const act = (fn: () => void) => rtlAct(fn)
const setup = (mock: Partial<ReturnType<typeof getState>['mock']> = {}, ui: (u: ReturnType<typeof getState>['ui']) => void = () => {}) => {
  const s = createInitialState({ prefs: initialPrefs })
  s.ui.page = 'editing'
  s.ui.chapter = '5'
  s.mock = { ...s.mock, ...mock }
  ui(s.ui)
  resetState(s)
  daw().calls.length = 0
}
const passage = (id: string) => getState().data.passages.find((p) => p.id === id)!
const toasts = () => getOverlay().toasts.map((t) => t.msg)
const calls = (n: string) => daw().calls.filter((c) => c.name === n)
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })
const mount = () => render(<><OverlayHost /><EditingPage /></>)
const dialog = () => document.querySelector('.dlg')

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  stopBoothTimers()
  vi.useRealTimers()
  setTakeMeasureProvider(createMockTakeMeasures())
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('suggesting a take', () => {
  it('takes recorded at different levels are not comparable: the suggestion has no confidence, says why and offers the steps first', () => {
    const s = suggestTake(getState().data, passage('ps5-9'))
    expect(s.take!.id).toBe('T05-9')
    expect(s.confidence).toBeNull()
    expect(s.reason).toMatch(/recorded 3\.9 dB apart.*Normalise/)
    expect(s.steps.map((x) => [x.id, x.done, x.needed])).toEqual([['trim-silence', false, true], ['trim-breaths', false, true], ['normalise', false, true]])
    expect(confidenceLabel(null)).toBe('Not comparable yet')
  })

  it('confidence appears once the levels match and improves as the trims are applied, never made up in between', () => {
    const b = () => getState().data
    const set = (steps: string[]) => update((d) => { d.data.passages.find((p) => p.id === 'ps5-9')!.prepped = steps })
    set(['normalise'])
    const a = suggestTake(b(), passage('ps5-9'))
    expect(a.confidence).not.toBeNull()
    expect(a.confidence!).toBeGreaterThan(0)
    expect(a.take!.id).toBe('T05-9')
    set(['normalise', 'trim-silence'])
    const c = suggestTake(b(), passage('ps5-9'))
    set(['normalise', 'trim-silence', 'trim-breaths'])
    const d = suggestTake(b(), passage('ps5-9'))
    expect(c.confidence!).toBeGreaterThan(a.confidence!)
    expect(d.confidence!).toBeGreaterThan(c.confidence!)
    expect(d.steps.every((x) => x.done && !x.needed)).toBe(true)
  })

  it('takes already at one level can be compared at once, and a take measured by nothing gets no confidence', () => {
    expect(suggestTake(getState().data, passage('ps3-1')).confidence).not.toBeNull()
    update((d) => { d.mock.measurements = 'none' })
    const s = suggestTake(getState().data, passage('ps3-1'))
    expect(s.confidence).toBeNull()
    expect(s.reason).toMatch(/Nothing has been measured yet/)
    expect(s.evidence.every((e) => !e.measured.ok)).toBe(true)
  })

  it('the measurements come from the provider, so another provider changes the evidence', () => {
    const base = createMockTakeMeasures()
    setTakeMeasureProvider({ measure: (id, applied) => { const r = base.measure(id, applied); return r.ok ? { ok: true, value: { ...r.value, rms: -20 } } : r } })
    expect(suggestTake(getState().data, passage('ps5-9')).spread).toBe(0)
    expect(takeMeasures()).toBeDefined()
  })

  it('the page shows each take with its evidence, the suggestion with its confidence and the steps; nothing is applied by itself', () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-9', openTakes: ['ps5-9'] } })
    mount()
    expect(document.querySelector('[data-ev="T05-9"]')!.textContent).toContain('Matched')
    expect(document.querySelector('[data-ev="T05-9"]')!.textContent).toContain('Pause 1.0 s')
    expect(document.querySelector('[data-conf]')!.textContent).toBe('Not comparable yet')
    expect(document.querySelector('[data-why]')!.textContent).toMatch(/Normalise/)
    expect([...document.querySelectorAll('[data-prep]')].map((b) => b.textContent!.trim())).toEqual(['Trim white space', 'Trim breaths', 'Normalise'])
    expect(passage('ps5-9').prepped).toEqual([])
    expect(passage('ps5-9').kept).toBe(false)
    expect(calls('applyFix')).toHaveLength(0)
    expect(within(document.querySelector('[data-take="T05-9"]') as HTMLElement).getByText('Suggested')).toBeInTheDocument()
  })

  it('a prep step goes through the DAW, is one undo, and the suggestion is worked out again', () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-9', openTakes: ['ps5-9'] } })
    mount()
    click('[data-prep="normalise"]')
    expect(passage('ps5-9').prepped).toEqual(['normalise'])
    expect(calls('applyFix').at(-1)!.args.slice(0, 2)).toEqual(['normalise', 4])
    expect(getState().history.at(-1)).toMatchObject({ daw: true })
    expect(document.querySelector('[data-conf]')!.textContent).toMatch(/^(Low|Medium|High) · 0\.\d\d$/)
    expect(document.querySelector('[data-prep="normalise"]')).toBeDisabled()
    click('[data-prep="trim-silence"]')
    expect(calls('trimGaps')).toHaveLength(1)
    expect(passage('ps5-9').prepped).toEqual(['normalise', 'trim-silence'])
  })

  it('in Audacity the prep step is refused with the DAW\'s reason and nothing changes', () => {
    setup({ setup: 'audacity' })
    act(() => applyPrep('ps5-9', 'normalise'))
    expect(passage('ps5-9').prepped).toEqual([])
    expect(toasts()).toContain('Not available for Audacity yet.')
  })
})

describe('Hide other takes', () => {
  it('is the only way to clear takes: the DAW has no call that deletes them', () => {
    expect('removeTakes' in daw()).toBe(false)
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-5', openTakes: ['ps5-5'] } })
    act(() => keepTake('ps5-5', 'T05-2'))
    mount()
    click('#thide')
    expect(calls('hideTakes')).toHaveLength(1)
    expect(passage('ps5-5').takes.filter((t) => t.hidden).map((t) => t.id)).toEqual(['T05-1', 'T05-3'])
  })

  it('the suggestion ignores hidden takes', () => {
    act(() => keepTake('ps5-5', 'T05-2'))
    update((d) => { d.data.passages.find((p) => p.id === 'ps5-5')!.takes.forEach((t) => { if (!t.active) t.hidden = true }) })
    expect(suggestTake(getState().data, passage('ps5-5')).evidence.map((e) => e.take.id)).toEqual(['T05-2'])
  })
})

describe('the passage map', () => {
  const Harness = () => { useGlobalKeys(); return <><OverlayHost /><BoothPage /></> }
  const key = (k: string) => rtlAct(() => { fireEvent.keyDown(document.body, { key: k }) })
  const tick = (ms: number) => rtlAct(() => { vi.advanceTimersByTime(ms) })

  function recordWithRestart() {
    vi.useFakeTimers()
    setup({}, (u) => { u.page = 'booth'; u.chapter = '8' })
    render(<Harness />)
    key(' ')
    tick(12_000)
    act(() => startFromHere(0))
    tick(6_000)
    key(' ')
  }

  it('the Booth writes where each take began and ended, with the ids the DAW gave it, and Editing lists the passage from the log', () => {
    recordWithRestart()
    const map = getState().data.passageMap
    expect(map.map((m) => m.kind)).toEqual(['start', 'roll', 'stop'])
    expect(map[0]).toMatchObject({ chapterId: '8', pid: '8-1', word: 0, sec: 0 })
    expect(map[1]).toMatchObject({ pid: '8-1', word: 0, sec: 12 })
    expect(map[1].prev!.pid).toBe('8-1')
    expect(map.every((m) => m.run === map[0].run && m.itemGuid && m.takeGuid)).toBe(true)
    expect(map[0].takeGuid).not.toBe(map[1].takeGuid)
    const item = daw().tracks().find((t) => t.chapterId === '8')!.items.at(-1)!
    expect(map[0].itemGuid).toBe(item.guid)
    const p = getState().data.passages.find((x) => x.id === 'pm-8-8-1')!
    expect(p.takes).toHaveLength(2)
    expect(p.takes.every((t) => t.via === 'map' && t.itemGuid === item.guid)).toBe(true)
    expect(p.takes.filter((t) => t.active)).toHaveLength(1)
    expect(passagesOf(getState().data, '8').map((x) => x.id)).toContain('pm-8-8-1')
  })

  it('Editing shows a passage from the Booth as placed exactly, and one recorded elsewhere as aligned', () => {
    recordWithRestart()
    cleanup()
    update((d) => { d.ui.page = 'editing' })
    mount()
    const open = (ids: string[]) => rtlAct(() => { update((d) => { d.ui.editing.openTakes = ids }) })
    open(['pm-8-8-1'])
    expect(document.querySelector('[data-takes="pm-8-8-1"]')!.textContent).toContain('Booth')
    update((d) => { d.ui.chapter = '5' })
    open(['ps5-9'])
    expect(document.querySelector('[data-takes="ps5-9"]')!.textContent).toContain('Aligned')
    update((d) => { d.ui.chapter = '3' })
    open(['ps3-1'])
    expect(document.querySelector('[data-takes="ps3-1"]')!.textContent).toContain('Booth')
  })

  it('works out passages from marks alone: a paragraph covered by two takes, and a roll back to an earlier one', () => {
    const paras = getState().data.paragraphs.filter((p) => p.chapterId === '8').slice(0, 3)
    const m = (id: string, kind: 'start' | 'roll' | 'stop', pid: string, word: number, sec: number, prev?: { pid: string; word: number }) =>
      ({ id, run: 'r', chapterId: '8', pid, word, sec, kind, prev, itemGuid: 'I', takeGuid: 'T' + id })
    // Take 1 reads ¶1 whole and a little of ¶2, then rolls back to ¶2; take 2 reads ¶2 and stops at the end of it.
    const marks = [m('1', 'start', paras[0].id, 0, 0), m('2', 'roll', paras[1].id, 0, 30, { pid: paras[1].id, word: 5 }), m('3', 'stop', paras[1].id, 5, 45, { pid: paras[1].id, word: 25 })]
    expect(spansOf(marks)).toHaveLength(2)
    const ps = passagesFromMap(marks, paras, '8', 'reaper')
    expect(ps.map((p) => p.pid)).toEqual([paras[1].id])
    expect(ps[0].takes.map((t) => t.via)).toEqual(['map', 'map'])
    // Merging keeps what the narrator chose.
    const chosen = { ...ps[0], kept: true, prepped: ['normalise'], takes: ps[0].takes.map((t, i) => ({ ...t, active: i === 0 })) }
    const merged = mergePassages([chosen], ps)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ kept: true, prepped: ['normalise'] })
    expect(merged[0].takes[0].active).toBe(true)
  })

  it('a take recorded in Audacity is a clip and in the built-in recorder the app\'s own take', () => {
    vi.useFakeTimers()
    setup({ setup: 'audacity' }, (u) => { u.page = 'booth'; u.chapter = '8' })
    update((d) => { d.data.editor.backups = true })
    render(<Harness />)
    key(' ')
    tick(12_000)
    act(() => startFromHere(0))
    tick(5_000)
    key(' ')
    expect(getState().data.passages.find((x) => x.id === 'pm-8-8-1')!.takes.map((t) => t.source)).toEqual(['clip', 'clip'])
  })
})

describe('splitting a duplicate read into takes', () => {
  it('finds a take that reads the line twice and where the second read starts', () => {
    const d = duplicateRead(getState().data, passage('ps5-15'))!
    expect(d.first).toBe('“Serpent!” screamed the Pigeon.')
    expect(d.second).toBe('“Serpent!” screamed the Pigeon.')
    expect(d.at).toBeCloseTo(621.2, 1)
    expect(duplicateRead(getState().data, passage('ps5-5'))).toBeNull()
    expect(passagesOf(getState().data, '5').map((p) => p.id)).toContain('ps5-15')
  })

  it('makes the cut in the DAW when it can, and the passage then has two takes to choose between', () => {
    setup({}, (u) => { u.editing = { ...u.editing, passage: 'ps5-15', openTakes: ['ps5-15'] } })
    mount()
    expect(document.getElementById('dupnote')!.textContent).toMatch(/reads the line twice/)
    expect(document.querySelector('[data-tkeep]')).toBeNull()
    click('#tsplit')
    expect(calls('splitTake')).toHaveLength(1)
    expect(passage('ps5-15').takes.map((t) => t.id)).toEqual(['T05-12a', 'T05-12b'])
    expect(passage('ps5-15').takes.filter((t) => t.active).map((t) => t.id)).toEqual(['T05-12b'])
    expect(getState().history.at(-1)).toMatchObject({ daw: true })
    expect(duplicateRead(getState().data, passage('ps5-15'))).toBeNull()
  })

  it('the built-in recorder cuts its own take without asking a DAW', () => {
    setup({ setup: 'builtin' })
    act(() => splitDuplicate('ps5-15'))
    expect(calls('splitTake')).toHaveLength(0)
    expect(passage('ps5-15').takes).toHaveLength(2)
  })

  it('a DAW that cannot cut refuses with its reason and the take stays whole', () => {
    setup({ setup: 'reaper-off' })
    act(() => splitDuplicate('ps5-15'))
    expect(passage('ps5-15').takes).toHaveLength(1)
    expect(toasts()).toContain('REAPER is not running.')
    cleanup()
    setup({ setup: 'audacity' })
    act(() => splitDuplicate('ps5-15'))
    expect(passage('ps5-15').takes).toHaveLength(1)
    expect(toasts()).toContain('Audacity keeps no takes. Turn on backups to keep them.')
  })

  it('in Audacity with backups the audio around the cut is backed up first, then cut', () => {
    setup({ setup: 'audacity' })
    update((d) => { d.data.editor.backups = true })
    act(() => splitDuplicate('ps5-15'))
    expect(getState().data.backups).toHaveLength(1)
    expect(getState().data.backups[0].label).toBe('Split a duplicate read')
    expect(calls('backupAround')).toHaveLength(1)
    expect(passage('ps5-15').takes).toHaveLength(2)
    expect(daw().calls.map((c) => c.name).indexOf('backupAround')).toBeLessThan(daw().calls.map((c) => c.name).indexOf('splitTake'))
  })
})

describe('Audacity backups', () => {
  it('the roll is destructive exactly when backups are off, and the capability reads the setting', () => {
    setup({ setup: 'audacity' })
    expect(daw().capabilities().caps.roll.destructive).toBe(true)
    expect(daw().capabilities().caps.backups).toMatchObject({ available: false, reason: 'Backups are off.' })
    update((d) => { d.data.editor.backups = true })
    expect(daw().capabilities().caps.roll.destructive).toBe(false)
    expect(daw().capabilities().caps.takes.available).toBe(true)
    expect(capabilitiesFor('audacity', true).caps.backups.available).toBe(true)
  })

  it('a roll in Audacity with backups clones the audio around it first and does not ask; without them it asks and clones nothing', () => {
    const Harness = () => { useGlobalKeys(); return <><OverlayHost /><BoothPage /></> }
    const key = (k: string) => rtlAct(() => { fireEvent.keyDown(document.body, { key: k }) })
    vi.useFakeTimers()
    setup({ setup: 'audacity' }, (u) => { u.page = 'booth'; u.chapter = '5' })
    render(<Harness />)
    key(' ')
    key('r')
    expect(dialog()).not.toBeNull()
    expect(getState().data.backups).toHaveLength(0)
    rtlAct(() => { fireEvent.click(screen.getByRole('button', { name: 'Keep recording' })) })
    key(' ')
    cleanup()
    stopBoothTimers()
    setup({ setup: 'audacity' }, (u) => { u.page = 'booth'; u.chapter = '5' })
    update((d) => { d.data.editor.backups = true })
    render(<Harness />)
    key(' ')
    key('r')
    expect(dialog()).toBeNull()
    expect(getState().data.backups).toHaveLength(1)
    expect(getState().data.backups[0]).toMatchObject({ chapterId: '5' })
    expect(calls('backupAround')).toHaveLength(1)
  })

  it('clones about a minute or two either side (the window is a setting), never past the audio there is', () => {
    setup({ setup: 'audacity' })
    update((d) => { d.data.editor.backups = true })
    const end = daw().tracks().find((t) => t.chapterId === '5')!.items[0].end
    let b = backupBefore('5', 300, 'Test')!
    expect([b.start, b.end]).toEqual([210, 390])
    setBackupSetting({ backupWindow: 60 })
    b = backupBefore('5', 300, 'Test')!
    expect([b.start, b.end]).toEqual([240, 360])
    b = backupBefore('5', 10, 'Test')!
    expect(b.start).toBe(0)
    b = backupBefore('5', end - 5, 'Test')!
    expect(b.end).toBe(end)
    expect(backupBefore('12', 100, 'Test')).toBeNull()
  })

  it('does nothing where the DAW keeps no backups', () => {
    expect(backupBefore('5', 300, 'Test')).toBeNull()
    setup({ setup: 'audacity' })
    expect(backupBefore('5', 300, 'Test')).toBeNull()
    expect(getState().data.backups).toHaveLength(0)
  })

  it('backups older than the retention setting go; shortening the setting prunes at once', () => {
    setup({ setup: 'audacity' })
    update((d) => {
      d.data.editor.backups = true
      d.data.backups.push(
        { id: 'bk1', chapterId: '5', guid: 'g1', start: 0, end: 10, at: '2026-09-01', label: 'old' },
        { id: 'bk2', chapterId: '5', guid: 'g2', start: 0, end: 10, at: '2026-09-20', label: 'recent' },
      )
    })
    expect(backupsDue(getState().data)).toEqual(['bk1'])
    expect(pruneBackups()).toBe(1)
    expect(getState().data.backups.map((b) => b.id)).toEqual(['bk2'])
    act(() => setBackupSetting({ backupKeepDays: 3 }))
    expect(getState().data.backups).toHaveLength(0)
  })

  it('restores a backup through the DAW as one undo step; the DAW refuses one it does not hold', () => {
    setup({ setup: 'audacity' })
    update((d) => { d.data.editor.backups = true })
    const b = backupBefore('5', 300, 'Roll again from ¶ 3')!
    act(() => { expect(restoreBackup(b.id)).toBe(true) })
    expect(calls('restoreBackup')).toHaveLength(1)
    expect(getState().data.backups[0].restored).toBe('2026-09-26')
    expect(getState().history.at(-1)).toMatchObject({ label: 'Put back Roll again from ¶ 3', daw: true })
    update((d) => { d.data.backups.push({ id: 'bk9', chapterId: '5', guid: 'unknown', start: 0, end: 5, at: '2026-09-26', label: 'gone' }) })
    act(() => { expect(restoreBackup('bk9')).toBe(false) })
    expect(toasts()).toContain('There is no backup of that audio in Audacity. Nothing was changed.')
    expect(backupsOf(getState().data, '5').map((x) => x.id)[0]).toBe('bk9')
  })

  it('the Backups tab is there for Audacity only, lists them, holds the settings and puts one back', () => {
    expect(tabsFor('reaper', true).map(([k]) => k)).toEqual(['cleanup', 'effects'])
    expect(tabsFor('builtin', true).map(([k]) => k)).toEqual(['cleanup', 'effects'])
    expect(tabsFor('audacity', true).map(([k]) => k)).toEqual(['cleanup', 'effects', 'backups'])
    // Where the strip does not fit, the timeline is a part of the drawer.
    expect(tabsFor('reaper', false).map(([k]) => k)).toEqual(['cleanup', 'effects', 'timeline'])
    setup({ setup: 'audacity' }, (u) => { u.editing = { ...u.editing, drawer: 'backups' } })
    mount()
    expect(screen.getByText('Backups are off.', { selector: 'h3' })).toBeInTheDocument()
    click('#bkon')
    expect(getState().data.editor.backups).toBe(true)
    let b!: NonNullable<ReturnType<typeof backupBefore>>
    act(() => { b = backupBefore('5', 300, 'Roll again from ¶ 3')! })
    expect(document.querySelector('tr[data-bk="' + b.id + '"]')!.textContent).toContain('Roll again from ¶ 3')
    expect((document.getElementById('bkwin') as HTMLInputElement).value).toBe('90')
    fireEvent.change(document.getElementById('bkwin')!, { target: { value: '120' } })
    fireEvent.blur(document.getElementById('bkwin')!)
    expect(getState().data.editor.backupWindow).toBe(120)
    click('[data-bkrestore="' + b.id + '"]')
    expect(getState().data.backups[0].restored).toBeDefined()
  })

  it('Audacity keeps clip-takes once backups are on: keep a clip through the DAW, and the lanes say Audacity clip', () => {
    setup({ setup: 'audacity' }, (u) => { u.editing = { ...u.editing, passage: 'ps5-5', openTakes: ['ps5-5'] } })
    mount()
    expect(document.getElementById('takesnote')!.textContent).toBe('Audacity keeps no takes. Turn on backups to keep them.')
    expect((document.querySelector('[data-tkeep="T05-1"]') as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    update((d) => { d.data.editor.backups = true })
    mount()
    expect(document.querySelectorAll('[data-take]')[0].textContent).toContain('Audacity clip')
    click('[data-tkeep="T05-2"]')
    expect(calls('setActiveTake')).toHaveLength(1)
    expect(passage('ps5-5').kept).toBe(true)
  })
})
