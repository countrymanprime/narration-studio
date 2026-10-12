// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { EditCut } from '../../../api/contracts/editCuts';
import { TRIM_FADE_MS, useCleanupDeps } from './useCleanupDeps';

const wrapperFor = (
  setup: DawSetupId,
  patch?: (caps: (typeof DAW_SETUPS)[DawSetupId]) => (typeof DAW_SETUPS)[DawSetupId],
  chapterIds: string[] = ['5'],
  api = createMockApi(),
) => {
  const daw = createMockDawClient(patch ? patch(DAW_SETUPS[setup]) : DAW_SETUPS[setup], {
    chapterIds,
    candidateIds: [],
    findingIds: [],
    trimItems: { 'item-twice': { start: 10, length: 10 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw }}>{children}</PortOverrides>
    </ApiProvider>
  );
  return { daw, wrapper };
};

const NO_CUTS = { cuts: [], onCuts: () => undefined };

describe('useCleanupDeps', () => {
  it('lends reduce and repair only when the DAW reports range_gain and click_repair', async () => {
    const both = wrapperFor('reaper');
    const first = renderHook(() => useCleanupDeps(NO_CUTS), { wrapper: both.wrapper });
    await waitFor(() => expect(first.result.current).toBeDefined());
    expect(first.result.current?.reduce).toBeTypeOf('function');
    expect(first.result.current?.repair).toBeTypeOf('function');

    const reduceSpy = vi.spyOn(both.daw, 'reduceRangeGain');
    await first.result.current?.reduce?.({ chapterId: '5', takeId: 't', stretches: [{ start: 1, end: 1.4 }], reduceDb: 9 });
    expect(reduceSpy).toHaveBeenCalledWith({ chapterId: '5', takeId: 't', stretches: [{ start: 1, end: 1.4 }], reduceDb: 9 });

    const gainOnly = wrapperFor('reaper', (s) => ({
      ...s,
      capabilities: { ...s.capabilities, click_repair: { level: 'experimental', available: false, reason: 'turned_off', message: 'Off.' } },
    }));
    const second = renderHook(() => useCleanupDeps(NO_CUTS), { wrapper: gainOnly.wrapper });
    await waitFor(() => expect(second.result.current).toBeDefined());
    expect(second.result.current?.reduce).toBeTypeOf('function');
    expect(second.result.current?.repair).toBeUndefined();

    const neither = wrapperFor('reaper-off');
    const third = renderHook(() => useCleanupDeps(NO_CUTS), { wrapper: neither.wrapper });
    await waitFor(() => expect(third.result.current).toBeDefined());
    expect(third.result.current?.reduce).toBeUndefined();
    expect(third.result.current?.repair).toBeUndefined();
  });

  it('lends nothing until the DAW has answered, and nothing when it cannot', async () => {
    const { daw, wrapper } = wrapperFor('reaper');
    vi.spyOn(daw, 'capabilities').mockReturnValue(new Promise(() => {}));
    const pending = renderHook(() => useCleanupDeps(NO_CUTS), { wrapper });
    expect(pending.result.current).toBeUndefined();

    const failing = wrapperFor('reaper');
    vi.spyOn(failing.daw, 'capabilities').mockRejectedValue(new Error('x'));
    const failed = renderHook(() => useCleanupDeps(NO_CUTS), { wrapper: failing.wrapper });
    await new Promise((r) => setTimeout(r, 0));
    expect(failed.result.current).toBeUndefined();
  });

  it('trims a gap through the DAW: the item, its seconds and a short fade, as a cut of no words', async () => {
    const { daw, wrapper } = wrapperFor('reaper', undefined, ['chapter-1']);
    const spy = vi.spyOn(daw, 'trimRange');
    const { result } = renderHook(() => useCleanupDeps({ cuts: [], onCuts: () => undefined }), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    const answer = await result.current!.trim({ chapterId: 'chapter-1', itemGuid: 'item-twice', start: 12.5, end: 14, mode: 'mute' });
    expect(spy).toHaveBeenCalledWith({ chapterId: 'chapter-1', itemId: 'item-twice', start: 12.5, end: 14, fadeMs: TRIM_FADE_MS });
    expect(answer).toMatchObject({ ok: true, changed: true, undoSteps: 1 });
    const gone = await result.current!.trim({ chapterId: 'chapter-1', itemGuid: 'item-gone', start: 12.5, end: 14, mode: 'mute' });
    expect(gone).toMatchObject({ ok: false, changed: false, code: 'stale' });
  });

  it("record writes an accepted trim into the chapter's cuts", async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const chapterId = chapter!.id;
    const { wrapper } = wrapperFor('reaper', undefined, [chapterId], api);
    // A close cut of 1 s before the gap already moved it up: the record is in the recording's time before any cut.
    const earlier: EditCut = {
      id: 'cut0',
      chapterId,
      pid: '',
      keys: [],
      words: [],
      text: 'A gap of 1 s',
      a: 5,
      b: 6,
      off0: 5,
      off1: 6,
      mode: 'close',
      fadeMs: 6,
      daw: 'REAPER',
      guid: 'g0',
      undoSteps: 1,
      at: '2026-10-12T00:00:00Z',
      paragraph: null,
      stale: false,
    };
    const onCuts = vi.fn();
    const { result } = renderHook(() => useCleanupDeps({ cuts: [earlier], onCuts }), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    const trim = { chapterId, itemGuid: '{C0000001-0000-4000-8000-000000000001}', start: 11.2, end: 12.4, mode: 'mute' as const };
    await result.current!.record(trim, { ok: true, changed: true, message: 'Shortened the gap in REAPER.', undoSteps: 1 });

    const listed = (await api.editingCutsList(chapterId)).cuts;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      pid: '',
      keys: [],
      words: [],
      paragraph: null,
      stale: false,
      mode: 'close',
      fadeMs: TRIM_FADE_MS,
      daw: 'REAPER',
      undoSteps: 1,
    });
    expect(listed[0]!.a).toBeCloseTo(12.2);
    expect(listed[0]!.b).toBeCloseTo(13.4);
    expect(listed[0]!.text).toBe('A gap of 1.2 s');
    expect(onCuts).toHaveBeenCalledWith(listed);
  });

  it('record refuses a trim the DAW did not make, and a host refusal reaches the caller', async () => {
    const api = createMockApi();
    const { wrapper } = wrapperFor('reaper', undefined, ['no-such-chapter'], api);
    const onCuts = vi.fn();
    const { result } = renderHook(() => useCleanupDeps({ cuts: [], onCuts }), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    const trim = { chapterId: 'no-such-chapter', itemGuid: 'i', start: 1, end: 2, mode: 'mute' as const };
    await expect(result.current!.record(trim, { ok: true, changed: true, message: '', undoSteps: 1 })).rejects.toThrow('not in the manuscript');
    expect(onCuts).not.toHaveBeenCalled();
  });
});
