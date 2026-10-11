import type { Bookmark } from '../../../../api/contracts/bookmarks';
import { IconButton } from '../../../primitives/IconButton';
import { bookmarkSnippet, bookmarkTitle, bookmarksByChapter, type LineText } from '../model/selectors';
import { BookmarkEditor } from './BookmarkEditor';

export type BookmarksTabProps = {
  bookmarks: readonly Bookmark[];
  chapters: readonly { id: string; name: string }[];
  lineText: LineText;
  /** The bookmark last gone to; its row is marked current. */
  currentId?: string | null;
  onGoTo: (bookmark: Bookmark) => void;
  onUpdate: (id: string, label: string, note: string) => unknown;
  onRemove: (id: string) => unknown;
};

/** Every bookmark of the book by chapter. A row goes to the spot; the note and the words it sits on tell what it was for. */
export function BookmarksTab({ bookmarks, chapters, lineText, currentId = null, onGoTo, onUpdate, onRemove }: BookmarksTabProps) {
  const groups = bookmarksByChapter(bookmarks, chapters);
  if (groups.length === 0) return <p className="m-0 p-3 text-[0.88rem] text-[var(--text-muted)]">No bookmarks yet.</p>;
  return (
    <div className="flex flex-col gap-0.5">
      {groups.map(({ chapter, items }) => (
        <section key={chapter.id} aria-label={chapter.name}>
          <h3 className="m-0 px-1 pt-2.5 pb-1 text-[0.72rem] font-semibold tracking-wide text-[var(--text-muted)] uppercase">{chapter.name}</h3>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {items.map((bookmark) => {
              const words = bookmarkSnippet(bookmark, lineText);
              const labelled = bookmark.label.trim() !== '';
              return (
                <li
                  key={bookmark.id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1 rounded-lg border py-1 pr-1 pl-0 ${bookmark.id === currentId ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--surface)]'}`}
                >
                  {/* native-control-ok: a row that is a button holding up to three lines of text, which Button's padded chrome does not fit */}
                  <button
                    type="button"
                    aria-current={bookmark.id === currentId ? 'true' : undefined}
                    onClick={() => onGoTo(bookmark)}
                    className="flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-[var(--text)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]"
                  >
                    <span className="truncate text-[0.88rem] font-semibold">{bookmarkTitle(bookmark, lineText)}</span>
                    {bookmark.note && <span className="text-[0.8rem] [overflow-wrap:anywhere]">{bookmark.note}</span>}
                    {labelled && words && <span className="truncate font-serif text-[0.8rem] text-[var(--text-muted)] italic">{`“${words}”`}</span>}
                  </button>
                  <span className="flex gap-0.5">
                    <BookmarkEditor
                      bookmark={bookmark}
                      snippet={words}
                      onUpdate={onUpdate}
                      onRemove={onRemove}
                      trigger={<IconButton action="editBookmark" label="Edit bookmark" size="sm" />}
                    />
                    <IconButton action="deleteBookmark" label="Delete bookmark" variant="danger" size="sm" onClick={() => void onRemove(bookmark.id)} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
