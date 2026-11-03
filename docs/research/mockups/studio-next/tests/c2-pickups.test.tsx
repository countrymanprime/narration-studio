import { act as rtlAct, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { modals } from '@/app/modals'
import { createMockSpeech, setSpeechProvider, speech } from '@/providers/speech'
import { checkState } from '@/selectors/checks'
import { GAP_TYPE, classifyGaps } from '@/selectors/gaps'
import { srcLabel, typeLabel } from '@/selectors/pickups'
import { detectPickups, projectBasis } from '@/state/commands/pickups'
import { daw } from '@/state/daw'
import { initialPrefs } from '@/state/slices/ui'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import PickupsPage from '@/pages/Pickups'
import '@/pages'

const P = (id: string, text: string) => ({ id, chapterId: 'x', speaker: 'NARR', text })
const paras = [P('a', 'One two three four five.'), P('b', 'Six seven eight nine ten.'), P('c', 'Eleven twelve thirteen.'), P('d', 'Fourteen fifteen sixteen.')]

beforeEach(() => resetState(createInitialState({ prefs: initialPrefs })))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  setSpeechProvider(createMockSpeech())
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('gap taxonomy', () => {
  it('words left out are missing, words added are extra, other words in their place are a misread', () => {
    const r = classifyGaps(paras.slice(0, 3), ['One two five.', 'Six seven eight really nine ten.', 'Eleven twelve fourteen.'])
    expect(r.gaps.map((g) => [g.pid, g.kind, g.script, g.heard])).toEqual([
      ['a', 'missing', 'three four', ''],
      ['b', 'extra', '', 'really'],
      ['c', 'misread', 'thirteen.', 'fourteen.'],
    ])
    expect(GAP_TYPE).toEqual({ missing: 'skip', extra: 'repeat', misread: 'misread' })
  })

  it('a paragraph that was not read, between read ones, is a missing gap', () => {
    const r = classifyGaps(paras, [paras[0].text, null, paras[2].text, paras[3].text])
    expect(r.gaps).toMatchObject([{ pid: 'b', kind: 'missing', words: [0, 5] }])
    expect(r.unfinished).toEqual({ start: 0, end: 0 })
  })

  it('an unread start or end is unfinished recording, not a pickup', () => {
    const r = classifyGaps(paras, [null, paras[1].text, paras[2].text, null])
    expect(r.gaps).toEqual([])
    expect(r.unfinished).toEqual({ start: 1, end: 1 })
    expect(r.readTo).toBe(2)
    expect(r.paras).toBe(4)
    expect(classifyGaps(paras, [null, null, null, null])).toMatchObject({ gaps: [], readTo: 0 })
  })
})

describe('the speech engines', () => {
  it('the offline check lists what the host reports, Whisper-class only; Moonshine is the live engine', () => {
    expect(speech().engines().map((e) => e.id)).toEqual(['Whisper tiny', 'Whisper base', 'Whisper small', 'Whisper medium'])
    expect(speech().engines().every((e) => e.family === 'whisper')).toBe(true)
    expect(speech().liveEngine()).toMatchObject({ family: 'moonshine' })
    expect(speech().defaultEngine()).toBe('Whisper base')
    expect(getState().ui.check.model).toBe('Whisper base')
  })

  it('the dialog shows the engines the provider reports, so a different host changes the list', async () => {
    const base = createMockSpeech()
    setSpeechProvider({ ...base, engines: () => [{ id: 'Whisper large', label: 'Whisper large', family: 'whisper', factor: 0.9 }], defaultEngine: () => 'Whisper large' })
    update((d) => { d.ui.check.model = 'Whisper large' })
    render(<><OverlayHost /><PickupsPage /></>)
    rtlAct(() => modals.checkRecordings(['3']))
    expect(document.getElementById('ck-m')!.textContent).toContain('Whisper large')
    expect(document.body.textContent).not.toContain('Moonshine')
  })
})

describe('what a check stores', () => {
  const run = (ids: string[]) => { rtlAct(() => detectPickups(ids, true)) }

  it('keeps the engine, the saved project it ran against, the lines found and how far the recording reaches', () => {
    run(['3', '7'])
    const k3 = getState().data.checks.find((c) => c.chapterId === '3')!
    const k7 = getState().data.checks.find((c) => c.chapterId === '7')!
    expect(k3).toMatchObject({ model: 'Whisper base', basis: projectBasis(), gaps: 2, readTo: 4, paras: 4, unfinished: { start: 0, end: 0 } })
    // Chapter 7 is recorded to 41%: the rest is unfinished recording, and none of it is a pickup.
    expect(k7.unfinished!.end).toBeGreaterThan(0)
    expect(k7.readTo! + k7.unfinished!.end).toBe(k7.paras)
    expect(getState().data.pickups.filter((x) => x.chapterId === '7').map((x) => x.gap)).toEqual(['extra'])
    expect(getOverlay().toasts.map((t) => t.msg).join()).toMatch(/1 chapter not recorded to the end/)
  })

  it('goes out of date when the saved project moves on, as well as when the text or the recording does', () => {
    run(['3'])
    const b = getState().data
    expect(checkState(b, '3', projectBasis())).toBe('current')
    expect(checkState(b, '3', '2026-10-01T09:00')).toBe('stale')
    update((d) => { d.mock.setup = 'audacity' })
    expect(checkState(getState().data, '3', projectBasis())).toBe('stale')
    update((d) => { d.mock.setup = 'reaper'; d.data.chapters.find((c) => c.id === '3')!.rec = 80 })
    expect(checkState(getState().data, '3', projectBasis())).toBe('stale')
  })

  it('a check made again replaces the stored result', () => {
    run(['3'])
    run(['3'])
    expect(getState().data.checks.filter((c) => c.chapterId === '3')).toHaveLength(1)
  })
})

describe('confidence is a number or nothing, with a reason', () => {
  it('a gap the engine cannot score has no confidence and says why; a scored one shows it', () => {
    run5()
    const x = getState().data.pickups.find((y) => y.chapterId === '5')!
    expect(x.conf).toBeNull()
    expect(x.confReason).toMatch(/too short/)
    expect(srcLabel(x)).toBe('Speech · no score')
    const scored = getState().data.pickups.find((y) => y.id === 'c3a')!
    expect(scored.conf).toBe(0.97)
    expect(srcLabel(scored)).toBe('Speech · 0.97')
  })

  it('the From cell carries the reason when there is no score, and the Type cell names the gap', () => {
    run5()
    render(<><OverlayHost /><PickupsPage /></>)
    const row = [...document.querySelectorAll('tr[data-pk]')].find((r) => r.getAttribute('data-pk')!.startsWith('d5'))!
    expect(row.querySelector('td[title]')!.getAttribute('title')).toMatch(/too short/)
    expect(row.textContent).toContain('Misread')
    expect(typeLabel(getState().data.pickups.find((y) => y.id === 'c3b')!)).toBe('Left out')
  })
  function run5() { rtlAct(() => detectPickups(['5'], true)) }
})

describe('Pickups only points to the Booth', () => {
  it('no row action or menu item moves the DAW cursor or punches', () => {
    render(<><OverlayHost /><PickupsPage /></>)
    daw().calls.length = 0
    for (const sel of ['[data-recp="c3a"]', '[data-ctxp="c3a"]']) rtlAct(() => { fireEvent.click(document.querySelector(sel)!) })
    expect(daw().calls.filter((c) => ['gotoTime', 'gotoChapter', 'roll', 'recordStart'].includes(c.name))).toHaveLength(0)
    expect(screen.queryByLabelText(/punch/i)).toBeNull()
    expect(getState().ui.page).toBe('booth')
    expect(getState().ui.pickups.mode).toBe(true)
  })
})
