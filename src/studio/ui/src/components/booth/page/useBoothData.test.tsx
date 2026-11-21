// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StudioProvider } from '../../../studio/StudioProvider';
import { useChapters } from '../../../studio/useChapters';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { RecordedThrough } from '../../../api/contracts/manuscript';
import type { NarrationApi } from '../../../types';
import { CHAPTERS } from './testPage';
import { useBoothData } from './useBoothData';

const zero: RecordedThrough = { paragraphId: 'p2', word: 3, percent: 0, complete: false, source: 'booth', confident: true };

// T1 (qa delta): `recordedAt` pairs each chapter's `recordedThrough` with whether its track holds audio, from ONE read; `refreshRecorded` replaces the pairs together.
describe('useBoothData recordedAt', () => {
  it('after a take the audio flag comes from the same read as recordedThrough', async () => {
    const answer = { seconds: 0 };
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () =>
        CHAPTERS.map((chapter) => (chapter.id === 'c1' ? { ...chapter, recordedThrough: zero, recordedSeconds: answer.seconds } : chapter)),
    } as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result } = renderHook(() => useBoothData(null), { wrapper });
    await waitFor(() => expect(result.current.recordedAt['c1']).toEqual({ through: zero, audio: false }));
    answer.seconds = 12;
    act(() => result.current.refreshRecorded());
    await waitFor(() => expect(result.current.recordedAt['c1']).toEqual({ through: zero, audio: true }));
    expect(result.current.recorded['c1']).toBe(result.current.recordedAt['c1']!.through);
  });
});

describe('useBoothData under the store (#3658)', () => {
  it('shares the chapter list with the other readers instead of reading it again, and a take reads it now', async () => {
    const answer = { seconds: 0 };
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () =>
        CHAPTERS.map((chapter) => (chapter.id === 'c1' ? { ...chapter, recordedThrough: zero, recordedSeconds: answer.seconds } : chapter)),
    } as NarrationApi;
    const read = vi.spyOn(api, 'manuscriptChapters');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => ({ booth: useBoothData(null), other: useChapters() }), { wrapper });
    await waitFor(() => expect(result.current.booth.recordedAt['c1']).toEqual({ through: zero, audio: false }));
    await waitFor(() => expect(result.current.other.chapters).toBeDefined());
    expect(read).toHaveBeenCalledTimes(1);
    answer.seconds = 12;
    act(() => result.current.booth.refreshRecorded());
    await waitFor(() => expect(result.current.booth.recordedAt['c1']).toEqual({ through: zero, audio: true }));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('shows the error with Retry when the list cannot be read, and the chapters once Retry reads it', async () => {
    let fail = true;
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () => {
        if (fail) throw new Error('offline');
        return CHAPTERS;
      },
    } as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => useBoothData(null), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBe(''));
    expect(result.current.chapters).toBeUndefined();
    fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.chapters).toBeDefined());
    expect(result.current.error).toBe('');
  });
});
