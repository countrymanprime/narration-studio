// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChapterSyncBatch, ChapterSyncState } from '../../api/contracts/chapterSync';
import { useChapterSyncToast } from './useChapterSyncToast';

const state = (batch: ChapterSyncBatch | null = null): ChapterSyncState => ({
  consent: 'on',
  decidedAt: '2026-09-24T09:00:00Z',
  ask: false,
  manuscript: true,
  dawLinked: true,
  project: 'ready',
  message: '',
  projectFile: 'Alice.rpp',
  savedAt: '2026-09-24T09:00:00Z',
  lastSync: '2026-09-24T09:00:00Z',
  counts: { linked: 1, needsYou: 0, noTrack: 0, unmatched: 0, pickupTracks: 0 },
  batch,
  unsavedEdits: false,
  activity: [],
  chapters: [],
  background: { enabled: true, wait: 'nothing' },
});

const batch = (at: string, ...guids: string[]): ChapterSyncBatch => ({
  at,
  trigger: 'daw-link',
  linked: guids.map((trackGuid, i) => ({ trackGuid, chapterId: `c${i + 1}`, chapterTitle: `Chapter ${i + 1}` })) as ChapterSyncBatch['linked'],
  newTracks: [],
});

function setup(initial: ChapterSyncState, trackName: (guid: string) => string | undefined = (guid) => `Track ${guid}`) {
  const subscribers = new Set<(next: ChapterSyncState) => void>();
  const api = {
    chapterSyncState: vi.fn().mockResolvedValue(initial),
    subscribeChapterSync: vi.fn((fn: (next: ChapterSyncState) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }),
    chapterSyncUndo: vi.fn().mockResolvedValue(undefined),
  };
  const notify = vi.fn();
  const onState = vi.fn();
  const view = renderHook(() => useChapterSyncToast({ api, notify, trackName, onState }));
  return { api, notify, onState, view, publish: (next: ChapterSyncState) => act(() => subscribers.forEach((fn) => fn(next))), subscribers };
}

describe('useChapterSyncToast', () => {
  it('toasts once per batch that linked something, with Undo', async () => {
    const { notify, view, publish } = setup(state(batch('t1', 'g1')));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledWith('Linked track “Track g1” to Chapter 1.', 'info', { label: 'Undo', onAction: expect.any(Function) }, expect.anything());
    view.rerender();
    publish(state(batch('t1', 'g1')));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('does not toast a batch that linked nothing, or no batch', async () => {
    const { notify, api, publish } = setup(state(batch('t1')));
    await waitFor(() => expect(api.chapterSyncState).toHaveBeenCalled());
    publish(state(null));
    expect(notify).not.toHaveBeenCalled();
  });

  it('undoes every link in the batch, and shows an error toast when one fails', async () => {
    const { notify, api } = setup(state(batch('t1', 'g1', 'g2')));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    notify.mock.calls[0][2].onAction();
    expect(api.chapterSyncUndo.mock.calls).toEqual([['g1'], ['g2']]);
    api.chapterSyncUndo.mockRejectedValueOnce(new Error('boom'));
    notify.mock.calls[0][2].onAction();
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('boom'), 'error'));
  });

  it('names the track when the caller finds it, and the chapter alone when not', async () => {
    const { notify } = setup(state(batch('t1', 'g1')), () => undefined);
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify.mock.calls[0][0]).toBe('Linked a track to Chapter 1.');
  });

  it('seeds on the first state and calls onState once per later state', async () => {
    const { onState, api, publish } = setup(state());
    await waitFor(() => expect(api.chapterSyncState).toHaveBeenCalled());
    await act(async () => {});
    expect(onState).not.toHaveBeenCalled();
    publish(state());
    expect(onState).toHaveBeenCalledTimes(1);
    publish(state());
    expect(onState).toHaveBeenCalledTimes(2);
  });

  it('calls onState zero times when the state object has not changed', async () => {
    const { onState, view, api } = setup(state());
    await waitFor(() => expect(api.chapterSyncState).toHaveBeenCalled());
    await act(async () => {});
    view.rerender();
    view.rerender();
    expect(onState).not.toHaveBeenCalled();
  });

  it('releases the subscription on unmount', async () => {
    const { view, subscribers } = setup(state());
    expect(subscribers.size).toBe(1);
    view.unmount();
    expect(subscribers.size).toBe(0);
  });
});
