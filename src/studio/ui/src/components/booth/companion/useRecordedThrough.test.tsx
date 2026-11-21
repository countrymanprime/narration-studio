// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { RecordedThrough } from '../../../api/contracts/manuscript';
import type { NarrationApi } from '../../../types';
import { CHAPTERS } from '../page/testPage';
import { useRecordedThrough } from './useRecordedThrough';

const zero: RecordedThrough = { paragraphId: 'p2', word: 3, percent: 0, complete: false, source: 'booth', confident: true };

// T1 (qa delta): the hook returns the through and whether the track holds audio from the SAME read, so a read after a session ends can never pair a new through with an old audio flag.
describe('useRecordedThrough', () => {
  it('returns the recorded seconds of the read that gave recordedThrough', async () => {
    const answer = { seconds: 0 };
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () =>
        CHAPTERS.map((chapter) => (chapter.id === 'c1' ? { ...chapter, recordedThrough: zero, recordedSeconds: answer.seconds } : chapter)),
    } as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result, rerender } = renderHook(({ active }) => useRecordedThrough('c1', active), { wrapper, initialProps: { active: false } });
    await waitFor(() => expect(result.current.reading).toBe(false));
    expect(result.current.recorded).toEqual({ through: zero, audio: false });
    // A session runs and ends; the take left 12 s on the track.
    rerender({ active: true });
    answer.seconds = 12;
    rerender({ active: false });
    await waitFor(() => expect(result.current.recorded).toEqual({ through: zero, audio: true }));
  });
});
