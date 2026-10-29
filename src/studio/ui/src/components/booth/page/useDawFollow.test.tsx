// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawPlace } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { useFollowDawOnOpen, useMoveDawOnOpen } from './useDawFollow';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const answer = (over: Partial<DawPlace> = {}): DawPlace => ({ ok: true, message: '', chapterId: '', selected: 0, cursor: 0, ...over });
const refusal = answer({ ok: false, message: 'REAPER is not answering.' });
const moved = { ok: true, changed: true, message: '', undoSteps: 0 };

function wrapperFor(overrides: Partial<NarrationApi>) {
  const api = createMockApi(overrides);
  return ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
}

describe('useFollowDawOnOpen', () => {
  const chapterIds = ['c-1', 'c-2'];

  it('opens on the chapter whose track the narrator is on', async () => {
    const onChapter = vi.fn();
    const dawPlace = vi.fn(async () => answer({ chapterId: 'c-2', selected: 1, cursor: 30 }));
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    await waitFor(() => expect(onChapter).toHaveBeenCalledExactlyOnceWith('c-2'));
    expect(dawPlace).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no track selected', answer()],
    ['a track no chapter is linked to', answer({ selected: 1 })],
    ['a chapter the manuscript does not have', answer({ chapterId: 'c-9', selected: 1 })],
  ])('leaves the Booth where it opens for %s, and asks only once', async (_name, place) => {
    const onChapter = vi.fn();
    const dawPlace = vi.fn(async () => place);
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    await waitFor(() => expect(dawPlace).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(onChapter).not.toHaveBeenCalled();
    expect(dawPlace).toHaveBeenCalledTimes(1);
  });

  it('asks nothing while the address or the narrator has chosen a chapter, or the chapters are not read', async () => {
    const dawPlace = vi.fn(async () => answer({ chapterId: 'c-2' }));
    const onChapter = vi.fn();
    renderHook(() => useFollowDawOnOpen({ enabled: false, chapterIds, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds: undefined, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds: [], onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    await act(async () => {});
    expect(dawPlace).not.toHaveBeenCalled();
  });

  it('asks again while the DAW has not answered, then follows it once it does', async () => {
    vi.useFakeTimers();
    const onChapter = vi.fn();
    let calls = 0;
    const dawPlace = vi.fn(async () => (++calls < 3 ? refusal : answer({ chapterId: 'c-1', selected: 1 })));
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    await act(async () => {});
    expect(onChapter).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(onChapter).toHaveBeenCalledExactlyOnceWith('c-1');
    expect(dawPlace).toHaveBeenCalledTimes(3);
  });

  it('gives up silently when the DAW never answers, and treats a failed read as no answer', async () => {
    vi.useFakeTimers();
    const onChapter = vi.fn();
    const dawPlace = vi.fn(async () => {
      throw new Error('boom');
    });
    renderHook(() => useFollowDawOnOpen({ enabled: true, chapterIds, onChapter }), { wrapper: wrapperFor({ dawPlace }) });
    await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)));
    expect(onChapter).not.toHaveBeenCalled();
    const calls = dawPlace.mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(12);
  });

  it('stops asking once the narrator or the address chooses a chapter', async () => {
    vi.useFakeTimers();
    const dawPlace = vi.fn(async () => refusal);
    const onChapter = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useFollowDawOnOpen({ enabled, chapterIds, onChapter }), {
      initialProps: { enabled: true },
      wrapper: wrapperFor({ dawPlace }),
    });
    await act(async () => {});
    rerender({ enabled: false });
    const before = dawPlace.mock.calls.length;
    await act(async () => void (await vi.advanceTimersByTimeAsync(10_000)));
    expect(dawPlace).toHaveBeenCalledTimes(before);
  });
});

describe('useMoveDawOnOpen', () => {
  const base = { enabled: true, chapterId: 'c-1', canFollow: true, target: { where: 'end' } as const };

  it('moves the DAW to the end of the chapter, once', async () => {
    const dawGoToChapter = vi.fn(async () => moved);
    const say = vi.fn();
    const { rerender } = renderHook((props) => useMoveDawOnOpen({ ...props, say }), { initialProps: base, wrapper: wrapperFor({ dawGoToChapter }) });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledExactlyOnceWith('c-1', 'end', 0));
    rerender({ ...base, target: { where: 'end' } });
    await act(async () => {});
    expect(dawGoToChapter).toHaveBeenCalledTimes(1);
    expect(say).not.toHaveBeenCalled();
  });

  it('moves the DAW to the line the Booth opened at', async () => {
    const dawGoToChapter = vi.fn(async () => moved);
    renderHook(() => useMoveDawOnOpen({ ...base, target: { where: 'at', seconds: 41.5 }, say: vi.fn() }), { wrapper: wrapperFor({ dawGoToChapter }) });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledExactlyOnceWith('c-1', 'at', 41.5));
  });

  it('waits for the line to be known and for the DAW to be able to follow', async () => {
    const dawGoToChapter = vi.fn(async () => moved);
    const { rerender } = renderHook((props) => useMoveDawOnOpen({ ...props, say: vi.fn() }), {
      initialProps: { ...base, canFollow: false, target: null as { where: 'end' } | null },
      wrapper: wrapperFor({ dawGoToChapter }),
    });
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
    rerender({ ...base, canFollow: false, target: { where: 'end' } });
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
    rerender({ ...base, canFollow: true, target: { where: 'end' } });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledTimes(1));
  });

  it('moves nothing for a Booth that followed the DAW, or one with no chapter', async () => {
    const dawGoToChapter = vi.fn();
    renderHook(() => useMoveDawOnOpen({ ...base, enabled: false, say: vi.fn() }), { wrapper: wrapperFor({ dawGoToChapter }) });
    renderHook(() => useMoveDawOnOpen({ ...base, chapterId: '', say: vi.fn() }), { wrapper: wrapperFor({ dawGoToChapter }) });
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('says a refusal and a failed call', async () => {
    const refused = vi.fn(async () => ({ ok: false, changed: false, message: 'x', undoSteps: 0, refused: 'The track is gone.' }));
    const say = vi.fn();
    renderHook(() => useMoveDawOnOpen({ ...base, say }), { wrapper: wrapperFor({ dawGoToChapter: refused }) });
    await waitFor(() => expect(say).toHaveBeenCalledExactlyOnceWith('The track is gone.'));

    const failing = vi.fn(async () => {
      throw new Error('bridge down');
    });
    const sayFailure = vi.fn();
    renderHook(() => useMoveDawOnOpen({ ...base, say: sayFailure }), { wrapper: wrapperFor({ dawGoToChapter: failing }) });
    await waitFor(() => expect(sayFailure).toHaveBeenCalledTimes(1));
  });
});
