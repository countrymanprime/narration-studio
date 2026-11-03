/** Playing a take raw from Proof. Proof only plays and links: nothing here changes a take. */
import { daw } from '@/state/daw'
import { spotOf } from '@/selectors/proofTakes'
import { getState, update } from '../store'

let timer: ReturnType<typeof setTimeout> | undefined
export function stopTake(): void {
  if (timer) clearTimeout(timer)
  timer = undefined
  if (getState().ui.proof.takePlay != null) update((d) => { d.ui.proof.takePlay = null })
}
/** Play (or stop) one take of the selected note's spot from the raw recording. */
export function playTakeRaw(takeId: string): void {
  const s = getState()
  if (s.ui.proof.takePlay === takeId) { stopTake(); return }
  const n = s.data.proofNotes.find((x) => x.id === s.ui.proof.sel)
  const spot = n ? spotOf(s.data, n) : null
  const t = spot?.takes.find((x) => x.id === takeId)
  if (!t) return
  stopTake()
  daw().playAround(t.start + t.len / 2, t.len / 2)
  update((d) => { d.ui.proof.takePlay = takeId })
  timer = setTimeout(stopTake, t.len * 1000)
}
