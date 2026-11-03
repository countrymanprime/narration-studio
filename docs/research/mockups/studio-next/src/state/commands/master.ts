import { update } from '../store'

/** Choose a row on Master & QC; a chapter row also becomes the shared current chapter. */
export function selectMasterRow(id: string): void {
  update((d) => {
    d.ui.master.row = id
    if (d.data.chapters.some((c) => c.id === id)) d.ui.chapter = id
  })
  setTimeout(() => document.querySelector<HTMLElement>(`tr[data-mr="${id}"]`)?.focus(), 0)
}
