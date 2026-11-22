// @vitest-environment jsdom
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { StudioProvider, useStoreHandle } from '../../../studio/StudioProvider';
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

describe('useBoothData reads the chapter list from the store (#3658)', () => {
  const wrap =
    (api: NarrationApi) =>
    ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );

  it('shares the list with the other readers (one read), and a take reads it again', async () => {
    const api = { ...createMockApi(), manuscriptChapters: async () => CHAPTERS } as NarrationApi;
    const read = vi.spyOn(api, 'manuscriptChapters');
    const { result } = renderHook(() => ({ data: useBoothData(null), store: useStoreHandle() }), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.data.chapters).toBeDefined());
    await act(async () => result.current.store.ensure('chapters'));
    expect(read).toHaveBeenCalledTimes(1);
    act(() => result.current.data.refreshRecorded());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
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
    const { result } = renderHook(() => useBoothData(null), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.error).not.toBe(''));
    fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.chapters).toBeDefined());
    expect(result.current.error).toBe('');
  });

  it('a read the store dropped at a reset is read again, so the page opens on the project it is on and never on the one before', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let project: 'a' | 'b' = 'a';
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () => {
        if (project === 'a') await gate;
        return project === 'a' ? [{ ...CHAPTERS[0]!, id: 'a1' }] : [{ ...CHAPTERS[0]!, id: 'b1' }];
      },
    } as NarrationApi;
    const { result } = renderHook(() => ({ data: useBoothData(null), store: useStoreHandle() }), { wrapper: wrap(api) });
    project = 'b';
    act(() => result.current.store.reset());
    release();
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['b1']));
    expect(result.current.data.error).toBe('');
  });
  it('keeps the chapters it read when the store later lists them differently, and a take reads the list fresh over a held one', async () => {
    let list = [CHAPTERS[0]!];
    const api = { ...createMockApi(), manuscriptChapters: async () => list } as NarrationApi;
    const read = vi.spyOn(api, 'manuscriptChapters');
    const { result } = renderHook(() => ({ data: useBoothData(null), store: useStoreHandle() }), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['c1']));
    const before = result.current.data.chapters;
    list = [{ ...CHAPTERS[0]!, id: 'c1-renamed' }, CHAPTERS[1]!];
    await act(async () => result.current.store.load('chapters'));
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.data.chapters).toBe(before);
    act(() => result.current.data.refreshRecorded());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
  });
  it('opens on the list a re-read in flight answers, not the held one it replaces', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let list = [CHAPTERS[0]!, CHAPTERS[1]!];
    let slow = false;
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () => {
        if (slow) await gate;
        return list;
      },
    } as NarrationApi;
    let latest: ReturnType<typeof useBoothData> | undefined;
    let store: ReturnType<typeof useStoreHandle> | undefined;
    function BoothProbe() {
      latest = useBoothData(null);
      return null;
    }
    function Harness({ open }: { open: boolean }) {
      store = useStoreHandle();
      return open ? <BoothProbe /> : null;
    }
    const view = render(<Harness open={false} />, { wrapper: wrap(api) });
    // Another reader holds [c1, c2]; the host's list becomes [c2] and the store's re-read is out when the Booth opens.
    await act(async () => store!.ensure('chapters'));
    list = [CHAPTERS[1]!];
    slow = true;
    void store!.load('chapters');
    view.rerender(<Harness open />);
    await act(async () => {});
    expect(latest?.chapters).toBeUndefined();
    release();
    await waitFor(() => expect(latest?.chapters?.map((c) => c.id)).toEqual(['c2']));
  });
});
