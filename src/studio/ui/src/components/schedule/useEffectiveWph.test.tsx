// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
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

const withList = (manuscriptChapters: () => Promise<ManuscriptChapter[]>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <ApiProvider api={createMockApi({ manuscriptChapters })}>{children}</ApiProvider>;
  };

describe('useEffectiveWph: the pace is worked out from the shared chapter list', () => {
  it('counts the credits as narration chapters: with two of them measured the own rate has its three chapters', async () => {
    // 6000 words over 1800 s is 12,000 words per finished hour; the opening and closing credits are two of the three chapters.
    const list = [chapter('credits-opening', { isCredits: true }), chapter('c1'), chapter('credits-closing', { isCredits: true })];
    const { result } = renderHook(() => useEffectiveWph('own'), { wrapper: withList(async () => list) });
    await waitFor(() => expect(result.current).toBe(12_000));
  });

  it('leaves out a reference chapter and a chapter under a second of audio', async () => {
    const list = [chapter('a'), chapter('b'), chapter('ref', { contentKind: 'reference' }), chapter('c', { recordedSeconds: 0.5 })];
    const { result } = renderHook(() => useEffectiveWph('own'), { wrapper: withList(async () => list) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current).toBe(WPH);
  });

  it('is the standard rate while the list is unread and when its read fails', async () => {
    const failing = renderHook(() => useEffectiveWph('own'), { wrapper: withList(() => Promise.reject(new Error('down'))) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(failing.result.current).toBe(WPH);
  });
});
