import { beforeEach, describe, expect, it } from 'vitest'
import { DawCapabilities, DawResult } from '@/domain/daw'
import { CAPABILITY_SETS } from '@/fixtures/daw'
import { capabilitiesFor, dawLabel, guidOf } from '@/selectors/daw'
import { daw } from '@/state/daw'
import { createInitialState, getState, resetState, update } from '@/state/store'
import { chapterSeconds } from '@/fixtures/daw'

const setup = (patch: Partial<ReturnType<typeof getState>['mock']> = {}) => {
  resetState(createInitialState())
  update((d) => { Object.assign(d.mock, patch) })
}
beforeEach(() => setup())

describe('DAW capabilities', () => {
  it('every setup reports a capability set that passes the schema, for a named DAW', () => {
    for (const k of ['reaper', 'reaper-off', 'builtin', 'audacity']) {
      expect(() => DawCapabilities.parse(CAPABILITY_SETS[k])).not.toThrow()
      expect(dawLabel(CAPABILITY_SETS[k].daw)).toBeTruthy()
    }
    expect(CAPABILITY_SETS.reaper).toMatchObject({ daw: 'reaper', reachable: true })
    expect(CAPABILITY_SETS.builtin.daw).toBe('builtin')
    expect(CAPABILITY_SETS.audacity.daw).toBe('audacity')
  })

  it('a DAW that is not running offers nothing that needs it and says why', () => {
    update((d) => { d.mock.setup = 'reaper-off' })
    const c = daw().capabilities()
    expect(c.reachable).toBe(false)
    expect(c.caps.record).toMatchObject({ available: false, reason: 'REAPER is not running.' })
    expect(c.caps.markers.available).toBe(false)
  })

  it('what a DAW lacks carries its own reason', () => {
    update((d) => { d.mock.setup = 'builtin' })
    expect(daw().capabilities().caps.goto).toMatchObject({ available: false, reason: 'Not available with the built-in recorder.' })
  })

  it('Audacity rolls destructively until its backups are on', () => {
    expect(capabilitiesFor('audacity', false).caps.roll.destructive).toBe(true)
    expect(capabilitiesFor('audacity', true).caps.roll.destructive).toBe(false)
    expect(capabilitiesFor('audacity', true).caps.backups.available).toBe(true)
    expect(capabilitiesFor('reaper', true).caps.roll.destructive).toBe(false)
  })

  it('the capabilities follow the mock setup', () => {
    update((d) => { d.mock.setup = 'audacity' })
    expect(daw().capabilities().daw).toBe('audacity')
    update((d) => { d.data.editor.backups = true })
    expect(daw().capabilities().caps.roll.destructive).toBe(false)
  })
})

describe('DawResult', () => {
  it('every call answers a result that passes the schema; a cursor move adds no undo point, a write adds one', () => {
    const go = daw().gotoTime('5', 10)
    expect(DawResult.parse(go)).toMatchObject({ ok: true, changed: false, undoSteps: 0, message: 'REAPER cursor moved' })
    const mk = daw().addMarker('5', 10, 'Breath')
    expect(DawResult.parse(mk)).toMatchObject({ ok: true, changed: true, undoSteps: 1, message: 'Marker added in REAPER' })
  })

  it('a refused call changes nothing and carries the capability\'s reason', () => {
    update((d) => { d.mock.setup = 'builtin' })
    const r = daw().gotoTime('5', 10)
    expect(r).toEqual({ ok: false, changed: false, message: 'Not available with the built-in recorder.', undoSteps: 0, refused: 'Not available with the built-in recorder.' })
    expect(daw().markers()).toHaveLength(0)
  })

  it('a write with nothing to change writes nothing', () => {
    const r = daw().trimGaps(0, 1.2)
    expect(r).toMatchObject({ ok: true, changed: false, undoSteps: 0 })
    expect(daw().projectState().unsavedChanges).toBe(false)
  })

  it('names the DAW it is talking to', () => {
    update((d) => { d.mock.setup = 'audacity' })
    expect(daw().addMarker('5', 3, 'x').message).toBe('Marker added in Audacity')
  })

  it('markers get the kind in front of their label', () => {
    daw().addMarker('5', 10, 'Breath', 'NOISE')
    expect(daw().markers()[0].label).toBe('NOISE: Breath')
  })
})

describe('Saved and live project state', () => {
  it('reports when the project was last saved and whether there is more since', () => {
    const s = daw().projectState()
    expect(s).toMatchObject({ savedAt: '2026-09-26T08:40', unsavedChanges: false, playState: 'stopped' })
    update((d) => { d.mock.dawUnsaved = true })
    expect(daw().projectState().unsavedChanges).toBe(true)
  })

  it('a change made through the app leaves unsaved changes in the DAW', () => {
    daw().addMarker('5', 10, 'x')
    expect(daw().projectState().unsavedChanges).toBe(true)
  })

  it('the built-in recorder keeps no saved project', () => {
    update((d) => { d.mock.setup = 'builtin' })
    expect(daw().projectState()).toMatchObject({ savedAt: null, unsavedChanges: false })
  })

  it('the transport shows recording while a take runs', () => {
    expect(daw().recordStart('8').ok).toBe(true)
    expect(daw().projectState().playState).toBe('recording')
    daw().recordStop(5)
    expect(daw().projectState().playState).toBe('stopped')
  })
})

describe('Stable ids and the stale refusal', () => {
  it('guids look like guids, are stable, and differ per thing', () => {
    expect(guidOf('take', 'T05-1')).toMatch(/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/)
    expect(guidOf('take', 'T05-1')).toBe(guidOf('take', 'T05-1'))
    expect(guidOf('take', 'T05-1')).not.toBe(guidOf('take', 'T05-2'))
    expect(guidOf('take', 'T05-1')).not.toBe(guidOf('item', 'T05-1'))
    expect(guidOf('take', 'T05-1')).not.toBe(guidOf('take', 'T05-1', 1))
  })

  it('choosing a take the DAW has re-created is refused, nothing changes, and says what happened', () => {
    expect(daw().setActiveTake('T05-1', 'ps5-5')).toMatchObject({ ok: true, changed: true })
    update((d) => { d.mock.dawStale = true })
    const r = daw().setActiveTake('T05-1', 'ps5-5')
    expect(r).toMatchObject({ ok: false, changed: false, undoSteps: 0 })
    expect(r.refused).toBe('That item changed in REAPER since the app read it. Nothing was changed.')
    const t = daw().setActiveTake('T05-1', undefined, { itemGuid: guidOf('item', 'T05-1'), takeGuid: guidOf('take', 'T05-1') })
    expect(t.refused).toBe('That take changed in REAPER since the app read it. Nothing was changed.')
  })

  it('an id read after the change is accepted', () => {
    update((d) => { d.mock.dawStale = true })
    const held = { itemGuid: guidOf('item', 'ps5-5', 1), takeGuid: guidOf('take', 'T05-1', 1) }
    expect(daw().setActiveTake('T05-1', 'ps5-5', held).ok).toBe(true)
  })
})

describe('Recording preconditions', () => {
  it('one chapter is one track: no track and several tracks are refused with the reason', () => {
    expect(daw().recordCheck('8')).toBeNull()
    expect(daw().recordCheck('12')).toEqual({ code: 'no_track', reason: 'There is no track for this chapter in REAPER.' })
    expect(daw().recordCheck('11')).toEqual({ code: 'several_tracks', reason: 'More than one track is set up for this chapter in REAPER.' })
    expect(daw().recordStart('12')).toMatchObject({ ok: false, refused: 'There is no track for this chapter in REAPER.' })
  })

  it('a DAW that is not running refuses with its capability reason', () => {
    update((d) => { d.mock.setup = 'reaper-off' })
    expect(daw().recordCheck('8')).toEqual({ code: 'not_running', reason: 'REAPER is not running.' })
  })

  it('the built-in recorder needs no track', () => {
    update((d) => { d.mock.setup = 'builtin' })
    expect(daw().recordCheck('12')).toBeNull()
  })

  it('recording starts at the end of the last item on the chapter\'s track', () => {
    const c = getState().data.chapters.find((x) => x.id === '7')!
    expect(daw().recordStartAt('8')).toBe(0)
    expect(daw().recordStartAt('7')).toBe(Math.round(0.41 * chapterSeconds(c)))
    const end = daw().recordStartAt('7')
    daw().recordStart('7')
    daw().recordStop(40)
    expect(daw().recordStartAt('7')).toBe(end + 40)
  })

  it('only the chapter\'s track is armed while recording, and the arms come back after', () => {
    const other = daw().tracks().find((t) => t.chapterId === '6')!
    other.armed = true
    daw().recordStart('8')
    expect(daw().tracks().filter((t) => t.armed).map((t) => t.chapterId)).toEqual(['8'])
    daw().recordStop(3)
    expect(daw().tracks().filter((t) => t.armed).map((t) => t.chapterId)).toEqual(['6'])
  })

  it('an explicit punch starts where the narrator chose, not at the end', () => {
    daw().recordStart('7', { punchAt: 30 })
    daw().recordStop(10)
    const items = daw().tracks().find((t) => t.chapterId === '7')!.items
    expect(items.at(-1)).toMatchObject({ start: 30, end: 40 })
  })

  it('does not start while the DAW is already recording or playing, and stopping twice is refused', () => {
    daw().recordStart('8')
    daw().recordStop(2)
    expect(daw().recordStop(2).refused).toBe('Nothing is recording.')
  })
})

describe('Roll again', () => {
  it('keeps the earlier audio as a take where the DAW is not destructive, as one undo step', () => {
    daw().recordStart('8')
    const r = daw().roll('8', 12)
    expect(r).toMatchObject({ ok: true, changed: true, undoSteps: 1 })
    expect(r.message).toContain('kept as a take')
  })

  it('Audacity without backups refuses until confirmed; with backups it just rolls', () => {
    update((d) => { d.mock.setup = 'audacity' })
    daw().recordStart('8')
    expect(daw().roll('8', 12).refused).toBe('Rolling again replaces audio in Audacity. Confirm first.')
    expect(daw().roll('8', 12, { confirmed: true }).ok).toBe(true)
    daw().recordStop(3)
    update((d) => { d.data.editor.backups = true })
    daw().recordStart('8')
    expect(daw().roll('8', 12).ok).toBe(true)
  })

  it('cannot roll when nothing is recording', () => {
    expect(daw().roll('8', 12).refused).toBe('Nothing is recording.')
  })
})

describe('Pickup markers', () => {
  const items = [{ id: 'c3a', chapterId: '3', sec: 131, label: 'I am older' }, { id: 'c3b', chapterId: '3', sec: 348, label: 'dripping wet' }]

  it('marks pickups as PICKUP: markers, and sending them twice adds nothing', () => {
    expect(daw().addPickupMarkers(items)).toMatchObject({ ok: true, changed: true, message: 'Added 2 markers in REAPER' })
    expect(daw().markers().map((m) => m.label)).toEqual(['PICKUP: I am older', 'PICKUP: dripping wet'])
    expect(daw().addPickupMarkers(items)).toMatchObject({ ok: true, changed: false, undoSteps: 0 })
    expect(daw().markers()).toHaveLength(2)
  })

  it('done is the marker\'s name: PICKUP_DONE: and back', () => {
    daw().addPickupMarkers(items)
    expect(daw().setPickupMarkerDone('c3a', true).changed).toBe(true)
    expect(daw().markers()[0].label).toBe('PICKUP_DONE: I am older')
    expect(daw().setPickupMarkerDone('c3a', true).changed).toBe(false)
    daw().setPickupMarkerDone('c3a', false)
    expect(daw().markers()[0].label).toBe('PICKUP: I am older')
    expect(daw().setPickupMarkerDone('nope', true)).toMatchObject({ ok: true, changed: false })
  })

  it('a DAW with no markers refuses with its reason', () => {
    update((d) => { d.mock.setup = 'builtin' })
    expect(daw().addPickupMarkers(items).refused).toBe('Not available with the built-in recorder.')
  })
})
