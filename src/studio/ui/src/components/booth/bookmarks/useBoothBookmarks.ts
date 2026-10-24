import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bookmark } from '../../../api/contracts/bookmarks';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { usePort } from '../../../ports/usePort';
import { useJournal, useStoreHandle } from '../../../studio/StudioProvider';
import { addBookmark, setStop, type BookmarkSpot } from '../../../studio/commands/bookmarks';
import type { ContextMenuItem } from '../../primitives/ContextMenu';
import { useBookmarkCommands } from '../../script/bookmarks/model/useBookmarkCommands';
import { useBookmarks } from '../../script/bookmarks/model/useBookmarks';
import type { LineText, Spot } from '../../script/bookmarks/model/selectors';
import type { BoothUnit, ReadingParagraph } from '../reading/boothUnits';
import type { ReadingPosition } from '../reading/readingPosition';
import { positionOfBookmark, spotAtPosition, spotOfWord } from './boothSpot';

/** How long the ribbon of a bookmark just gone to pulses, as the Script's. */
const FLASH_MS = 1600;
/** The sentence the Booth already uses when a chapter change is asked for during a take. */
const STOP_FIRST = 'Stop recording first.';

export type BoothBookmarksOptions = {
  chapterId: string;
  /** The chapters in book order, for stepping across chapters and naming a bookmark's chapter. */
  chapters: readonly { id: string; name: string }[];
  paragraphs: readonly ReadingParagraph[];
  units: readonly BoothUnit[];
  /** Where the narrator is reading; left out before there is one. */
  position: ReadingPosition | undefined;
  /** A take is running: the chapter cannot change. */
  recording: boolean;
  /** A paragraph's manuscript index (`ManuscriptParagraph.index`), which orders a spot against the host's bookmarks; null when unknown. */
  paragraphIndex: (paragraphId: string) => number | null;
  /** Puts the reading position on a word of this chapter. */
  seek: (paragraphId: string, word: number) => void;
  /** Opens another chapter at a bookmark's place (the page changes its address; the Booth starts there). */
  goToChapter: (chapterId: string, at: { paragraphId: string; offset: number }) => void;
};

export type BoothBookmarks = {
  /** The host's list in reading order; undefined until the first read lands. */
  bookmarks: Bookmark[] | undefined;
  /** The bookmark just gone to, for its ribbon to pulse. */
  flashId: string | null;
  add: (spot: BookmarkSpot) => Promise<Bookmark | null>;
  /** Makes a spot the chapter's stopping place ("Read to here"), replacing the old one, with an Undo. It only marks the place. */
  readToHere: (spot: BookmarkSpot) => Promise<Bookmark | null>;
  update: (id: string, label: string, note: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  /**
   * Items for the page's right-click menu: Bookmark here and Read to here on a word, Read to here on a page marker (at the page's first
   * word), Edit and Delete on a ribbon, nothing elsewhere.
   */
  menuItems: (target: Element) => ContextMenuItem[];
};

/**
 * What the Booth does with bookmarks: `B` bookmarks the word being read (with an Undo), `]` and `[` move the reading position between
 * bookmarks (changing chapter when needed, never during a take), and the right-click items. It registers the catalogue's bookmark
 * commands, so the keys, the jump menu and the help sheet come from there. The page passes what it knows and mounts the ribbons.
 */
export function useBoothBookmarks(options: BoothBookmarksOptions): BoothBookmarks {
  const { chapterId, chapters, paragraphs, units, position, recording, paragraphIndex, seek, goToChapter } = options;
  const overlay = useOverlay();
  const journal = useJournal();
  const store = useStoreHandle();
  const port = usePort('bookmarks');
  const model = useBookmarks();
  const { bookmarks, update, remove } = model;
  const env = useMemo(() => ({ journal, port, store }), [journal, port, store]);

  // Marks a spot: with an Undo when it is new, and a sentence when the word already has one.
  const mark = useCallback(
    async (spot: BookmarkSpot): Promise<Bookmark | null> => {
      const added = await addBookmark(env, spot);
      if (!added.ok) {
        overlay.toast(added.refusal.reason, { tone: 'error' });
        return null;
      }
      const { bookmark, created, entryId } = added.value;
      if (created && entryId !== null) overlay.toastUndo('Bookmark added.', () => journal.undo(entryId), { entry: entryId });
      else overlay.toast('That word is already bookmarked.');
      return bookmark;
    },
    [env, journal, overlay],
  );

  // Marks the chapter's stopping place: never a seek, a pause or a stop of the take.
  const readToHere = useCallback(
    async (spot: BookmarkSpot): Promise<Bookmark | null> => {
      const set = await setStop(env, spot);
      if (!set.ok) {
        overlay.toast(set.refusal.reason, { tone: 'error' });
        return null;
      }
      const { stop, replaced, entryId } = set.value;
      if (entryId !== null) overlay.toastUndo(replaced ? 'Stopping place moved.' : 'Stopping place marked.', () => journal.undo(entryId), { entry: entryId });
      else overlay.toast('Your stopping place is already there.');
      return stop;
    },
    [env, journal, overlay],
  );

  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const lineText = useMemo<LineText>(() => (bookmark) => paragraphs.find((p) => p.id === bookmark.paragraphId)?.text, [paragraphs]);

  const onGoTo = useCallback(
    (bookmark: Bookmark) => {
      if (bookmark.chapterId !== chapterId) {
        if (recording) return overlay.toast(STOP_FIRST);
        return goToChapter(bookmark.chapterId, { paragraphId: bookmark.paragraphId, offset: bookmark.offset });
      }
      const at = positionOfBookmark(paragraphs, bookmark);
      if (!at) return;
      seek(at.paragraphId, at.word);
      setFlashId(bookmark.id);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashId(null), FLASH_MS);
    },
    [chapterId, recording, overlay, goToChapter, paragraphs, seek],
  );

  const here = useMemo(() => spotAtPosition(chapterId, paragraphs, position), [chapterId, paragraphs, position]);
  const onHere = useCallback(() => {
    if (here) void mark(here);
  }, [here, mark]);

  const stepFrom = useCallback((): Spot | null => {
    if (!here) return null;
    return { chapterId, paragraph: paragraphIndex(here.paragraphId), offset: here.offset };
  }, [here, chapterId, paragraphIndex]);

  useBookmarkCommands({
    bookmarks: bookmarks ?? [],
    chapters,
    lineText,
    onGoTo,
    onHere,
    stepFrom,
    onNone: () => overlay.toast('No bookmarks yet.'),
    onWrapped: (dir) => overlay.toast(dir > 0 ? 'That was the last bookmark: back to the first.' : 'That was the first bookmark: on to the last.'),
  });

  const menuItems = useCallback(
    (target: Element): ContextMenuItem[] => {
      const ribbon = target.closest<HTMLElement>('[data-bm]');
      if (ribbon?.dataset.bm !== undefined) {
        const id = ribbon.dataset.bm;
        const stop = ribbon.dataset.bmKind === 'stop';
        return [
          { key: 'bookmark-edit', label: stop ? 'Edit stopping place' : 'Edit bookmark', onSelect: () => ribbon.click() },
          { key: 'bookmark-delete', label: stop ? 'Remove stopping place' : 'Delete bookmark', onSelect: () => void remove(id) },
        ];
      }
      const page = target.closest<HTMLElement>('[data-page-break]');
      if (page?.dataset.paragraphId !== undefined) {
        const spot = { chapterId, paragraphId: page.dataset.paragraphId, offset: Number(page.dataset.offset) };
        return [{ key: 'read-to-here', label: 'Read to here', onSelect: () => void readToHere(spot) }];
      }
      const spot = spotOfWord(chapterId, paragraphs, units, target);
      return spot
        ? [
            { key: 'bookmark-here', label: 'Bookmark here', onSelect: () => void mark(spot) },
            { key: 'read-to-here', label: 'Read to here', onSelect: () => void readToHere(spot) },
          ]
        : [];
    },
    [chapterId, paragraphs, units, mark, readToHere, remove],
  );

  return { bookmarks, flashId, add: mark, readToHere, update, remove, menuItems };
}
