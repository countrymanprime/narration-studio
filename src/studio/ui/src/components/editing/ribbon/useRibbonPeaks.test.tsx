// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { usePort } from '../../../ports/usePort';
import { forgetPeaks, PEAKS_BUDGET_BYTES, usePrefetchPeaks, useRibbonPeaks } from './useRibbonPeaks';

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

// Every chapter's waveform is read in the background, nearest the open chapter first (hooks/useRingPrefetch has the order's own tests),
// until the kept waveforms reach the budget; a chapter the narrator opens past it puts out the kept one furthest from use.
describe('usePrefetchPeaks', () => {
  const book = Array.from({ length: 9 }, (_, i) => `p-${i + 1}`);
  /** A chapter whose waveform is `mb` megabytes of peaks text. */
  const heavy = (chapterId: string, mb: number) => ({
    chapterId,
    items: [{ index: 0, peaks: { startSeconds: 0, bucketsPerSecond: 50, buckets: 1, minMax: 'A'.repeat(mb * 1024 * 1024), sampleRate: 48000, channels: 1 } }],
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 400)); // longer than the wait between two background reads

  it('reads every chapter once, outwards from the open one, and none again when the narrator moves', async () => {
    const workspacePeaks = vi.fn(async (chapterId: string) => result(chapterId));
    const api = { ...createMockApi(), workspacePeaks };
    const view = renderHook(({ at }) => usePrefetchPeaks(book, at), { wrapper: withApi(api), initialProps: { at: 'p-5' } });
    await waitFor(() => expect(workspacePeaks).toHaveBeenCalledTimes(9), { timeout: 4000 });
    expect(workspacePeaks.mock.calls.map(([id]) => id)).toEqual(['p-5', 'p-6', 'p-4', 'p-7', 'p-3', 'p-8', 'p-2', 'p-9', 'p-1']);
    view.rerender({ at: 'p-1' });
    await settle();
    expect(workspacePeaks).toHaveBeenCalledTimes(9);
  });

  it("shares the open chapter's read with its ribbon", async () => {
    const workspacePeaks = vi.fn(async (chapterId: string) => result(chapterId));
    const api = { ...createMockApi(), workspacePeaks };
    renderHook(
      () => {
        usePrefetchPeaks(['p-1', 'p-2'], 'p-1');
        return useRibbonPeaks('p-1');
      },
      { wrapper: withApi(api) },
    );
    await waitFor(() => expect(workspacePeaks).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(workspacePeaks.mock.calls.map(([id]) => id)).toEqual(['p-1', 'p-2']);
  });

  it('stops reading in the background when the kept waveforms reach the budget', async () => {
    expect(PEAKS_BUDGET_BYTES).toBe(16 * 1024 * 1024);
    const workspacePeaks = vi.fn(async (chapterId: string) => heavy(chapterId, 6));
    const api = { ...createMockApi(), workspacePeaks };
    renderHook(() => usePrefetchPeaks(book, 'p-5'), { wrapper: withApi(api) });
    // 6 + 6 + 6 MB is past 16 MB: the third read is the last.
    await waitFor(() => expect(workspacePeaks).toHaveBeenCalledTimes(3), { timeout: 3000 });
    await settle();
    expect(workspacePeaks.mock.calls.map(([id]) => id)).toEqual(['p-5', 'p-6', 'p-4']);
  });

  it('puts out the chapter furthest from use when one the narrator opens goes past the budget, never the one just opened', async () => {
    const workspacePeaks = vi.fn(async (chapterId: string) => heavy(chapterId, 6));
    const api = { ...createMockApi(), workspacePeaks };
    const open = (id: string) => renderHook(() => useRibbonPeaks(id), { wrapper: withApi(api) });
    for (const id of ['p-1', 'p-2', 'p-3']) await waitFor(() => expect(open(id).result.current.status).toBe('ready'));
    // 18 MB was read and 16 are allowed: p-1, the longest unused, left; p-2 and p-3 are still there.
    expect(open('p-3').result.current.status).toBe('ready');
    expect(open('p-2').result.current.status).toBe('ready');
    expect(workspacePeaks).toHaveBeenCalledTimes(3);
    const again = open('p-1');
    expect(again.result.current.status).toBe('loading');
    await waitFor(() => expect(again.result.current.status).toBe('ready'));
    expect(workspacePeaks).toHaveBeenCalledTimes(4);
    // p-3 was the longest unused then (p-2 was asked for after it), so p-3 left and p-2 stayed.
    expect(open('p-2').result.current.status).toBe('ready');
    expect(workspacePeaks).toHaveBeenCalledTimes(4);
  });

  it('keeps one chapter larger than the whole budget while it is the open one', async () => {
    const workspacePeaks = vi.fn(async (chapterId: string) => heavy(chapterId, 20));
    const api = { ...createMockApi(), workspacePeaks };
    const first = renderHook(() => useRibbonPeaks('p-1'), { wrapper: withApi(api) });
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    expect(renderHook(() => useRibbonPeaks('p-1'), { wrapper: withApi(api) }).result.current.status).toBe('ready');
    expect(workspacePeaks).toHaveBeenCalledTimes(1);
  });
});
