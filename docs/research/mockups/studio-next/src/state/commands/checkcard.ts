/**
 * The recording check card: run the check (the same one Pickups runs, with a progress that the mock paces), cancel it, and turn a finding
 * into a note or ignore it. The check never decides anything: Accept makes an ordinary note with the suggested decision already chosen.
 */
import { CHECK_STEP_MS, CHECK_STEP_PCT } from '@/config/estimates'
import { clock } from '@/format/time'
import { recordingCheck } from '@/providers/recordingcheck'
import { evidenceKey, RES_LABEL } from '@/selectors/proof'
import { toastUndo } from '@/ui/overlay'
import { act, getState, update } from '../store'
import { detectPickups } from './pickups'
import { setNoteRes } from './notes'

let timer: ReturnType<typeof setInterval> | undefined
const stop = (): void => {
  if (timer) clearInterval(timer)
  timer = undefined
}

/** Check the chapter's recording against its script. The result is stored (and goes out of date) exactly as Pickups' check does. */
export function runRecordingCheck(chapterId: string): void {
  if (getState().ui.proof.checkRun) return
  stop()
  update((d) => { d.ui.proof.checkRun = { chapterId, pct: 0 } })
  timer = setInterval(() => {
    const run = getState().ui.proof.checkRun
    if (!run) { stop(); return }
    const pct = Math.min(100, run.pct + CHECK_STEP_PCT)
    if (pct < 100) { update((d) => { if (d.ui.proof.checkRun) d.ui.proof.checkRun.pct = pct }); return }
    stop()
    update((d) => { d.ui.proof.checkRun = null })
    detectPickups([chapterId], true)
  }, CHECK_STEP_MS)
}
export function cancelRecordingCheck(): void {
  stop()
  update((d) => { d.ui.proof.checkRun = null })
}

export const toggleFindings = (): void => update((d) => { d.ui.proof.findingsOpen = !d.ui.proof.findingsOpen })
export const setFindingsFilter = (f: 'todo' | 'accepted' | 'ignored'): void => update((d) => { d.ui.proof.findingsFilter = f })

const findingOf = (id: string) => {
  const chapterId = getState().ui.chapter
  const f = recordingCheck().findings(chapterId).find((x) => x.id === id)
  const cat = f ? recordingCheck().categories().find((x) => x.id === f.kind) : undefined
  return f && cat ? { f, cat } : null
}

/** Accept a finding: it becomes a proof note with the suggested decision chosen (one undo step). */
export function acceptFinding(id: string): boolean {
  const hit = findingOf(id)
  if (!hit) return false
  const { f, cat } = hit
  const b = getState().data
  if (b.findingReviews.some((r) => r.id === id)) return false
  const noteId = b.proofNotes.reduce((a, n) => Math.max(a, n.id), 0) + 1
  const e = act('Accepted a finding at ' + clock(f.sec), (d) => {
    d.data.proofNotes.push({
      id: noteId, chapterId: f.chapterId, pid: f.pid, t: clock(f.sec), sec: f.sec, ty: cat.ty, h: f.text, script: f.script ?? '', heard: f.heard ?? '',
      from: cat.source === 'speech' ? 'Speech check' : 'Audio check', note: '', res: null, conf: f.conf, ...(f.confReason ? { confReason: f.confReason } : {}),
      evidence: evidenceKey({ heard: f.heard ?? f.text, conf: f.conf }), history: [],
    })
    const n = d.data.proofNotes[d.data.proofNotes.length - 1]
    setNoteRes(d, n, cat.suggest)
    d.data.findingReviews.push({ id, chapterId: f.chapterId, status: 'accepted', noteId })
  })
  toastUndo('Added as a note: ' + RES_LABEL[cat.suggest] + '.', e, 7000)
  return true
}

/** Ignore a finding: it stays listed as ignored and no note is made. */
export function ignoreFinding(id: string): boolean {
  const hit = findingOf(id)
  if (!hit) return false
  if (getState().data.findingReviews.some((r) => r.id === id)) return false
  const e = act('Ignored a finding at ' + clock(hit.f.sec), (d) => { d.data.findingReviews.push({ id, chapterId: hit.f.chapterId, status: 'ignored' }) })
  toastUndo('Finding ignored.', e, 6000)
  return true
}
