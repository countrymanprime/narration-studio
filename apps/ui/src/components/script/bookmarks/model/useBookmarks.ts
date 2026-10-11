import { useCallback, useEffect, useMemo } from 'react';
import type { Bookmark } from '../../../../api/contracts/bookmarks';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import { useJournal, useStoreHandle, useStudio } from '../../../../studio/StudioProvider';
import { addBookmark, editBookmark, removeBookmark, type BookmarkSpot } from '../../../../studio/commands/bookmarks';
import type { Result } from '../../../../studio/journal/createJournal';

export type BookmarksModel = {
  /** The host's list in reading order; undefined until the first read lands. */
  bookmarks: Bookmark[] | undefined;
  /** Bookmarks a spot. A spot that has one answers it and journals nothing. Null when the host refused (its sentence is a toast). */
  add: (spot: BookmarkSpot) => Promise<Bookmark | null>;
  /** Saves label and note as one journal entry. */
  update: (id: string, label: string, note: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
};

/** A refusal is the host's own sentence in a toast; nothing was journalled. */
function said<T>(result: Result<T>): T | null {
  if (result.ok) return result.value;
  overlay.toast(result.refusal.reason, { tone: 'error' });
  return null;
}

/**
 * The narrator's bookmarks: read through the studio store's `bookmarks` slot, changed through the journalled commands of
 * `studio/commands/bookmarks` (SN-S72), which reload the slot after each change and each undo.
 */
export function useBookmarks(): BookmarksModel {
  const port = usePort('bookmarks');
  const journal = useJournal();
  const store = useStoreHandle();
  const bookmarks = useStudio((s) => s.slots.bookmarks);
  const env = useMemo(() => ({ journal, port, store }), [journal, port, store]);

  useEffect(() => {
    void store.load('bookmarks');
  }, [store]);

  const add = useCallback(async (spot: BookmarkSpot) => said(await addBookmark(env, spot))?.bookmark ?? null, [env]);
  const update = useCallback(async (id: string, label: string, note: string) => said(await editBookmark(env, id, label, note)) !== null, [env]);
  const remove = useCallback(async (id: string) => said(await removeBookmark(env, id)) !== null, [env]);

  return { bookmarks, add, update, remove };
}
