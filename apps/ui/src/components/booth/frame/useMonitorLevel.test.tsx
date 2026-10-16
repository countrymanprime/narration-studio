// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawMonitorLevel } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { useMonitorLevel } from './useMonitorLevel';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A DAW whose monitor level the test holds, with every call recorded and answers the test can delay, refuse or fail. */
function dawWith(initial = 60, start: { refuse?: string; fail?: string } = {}) {
  let held = initial;
  const calls: string[] = [];
  const control = {
    refuse: (start.refuse ?? null) as string | null,
    fail: (start.fail ?? null) as string | null,
    hold: null as Promise<void> | null,
    round: (n: number) => n,
  };
  const api = createMockApi({
    dawMonitorLevel: async (): Promise<DawMonitorLevel> => {
      calls.push('read');
      if (control.fail) throw new Error(control.fail);
      if (control.refuse) return { ok: false, level: 0, message: control.refuse };
      return { ok: true, level: held, message: '' };
    },
    dawSetMonitorLevel: async (level: number): Promise<DawMonitorLevel> => {
      calls.push(`set ${level}`);
      if (control.hold) await control.hold;
      if (control.fail) throw new Error(control.fail);
      if (control.refuse) return { ok: false, level: 0, message: control.refuse };
      held = control.round(level);
      return { ok: true, level: held, message: '' };
    },
  } as Partial<NarrationApi>);
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return { calls, control, hook: renderHook(() => useMonitorLevel(), { wrapper }), held: () => held };
}

describe('useMonitorLevel', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it('reads the level the DAW holds when it mounts, and is loading until it does', async () => {
    const { hook, calls } = dawWith(42);
    expect(hook.result.current.state).toEqual({ kind: 'loading' });
    await waitFor(() => expect(hook.result.current.state).toEqual({ kind: 'ready', level: 42, saving: false }));
    expect(calls).toEqual(['read']);
  });

  it("a drag is one call for the value it rests on, and the DAW's rounding is what the slider then shows", async () => {
    const { hook, calls, control } = dawWith();
    control.round = (n) => Math.round(n / 5) * 5;
    await waitFor(() => expect(hook.result.current.state.kind).toBe('ready'));
    act(() => {
      for (let level = 61; level <= 77; level++) hook.result.current.set(level);
    });
    expect(hook.result.current.state).toEqual({ kind: 'ready', level: 77, saving: true });
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(calls.filter((c) => c.startsWith('set'))).toEqual(['set 77']);
    await waitFor(() => expect(hook.result.current.state).toEqual({ kind: 'ready', level: 75, saving: false }));
  });

  it('moved again while a change is on its way: one call at a time, the newest value next, never out of order', async () => {
    const { hook, calls, control } = dawWith();
    await waitFor(() => expect(hook.result.current.state.kind).toBe('ready'));
    let release: () => void = () => {};
    control.hold = new Promise<void>((resolve) => (release = resolve));
    act(() => hook.result.current.set(10));
    await act(() => vi.advanceTimersByTimeAsync(150));
    act(() => hook.result.current.set(20));
    act(() => hook.result.current.set(30));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(calls.filter((c) => c.startsWith('set'))).toEqual(['set 10']);
    control.hold = null;
    await act(async () => release());
    await waitFor(() => expect(calls.filter((c) => c.startsWith('set'))).toEqual(['set 10', 'set 30']));
    await waitFor(() => expect(hook.result.current.state).toEqual({ kind: 'ready', level: 30, saving: false }));
  });

  it("a refused change goes back to the level the DAW confirmed and says why in the DAW's sentence", async () => {
    const { hook, control } = dawWith(55);
    await waitFor(() => expect(hook.result.current.state.kind).toBe('ready'));
    control.refuse = 'REAPER is not answering. Check that REAPER is open, then try again.';
    act(() => hook.result.current.set(90));
    await act(() => vi.advanceTimersByTimeAsync(200));
    await waitFor(() => expect(hook.result.current.state).toEqual({ kind: 'off', message: control.refuse, level: 55 }));
  });

  it('a call that fails is said, with the level it last confirmed, and the next try is not blocked', async () => {
    const { hook, control, calls } = dawWith(55);
    await waitFor(() => expect(hook.result.current.state.kind).toBe('ready'));
    control.fail = 'the bridge went away';
    act(() => hook.result.current.set(90));
    await act(() => vi.advanceTimersByTimeAsync(200));
    await waitFor(() =>
      expect(hook.result.current.state).toEqual({ kind: 'failed', message: 'The monitor level could not be changed: the bridge went away', level: 55 }),
    );
    control.fail = null;
    act(() => hook.result.current.set(80));
    await act(() => vi.advanceTimersByTimeAsync(200));
    await waitFor(() => expect(hook.result.current.state).toEqual({ kind: 'ready', level: 80, saving: false }));
    expect(calls.filter((c) => c.startsWith('set'))).toEqual(['set 90', 'set 80']);
  });

  it('a first read the DAW refuses says so in its sentence, and one that fails says so, instead of showing a level', async () => {
    const refused = dawWith(60, { refuse: 'REAPER is not connected to this app.' });
    await waitFor(() => expect(refused.hook.result.current.state).toEqual({ kind: 'off', message: 'REAPER is not connected to this app.', level: null }));
    cleanup();
    const failed = dawWith(60, { fail: 'no answer' });
    await waitFor(() =>
      expect(failed.hook.result.current.state).toEqual({ kind: 'failed', message: 'Could not read the monitor level: no answer', level: null }),
    );
  });

  it('reads again when the window is looked at, since the narrator can move the level in the DAW', async () => {
    const { hook, calls } = dawWith(60);
    await waitFor(() => expect(hook.result.current.state).toEqual({ kind: 'ready', level: 60, saving: false }));
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(calls.filter((c) => c === 'read')).toHaveLength(2));
  });

  it('leaving with a change waiting sends nothing and says nothing', async () => {
    const { hook, calls } = dawWith();
    await waitFor(() => expect(hook.result.current.state.kind).toBe('ready'));
    act(() => hook.result.current.set(5));
    hook.unmount();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls.filter((c) => c.startsWith('set'))).toEqual([]);
  });
});
