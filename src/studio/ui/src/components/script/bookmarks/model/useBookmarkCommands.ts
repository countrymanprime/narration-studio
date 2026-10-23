import { useCallback, useMemo } from 'react';
import type { Bookmark } from '../../../../api/contracts/bookmarks';
import { EDITABLE } from '../../../../input/targets';
import { useCommand } from '../../../../input/useCommand';
import { useCommandProvider, type ProvidedCommand } from '../../../../input/commandProviders';
import { useSearchSource, type SearchHit, type SearchSource } from '../../../../registries/search';
import { bookmarkSnippet, bookmarkTitle, stepBookmarksWrapped, type LineText, type Spot } from './selectors';

const BOOKMARKS_GROUP = 'Bookmarks';

export type BookmarkCommandsOptions = {
  bookmarks: readonly Bookmark[];
  chapters: readonly { id: string; name: string }[];
  lineText: LineText;
  /** Opens a bookmark where the page shows it (the page owns scrolling and the Booth owns its reading position). */
  onGoTo: (bookmark: Bookmark) => void;
  /** Bookmark where the page is. Absent when the page has no such place: then no "Bookmark here" and no `B` key. */
  onHere?: () => void;
  /** Where stepping starts: the last one gone to while in view, else the selection or caret, else the top of the page. */
  stepFrom?: () => Spot | null;
  /** Said when a step finds no bookmark. */
  onNone?: () => void;
  /** Said when a step went round the book: past the last bookmark to the first (`1`), or back from the first to the last (`-1`). */
  onWrapped?: (dir: 1 | -1) => void;
};

/**
 * What a page that has bookmarks registers: the keys `B`, `]` and `[` (catalogue rows, so they never fire while a field has focus),
 * the jump menu's "Bookmark: …" entries and actions, and the search source. The actions and keys exist only while the page gave
 * the handlers for them.
 */
export function useBookmarkCommands(options: BookmarkCommandsOptions): void {
  const { bookmarks, chapters, lineText, onGoTo, onHere, stepFrom, onNone, onWrapped } = options;
  const canStep = stepFrom !== undefined;

  const step = useCallback(
    (dir: 1 | -1) => {
      const found = stepBookmarksWrapped(bookmarks, chapters, dir, stepFrom?.() ?? null);
      if (!found) return onNone?.();
      onGoTo(found.bookmark);
      if (found.wrapped) onWrapped?.(dir);
    },
    [bookmarks, chapters, stepFrom, onGoTo, onNone, onWrapped],
  );

  // The router keeps a plain key out of a field; Alt+[ and Alt+] carry a modifier, so the check is repeated here.
  const typing = (target: EventTarget | null): boolean => target instanceof Element && target.closest(EDITABLE) !== null;
  useCommand('bookmark.here', (e) => !typing(e.target) && onHere?.(), onHere !== undefined);
  useCommand('bookmark.next', (e) => !typing(e.target) && step(1), canStep);
  useCommand('bookmark.prev', (e) => !typing(e.target) && step(-1), canStep);

  const chapterName = useCallback((id: string) => chapters.find((c) => c.id === id)?.name ?? '', [chapters]);

  const provider = useMemo(
    () => (): ProvidedCommand[] => {
      const out: ProvidedCommand[] = bookmarks.map((b) => ({
        id: `bookmark.go.${b.id}`,
        group: BOOKMARKS_GROUP,
        label: `Bookmark: ${bookmarkTitle(b, lineText)}`,
        hint: `${b.note} ${chapterName(b.chapterId)}`.trim().toLowerCase(),
        run: () => onGoTo(b),
      }));
      if (onHere) out.push({ id: 'bookmark.menu.here', group: BOOKMARKS_GROUP, label: 'Bookmark here', hint: 'add', run: onHere });
      if (canStep) {
        out.push(
          { id: 'bookmark.menu.next', group: BOOKMARKS_GROUP, label: 'Next bookmark', run: () => step(1) },
          { id: 'bookmark.menu.prev', group: BOOKMARKS_GROUP, label: 'Previous bookmark', run: () => step(-1) },
        );
      }
      return out;
    },
    [bookmarks, lineText, chapterName, onGoTo, onHere, canStep, step],
  );
  useCommandProvider(provider);

  const source = useMemo<SearchSource>(
    () => (term) => {
      const needle = term.toLowerCase();
      return bookmarks.flatMap((b): SearchHit[] => {
        const title = bookmarkTitle(b, lineText);
        const words = bookmarkSnippet(b, lineText);
        const sub = [b.note.trim(), chapterName(b.chapterId)].filter(Boolean).join(' · ');
        const haystack = `${title} ${b.note} ${words} ${chapterName(b.chapterId)}`.toLowerCase();
        return haystack.includes(needle) ? [{ group: BOOKMARKS_GROUP, title, sub: sub || undefined, run: () => onGoTo(b) }] : [];
      });
    },
    [bookmarks, lineText, chapterName, onGoTo],
  );
  useSearchSource(source);
}
