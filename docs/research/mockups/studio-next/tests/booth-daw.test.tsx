import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalKeys } from '@/app/keys'
import { allCommands } from '@/app/registry'
import { resumeOffer, boothUnits } from '@/selectors/booth'
import { chName } from '@/selectors/chapters'
import { saveNote } from '@/selectors/daw'
import { suspectedLines } from '@/selectors/booth'
import { setSpeechProvider, createMockSpeech } from '@/providers/speech'
import { go, openInScript } from '@/state/commands/nav'
import { dismissSuspected, resumePointFor, startFromHere, stopBoothTimers } from '@/state/commands/booth'
import { keepTake } from '@/state/commands/editing'
import { addPickupMarkers, openPickMode, reconcilePickupMarkers, togglePickupDone } from '@/state/commands/pickups'
import { daw } from '@/state/daw'
import { initialPrefs } from '@/state/slices/ui'
import { createInitialState, getState, resetState, update as rawUpdate } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import BoothPage from '@/pages/Booth'
import '@/pages'

function Harness() {
  useGlobalKeys()
  return <><OverlayHost /><BoothPage /></>
}
const setup = (patch: Partial<ReturnType<typeof getState>['mock']> = {}, chapter = '8') => {
  const s = createInitialState({ prefs: initialPrefs })
  s.ui.page = 'booth'
  s.ui.chapter = chapter
  s.mock = { ...s.mock, ...patch }
  resetState(s)
}
const update: typeof rawUpdate = (fn) => { rtlAct(() => rawUpdate(fn)) }
const key = (k: string, init: KeyboardEventInit = {}) => rtlAct(() => { fireEvent.keyDown(document.body, { key: k, ...init }) })
const tick = (ms: number) => rtlAct(() => { vi.advanceTimersByTime(ms) })
const units = () => boothUnits(getState().data, getState().ui.chapter).units
const press = (name: string) => rtlAct(() => { fireEvent.click(screen.getByRole('button', { name })) })
const dialog = () => document.querySelector('.dlg')
const toasts = () => getOverlay().toasts.map((t) => t.msg)

beforeEach(() => setup())
afterEach(() => {
  cleanup()
  stopBoothTimers()
  vi.useRealTimers()
  setSpeechProvider(createMockSpeech())
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
})

describe('Record preconditions on the Record control', () => {
  it('a DAW that is not running: Record is disabled and shows the capability\'s reason; Space says the same and starts nothing', () => {
    setup({ setup: 'reaper-off' })
    render(<Harness />)
    expect(document.getElementById('brec')).toBeDisabled()
    expect(document.getElementById('brec-why')!.textContent).toBe('REAPER is not running.')
    expect(document.getElementById('brec')).toHaveAttribute('aria-describedby', 'brec-why')
    key(' ')
    expect(getState().ui.booth.rec).toBe(false)
    expect(toasts()).toContain('REAPER is not running.')
  })

  it('one chapter is one track: a chapter with no track and one with several are refused with the DAW\'s reason', () => {
    setup({}, '12')
    render(<Harness />)
    expect(document.getElementById('brec')).toBeDisabled()
    expect(document.getElementById('brec-why')!.textContent).toBe('There is no track for this chapter in REAPER.')
    update((d) => { d.ui.chapter = '11' })
    expect(document.getElementById('brec-why')!.textContent).toBe('More than one track is set up for this chapter in REAPER.')
    key(' ')
    expect(getState().ui.booth.rec).toBe(false)
  })

  it('a chapter with exactly one track records, and no reason is shown', () => {
    render(<Harness />)
    expect(document.getElementById('brec')).toBeEnabled()
    expect(document.getElementById('brec-why')).toBeNull()
  })

  it('the built-in recorder needs no track', () => {
    setup({ setup: 'builtin' }, '12')
    render(<Harness />)
    expect(document.getElementById('brec')).toBeEnabled()
  })

  it('names the DAW in the setup chip: REAPER, the built-in recorder or Audacity', () => {
    render(<Harness />)
    expect(document.getElementById('bsetup')!.textContent).toBe('REAPER')
    update((d) => { d.mock.setup = 'audacity' })
    expect(document.getElementById('bsetup')!.textContent).toBe('Audacity')
    expect(document.getElementById('bsetup')!.title).toContain('Audacity linked')
    update((d) => { d.mock.setup = 'builtin' })
    expect(document.getElementById('bsetup')!.textContent).toBe('Built-in recorder')
  })

  it('the setup chip says when the DAW has unsaved changes', () => {
    update((d) => { d.mock.dawUnsaved = true })
    render(<Harness />)
    expect(document.getElementById('bsetup')!.title).toContain('unsaved changes')
  })

  it('arms only the chapter\'s track while recording and starts at the end of what is already on it', () => {
    vi.useFakeTimers()
    setup({}, '7')
    const end = daw().recordStartAt('7')
    expect(end).toBeGreaterThan(0)
    render(<Harness />)
    key(' ')
    expect(getState().ui.booth).toMatchObject({ rec: true, takeAt: end })
    expect(daw().tracks().filter((t) => t.armed).map((t) => t.chapterId)).toEqual(['7'])
    tick(5_000)
    key(' ')
    expect(daw().tracks().filter((t) => t.armed)).toHaveLength(0)
    expect(daw().tracks().find((t) => t.chapterId === '7')!.items.at(-1)).toMatchObject({ start: end, end: end + 5 })
    key(' ')
    expect(getState().ui.booth.takeAt).toBe(end + 5)
  })

  it('an explicit Start from here inside what is recorded is a punch: DAW-neutral and non-destructive in REAPER, so it just starts there', () => {
    setup({}, '7')
    render(<Harness />)
    rtlAct(() => startFromHere(0))
    key(' ')
    expect(dialog()).toBeNull()
    expect(getState().ui.booth).toMatchObject({ rec: true, takeAt: 0 })
  })

  it('Start from here beyond the end of the recording is not a punch: the take starts at the end', () => {
    setup({ setup: 'audacity' }, '8')
    render(<Harness />)
    rtlAct(() => startFromHere(3))
    key(' ')
    expect(dialog()).toBeNull()
    expect(getState().ui.booth).toMatchObject({ rec: true, takeAt: 0 })
  })

  it('punching in over recorded audio where the DAW would lose it asks first, and nothing starts until yes', () => {
    setup({ setup: 'audacity' }, '7')
    render(<Harness />)
    rtlAct(() => startFromHere(0))
    key(' ')
    expect(within(dialog() as HTMLElement).getByText('Punch in at ¶ 1?')).toBeInTheDocument()
    expect(getState().ui.booth.rec).toBe(false)
    press('Cancel')
    expect(getState().ui.booth.rec).toBe(false)
    key(' ')
    press('Punch in')
    expect(getState().ui.booth).toMatchObject({ rec: true, takeAt: 0 })
  })

  it('credits are recordable: the opening and closing credits have text, a track and a Record control', () => {
    for (const id of ['open', 'close']) {
      cleanup()
      setup({}, id)
      render(<Harness />)
      const c = getState().data.chapters.find((x) => x.id === id)!
      expect(c.kind).toBe('credits')
      expect(units().length).toBeGreaterThan(0)
      expect(document.getElementById('tele')!.textContent).toContain('Narrated by')
      expect(document.getElementById('chapsel')!.textContent).toContain(chName(getState().data, c))
      expect(document.getElementById('brec')).toBeEnabled()
      key(' ')
      expect(getState().ui.booth.rec).toBe(true)
      key(' ')
      expect(daw().tracks().find((t) => t.chapterId === id)!.items.length).toBeGreaterThan(0)
    }
  })
})

describe('Leaving the Booth while recording', () => {
  it('Escape asks "Stop recording?"; Keep recording leaves the take running on the Booth', () => {
    render(<Harness />)
    key(' ')
    key('Escape')
    expect(within(dialog() as HTMLElement).getByText('Stop recording?')).toBeInTheDocument()
    expect(getState().ui.page).toBe('booth')
    expect(getState().ui.booth.rec).toBe(true)
    press('Keep recording')
    expect(dialog()).toBeNull()
    expect(getState().ui.booth).toMatchObject({ rec: true, paused: false })
    expect(getState().ui.page).toBe('booth')
  })

  it('Escape closes the question the same way (no silent stop)', () => {
    render(<Harness />)
    key(' ')
    key('Escape')
    rtlAct(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(dialog()).toBeNull()
    expect(getState().ui.booth.rec).toBe(true)
    expect(getState().ui.page).toBe('booth')
  })

  it('Stop and leave stops the DAW\'s recording, saves the take, and then leaves', () => {
    render(<Harness />)
    key(' ')
    key('Escape')
    press('Stop and leave')
    expect(getState().ui.page).toBe('script')
    expect(getState().ui.booth).toMatchObject({ rec: false, take: 4 })
    expect(daw().projectState().playState).toBe('stopped')
    expect(daw().calls.some((c) => c.name === 'recordStop')).toBe(true)
    expect(toasts()).toContain('Take saved')
  })

  it('every way out asks: page navigation, a chapter opened in Script, the setup chip', () => {
    render(<Harness />)
    key(' ')
    rtlAct(() => go('proof'))
    expect(dialog()).not.toBeNull()
    expect(getState().ui.page).toBe('booth')
    press('Keep recording')
    rtlAct(() => openInScript('3'))
    expect(dialog()).not.toBeNull()
    expect(getState().ui.page).toBe('booth')
    press('Keep recording')
    fireEvent.click(document.getElementById('bsetup')!)
    expect(dialog()).not.toBeNull()
    expect(getState().ui.booth.rec).toBe(true)
    press('Stop and leave')
    expect(getState().ui.page).toBe('settings')
    expect(getState().ui.booth.rec).toBe(false)
  })

  it('the question is asked once, and the same change goes through after Stop and leave', () => {
    render(<Harness />)
    key(' ')
    rtlAct(() => go('proof'))
    rtlAct(() => go('proof'))
    expect(document.querySelectorAll('.dlg')).toHaveLength(1)
    press('Stop and leave')
    expect(getState().ui.page).toBe('proof')
  })

  it('with nothing recording, leaving needs no question', () => {
    render(<Harness />)
    key('Escape')
    expect(dialog()).toBeNull()
    expect(getState().ui.page).toBe('script')
  })

  it('the question holds the take while it is open', () => {
    vi.useFakeTimers()
    render(<Harness />)
    key(' ')
    tick(2_000)
    key('Escape')
    const at = getState().ui.booth.recSec
    tick(3_000)
    expect(getState().ui.booth.recSec).toBe(at)
    press('Keep recording')
    tick(2_000)
    expect(getState().ui.booth.recSec).toBe(at + 2)
  })

  it('names the DAW in the question', () => {
    setup({ setup: 'audacity' })
    render(<Harness />)
    key(' ')
    key('Escape')
    expect(within(dialog() as HTMLElement).getByText('Audacity is recording. Leaving the Booth stops it.')).toBeInTheDocument()
  })
})

describe('Punch and roll', () => {
  const rolls = () => daw().calls.filter((c) => c.name === 'roll')

  it('REAPER keeps the earlier audio as a take, so a roll needs no question', () => {
    render(<Harness />)
    key(' ')
    key('r')
    expect(dialog()).toBeNull()
    expect(getState().ui.booth.punches).toHaveLength(1)
    expect(rolls()).toHaveLength(1)
  })

  it('Audacity without backups: the roll is destructive, so it asks and the take is held; no answers no roll', () => {
    setup({ setup: 'audacity' })
    render(<Harness />)
    key(' ')
    key('ArrowDown')
    key('r')
    expect(within(dialog() as HTMLElement).getByText(/^Roll again from ¶ \d+\?$/)).toBeInTheDocument()
    expect(getState().ui.booth.paused).toBe(true)
    press('Keep recording')
    expect(getState().ui.booth).toMatchObject({ paused: false, rec: true })
    expect(getState().ui.booth.punches).toHaveLength(0)
    expect(rolls()).toHaveLength(0)
  })

  it('Audacity without backups: yes rolls, confirmed, and logs the punch', () => {
    setup({ setup: 'audacity' })
    render(<Harness />)
    key(' ')
    key('r')
    press('Roll again')
    expect(getState().ui.booth.punches).toHaveLength(1)
    expect(rolls()).toHaveLength(1)
    expect(getState().ui.booth.paused).toBe(false)
  })

  it('Audacity with backups is not destructive: it just rolls', () => {
    setup({ setup: 'audacity' })
    update((d) => { d.data.editor.backups = true })
    render(<Harness />)
    key(' ')
    key('r')
    expect(dialog()).toBeNull()
    expect(getState().ui.booth.punches).toHaveLength(1)
  })

  it('Start from here while recording goes through the same question', () => {
    setup({ setup: 'audacity' })
    render(<Harness />)
    key(' ')
    rtlAct(() => startFromHere(2))
    expect(dialog()).not.toBeNull()
    expect(getState().ui.booth.punches).toHaveLength(0)
    press('Roll again')
    expect(getState().ui.booth).toMatchObject({ cur: 2 })
    expect(getState().ui.booth.punches).toHaveLength(1)
  })

  it('a DAW that cannot roll says why and does not roll', () => {
    render(<Harness />)
    key(' ')
    update((d) => { d.mock.setup = 'reaper-off' })
    key('r')
    expect(toasts()).toContain('REAPER is not running.')
    expect(getState().ui.booth.punches).toHaveLength(0)
  })
})

describe('Resume point', () => {
  it('a chapter recorded partway offers Resume at the paragraph the recording ends in; nothing starts', () => {
    setup({}, '7')
    render(<Harness />)
    const { paras, units: us } = boothUnits(getState().data, '7')
    const offer = resumeOffer(paras, us, resumePointFor(getState().data, '7', paras))!
    expect(offer).not.toBeNull()
    const chip = document.getElementById('bresume')!
    expect(chip.textContent).toBe('Resume at ¶ ' + (offer.para + 1))
    fireEvent.click(chip)
    expect(getState().ui.booth).toMatchObject({ cur: offer.cur, wcur: offer.wcur, rec: false })
    expect(document.getElementById('bresume')).toBeNull()
  })

  it('a chapter with nothing recorded, and a finished one, offer nothing', () => {
    render(<Harness />)
    expect(document.getElementById('bresume')).toBeNull()
    for (const id of ['5', 'open']) {
      update((d) => { d.ui.chapter = id })
      expect(document.getElementById('bresume')).toBeNull()
    }
  })

  it('no offer while recording', () => {
    setup({}, '7')
    render(<Harness />)
    key(' ')
    expect(document.getElementById('bresume')).toBeNull()
  })

  it('where a take stopped is remembered for the chapter and offered next time', () => {
    vi.useFakeTimers()
    render(<Harness />)
    key(' ')
    tick(12_000)
    key(' ')
    const kept = getState().data.resume['8']
    expect(kept).toMatchObject({ source: 'booth', confident: true })
    update((d) => { d.ui.booth.cur = 0; d.ui.booth.wcur = 0 })
    expect(document.getElementById('bresume')).not.toBeNull()
    fireEvent.click(document.getElementById('bresume')!)
    expect(getState().ui.booth.cur).toBeGreaterThan(0)
  })

  it('the answer is read from the live project, or from the saved one when the DAW is not running; an estimate is not confident', () => {
    const { paras } = boothUnits(getState().data, '7')
    expect(resumePointFor(getState().data, '7', paras)).toMatchObject({ source: 'live', confident: false })
    update((d) => { d.mock.setup = 'reaper-off' })
    expect(resumePointFor(getState().data, '7', paras)).toMatchObject({ source: 'saved' })
  })
})

describe('Suspected lines from the live speech check', () => {
  const readOver = (pid: string) => {
    update((d) => { d.ui.booth.cur = units().findIndex((u) => u.pid === pid); d.ui.booth.wcur = 0 })
    key(' ')
    tick(1_000)
    key(' ')
  }

  it('a take that read over a flagged place adds it to Pickups as a speech pickup, with Undo; there is no way to flag by hand', () => {
    vi.useFakeTimers()
    render(<Harness />)
    readOver('8-9')
    const x = getState().data.pickups.find((y) => y.live)!
    expect(x).toMatchObject({ src: 'speech', chapterId: '8', pid: '8-9', ty: 'skip', live: true })
    expect(x.conf).toBeNull()
    expect(x.confReason).toMatch(/does not score/)
    expect(toasts()).toContain('Take saved · 1 suspected line added to Pickups')
    expect(getState().history.at(-1)?.label).toBe('1 suspected line added to Pickups')
    fireEvent.click(within(document.getElementById('toasts')!).getByRole('button', { name: 'Undo' }))
    expect(getState().data.pickups.some((y) => y.live)).toBe(false)
    key('f'); key('p')
    expect(getState().data.pickups.filter((y) => y.src === 'you')).toHaveLength(0)
  })

  it('shows the suspected lines in the side panel, where each can be dismissed', () => {
    vi.useFakeTimers()
    render(<Harness />)
    readOver('8-9')
    const rail = document.getElementById('brail')!
    expect(within(rail).getByText('Suspected · 1')).toBeInTheDocument()
    fireEvent.click(rail.querySelector('[data-fdismiss]')!)
    expect(within(rail).queryByText(/Suspected/)).toBeNull()
    expect(getState().data.pickGone).toContain(getState().data.pickups.find((y) => y.live)!.id)
  })

  it('reading the same place again does not add it twice, and a dismissed one stays dismissed', () => {
    vi.useFakeTimers()
    render(<Harness />)
    readOver('8-9')
    readOver('8-9')
    expect(getState().data.pickups.filter((y) => y.live)).toHaveLength(1)
    const id = getState().data.pickups.find((y) => y.live)!.id
    rtlAct(() => dismissSuspected(id))
    readOver('8-9')
    expect(getState().data.pickups.filter((y) => y.live)).toHaveLength(1)
    expect(suspectedLines(getState().data, '8')).toHaveLength(0)
  })

  it('feeds Pickups: the line is in the shared pickup list and reads "Speech"', async () => {
    vi.useFakeTimers()
    render(<Harness />)
    readOver('8-12')
    const { pickupList, srcLabel } = await import('@/selectors/pickups')
    const x = pickupList(getState().data).find((y) => y.live)!
    expect(x.ty).toBe('repeat')
    expect(srcLabel(x)).toBe('Speech')
  })

  it('a take that does not reach a flagged place adds nothing', () => {
    vi.useFakeTimers()
    render(<Harness />)
    readOver('8-1')
    expect(getState().data.pickups.some((y) => y.live)).toBe(false)
  })

  it('the provider decides: another provider\'s flags are the ones that appear', () => {
    vi.useFakeTimers()
    setSpeechProvider({ ...createMockSpeech(), liveFlags: ({ chapterId, pids }) => (pids.includes('8-3') ? [{ chapterId, pid: '8-3', kind: 'restart' as const, words: [1, 4] as [number, number] }] : []) })
    render(<Harness />)
    readOver('8-3')
    expect(getState().data.pickups.find((y) => y.live)).toMatchObject({ pid: '8-3', ty: 'repeat' })
  })
})

describe('F11 and the pedal', () => {
  it('F11 takes the whole screen and gives it back; it is in the jump menu and the footer', () => {
    const el = document.documentElement
    const request = vi.fn(() => Promise.resolve())
    const exit = vi.fn(() => Promise.resolve())
    Object.defineProperty(el, 'requestFullscreen', { value: request, configurable: true })
    Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true })
    render(<Harness />)
    key('F11')
    expect(request).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true })
    key('F11')
    expect(exit).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    expect(allCommands().some((c) => c.l === 'Toggle full screen' && c.k === 'F11')).toBe(true)
    expect(within(document.getElementById('bkeys')!).getByText('F11')).toBeInTheDocument()
  })

  it('a pedal only starts and stops: Space is the one recording key and nothing else records, rolls or flags', () => {
    render(<Harness />)
    for (const k of ['Enter', 'p', 'f', 'b', 'MediaPlayPause', 'MediaTrackNext', 'F9']) key(k)
    expect(getState().ui.booth.rec).toBe(false)
    key(' ')
    expect(getState().ui.booth.rec).toBe(true)
    for (const k of ['Enter', 'p', 'f', 'MediaPlayPause']) key(k)
    expect(getState().ui.booth).toMatchObject({ rec: true, punches: [] })
    key(' ')
    expect(getState().ui.booth.rec).toBe(false)
  })
})

describe('Pickup markers are the DAW\'s truth', () => {
  const marked = (id: string) => daw().markers().find((m) => m.ref === id)?.label
  const mark = () => rtlAct(() => addPickupMarkers(['c3a', 'c3b'].map((id) => getState().data.pickups.find((x) => x.id === id)!)))

  it('the app\'s done state writes through to the marker\'s name, both ways', () => {
    mark()
    expect(marked('c3a')).toMatch(/^PICKUP: /)
    rtlAct(() => togglePickupDone('c3a'))
    expect(marked('c3a')).toMatch(/^PICKUP_DONE: /)
    rtlAct(() => togglePickupDone('c3a'))
    expect(marked('c3a')).toMatch(/^PICKUP: /)
  })

  it('a pickup marked done by a take in a pickup session is written through too', () => {
    vi.useFakeTimers()
    mark()
    rtlAct(() => openPickMode(['c3a']))
    render(<Harness />)
    key(' ')
    key('ArrowDown'); key('ArrowDown'); key('ArrowDown')
    key(' ')
    expect(getState().data.pickDone).toContain('c3a')
    expect(marked('c3a')).toMatch(/^PICKUP_DONE: /)
  })

  it('on open, a pickup done in the DAW is done here, and one reopened in the DAW is open here', () => {
    mark()
    daw().setPickupMarkerDone('c3b', true)
    update((d) => { d.data.pickDone.push('c3a') })
    rtlAct(() => reconcilePickupMarkers())
    expect(getState().data.pickDone).toEqual(['c3b'])
    expect(toasts()).toContain('2 pickups updated from the markers in REAPER')
  })

  it('the Booth reconciles when it opens', () => {
    mark()
    daw().setPickupMarkerDone('c3a', true)
    render(<Harness />)
    expect(getState().data.pickDone).toContain('c3a')
  })

  it('a change made while the DAW was not running waits and goes through when it is back; the DAW does not undo it', () => {
    mark()
    update((d) => { d.mock.setup = 'reaper-off' })
    rtlAct(() => togglePickupDone('c3a'))
    expect(getState().data.pickSync).toEqual(['c3a'])
    expect(marked('c3a')).toMatch(/^PICKUP: /)
    update((d) => { d.mock.setup = 'reaper' })
    rtlAct(() => reconcilePickupMarkers())
    expect(marked('c3a')).toMatch(/^PICKUP_DONE: /)
    expect(getState().data.pickDone).toContain('c3a')
    expect(getState().data.pickSync).toEqual([])
  })

  it('a DAW with no markers leaves nothing waiting', () => {
    update((d) => { d.mock.setup = 'builtin' })
    rtlAct(() => togglePickupDone('c3a'))
    expect(getState().data.pickSync).toEqual([])
  })
})

describe('Saved and live project state in the screens', () => {
  it('"as of last save" says when the project was saved and whether the DAW has more since', () => {
    const state = { savedAt: '2026-09-26T08:40', unsavedChanges: false }
    expect(saveNote(state, 'reaper')).toBe('Project saved Sep 26, 08:40')
    expect(saveNote({ ...state, unsavedChanges: true }, 'reaper')).toBe('Project saved Sep 26, 08:40. Changes in REAPER since then are not included')
    expect(saveNote({ savedAt: null, unsavedChanges: false }, 'builtin')).toBe('')
  })
})

describe('Stale ids reach the screens as a refusal', () => {
  it('keeping a take the DAW has re-created is refused, shown, and changes nothing in the app', () => {
    update((d) => { d.mock.dawStale = true })
    rtlAct(() => keepTake('ps5-5', 'T05-1'))
    expect(toasts()).toContain('That item changed in REAPER since the app read it. Nothing was changed.')
    expect(getState().data.passages.find((p) => p.id === 'ps5-5')!.kept).toBe(false)
    expect(getState().history).toHaveLength(0)
    update((d) => { d.mock.dawStale = false })
    rtlAct(() => keepTake('ps5-5', 'T05-1'))
    expect(getState().data.passages.find((p) => p.id === 'ps5-5')!.kept).toBe(true)
  })
})
