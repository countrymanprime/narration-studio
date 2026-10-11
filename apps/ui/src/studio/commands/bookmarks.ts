// The journalled bookmark commands (ADR 0771, ADR 0820): add, edit and remove, each with the host command that takes it back.
// They take the port and the store as arguments, so a page calls them with `usePort('bookmarks')`, `useJournal()` and
// `useStoreHandle()` and writes no journalling of its own. They send ids, offsets and plain text only. A host refusal comes back
// as the host's own sentence and journals nothing. After each command and each undo the `bookmarks` slot is loaded once.

import type { Bookmark, BookmarksApi } from '../../api/contracts/bookmarks';
import type { Command, Journal, Result } from '../journal/createJournal';
import type { StudioRegistry } from '../slots';
import type { StudioStore } from '../store/createStudioStore';

export type BookmarkEnv = {
  journal: Pick<Journal, 'act'>;
  port: BookmarksApi;
  store: Pick<StudioStore<StudioRegistry>, 'getState' | 'load'>;
};

/** A spot in the manuscript: a line and a UTF-16 offset in its text. */
export type BookmarkSpot = { chapterId: string; paragraphId: string; offset: number };

export type AddedBookmark = { bookmark: Bookmark; created: boolean };

const refuse = (code: string, reason: string): Result<never> => ({ ok: false, refusal: { code, reason } });

/** The host's sentence as the refusal; the mock and the Wails client both throw an `Error` carrying it. */
const refused = (error: unknown): Result<never> => refuse('host-refused', error instanceof Error ? error.message : 'The host refused that change.');

const sameSpot = (a: BookmarkSpot, b: BookmarkSpot): boolean => a.chapterId === b.chapterId && a.paragraphId === b.paragraphId && a.offset === b.offset;

/** Loads the slot once; a failed load is recorded by the store, and the change that was made stands. */
const reload = (env: BookmarkEnv): Promise<void> => env.store.load('bookmarks').catch(() => undefined);

/** Runs a host call and answers its result, or the host's sentence when it refuses. */
async function attempt<T>(call: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    return refused(error);
  }
}

/** The bookmark as the slot holds it; the slot is read first when nothing has loaded it yet. */
async function bookmarkFromSlot(env: BookmarkEnv, id: string): Promise<Bookmark | null> {
  if (!env.store.getState().slots.bookmarks) await reload(env);
  return env.store.getState().slots.bookmarks?.find((bookmark) => bookmark.id === id) ?? null;
}

const gone = (): Result<never> => refuse('bookmark-gone', 'That bookmark is no longer there.');

/** Runs the command through the journal and reloads the slot after the change; the inverse reloads it after the undo. */
async function journalled<R>(env: BookmarkEnv, command: Command<R>): Promise<Result<{ id: number; value: R }>> {
  const result = await env.journal.act(command);
  await reload(env);
  return result;
}

/**
 * Marks a spot. A spot that already has a bookmark returns it with `created: false` and journals nothing, so Undo can never
 * delete a bookmark the narrator made earlier (the host returns the existing one for the same spot).
 */
export async function addBookmark(env: BookmarkEnv, spot: BookmarkSpot): Promise<Result<AddedBookmark & { entryId: number | null }>> {
  const listed = await attempt(() => env.port.bookmarksList());
  if (!listed.ok) return listed;
  const existing = listed.value.find((bookmark) => sameSpot(bookmark, spot));
  if (existing) return { ok: true, value: { bookmark: existing, created: false, entryId: null } };
  // The id is known once the add returns; until then the command claims the whole domain.
  const touches = ['bookmarks'];
  const result = await journalled<Bookmark>(env, {
    label: 'Added a bookmark',
    touches,
    async run() {
      const added = await attempt(() => env.port.bookmarksAdd(spot.chapterId, spot.paragraphId, spot.offset));
      if (added.ok) touches[0] = `bookmarks/${added.value.id}`;
      return added;
    },
    async undo(bookmark: Bookmark) {
      const removed = await attempt(() => env.port.bookmarksRemove(bookmark.id));
      await reload(env);
      return removed;
    },
  });
  return result.ok ? { ok: true, value: { bookmark: result.value.value, created: true, entryId: result.value.id } } : result;
}

/** Replaces a bookmark's label and note. The inverse puts back the text the slot held. */
export async function editBookmark(env: BookmarkEnv, id: string, label: string, note: string): Promise<Result<{ bookmark: Bookmark; entryId: number }>> {
  const before = await bookmarkFromSlot(env, id);
  if (!before) return gone();
  const result = await journalled<Bookmark>(env, {
    label: 'Edited a bookmark',
    touches: [`bookmarks/${id}`],
    run: () => attempt(() => env.port.bookmarksUpdate(id, label, note)),
    async undo() {
      const restored = await attempt(() => env.port.bookmarksUpdate(id, before.label, before.note));
      await reload(env);
      return restored;
    },
  });
  return result.ok ? { ok: true, value: { bookmark: result.value.value, entryId: result.value.id } } : result;
}

/**
 * Deletes a bookmark. The inverse adds it again at the same spot and restores its text; the host gives the recreated bookmark
 * a new id and the entry is spent once it is undone (ADR 0771 rule 6), so a second Undo of it is refused by the journal. A spot that has a bookmark again is refused, so
 * Undo never overwrites the text of one the narrator made since.
 */
export async function removeBookmark(env: BookmarkEnv, id: string): Promise<Result<{ entryId: number }>> {
  const old = await bookmarkFromSlot(env, id);
  if (!old) return gone();
  const result = await journalled<null>(env, {
    label: 'Removed a bookmark',
    touches: [`bookmarks/${id}`],
    async run() {
      const removed = await attempt(() => env.port.bookmarksRemove(id));
      return removed.ok ? { ok: true, value: null } : removed;
    },
    async undo() {
      const recreated = await recreate(env, old);
      await reload(env);
      return recreated;
    },
  });
  return result.ok ? { ok: true, value: { entryId: result.value.id } } : result;
}

async function recreate(env: BookmarkEnv, old: Bookmark): Promise<Result<Bookmark>> {
  const listed = await attempt(() => env.port.bookmarksList());
  if (!listed.ok) return listed;
  if (listed.value.some((bookmark) => sameSpot(bookmark, old))) return refuse('spot-taken', 'That spot has a bookmark again, so the removed one was left off.');
  const added = await attempt(() => env.port.bookmarksAdd(old.chapterId, old.paragraphId, old.offset));
  if (!added.ok) return added;
  return attempt(() => env.port.bookmarksUpdate(added.value.id, old.label, old.note));
}
