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
  it('returns the recorded seconds and the stage of the read that gave recordedThrough', async () => {
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
    expect(result.current.chapter).toEqual({ status: CHAPTERS.find((chapter) => chapter.id === 'c1')?.status, recordedSeconds: 0 });
    // A session runs and ends; the take left 12 s on the track.
    rerender({ active: true });
    answer.seconds = 12;
    rerender({ active: false });
    await waitFor(() => expect(result.current.recorded).toEqual({ through: zero, audio: true }));
    // "This chapter" prints this value, so its "Recorded 0:12" and the notice's percent move together.
    expect(result.current.chapter?.recordedSeconds).toBe(12);
  });

  // H1 class guard with the "This chapter" test in CompanionThisChapter.test.tsx: every Companion read that runs more than once keeps what the first read drew when the second fails.
  it('keeps the first read when the read after a session ends fails', async () => {
    const reads = { count: 0 };
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () => {
        reads.count += 1;
        if (reads.count > 1) throw new Error('unreadable');
        return CHAPTERS.map((chapter) => (chapter.id === 'c1' ? { ...chapter, recordedThrough: zero, recordedSeconds: 12 } : chapter));
      },
    } as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result, rerender } = renderHook(({ active }) => useRecordedThrough('c1', active), { wrapper, initialProps: { active: false } });
    await waitFor(() => expect(result.current.reading).toBe(false));
    rerender({ active: true });
    rerender({ active: false });
    await waitFor(() => expect(reads.count).toBe(2));
    expect(result.current.recorded).toEqual({ through: zero, audio: true });
    expect(result.current.chapter?.recordedSeconds).toBe(12);
  });

  it('is null for a chapter the list does not have, and for a first read that fails; undefined while it is read', async () => {
    const missing = { ...createMockApi(), manuscriptChapters: async () => CHAPTERS } as NarrationApi;
    const wrap =
      (api: NarrationApi) =>
      ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const gone = renderHook(() => useRecordedThrough('no-such-chapter', false), { wrapper: wrap(missing) });
    expect(gone.result.current.chapter).toBeUndefined();
    await waitFor(() => expect(gone.result.current.reading).toBe(false));
    expect(gone.result.current.chapter).toBeNull();
    const failing = { ...createMockApi(), manuscriptChapters: async () => Promise.reject(new Error('unreadable')) } as NarrationApi;
    const failed = renderHook(() => useRecordedThrough('c1', false), { wrapper: wrap(failing) });
    await waitFor(() => expect(failed.result.current.reading).toBe(false));
    expect(failed.result.current.chapter).toBeNull();
  });
});
