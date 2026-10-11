import type { ProofNote, Resolution } from '@/domain/schemas'
import { RES_LABEL } from '@/selectors/proof'
import { toastUndo } from '@/ui/overlay'
import { act, update } from '../store'
import { setNoteRes } from './notes'

/** Companion: choose which note is at the playhead. */
export function selectNote(id: number): void {
  update((d) => { d.ui.proof.sel = id })
}

/** Decide the note at the playhead. Undoable like the Proof decision, but the Companion stays on the same note. */
export function decideCompanionNote(note: ProofNote, res: Resolution): void {
  const entry = act('Decision “' + RES_LABEL[res] + '” at ' + note.t, (d) => {
    d.ui.proof.sel = note.id
    const n = d.data.proofNotes.find((x) => x.id === note.id)
    if (n) setNoteRes(d, n, res)
  }, { restoreUi: ['proof.sel'] })
  toastUndo(note.t + ' · ' + RES_LABEL[res], entry)
}

export function openFullApp(): void {
  update((d) => { d.mock.companion = false })
}
