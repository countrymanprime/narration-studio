// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { createMockApi } from '../api/mockApi';
import type { ManuscriptParagraph } from '../types';
import { createHostEvents, createKeyedSlots, createSlots } from './slots';
import { createStudioStore } from './store/createStudioStore';
import { act } from '@testing-library/react';
import { StudioProvider, useStoreHandle } from './StudioProvider';
import { useChapterText } from './useChapterText';

afterEach(cleanup);

const withProvider = (api: ReturnType<typeof createMockApi>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
  };

describe('useChapterText (#3658)', () => {
  it('reads a chapter once for readers that mount together and for one that mounts later', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const first = renderHook(() => [useChapterText(chapter!.id), useChapterText(chapter!.id)], { wrapper: withProvider(api) });
    await waitFor(() => expect(first.result.current[0]!.paragraphs).toBeDefined());
    expect(read).toHaveBeenCalledTimes(1);
    expect(first.result.current[1]!.paragraphs).toBe(first.result.current[0]!.paragraphs);
    expect(first.result.current[0]!.loading).toBe(false);
  });

  it('reads another chapter when the chapter changes, and not the first again when it comes back', async () => {
    const api = createMockApi();
    const [one, two] = await api.manuscriptChapters();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const { result, rerender } = renderHook(({ id }) => useChapterText(id), { wrapper: withProvider(api), initialProps: { id: one!.id } });
    await waitFor(() => expect(result.current.paragraphs).toBeDefined());
    rerender({ id: two!.id });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    rerender({ id: one!.id });
    await waitFor(() => expect(result.current.paragraphs).toBeDefined());
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('reads nothing without a chapter, and says loading until the first answer', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const none = renderHook(() => useChapterText(undefined), { wrapper: withProvider(api) });
    expect(none.result.current).toEqual({ paragraphs: undefined, error: undefined, loading: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).not.toHaveBeenCalled();
    const [chapter] = await api.manuscriptChapters();
    const some = renderHook(() => useChapterText(chapter!.id), { wrapper: withProvider(api) });
    expect(some.result.current.loading).toBe(true);
    await waitFor(() => expect(some.result.current.loading).toBe(false));
  });

  it('empties on a project switch and reads again for the new project', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const { result } = renderHook(() => ({ text: useChapterText(chapter!.id), store: useStoreHandle() }), { wrapper: withProvider(api) });
    await waitFor(() => expect(result.current.text.paragraphs).toBeDefined());
    result.current.store.reset();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it('reads the port itself where no provider is above it', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const alone = renderHook(() => useChapterText(chapter!.id), {
      wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>,
    });
    await waitFor(() => expect(alone.result.current.paragraphs).toBeDefined());
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('useChapterText with a store of its own (#3658)', () => {
  /** A provider over a store whose budget and events the test sets; `emit` raises a host event. */
  function harness(api: ReturnType<typeof createMockApi>, budget?: number) {
    const handlers = new Map<string, Set<() => void>>();
    const keyed = createKeyedSlots(api);
    const store = createStudioStore({
      registry: createSlots(api, { bookmarksList: async () => [] }),
      keyed: { chapterText: { ...keyed.chapterText, ...(budget === undefined ? {} : { budget }) } },
      subscribe: (event, handler) => {
        (handlers.get(event) ?? handlers.set(event, new Set()).get(event)!).add(handler);
        return () => handlers.get(event)?.delete(handler);
      },
      subscribeFocus: () => () => undefined,
      onError: () => undefined,
    });
    void createHostEvents;
    store.start();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider store={store}>{children}</StudioProvider>
      </ApiProvider>
    );
    return { store, wrapper, emit: (event: string) => act(() => handlers.get(event)?.forEach((h) => h())) };
  }

  it('reads a mounted chapter again after a job ends and shows the new text', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    let text = 'first';
    vi.spyOn(api, 'manuscriptParagraphs').mockImplementation(async (id) => [
      { id: 'p1', chapterId: id, chapter: 'Chapter', index: 0, text, entityIds: [] } as unknown as ManuscriptParagraph,
    ]);
    const { wrapper, emit } = harness(api);
    const { result } = renderHook(() => useChapterText(chapter!.id), { wrapper });
    await waitFor(() => expect(result.current.paragraphs?.[0]?.text).toBe('first'));
    text = 'second';
    await emit('job:ended');
    await waitFor(() => expect(result.current.paragraphs?.[0]?.text).toBe('second'));
  });

  it('settles when two mounted chapters do not fit the budget together: neither is dropped, the read count stops', async () => {
    const api = createMockApi();
    const [one, two] = await api.manuscriptChapters();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const { wrapper } = harness(api, 10);
    const { result } = renderHook(() => [useChapterText(one!.id), useChapterText(two!.id)], { wrapper });
    await waitFor(() => expect(result.current.every((entry) => entry.paragraphs !== undefined)).toBe(true));
    const settled = read.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(read.mock.calls.length).toBe(settled);
    expect(settled).toBe(2);
    expect(result.current.map((entry) => entry.loading)).toEqual([false, false]);
  });

  it('reads the chapter again when a project switch lands while its first read is in flight', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const real = api.manuscriptParagraphs.bind(api);
    let release: () => void = () => undefined;
    const spy = vi.spyOn(api, 'manuscriptParagraphs').mockImplementationOnce(async (id) => {
      await new Promise<void>((resolve) => (release = resolve));
      return real(id);
    });
    const { wrapper, store } = harness(api);
    const { result } = renderHook(() => useChapterText(chapter!.id), { wrapper });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    act(() => store.reset());
    release();
    await waitFor(() => expect(result.current.paragraphs).toBeDefined());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not read a failed chapter in a loop', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const spy = vi.spyOn(api, 'manuscriptParagraphs').mockRejectedValue(new Error('offline'));
    const { wrapper } = harness(api);
    const { result } = renderHook(() => useChapterText(chapter!.id), { wrapper });
    await waitFor(() => expect(result.current.error).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });
  it('a reader that mounts on a chapter whose read failed reads it again', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const real = api.manuscriptParagraphs.bind(api);
    const spy = vi
      .spyOn(api, 'manuscriptParagraphs')
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation((id) => real(id));
    const { wrapper } = harness(api);
    const first = renderHook(() => useChapterText(chapter!.id), { wrapper });
    await waitFor(() => expect(first.result.current.error).toBeDefined());
    const second = renderHook(() => useChapterText(chapter!.id), { wrapper });
    await waitFor(() => expect(second.result.current.paragraphs).toBeDefined());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('shows the new text when a job ended while the chapter was being read', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const real = api.manuscriptParagraphs.bind(api);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const spy = vi.spyOn(api, 'manuscriptParagraphs').mockImplementationOnce(async (id) => {
      await gate;
      return real(id);
    });
    spy.mockImplementation((id) => real(id));
    const { wrapper, store } = harness(api);
    const { result } = renderHook(() => useChapterText(chapter!.id), { wrapper });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    act(() => store.publish('manuscript:changed'));
    release();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.paragraphs).toBeDefined());
  });
});

describe('useChapterText with many readers and swaps (#3658)', () => {
  it("asks for each chapter once and does not redraw a reader for another chapter's read", async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    const ids = chapters.slice(0, 8).map((chapter) => chapter.id);
    const real = api.manuscriptParagraphs.bind(api);
    // Each answer lands in its own tick.
    vi.spyOn(api, 'manuscriptParagraphs').mockImplementation(async (id) => {
      await new Promise((resolve) => setTimeout(resolve, 5 * (ids.indexOf(id) + 1)));
      return real(id);
    });
    let renders = 0;
    const { wrapper, store } = (() => {
      const keyed = createKeyedSlots(api);
      const created = createStudioStore({
        registry: createSlots(api, { bookmarksList: async () => [] }),
        keyed: keyed,
        subscribe: () => () => undefined,
        subscribeFocus: () => () => undefined,
        onError: () => undefined,
      });
      return {
        store: created,
        wrapper: ({ children }: { children: ReactNode }) => (
          <ApiProvider api={api}>
            <StudioProvider store={created}>{children}</StudioProvider>
          </ApiProvider>
        ),
      };
    })();
    const ensure = vi.spyOn(store.keyed('chapterText'), 'ensure');
    const { result } = renderHook(
      () => {
        renders += 1;
        return ids.map((id) => useChapterText(id));
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.every((entry) => entry.paragraphs !== undefined)).toBe(true));
    // N readers answered one per tick: each asks once on mount and redraws about twice (mount, its own answer), not once for each other reader's answer.
    expect(ensure.mock.calls.length).toBeLessThanOrEqual(ids.length * 2);
    expect(renders).toBeLessThanOrEqual(ids.length * 3);
  });

  it('two readers that swap chapters in one commit read neither again', async () => {
    const api = createMockApi();
    const [one, two] = await api.manuscriptChapters();
    const read = vi.spyOn(api, 'manuscriptParagraphs');
    const keyed = createKeyedSlots(api);
    const store = createStudioStore({
      registry: createSlots(api, { bookmarksList: async () => [] }),
      keyed: { chapterText: { ...keyed.chapterText, budget: 10 } },
      subscribe: () => () => undefined,
      subscribeFocus: () => () => undefined,
      onError: () => undefined,
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider store={store}>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result, rerender } = renderHook(({ ids }) => ids.map((id) => useChapterText(id)), { wrapper, initialProps: { ids: [one!.id, two!.id] } });
    await waitFor(() => expect(result.current.every((entry) => entry.paragraphs !== undefined)).toBe(true));
    expect(read).toHaveBeenCalledTimes(2);
    rerender({ ids: [two!.id, one!.id] });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.every((entry) => entry.paragraphs !== undefined)).toBe(true);
  });
});
