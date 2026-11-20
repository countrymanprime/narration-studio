// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { announceChapterListWritten } from '../api/chapterListWrites';
import { createMockApi } from '../api/mockApi';
import { StudioProvider } from './StudioProvider';
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
