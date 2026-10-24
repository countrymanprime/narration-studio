// The journalled bookmark commands: add, set the stopping place, edit and remove, each with the host command that takes it back.
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

/** The chapter's stopping place in a list, if it has one. */
const stopOf = (list: readonly Bookmark[], chapterId: string): Bookmark | undefined =>
  list.find((bookmark) => bookmark.kind === 'stop' && bookmark.chapterId === chapterId);

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
  const existing = listed.value.find((bookmark) => bookmark.kind === 'spot' && sameSpot(bookmark, spot));
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

export type SetStop = { stop: Bookmark; replaced: Bookmark | null; entryId: number | null };

/** Runs BookmarksSetStop and answers the chapter's stop in the list it returns. */
async function placeStop(env: BookmarkEnv, spot: BookmarkSpot): Promise<Result<Bookmark>> {
  const placed = await attempt(() => env.port.bookmarksSetStop(spot.chapterId, spot.paragraphId, spot.offset));
  if (!placed.ok) return placed;
  const stop = stopOf(placed.value, spot.chapterId);
  return stop ? { ok: true, value: stop } : refuse('stop-missing', 'The stopping place was not kept.');
}

/** Puts a stop back at its spot with its label and note. */
async function restoreStop(env: BookmarkEnv, old: Bookmark): Promise<Result<Bookmark>> {
  const placed = await placeStop(env, old);
  if (!placed.ok || (old.label === '' && old.note === '')) return placed;
  return attempt(() => env.port.bookmarksUpdate(placed.value.id, old.label, old.note));
}

/**
 * Makes a spot the chapter's stopping place ("Read to here"), replacing the stop the chapter had. It only marks the place. The spot the stop
 * already holds journals nothing. Undo puts the old stop back (with its label and note) or removes the new one, and is refused once the
 * chapter's stop has changed since, so it never undoes a stop the narrator set later.
 */
export async function setStop(env: BookmarkEnv, spot: BookmarkSpot): Promise<Result<SetStop>> {
  const listed = await attempt(() => env.port.bookmarksList());
  if (!listed.ok) return listed;
  const before = stopOf(listed.value, spot.chapterId) ?? null;
  if (before && sameSpot(before, spot)) return { ok: true, value: { stop: before, replaced: null, entryId: null } };
  const touches = before ? [`bookmarks/${before.id}`] : ['bookmarks'];
  const result = await journalled<Bookmark>(env, {
    label: 'Set the stopping place',
    touches,
    async run() {
      const placed = await placeStop(env, spot);
      if (placed.ok) touches.splice(0, touches.length, `bookmarks/${placed.value.id}`, ...(before ? [`bookmarks/${before.id}`] : []));
      return placed;
    },
    async undo(stop: Bookmark) {
      const now = await attempt(() => env.port.bookmarksList());
      if (!now.ok) return now;
      if (stopOf(now.value, spot.chapterId)?.id !== stop.id) {
        return refuse('stop-changed', 'The stopping place has changed since, so it was left where it is.');
      }
      const undone = before ? await restoreStop(env, before) : await attempt(() => env.port.bookmarksRemove(stop.id));
      await reload(env);
      return undone;
    },
  });
  return result.ok ? { ok: true, value: { stop: result.value.value, replaced: before, entryId: result.value.id } } : result;
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
 * a new id and the entry is spent once it is undone (docs/architecture/ui-state-and-journal.md#the-journal-and-undo), so a second Undo of it is refused by the journal. A spot that has a bookmark again is refused, so
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
  if (old.kind === 'stop') {
    if (stopOf(listed.value, old.chapterId)) return refuse('stop-taken', 'This chapter has a stopping place again, so the removed one was left off.');
    return restoreStop(env, old);
  }
  if (listed.value.some((bookmark) => bookmark.kind === 'spot' && sameSpot(bookmark, old))) {
    return refuse('spot-taken', 'That spot has a bookmark again, so the removed one was left off.');
  }
  const added = await attempt(() => env.port.bookmarksAdd(old.chapterId, old.paragraphId, old.offset));
  if (!added.ok) return added;
  return attempt(() => env.port.bookmarksUpdate(added.value.id, old.label, old.note));
}
