import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import type { Bookmark, BookmarksApi } from '../../api/contracts/bookmarks';
import { createMockApi } from '../../api/mockApi';
import { bookmarkSchema, bookmarksSchema } from '../../api/schemas/bookmarks';
import { describeProviderContract, type Goldens } from '../../ports/providerContract';
import { createJournal } from '../journal/createJournal';
import { createSlots } from '../slots';
import { createStudioStore } from '../store/createStudioStore';
import { addBookmark, editBookmark, removeBookmark, type BookmarkEnv } from './bookmarks';

const GOLDEN_DIR = fileURLToPath(new URL('../../../../../tests/fixtures/contracts/', import.meta.url));
const FILES = ['bookmarks-list.json', 'bookmarks-list-empty.json', 'bookmarks-add.json', 'bookmarks-update.json', 'bookmarks-remove.json'] as const;
const goldens: Goldens = Object.fromEntries(FILES.map((file) => [file, JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'))]));

// A stand-in for the host: the Go package's rules over the goldens' shapes, with the host's refusals thrown as sentences. The
// spot checks use a one-line manuscript "c-0001/p-000001" of 30 characters, as the goldens do.
const LINE = { chapterId: 'c-0001', paragraphId: 'p-000001', length: 30 };

function standInHost(golden: (name: string) => unknown): BookmarksApi {
  const template = bookmarkSchema.parse((golden('bookmarks-add.json') as Bookmark) ?? {});
  let stored: Bookmark[] = [];
  let next = 1;
  return {
    bookmarksList: async () => structuredClone(stored),
    bookmarksAdd: async (chapterId, paragraphId, offset) => {
      if (chapterId !== LINE.chapterId) throw new Error('that chapter is not in the manuscript');
      if (paragraphId !== LINE.paragraphId) throw new Error('that line is not in this chapter');
      if (!Number.isInteger(offset) || offset < 0 || offset > LINE.length) throw new Error('that place is not in the line');
      const existing = stored.find((b) => b.paragraphId === paragraphId && b.offset === offset);
      if (existing) return structuredClone(existing);
      const added = { ...template, id: `id-${next++}`, offset, label: '', note: '' };
      stored = [...stored, added];
      return structuredClone(added);
    },
    bookmarksUpdate: async (id, label, note) => {
      const current = stored.find((b) => b.id === id);
      if (!current) throw new Error('that bookmark is no longer there');
      if (label.trim().length > 60) throw new Error("a bookmark's label can be at most 60 characters");
      const updated = { ...current, label: label.trim(), note: note.trim() };
      stored = stored.map((b) => (b.id === id ? updated : b));
      return structuredClone(updated);
    },
    bookmarksRemove: async (id) => {
      stored = stored.filter((b) => b.id !== id);
      return structuredClone(stored);
    },
  };
}

type Port = { env: BookmarkEnv; spot: (offset?: number) => { chapterId: string; paragraphId: string; offset: number } };

async function build(api: BookmarksApi, spot: Port['spot']): Promise<Port> {
  const store = createStudioStore({
    registry: createSlots({ manuscriptChapters: async () => [] }, api),
    subscribe: () => () => undefined,
    subscribeFocus: () => () => undefined,
  });
  const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
  return { env: { journal, port: api, store }, spot };
}

const mockPort = async (): Promise<Port> => {
  const api = createMockApi();
  const [chapter] = await api.manuscriptChapters();
  const [line] = await api.manuscriptParagraphs(chapter!.id);
  return build(api, (offset = 2) => ({ chapterId: chapter!.id, paragraphId: line!.id, offset }));
};
const hostPort = (goldensIn: Goldens): Promise<Port> =>
  build(
    standInHost((name) => goldensIn[name]),
    (offset = 2) => ({ chapterId: LINE.chapterId, paragraphId: LINE.paragraphId, offset }),
  );

const cases = [
  {
    name: 'add-edit-remove-and-undo-leave-the-list-as-it-was',
    check: async ({ env, spot }: Port) => {
      const added = await addBookmark(env, spot());
      if (!added.ok) throw new Error('add refused');
      const edited = await editBookmark(env, added.value.bookmark.id, 'Queen', 'Shout');
      if (!edited.ok) throw new Error('edit refused');
      expect((await env.port.bookmarksList()).map((b) => b.label)).toEqual(['Queen']);
      const removed = await removeBookmark(env, added.value.bookmark.id);
      if (!removed.ok) throw new Error('remove refused');
      expect(await env.port.bookmarksList()).toEqual([]);
      expect(bookmarksSchema.safeParse(await env.port.bookmarksList()).success).toBe(true);
    },
  },
  {
    name: 'same-spot-twice-is-one-bookmark',
    check: async ({ env, spot }: Port) => {
      await addBookmark(env, spot());
      const again = await addBookmark(env, spot());
      expect(again.ok && again.value.created).toBe(false);
      expect(await env.port.bookmarksList()).toHaveLength(1);
    },
  },
  {
    name: 'an-offset-past-the-line-is-refused',
    observe: async ({ env, spot }: Port) => {
      const result = await addBookmark(env, spot(10_000));
      return result.ok ? 'accepted' : 'refused';
    },
  },
  {
    name: 'an-unknown-paragraph-is-refused',
    observe: async ({ env, spot }: Port) => {
      const result = await addBookmark(env, { ...spot(), paragraphId: 'no-such-line' });
      return result.ok ? 'accepted' : 'refused';
    },
  },
  {
    name: 'a-label-over-the-limit-is-refused',
    observe: async ({ env, spot }: Port) => {
      const added = await addBookmark(env, spot());
      if (!added.ok) return 'add refused';
      const result = await editBookmark(env, added.value.bookmark.id, 'x'.repeat(61), '');
      return result.ok ? 'accepted' : 'refused';
    },
  },
];

describeProviderContract<Port>('bookmark commands', { mock: mockPort, host: hostPort }, cases, { goldens });
