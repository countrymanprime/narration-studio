// @vitest-environment jsdom
// The bookmarks model over the mock host, the journal and the command router: the journalled commands, the jump menu, the search source and the keys.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
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
import { StudioProvider, useJournal } from '../../../../studio/StudioProvider';
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
      return { model, journal: useJournal() };
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
  const [first] = await api.manuscriptChapters();
  chapter = first!;
  lines = new Map((await api.manuscriptParagraphs(chapter.id)).map((p) => [p.id, p.text]));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
