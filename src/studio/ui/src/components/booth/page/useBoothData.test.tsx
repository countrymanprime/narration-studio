// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
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
