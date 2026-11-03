/**
 * Everything the app asks of the DAW goes through this interface, so the screens never talk to REAPER, Audacity or the built-in
 * recorder directly. Every call answers a DawResult (never a bare string); what the DAW can do is a capability with a reason,
 * and a control shows that reason instead of wording its own. The mock implementation keeps a small live project (tracks, items,
 * markers, arms, play state) and answers from the capabilities of the chosen setup; the real bridge implements the same interface
 * later and commands and screens do not change.
 */
import {
  dawOk, dawRefused, type DawCapabilities, type DeleteRangeRequest, type DawMarker, type FxRangeRequest, type DawProjectState, type DawResult, type DawTrack, type MarkerKind, type Refusal, type StackRequest, type TakeHandle,
} from '@/domain/daw'
import { NEEDS_TRACK, SAVED_PROJECT, sampleTracks } from '@/fixtures/daw'
import { guidOf } from '@/format/guid'
import { capsOf, dawLabel, lastEnd, rangePlanOf, refusal, stackPlanOf } from '@/selectors/daw'
import { getState } from './store'

export interface DawCall { name: string; args: unknown[] }

/** A pickup as the DAW marks it. */
export interface PickupMark { id: string; chapterId: string; sec: number; label: string }

export interface DawAdapter {
  /** What the connected DAW can do right now, and why not when it cannot. */
  capabilities(): DawCapabilities
  /** The project as last saved, whether there are unsaved changes, and the transport. */
  projectState(): DawProjectState
  tracks(): DawTrack[]
  markers(): DawMarker[]

  /* Recording. One chapter is one track; only that track is armed; a take starts at the end of the last item unless the narrator punches. */
  /** Why Record cannot start for this chapter, or null. */
  recordCheck(chapterId: string): Refusal | null
  /** Seconds where the next take starts: the end of the last item on the chapter's track. */
  recordStartAt(chapterId: string): number
  /** Arm only the chapter's track and start recording, at `punchAt` when the narrator punches in. */
  recordStart(chapterId: string, opts?: { punchAt?: number }): DawResult
  /** Stop the recording this app started; `elapsed` seconds were recorded. */
  recordStop(elapsed: number): DawResult
  /** Roll again while recording: the earlier audio stays as a take. Where the capability is destructive it is refused until `confirmed`. */
  roll(chapterId: string, at: number, opts?: { confirmed?: boolean }): DawResult

  /** Move the DAW's cursor to a time in the chapter recording. */
  gotoTime(chapterId: string, seconds: number): DawResult
  gotoChapter(chapterName: string): DawResult
  /** Add a marker; `kind` is written in front of the label ("PICKUP: …"). */
  addMarker(chapterId: string, seconds: number, label: string, kind?: MarkerKind): DawResult
  /** Mark pickups as `PICKUP:` markers; one that is already marked is left alone. */
  addPickupMarkers(items: PickupMark[]): DawResult
  /** Rename a pickup's marker to `PICKUP_DONE:` (or back to `PICKUP:`). Nothing changes when it has no marker. */
  setPickupMarkerDone(ref: string, done: boolean): DawResult
  /** Shorten every gap longer than the limit (seconds) to the limit. */
  trimGaps(count: number, limit: number): DawResult
  /** Make one take the active one; the other takes of the item are muted, not deleted. Refused when the app's ids are stale. */
  setActiveTake(takeId: string, passageId?: string, held?: TakeHandle): DawResult
  /** Mute the other takes of a passage (hide them). One undo step; nothing is deleted. */
  hideTakes(count: number): DawResult
  /** Cut the take in two at a time in the chapter recording, so a duplicate read becomes two takes. */
  splitTake(takeId: string, at: number): DawResult
  /** Clone the audio from `start` to `end` seconds of the chapter's track before it is changed, so it can be put back. */
  backupAround(guid: string, chapterId: string, start: number, end: number): DawResult
  /** Put a backup's audio back. Refused when the DAW has no backup with that id. */
  restoreBackup(guid: string): DawResult
  /**
   * Put the later reads of retry groups on the first read's spot (REAPER: as takes of one item; Audacity: a new take track, paste, split, shift,
   * mute). Refused when an item changed since the app read it, and where the DAW cannot do it (Audacity without backups). The result carries the
   * undo points the DAW added and, for a multi-step DAW, the edits it made.
   */
  stackTakes(req: StackRequest): DawResult
  /** Move stacked takes back to where they were recorded. The same rules as stackTakes. */
  unstackTakes(req: StackRequest): DawResult
  /**
   * Cut the words' audio from the script: split the item at both ends and take the middle piece out (REAPER: onto a muted Cuts track; the built-in
   * recorder: an entry in the app's edit list; Audacity: select and delete, after a backup). Refused when the item changed since the app read it.
   * One undo point in a DAW that can do it as one action; the result says how many it added.
   */
  deleteRange(req: DeleteRangeRequest): DawResult
  /** Split at the range and put one of the DAW's own saved chains, effects or macros on the middle piece. The same refusals and undo rules. */
  applyFxToRange(req: FxRangeRequest): DawResult
  /** Take the effect off a range again (the piece it was put on is joined back). */
  removeFxFromRange(guid: string, chainName: string): DawResult
  playAround(seconds: number, span: number): DawResult
  /** Play a stretch of the chapter, or several stretches one after the other. */
  playRange(start: number, end: number, label: string): DawResult
  playSequence(ranges: Array<[number, number]>, label: string): DawResult
  /** Fix findings: breaths and plosives and noise are turned down by `amount` dB, clicks are repaired. `kind` is the cleanup operation. */
  applyFix(label: string, kind: string, count: number, amount: number): DawResult
  addFx(name: string, start: number, end: number, scope: string): DawResult
  removeFx(name: string): DawResult
  bypassFx(name: string, bypass: boolean): DawResult
  setFxParam(name: string, key: string, value: number): DawResult
  /** Play a stretch without the effect, then with it. */
  compareFx(name: string, start: number, end: number): DawResult
  openInDaw(what: string): DawResult
  checkAgain(files: number): DawResult
  /** Put the live project back as it was opened (the mock does this between tests). */
  reset?(): void
  calls: DawCall[]
}

const PICKUP = 'PICKUP'
const DONE = 'PICKUP_DONE'
const labelWith = (kind: string, text: string): string => (kind ? kind + ': ' + text : text)

interface Live {
  tracks: DawTrack[]
  markers: DawMarker[]
  playState: DawProjectState['playState']
  pos: number
  dirty: boolean
  /** The ids of the backups the DAW holds. */
  backups: string[]
  /** The arms before the app armed the chapter's track, restored when the take ends. */
  armsBefore: string[] | null
  rec: { chapterId: string; start: number; punch: boolean; rolls: number } | null
}

function freshLive(): Live {
  const tracks: DawTrack[] = sampleTracks().map((t, i) => {
    const guid = guidOf('track', t.chapterId + '/' + i)
    return {
      guid, name: t.name, chapterId: t.chapterId, armed: false,
      items: t.end > 0 ? [{ guid: guidOf('item', guid + '/0'), start: 0, end: t.end, takeGuids: [guidOf('take', guid + '/0')] }] : [],
    }
  })
  return { tracks, markers: [], playState: 'stopped', pos: 0, dirty: false, backups: [], armsBefore: null, rec: null }
}

export function createMockDaw(): DawAdapter {
  const calls: DawCall[] = []
  let live = freshLive()
  const mock = () => getState().mock
  const caps = (): DawCapabilities => capsOf(mock())
  const label = (): string => dawLabel(caps().daw)
  const note = (name: string, ...args: unknown[]): void => { calls.push({ name, args }) }
  /** The capability's own reason when the call cannot be made. */
  const gate = (name: string): DawResult | null => {
    const c = caps().caps[name]
    return c && c.available ? null : dawRefused(c?.reason ?? label() + ' cannot do this.')
  }
  const call = (name: string, cap: string, args: unknown[], run: () => DawResult): DawResult => {
    note(name, ...args)
    return gate(cap) ?? run()
  }
  const tracksOf = (chapterId: string): DawTrack[] => live.tracks.filter((t) => t.chapterId === chapterId)
  const touch = (): void => { live.dirty = true }
  const liveRev = (): number => (mock().dawStale ? 1 : 0)
  const cursor = (name: string, cap: string, args: unknown[], msg: () => string): DawResult => call(name, cap, args, () => dawOk(msg(), { changed: false, undoSteps: 0 }))
  const edit = (name: string, cap: string, args: unknown[], msg: () => string, did = true): DawResult =>
    call(name, cap, args, () => {
      if (!did) return dawOk('Nothing to change in ' + label() + '.', { changed: false, undoSteps: 0 })
      touch()
      return dawOk(msg())
    })

  /** Stack or un-stack: refused when an item is stale, else the DAW does it in its own way (one action, the app's, or several edits). */
  const restack = (name: string, req: StackRequest, verb: string): DawResult =>
    call(name, 'stackTakes', [req], () => {
      const rev = liveRev()
      if (req.groups.some((g) => g.itemGuid !== guidOf('item', g.passageId, rev))) return dawRefused(refusal('item_stale', caps().daw).reason)
      const n = req.groups.reduce((a, g) => a + g.moves.length, 0)
      if (!n) return dawRefused(refusal('nothing_to_stack', caps().daw).reason)
      touch()
      const how = stackPlanOf(mock())
      const what = verb + ' ' + n + (n > 1 ? ' takes' : ' take') + ' in ' + label() + '.'
      return how.mode === 'steps'
        ? dawOk(what + ' Done in ' + how.steps.length + ' steps.', { undoSteps: how.steps.length, steps: how.steps })
        : dawOk(what, { undoSteps: 1 })
    })

  /**
   * Cut an item of the chapter's track at both ends of a range, as the DAW does for a word range: `cut` takes the middle piece out and moves what
   * follows up, `mute` and `fx` keep three pieces (the middle one muted, or carrying the effect). The pieces get new ids; the app never holds them.
   */
  const splitItem = (chapterId: string, start: number, end: number, how: 'cut' | 'mute' | 'fx'): void => {
    const track = tracksOf(chapterId)[0]
    const at = track?.items.findIndex((i) => i.start <= start + 1e-6 && i.end >= end - 1e-6) ?? -1
    if (!track || at < 0) return
    const it = track.items[at]
    const n = track.items.length
    const piece = (a: number, b: number, k: number) => ({ guid: guidOf('item', track.guid + '/' + n + '.' + k + '/' + a), start: a, end: b, takeGuids: it.takeGuids })
    const len = end - start
    const pieces = how === 'cut' ? [piece(it.start, start, 0), piece(start, it.end - len, 1)] : [piece(it.start, start, 0), piece(start, end, 1), piece(end, it.end, 2)]
    track.items.splice(at, 1, ...pieces.filter((x) => x.end - x.start > 1e-6))
    if (how === 'cut') track.items.forEach((x, i) => { if (i > at + 1 && x.start >= it.end - 1e-6) { x.start -= len; x.end -= len } })
  }

  const recordCheck = (chapterId: string): Refusal | null => {
    const c = caps()
    const g = c.caps.record
    if (!c.reachable || !g?.available) return { code: c.reachable ? 'unavailable' : 'not_running', reason: g?.reason ?? label() + ' cannot record.' }
    if (live.playState === 'playing') return refusal('busy', c.daw)
    if (NEEDS_TRACK[c.daw]) {
      const n = tracksOf(chapterId).length
      if (n === 0) return refusal('no_track', c.daw)
      if (n > 1) return refusal('several_tracks', c.daw)
    }
    return null
  }

  return {
    calls,
    reset: () => { live = freshLive(); calls.length = 0 },
    capabilities: caps,
    projectState: () => {
      const daw = caps().daw
      return { savedAt: SAVED_PROJECT[daw] ?? null, unsavedChanges: daw !== 'builtin' && (mock().dawUnsaved || live.dirty), playState: live.playState, playPosition: live.pos }
    },
    tracks: () => live.tracks,
    markers: () => live.markers,

    recordCheck,
    recordStartAt: (chapterId) => lastEnd(tracksOf(chapterId)[0]),
    recordStart(chapterId, opts = {}) {
      note('recordStart', chapterId, opts.punchAt)
      const why = recordCheck(chapterId)
      if (why) return dawRefused(why.reason)
      const track = tracksOf(chapterId)[0]
      if (track) {
        live.armsBefore = live.tracks.filter((t) => t.armed).map((t) => t.guid)
        live.tracks.forEach((t) => { t.armed = t.guid === track.guid })
      }
      live.rec = { chapterId, start: opts.punchAt ?? lastEnd(track), punch: opts.punchAt != null, rolls: 0 }
      live.playState = 'recording'
      return dawOk('Recording in ' + label() + '.', { changed: false, undoSteps: 0 })
    },
    recordStop(elapsed) {
      note('recordStop', elapsed)
      const r = live.rec
      if (!r) return dawRefused(refusal('not_recording', caps().daw).reason)
      let track = tracksOf(r.chapterId)[0]
      if (!track) {
        track = { guid: guidOf('track', r.chapterId + '/new'), name: r.chapterId, chapterId: r.chapterId, armed: false, items: [] }
        live.tracks.push(track)
      }
      const n = track.items.length
      track.items.push({ guid: guidOf('item', track.guid + '/' + n), start: r.start, end: r.start + Math.max(0, elapsed), takeGuids: [guidOf('take', track.guid + '/' + n)] })
      const before = live.armsBefore
      if (before) live.tracks.forEach((t) => { t.armed = before.includes(t.guid) })
      live.armsBefore = null
      live.rec = null
      live.playState = 'stopped'
      touch()
      return dawOk('Recording stopped in ' + label() + '.', { undoSteps: 1 })
    },
    roll(chapterId, at, opts = {}) {
      note('roll', chapterId, at)
      const blocked = gate('roll')
      if (blocked) return blocked
      if (!live.rec) return dawRefused(refusal('not_recording', caps().daw).reason)
      const c = caps().caps.roll
      if (c.destructive && !opts.confirmed) return dawRefused(refusal('confirm_needed', caps().daw).reason)
      live.rec.rolls++
      touch()
      return dawOk(c.destructive ? 'Rolled again in ' + label() + '. The audio from here on was replaced.' : 'Rolled again in ' + label() + '. The earlier audio is kept as a take.')
    },

    gotoTime: (c, s) => cursor('gotoTime', 'goto', [c, s], () => label() + ' cursor moved'),
    gotoChapter: (n) => cursor('gotoChapter', 'goto', [n], () => label() + ' cursor moved to ' + n),
    addMarker: (c, s, l, kind = '') => edit('addMarker', 'markers', [c, s, l, kind], () => {
      live.markers.push({ guid: guidOf('marker', c + '/' + s + '/' + live.markers.length), chapterId: c, sec: s, label: labelWith(kind, l) })
      return 'Marker added in ' + label()
    }),
    addPickupMarkers(items) {
      note('addPickupMarkers', items.map((x) => x.id))
      const blocked = gate('markers')
      if (blocked) return blocked
      const fresh = items.filter((x) => !live.markers.some((m) => m.ref === x.id))
      if (!fresh.length) return dawOk('Those pickups are already marked in ' + label() + '.', { changed: false, undoSteps: 0 })
      fresh.forEach((x) => live.markers.push({ guid: guidOf('marker', 'pickup/' + x.id), chapterId: x.chapterId, sec: x.sec, label: labelWith(PICKUP, x.label), ref: x.id }))
      touch()
      return dawOk('Added ' + fresh.length + (fresh.length > 1 ? ' markers' : ' marker') + ' in ' + label())
    },
    setPickupMarkerDone(ref, done) {
      note('setPickupMarkerDone', ref, done)
      const blocked = gate('markers')
      if (blocked) return blocked
      const m = live.markers.find((x) => x.ref === ref)
      const want = done ? DONE : PICKUP
      if (!m || m.label.startsWith(want + ':')) return dawOk('Nothing to change in ' + label() + '.', { changed: false, undoSteps: 0 })
      m.label = want + m.label.slice(m.label.indexOf(':'))
      touch()
      return dawOk('Marker updated in ' + label())
    },
    trimGaps: (n, limit) => edit('trimGaps', 'cleanup', [n, limit], () => 'Shortened ' + n + (n > 1 ? ' gaps' : ' gap') + ' in ' + label(), n > 0),
    setActiveTake(takeId, passageId, held) {
      note('setActiveTake', takeId)
      const blocked = gate('takes')
      if (blocked) return blocked
      const rev = liveRev()
      const item = held?.itemGuid ?? guidOf('item', passageId ?? takeId)
      if (passageId !== undefined && item !== guidOf('item', passageId, rev)) return dawRefused(refusal('item_stale', caps().daw).reason)
      if ((held?.takeGuid ?? guidOf('take', takeId)) !== guidOf('take', takeId, rev)) return dawRefused(refusal('take_stale', caps().daw).reason)
      touch()
      return dawOk(takeId + ' is the active take; the others are muted.')
    },
    hideTakes: (n) => edit('hideTakes', 'takes', [n], () => 'Muted ' + n + ' other ' + (n > 1 ? 'takes' : 'take') + ' in ' + label() + '. They are still in the project.', n > 0),
    splitTake: (takeId, at) => edit('splitTake', 'takes', [takeId, at], () => 'Split ' + takeId + ' at ' + at + ' s in ' + label()),
    backupAround(guid, chapterId, start, end) {
      note('backupAround', guid, chapterId, start, end)
      return gate('backups') ?? (() => {
        live.backups.push(guid)
        return dawOk('Backed up ' + Math.round(end - start) + ' s of audio in ' + label(), { changed: false, undoSteps: 0 })
      })()
    },
    restoreBackup(guid) {
      note('restoreBackup', guid)
      const blocked = gate('backups')
      if (blocked) return blocked
      if (!live.backups.includes(guid)) return dawRefused(refusal('no_backup', caps().daw).reason)
      touch()
      return dawOk('Put the backed-up audio back in ' + label())
    },
    deleteRange(req) {
      return call('deleteRange', 'cutRange', [req], () => {
        if (req.itemGuid !== guidOf('item', req.itemKey, liveRev())) return dawRefused(refusal('item_stale', caps().daw).reason)
        const plan = rangePlanOf(mock())
        splitItem(req.chapterId, req.start, req.end, req.mode === 'close' ? 'cut' : 'mute')
        touch()
        return dawOk('Deleted ' + req.words + (req.words > 1 ? ' words' : ' word') + ' and their audio in ' + label() + '.', { undoSteps: plan.cutSteps })
      })
    },
    applyFxToRange(req) {
      return call('applyFxToRange', 'fxRange', [req], () => {
        if (req.itemGuid !== guidOf('item', req.itemKey, liveRev())) return dawRefused(refusal('item_stale', caps().daw).reason)
        const plan = rangePlanOf(mock())
        splitItem(req.chapterId, req.start, req.end, 'fx')
        touch()
        return dawOk('Added ' + req.chainName + ' to ' + req.words + (req.words > 1 ? ' words' : ' word') + ' in ' + label() + '.', { undoSteps: plan.fxSteps })
      })
    },
    removeFxFromRange: (guid, chain) => edit('removeFxFromRange', 'fxRange', [guid, chain], () => chain + ' taken off in ' + label()),
    stackTakes: (req) => restack('stackTakes', req, 'Stacked'),
    unstackTakes: (req) => restack('unstackTakes', req, 'Moved back'),
    playAround: (s, span) => cursor('playAround', 'play', [s, span], () => 'Playing ±' + span + ' s around the note'),
    playRange: (a, b, l) => cursor('playRange', 'play', [a, b, l], () => 'Playing ' + l),
    playSequence: (r, l) => cursor('playSequence', 'play', [r, l], () => 'Playing ' + l),
    applyFix: (l, k, n, a) => edit('applyFix', 'cleanup', [k, n, a], () => l + ' in ' + label(), n > 0),
    addFx: (n, a, b, sc) => edit('addFx', 'fx', [n, a, b, sc], () => n + ' added in ' + label()),
    removeFx: (n) => edit('removeFx', 'fx', [n], () => n + ' removed in ' + label()),
    bypassFx: (n, by) => edit('bypassFx', 'fx', [n, by], () => n + (by ? ' bypassed in ' : ' on in ') + label()),
    setFxParam: (n, k, v) => edit('setFxParam', 'fx', [n, k, v], () => n + ' ' + k + ' ' + v),
    compareFx: (n, a, b) => cursor('compareFx', 'fx', [n, a, b], () => 'Playing without ' + n + ', then with it'),
    openInDaw: (w) => cursor('openInDaw', 'open', [w], () => 'Opened in ' + label()),
    checkAgain: (n) => cursor('checkAgain', 'open', [n], () => 'Checked ' + n + ' files again.'),
  }
}

let current: DawAdapter = createMockDaw()
export function daw(): DawAdapter {
  return current
}
export function setDaw(d: DawAdapter): void {
  current = d
}
/** Back to the project as opened. Called when the app state is reset. */
export function resetDaw(): void {
  current.reset?.()
}