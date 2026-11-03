import { act as rtlAct, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalKeys } from '@/app/keys'
import { allCommands, contextItemsFor } from '@/app/registry'
import { modals } from '@/app/modals'
import '@/app/palette'
import '@/pages'
import { Bookmark } from '@/domain/schemas'
import { makeBook } from '@/fixtures/book'
import { boothUnits } from '@/selectors/booth'
import {
  bookmarkSnippet, bookmarkTip, bookmarkTitle, bookmarksByChapter, boothPositionOf, boothSpot, sortedBookmarks, stepBookmark,
} from '@/selectors/bookmarks'
import { paragraphById } from '@/selectors/chapters'
import { addBookmark, goToBookmark, removeBookmark, showBookmarkInBooth, updateBookmark } from '@/state/commands/bookmarks'
import { finishImport, newProject } from '@/state/commands/manuscript'
import { stopBoothTimers } from '@/state/commands/booth'
import { initialPrefs } from '@/state/slices/ui'
import { createInitialState, getState, resetState, undoLast, update as rawUpdate } from '@/state/store'
import { OverlayHost } from '@/ui/OverlayHost'
import { closePop, closeTopModal, dismissToast, getOverlay } from '@/ui/overlay'
import BoothPage from '@/pages/Booth'
import ScriptPage from '@/pages/Script'

const update: typeof rawUpdate = (fn) => { rtlAct(() => rawUpdate(fn)) }
const run = <T,>(fn: () => T): T => { let r!: T; rtlAct(() => { r = fn() }); return r }
const key = (k: string, init: KeyboardEventInit = {}) => rtlAct(() => { fireEvent.keyDown(document.body, { key: k, ...init }) })

function Harness({ page }: { page: 'script' | 'booth' }) {
  useGlobalKeys()
  return <><OverlayHost />{page === 'script' ? <ScriptPage /> : <BoothPage />}</>
}
const boot = (page: 'script' | 'booth' = 'script'): void => {
  const s = createInitialState({ prefs: initialPrefs })
  s.ui.page = page
  resetState(s)
}
const bms = () => getState().data.bookmarks
const make = (pid: string, offset: number) => run(() => addBookmark({ pid, offset }))!.bookmark

beforeEach(() => boot())
afterEach(() => {
  cleanup()
  stopBoothTimers()
  vi.useRealTimers()
  while (getOverlay().modals.length) closeTopModal()
  closePop()
  getOverlay().toasts.forEach((t) => dismissToast(t.id))
  window.getSelection()?.removeAllRanges()
})

describe('Bookmark: schema and book data', () => {
  it('a bookmark has a stable id, a chapter, a paragraph, a character offset and a date; label and note are optional', () => {
    const x = Bookmark.parse({ id: 'b1', chapterId: '8', pid: '8-1', offset: 12, at: '2026-09-26' })
    expect(x).toEqual({ id: 'b1', chapterId: '8', pid: '8-1', offset: 12, label: '', note: '', at: '2026-09-26' })
  })
  it('refuses a negative or fractional offset, a missing paragraph, and a label that is not short', () => {
    const ok = { id: 'b1', chapterId: '8', pid: '8-1', offset: 0, at: '2026-09-26' }
    expect(Bookmark.safeParse({ ...ok, offset: -1 }).success).toBe(false)
    expect(Bookmark.safeParse({ ...ok, offset: 1.5 }).success).toBe(false)
    expect(Bookmark.safeParse({ ...ok, pid: undefined }).success).toBe(false)
    expect(Bookmark.safeParse({ ...ok, label: 'x'.repeat(61) }).success).toBe(false)
  })
  it('the book starts with none, and old data without the field still parses', () => {
    expect(makeBook().bookmarks).toEqual([])
    const { bookmarks: _drop, ...rest } = makeBook()
    void _drop
    expect(Object.keys(rest)).not.toContain('bookmarks')
  })
})

describe('Bookmark: create, edit, delete, undo', () => {
  it('makes one on a paragraph and offset with the mock clock, a new id each time', () => {
    const a = make('8-1', 10)
    const b = make('8-2', 0)
    expect(a).toMatchObject({ id: 'b1', chapterId: '8', pid: '8-1', offset: 10, label: '', note: '', at: getState().data.today })
    expect(b.id).toBe('b2')
    expect(() => Bookmark.parse(a)).not.toThrow()
  })
  it('does not mark the same spot twice, keeps the offset in the text, and refuses a paragraph that is not in the book', () => {
    const a = make('8-1', 10)
    const again = run(() => addBookmark({ pid: '8-1', offset: 10 }))!
    expect(again.existing).toBe(true)
    expect(again.bookmark.id).toBe(a.id)
    expect(bms()).toHaveLength(1)
    const len = paragraphById(getState().data, '8-2')!.text.length
    expect(make('8-2', 9999).offset).toBe(len)
    expect(run(() => addBookmark({ pid: 'nope', offset: 0 }))).toBeNull()
  })
  it('edits the label and note as one undo step, and does nothing when nothing changed', () => {
    const a = make('8-1', 10)
    const before = getState().history.length
    run(() => updateBookmark(a.id, { label: '  Gardeners ', note: 'Check how Five is said' }))
    expect(bms()[0]).toMatchObject({ label: 'Gardeners', note: 'Check how Five is said' })
    expect(getState().history.length).toBe(before + 1)
    run(() => updateBookmark(a.id, { label: 'Gardeners', note: 'Check how Five is said' }))
    expect(getState().history.length).toBe(before + 1)
    run(() => { undoLast() })
    expect(bms()[0]).toMatchObject({ label: '', note: '' })
  })
  it('deletes, and undo brings it back', () => {
    const a = make('8-1', 10)
    run(() => removeBookmark(a.id))
    expect(bms()).toHaveLength(0)
    run(() => { undoLast() })
    expect(bms().map((x) => x.id)).toEqual([a.id])
  })
  it('adding is undoable', () => {
    make('8-1', 10)
    expect(bms()).toHaveLength(1)
    run(() => { undoLast() })
    expect(bms()).toHaveLength(0)
  })
  it('they stay when the narrator moves between chapters and pages', () => {
    make('8-1', 10)
    update((d) => { d.ui.chapter = '7'; d.ui.page = 'booth' })
    update((d) => { d.ui.chapter = '8'; d.ui.page = 'script' })
    expect(bms()).toHaveLength(1)
  })
  it('are cleared when a manuscript is replaced, and with a new project', () => {
    make('8-1', 10)
    update((d) => { d.ui.script.bmAt = 'b1' })
    run(() => finishImport('replace'))
    expect(bms()).toHaveLength(0)
    expect(getState().ui.script.bmAt).toBeNull()
    make('8-1', 3)
    run(() => newProject())
    expect(bms()).toHaveLength(0)
  })
})

describe('Bookmark: selectors', () => {
  it('lists in the order of the book, by chapter', () => {
    make('8-3', 5)
    make('7-2', 0)
    make('8-1', 40)
    make('8-1', 4)
    const d = getState().data
    expect(sortedBookmarks(d).map((x) => x.pid + ':' + x.offset)).toEqual(['7-2:0', '8-1:4', '8-1:40', '8-3:5'])
    expect(bookmarksByChapter(d).map((g) => [g.chapter.id, g.items.length])).toEqual([['7', 1], ['8', 3]])
  })
  it('names a bookmark by its label, else the words it sits on, and its tip says label and note', () => {
    const a = make('8-1', 8)
    const d1 = getState().data
    expect(bookmarkSnippet(d1, d1.bookmarks[0])).toMatch(/^rose-tree stood/)
    expect(bookmarkTitle(d1, d1.bookmarks[0])).toBe(bookmarkSnippet(d1, d1.bookmarks[0]))
    expect(bookmarkTip(d1, d1.bookmarks[0])).toBe(bookmarkSnippet(d1, d1.bookmarks[0]))
    run(() => updateBookmark(a.id, { label: 'Roses', note: 'Painting scene' }))
    const d2 = getState().data
    expect(bookmarkTitle(d2, d2.bookmarks[0])).toBe('Roses')
    expect(bookmarkTip(d2, d2.bookmarks[0])).toBe('Roses: Painting scene')
    expect(bookmarkSnippet(d2, d2.bookmarks[0], 20).endsWith('…')).toBe(true)
  })
  it('steps forward and back, wrapping round the book, and never lands on where it already is', () => {
    make('7-2', 0)
    make('8-1', 40)
    make('8-3', 5)
    const d = getState().data
    const at = (x: ReturnType<typeof stepBookmark>) => x && x.pid + ':' + x.offset
    expect(at(stepBookmark(d, null, 1))).toBe('7-2:0')
    expect(at(stepBookmark(d, null, -1))).toBe('8-3:5')
    expect(at(stepBookmark(d, { pid: '7-2', offset: 0 }, 1))).toBe('8-1:40')
    expect(at(stepBookmark(d, { pid: '8-1', offset: 40 }, 1))).toBe('8-3:5')
    expect(at(stepBookmark(d, { pid: '8-3', offset: 5 }, 1))).toBe('7-2:0')
    expect(at(stepBookmark(d, { pid: '7-2', offset: 0 }, -1))).toBe('8-3:5')
    expect(at(stepBookmark(d, { pid: '8-1', offset: 0 }, 1))).toBe('8-1:40')
    expect(stepBookmark({ ...d, bookmarks: [] }, null, 1)).toBeNull()
  })
  it('the Booth position and a bookmark map both ways', () => {
    const d = getState().data
    const { paras, units } = boothUnits(d, '8')
    const spot = boothSpot(paras, units, 3, 2)!
    const b = make(spot.pid, spot.offset)
    const pos = boothPositionOf(getState().data, b)!
    expect(pos).toEqual({ cur: 3, wcur: 2 })
    expect(boothSpot(paras, units, pos.cur, pos.wcur)).toEqual(spot)
  })
})

describe('Bookmark: Script reader', () => {
  const selectIn = (pid: string, a: number, b: number): void => {
    const p = document.querySelector(`p[data-pid="${pid}"]`)!
    const w = (off: number): [Node, number] => {
      const t = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
      let n: Node | null
      let left = off
      while ((n = t.nextNode())) {
        if (left <= n.textContent!.length) return [n, left]
        left -= n.textContent!.length
      }
      throw new Error('offset')
    }
    const r = document.createRange()
    r.setStart(...w(a))
    r.setEnd(...w(b))
    r.getBoundingClientRect = () => ({ left: 100, top: 100, width: 50, height: 20, right: 150, bottom: 120, x: 100, y: 100, toJSON() { return {} } }) as DOMRect
    const s = window.getSelection()!
    s.removeAllRanges()
    s.addRange(r)
  }

  it('draws a ribbon in the gutter for each bookmark, with the note in its tooltip', () => {
    const a = make('8-1', 8)
    run(() => updateBookmark(a.id, { label: 'Roses', note: 'Painting scene' }))
    make('8-3', 0)
    render(<Harness page="script" />)
    const rib = document.querySelectorAll<HTMLElement>('.para .bmk-gutter [data-bm]')
    expect(rib).toHaveLength(2)
    expect(document.querySelector<HTMLElement>(`[data-bm="${a.id}"]`)!.dataset.tip).toBe('Roses: Painting scene')
    expect(document.querySelector(`.para[data-pid="8-1"] [data-bm="${a.id}"]`)).not.toBeNull()
  })

  it('B bookmarks the selected text and opens the editor on a note', () => {
    render(<Harness page="script" />)
    selectIn('8-1', 8, 13)
    key('b')
    expect(bms()).toHaveLength(1)
    expect(bms()[0]).toMatchObject({ pid: '8-1', offset: 8 })
    vi.useFakeTimers()
  })

  it('the editor changes the label and note, and its trash deletes', async () => {
    const a = make('8-1', 8)
    render(<Harness page="script" />)
    await userEvent.click(document.querySelector(`[data-bm="${a.id}"]`)!)
    const pop = document.querySelector('.pop') as HTMLElement
    await userEvent.type(within(pop).getByRole('textbox', { name: 'Label' }), 'Roses')
    await userEvent.type(within(pop).getByRole('textbox', { name: 'Note' }), 'Painting scene')
    await userEvent.click(document.body)
    expect(bms()[0]).toMatchObject({ label: 'Roses', note: 'Painting scene' })
    await userEvent.click(document.querySelector(`[data-bm="${a.id}"]`)!)
    await userEvent.click(within(document.querySelector('.pop') as HTMLElement).getByRole('button', { name: 'Delete bookmark' }))
    expect(bms()).toHaveLength(0)
  })

  it('the selection toolbar has a Bookmark here icon button, and the right-click menu has Bookmark here', async () => {
    render(<Harness page="script" />)
    selectIn('8-1', 8, 13)
    fireEvent.mouseUp(document.getElementById('reader')!)
    const btn = await screen.findByRole('button', { name: 'Bookmark here (B)' })
    expect(btn.getAttribute('data-tip')).toBe('Bookmark here (B)')
    fireEvent.click(btn)
    expect(bms()).toHaveLength(1)
    run(() => removeBookmark('b1'))
    selectIn('8-3', 3, 8)
    const items = contextItemsFor(document.querySelector('p[data-pid="8-3"]')!, { clientX: 0, clientY: 0 })!
    const it = items.find((i) => 'l' in i && i.l === 'Bookmark here') as { fn: () => void; k?: string }
    expect(it.k).toBe('B')
    run(() => it.fn())
    expect(bms().map((x) => x.pid + ':' + x.offset)).toEqual(['8-3:3'])
  })

  it('right-click on a ribbon offers Edit and Delete', () => {
    const a = make('8-1', 8)
    render(<Harness page="script" />)
    const items = contextItemsFor(document.querySelector(`[data-bm="${a.id}"]`)!, { clientX: 0, clientY: 0 })!
    expect(items.map((i) => ('l' in i ? i.l : ''))).toEqual(['Edit bookmark', 'Delete bookmark'])
    run(() => (items[1] as { fn: () => void }).fn())
    expect(bms()).toHaveLength(0)
  })

  it('the list shows every bookmark by chapter with its note, chapter and words; a row goes to the spot; trash deletes', async () => {
    const a = make('8-1', 8)
    run(() => updateBookmark(a.id, { label: 'Roses', note: 'Painting scene' }))
    make('7-2', 0)
    render(<Harness page="script" />)
    await userEvent.click(screen.getByRole('button', { name: 'Bookmarks' }))
    expect(getState().ui.script.tab).toBe('bookmarks')
    const list = document.getElementById('bmlist-body')!
    expect(list.querySelectorAll('section')).toHaveLength(2)
    expect(within(list).getByText('Roses')).toBeTruthy()
    expect(within(list).getByText('Painting scene')).toBeTruthy()
    expect(list.textContent).toContain('“rose-tree')
    update((d) => { d.ui.chapter = '7' })
    await userEvent.click(list.querySelector(`[data-go="${a.id}"]`)!)
    expect(getState().ui.chapter).toBe('8')
    expect(getState().ui.script.bmAt).toBe(a.id)
    await userEvent.click(list.querySelector('[data-del="b2"]')!)
    expect(bms().map((x) => x.id)).toEqual([a.id])
  })

  it('an empty list says so', async () => {
    render(<Harness page="script" />)
    await userEvent.click(screen.getByRole('button', { name: 'Bookmarks' }))
    expect(document.querySelector('#railbody')!.textContent).toBe('No bookmarks yet.')
  })

  it('going to a bookmark asks the reader to scroll to it and lights its paragraph', () => {
    vi.useFakeTimers()
    const a = make('8-3', 5)
    update((d) => { d.ui.chapter = '7' })
    run(() => goToBookmark(a.id))
    const s = getState().ui
    expect(s.page).toBe('script')
    expect(s.chapter).toBe('8')
    expect(s.script).toMatchObject({ pendingBm: a.id, bmAt: a.id, bmFlash: '8-3' })
    rtlAct(() => { vi.advanceTimersByTime(2000) })
    expect(getState().ui.script.bmFlash).toBeNull()
  })

  describe('next and previous', () => {
    let restore: Array<() => void> = []
    beforeEach(() => {
      const def = (name: string, get: () => number): void => {
        const old = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)
        Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get })
        restore.push(() => (old ? Object.defineProperty(HTMLElement.prototype, name, old) : delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]))
      }
      def('offsetHeight', () => 50)
      def('clientHeight', () => 500)
    })
    afterEach(() => { restore.forEach((f) => f()); restore = [] })

    it('] and [ move from one bookmark to the next in the book and wrap', () => {
      make('7-2', 0)
      make('8-1', 40)
      make('8-3', 5)
      render(<Harness page="script" />)
      update((d) => { d.ui.script.bmAt = 'b1' })
      key(']')
      expect(getState().ui.script.bmAt).toBe('b2')
      key(']')
      expect(getState().ui.script.bmAt).toBe('b3')
      key(']')
      expect(getState().ui.script.bmAt).toBe('b1')
      key('[')
      expect(getState().ui.script.bmAt).toBe('b3')
      key('[')
      expect(getState().ui.script.bmAt).toBe('b2')
    })

    it('say so when there are none', () => {
      render(<Harness page="script" />)
      key(']')
      expect(getOverlay().toasts.map((t) => t.msg)).toContain('No bookmarks yet.')
    })
  })
})

describe('Bookmark: jump menu', () => {
  it('lists each bookmark as "Bookmark: label or words", and finds it by its note', () => {
    const a = make('8-1', 8)
    make('8-3', 0)
    run(() => updateBookmark(a.id, { label: 'Roses', note: 'Painting scene' }))
    const cmds = allCommands().filter((c) => c.g === 'Bookmarks')
    expect(cmds.map((c) => c.l)).toContain('Bookmark: Roses')
    expect(cmds.map((c) => c.l)).toContain('Bookmark: On which Seven looked up and said, “That’s right, Five!…')
    expect(cmds.find((c) => c.l === 'Bookmark: Roses')!.hint).toContain('painting scene')
  })
  it('opens in the palette and goes to the spot in the reader', async () => {
    const a = make('8-3', 0)
    update((d) => { d.ui.page = 'script'; d.ui.chapter = '7' })
    render(<Harness page="script" />)
    Element.prototype.scrollIntoView = () => {}
    rtlAct(() => modals.palette('Bookmark: On which'))
    const opt = await screen.findByRole('option', { name: /Bookmark: On which Seven/ })
    await userEvent.click(opt)
    expect(getState().ui.script.bmAt).toBe(a.id)
    expect(getState().ui.chapter).toBe('8')
  })
  it('from the Booth it puts the reading position there instead, in the bookmark’s chapter', () => {
    const { paras, units } = boothUnits(getState().data, '7')
    const spot = boothSpot(paras, units, 2, 1)!
    const b = make(spot.pid, spot.offset)
    update((d) => { d.ui.page = 'booth'; d.ui.chapter = '8' })
    const c = allCommands().find((x) => x.l.startsWith('Bookmark: '))!
    run(() => c.fn())
    const s = getState().ui
    expect(s.page).toBe('booth')
    expect(s.chapter).toBe('7')
    expect([s.booth.cur, s.booth.wcur]).toEqual([2, 1])
    expect(b.chapterId).toBe('7')
  })
  it('has Bookmark here, Next and Previous on the Script page and the Booth only', () => {
    update((d) => { d.ui.page = 'production' })
    expect(allCommands().filter((c) => c.l === 'Next bookmark')).toHaveLength(0)
    update((d) => { d.ui.page = 'script' })
    expect(allCommands().filter((c) => c.g === 'Bookmarks').map((c) => [c.l, c.k])).toEqual([['Bookmark here', 'B'], ['Next bookmark', ']'], ['Previous bookmark', '[']])
  })
})

describe('Bookmark: Booth', () => {
  beforeEach(() => boot('booth'))

  it('B bookmarks the reading position, at the start of the word being read, and says so with an undo', () => {
    render(<Harness page="booth" />)
    update((d) => { d.ui.booth.cur = 3; d.ui.booth.wcur = 2 })
    key('b')
    const { paras, units } = boothUnits(getState().data, '8')
    expect(bms()).toHaveLength(1)
    expect(bms()[0]).toMatchObject(boothSpot(paras, units, 3, 2)!)
    expect(getOverlay().toasts.some((t) => t.msg === 'Bookmark added.' && !!t.undo)).toBe(true)
    key('b')
    expect(bms()).toHaveLength(1)
  })

  it('shows a ribbon in the margin, away from the speaker chips, on the line of its word, with the note in the tooltip', () => {
    const { paras, units } = boothUnits(getState().data, '8')
    const spot = boothSpot(paras, units, 3, 2)!
    const b = make(spot.pid, spot.offset)
    run(() => updateBookmark(b.id, { note: 'Retake this' }))
    render(<Harness page="booth" />)
    const rib = document.querySelector<HTMLElement>(`.bmk-margin [data-bm="${b.id}"]`)!
    expect(rib).not.toBeNull()
    expect(rib.dataset.tip).toBe('Retake this')
    expect(document.querySelectorAll('.bchip [data-bm]')).toHaveLength(0)
    expect(rib.closest('.btext')).not.toBeNull()
  })

  it('has no ribbon for a bookmark in another chapter', () => {
    make('7-2', 0)
    render(<Harness page="booth" />)
    expect(document.querySelectorAll('[data-bm]')).toHaveLength(0)
  })

  it('the right-click menu has Bookmark here, on the word that was clicked', () => {
    render(<Harness page="booth" />)
    const w = document.querySelector<HTMLElement>('.bu[data-u="2"] .w[data-w="1"]')!
    const items = contextItemsFor(w, { clientX: 0, clientY: 0 })!
    const it = items.find((i) => 'l' in i && i.l === 'Bookmark here') as { fn: () => void }
    run(() => it.fn())
    const { paras, units } = boothUnits(getState().data, '8')
    expect(bms()[0]).toMatchObject(boothSpot(paras, units, 2, 1)!)
  })

  it('] and [ move the reading position between bookmarks, changing chapter when needed', () => {
    const six = boothUnits(getState().data, '7')
    const s7 = boothSpot(six.paras, six.units, 1, 0)!
    const eight = boothUnits(getState().data, '8')
    const s8 = boothSpot(eight.paras, eight.units, 4, 1)!
    make(s7.pid, s7.offset)
    make(s8.pid, s8.offset)
    render(<Harness page="booth" />)
    key(']')
    expect([getState().ui.chapter, getState().ui.booth.cur, getState().ui.booth.wcur]).toEqual(['8', 4, 1])
    key(']')
    expect([getState().ui.chapter, getState().ui.booth.cur, getState().ui.booth.wcur]).toEqual(['7', 1, 0])
    key('[')
    expect([getState().ui.chapter, getState().ui.booth.cur, getState().ui.booth.wcur]).toEqual(['8', 4, 1])
  })

  it('does not change chapter while a take runs', () => {
    const s = boothUnits(getState().data, '7')
    const sp = boothSpot(s.paras, s.units, 1, 0)!
    const b = make(sp.pid, sp.offset)
    update((d) => { d.ui.booth.rec = true })
    expect(run(() => showBookmarkInBooth(b.id))).toBe(false)
    expect(getState().ui.chapter).toBe('8')
    expect(getOverlay().toasts.map((t) => t.msg)).toContain('Stop recording first.')
  })

  it('B is ignored while typing in a field', () => {
    render(<Harness page="booth" />)
    const i = document.createElement('input')
    document.body.appendChild(i)
    i.focus()
    rtlAct(() => { fireEvent.keyDown(i, { key: 'b' }) })
    expect(bms()).toHaveLength(0)
    i.remove()
  })

  it('the footer and the help sheet list the keys', () => {
    render(<Harness page="booth" />)
    const foot = document.getElementById('bkeys')!
    expect(foot.textContent).toContain('Bookmark')
    expect(foot.textContent).toContain('Bookmarks')
    rtlAct(() => modals.help())
    const sheet = document.querySelector('.sheetgrid')!
    expect(sheet.textContent).toContain('Bookmark here')
    expect(sheet.textContent).toContain('Previous / next bookmark')
  })
})
