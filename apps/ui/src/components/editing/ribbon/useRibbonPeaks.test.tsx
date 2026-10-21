// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { usePort } from '../../../ports/usePort';
import { forgetPeaks, usePrefetchPeaks, useRibbonPeaks } from './useRibbonPeaks';

afterEach(cleanup);

const result = (chapterId: string) => ({ chapterId, items: [{ index: 0, reason: 'No audio.' }] });
const withApi = (api: ReturnType<typeof createMockApi>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <ApiProvider api={api}>{children}</ApiProvider>;
  };

// The ribbon mounts again each time the cursor reaches another paragraph, and the timeline strip asks beside it: the whole chapter's
// peaks are read once and shared, so the waveform is there at once instead of reading the audio again at every move.
describe('useRibbonPeaks', () => {
  it('asks the host once for a chapter however many ribbons and strips ask', async () => {
    const workspacePeaks = vi.fn(async (chapterId: string) => result(chapterId));
    const api = { ...createMockApi(), workspacePeaks };
    const first = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
    const strip = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    await waitFor(() => expect(strip.result.current.status).toBe('ready'));
    first.unmount();
    // The next paragraph's ribbon is a fresh mount: it starts ready, with no second request.
    const next = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
    expect(next.result.current.status).toBe('ready');
    expect(workspacePeaks).toHaveBeenCalledTimes(1);
  });

  it('asks again for another chapter', async () => {
    const workspacePeaks = vi.fn(async (chapterId: string) => result(chapterId));
    const api = { ...createMockApi(), workspacePeaks };
    const one = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
    await waitFor(() => expect(one.result.current.status).toBe('ready'));
    const two = renderHook(() => useRibbonPeaks('c-2'), { wrapper: withApi(api) });
    await waitFor(() => expect(two.result.current.status).toBe('ready'));
    expect(workspacePeaks.mock.calls.map(([id]) => id)).toEqual(['c-1', 'c-2']);
  });

  it('does not keep a failed read: the next ask tries the host again', async () => {
    const workspacePeaks = vi
      .fn()
      .mockRejectedValueOnce(new Error('Host busy.'))
      .mockImplementation(async (chapterId: string) => result(chapterId));
    const api = { ...createMockApi(), workspacePeaks };
    const failed = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
    await waitFor(() => expect(failed.result.current).toEqual({ status: 'failed', reason: 'Host busy.' }));
    failed.unmount();
    const retried = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
    await waitFor(() => expect(retried.result.current.status).toBe('ready'));
    expect(workspacePeaks).toHaveBeenCalledTimes(2);
  });

  it('keeps a chapter read for the whole session, until it is forgotten', async () => {
    vi.useFakeTimers();
    try {
      const workspacePeaks = vi.fn(async (chapterId: string) => result(chapterId));
      const api = { ...createMockApi(), workspacePeaks };
      const first = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
      await vi.waitFor(() => expect(first.result.current.status).toBe('ready'));
      first.unmount();
      vi.setSystemTime(Date.now() + 6 * 60 * 60 * 1000);
      const later = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
      expect(later.result.current.status).toBe('ready');
      expect(workspacePeaks).toHaveBeenCalledTimes(1);
      // A new take changes the audio: forgetting the chapter makes the next ask read it again.
      forgetPeaks(renderHook(() => usePort('workspace'), { wrapper: withApi(api) }).result.current, 'c-1');
      later.unmount();
      renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
      expect(workspacePeaks).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

// The other chapters are read in the background, one at a time and in order, so the next chapter's waveform is already there.
describe('usePrefetchPeaks', () => {
  it('reads the other chapters one after another in order, never two at once, and stops when the page closes', async () => {
    let inFlight = 0;
    let most = 0;
    const order: string[] = [];
    const workspacePeaks = vi.fn(async (chapterId: string) => {
      order.push(chapterId);
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return result(chapterId);
    });
    const api = { ...createMockApi(), workspacePeaks };
    const view = renderHook(() => usePrefetchPeaks(['p-1', 'p-2', 'p-3', 'p-4'], 'p-2'), { wrapper: withApi(api) });
    await waitFor(() => expect(order).toEqual(['p-2', 'p-3', 'p-4', 'p-1']), { timeout: 3000 });
    expect(most).toBe(1);
    view.unmount();
    expect(workspacePeaks).toHaveBeenCalledTimes(4);
  });
});
