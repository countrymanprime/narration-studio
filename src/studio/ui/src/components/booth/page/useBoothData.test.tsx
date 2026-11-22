// @vitest-environment jsdom
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StudioProvider, useStoreHandle } from '../../../studio/StudioProvider';
import { useChapters } from '../../../studio/useChapters';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { RecordedThrough } from '../../../api/contracts/manuscript';
import type { ManuscriptChapter, NarrationApi } from '../../../types';
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

// The qa-breaker's breaks on the Booth's first move onto the store (#3658).
describe('useBoothData follows the store', () => {
  const chapter = (id: string, index: number): ManuscriptChapter =>
    ({ id, title: `Chapter ${id}`, index, wordCount: 10, status: 'not_started', contentKind: 'narration' }) as ManuscriptChapter;
  const provide = (api: NarrationApi) => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    return wrapper;
  };
  const booth = (api: NarrationApi) => renderHook(() => ({ data: useBoothData(null), store: useStoreHandle() }), { wrapper: provide(api) });
  const idle = { phase: 'idle' } as never;

  it("shows the new project's chapters, and opens on its first, after a project switch", async () => {
    let project: 'a' | 'b' = 'a';
    const lists = { a: [chapter('a1', 0), chapter('a2', 1)], b: [chapter('b1', 0)] };
    const api = { ...createMockApi(), manuscriptChapters: async () => lists[project], teleprompterState: async () => idle } as NarrationApi;
    const { result } = booth(api);
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['a1', 'a2']));
    project = 'b';
    act(() => result.current.store.reset());
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['b1']));
    await waitFor(() => expect(result.current.data.source).toEqual({ kind: 'chapter', chapter: expect.objectContaining({ id: 'b1' }) }));
  });

  it("shows the error when the new project's list cannot be read, and Retry shows its chapters", async () => {
    let project: 'a' | 'b' = 'a';
    let fail = false;
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () => {
        if (fail) throw new Error('offline');
        return project === 'a' ? [chapter('a1', 0)] : [chapter('b1', 0)];
      },
      teleprompterState: async () => idle,
    } as NarrationApi;
    const { result } = booth(api);
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['a1']));
    project = 'b';
    fail = true;
    act(() => result.current.store.reset());
    await waitFor(() => expect(result.current.data.error).not.toBe(''));
    expect(result.current.data.chapters).toBeUndefined();
    fail = false;
    act(() => result.current.data.retry());
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['b1']));
  });

  it('shows the error again when a Retry fails with the same Error instance', async () => {
    const offline = new Error('offline');
    const api = { ...createMockApi(), manuscriptChapters: async () => Promise.reject(offline), teleprompterState: async () => idle } as NarrationApi;
    const { result } = booth(api);
    await waitFor(() => expect(result.current.data.error).not.toBe(''));
    act(() => result.current.data.retry());
    await waitFor(() => expect(result.current.data.error).not.toBe(''));
    expect(result.current.data.chapters).toBeUndefined();
  });

  it('opens on the chapter the session state read by the Retry names, not the one read before it', async () => {
    let failList = true;
    let running: string | undefined = 'c2';
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () => {
        if (failList) throw new Error('offline');
        return CHAPTERS;
      },
      teleprompterState: async () => (running ? ({ phase: 'reading', chapter: running } as never) : idle),
    } as NarrationApi;
    const { result } = booth(api);
    await waitFor(() => expect(result.current.data.error).not.toBe(''));
    failList = false;
    running = undefined;
    act(() => result.current.data.retry());
    await waitFor(() => expect(result.current.data.source).toEqual({ kind: 'chapter', chapter: expect.objectContaining({ id: 'c1' }) }));
  });

  it('lists a chapter the store gained after the Booth opened, and keeps the list as it was when only a take moved', async () => {
    let list = [chapter('c1', 0)];
    const api = { ...createMockApi(), manuscriptChapters: async () => list, teleprompterState: async () => idle } as NarrationApi;
    const { result } = booth(api);
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['c1']));
    const before = result.current.data.chapters;
    list = [{ ...chapter('c1', 0), recordedSeconds: 12 } as ManuscriptChapter];
    await act(() => result.current.store.load('chapters'));
    expect(result.current.data.chapters).toBe(before);
    list = [chapter('c1', 0), chapter('c3', 1)];
    await act(() => result.current.store.load('chapters'));
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['c1', 'c3']));
  });

  it('shows the skeleton, not the old error, while a Booth opened on a failed list reads it again', async () => {
    let calls = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () => {
        calls += 1;
        if (calls === 1) throw new Error('offline');
        await gate;
        return CHAPTERS;
      },
      teleprompterState: async () => idle,
    } as NarrationApi;
    let latest: ReturnType<typeof useBoothData> | undefined;
    function Probe() {
      latest = useBoothData(null);
      return null;
    }
    function Page() {
      const store = useStoreHandle();
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            onClick={() =>
              void store
                .load('chapters')
                .catch(() => undefined)
                .then(() => setOpen(true))
            }
          >
            first read
          </button>
          {open ? <Probe /> : null}
        </>
      );
    }
    const view = render(<Page />, { wrapper: provide(api) });
    await act(async () => view.getByText('first read').click());
    await waitFor(() => expect(latest).toBeDefined());
    expect(latest?.error).toBe('');
    release();
    await waitFor(() => expect(latest?.chapters?.length).toBe(2));
    // The first read failed; opening the Booth made exactly one more, not two.
    expect(calls).toBe(2);
  });
  it('reports no unavailable chapter before the opening chapter is chosen', async () => {
    let answer = () => {};
    const gate = new Promise<void>((resolve) => (answer = resolve));
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () => CHAPTERS,
      teleprompterState: async () => {
        await gate;
        return idle;
      },
    } as NarrationApi;
    const seen: unknown[] = [];
    const { result } = renderHook(
      () => {
        const data = useBoothData(null);
        seen.push(data.unavailable);
        return data;
      },
      { wrapper: provide(api) },
    );
    await waitFor(() => expect(result.current.chapters).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.unavailable).toBeUndefined();
    answer();
    await waitFor(() => expect(result.current.source).toBeDefined());
    expect(seen.filter((item) => item !== undefined)).toEqual([]);
  });

  it('keeps the chapter on screen only while a take runs when a list change takes it out, and says it is gone once the take ends', async () => {
    let list = [chapter('c1', 0), chapter('c2', 1)];
    const api = { ...createMockApi(), manuscriptChapters: async () => list, teleprompterState: async () => idle } as NarrationApi;
    const { result } = renderHook(() => ({ data: useBoothData({ chapter: 'c1' }), store: useStoreHandle() }), { wrapper: provide(api) });
    await waitFor(() => expect(result.current.data.source).toEqual({ kind: 'chapter', chapter: expect.objectContaining({ id: 'c1' }) }));
    // Idle: a list that no longer has the chapter says so.
    list = [chapter('c2', 0)];
    await act(() => result.current.store.load('chapters'));
    await waitFor(() => expect(result.current.data.unavailable).toEqual({ kind: 'chapter' }));
    // A take runs on c1: it stays, and the address returning to it later does not draw the removed chapter.
    list = [chapter('c1', 0), chapter('c2', 1)];
    await act(() => result.current.store.load('chapters'));
    await waitFor(() => expect(result.current.data.source).toEqual({ kind: 'chapter', chapter: expect.objectContaining({ id: 'c1' }) }));
    act(() => result.current.data.hold(true));
    list = [chapter('c1-renamed', 0), chapter('c2', 1)];
    await act(() => result.current.store.load('chapters'));
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['c1-renamed', 'c2']));
    expect(result.current.data.source).toEqual({ kind: 'chapter', chapter: expect.objectContaining({ id: 'c1' }) });
    expect(result.current.data.unavailable).toBeUndefined();
    act(() => result.current.data.hold(false));
    list = [chapter('c1-renamed', 0), chapter('c2', 1), chapter('c3', 2)];
    await act(() => result.current.store.load('chapters'));
    await waitFor(() => expect(result.current.data.unavailable).toEqual({ kind: 'chapter' }));
  });

  it("shows a later project's failure and reads it on Retry while the old project's Retry read is still out", async () => {
    let project: 'a' | 'b' = 'a';
    let mode: 'ok' | 'hang' | 'fail' = 'ok';
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () => {
        if (mode === 'hang') return new Promise<never>(() => {});
        if (mode === 'fail') throw new Error('offline');
        return [chapter(`${project}1`, 0)];
      },
      teleprompterState: async () => idle,
    } as NarrationApi;
    const { result } = renderHook(() => ({ data: useBoothData(null), store: useStoreHandle() }), { wrapper: provide(api) });
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['a1']));
    mode = 'hang';
    act(() => result.current.data.retry());
    project = 'b';
    mode = 'fail';
    act(() => result.current.store.reset());
    await waitFor(() => expect(result.current.data.error).not.toBe(''));
    mode = 'ok';
    act(() => result.current.data.retry());
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['b1']));
  });
  it('shows a later failure while an earlier Retry read is still out, and a second Retry that fails', async () => {
    let mode: 'ok' | 'hang' | 'fail' = 'ok';
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () => {
        if (mode === 'hang') return new Promise<never>(() => {});
        if (mode === 'fail') throw new Error(`offline ${Math.random()}`);
        return [chapter('c1', 0)];
      },
      teleprompterState: async () => idle,
    } as NarrationApi;
    const { result } = renderHook(() => ({ data: useBoothData(null), store: useStoreHandle() }), { wrapper: provide(api) });
    await waitFor(() => expect(result.current.data.chapters).toBeDefined());
    mode = 'fail';
    act(() => result.current.store.reset());
    await waitFor(() => expect(result.current.data.error).not.toBe(''));
    mode = 'hang';
    act(() => result.current.data.retry());
    await waitFor(() => expect(result.current.data.error).toBe(''));
    // An event read fails while the Retry read is out: the failure shows.
    mode = 'fail';
    await act(() => result.current.store.load('chapters').catch(() => undefined));
    await waitFor(() => expect(result.current.data.error).not.toBe(''));
  });
  it('says the chapter is gone as soon as the take ends, with no list read after it', async () => {
    let list = [chapter('c1', 0), chapter('c2', 1)];
    const api = { ...createMockApi(), manuscriptChapters: async () => list, teleprompterState: async () => idle } as NarrationApi;
    const { result } = renderHook(() => ({ data: useBoothData({ chapter: 'c1' }), store: useStoreHandle() }), { wrapper: provide(api) });
    await waitFor(() => expect(result.current.data.source).toBeDefined());
    act(() => result.current.data.hold(true));
    list = [chapter('c2', 0)];
    await act(() => result.current.store.load('chapters'));
    expect(result.current.data.source).toEqual({ kind: 'chapter', chapter: expect.objectContaining({ id: 'c1' }) });
    act(() => result.current.data.hold(false));
    expect(result.current.data.source).toBeUndefined();
    expect(result.current.data.unavailable).toEqual({ kind: 'chapter' });
  });

  it('keeps the chapter of a running take through a project switch, and lets it go when the take ends', async () => {
    let project: 'a' | 'b' = 'a';
    const lists = { a: [chapter('c1', 0)], b: [chapter('b1', 0)] };
    const api = { ...createMockApi(), manuscriptChapters: async () => lists[project], teleprompterState: async () => idle } as NarrationApi;
    const { result } = renderHook(() => ({ data: useBoothData({ chapter: 'c1' }), store: useStoreHandle() }), { wrapper: provide(api) });
    await waitFor(() => expect(result.current.data.source).toBeDefined());
    act(() => result.current.data.hold(true));
    project = 'b';
    act(() => result.current.store.reset());
    await waitFor(() => expect(result.current.data.chapters?.map((c) => c.id)).toEqual(['b1']));
    expect(result.current.data.source).toEqual({ kind: 'chapter', chapter: expect.objectContaining({ id: 'c1' }) });
    act(() => result.current.data.hold(false));
    expect(result.current.data.source).toBeUndefined();
  });

  it('shows the skeleton for a second Retry while the first read is still out', async () => {
    let mode: 'fail' | 'hang' = 'fail';
    const api = {
      ...createMockApi(),
      manuscriptChapters: async () => {
        if (mode === 'hang') return new Promise<never>(() => {});
        throw new Error(`offline ${Math.random()}`);
      },
      teleprompterState: async () => idle,
    } as NarrationApi;
    const { result } = renderHook(() => ({ data: useBoothData(null), store: useStoreHandle() }), { wrapper: provide(api) });
    await waitFor(() => expect(result.current.data.error).not.toBe(''));
    mode = 'hang';
    act(() => result.current.data.retry());
    await waitFor(() => expect(result.current.data.error).toBe(''));
    mode = 'fail';
    await act(() => result.current.store.load('chapters').catch(() => undefined));
    await waitFor(() => expect(result.current.data.error).not.toBe(''));
    mode = 'hang';
    act(() => result.current.data.retry());
    await waitFor(() => expect(result.current.data.error).toBe(''));
  });
});
