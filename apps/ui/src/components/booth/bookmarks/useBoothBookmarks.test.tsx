// @vitest-environment jsdom
// The Booth's bookmark behaviour over the mock host, the journal and the command router: B, the step keys, the right-click items.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { Bookmark } from '../../../api/contracts/bookmarks';
import { createMockApi } from '../../../api/mockApi';
import { gesture } from '../../../input/gestures';
import type { GestureEvent, InputSource } from '../../../input/InputSource';
import { CommandRouter, CommandScope } from '../../../input/router';
import { overlay } from '../../../overlay/overlayService';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { NarrationApi } from '../../../types';
import { boothUnits, type ReadingParagraph } from '../reading/boothUnits';
import type { ReadingPosition } from '../reading/readingPosition';
import { useBoothBookmarks, type BoothBookmarksOptions } from './useBoothBookmarks';

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
let chapters: { id: string; name: string }[];
let paragraphs: ReadingParagraph[];
let indexes: Map<string, number>;
const seek = vi.fn();
const goToChapter = vi.fn();

async function setup(
  over: Partial<BoothBookmarksOptions> = {},
  position: ReadingPosition | undefined = { paragraphId: paragraphs[0].id, word: 2 },
  held?: Bookmark[],
) {
  keys = fakeSource();
  if (held) vi.spyOn(api, 'bookmarksList').mockResolvedValue(held);
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
    () =>
      useBoothBookmarks({
        chapterId: chapters[0].id,
        chapters,
        paragraphs,
        units: boothUnits(paragraphs),
        position,
        recording: false,
        paragraphIndex: (id) => indexes.get(id) ?? null,
        seek,
        goToChapter,
        ...over,
      }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.bookmarks).toEqual(held ?? []));
  return hook;
}

const press = (code: string, modifiers: Parameters<typeof gesture>[2] = [], target: EventTarget | null = null) =>
  act(() => void keys.press(code, modifiers, target));

beforeEach(async () => {
  api = createMockApi();
  const all = await api.manuscriptChapters();
  chapters = all.slice(0, 2).map((c) => ({ id: c.id, name: c.title }));
  const rows = await api.manuscriptParagraphs(chapters[0].id);
  paragraphs = rows.slice(0, 3).map((p) => ({ id: p.id, text: p.text }));
  indexes = new Map(rows.map((p) => [p.id, p.index]));
  seek.mockReset();
  goToChapter.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const held = (id: string, chapterId: string, paragraphId: string, paragraph: number | null, offset: number): Bookmark => ({
  id,
  chapterId,
  paragraphId,
  paragraph,
  offset,
  label: '',
  note: '',
  createdAt: '2026-10-11T10:00:00Z',
  stale: false,
});

const wordStart = (text: string, word: number) => [...text.matchAll(/\S+/g)][word].index!;

describe('b-bookmarks-the-reading-position-and-says-so-with-an-undo', () => {
  it('bookmarks the start of the word being read and offers Undo, which takes it back', async () => {
    const toastUndo = vi.spyOn(overlay, 'toastUndo');
    const { result } = await setup();
    press('KeyB');
    await waitFor(() => expect(result.current.bookmarks).toHaveLength(1));
    expect(result.current.bookmarks![0]).toMatchObject({ chapterId: chapters[0].id, paragraphId: paragraphs[0].id, offset: wordStart(paragraphs[0].text, 2) });
    expect(toastUndo).toHaveBeenCalledWith('Bookmark added.', expect.any(Function));
    await act(async () => void (await toastUndo.mock.calls[0][1]()));
    await waitFor(() => expect(result.current.bookmarks).toEqual([]));
  });

  it('a second B at the same word says so and adds nothing', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    const toastUndo = vi.spyOn(overlay, 'toastUndo');
    const { result } = await setup();
    press('KeyB');
    await waitFor(() => expect(result.current.bookmarks).toHaveLength(1));
    press('KeyB');
    await waitFor(() => expect(toast).toHaveBeenCalledWith('That word is already bookmarked.'));
    expect(result.current.bookmarks).toHaveLength(1);
    expect(toastUndo).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no reading position', async () => {
    const { result } = await setup({}, undefined);
    press('KeyB');
    expect(result.current.bookmarks).toEqual([]);
  });
});

describe('typing-in-a-field-ignores-b', () => {
  it('B in a text field adds no bookmark', async () => {
    const { result } = await setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('KeyB', [], input);
    expect(result.current.bookmarks).toEqual([]);
    input.remove();
  });
});

describe('right-click-offers-bookmark-here-on-the-clicked-word', () => {
  const wordIn = (unit: number, word: number) => {
    const host = document.createElement('div');
    host.innerHTML = `<span data-unit="${unit}"><span data-word="${word}">w</span></span>`;
    return host.querySelector('[data-word]')!;
  };

  it('offers Bookmark here on a word, and it bookmarks that word', async () => {
    const { result } = await setup();
    const items = result.current.menuItems(wordIn(0, 1));
    expect(items.map((item) => item.label)).toEqual(['Bookmark here']);
    await act(async () => items[0].onSelect());
    await waitFor(() => expect(result.current.bookmarks).toHaveLength(1));
    expect(result.current.bookmarks![0]).toMatchObject({ paragraphId: paragraphs[0].id, offset: wordStart(paragraphs[0].text, 1) });
  });

  it('offers Edit and Delete on a ribbon, and Delete removes it', async () => {
    const { result } = await setup();
    press('KeyB');
    await waitFor(() => expect(result.current.bookmarks).toHaveLength(1));
    const ribbon = document.createElement('button');
    ribbon.dataset.bm = result.current.bookmarks![0].id;
    const click = vi.spyOn(ribbon, 'click');
    const items = result.current.menuItems(ribbon);
    expect(items.map((item) => item.label)).toEqual(['Edit bookmark', 'Delete bookmark']);
    items[0].onSelect();
    expect(click).toHaveBeenCalled();
    await act(async () => items[1].onSelect());
    await waitFor(() => expect(result.current.bookmarks).toEqual([]));
  });

  it('offers nothing off a word', async () => {
    const { result } = await setup();
    expect(result.current.menuItems(document.createElement('div'))).toEqual([]);
  });
});

describe('next-and-previous-move-the-reading-position', () => {
  async function withTwo(over: Partial<BoothBookmarksOptions> = {}) {
    const hook = await setup(over);
    const add = hook.result.current.add;
    await act(async () => void (await add({ chapterId: chapters[0].id, paragraphId: paragraphs[0].id, offset: wordStart(paragraphs[0].text, 5) })));
    await act(async () => void (await add({ chapterId: chapters[0].id, paragraphId: paragraphs[1].id, offset: wordStart(paragraphs[1].text, 1) })));
    return hook;
  }

  it('] moves to the next bookmark and wraps to the first; [ goes back', async () => {
    await withTwo();
    press('BracketRight', ['Alt']);
    expect(seek).toHaveBeenLastCalledWith(paragraphs[0].id, 5);
    press('BracketLeft', ['Alt']);
    expect(seek).toHaveBeenLastCalledWith(paragraphs[1].id, 1);
  });

  it('steps into another chapter by asking the page to change it', async () => {
    const spot = { chapterId: chapters[1].id, paragraphId: 'q1', offset: 3 };
    await setup({}, undefined, [held('x', spot.chapterId, 'q1', 99, 3)]);
    press('BracketRight', ['Alt']);
    expect(goToChapter).toHaveBeenCalledWith(spot.chapterId, { paragraphId: 'q1', offset: 3 });
    expect(seek).not.toHaveBeenCalled();
  });

  it('says when there is nowhere to go', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    await setup();
    press('BracketRight', ['Alt']);
    expect(toast).toHaveBeenCalledWith('No bookmarks yet.');
  });
});

describe('no-chapter-change-during-a-take', () => {
  const mine = () => held('y', chapters[0].id, paragraphs[2].id, indexes.get(paragraphs[2].id)!, 0);
  const theirs = () => held('x', chapters[1].id, 'q1', 99, 3);

  it('stepping to another chapter while recording is refused with the existing sentence', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    await setup({ recording: true }, { paragraphId: paragraphs[2].id, word: 0 }, [mine(), theirs()]);
    press('BracketRight', ['Alt']);
    expect(toast).toHaveBeenCalledWith('Stop recording first.');
    expect(goToChapter).not.toHaveBeenCalled();
    expect(seek).not.toHaveBeenCalled();
  });

  it('a step inside the chapter goes on during a take', async () => {
    await setup({ recording: true }, { paragraphId: paragraphs[0].id, word: 0 }, [mine(), theirs()]);
    press('BracketRight', ['Alt']);
    expect(seek).toHaveBeenLastCalledWith(paragraphs[2].id, 0);
  });
});

describe('a-stale-bookmark-is-drawn-flagged-not-moved', () => {
  it('is never stepped to', async () => {
    await setup({}, undefined, [{ ...held('s', chapters[0].id, 'gone', null, 9), stale: true, staleReason: 'paragraph_missing' }]);
    press('BracketRight', ['Alt']);
    expect(seek).not.toHaveBeenCalled();
    expect(goToChapter).not.toHaveBeenCalled();
  });
});
