import type { Bookmark } from '../../../../api/contracts/bookmarks';
import { Icon } from '../../../primitives/Icon';
import { TooltipTarget } from '../../../primitives/Tooltip';
import { bookmarkSnippet, bookmarkTip, type LineText } from '../model/selectors';
import { BookmarkEditor } from './BookmarkEditor';

export type BookmarkRibbonProps = {
  bookmark: Bookmark;
  lineText: LineText;
  /** Where it sits in its margin, in pixels from the margin's top (see `ribbonTops`). */
  top: number;
  /** Pulses once: the bookmark was just gone to. */
  flash?: boolean;
  onUpdate: (id: string, label: string, note: string) => unknown;
  onRemove: (id: string) => unknown;
};

/**
 * A bookmark's ribbon in a margin: a button with the bookmark icon, a tooltip of its label and note, a dot when it has a note. A click
 * opens its editor. A stale bookmark has no line to sit beside, so it draws nothing. The caller positions the margin; this knows no reader.
 */
export function BookmarkRibbon({ bookmark, lineText, top, flash = false, onUpdate, onRemove }: BookmarkRibbonProps) {
  if (bookmark.stale) return null;
  const tip = bookmarkTip(bookmark, lineText);
  const hasNote = bookmark.note.trim() !== '';
  return (
    <TooltipTarget text={tip} className="absolute left-0" style={{ top }}>
      <BookmarkEditor
        bookmark={bookmark}
        snippet={bookmarkSnippet(bookmark, lineText, 48)}
        onUpdate={onUpdate}
        onRemove={onRemove}
        trigger={
          // native-control-ok: a ribbon is a bare icon with a note dot in a margin; Button and IconButton draw a bordered box
          <button
            type="button"
            data-bm={bookmark.id}
            aria-label={`Bookmark: ${tip}`}
            aria-haspopup="dialog"
            className="relative flex h-[26px] w-4 cursor-pointer items-start justify-center rounded-sm border-0 bg-transparent p-0 text-[var(--accent)] hover:text-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
          >
            <span className={flash ? 'motion-safe:animate-pulse' : undefined}>
              <Icon name="bookmark" />
            </span>
            {hasNote && <span data-note-dot="" aria-hidden="true" className="absolute right-0 bottom-1 size-1.5 rounded-full bg-[var(--accent)]" />}
          </button>
        }
      />
    </TooltipTarget>
  );
}
