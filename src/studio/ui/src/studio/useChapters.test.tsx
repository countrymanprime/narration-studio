// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { announceChapterListWritten } from '../api/chapterListWrites';
import { createMockApi } from '../api/mockApi';
import { StudioProvider, useStoreHandle } from './StudioProvider';
import { useChapters } from './useChapters';

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
  it('says it is refreshing while the read a refresh key asked for is out, and not once it ended', async () => {
    const api = createMockApi();
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    vi.spyOn(api, 'manuscriptChapters').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      await gate;
      return createMockApi().manuscriptChapters();
    });
    const { result, rerender } = renderHook(({ key }) => useChapters(true, key), { wrapper: withProvider(api), initialProps: { key: 0 } });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.refreshing).toBe(false);
    rerender({ key: 1 });
    await waitFor(() => expect(result.current.refreshing).toBe(true));
    release();
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(result.current.chapters).toBeDefined();
  });
});
