// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { chaptersOf } from '../../api/chaptersOf';
import type { ManuscriptChapter, ManuscriptChapterList } from '../../api/contracts/manuscript';
import { createMockApi } from '../../api/mockApi';
import { WPH } from './estimates';
import { useEffectiveWph } from './useEffectiveWph';

const chapter = (id: string, over: Partial<ManuscriptChapter> = {}): ManuscriptChapter => ({
  id,
  title: id,
  index: 0,
  wordCount: 2000,
  status: 'recording',
  contentKind: 'narration',
  recordedSeconds: 600,
  ...over,
});

const withList = (manuscriptChapters: () => Promise<ManuscriptChapterList>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <ApiProvider api={createMockApi({ manuscriptChapters })}>{children}</ApiProvider>;
  };

describe('useEffectiveWph: the pace is worked out from the shared chapter list', () => {
  it('counts the credits as narration chapters: with two of them measured the own rate has its three chapters', async () => {
    // 6000 words over 1800 s is 12,000 words per finished hour; the opening and closing credits are two of the three chapters.
    const list = [chapter('credits-opening', { isCredits: true }), chapter('c1'), chapter('credits-closing', { isCredits: true })];
    const { result } = renderHook(() => useEffectiveWph('own'), { wrapper: withList(async () => chaptersOf(list)) });
    await waitFor(() => expect(result.current).toBe(12_000));
  });

  it('leaves out a reference chapter and a chapter under a second of audio', async () => {
    // Three narration chapters measure 6000 words over 1800 s: 12,000 per hour. The reference chapter (9000 words, 600 s) would move it to 22,500 and the
    // half-second chapter is no length, so neither may count; a hook that ignored the list would give the standard rate instead.
    const list = [
      chapter('a'),
      chapter('b'),
      chapter('d'),
      chapter('ref', { contentKind: 'reference', wordCount: 9000 }),
      chapter('c', { recordedSeconds: 0.5 }),
    ];
    const { result } = renderHook(() => useEffectiveWph('own'), { wrapper: withList(async () => chaptersOf(list)) });
    await waitFor(() => expect(result.current).toBe(12_000));
  });

  it('is the standard rate while the list is unread', async () => {
    const { result } = renderHook(() => useEffectiveWph('own'), { wrapper: withList(() => new Promise<ManuscriptChapterList>(() => undefined)) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current).toBe(WPH);
  });

  it('is the standard rate when the list cannot be read', async () => {
    const { result } = renderHook(() => useEffectiveWph('own'), { wrapper: withList(() => Promise.reject(new Error('down'))) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current).toBe(WPH);
  });
});
