import { useEffect, useRef, useState } from 'react'
import '@/styles/bookmarks.css'
import type { Bookmark } from '@/domain/schemas'
import { bookmarkById, bookmarkSnippet, bookmarkTip } from '@/selectors/bookmarks'
import { removeBookmark, updateBookmark } from '@/state/commands/bookmarks'
import { getState, useData } from '@/state/store'
import { Icon } from './Icon'
import { IconButton, Input, Textarea } from './primitives'
import { popAt } from './overlay'

/** The ribbon in a margin: a tooltip with its label and note, a click opens the editor. `top` is where it sits in the margin. */
export function BookmarkRibbon({ x, top, flash }: { x: Bookmark; top: number; flash?: boolean }) {
  const data = useData()
  const tip = bookmarkTip(data, x)
  return (
    <button
      type="button" className={'bmk' + (x.note ? ' has-note' : '') + (flash ? ' flash' : '')} data-bm={x.id} data-keeppop style={{ top }}
      data-tip={tip} aria-label={'Bookmark: ' + tip} aria-haspopup="dialog"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); openBookmarkEditor(x.id, e.currentTarget) }}
    ><Icon name="bookmark" /></button>
  )
}

/**
 * Label and note of a bookmark, and delete. Typing is kept as a draft and saved as one change when a field loses focus or the
 * popover closes, so one edit is one undo step.
 */
function Editor({ id, close }: { id: string; close: () => void }) {
  const data = useData()
  const x = bookmarkById(data, id)
  const [label, setLabel] = useState(x?.label ?? '')
  const [note, setNote] = useState(x?.note ?? '')
  const draft = useRef({ label, note })
  draft.current = { label, note }
  const save = (): void => updateBookmark(id, draft.current)
  useEffect(() => save, [])
  if (!x) return null
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <span className="snip" style={{ flex: 1, minWidth: 0 }}>“{bookmarkSnippet(data, x, 48)}”</span>
        <IconButton icon="trash" className="quiet danger" tip="Delete bookmark" data-bm-del={id} onClick={() => { close(); removeBookmark(id) }} />
      </div>
      <Input
        aria-label="Label" placeholder="Label" maxLength={60} value={label}
        onChange={(e) => setLabel(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); close() } }}
      />
      <Textarea aria-label="Note" placeholder="Note" maxLength={500} autoFocus value={note} onChange={(e) => setNote(e.target.value)} onBlur={save} />
    </div>
  )
}

/** Open the editor of a bookmark under an element, or under its ribbon when none is given. */
export function openBookmarkEditor(id: string, anchor?: HTMLElement | null): void {
  const open = (el: HTMLElement): void => {
    popAt(el, ({ close }) => <Editor id={id} close={close} />, 'bmpop')
  }
  if (anchor) { open(anchor); return }
  /* The ribbon is drawn after the change that made the bookmark. */
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>('[data-bm="' + id + '"]')
    if (el && getState().data.bookmarks.some((x) => x.id === id)) open(el)
  }, 60)
}
