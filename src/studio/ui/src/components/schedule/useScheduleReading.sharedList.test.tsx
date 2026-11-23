// @vitest-environment jsdom
// The Schedule's chapter figures follow the shared chapter list the way the pace does: when another reader (a focus, an event, another page) makes the store read the
// list again, every figure on the page moves together, without the Schedule's own read; the page never shows an old copy of the list beside a figure from the new one.
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { createMockApi } from '../../api/mockApi';
import { createJournal } from '../../studio/journal/createJournal';
import { StudioProvider, useStoreHandle } from '../../studio/StudioProvider';
import { chapterList } from './scheduleKit.test';
import { useScheduleReading } from './useScheduleReading';

describe('useScheduleReading follows the shared chapter list', () => {
  it('moves the chapters and the recorded hours when the store reads the list again, with no read of its own', async () => {
    let list: ManuscriptChapter[] = chapterList(['recording', 'recording']).map((chapter) => ({ ...chapter, recordedSeconds: 1800 }));
    let listReads = 0;
    const api = createMockApi({
      manuscriptChapters: async () => {
        listReads += 1;
        return list;
      },
    });
    const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => ({ reading: useScheduleReading(new Date(2026, 9, 1), journal), store: useStoreHandle() }), { wrapper });
    await waitFor(() => expect(result.current.reading.state.phase).toBe('ready'));
    const first = result.current.reading.state;
    if (first.phase !== 'ready') throw new Error('not ready');
    expect(first.chapters).toHaveLength(2);
    expect(first.recordedHours).toBe(1);

    // Another page's reader makes the store read a list with a chapter removed and the other one longer.
    list = [{ ...list[0]!, recordedSeconds: 7200 }];
    const readsBefore = listReads;
    await act(async () => {
      await result.current.store.load('chapters');
    });
    const next = result.current.reading.state;
    if (next.phase !== 'ready') throw new Error('not ready');
    expect(next.chapters).toHaveLength(1);
    expect(next.recordedHours).toBe(2);
    // One read, the store's own: the Schedule did not read the list a second time to catch up.
    expect(listReads - readsBefore).toBe(1);
  });
});
