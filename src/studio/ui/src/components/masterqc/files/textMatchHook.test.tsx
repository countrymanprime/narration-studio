// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { makeChapters } from '../../../fixtures/chapters';
import type { CoverageResult, CoverageState } from '../../../types';
import { passing } from './testFiles';
import { useTextMatches } from './textMatch';

const current = (chapterId: string): CoverageResult => ({
  chapterId,
  state: 'current',
  reasons: [],
  result: { bodyTokens: 100, presentTokens: 90 } as never,
  judgement: { state: 'met', reason: '', thresholds: { minParagraphPresent: 0.9, maxMissingRun: 5 } },
});

function host(coverageResult: (id: string) => Promise<CoverageResult>) {
  const api = { ...createMockApi(), coverageResult };
  return ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
}

describe('useTextMatches (#2105 breaker: a long book, a check that cannot be read)', () => {
  it('reads only the chapters that have a file, not all 5000 of a long book', async () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 5000 });
    const read = vi.fn(async (id: string) => current(id));
    const files = [passing('Chapter 0007.wav')];
    const { result } = renderHook(() => useTextMatches(chapters, files), { wrapper: host(read) });
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(1));
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(chapters[6]!.id);
  });

  it('reads nothing before a file is measured', async () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 50 });
    const read = vi.fn(async (id: string) => current(id));
    const { result } = renderHook(() => useTextMatches(chapters, []), { wrapper: host(read) });
    await Promise.resolve();
    expect(result.current).toEqual({});
    expect(read).not.toHaveBeenCalled();
  });

  it('leaves a chapter whose check cannot be read without a figure, and keeps the others', async () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 4 });
    const read = vi.fn(async (id: string) => {
      if (id === chapters[1]!.id) throw new Error('the ledger is unreadable');
      return current(id);
    });
    const files = [passing('Chapter 01.wav'), passing('Chapter 02.wav')];
    const { result } = renderHook(() => useTextMatches(chapters, files), { wrapper: host(read) });
    await waitFor(() => expect(Object.keys(result.current)).toEqual([chapters[0]!.id]));
  });

  it('follows the check while Master stays open: a re-run updates the figure, a stale check drops it to no figure', async () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 3 });
    const id = chapters[0]!.id;
    let stored: CoverageResult = current(id);
    let notify: (state: CoverageState) => void = () => undefined;
    const api = {
      ...createMockApi(),
      coverageResult: async () => stored,
      subscribeCoverage: (listener: (state: CoverageState) => void) => {
        notify = listener;
        return () => undefined;
      },
    };
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const files = [passing('Chapter 01.wav')];
    const { result } = renderHook(() => useTextMatches(chapters, files), { wrapper });
    await waitFor(() => expect(result.current[id]).toEqual({ percent: 90, met: true }));

    // The check runs again and finds less: a running state changes nothing, the ended one is read.
    stored = { ...current(id), result: { bodyTokens: 100, presentTokens: 70 } as never, judgement: { ...current(id).judgement!, state: 'not_met' } };
    act(() => notify({ phase: 'running', percent: 10, message: '' }));
    act(() => notify({ phase: 'complete', percent: 100, message: '' }));
    await waitFor(() => expect(result.current[id]).toEqual({ percent: 70, met: false }));

    // The recording changes after that: the stored check is stale, so the figure goes ("Not checked") when the window comes back.
    stored = { chapterId: id, state: 'stale', reasons: ['item_trimmed'], result: stored.result, judgement: stored.judgement };
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current[id]).toBeUndefined());
  });
});
