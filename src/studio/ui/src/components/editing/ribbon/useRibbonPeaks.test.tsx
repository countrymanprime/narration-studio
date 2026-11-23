// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { usePort } from '../../../ports/usePort';
import { forgetPeaks, PEAKS_BUDGET_BYTES, UNANSWERED_RETRY_MS, usePrefetchPeaks, useRibbonPeaks } from './useRibbonPeaks';

afterEach(cleanup);

const result = (chapterId: string) => ({ chapterId, items: [{ index: 0, reason: 'No audio.' }] });
const drawn = (chapterId: string) => ({
  chapterId,
  items: [{ index: 0, peaks: { startSeconds: 0, bucketsPerSecond: 50, buckets: 1, minMax: 'AAA=', sampleRate: 48000, channels: 1 } }],
});
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

  it('reads again, on the next ask after a quiet spell, an answer with a gap (#4042)', async () => {
    vi.useFakeTimers();
    try {
      const workspacePeaks = vi
        .fn()
        .mockResolvedValueOnce(result('c-1'))
        .mockResolvedValue({
          chapterId: 'c-1',
          items: [{ index: 0, peaks: { startSeconds: 0, bucketsPerSecond: 50, buckets: 1, minMax: 'AAA=', sampleRate: 48000, channels: 1 } }],
        });
      const api = { ...createMockApi(), workspacePeaks };
      const first = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
      await vi.waitFor(() => expect(first.result.current.status).toBe('ready'));
      first.unmount();
      renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) }).unmount();
      expect(workspacePeaks).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + UNANSWERED_RETRY_MS + 1000);
      const later = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
      await vi.waitFor(() => expect(workspacePeaks).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => {
        const state = later.result.current;
        expect(state.status === 'ready' && state.result.items[0]?.peaks).toBeTruthy();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads again after 15 s when only some items have peaks, not only when none has (#4042)', async () => {
    vi.useFakeTimers();
    try {
      const partial = { chapterId: 'c-1', items: [drawn('c-1').items[0]!, { index: 1, reason: 'still being read' }] };
      const whole = { chapterId: 'c-1', items: [drawn('c-1').items[0]!, { ...drawn('c-1').items[0]!, index: 1 }] };
      const workspacePeaks = vi.fn().mockResolvedValueOnce(partial).mockResolvedValue(whole);
      const api = { ...createMockApi(), workspacePeaks };
      const first = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
      await vi.waitFor(() => expect(first.result.current.status).toBe('ready'));
      first.unmount();
      vi.setSystemTime(Date.now() + UNANSWERED_RETRY_MS + 1000);
      const later = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
      await vi.waitFor(() => expect(workspacePeaks).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => {
        const state = later.result.current;
        expect(state.status === 'ready' && state.result.items.every((item) => item.peaks)).toBe(true);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks the host again by itself while a ribbon stays open on an answer with a gap, keeping the shown answer meanwhile (#4042)', async () => {
    vi.useFakeTimers();
    try {
      const partial = { chapterId: 'c-1', items: [{ index: 0, reason: 'still being read' }] };
      const workspacePeaks = vi.fn().mockResolvedValueOnce(partial).mockResolvedValue(drawn('c-1'));
      const api = { ...createMockApi(), workspacePeaks };
      const open = renderHook(() => useRibbonPeaks('c-1'), { wrapper: withApi(api) });
      await vi.waitFor(() => expect(open.result.current.status).toBe('ready'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(UNANSWERED_RETRY_MS + 500);
      });
      await vi.waitFor(() => expect(workspacePeaks).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => {
        const state = open.result.current;
        expect(state.status === 'ready' && state.result.items[0]?.peaks).toBeTruthy();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a chapter read for the whole session, until it is forgotten', async () => {
    vi.useFakeTimers();
    try {
      const workspacePeaks = vi.fn(async (chapterId: string) => drawn(chapterId));
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
  // Longer than the wait between two background reads, on a fake clock.
  const settle = () => act(() => vi.advanceTimersByTimeAsync(400));
  beforeEach(() => void vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => void vi.useRealTimers());

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

  /** The chapters whose waveform is kept: asking for one that is not makes a new host call, so this asks through a counting copy. */
  const keptOf = (api: ReturnType<typeof createMockApi>, ids: readonly string[]) =>
    ids.filter((id) => renderHook(() => useRibbonPeaks(id), { wrapper: withApi(api) }).result.current.status === 'ready');

  it('keeps the chapters nearest the open one within the budget, and stops reading where chapters had to leave', async () => {
    expect(PEAKS_BUDGET_BYTES).toBe(16 * 1024 * 1024);
    const workspacePeaks = vi.fn(async (chapterId: string) => heavy(chapterId, 6));
    const api = { ...createMockApi(), workspacePeaks };
    const view = renderHook(({ at }) => usePrefetchPeaks(book, at), { wrapper: withApi(api), initialProps: { at: 'p-5' } });
    // Beside the open chapter 6 + 6 MB are kept; a third 6 MB would pass 16 MB, so nothing further out is read.
    await waitFor(() => expect(workspacePeaks).toHaveBeenCalledTimes(3), { timeout: 3000 });
    await settle();
    expect(workspacePeaks.mock.calls.map(([id]) => id)).toEqual(['p-5', 'p-6', 'p-4']);
    view.unmount();
    expect(keptOf(api, book).sort()).toEqual(['p-4', 'p-5', 'p-6']);
  });

  it('walking the whole book never keeps more than the budget, and the chapter the narrator is on is always kept', async () => {
    const workspacePeaks = vi.fn(async (chapterId: string) => heavy(chapterId, 5));
    const api = { ...createMockApi(), workspacePeaks };
    const view = renderHook(
      ({ at }) => {
        usePrefetchPeaks(book, at);
        return useRibbonPeaks(at);
      },
      { wrapper: withApi(api), initialProps: { at: 'p-1' } },
    );
    for (const at of [...book, ...[...book].reverse()]) {
      view.rerender({ at });
      await waitFor(() => expect(view.result.current.status).toBe('ready'), { timeout: 3000 });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await settle();
    view.unmount();
    const calls = workspacePeaks.mock.calls.length;
    const kept = keptOf(api, book);
    // 5 MB a chapter under 16 MB: three chapters beside the open one at most, the first chapter (where the walk ended) among them.
    expect(kept.length).toBeLessThanOrEqual(4);
    expect(kept).toContain('p-1');
    expect(calls).toBeGreaterThan(9); // chapters that left were read again on the way back
  });

  it('a jump past the budget trades the furthest kept chapters for the ones around the new place', async () => {
    const workspacePeaks = vi.fn(async (chapterId: string) => heavy(chapterId, 5));
    const api = { ...createMockApi(), workspacePeaks };
    const view = renderHook(({ at }) => usePrefetchPeaks(book, at), { wrapper: withApi(api), initialProps: { at: 'p-1' } });
    await settle();
    view.rerender({ at: 'p-8' });
    await settle();
    await settle();
    view.unmount();
    const kept = keptOf(api, book);
    expect(kept).toContain('p-8');
    expect(kept.some((id) => id === 'p-7' || id === 'p-9')).toBe(true);
    expect(kept).not.toContain('p-1');
  });

  it('never reads in the background a chapter that cannot stay, and reads no chapter twice while the narrator stays put', async () => {
    // One 20 MB chapter among 1 MB ones: walking towards it, it is read once (its size was not known), and never again until it is opened.
    const workspacePeaks = vi.fn(async (chapterId: string) => heavy(chapterId, chapterId === 'p-6' ? 20 : 1));
    const api = { ...createMockApi(), workspacePeaks };
    const view = renderHook(({ at }) => usePrefetchPeaks(book, at), { wrapper: withApi(api), initialProps: { at: 'p-2' } });
    for (const at of ['p-2', 'p-3', 'p-4', 'p-5']) {
      view.rerender({ at });
      await settle();
      await settle();
    }
    view.unmount();
    const reads = workspacePeaks.mock.calls.map(([id]) => id);
    expect(reads.filter((id) => id === 'p-6')).toHaveLength(1);
    expect(new Set(reads).size).toBe(reads.length); // no chapter read twice
    expect(keptOf(api, ['p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-7', 'p-8', 'p-9'])).toHaveLength(8);
  });

  it('with no page list, a chapter the page opens past the budget puts out the longest kept, never the one just opened', async () => {
    const workspacePeaks = vi.fn(async (chapterId: string) => heavy(chapterId, 6));
    const api = { ...createMockApi(), workspacePeaks };
    for (const id of ['q-1', 'q-2', 'q-3']) {
      const view = renderHook(() => useRibbonPeaks(id), { wrapper: withApi(api) });
      await waitFor(() => expect(view.result.current.status).toBe('ready'));
    }
    expect(keptOf(api, ['q-3', 'q-2', 'q-1'])).toEqual(['q-3', 'q-2']);
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
