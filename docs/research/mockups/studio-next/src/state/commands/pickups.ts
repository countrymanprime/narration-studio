import type { BookData, Paragraph, Pickup } from '@/domain/schemas'
import { wordsIn, stripTags } from '@/format/text'
import { clock, parseClock } from '@/format/time'
import { chName, paragraphsOf } from '@/selectors/chapters'
import { pickUnit, boothUnits } from '@/selectors/booth'
import { isDone, isOut, pickupList } from '@/selectors/pickups'
import { WPH } from '@/selectors/progress'
import { isChecked, textKey } from '@/selectors/checks'
import { GAP_TYPE } from '@/selectors/gaps'
import { speech, type CheckOutcome } from '@/providers/speech'
import { recheckNotes } from './proof'
import { dawLabel } from '@/selectors/daw'
import { daw } from '../daw'
import { act, getState, update } from '../store'
import { toast, toastUndo } from '@/ui/overlay'

/** An id nobody has used yet: "m1", "m2"… for hand-added lines, "b1"… for lines marked in the Booth. */
export function newPickupId(b: BookData, prefix: string): string {
  const used = new Set(b.pickups.map((x) => x.id))
  let n = 1
  while (used.has(prefix + n)) n++
  return prefix + n
}

/** Open the Booth as a pickup session on these lines (pickups, or their ids). Used by Pickups, Proof and the Companion. */
export function openPickMode(lines: Array<Pickup | string>): void {
  const s = getState()
  const all = pickupList(s.data)
  const picked = lines.map((l) => (typeof l === 'string' ? all.find((x) => x.id === l) : l)).filter((x): x is Pickup => !!x)
  if (!picked.length) return
  const first = picked[0]
  const { units } = boothUnits(s.data, first.chapterId)
  update((d) => {
    d.ui.pickups.lines = picked.map((x) => x.id)
    d.ui.pickups.mode = true
    d.ui.pickups.at = first.id
    d.ui.chapter = first.chapterId
    d.ui.booth.cur = Math.max(0, pickUnit(first, units))
    d.ui.booth.wcur = 0
    d.ui.page = 'booth'
    d.ui.script.drawer = null
  })
}

export function setPickupIncluded(id: string, included: boolean): void {
  update((d) => {
    const i = d.data.pickOut.indexOf(id)
    if (included && i >= 0) d.data.pickOut.splice(i, 1)
    if (!included && i < 0) d.data.pickOut.push(id)
  })
}
export const togglePickupIncluded = (id: string): void => setPickupIncluded(id, isOut(getState().data, id))

export function togglePickupDone(id: string): void {
  const done = !isDone(getState().data, id)
  update((d) => {
    const i = d.data.pickDone.indexOf(id)
    if (i >= 0) d.data.pickDone.splice(i, 1)
    else d.data.pickDone.push(id)
  })
  writeThroughDone([id], done)
}

/**
 * The DAW holds the done state of a pickup as its marker's name (`PICKUP:` open, `PICKUP_DONE:` done). The app writes its own change
 * through. When the DAW is not running the write waits in `pickSync` and goes through when the pickups are next opened.
 */
export function writeThroughDone(ids: string[], done: boolean): void {
  if (!ids.length) return
  const d = daw()
  const away = !d.capabilities().reachable
  const waiting = ids.filter((id) => {
    const r = d.setPickupMarkerDone(id, done)
    return !!r.refused && away
  })
  update((x) => {
    x.data.pickSync = [...x.data.pickSync.filter((id) => !ids.includes(id)), ...waiting]
  })
}

/**
 * On opening: finish the writes that waited, then take the DAW's markers as the truth for the pickups they mark. A pickup marked
 * done in the DAW is done here; one marked open there is open here.
 */
export function reconcilePickupMarkers(): void {
  const d = daw()
  const c = d.capabilities()
  if (!c.reachable || !c.caps.markers?.available) return
  getState().data.pickSync.forEach((id) => { d.setPickupMarkerDone(id, isDone(getState().data, id)) })
  const known = new Set(pickupList(getState().data).map((x) => x.id))
  const marks = d.markers().filter((m) => m.ref && known.has(m.ref))
  const done = marks.filter((m) => m.label.startsWith('PICKUP_DONE:')).map((m) => m.ref as string).filter((id) => !isDone(getState().data, id))
  const open = marks.filter((m) => m.label.startsWith('PICKUP:')).map((m) => m.ref as string).filter((id) => isDone(getState().data, id))
  update((x) => {
    x.data.pickSync = []
    x.data.pickDone = [...x.data.pickDone.filter((id) => !open.includes(id)), ...done]
  })
  const n = done.length + open.length
  if (n) toast(n + (n > 1 ? ' pickups' : ' pickup') + ' updated from the markers in ' + dawLabel(c.daw))
}
export const pickupIsDone = (id: string): boolean => isDone(getState().data, id)

/** Remove a pickup from the list. Undoable. */
export function removePickup(id: string, withToast = true): void {
  const e = act('Removed a pickup', (d) => {
    if (!d.data.pickGone.includes(id)) d.data.pickGone.push(id)
    d.data.pickOut = d.data.pickOut.filter((x) => x !== id)
  })
  if (withToast) toastUndo('Removed from pickups.', e, 6000)
}

/** Add a pickup by hand: find the paragraph whose text starts like the line. Returns false when no line was typed. */
export function addPickupByHand(chapterId: string, time: string, line: string): boolean {
  const l = line.trim()
  if (!l) {
    toast('Type the line first.')
    return false
  }
  update((d) => {
    const needle = l.toLowerCase().slice(0, 24)
    const para = paragraphsOf(d.data, chapterId).find((q) => q.text.toLowerCase().includes(needle))
    d.data.pickups.push({
      id: newPickupId(d.data, 'm'), chapterId, pid: para ? para.id : null, t: time.trim() || '—', ty: 'misread',
      script: '“' + l + '”', ctx: para ? para.text : l, src: 'you',
    })
  })
  return true
}

/** Mark these pickups in the DAW as `PICKUP:` markers (one already marked is left alone). */
export function addPickupMarkers(picked: Pickup[]): void {
  const r = daw().addPickupMarkers(picked.map((x) => ({ id: x.id, chapterId: x.chapterId, sec: parseClock(x.t) ?? 0, label: stripTags(x.script) })))
  if (r.refused || !r.changed) { toast(r.message); return }
  const e = act('Added ' + picked.length + ' markers in ' + dawLabel(daw().capabilities().daw), () => {}, { daw: true })
  toastUndo(r.message, e, 6000)
}

/** The script of a session as text, one line per pickup. */
export function pickupScript(b: BookData, list: Pickup[]): string {
  return list.map((x) => chName(b, b.chapters.find((c) => c.id === x.chapterId) ?? b.chapters[0]) + ' · ' + x.t + ': ' + stripTags(x.script)).join('\n')
}
export function copyPickupScript(text: string): void {
  try {
    navigator.clipboard.writeText(text).then(() => toast('Copied.'), () => toast('Copy failed.'))
  } catch {
    toast('Copy failed.')
  }
}

/** The project as the DAW last saved it: what a recording check is as of. */
export const projectBasis = (): string => daw().projectState().savedAt ?? ''

/** Seconds into the chapter recording where a stretch of the text starts, at the standard reading rate. */
function secondsAt(ps: Paragraph[], pid: string, word: number): number {
  let words = 0
  for (const p of ps) {
    if (p.id === pid) return (words + word) / (WPH / 3600)
    words += wordsIn(p.text)
  }
  return words / (WPH / 3600)
}

/**
 * Checking a recording: the speech engine transcribes the chapter and what it heard is compared with the manuscript. Words left out, extra
 * words and misreads inside the part that was read come back as pickups (with the confidence the engine gave, or none and why). Paragraphs
 * left unread at the start or the end are unfinished recording, not pickups. The result is stored with the engine and the saved project
 * it was made against, and it goes out of date when the text, the recording or the save moves on.
 */
export function detectPickups(ids: string[], again: boolean): void {
  const s = getState()
  const b = s.data
  const engine = s.ui.check.model
  const basis = projectBasis()
  const done: Array<{ id: string; out: CheckOutcome }> = []
  const found: Pickup[] = []
  const existing = new Set(b.pickups.map((x) => x.id))
  ids.forEach((id) => {
    const ps = paragraphsOf(b, id)
    const chapter = b.chapters.find((c) => c.id === id)
    if (!ps.length || !chapter || (isChecked(b, id) && !again)) return
    const out = speech().check({ chapter, paragraphs: ps, engine })
    done.push({ id, out })
    out.findings.forEach((f) => {
      const pid = 'd' + id + ':' + f.pid + ':' + f.words[0]
      const p = ps.find((x) => x.id === f.pid)!
      if (existing.has(pid)) return
      const line = f.script && f.kind !== 'missing' ? f.script : p.text
      found.push({
        id: pid, chapterId: id, pid: f.pid, t: clock(secondsAt(ps, f.pid, f.words[0])), ty: GAP_TYPE[f.kind], gap: f.kind, src: 'speech',
        conf: f.conf, ...(f.confReason ? { confReason: f.confReason } : {}),
        script: f.kind === 'missing' && f.script !== p.text ? '…' + f.script : line.length > 80 ? line.slice(0, 80) + '…' : line, ctx: p.text,
      })
    })
  })
  update((d) => {
    done.forEach(({ id, out }) => {
      const c = d.data.chapters.find((x) => x.id === id)
      const check = {
        chapterId: id, model: engine, textKey: textKey(d.data, id), rec: c ? c.rec : 0, at: d.data.today, basis,
        gaps: out.findings.length, readTo: out.readTo, paras: out.paras, unfinished: out.unfinished,
      }
      const at = d.data.checks.findIndex((k) => k.chapterId === id)
      if (at >= 0) d.data.checks[at] = check
      else d.data.checks.push(check)
    })
  })
  /* A new check can hear a note's evidence differently. */
  const changed = done.length ? recheckNotes(done.map((x) => x.id)) : 0
  const e = found.length
    ? act('Added ' + found.length + (found.length === 1 ? ' pickup' : ' pickups') + ' from the check', (d) => { d.data.pickups.push(...found) })
    : null
  const unfinished = done.filter((x) => x.out.unfinished.start + x.out.unfinished.end > 0).length
  const msg = done.length
    ? 'Checked ' + done.length + (done.length > 1 ? ' chapters' : ' chapter') + ' · ' + found.length + (found.length === 1 ? ' line' : ' lines') + ' to redo' +
      (unfinished ? ' · ' + unfinished + (unfinished > 1 ? ' chapters' : ' chapter') + ' not recorded to the end' : '') +
      (changed ? ' · ' + changed + (changed > 1 ? ' notes have' : ' note has') + ' new evidence' : '')
    : 'Nothing to check: those chapters have no recording text yet'
  if (e) toastUndo(msg, e, 8000)
  else toast(msg, undefined, 8000)
}
