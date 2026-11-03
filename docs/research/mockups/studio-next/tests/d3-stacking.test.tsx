import { act as rtlAct, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Passage } from '@/domain/schemas'
import { DawResult, PassageStackSchemaCheck } from './helpers/stackSchemas'
import { stopBoothTimers } from '@/state/commands/booth'
import { capabilitiesFor, stackPlanOf } from '@/selectors/daw'
import { passagesOf } from '@/selectors/editing'
import { mergePassages } from '@/selectors/passagemap'
import {
  canCleanUp, canStack, itemGuidOf, canUnstack, chapterRetryMode, isStacked, movableTakes, passageEnd, retryModeOf, stackGeometry, stackPlan, stackable, stackableCount, unstackGeometry,
} from '@/selectors/stacking'
import { setBackupSetting } from '@/state/commands/backups'
import { keepTake } from '@/state/commands/editing'
import { cleanUpOtherReads, requestCleanUp, requestStack, requestUnstack, setRetryMode, stackRetries, unstackRetries } from '@/state/commands/stacking'
import { daw } from '@/state/daw'
import { initialPrefs } from '@/state/slices/ui'
import { createInitialState, getState, resetState, undoLast, update as rawUpdate } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import EditingPage from '@/pages/Editing'
import '@/pages'

const update: typeof rawUpdate = (fn) => { rtlAct(() => rawUpdate(fn)) }
const act = (fn: () => void) => rtlAct(fn)
const setup = (mock: Partial<ReturnType<typeof getState>['mock']> = {}) => {
  const s = createInitialState({ prefs: initialPrefs })
  s.ui.page = 'editing'
  s.ui.chapter = '5'
  s.mock = { ...s.mock, ...mock }
  resetState(s)
  daw().calls.length = 0
}
const data = () => getState().data
const passage = (id: string) => data().passages.find((p) => p.id === id)!
const starts = (id: string) => Object.fromEntries(passage(id).takes.map((t) => [t.id, t.start]))
const toasts = () => getOverlay().toasts.map((t) => t.msg)
const calls = (n: string) => daw().calls.filter((c) => c.name === n)
const click = (sel: string) => rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })
/* The chapter's retry choice lives in the drawer; a passage's takes open from the chip under its line. */
const mount = () => { rawUpdate((d) => { d.ui.editing.drawer = 'cleanup' }); return render(<><OverlayHost /><EditingPage /></>) }
const dialog = () => document.querySelector('.dlg')
const stackChapter = () => setRetryMode({ chapter: '5' }, 'stack')
const snapshot = () => JSON.stringify(data().passages.map((p) => p.takes.map((t) => [t.id, t.start])))

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  stopBoothTimers()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('the capability to stack takes', () => {
  const cap = (setupId: 'reaper' | 'reaper-off' | 'builtin' | 'audacity', backups = false) => capabilitiesFor(setupId, backups).caps.stackTakes

  it('REAPER does it natively as one undo step, the built-in recorder in the app, and neither is destructive', () => {
    expect(cap('reaper')).toMatchObject({ available: true, mode: 'native' })
    expect(cap('builtin')).toMatchObject({ available: true, mode: 'app' })
    expect(stackPlanOf({ setup: 'reaper' })).toMatchObject({ mode: 'native', undoSteps: 1, steps: [] })
    expect(stackPlanOf({ setup: 'builtin' })).toMatchObject({ mode: 'app', undoSteps: 0, steps: [] })
  })

  it('REAPER that is not running offers nothing and says why', () => {
    expect(cap('reaper-off')).toMatchObject({ available: false, reason: 'REAPER is not running.' })
  })

  it('Audacity can stack only with backups on; the reason says so; with them it is a multi-step change', () => {
    expect(cap('audacity')).toMatchObject({ available: false, reason: 'Turn on backups to stack takes in Audacity.' })
    expect(cap('audacity', true)).toMatchObject({ available: true, mode: 'steps' })
    update((d) => { d.mock.setup = 'audacity' })
    setBackupSetting({ backups: true })
    const plan = stackPlanOf(getState().mock)
    expect(plan.mode).toBe('steps')
    expect(plan.steps).toHaveLength(5)
    expect(plan.undoSteps).toBe(5)
    expect(plan.undo).toContain('5 undo steps')
    expect(plan.undo).toContain('Audacity')
  })

  it('a stack result is a DawResult with its undo steps, and a multi-step one lists the edits', () => {
    update((d) => { d.mock.setup = 'audacity' })
    setBackupSetting({ backups: true })
    const g = stackGeometry(passage('ps5-3'))
    const r = daw().stackTakes({ chapterId: '5', groups: [{ passageId: 'ps5-3', itemGuid: itemGuidOf(g.passage), base: g.base.id, moves: g.moves }], shift: g.shift })
    expect(DawResult.safeParse(r).success).toBe(true)
    expect(r).toMatchObject({ ok: true, undoSteps: 5 })
    expect(r.steps).toHaveLength(5)
  })
})

describe('how retries are kept', () => {
  it('defaults to leaving takes where they are; a passage follows its chapter, which follows the project', () => {
    expect(data().editor.retryMode).toBe('leave')
    const p = passage('ps5-3')
    expect(chapterRetryMode(data(), '5')).toBe('leave')
    expect(retryModeOf(data(), p)).toBe('leave')
    setRetryMode('project', 'stack')
    expect(retryModeOf(data(), passage('ps5-3'))).toBe('stack')
    setRetryMode({ chapter: '5' }, 'leave')
    expect(retryModeOf(data(), passage('ps5-3'))).toBe('leave')
    setRetryMode({ passage: 'ps5-3' }, 'stack')
    expect(retryModeOf(data(), passage('ps5-3'))).toBe('stack')
    expect(retryModeOf(data(), passage('ps5-5'))).toBe('leave')
    setRetryMode({ passage: 'ps5-3' }, null)
    expect(retryModeOf(data(), passage('ps5-3'))).toBe('leave')
    setRetryMode({ chapter: '5' }, null)
    expect(retryModeOf(data(), passage('ps5-3'))).toBe('stack')
  })

  it('the stored settings and the stack on a passage are valid against the schema, and ids are stable', () => {
    stackChapter()
    stackRetries('5', ['ps5-3'])
    expect(PassageStackSchemaCheck(passage('ps5-3').stack)).toBe(true)
    expect(passage('ps5-3').stack!.id).toBe('stk-ps5-3')
  })

  it('nothing is stacked by itself: choosing stack only suggests, with a count', () => {
    const before = snapshot()
    stackChapter()
    expect(snapshot()).toBe(before)
    expect(stackableCount(data(), '5')).toBe(7)
    expect(stackable(data(), '5').map((p) => p.id)).toEqual(['ps5-3', 'ps5-5', 'ps5-9', 'ps5-14'])
    expect(stackableCount(data(), '3')).toBe(0)
  })

  it('a duplicate read is not a retry group until it is split into takes', () => {
    stackChapter()
    expect(canStack(passage('ps5-15'))).toBe(false)
  })

  it('the page shows the count only in the stack choice and the choice moves nothing', () => {
    mount()
    expect(document.querySelector('#stackcount')).toBeNull()
    expect(document.querySelector('#stackall')).toBeNull()
    act(() => stackChapter())
    expect(document.querySelector('#stackcount')!.textContent).toBe('7 retries can be stacked')
    expect(document.querySelector('#stackall')).not.toBeNull()
  })
})

describe('stacking retries', () => {
  it('puts every later read on the first read: the same position, the first read does not move', () => {
    stackChapter()
    const first = starts('ps5-5')
    expect(stackRetries('5', ['ps5-5'])).toBe(true)
    const p = passage('ps5-5')
    expect(p.takes.map((t) => t.start)).toEqual([first['T05-1'], first['T05-1'], first['T05-1']])
    expect(p.takes.map((t) => t.len)).toEqual([5, 8, 9])
    expect(isStacked(p)).toBe(true)
    expect(p.stack!.base).toBe('T05-1')
    expect(Object.keys(p.stack!.offsets)).toEqual(['T05-2', 'T05-3'])
    expect(p.stack!.offsets['T05-2']).toBeCloseTo(6.7, 5)
  })

  it('the audio that follows moves up by what the retries took, and nothing overlaps afterwards', () => {
    stackChapter()
    const after = starts('ps5-9')
    const g = stackGeometry(passage('ps5-5'))
    expect(g.shift).toBeLessThan(0)
    stackRetries('5', ['ps5-5'])
    const moved = starts('ps5-9')
    expect(moved['T05-6']).toBeCloseTo(after['T05-6'] + g.shift, 5)
    const ordered = passagesOf(data(), '5')
    for (let i = 1; i < ordered.length; i++) expect(Math.min(...ordered[i].takes.map((t) => t.start))).toBeGreaterThanOrEqual(passageEnd(ordered[i - 1]) - 0.05)
    expect(starts('ps5-3')).toEqual({ 'T05-4': 150.2, 'T05-5': 164 })
  })

  it('stacking the whole chapter keeps every passage apart and is one history entry', () => {
    stackChapter()
    const n = getState().history.length
    expect(stackRetries('5', stackable(data(), '5').map((p) => p.id))).toBe(true)
    expect(getState().history.length).toBe(n + 1)
    expect(getState().history.at(-1)!.label).toBe('Stacked 7 retries as takes')
    expect(getState().history.at(-1)!.daw).toBe(true)
    const ordered = passagesOf(data(), '5')
    ordered.forEach((p) => expect(new Set(p.takes.map((t) => t.start)).size).toBe(1))
    for (let i = 1; i < ordered.length; i++) expect(Math.min(...ordered[i].takes.map((t) => t.start))).toBeGreaterThanOrEqual(passageEnd(ordered[i - 1]) - 0.05)
    expect(stackableCount(data(), '5')).toBe(0)
  })

  it('findings and effects that followed move with the audio', () => {
    stackChapter()
    const det = data().detections.find((x) => x.id === 'd5')!.sec
    const early = data().detections.find((x) => x.id === 'b1')!.sec
    const g = stackGeometry(passage('ps5-3'))
    expect(g.shift).toBeLessThan(0)
    stackRetries('5', ['ps5-3'])
    expect(data().detections.find((x) => x.id === 'd5')!.sec).toBeCloseTo(det + g.shift, 5)
    expect(data().detections.find((x) => x.id === 'b1')!.sec).toBe(early)
  })

  it('undo puts everything back as it was in one step', () => {
    stackChapter()
    const before = snapshot()
    stackRetries('5', stackable(data(), '5').map((p) => p.id))
    expect(snapshot()).not.toBe(before)
    expect(undoLast().ok).toBe(true)
    expect(snapshot()).toBe(before)
    expect(passage('ps5-3').stack).toBeUndefined()
  })

  it('REAPER is asked and answers one undo step; the built-in recorder is not asked', () => {
    stackChapter()
    stackRetries('5', ['ps5-3'])
    expect(calls('stackTakes')).toHaveLength(1)
    setup({ setup: 'builtin' })
    stackChapter()
    stackRetries('5', ['ps5-3'])
    expect(calls('stackTakes')).toHaveLength(0)
    expect(isStacked(passage('ps5-3'))).toBe(true)
  })

  it('refuses with the capability reason when REAPER is not running, and changes nothing', () => {
    setup({ setup: 'reaper-off' })
    stackChapter()
    const before = snapshot()
    expect(stackRetries('5', ['ps5-3'])).toBe(false)
    expect(snapshot()).toBe(before)
    expect(toasts()).toContain('REAPER is not running.')
  })

  it('refuses when the DAW re-created its items since the app read them, and changes nothing', () => {
    stackChapter()
    update((d) => { d.mock.dawStale = true })
    const before = snapshot()
    expect(stackRetries('5', ['ps5-3'])).toBe(false)
    expect(snapshot()).toBe(before)
    expect(toasts().join(' ')).toMatch(/changed in REAPER since the app read it/)
    expect(getState().history.some((h) => /Stacked/.test(h.label))).toBe(false)
  })

  it('a passage with a kept take cannot be stacked', () => {
    stackChapter()
    keepTake('ps5-3', 'T05-4')
    expect(canStack(passage('ps5-3'))).toBe(false)
    expect(stackRetries('5', ['ps5-3'])).toBe(false)
  })
})

describe('Audacity: several edits, only with backups, a backup first', () => {
  const audacity = (backups: boolean) => {
    setup({ setup: 'audacity' })
    stackChapter()
    if (backups) setBackupSetting({ backups: true })
  }

  it('without backups it is refused with the capability reason and nothing is backed up or moved', () => {
    audacity(false)
    const before = snapshot()
    expect(stackRetries('5', ['ps5-5'])).toBe(false)
    expect(snapshot()).toBe(before)
    expect(data().backups).toHaveLength(0)
    expect(toasts()).toContain('Turn on backups to stack takes in Audacity.')
    expect(calls('stackTakes')).toHaveLength(0)
  })

  it('with backups the region is cloned first, then the DAW is asked, and the result is the steps', () => {
    audacity(true)
    expect(stackRetries('5', ['ps5-5'])).toBe(true)
    const order = daw().calls.map((c) => c.name).filter((n) => n === 'backupAround' || n === 'stackTakes')
    expect(order).toEqual(['backupAround', 'stackTakes'])
    expect(data().backups.at(-1)).toMatchObject({ chapterId: '5', label: 'Stack retries as takes' })
    expect(passage('ps5-5').stack!.backupId).toBe(data().backups.at(-1)!.id)
    const b = data().backups.at(-1)!
    expect(b.start).toBeLessThanOrEqual(232)
    expect(b.end).toBeGreaterThanOrEqual(257)
  })

  it('the dialog lists the five edits the app performs and the backup', () => {
    audacity(true)
    mount()
    act(() => requestStack('5', ['ps5-5']))
    expect(dialog()).not.toBeNull()
    const steps = [...document.querySelectorAll('#stacksteps li')].map((x) => x.textContent)
    expect(steps).toEqual([
      'Add a take track', 'Paste each later read into it', 'Split at the point where the reads line up', 'Shift the audio that follows to close the gap', 'Mute the reads that are not on top',
    ])
    expect(document.querySelector('#stackundo')!.textContent).toMatch(/Audacity cannot do this as one action, so it is 5 undo steps/)
    expect(document.querySelector('#stackbackup')!.textContent).toMatch(/^Backup first: \d\d:\d\d.*–\d\d:\d\d/)
  })

  it('the dialog does not open when Audacity has no backups; the reason is shown instead', () => {
    audacity(false)
    mount()
    act(() => requestStack('5', ['ps5-5']))
    expect(dialog()).toBeNull()
    expect(toasts()).toContain('Turn on backups to stack takes in Audacity.')
  })
})

describe('the confirmation', () => {
  it('batch: the button opens a dialog stating passages, time ranges, takes, the shift and the undo; nothing moves until Stack takes', () => {
    stackChapter()
    mount()
    const before = snapshot()
    click('#stackall')
    expect(dialog()).not.toBeNull()
    expect(document.querySelector('#stacksum')!.textContent).toMatch(/^7 takes in 4 passages move onto the first read’s spot\. The audio that follows moves \d+\.\d s earlier\.$/)
    expect(document.querySelectorAll('[data-stackgroup]')).toHaveLength(4)
    expect(document.querySelector('[data-stackmove="T05-5"]')!.textContent).toMatch(/^T05-5 · 02:44\.0–03:01\.0 → 02:30\.2–02:47\.2$/)
    expect(document.querySelector('#stackundo')!.textContent).toBe('REAPER does this as one action, so it is one undo step.')
    expect(document.querySelector('#stacksteps')).toBeNull()
    expect(snapshot()).toBe(before)
    click('#stackgo')
    expect(dialog()).toBeNull()
    expect(snapshot()).not.toBe(before)
    expect(isStacked(passage('ps5-9'))).toBe(true)
    expect(toasts().join(' ')).toMatch(/Stacked 7 takes in REAPER/)
  })

  it('cancel changes nothing', () => {
    stackChapter()
    mount()
    const before = snapshot()
    click('#stackall')
    const cancel = [...document.querySelectorAll('.dlg .df button')].find((b) => b.textContent === 'Cancel')!
    rtlAct(() => { fireEvent.click(cancel) })
    expect(dialog()).toBeNull()
    expect(snapshot()).toBe(before)
    expect(calls('stackTakes')).toHaveLength(0)
  })

  it('one passage: the inspector action asks too, and later groups show the positions after the earlier ones moved up', () => {
    stackChapter()
    mount()
    click('[data-tchip="ps5-9"]')
    click('#tstack')
    expect(document.querySelectorAll('[data-stackgroup]')).toHaveLength(1)
    click('#stackgo')
    expect(isStacked(passage('ps5-9'))).toBe(true)
    expect(isStacked(passage('ps5-5'))).toBe(false)
    undoLast()
    const plan = stackPlan(data(), getState().mock, ['ps5-3', 'ps5-5'].map(passage))
    expect(plan.groups[1].ahead).toBe(plan.groups[0].shift)
    expect(plan.shift).toBeCloseTo(plan.groups[0].shift + plan.groups[1].shift, 5)
  })

  it('the built-in recorder variant says the app makes the change itself', () => {
    setup({ setup: 'builtin' })
    stackChapter()
    mount()
    act(() => requestStack('5', ['ps5-3']))
    expect(document.querySelector('#stackundo')!.textContent).toMatch(/The app makes this change itself/)
  })

  it('stack controls are disabled with the reason as their tip when the DAW cannot', () => {
    setup({ setup: 'audacity' })
    stackChapter()
    mount()
    const b = document.querySelector('#stackall') as HTMLButtonElement
    expect(b.disabled).toBe(true)
    expect(b.getAttribute('data-tip')).toBe('Stack retries as takes (Turn on backups to stack takes in Audacity.)')
  })
})

describe('the stacked passage on the page', () => {
  it('shows its takes on one spot, each in a lane of its own on the timeline, and the chip says Stacked', () => {
    stackChapter()
    stackRetries('5', ['ps5-5'])
    mount()
    update((d) => { d.ui.editing.drawer = 'timeline'; d.ui.editing.cursor = '5-5:0'; d.ui.editing.passage = 'ps5-5' })
    click('[data-tchip="ps5-5"]')
    expect(document.querySelector('[data-tchip="ps5-5"]')!.textContent).toContain('Stacked')
    // One lane for each take, all placed at the same left edge of the shared axis: they sit on one spot.
    const lanes = ['T05-1', 'T05-2', 'T05-3'].map((id) => document.querySelector('#timeline [data-lane="' + id + '"] .lns-b') as HTMLElement)
    expect(lanes.every(Boolean)).toBe(true)
    expect(new Set(lanes.map((l) => l.style.left)).size).toBe(1)
    const meta = [...document.querySelectorAll('.takerow .mono.sub')].map((x) => x.textContent).filter((t) => /REAPER take/.test(t ?? ''))
    expect(new Set(meta.map((t) => t!.split(' · ')[0])).size).toBe(1)
  })
})

describe('un-stacking', () => {
  it('puts one take back where it was recorded and the audio after it moves out again', () => {
    stackChapter()
    const orig = starts('ps5-5')
    const after = starts('ps5-9')
    stackRetries('5', ['ps5-5'])
    const stackedEnd = passageEnd(passage('ps5-5'))
    expect(unstackRetries('ps5-5', ['T05-3'])).toBe(true)
    expect(passage('ps5-5').takes.find((t) => t.id === 'T05-3')!.start).toBeCloseTo(orig['T05-3'], 5)
    expect(passage('ps5-5').takes.find((t) => t.id === 'T05-2')!.start).toBe(orig['T05-1'])
    expect(isStacked(passage('ps5-5'))).toBe(true)
    expect(Object.keys(passage('ps5-5').stack!.offsets)).toEqual(['T05-2'])
    expect(passageEnd(passage('ps5-5'))).toBeGreaterThan(stackedEnd)
    const ordered = passagesOf(data(), '5')
    for (let i = 1; i < ordered.length; i++) expect(Math.min(...ordered[i].takes.map((t) => t.start))).toBeGreaterThanOrEqual(passageEnd(ordered[i - 1]) - 0.05)
    expect(unstackRetries('ps5-5')).toBe(true)
    expect(starts('ps5-5')).toEqual(orig)
    expect(passage('ps5-5').stack).toBeUndefined()
    expect(starts('ps5-9')).toEqual(after)
  })

  it('unstacking an earlier passage while a later one is stacked still restores both exactly', () => {
    stackChapter()
    const all = snapshot()
    stackRetries('5', ['ps5-3'])
    stackRetries('5', ['ps5-5'])
    stackRetries('5', ['ps5-9'])
    unstackRetries('ps5-3')
    unstackRetries('ps5-9')
    unstackRetries('ps5-5')
    expect(snapshot()).toBe(all)
  })

  it('is refused once a take is kept, and offered again when the keep is undone', () => {
    stackChapter()
    stackRetries('5', ['ps5-3'])
    keepTake('ps5-3', 'T05-5')
    expect(canUnstack(passage('ps5-3'))).toBe(false)
    expect(unstackRetries('ps5-3')).toBe(false)
    expect(toasts()).toContain('Undo the kept take first.')
    undoLast()
    expect(canUnstack(passage('ps5-3'))).toBe(true)
  })

  it('asks first, with the positions they go back to, and the inspector offers it per take and for the passage', () => {
    stackChapter()
    stackRetries('5', ['ps5-5'])
    mount()
    click('[data-tchip="ps5-5"]')
    expect(document.querySelector('[data-tunstack="T05-1"]')).toBeNull()
    expect(document.querySelector('[data-tunstack="T05-3"]')).not.toBeNull()
    click('[data-tunstack="T05-3"]')
    expect(document.querySelector('#stacksum')!.textContent).toMatch(/^1 take in 1 passage go back to where they were recorded/)
    click('#stackgo')
    expect(Object.keys(passage('ps5-5').stack!.offsets)).toEqual(['T05-2'])
    click('#tunstack')
    click('#stackgo')
    expect(passage('ps5-5').stack).toBeUndefined()
    expect(document.querySelector('#tunstack')).toBeNull()
  })

  it('the geometry reads back the recorded offsets', () => {
    stackChapter()
    const orig = starts('ps5-9')
    stackRetries('5', ['ps5-9'])
    const g = unstackGeometry(passage('ps5-9'))
    expect(g.moves.map((m) => m.to)).toEqual(['T05-7', 'T05-8', 'T05-9'].map((id) => Math.round(orig[id] * 10) / 10))
    expect(g.shift).toBeGreaterThan(0)
    expect(movableTakes(passage('ps5-9'))).toHaveLength(0)
  })
})

describe('leaving the takes where they are', () => {
  it('after a keep the other reads can be cleaned up: the offer asks, then hides them, never deletes', () => {
    mount()
    click('[data-tchip="ps5-5"]')
    expect(document.querySelector('#tclean')).toBeNull()
    act(() => keepTake('ps5-5', 'T05-3'))
    expect(canCleanUp(data(), passage('ps5-5'))).toBe(true)
    expect(document.querySelector('#tclean')!.textContent).toBe('Clean up the other reads')
    click('#tclean')
    expect(dialog()!.textContent).toMatch(/Hide 2 other reads \(T05-1, T05-2\) of this passage.*never deleted/)
    expect(passage('ps5-5').takes.some((t) => t.hidden)).toBe(false)
    const ok = [...document.querySelectorAll('.dlg .df button')].find((b) => b.textContent === 'Hide the other reads')!
    rtlAct(() => { fireEvent.click(ok) })
    expect(passage('ps5-5').takes).toHaveLength(3)
    expect(passage('ps5-5').takes.filter((t) => t.hidden).map((t) => t.id)).toEqual(['T05-1', 'T05-2'])
    expect(getState().history.at(-1)!.label).toBe('Hid 2 other takes')
    expect(document.querySelector('#tclean')).toBeNull()
    expect(undoLast().ok).toBe(true)
    expect(passage('ps5-5').takes.some((t) => t.hidden)).toBe(false)
  })

  it('is not offered for a stacked passage, or one set to stack', () => {
    stackChapter()
    keepTake('ps5-5', 'T05-3')
    expect(canCleanUp(data(), passage('ps5-5'))).toBe(false)
    setRetryMode({ chapter: '5' }, 'leave')
    expect(canCleanUp(data(), passage('ps5-5'))).toBe(true)
    requestCleanUp('ps5-3')
    expect(dialog()).toBeNull()
  })

  it('in Audacity the audio around the other reads is backed up first (backups on); REAPER makes no backup', () => {
    keepTake('ps5-5', 'T05-3')
    cleanUpOtherReads('ps5-5')
    expect(data().backups).toHaveLength(0)
    setup({ setup: 'audacity' })
    setBackupSetting({ backups: true })
    keepTake('ps5-5', 'T05-3')
    cleanUpOtherReads('ps5-5')
    expect(data().backups.at(-1)).toMatchObject({ label: 'Clean up the other reads', chapterId: '5' })
    expect(daw().calls.map((c) => c.name).filter((n) => n === 'backupAround' || n === 'hideTakes')).toEqual(['backupAround', 'hideTakes'])
    expect(passage('ps5-5').takes.filter((t) => t.hidden)).toHaveLength(2)
  })

  it('the Audacity question mentions the backup', () => {
    setup({ setup: 'audacity' })
    setBackupSetting({ backups: true })
    keepTake('ps5-5', 'T05-3')
    mount()
    act(() => requestCleanUp('ps5-5'))
    expect(dialog()!.textContent).toMatch(/A backup of the audio around them is made first/)
  })
})

describe('the passage map after stacking', () => {
  it('a Booth recording that merges passages again leaves a stacked passage and the audio moved up as editing left them', () => {
    stackChapter()
    stackRetries('5', ['ps5-3', 'ps5-5'])
    const before = snapshot()
    const stale = JSON.parse(JSON.stringify(data().passages.filter((p) => p.chapterId === '5'))) as Passage[]
    stale.forEach((p) => p.takes.forEach((t) => { t.start += 40 }))
    const merged = mergePassages(data().passages, stale)
    expect(JSON.stringify(merged.map((p) => p.takes.map((t) => [t.id, t.start])))).toBe(before)
  })

  it('a new retry mode survives a merge', () => {
    setRetryMode({ passage: 'ps5-9' }, 'stack')
    const merged = mergePassages(data().passages, [{ ...passage('ps5-9'), retryMode: undefined }])
    expect(merged.find((p) => p.id === 'ps5-9')!.retryMode).toBe('stack')
  })
})
