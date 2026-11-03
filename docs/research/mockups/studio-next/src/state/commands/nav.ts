import { closePop } from '@/ui/overlay'
import { getState, update } from '../store'
import type { Page } from '../slices/ui'

/** Go to a page. Leaving the Booth is handled by the Booth itself (it stops a take when it unmounts). */
export function go(page: Page): void {
  closePop()
  update((d) => {
    // Entering the Booth any way but a pickup session ends the session (openPickMode sets the page itself).
    if (page === 'booth') { d.ui.pickups.mode = false; d.ui.pickups.lines = [] }
    d.ui.page = page
    d.ui.script.drawer = null
  })
}

/** Make a chapter the current one on every page. */
export function setChapter(id: string): void {
  update((d) => {
    d.ui.chapter = id
  })
}

/** Open a chapter in the Script reader. */
export function openInScript(id: string): void {
  update((d) => {
    d.ui.chapter = id
    d.ui.script.pendingJump = id
    d.ui.page = 'script'
    d.ui.script.drawer = null
  })
}

export function openInBooth(id: string): void {
  update((d) => {
    d.ui.chapter = id
    d.ui.page = 'booth'
  })
}

export function openInProof(id: string): void {
  update((d) => {
    d.ui.chapter = id
    d.ui.proof.scope = 'chapter'
    d.ui.page = 'proof'
  })
}

/** Open Editing on the script at a passage (its takes open under the line), or on the chapter when no passage is given. */
export function openInEditing(chapterId: string, passageId?: string): void {
  update((d) => {
    d.ui.chapter = chapterId
    d.ui.page = 'editing'
    if (passageId) {
      const p = d.data.passages.find((x) => x.id === passageId)
      d.ui.editing.passage = passageId
      d.ui.editing.abA = null
      d.ui.editing.abB = null
      if (p) {
        d.ui.editing.cursor = p.pid + ':0'
        d.ui.editing.sel = null
        if (!d.ui.editing.openTakes.includes(p.id)) d.ui.editing.openTakes.push(p.id)
      }
    }
  })
}

export function openInMaster(id: string): void {
  update((d) => {
    d.ui.chapter = id
    d.ui.master.row = id
    d.ui.page = 'master'
  })
}

/** Which key holds this page's "all chapters or one" choice. */
export const scopeKeyOf = (page: Page): 'proof' | 'pickups' | null => (page === 'proof' ? 'proof' : page === 'pickups' ? 'pickups' : null)
export const currentPage = (): Page => getState().ui.page
