// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { NO_TRIM, useCleanupDeps } from './useCleanupDeps';

const wrapperFor = (setup: DawSetupId, patch?: (caps: (typeof DAW_SETUPS)[DawSetupId]) => (typeof DAW_SETUPS)[DawSetupId]) => {
  const daw = createMockDawClient(patch ? patch(DAW_SETUPS[setup]) : DAW_SETUPS[setup], { chapterIds: ['5'], candidateIds: [], findingIds: [] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw }}>{children}</PortOverrides>
    </ApiProvider>
  );
  return { daw, wrapper };
};

describe('useCleanupDeps', () => {
  it('lends reduce and repair only when the DAW reports range_gain and click_repair', async () => {
    const both = wrapperFor('reaper');
    const first = renderHook(() => useCleanupDeps(), { wrapper: both.wrapper });
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
    const second = renderHook(() => useCleanupDeps(), { wrapper: gainOnly.wrapper });
    await waitFor(() => expect(second.result.current).toBeDefined());
    expect(second.result.current?.reduce).toBeTypeOf('function');
    expect(second.result.current?.repair).toBeUndefined();

    const neither = wrapperFor('reaper-off');
    const third = renderHook(() => useCleanupDeps(), { wrapper: neither.wrapper });
    await waitFor(() => expect(third.result.current).toBeDefined());
    expect(third.result.current?.reduce).toBeUndefined();
    expect(third.result.current?.repair).toBeUndefined();
  });

  it('lends nothing until the DAW has answered, and nothing when it cannot', async () => {
    const { daw, wrapper } = wrapperFor('reaper');
    vi.spyOn(daw, 'capabilities').mockReturnValue(new Promise(() => {}));
    const pending = renderHook(() => useCleanupDeps(), { wrapper });
    expect(pending.result.current).toBeUndefined();

    const failing = wrapperFor('reaper');
    vi.spyOn(failing.daw, 'capabilities').mockRejectedValue(new Error('x'));
    const failed = renderHook(() => useCleanupDeps(), { wrapper: failing.wrapper });
    await new Promise((r) => setTimeout(r, 0));
    expect(failed.result.current).toBeUndefined();
  });

  it("refuses a gap trim with the sentence, because the host has no trim by item and the chapter's cuts hold only words", async () => {
    const { wrapper } = wrapperFor('reaper');
    const { result } = renderHook(() => useCleanupDeps(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    const trim = { chapterId: '5', itemGuid: 'item-1', start: 11.2, end: 12.4, mode: 'mute' as const };
    const answer = await result.current!.trim(trim);
    expect(answer).toMatchObject({ ok: false, changed: false, undoSteps: 0, refused: NO_TRIM });
    await expect(result.current!.record(trim, answer)).rejects.toThrow(NO_TRIM);
  });
});
