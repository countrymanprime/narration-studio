import { numberedChapters } from '@/selectors/chapters'
import type { Milestone, PaymentKind } from '@/domain/schemas'
import { platformOf } from '@/selectors/platform'
import { measOf, minutesOf, nOf } from '@/selectors/progress'
import { toast, toastUndo } from '@/ui/overlay'
import { act, getState, update } from '../store'


export function setMilestoneDone(id: number, done: boolean): void {
  update((d) => { const m = d.data.milestones.find((x) => x.id === id); if (m) m.done = done })
}
/** The stored scope for a measure picked from the list: "first N" takes its N from the draft. */
const scopeFor = (draft: MilestoneDraft, max: number): string =>
  draft.measure === 'chN'
    ? 'ch' + Math.max(1, Math.min(max, Math.round(draft.chapters) || nOf(undefined)))
    : draft.measure === 'minN'
      ? 'min' + Math.max(1, Math.round(draft.minutes) || minutesOf(undefined))
      : draft.measure

/** Everything the milestone dialog edits. `measure` is an id from the measure list; chapters and minutes are the N of "first N". */
export interface MilestoneDraft { name: string; date: string; measure: string; chapters: number; minutes: number; note: string; done: boolean }

/** A draft that shows an existing milestone. */
export function draftOf(m: Milestone): MilestoneDraft {
  return { name: m.name, date: m.date, measure: measOf(m.scope), chapters: nOf(m.scope), minutes: minutesOf(m.scope), note: m.note ?? '', done: !!m.done }
}
/** A draft for a new milestone. */
export const blankDraft = (): MilestoneDraft => ({ name: '', date: '', measure: 'custom', chapters: nOf(undefined), minutes: minutesOf(undefined), note: '', done: false })

/** Add (id null) or change a milestone. Returns false, and changes nothing, for an empty name or no date. Undoable. */
export function saveMilestone(id: number | null, draft: MilestoneDraft): boolean {
  const name = draft.name.trim()
  if (!name || !draft.date) {
    toast('Give the milestone a name and a date.')
    return false
  }
  const max = Math.max(1, numberedChapters(getState().data).length)
  const scope = scopeFor(draft, max)
  const note = draft.note.trim() || undefined
  const entry = act(id == null ? 'Add milestone' : 'Edit milestone', (d) => {
    const fields = { name, date: draft.date, scope, note, done: draft.done || undefined }
    if (id == null) d.data.milestones.push({ id: d.data.milestones.reduce((a, m) => Math.max(a, m.id), 0) + 1, ...fields })
    else { const m = d.data.milestones.find((x) => x.id === id); if (m) Object.assign(m, fields) }
  })
  if (id == null) toastUndo('Milestone added.', entry)
  return true
}
/** Remove a milestone, with an Undo that puts it back where it was. */
export function removeMilestone(id: number): void {
  const m = getState().data.milestones.find((x) => x.id === id)
  if (!m) return
  const entry = act('Remove milestone', (d) => { d.data.milestones = d.data.milestones.filter((x) => x.id !== id) })
  toastUndo('Removed ' + m.name + '.', entry)
}
export function setDueDate(date: string): void {
  if (!date) return
  update((d) => { d.data.due = date; d.mock.deadline = 'custom' })
}

/** Changing how the contract pays clears the amount: a rate per finished hour and a royalty share are not the same number. */
export function setPaymentType(kind: PaymentKind): void {
  update((d) => {
    if (d.data.contract.payment === kind) return
    d.data.contract = { payment: kind, amount: null }
  })
}
/** An amount of nothing set (null) or a number of at least zero. */
export function setContractAmount(amount: number | null): void {
  if (amount != null && !(Number.isFinite(amount) && amount >= 0)) return
  update((d) => { if (d.data.contract.payment !== 'none') d.data.contract.amount = amount })
}

/** Choose the project's delivery profile. A contract that has no payment type yet takes the profile's default; one the narrator set is kept. */
export function setDeliveryProfile(id: string): void {
  update((d) => {
    d.data.deliveryProfile = id
    if (d.data.contract.payment === 'none') {
      const payment = platformOf(d.data).defaultPayment
      if (payment !== 'none') d.data.contract = { payment, amount: null }
    }
  })
}
