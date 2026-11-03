// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { makeChapters } from '../../../fixtures/chapters';
import type { CoverageResult } from '../../../types';
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
});
