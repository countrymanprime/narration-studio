import { useCallback, useEffect, useMemo } from 'react';
import type { Bookmark } from '../../../../api/contracts/bookmarks';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import { useJournal, useStoreHandle, useStudio } from '../../../../studio/StudioProvider';
import { useStoreGeneration } from '../../../../studio/useStoreGeneration';
import { addBookmark, editBookmark, removeBookmark, type BookmarkSpot } from '../../../../studio/commands/bookmarks';
import type { Result } from '../../../../studio/journal/createJournal';

export type BookmarksModel = {
  /** The host's list in reading order; undefined until the first read lands. */
  bookmarks: Bookmark[] | undefined;
  /** Bookmarks a spot and says so in a toast. A spot that has one answers it, says it is already there and journals nothing. Null when the host refused (its sentence is a toast). */
  add: (spot: BookmarkSpot, options?: { undo?: boolean }) => Promise<Bookmark | null>;
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

  const error = useStudio((s) => s.errors.bookmarks);
  // A page that mounts on a list the store holds, or on one whose read failed, reads it from the host again, as every mount did before: nothing tells the slot
  // when a re-import or a re-split made what it holds stale. A mount on an empty slot is the `ensure` below, so a read in flight is joined, not repeated.
  useEffect(() => {
    if (store.getState().slots.bookmarks !== undefined || store.getState().errors.bookmarks !== undefined) void store.load('bookmarks').catch(() => undefined);
  }, [store]);
  // A project switch or an attach empties the slot (and a read made while the host's answer was not heard is emptied with it): the generation asks again, as
  // `useChapters` does, joining a read in flight, because this hook would otherwise load only on mount and leave the list empty until the next focus (#4085).
  const generation = useStoreGeneration(store);
  useEffect(() => {
    if (error !== undefined) return; // a failed read is not looped on
    void store.ensure('bookmarks').catch(() => undefined);
  }, [store, bookmarks, error, generation]);

  const add = useCallback(
    async (spot: BookmarkSpot, { undo = true }: { undo?: boolean } = {}) => {
      const added = said(await addBookmark(env, spot));
      if (!added) return null;
      // A press says what it did: a new bookmark (with Undo), or that the spot already had one, which a second press never toggles off.
      // A caller that opens the bookmark's editor straight away asks for no Undo: the next journal entry would be the typing in it.
      if (added.created && added.entryId !== null && undo) {
        const { entryId } = added;
        overlay.toastUndo('Bookmark added.', () => journal.undo(entryId), { entry: entryId });
      } else if (added.created) overlay.toast('Bookmark added.');
      else overlay.toast('That spot is already bookmarked.');
      return added.bookmark;
    },
    [env, journal],
  );
  const update = useCallback(async (id: string, label: string, note: string) => said(await editBookmark(env, id, label, note)) !== null, [env]);
  const remove = useCallback(async (id: string) => said(await removeBookmark(env, id)) !== null, [env]);

  return { bookmarks, add, update, remove };
}
