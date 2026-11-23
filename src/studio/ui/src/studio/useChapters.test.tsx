// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { announceChapterListWritten } from '../api/chapterListWrites';
import { createMockApi } from '../api/mockApi';
import { StudioProvider, useStoreHandle } from './StudioProvider';
import { useChapters, useReadChapters } from './useChapters';

afterEach(cleanup);

const withProvider = (api: ReturnType<typeof createMockApi>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
  };

describe('useChapters (#3658)', () => {
  it('reads the chapter list once for readers that mount together, and not again when another mounts later', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'manuscriptChapters');
    const first = renderHook(() => [useChapters(), useChapters(), useChapters()], { wrapper: withProvider(api) });
    await waitFor(() => expect(first.result.current[0]!.chapters).toBeDefined());
    expect(read).toHaveBeenCalledTimes(1);
    expect(first.result.current[1]!.chapters).toBe(first.result.current[0]!.chapters);
  });

  it('reads again when a call that changes the recorded lengths settles, and when the caller asks for the list again', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'manuscriptChapters');
    const { result, rerender } = renderHook(({ key }) => useChapters(true, key), { wrapper: withProvider(api), initialProps: { key: 0 } });
    await waitFor(() => expect(result.current.chapters).toBeDefined());
    expect(read).toHaveBeenCalledTimes(1);
    announceChapterListWritten();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    rerender({ key: 1 });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
  });

  it('reads nothing while it is not enabled, and reads the port itself where no provider is above it', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'manuscriptChapters');
    const off = renderHook(() => useChapters(false), { wrapper: withProvider(api) });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(read).not.toHaveBeenCalled();
    expect(off.result.current.chapters).toBeUndefined();
    const alone = renderHook(() => useChapters(), {
      wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>,
    });
    await waitFor(() => expect(alone.result.current.chapters).toBeDefined());
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('useChapters after a project switch (#3658)', () => {
  it('reads the list again when the store was reset while mounted, and does not read a failed list in a loop', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'manuscriptChapters');
    const { result } = renderHook(() => ({ list: useChapters(), store: useStoreHandle() }), { wrapper: withProvider(api) });
    await waitFor(() => expect(result.current.list.chapters).toBeDefined());
    act(() => result.current.store.reset());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.list.chapters).toBeDefined());
    read.mockRejectedValue(new Error('offline'));
    act(() => result.current.store.reset());
    await waitFor(() => expect(result.current.list.error).toBeDefined());
    const failed = read.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(read.mock.calls.length).toBe(failed);
  });

  it('reads the list again when a project switch lands while its first read is in flight', async () => {
    const api = createMockApi();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const real = api.manuscriptChapters.bind(api);
    const read = vi.fn().mockImplementationOnce(async () => {
      await held;
      return real();
    });
    read.mockImplementation(() => real());
    api.manuscriptChapters = read;
    const { result } = renderHook(() => ({ chapters: useChapters().chapters, store: useStoreHandle() }), { wrapper: withProvider(api) });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    act(() => result.current.store.reset());
    release();
    await waitFor(() => expect(result.current.chapters).toBeDefined());
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("asks for the new project's list when a second reset arrives while the first read is still out", async () => {
    const api = createMockApi();
    let calls = 0;
    const hang = new Promise<never>(() => undefined);
    vi.spyOn(api, 'manuscriptChapters').mockImplementation(() => (++calls === 2 ? hang : createMockApi().manuscriptChapters()));
    const { result } = renderHook(() => ({ list: useChapters(), store: useStoreHandle() }), { wrapper: withProvider(api) });
    await waitFor(() => expect(result.current.list.chapters).toBeDefined());
    act(() => result.current.store.reset());
    await waitFor(() => expect(calls).toBe(2));
    act(() => result.current.store.reset());
    await waitFor(() => expect(result.current.list.chapters).toBeDefined());
    expect(calls).toBe(3);
  });
});

describe('useReadChapters (#3658, #3998)', () => {
  it('shares the one list with every other reader: a page that works on what it read and the live hook make one host read', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'manuscriptChapters');
    const { result } = renderHook(() => ({ live: useChapters(), snapshot: useReadChapters() }), { wrapper: withProvider(api) });
    const first = await result.current.snapshot();
    await waitFor(() => expect(result.current.live.chapters).toBeDefined());
    expect(first.map((c) => c.id)).toEqual(result.current.live.chapters!.map((c) => c.id));
    expect(read).toHaveBeenCalledTimes(1);
    await result.current.snapshot();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('read(true) reads the host now, and the answer is the list every reader then holds', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'manuscriptChapters');
    const { result } = renderHook(() => ({ live: useChapters(), snapshot: useReadChapters() }), { wrapper: withProvider(api) });
    await result.current.snapshot();
    await act(async () => void (await result.current.snapshot(true)));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a read that fails is a failure of the read, and a later read answers', async () => {
    const api = createMockApi();
    let fail = true;
    const original = api.manuscriptChapters.bind(api);
    vi.spyOn(api, 'manuscriptChapters').mockImplementation(async () => {
      if (fail) throw new Error('offline');
      return original();
    });
    const { result } = renderHook(() => useReadChapters(), { wrapper: withProvider(api) });
    await expect(result.current()).rejects.toThrow('offline');
    fail = false;
    expect((await result.current(true)).length).toBeGreaterThan(0);
  });

  it('with no store it reads the port, as every reader did before the slot', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'manuscriptChapters');
    const { result } = renderHook(() => useReadChapters(), {
      wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>,
    });
    expect((await result.current()).length).toBeGreaterThan(0);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('settled (the default) fails when the re-read of a held list failed; a page that only shows the list keeps the held one', async () => {
    const api = createMockApi();
    const original = api.manuscriptChapters.bind(api);
    let fail = false;
    vi.spyOn(api, 'manuscriptChapters').mockImplementation(async () => {
      if (fail) throw new Error('offline');
      return original();
    });
    const { result } = renderHook(() => ({ page: useReadChapters(), cells: useReadChapters(undefined, false), store: useStoreHandle() }), {
      wrapper: withProvider(api),
    });
    await result.current.page();
    fail = true;
    act(() => announceChapterListWritten());
    await expect(result.current.page()).rejects.toThrow('offline');
    expect((await result.current.cells()).length).toBeGreaterThan(0);
  });
});

describe('useReadChapters when the host is on a project the window has not heard of (#4040)', () => {
  it('a reader that names A, given a list the host read from B, fails with the project changed once the store is told B', async () => {
    const api = createMockApi();
    const real = api.manuscriptChapters.bind(api);
    const read = vi.fn(async () => ({ ...(await real()), project: 'B' }));
    api.manuscriptChapters = read;
    const { result } = renderHook(() => ({ readChapters: useReadChapters('A'), store: useStoreHandle() }), { wrapper: withProvider(api) });
    const asked = result.current.readChapters();
    const outcome = expect(asked).rejects.toThrow('The project changed');
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read).toHaveBeenCalledTimes(1); // the gap answer is held back and the reader waits, no loop of reads
    act(() => {
      result.current.store.reset();
      result.current.store.setProject('B');
    });
    await outcome;
    expect(read).toHaveBeenCalledTimes(1);
  });
});
