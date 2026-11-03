import { useMemo } from 'react'
import { bookmarkSnippet, bookmarksByChapter } from '@/selectors/bookmarks'
import { chName } from '@/selectors/chapters'
import { removeBookmark, showBookmarkInScript } from '@/state/commands/bookmarks'
import { useData, useUi } from '@/state/store'
import { openBookmarkEditor } from '@/ui/BookmarkEditor'
import { IconButton } from '@/ui/primitives'

/** Every bookmark of the book, by chapter. A row goes to the spot; the note and the words it sits on tell what it was for. */
export function BookmarksTab() {
  const data = useData()
  const at = useUi().script.bmAt
  const groups = useMemo(() => bookmarksByChapter(data), [data])
  if (!groups.length) return <div className="empty"><span>No bookmarks yet.</span></div>
  return (
    <div className="bmlist" id="bmlist-body">
      {groups.map(({ chapter, items }) => (
        <section key={chapter.id} aria-label={chName(data, chapter)}>
          <div className="label bmgroup">{chName(data, chapter)}</div>
          <div className="stack" style={{ gap: 6 }}>
            {items.map((x) => {
              const snip = bookmarkSnippet(data, x)
              return (
                <div key={x.id} className={'bmrow' + (at === x.id ? ' cur' : '')} data-row={x.id}>
                  <button type="button" className="bmgo" data-go={x.id} onClick={() => showBookmarkInScript(x.id)}>
                    <span className="bmt">{x.label.trim() || snip}</span>
                    {x.note ? <span className="bmn">{x.note}</span> : null}
                    {x.label.trim() ? <span className="bms">“{snip}”</span> : null}
                  </button>
                  <span className="bmtools">
                    <IconButton icon="pencil" tip="Edit bookmark" data-keeppop data-edit={x.id} onClick={(e) => openBookmarkEditor(x.id, e.currentTarget)} />
                    <IconButton icon="trash" className="quiet danger" tip="Delete bookmark" tipSide="l" data-del={x.id} onClick={() => removeBookmark(x.id)} />
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
