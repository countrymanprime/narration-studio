/** Commands for bookmarks: make one at a spot, edit its label and note, delete it, go to it, step to the next or previous. */
import type { Bookmark } from '@/domain/schemas'
import { bookmarkAt, bookmarkById, bookmarkTitle, boothPositionOf, stepBookmark, type Spot } from '@/selectors/bookmarks'
import { paragraphById } from '@/selectors/chapters'
import { announce, toast, toastUndo } from '@/ui/overlay'
import { act, getState, update } from '../store'

const nextId = (all: Bookmark[]): string => 'b' + (all.reduce((m, x) => Math.max(m, +(/^b(\d+)$/.exec(x.id)?.[1] ?? 0)), 0) + 1)

export interface Added { bookmark: Bookmark; existing: boolean }

/**
 * Bookmark a spot. A spot that already has one is not marked twice (the existing one is returned). Null when the paragraph is not in the manuscript.
 * The date is the mock clock's. `quiet` skips the toast (the caller opens the editor, which has its own delete).
 */
export function addBookmark(spot: Spot, opts: { quiet?: boolean } = {}): Added | null {
  const { data } = getState()
  const p = paragraphById(data, spot.pid)
  if (!p) return null
  const offset = Math.max(0, Math.min(p.text.length, Math.floor(spot.offset)))
  const had = bookmarkAt(data, { pid: spot.pid, offset })
  if (had) return { bookmark: had, existing: true }
  const bookmark: Bookmark = { id: nextId(data.bookmarks), chapterId: p.chapterId, pid: p.id, offset, label: '', note: '', at: data.today }
  const e = act('Added a bookmark', (d) => { d.data.bookmarks.push(bookmark) })
  if (!opts.quiet) toastUndo('Bookmark added.', e)
  return { bookmark, existing: false }
}

/** Save a bookmark's label and note (one undo step). Nothing is recorded when nothing changed. */
export function updateBookmark(id: string, v: { label?: string; note?: string }): void {
  const cur = bookmarkById(getState().data, id)
  if (!cur) return
  const label = (v.label ?? cur.label).trim().slice(0, 60)
  const note = (v.note ?? cur.note).trim().slice(0, 500)
  if (label === cur.label && note === cur.note) return
  act('Edited a bookmark', (d) => {
    const x = d.data.bookmarks.find((y) => y.id === id)
    if (x) { x.label = label; x.note = note }
  })
}

export function removeBookmark(id: string): void {
  if (!bookmarkById(getState().data, id)) return
  const e = act('Deleted a bookmark', (d) => { d.data.bookmarks = d.data.bookmarks.filter((x) => x.id !== id) })
  update((d) => { if (d.ui.script.bmAt === id) d.ui.script.bmAt = null })
  toastUndo('Bookmark deleted.', e)
}

let flashTimer: ReturnType<typeof setTimeout> | undefined

/** Show a bookmark in the Script reader: scroll to it, light its paragraph for a moment. */
export function showBookmarkInScript(id: string): void {
  const x = bookmarkById(getState().data, id)
  if (!x) return
  update((d) => {
    d.ui.chapter = x.chapterId
    d.ui.page = 'script'
    d.ui.script.drawer = null
    d.ui.script.pendingBm = x.id
    d.ui.script.bmAt = x.id
    d.ui.script.bmFlash = x.pid
  })
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => update((d) => { d.ui.script.bmFlash = null }), 1600)
}

/** Put the Booth's reading position on a bookmark, in its chapter. Refused while a take runs and the bookmark is in another chapter. */
export function showBookmarkInBooth(id: string): boolean {
  const s = getState()
  const x = bookmarkById(s.data, id)
  if (!x) return false
  const pos = boothPositionOf(s.data, x)
  if (!pos) return false
  if (x.chapterId !== s.ui.chapter && s.ui.booth.rec) {
    toast('Stop recording first.')
    return false
  }
  update((d) => {
    d.ui.chapter = x.chapterId
    d.ui.booth.cur = pos.cur
    d.ui.booth.wcur = pos.wcur
    d.ui.booth.browse = false
    d.ui.booth.punchAt = null
  })
  return true
}

/** Go to a bookmark where the narrator is: the Booth's reading position from the Booth, the reader from anywhere else. */
export function goToBookmark(id: string): void {
  if (getState().ui.page === 'booth') showBookmarkInBooth(id)
  else showBookmarkInScript(id)
}

/** Go to the next or previous bookmark from a place (wrapping). Says so when there are none. */
export function stepBookmarks(dir: 1 | -1, from: Spot | null): void {
  const { data } = getState()
  const x = stepBookmark(data, from, dir)
  if (!x) {
    toast('No bookmarks yet.')
    return
  }
  goToBookmark(x.id)
  announce('Bookmark: ' + bookmarkTitle(data, x))
}
