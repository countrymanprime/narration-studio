import { withoutCredits } from '../../chapterKinds';
import { describe, expect, it, vi } from 'vitest';
import type { Bookmark } from '../../api/contracts/bookmarks';
import { createMockApi } from '../../api/mockApi';
import { createJournal } from '../journal/createJournal';
import { createSlots } from '../slots';
import { createStudioStore } from '../store/createStudioStore';
import { addBookmark, editBookmark, removeBookmark, setStop, type BookmarkEnv, type BookmarkSpot } from './bookmarks';

async function setup() {
  const api = createMockApi();
  const store = createStudioStore({ registry: createSlots(api, api), subscribe: () => () => undefined, subscribeFocus: () => () => undefined });
  const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
  const [chapter] = withoutCredits(await api.manuscriptChapters());
  const lines = await api.manuscriptParagraphs(chapter!.id);
  const spot = (line = 0, offset = 2): BookmarkSpot => ({ chapterId: chapter!.id, paragraphId: lines[line]!.id, offset });
  const env: BookmarkEnv = { journal, port: api, store };
  return { api, store, journal, env, spot };
}

const slot = (s: Awaited<ReturnType<typeof setup>>) => s.store.getState().slots.bookmarks;

describe('add-journals-with-a-remove-inverse', () => {
  it('records "Added a bookmark" touching bookmarks/<id>, and Undo removes it', async () => {
    const s = await setup();
    const added = await addBookmark(s.env, s.spot());
    expect(added.ok && added.value.created).toBe(true);
    const bookmark = added.ok ? added.value.bookmark : null!;
    const [row] = await s.journal.entries();
    expect(row).toMatchObject({ label: 'Added a bookmark', touches: [`bookmarks/${bookmark.id}`], undoable: true });
    expect(slot(s)).toHaveLength(1);
    const remove = vi.spyOn(s.api, 'bookmarksRemove');
    expect((await s.journal.undo(row!.id)).ok).toBe(true);
    expect(remove).toHaveBeenCalledWith(bookmark.id);
    expect(await s.api.bookmarksList()).toEqual([]);
    expect(slot(s)).toEqual([]);
  });
});

describe('add-at-a-bookmarked-spot-journals-nothing', () => {
  it('returns the existing bookmark with created false and records no entry', async () => {
    const s = await setup();
    const first = await s.api.bookmarksAdd(s.spot().chapterId, s.spot().paragraphId, 2);
    const again = await addBookmark(s.env, s.spot());
    expect(again).toEqual({ ok: true, value: { bookmark: first, created: false, entryId: null } });
    expect(await s.journal.entries()).toEqual([]);
    expect(await s.api.bookmarksList()).toHaveLength(1);
  });

  it('answers the host sentence as a refusal for a spot the manuscript lacks, journalling nothing', async () => {
    const s = await setup();
    const result = await addBookmark(s.env, { ...s.spot(), offset: 99999 });
    expect(result).toMatchObject({ ok: false, refusal: { reason: 'that place is not in the line' } });
    expect(await s.journal.entries()).toEqual([]);
  });
});

describe('edit-journals-with-the-old-text', () => {
  it('restores the old label and note on Undo', async () => {
    const s = await setup();
    await s.api.bookmarksAdd(s.spot().chapterId, s.spot().paragraphId, 2).then((b) => s.api.bookmarksUpdate(b.id, 'Old', 'Old note'));
    await s.store.load('bookmarks');
    const id = slot(s)![0]!.id;
    const edited = await editBookmark(s.env, id, 'New', 'New note');
    expect(edited.ok && edited.value.bookmark).toMatchObject({ label: 'New', note: 'New note' });
    expect(slot(s)![0]).toMatchObject({ label: 'New' });
    const [row] = await s.journal.entries();
    expect(row).toMatchObject({ label: 'Edited a bookmark', touches: [`bookmarks/${id}`] });
    expect((await s.journal.undo(row!.id)).ok).toBe(true);
    expect(slot(s)![0]).toMatchObject({ label: 'Old', note: 'Old note' });
  });

  it('returns the host sentence for refused text and journals nothing', async () => {
    const s = await setup();
    const added = await addBookmark(s.env, s.spot());
    const id = added.ok ? added.value.bookmark.id : '';
    const tooLong = await editBookmark(s.env, id, 'x'.repeat(61), '');
    expect(tooLong).toMatchObject({ ok: false, refusal: { reason: "a bookmark's label can be at most 60 characters" } });
    const control = await editBookmark(s.env, id, 'a\u0007b', '');
    expect(control.ok).toBe(false);
    expect(await s.journal.entries()).toHaveLength(1);
  });
});

describe('remove-journals-with-a-recreate', () => {
  it('recreates at the same spot with the old text under a new id, and a second Undo is refused', async () => {
    const s = await setup();
    const added = await addBookmark(s.env, s.spot());
    const id = added.ok ? added.value.bookmark.id : '';
    await editBookmark(s.env, id, 'Queen', 'Shout');
    const removed = await removeBookmark(s.env, id);
    expect(removed.ok).toBe(true);
    expect(slot(s)).toEqual([]);
    const entryId = removed.ok ? removed.value.entryId : -1;
    expect((await s.journal.undo(entryId)).ok).toBe(true);
    const [back] = await s.api.bookmarksList();
    expect(back).toMatchObject({ ...s.spot(), label: 'Queen', note: 'Shout' });
    expect(back!.id).not.toBe(id);
    expect(slot(s)).toEqual([back]);
    expect(await s.journal.undo(entryId)).toMatchObject({ ok: false, refusal: { reason: 'Already undone.' } });
  });

  it('refuses to recreate over a bookmark made at the spot since', async () => {
    const s = await setup();
    const added = await addBookmark(s.env, s.spot());
    const removed = await removeBookmark(s.env, added.ok ? added.value.bookmark.id : '');
    await s.api.bookmarksAdd(s.spot().chapterId, s.spot().paragraphId, 2);
    const undone = await s.journal.undo(removed.ok ? removed.value.entryId : -1);
    expect(undone).toMatchObject({ ok: false, refusal: { code: 'spot-taken' } });
    expect(await s.api.bookmarksList()).toHaveLength(1);
  });

  it('refuses a bookmark the slot does not hold', async () => {
    const s = await setup();
    expect(await removeBookmark(s.env, 'nope')).toMatchObject({ ok: false, refusal: { code: 'bookmark-gone' } });
    expect(await editBookmark(s.env, 'nope', 'a', 'b')).toMatchObject({ ok: false, refusal: { code: 'bookmark-gone' } });
  });
});

describe('later-entry-on-the-same-bookmark-refuses-undo', () => {
  it('refuses the add until the edit is undone', async () => {
    const s = await setup();
    const added = await addBookmark(s.env, s.spot());
    const edited = await editBookmark(s.env, added.ok ? added.value.bookmark.id : '', 'Name', '');
    const addId = added.ok ? added.value.entryId! : -1;
    const refusal = await s.journal.undo(addId);
    expect(refusal).toMatchObject({ ok: false, refusal: { reason: "Undo 'Edited a bookmark' first. It changed the same thing." } });
    expect(slot(s)).toHaveLength(1);
    expect((await s.journal.undo(edited.ok ? edited.value.entryId : -1)).ok).toBe(true);
    expect((await s.journal.undo(addId)).ok).toBe(true);
    expect(slot(s)).toEqual([]);
  });
});

describe('stale-inverse-is-a-refusal', () => {
  it('returns the host sentence when the bookmark is gone, leaving the list unchanged', async () => {
    const s = await setup();
    const added = await addBookmark(s.env, s.spot());
    const id = added.ok ? added.value.bookmark.id : '';
    const edited = await editBookmark(s.env, id, 'Name', '');
    await s.api.bookmarksRemove(id);
    const undone = await s.journal.undo(edited.ok ? edited.value.entryId : -1);
    expect(undone).toMatchObject({ ok: false, refusal: { reason: 'that bookmark is no longer there' } });
    expect(await s.api.bookmarksList()).toEqual([]);
  });
});

describe('slot-follows-the-commands', () => {
  it('loads the slot once after each command and each undo', async () => {
    const s = await setup();
    const list = vi.spyOn(s.api, 'bookmarksList');
    const added = await addBookmark(s.env, s.spot());
    // One list for the same-spot check, one for the slot.
    expect(list).toHaveBeenCalledTimes(2);
    list.mockClear();
    await s.journal.undo(added.ok ? added.value.entryId! : -1);
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('no-path-reaches-the-host', () => {
  it('sends a path-looking label as plain text', async () => {
    const s = await setup();
    const update = vi.spyOn(s.api, 'bookmarksUpdate');
    const added = await addBookmark(s.env, s.spot());
    await editBookmark(s.env, added.ok ? added.value.bookmark.id : '', '/etc/passwd', 'C:\\Users\\me');
    expect(update).toHaveBeenCalledWith(expect.any(String), '/etc/passwd', 'C:\\Users\\me');
    expect((await s.api.bookmarksList())[0]!.label).toBe('/etc/passwd');
  });
});

const stopsOf = (list: readonly Bookmark[] | undefined) => (list ?? []).filter((bookmark) => bookmark.kind === 'stop');

describe('a-stopping-place-is-one-per-chapter-with-undo', () => {
  it('sets the first stop as "Set the stopping place", and Undo removes it', async () => {
    const s = await setup();
    const set = await setStop(s.env, s.spot(1, 0));
    expect(set.ok && set.value).toMatchObject({ stop: { kind: 'stop', offset: 0 }, replaced: null });
    const [row] = await s.journal.entries();
    expect(row).toMatchObject({ label: 'Set the stopping place', undoable: true });
    expect(stopsOf(slot(s))).toHaveLength(1);
    expect((await s.journal.undo(row!.id)).ok).toBe(true);
    expect(await s.api.bookmarksList()).toEqual([]);
  });

  it("replaces the chapter's stop, and Undo puts the old one back with its label", async () => {
    const s = await setup();
    const first = await setStop(s.env, s.spot(0, 0));
    const firstId = first.ok ? first.value.stop.id : '';
    await s.api.bookmarksUpdate(firstId, 'Scene end', '');
    await s.store.load('bookmarks');
    const moved = await setStop(s.env, s.spot(1, 0));
    expect(moved.ok && moved.value.replaced).toMatchObject({ id: firstId, label: 'Scene end' });
    expect(stopsOf(await s.api.bookmarksList()).map((stop) => stop.paragraphId)).toEqual([s.spot(1, 0).paragraphId]);
    const [latest] = await s.journal.entries();
    expect((await s.journal.undo(latest!.id)).ok).toBe(true);
    const back = stopsOf(await s.api.bookmarksList());
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ paragraphId: s.spot(0, 0).paragraphId, offset: 0, label: 'Scene end' });
  });

  it('journals nothing for the spot the stop already holds, and leaves plain bookmarks alone', async () => {
    const s = await setup();
    const plain = await addBookmark(s.env, s.spot(0, 0));
    await setStop(s.env, s.spot(0, 0));
    const again = await setStop(s.env, s.spot(0, 0));
    expect(again.ok && again.value.entryId).toBeNull();
    expect(await s.journal.entries()).toHaveLength(2);
    // A plain bookmark at the stop's spot is still the one Bookmark here answers.
    const added = await addBookmark(s.env, s.spot(0, 0));
    expect(added.ok && added.value).toMatchObject({ created: false, bookmark: { id: plain.ok ? plain.value.bookmark.id : '' } });
  });

  it('refuses the undo once the stopping place has moved since', async () => {
    const s = await setup();
    await setStop(s.env, s.spot(0, 0));
    const [row] = await s.journal.entries();
    await s.api.bookmarksSetStop(s.spot().chapterId, s.spot(1, 0).paragraphId, 0);
    const undone = await s.journal.undo(row!.id);
    expect(undone.ok).toBe(false);
    expect(stopsOf(await s.api.bookmarksList()).map((stop) => stop.paragraphId)).toEqual([s.spot(1, 0).paragraphId]);
  });

  it('answers the host sentence for a spot the manuscript lacks, journalling nothing', async () => {
    const s = await setup();
    expect(await setStop(s.env, { ...s.spot(), offset: 99999 })).toMatchObject({ ok: false, refusal: { reason: 'that place is not in the line' } });
    expect(await s.journal.entries()).toEqual([]);
  });

  it('a removed stop comes back as a stop on Undo, unless the chapter has one again', async () => {
    const s = await setup();
    const set = await setStop(s.env, s.spot(0, 0));
    const id = set.ok ? set.value.stop.id : '';
    await removeBookmark(s.env, id);
    const [removal] = await s.journal.entries();
    expect((await s.journal.undo(removal!.id)).ok).toBe(true);
    expect(stopsOf(await s.api.bookmarksList())).toMatchObject([{ paragraphId: s.spot(0, 0).paragraphId, offset: 0 }]);

    const again = stopsOf(await s.api.bookmarksList())[0]!;
    await s.store.load('bookmarks');
    await removeBookmark(s.env, again.id);
    const [second] = await s.journal.entries();
    await s.api.bookmarksSetStop(s.spot().chapterId, s.spot(1, 0).paragraphId, 0);
    expect((await s.journal.undo(second!.id)).ok).toBe(false);
    expect(stopsOf(await s.api.bookmarksList()).map((stop) => stop.paragraphId)).toEqual([s.spot(1, 0).paragraphId]);
  });
});
