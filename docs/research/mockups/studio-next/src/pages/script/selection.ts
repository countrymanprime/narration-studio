import type { Spot } from '@/selectors/bookmarks'
import { paragraphById } from '@/selectors/chapters'
import type { SelectionInfo } from '@/state/slices/ui'
import { getState } from '@/state/store'

export type Sel = ({ multi: true; rect: DOMRect } | (SelectionInfo & { multi?: false; rect: DOMRect })) | null

const elOf = (n: Node): Element | null => (n.nodeType === 3 ? n.parentElement : (n as Element))

/** The text selected in the reader, as a place in one paragraph. A selection across paragraphs is reported as `multi`. */
export function getSel(): Sel {
  const s = window.getSelection()
  if (!s || s.isCollapsed || !s.rangeCount) return null
  const r = s.getRangeAt(0)
  const p1 = elOf(r.startContainer)?.closest('p[data-pid]')
  const p2 = elOf(r.endContainer)?.closest('p[data-pid]')
  if (!p1 || !p2) return null
  if (p1 !== p2) return { multi: true, rect: r.getBoundingClientRect() }
  const pre = document.createRange()
  pre.selectNodeContents(p1)
  pre.setEnd(r.startContainer, r.startOffset)
  let s0 = pre.toString().length
  const txt = r.toString()
  let e0 = s0 + txt.length
  s0 += txt.length - txt.trimStart().length
  e0 -= txt.length - txt.trimEnd().length
  if (e0 <= s0) return null
  const pid = (p1 as HTMLElement).dataset.pid as string
  const text = paragraphById(getState().data, pid)?.text ?? ''
  return { pid, s: s0, e: e0, q: text.slice(s0, e0), rect: r.getBoundingClientRect() }
}

type CaretDoc = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
}

/** A right-click on plain text selects the word under the pointer, so the same menu works without selecting first. */
export function wordUnder(e: { clientX: number; clientY: number }): Sel {
  const d = document as CaretDoc
  let tn: Node | null = null
  let off = 0
  const r = d.caretRangeFromPoint?.(e.clientX, e.clientY)
  if (r) { tn = r.startContainer; off = r.startOffset }
  else {
    const c = d.caretPositionFromPoint?.(e.clientX, e.clientY)
    if (c) { tn = c.offsetNode; off = c.offset }
  }
  if (!tn || tn.nodeType !== 3) return null
  const t = tn.textContent ?? ''
  let a = off
  let b = off
  const isW = (c: string): boolean => /[\p{L}\p{N}’'-]/u.test(c)
  while (a > 0 && isW(t[a - 1])) a--
  while (b < t.length && isW(t[b])) b++
  if (a === b) return null
  const rg = document.createRange()
  rg.setStart(tn, a)
  rg.setEnd(tn, b)
  const s = window.getSelection()
  s?.removeAllRanges()
  s?.addRange(rg)
  return getSel()
}

/** The character offset in a paragraph where a point of the page's selection is. */
function offsetIn(p: Element, node: Node, off: number): number {
  const pre = document.createRange()
  pre.selectNodeContents(p)
  pre.setEnd(node, off)
  return pre.toString().length
}

/** The place the narrator is at in the reader: the start of the selected text, or the caret. Null when neither is in the text. */
export function selectionSpot(): Spot | null {
  const s = window.getSelection()
  if (!s || !s.rangeCount) return null
  const r = s.getRangeAt(0)
  const p = elOf(r.startContainer)?.closest('p[data-pid]')
  if (!p || !document.getElementById('reader')?.contains(p)) return null
  const pid = (p as HTMLElement).dataset.pid as string
  const text = paragraphById(getState().data, pid)?.text ?? ''
  let off = offsetIn(p, r.startContainer, r.startOffset)
  if (!s.isCollapsed) while (off < text.length && /\s/.test(text[off])) off++
  return { pid, offset: Math.min(off, text.length) }
}

/** The paragraph at the top of the reader's visible part (below its sticky heading), at its start. */
export function topSpot(): Spot | null {
  const sc = document.getElementById('rdscroll')
  if (!sc) return null
  const ps = [...sc.querySelectorAll<HTMLElement>('.para[data-pid]')]
  const edge = sc.scrollTop + 100
  const hit = ps.find((p) => p.offsetTop + p.offsetHeight > edge) ?? ps[ps.length - 1]
  return hit ? { pid: hit.dataset.pid as string, offset: 0 } : null
}

/** The vertical position, in the paragraph's own pixels, of the line a character offset is on. */
export function lineTop(p: HTMLElement, offset: number, zoom = 1): number {
  const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
  let left = offset
  let n: Node | null
  let last: Text | null = null
  while ((n = w.nextNode())) {
    const t = n as Text
    last = t
    if (left <= t.length) {
      const rg = document.createRange()
      rg.setStart(t, Math.min(left, Math.max(0, t.length - 1)))
      rg.setEnd(t, Math.min(t.length, Math.min(left, Math.max(0, t.length - 1)) + 1))
      const rc = rg.getClientRects?.()[0]
      return rc ? (rc.top - p.getBoundingClientRect().top) / zoom : 0
    }
    left -= t.length
  }
  if (last) return (p.getBoundingClientRect().height - 8) / zoom
  return 0
}
