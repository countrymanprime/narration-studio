import type { BookData, Pickup } from '@/domain/schemas'
import { GAP_LABEL } from './gaps'

/** Every pickup: the queued ones plus the proof notes decided "Needs pickup", minus the ones removed. */
export function pickupList(b: BookData): Pickup[] {
  const fromProof: Pickup[] = b.proofNotes
    .filter((r) => r.res === 'pickup')
    .map((r) => ({ id: 'p' + r.id, chapterId: r.chapterId, pid: r.pid, t: r.t, ty: r.ty, script: r.script, ctx: r.script, src: 'proof' as const, rid: r.id }))
  const gone = new Set(b.pickGone)
  return [...b.pickups.filter((x) => x.src !== 'proof'), ...fromProof].filter((x) => !gone.has(x.id))
}

export const isDone = (b: BookData, id: string): boolean => b.pickDone.includes(id)
export const isOut = (b: BookData, id: string): boolean => b.pickOut.includes(id)
export const openPickups = (b: BookData, chapterId?: string): number =>
  pickupList(b).filter((x) => (chapterId == null || x.chapterId === chapterId) && !isDone(b, x.id)).length

/** Where a pickup came from, for the From column. A confidence is shown only when the check had one. */
export function srcLabel(x: Pickup): string {
  if (x.src === 'speech') return 'Speech' + (x.conf != null ? ' · ' + x.conf.toFixed(2) : x.live ? '' : ' · no score')
  return x.src === 'audio' ? 'Audio' : x.src === 'proof' ? 'Proof note' : 'You'
}
/** What the Type column says: the kind of gap a speech check found, otherwise the kind of finding. */
export const typeLabel = (x: Pickup): string => (x.gap ? GAP_LABEL[x.gap] : x.ty)

/** Pickups chosen for the session: open and not left out. */
export const sessionPickups = (b: BookData, list: Pickup[]): Pickup[] => list.filter((x) => !isDone(b, x.id) && !isOut(b, x.id))
