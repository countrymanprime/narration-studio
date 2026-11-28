// @vitest-environment jsdom
// The bookmarks model over the mock host, the journal and the command router: the journalled commands, the jump menu, the search source and the keys.
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { withoutCredits } from '../../../../chapterKinds';
import type { Bookmark } from '../../../../api/contracts/bookmarks';
import { createMockApi } from '../../../../api/mockApi';
import { providedCommands } from '../../../../input/commandProviders';
import { gesture } from '../../../../input/gestures';
import type { GestureEvent, InputSource } from '../../../../input/InputSource';
import { CommandRouter, CommandScope } from '../../../../input/router';
import { findConflicts } from '../../../../input/findConflicts';
import { COMMAND_CATALOG } from '../../../../input/commands.catalog';
import { defaultKeymap } from '../../../../input/keymap';
import { searchAll } from '../../../../registries/search';
import { overlay } from '../../../../overlay/overlayService';
import { StudioProvider, useJournal, useStoreHandle } from '../../../../studio/StudioProvider';
import type { NarrationApi } from '../../../../types';
import { useBookmarkCommands, type BookmarkCommandsOptions } from './useBookmarkCommands';
import { useBookmarks } from './useBookmarks';

function fakeSource() {
  let listener: ((event: GestureEvent) => void) | undefined;
  const source: InputSource = {
    subscribe(onGesture) {
      listener = onGesture;
      return () => void (listener = undefined);
    },
  };
  return {
    source,
    press: (code: string, modifiers: Parameters<typeof gesture>[2] = [], target: EventTarget | null = null) =>
      listener?.({ gesture: gesture('keyboard', code, modifiers), target, preventDefault: () => {} }),
  };
}

let api: NarrationApi;
let keys: ReturnType<typeof fakeSource>;
type Extra = Partial<Omit<BookmarkCommandsOptions, 'bookmarks'>>;

function setup(extra: Extra = {}) {
  keys = fakeSource();
  const onGoTo = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <StudioProvider>
        <CommandRouter source={keys.source}>
          <CommandScope kind="page">{children}</CommandScope>
        </CommandRouter>
      </StudioProvider>
    </ApiProvider>
  );
  const hook = renderHook(
    () => {
      const model = useBookmarks();
      const chapters = [{ id: chapter.id, name: 'Down the Rabbit-Hole' }];
      useBookmarkCommands({ bookmarks: model.bookmarks ?? [], chapters, lineText: (b) => lines.get(b.paragraphId), onGoTo, ...extra });
      return { model, journal: useJournal(), store: useStoreHandle() };
    },
    { wrapper },
  );
  return { ...hook, onGoTo };
}

let chapter: { id: string };
let lines: Map<string, string>;
const spot = (n: number, offset: number) => ({ chapterId: chapter.id, paragraphId: [...lines.keys()][n], offset });

beforeEach(async () => {
  api = createMockApi();
  const [first] = withoutCredits((await api.manuscriptChapters()).chapters);
  chapter = first!;
  lines = new Map((await api.manuscriptParagraphs(chapter.id)).map((p) => [p.id, p.text]));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the list is asked for again when the store empties (#4085)', () => {
  it('bookmarks refreshed on focus between a reset and setProject end up held after setProject', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.model.bookmarks).toEqual([]));
    const { store } = result.current;
    act(() => store.setProject('A'));
    act(() => store.reset()); // system:attached
    await act(async () => void (await store.ensure('bookmarks'))); // the focus refresh answers before the bootstrap
    act(() => store.setProject('A')); // the bootstrap empties what was read before it
    await waitFor(() => expect(result.current.model.bookmarks).toEqual([]));
    expect(store.projectOf('bookmarks')).toBe('A');
  });
});

describe('the hook asks the store like useChapters does: once per generation, joined, quiet on failure (#4085)', () => {
  const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

  it('a hung bookmarks read across ten resets makes at most one read per generation', async () => {
    const list = vi.spyOn(api, 'bookmarksList').mockImplementation(() => new Promise(() => undefined));
    const { result } = setup();
    await settle();
    const { store } = result.current;
    for (let i = 0; i < 10; i += 1) {
      act(() => store.reset());
      await settle();
    }
    expect(list.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it('a rejected bookmarks read leaves the failure in the store and no unhandled rejection', async () => {
    const seen: unknown[] = [];
    const heard = (reason: unknown) => seen.push(reason);
    process.on('unhandledRejection', heard);
    try {
      const failing = vi.spyOn(api, 'bookmarksList').mockRejectedValue(new Error('the host refused'));
      const { result } = setup();
      await settle();
      await settle();
      expect(result.current.store.getState().errors.bookmarks).toBeInstanceOf(Error);
      expect(seen).toEqual([]);
      expect(failing).toHaveBeenCalledTimes(1); // the failure is not looped on
    } finally {
      process.off('unhandledRejection', heard);
    }
  });

  it('resets after the hook unmounts, with its list held, start no reads', async () => {
    const list = vi.spyOn(api, 'bookmarksList');
    const { result, unmount } = setup();
    await waitFor(() => expect(result.current.model.bookmarks).toEqual([]));
    const { store } = result.current;
    unmount();
    const calls = list.mock.calls.length;
    for (let i = 0; i < 3; i += 1) {
      store.reset();
      await settle();
    }
    expect(list.mock.calls.length).toBe(calls);
  });
});

describe('a page that mounts again reads the list again (one shared store)', () => {
  /** The hook mounted and unmounted under one provider, as the pages that use it come and go. */
  function shared() {
    const out: { current?: ReturnType<typeof useBookmarks> } = {};
    function Probe() {
      out.current = useBookmarks();
      return null;
    }
    const tree = (show: boolean) => (
      <ApiProvider api={api}>
        <StudioProvider>{show ? <Probe /> : null}</StudioProvider>
      </ApiProvider>
    );
    const view = render(tree(true));
    return { out, show: (on: boolean) => view.rerender(tree(on)) };
  }

  it('mount, unmount, the host adds a bookmark, remount shows it', async () => {
    const { out, show } = shared();
    await waitFor(() => expect(out.current?.bookmarks).toEqual([]));
    show(false);
    await api.bookmarksAdd(chapter.id, [...lines.keys()][0]!, 2);
    show(true);
    await waitFor(() => expect(out.current?.bookmarks).toHaveLength(1));
  });

  it('mount on a refused read, then the host answers: the next mount shows the list', async () => {
    vi.spyOn(api, 'bookmarksList').mockRejectedValueOnce(new Error('the host refused'));
    const { out, show } = shared();
    await waitFor(() => expect(out.current?.bookmarks).toBeUndefined());
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
    show(false);
    show(true);
    await waitFor(() => expect(out.current?.bookmarks).toEqual([]));
  });
});

describe('add-edit-remove-are-journal-entries', () => {
  it('each change is one journal entry with an inverse', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.model.bookmarks).toEqual([]));
    let added: Bookmark | null = null;
    await act(async () => void (added = await result.current.model.add(spot(0, 4))));
    expect(added).toMatchObject({ offset: 4 });
    await act(async () => void (await result.current.model.update(added!.id, 'Roses', 'Painting scene')));
    expect(result.current.model.bookmarks).toMatchObject([{ label: 'Roses', note: 'Painting scene' }]);
    expect((await result.current.journal.entries()).map((e) => e.label)).toEqual(['Edited a bookmark', 'Added a bookmark']);

    // Undo the edit, then remove and undo the remove: label and note come back on the replacement.
    await act(async () => void (await result.current.journal.undoLast()));
    await waitFor(() => expect(result.current.model.bookmarks).toMatchObject([{ label: '', note: '' }]));
    await act(async () => void (await result.current.model.update(added!.id, 'Roses', 'Painting scene')));
    await act(async () => void (await result.current.model.remove(added!.id)));
    expect(result.current.model.bookmarks).toEqual([]);
    await act(async () => void (await result.current.journal.undoLast()));
    await waitFor(() => expect(result.current.model.bookmarks).toMatchObject([{ label: 'Roses', note: 'Painting scene', offset: 4 }]));
  });

  it('a host refusal is the host sentence in a toast and journals nothing', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    const { result } = setup();
    await waitFor(() => expect(result.current.model.bookmarks).toEqual([]));
    await act(async () => void (await result.current.model.add({ ...spot(0, 0), offset: 99999 })));
    expect(toast).toHaveBeenCalledWith('that place is not in the line', { tone: 'error' });
    expect(await result.current.journal.entries()).toEqual([]);
  });
});

describe('same-spot-twice-is-one', () => {
  it('returns the bookmark that is there and journals nothing more', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.model.bookmarks).toEqual([]));
    let a: Bookmark | null = null;
    let b: Bookmark | null = null;
    await act(async () => void (a = await result.current.model.add(spot(0, 4))));
    await act(async () => void (b = await result.current.model.add(spot(0, 4))));
    expect(b!.id).toBe(a!.id);
    expect(await result.current.journal.entries()).toHaveLength(1);
  });

  it('says whether the press added a bookmark or found one already there', async () => {
    const toastUndo = vi.spyOn(overlay, 'toastUndo');
    const toast = vi.spyOn(overlay, 'toast');
    const { result } = setup();
    await waitFor(() => expect(result.current.model.bookmarks).toEqual([]));
    await act(async () => void (await result.current.model.add(spot(0, 4))));
    expect(toastUndo).toHaveBeenCalledWith('Bookmark added.', expect.any(Function), { entry: expect.any(Number) });
    toast.mockClear();
    await act(async () => void (await result.current.model.add(spot(0, 4))));
    expect(toast).toHaveBeenCalledWith('That spot is already bookmarked.');
    expect(toastUndo).toHaveBeenCalledOnce();
  });
});

describe('add-without-undo-when-an-editor-follows', () => {
  it('says "Bookmark added." with no Undo, since the page opens the bookmark\'s editor and a later Undo would undo what was typed there', async () => {
    const toastUndo = vi.spyOn(overlay, 'toastUndo');
    const toast = vi.spyOn(overlay, 'toast');
    toastUndo.mockClear();
    toast.mockClear();
    const { result } = setup();
    await waitFor(() => expect(result.current.model.bookmarks).toEqual([]));
    await act(async () => void (await result.current.model.add(spot(0, 4), { undo: false })));
    expect(toast).toHaveBeenCalledWith('Bookmark added.');
    expect(toastUndo).not.toHaveBeenCalled();
    expect(await result.current.journal.entries()).toHaveLength(1);
  });
});

describe('jump-menu-lists-each-bookmark-and-the-actions', () => {
  it('lists each bookmark by title with note and chapter as the hint, and the actions only while the page gave handlers', async () => {
    const onHere = vi.fn();
    const withHandlers = setup({ onHere, stepFrom: () => null });
    await waitFor(() => expect(withHandlers.result.current.model.bookmarks).toEqual([]));
    await act(async () => void (await withHandlers.result.current.model.add(spot(0, 4))));
    await act(async () => void (await withHandlers.result.current.model.update(withHandlers.result.current.model.bookmarks![0].id, 'Roses', 'Painting scene')));
    const rows = providedCommands();
    expect(rows.map((r) => r.label)).toEqual(['Bookmark: Roses', 'Bookmark here', 'Next bookmark', 'Previous bookmark']);
    expect(rows[0]).toMatchObject({ group: 'Bookmarks', hint: 'painting scene down the rabbit-hole' });
    act(() => rows[0].run());
    expect(withHandlers.onGoTo).toHaveBeenCalledWith(expect.objectContaining({ label: 'Roses' }));
    act(() => rows[1].run());
    expect(onHere).toHaveBeenCalled();
    withHandlers.unmount();

    const bare = setup();
    await waitFor(() => expect(bare.result.current.model.bookmarks).toHaveLength(1));
    expect(providedCommands().map((r) => r.label)).toEqual(['Bookmark: Roses']);
  });
});

describe('search-source-finds-bookmarks', () => {
  it('hits are grouped "Bookmarks" with the title and a muted note and chapter line, and the registry holds the minimum term', async () => {
    const { result, onGoTo } = setup();
    await waitFor(() => expect(result.current.model.bookmarks).toEqual([]));
    await act(async () => void (await result.current.model.add(spot(0, 4))));
    await act(async () => void (await result.current.model.update(result.current.model.bookmarks![0].id, 'Roses', 'Painting scene')));
    const hits = searchAll('paint');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ group: 'Bookmarks', title: 'Roses', sub: 'Painting scene · Down the Rabbit-Hole' });
    hits[0].run();
    expect(onGoTo).toHaveBeenCalled();
    expect(searchAll('p')).toEqual([]);
    expect(searchAll('zzzzzz')).toEqual([]);
  });
});

describe('keys-are-catalogue-rows', () => {
  it('fire only with handlers, step from where the page says, and never while typing', async () => {
    expect(findConflicts(COMMAND_CATALOG, defaultKeymap(COMMAND_CATALOG, false))).toEqual([]);
    const onHere = vi.fn();
    const none = vi.fn();
    const { result, onGoTo } = setup({ onHere, stepFrom: () => null, onNone: none });
    await waitFor(() => expect(result.current.model.bookmarks).toEqual([]));
    act(() => keys.press('BracketRight', ['Alt']));
    expect(none).toHaveBeenCalledTimes(1);
    await act(async () => void (await result.current.model.add(spot(0, 4))));
    await act(async () => void (await result.current.model.add(spot(1, 2))));
    act(() => keys.press('BracketRight', ['Alt']));
    expect(onGoTo).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 4 }));
    act(() => keys.press('BracketLeft', ['Alt']));
    expect(onGoTo).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 2 }));
    act(() => keys.press('KeyB'));
    expect(onHere).toHaveBeenCalledTimes(1);

    const field = document.createElement('input');
    document.body.append(field);
    act(() => keys.press('KeyB', [], field));
    act(() => keys.press('BracketRight', ['Alt'], field));
    expect(onHere).toHaveBeenCalledTimes(1);
    expect(onGoTo).toHaveBeenCalledTimes(2);
    field.remove();
  });

  it('a page with no handlers leaves the keys inert', async () => {
    const { result, onGoTo } = setup();
    await waitFor(() => expect(result.current.model.bookmarks).toEqual([]));
    act(() => keys.press('KeyB'));
    act(() => keys.press('BracketRight', ['Alt']));
    expect(onGoTo).not.toHaveBeenCalled();
  });
});
