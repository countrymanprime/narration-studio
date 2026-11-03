import { openSpeakerPicker } from '@/ui/SpeakerPicker'
import { confirmDialog } from '@/ui/ConfirmDialog'
import type { BookData, Paragraph, Pickup } from '@/domain/schemas'
import { wordsIn } from '@/format/text'
import { clock, mmss } from '@/format/time'
import { boothUnits, pickUnit, pointAtFraction, positionOf, unitSeconds, type BoothUnit } from '@/selectors/booth'
import { chapterSeconds } from '@/fixtures/daw'
import { capOf, dawLabel, lastEnd } from '@/selectors/daw'
import { isDone, pickupList } from '@/selectors/pickups'
import { WPH } from '@/selectors/progress'
import { flagKey, speech } from '@/providers/speech'
import { LIVE_NO_SCORE } from '@/fixtures/speech'
import { getOverlay, subscribeOverlay, toast, toastUndo } from '@/ui/overlay'
import type { ResumePoint } from '@/domain/daw'
import { daw } from '../daw'
import { act, getState, setChangeGuard, update } from '../store'
import { go } from './nav'
import { writeThroughDone } from './pickups'
import { backupBefore } from './backups'
import { markRoll, markStart, markStop, placeOf } from './passagemap'

export const TEXT_SIZE_MIN = 24
export const TEXT_SIZE_MAX = 72
export const TEXT_SIZE_STEP = 4

/* The Booth reads at the standard rate (WPH words an hour) while recording. In the app the position comes from the voice. */
let followTimer: ReturnType<typeof setInterval> | null = null
let recTimer: ReturnType<typeof setInterval> | null = null

export function stopFollow(): void {
  if (followTimer) clearInterval(followTimer)
  followTimer = null
}
/** Stop every timer the Booth runs. */
export function stopBoothTimers(): void {
  stopFollow()
  if (recTimer) clearInterval(recTimer)
  recTimer = null
}
function startFollow(): void {
  stopFollow()
  let acc = 0
  followTimer = setInterval(() => {
    if (getState().ui.booth.paused) return
    acc += (WPH / 3600) * 0.1
    while (acc >= 1) {
      acc -= 1
      stepWord(1, true)
    }
  }, 100)
}

const unitsNow = () => {
  const s = getState()
  return { s, ...boothUnits(s.data, s.ui.chapter) }
}
const clampCur = (n: number, len: number): number => Math.max(0, Math.min(len - 1, n))

/** Move the reading position one word. Reaching the end of the chapter while recording by itself stops the take. */
export function stepWord(d: 1 | -1, auto = false): void {
  const { s, units } = unitsNow()
  if (!units.length) return
  let c = clampCur(s.ui.booth.cur, units.length)
  let w = s.ui.booth.wcur + d
  if (d > 0 && w >= units[c].nw) {
    if (c >= units.length - 1) {
      if (auto && s.ui.booth.rec) toggleRec()
      return
    }
    c++
    w = 0
  } else if (d < 0 && w < 0) {
    if (c <= 0) return
    c--
    w = units[c].nw - 1
  }
  update((x) => { x.ui.booth.cur = c; x.ui.booth.wcur = w; if (!auto) x.ui.booth.browse = false })
}

/** Put the reading position on a word. A click or a step snaps the view back from browsing. */
export function setReadingPosition(cur: number, wcur = 0): void {
  update((d) => { d.ui.booth.cur = cur; d.ui.booth.wcur = wcur; d.ui.booth.browse = false })
}
export function nextPhrase(): void {
  const { s, units } = unitsNow()
  setReadingPosition(Math.min(units.length - 1, s.ui.booth.cur + 1))
}
export function backPhrase(): void {
  setReadingPosition(Math.max(0, getState().ui.booth.cur - 1))
}

const dawName = (): string => dawLabel(daw().capabilities().daw)

/**
 * Start or stop a take. `quiet` stops without a toast or an undo point (leaving the Booth). Starting asks the DAW first: when a
 * precondition fails (no track, several tracks, not running) nothing starts and the reason is shown.
 */
export function toggleRec(quiet = false): void {
  if (!getState().ui.booth.rec) startTake()
  else stopTake(quiet)
}

/** Why Record cannot start in this chapter, or null. The Record control shows it. */
export const recordRefusal = (chapterId: string): string | null => daw().recordCheck(chapterId)?.reason ?? null

/**
 * One chapter is one track, only that track is armed, and a take starts at the end of the last item on it so nothing is overwritten.
 * Only an explicit Start from here that lies inside what is already recorded is a punch, and a punch asks first where the DAW would
 * lose the audio it covers.
 */
function startTake(): void {
  const s = getState()
  const why = recordRefusal(s.ui.chapter)
  if (why) { toast(why); return }
  const { units } = unitsNow()
  const at = s.ui.booth.punchAt
  if (at != null && units[at]) {
    const sec = Math.round(unitSeconds(units, at))
    if (sec < daw().recordStartAt(s.ui.chapter)) {
      const c = capOf(s.mock, 'roll')
      if (!c?.available) { toast(c?.reason ?? 'Punching in is not available.'); return }
      if (c.destructive) {
        askBeforeReplacing('Punch in at ¶ ' + (units[at].pi + 1) + '?', 'Punch in', () => beginTake(sec))
        return
      }
      beginTake(sec)
      return
    }
  }
  beginTake()
}

function beginTake(punchAt?: number): void {
  const chapterId = getState().ui.chapter
  /* A punch replaces audio: where the DAW keeps backups, the stretch around it is cloned first. */
  if (punchAt != null) backupBefore(chapterId, punchAt, 'Punch in at ' + mmss(Math.round(punchAt)))
  const r = daw().recordStart(chapterId, punchAt == null ? undefined : { punchAt })
  if (r.refused) { toast(r.refused); return }
  const { s, paras, units } = unitsNow()
  update((d) => {
    d.ui.booth.rec = true; d.ui.booth.paused = false; d.ui.booth.recSec = 0; d.ui.booth.browse = false
    d.ui.booth.takeFrom = clampCur(d.ui.booth.cur, units.length)
    d.ui.booth.takeAt = punchAt ?? daw().recordStartAt(chapterId)
  })
  markStart(chapterId, placeOf(paras, units, s.ui.booth.cur, s.ui.booth.wcur), punchAt ?? daw().recordStartAt(chapterId))
  startFollow()
  recTimer = setInterval(() => { if (!getState().ui.booth.paused) update((d) => { d.ui.booth.recSec++ }) }, 1000)
}

/** The question before the DAW replaces audio: the take is held while it is open. */
function askBeforeReplacing(title: string, confirmLabel: string, onConfirm: () => void): void {
  const rec = getState().ui.booth.rec
  if (rec) pauseRec()
  confirmDialog({
    title, confirmLabel, cancelLabel: rec ? 'Keep recording' : 'Cancel', focus: 'cancel',
    body: dawName() + ' will record over the audio from here, and what it replaces is not kept as a take.',
    onConfirm: () => { if (rec) resumeRec(); onConfirm() },
    onCancel: () => { if (rec) resumeRec() },
  })
}

function stopTake(quiet: boolean): void {
  const s = getState()
  const { paras, units } = unitsNow()
  const stopped = daw().recordStop(s.ui.booth.recSec)
  stopBoothTimers()
  const cur = clampCur(s.ui.booth.cur, units.length)
  markStop(s.ui.chapter, placeOf(paras, units, cur, s.ui.booth.wcur), s.ui.booth.takeAt + s.ui.booth.recSec, paras)
  const from = s.ui.booth.takeFrom
  update((d) => { d.ui.booth.recAll += d.ui.booth.recSec; d.ui.booth.take++; d.ui.booth.rec = false; d.ui.booth.paused = false; d.ui.booth.browse = false })
  /* Where the narrator stopped is remembered for the chapter. */
  const at = positionOf(paras, units, cur, s.ui.booth.wcur)
  if (at) update((d) => { d.data.resume[s.ui.chapter] = { ...at, source: 'booth', confident: true } })
  /* A pickup counts as recorded when the take ran over its line. */
  const lines = s.ui.pickups.mode ? pickupList(s.data).filter((x) => s.ui.pickups.lines.includes(x.id)) : []
  const hit = lines.filter((x) => x.chapterId === s.ui.chapter && !isDone(s.data, x.id) && pickUnit(x, units) >= from && pickUnit(x, units) <= cur)
  const ids = hit.map((x) => x.id)
  const found = suspectedFrom(s.data, s.ui.chapter, paras, units, Math.min(from, cur), Math.max(from, cur), s.ui.booth.takeAt)
  if (ids.length) writeThroughDone(ids, true)
  if (quiet) {
    if (ids.length || found.length) update((d) => { d.data.pickDone.push(...ids); d.data.pickups.push(...found) })
    return
  }
  const parts: string[] = []
  if (hit.length) parts.push(hit.length + (hit.length > 1 ? ' pickups' : ' pickup') + ' recorded')
  if (found.length) parts.push(found.length + ' suspected ' + (found.length > 1 ? 'lines' : 'line') + ' added to Pickups')
  if (stopped.refused) toast(stopped.refused)
  if (!parts.length) { if (!stopped.refused) toast('Take saved'); return }
  const label = hit.length && !found.length ? hit.length + ' ' + (hit.length > 1 ? 'pickups' : 'pickup') + ' marked recorded' : parts.join(' and ')
  const e = act(label, (d) => { d.data.pickDone.push(...ids); d.data.pickups.push(...found) })
  toastUndo('Take saved · ' + parts.join(' · '), e, 7000)
}

/**
 * Lines the live speech check suspects were skipped or read again in the stretch just read. They come from the speech provider, never
 * from the narrator, and a line that is already a pickup or was dismissed is not added again.
 */
function suspectedFrom(b: BookData, chapterId: string, paras: Paragraph[], units: BoothUnit[], from: number, to: number, startSec: number): Pickup[] {
  const pids = [...new Set(units.slice(from, to + 1).map((u) => u.pid))]
  const have = new Set([...b.pickups.map((x) => x.id), ...b.pickGone])
  const out: Pickup[] = []
  for (const f of speech().liveFlags({ chapterId, pids })) {
    const id = flagKey(f)
    const ui = units.findIndex((u) => u.pid === f.pid)
    if (have.has(id) || ui < 0 || out.some((x) => x.id === id)) continue
    const p = paras[units[ui].pi]
    const script = p.text.split(/\s+/).filter(Boolean).slice(f.words[0], f.words[1]).join(' ')
    out.push({
      id, chapterId, pid: f.pid, t: clock(startSec + unitSeconds(units, ui) - unitSeconds(units, from)), ty: f.kind === 'skip' ? 'skip' : 'repeat',
      script, ctx: p.text, src: 'speech', live: true, conf: null, confReason: LIVE_NO_SCORE,
    })
  }
  return out
}

/** Dismiss a suspected line. It stays dismissed when the same place is read again. */
export function dismissSuspected(id: string): void {
  const e = act('Dismissed a suspected line', (d) => {
    if (!d.data.pickGone.includes(id)) d.data.pickGone.push(id)
    d.data.pickOut = d.data.pickOut.filter((x) => x !== id)
  })
  toastUndo('Dismissed.', e, 6000)
}

/** Leaving the Booth stops a take that is running. This is the safety net; the narrator is asked first (see the change guard below). */
export function stopRecordingQuietly(): void {
  if (getState().ui.booth.rec) toggleRec(true)
  stopBoothTimers()
}

/* ---- Leaving while recording: ask, then stop the DAW's recording and leave. Nothing stops silently. ---- */
let asking = false
function askToStop(replay: () => void): void {
  if (asking) return
  asking = true
  pauseRec()
  confirmDialog({
    title: 'Stop recording?', body: dawName() + ' is recording. Leaving the Booth stops it.', confirmLabel: 'Stop and leave', cancelLabel: 'Keep recording', focus: 'cancel',
    onConfirm: () => { asking = false; resumeRec(); toggleRec(); replay() },
    onCancel: () => { asking = false; resumeRec() },
  })
}
setChangeGuard((cur, next, replay) => {
  if (cur.ui.page !== 'booth' || !cur.ui.booth.rec || next.ui.page === 'booth') return false
  askToStop(replay)
  return true
})

/** F11: the Booth takes the whole screen. */
export function toggleFullscreen(): void {
  const el = document.documentElement
  const say = (): void => toast('Full screen is not available here.')
  try {
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else if (typeof el.requestFullscreen === 'function') void el.requestFullscreen().catch(say)
    else say()
  } catch {
    say()
  }
}

/**
 * Where the narrator stopped in a chapter, for Resume at ¶ n. What the Booth remembered wins; otherwise the end of the last item on
 * the chapter's track (the DAW's live project, or its saved one when the DAW is not running). Nothing is guessed: no recording, no offer.
 */
export function resumePointFor(b: BookData, chapterId: string, paras: Paragraph[]): ResumePoint | null {
  const kept = b.resume[chapterId]
  if (kept) return kept
  const c = b.chapters.find((x) => x.id === chapterId)
  const track = daw().tracks().find((t) => t.chapterId === chapterId)
  const end = lastEnd(track)
  if (!c || end <= 0) return null
  const total = chapterSeconds(c)
  /* The recording reaches the end (within a second, the length is rounded): there is nothing to resume. */
  if (end + 1 >= total) return null
  const f = end / total
  const pt = pointAtFraction(paras, f)
  return pt ? { ...pt, source: daw().capabilities().reachable ? 'live' : 'saved', confident: false } : null
}

/**
 * Roll again from `from` (a phrase index): the take keeps running and the text goes back there.
 * Records the punch with the paragraph it rolled from and when in the take.
 */
function rollFrom(from: number): void {
  const { units } = unitsNow()
  const to = clampCur(from, units.length)
  const c = capOf(getState().mock, 'roll')
  if (!c?.available) { toast(c?.reason ?? 'Rolling again is not available.'); return }
  if (c.destructive) {
    askBeforeReplacing('Roll again from ¶ ' + (units[to].pi + 1) + '?', 'Roll again', () => doRoll(to, true))
    return
  }
  doRoll(to, false)
}
function doRoll(to: number, confirmed: boolean): void {
  const { s, paras, units } = unitsNow()
  if (!s.ui.booth.rec) return
  const now = s.ui.booth.takeAt + s.ui.booth.recSec
  /* Where the DAW keeps backups the audio around the roll is cloned first, which is what makes the roll safe. */
  backupBefore(s.ui.chapter, Math.round(unitSeconds(units, to)), 'Roll again from ¶ ' + (units[to].pi + 1), now)
  const r = daw().roll(s.ui.chapter, now, { confirmed })
  if (r.refused) { toast(r.refused); return }
  markRoll(s.ui.chapter, placeOf(paras, units, to, 0), placeOf(paras, units, s.ui.booth.cur, s.ui.booth.wcur), now)
  update((d) => {
    d.ui.booth.punches.push({ pi: units[to].pi, at: mmss(d.ui.booth.recSec) })
    d.ui.booth.cur = to
    d.ui.booth.wcur = 0
    d.ui.booth.browse = false
    d.ui.booth.paused = false
  })
  toast('Rolling again from ¶ ' + (units[to].pi + 1))
}

/** R: roll again from the phrase the narrator chose with Start from here, otherwise from the current phrase. */
export function punchAndRoll(): void {
  const { s, units } = unitsNow()
  if (!s.ui.booth.rec) { toast('Start recording first.'); return }
  rollFrom(s.ui.booth.punchAt ?? clampCur(s.ui.booth.cur, units.length))
}

/**
 * Start from here (right-click on a phrase): mark where the next roll starts and move the reading position there.
 * While recording this punches in: the take continues rolling from that phrase.
 */
export function startFromHere(unit: number): void {
  const { s, units } = unitsNow()
  const to = clampCur(unit, units.length)
  if (s.ui.booth.rec) {
    update((d) => { d.ui.booth.punchAt = to })
    rollFrom(to)
    return
  }
  update((d) => { d.ui.booth.punchAt = to; d.ui.booth.cur = to; d.ui.booth.wcur = 0; d.ui.booth.browse = false })
  toast('Starting from ¶ ' + (units[to].pi + 1))
}

/**
 * Record from a place in the manuscript: the paragraph and character offset of a selection in the Script. Opens the Booth on that
 * sentence and word, marked as the place to start from.
 */
export function recordFromHere(pid: string, offset: number): void {
  const s = getState()
  const para = s.data.paragraphs.find((p) => p.id === pid)
  if (!para) return
  const { units } = boothUnits(s.data, para.chapterId)
  let at = units.findIndex((u) => u.pid === pid && offset >= u.s && offset < u.e)
  if (at < 0) at = units.map((u) => u.pid === pid && u.s <= offset).lastIndexOf(true)
  if (at < 0) at = units.findIndex((u) => u.pid === pid)
  if (at < 0) return
  const u = units[at]
  const w = Math.max(0, Math.min(u.nw - 1, wordsIn(para.text.slice(u.s, Math.max(u.s, offset)).trimEnd())))
  update((d) => {
    d.ui.chapter = para.chapterId
    d.ui.booth.punchAt = at; d.ui.booth.cur = at; d.ui.booth.wcur = w; d.ui.booth.browse = false; d.ui.booth.ref = null
  })
  go('booth')
}

/* ---- Browsing the text with the wheel ---- */
/**
 * The wheel and Page Up / Down only move the view (by pixels, in the Teleprompter): the reading position stays where it was.
 * The view goes back to the reading position when a take starts, and the position only moves when the narrator clicks a word,
 * chooses Start from here or uses the keys.
 */
export function browseView(on: boolean): void {
  if (getState().ui.booth.browse !== on) update((d) => { d.ui.booth.browse = on })
}

/* ---- The take is held while a Booth menu is open ---- */
let menuHeld = false
/** Pause a running take (follow and timer stop). */
export function pauseRec(): void {
  if (getState().ui.booth.rec && !getState().ui.booth.paused) update((d) => { d.ui.booth.paused = true })
}
export function resumeRec(): void {
  if (getState().ui.booth.paused) update((d) => { d.ui.booth.paused = false })
}
/* Any context menu opened in the Booth pauses the take; however it closes (an item, Escape, a click outside) it resumes. */
subscribeOverlay(() => {
  const open = !!getOverlay().ctx && getState().ui.page === 'booth'
  if (open && !menuHeld) {
    if (getState().ui.booth.rec && !getState().ui.booth.paused) { menuHeld = true; pauseRec() }
  } else if (!open && menuHeld) {
    menuHeld = false
    resumeRec()
  }
})

/* ---- Reference: what the side panel shows for a clicked word ---- */
export function setBoothRef(ref: { entryId: string | null; annId: string | null } | null): void {
  update((d) => {
    d.ui.booth.ref = ref
    if (ref) d.ui.booth.rail = true
  })
}
/** Open the Story Bible page on an entry. */
export function openEntryInBible(id: string): void {
  update((d) => { d.ui.bible.sel = id; d.ui.bible.kind = 'All'; d.ui.bible.q = '' })
  go('bible')
}

export function changeTextSize(delta: number): void {
  update((d) => { d.ui.booth.textSize = Math.max(TEXT_SIZE_MIN, Math.min(TEXT_SIZE_MAX, d.ui.booth.textSize + delta)) })
}

/** Leave the Booth. While a take is recording the change guard asks "Stop recording?" first. */
export function exitBooth(): void {
  go(getState().ui.pickups.mode ? 'pickups' : 'script')
}

/* ---- Pickup session inside the Booth ---- */
export function jumpPick(id: string): void {
  const s = getState()
  const x = pickupList(s.data).find((y) => y.id === id)
  if (!x || !s.ui.pickups.lines.includes(id)) return
  if (s.ui.booth.rec) { toast('Stop recording first.'); return }
  const { units } = boothUnits(s.data, x.chapterId)
  update((d) => {
    d.ui.pickups.at = id
    d.ui.chapter = x.chapterId
    d.ui.booth.cur = Math.max(0, pickUnit(x, units))
    d.ui.booth.wcur = 0
  })
}
export function nextPick(dir: 1 | -1): void {
  const s = getState()
  const L = s.ui.pickups.lines
  if (!L.length) return
  const i = Math.max(0, L.indexOf(s.ui.pickups.at ?? ''))
  jumpPick(L[(i + dir + L.length) % L.length])
}
export const sessionLines = (all: Pickup[], ids: string[]): Pickup[] => ids.map((id) => all.find((x) => x.id === id)).filter((x): x is Pickup => !!x)

/* ---- Speakers ---- */
/** Confirm or set the speaker of a phrase. Shared with the Script reader. */
export function setSpeaker(key: string, spk: string): void {
  update((d) => { d.data.confirmedSpeakers[key] = spk })
}
/** The picker for a phrase's speaker: search, with the people in the chapter first. */
export function openSpeakerMenu(el: HTMLElement, key: string, cur: string, confirmed: boolean): void {
  openSpeakerPicker(el, key, cur, confirmed)
}
