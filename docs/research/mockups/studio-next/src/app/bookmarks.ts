/**
 * Bookmarks across pages: how the Script reader and the Booth make one, step between them, and what the jump menu and the right-click
 * menu offer. A page asks here for "bookmark where I am"; this module knows which place that is on each page.
 */
import { registerCommands, type Command } from '@/app/registry'
import { chName } from '@/selectors/chapters'
import { boothUnits } from '@/selectors/booth'
import { bookmarkById, bookmarkTitle, boothSpot, sortedBookmarks, wordStart, type Spot } from '@/selectors/bookmarks'
import { addBookmark, goToBookmark, removeBookmark, stepBookmarks } from '@/state/commands/bookmarks'
import { selectionSpot, topSpot } from '@/pages/script/selection'
import { getState } from '@/state/store'
import { openBookmarkEditor } from '@/ui/BookmarkEditor'
import { I, type CtxItem } from '@/ui/overlay'

/** Bookmark a spot in the reader and open its editor to leave a note. */
export function bookmarkInScript(spot: Spot | null = selectionSpot() ?? topSpot()): void {
  if (!spot) return
  const r = addBookmark(spot, { quiet: true })
  if (r) openBookmarkEditor(r.bookmark.id)
}

/** The place the Booth's reading position is at. */
export function boothHere(): Spot | null {
  const { data, ui } = getState()
  const { paras, units } = boothUnits(data, ui.chapter)
  return boothSpot(paras, units, Math.max(0, Math.min(units.length - 1, ui.booth.cur)), ui.booth.wcur)
}

/** Bookmark the Booth's reading position, or the word that was clicked. The editor stays closed so the reading is not interrupted. */
export function bookmarkInBooth(spot: Spot | null = boothHere()): void {
  if (spot) addBookmark(spot)
}

/** The bookmark the reader steps from: the last one gone to while it is still in view, else the selection or caret, else the top of the page. */
function readerFrom(): Spot | null {
  const { data, ui } = getState()
  const last = bookmarkById(data, ui.script.bmAt)
  if (last) {
    const sc = document.getElementById('rdscroll')
    const p = sc?.querySelector<HTMLElement>('.para[data-pid="' + last.pid + '"]')
    if (sc && p && p.offsetTop + p.offsetHeight > sc.scrollTop && p.offsetTop < sc.scrollTop + sc.clientHeight) return { pid: last.pid, offset: last.offset }
  }
  const at = selectionSpot()
  if (at) return at
  const top = topSpot()
  /* From the top of a page, a bookmark further down the first paragraph counts as ahead. */
  return top ? { pid: top.pid, offset: -1 } : null
}

export const stepInScript = (dir: 1 | -1): void => stepBookmarks(dir, readerFrom())
export const stepInBooth = (dir: 1 | -1): void => stepBookmarks(dir, boothHere())

/** Step on whichever of the two pages is showing. */
export function stepHere(dir: 1 | -1): void {
  if (getState().ui.page === 'booth') stepInBooth(dir)
  else stepInScript(dir)
}

/** The right-click menu of a bookmark ribbon, or null when the target is not one. */
export function bookmarkMenu(target: Element): CtxItem[] | null {
  const el = target.closest<HTMLElement>('[data-bm]')
  const x = el && bookmarkById(getState().data, el.dataset.bm)
  if (!el || !x) return null
  return [I('Edit bookmark', () => openBookmarkEditor(x.id, el)), I('Delete bookmark', () => removeBookmark(x.id))]
}

/** The word under a right-click in the Booth as a place in its paragraph, or null when the click was not on a word. */
export function boothSpotAt(target: Element): Spot | null {
  const w = target.closest<HTMLElement>('.bu[data-u] .w[data-w]')
  const u = target.closest<HTMLElement>('.bu[data-u]')
  if (!w || !u) return null
  const { data, ui } = getState()
  const { paras, units } = boothUnits(data, ui.chapter)
  const unit = units[+(u.dataset.u ?? -1)]
  const p = unit && paras[unit.pi]
  return unit && p ? { pid: p.id, offset: wordStart(p, unit, +(w.dataset.w ?? 0)) } : null
}

/** Jump menu: every bookmark by name, and the actions on the two pages that have bookmarks. */
registerCommands(() => {
  const { data, ui } = getState()
  const out: Command[] = sortedBookmarks(data).map((x) => {
    const c = data.chapters.find((y) => y.id === x.chapterId)
    return {
      g: 'Bookmarks', l: 'Bookmark: ' + bookmarkTitle(data, x), hint: (x.note + ' ' + (c ? chName(data, c) : '')).toLowerCase(), fn: () => goToBookmark(x.id),
    }
  })
  const here = ui.page === 'script' || ui.page === 'booth'
  if (here && getState().mock.hasManuscript) {
    out.push(
      { g: 'Bookmarks', l: 'Bookmark here', k: 'B', hint: 'add', fn: () => (ui.page === 'booth' ? bookmarkInBooth() : bookmarkInScript()) },
      { g: 'Bookmarks', l: 'Next bookmark', k: ']', hint: '', fn: () => stepHere(1) },
      { g: 'Bookmarks', l: 'Previous bookmark', k: '[', hint: '', fn: () => stepHere(-1) },
    )
  }
  return out
})
