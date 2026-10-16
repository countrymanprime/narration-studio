// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { ApiProvider } from './api/ApiContext';
import { createDawMock, type DawMockSeed } from './api/dawMock';
import type { DawCapabilities } from './api/contracts/daw';
import { CAPABILITY_RETRY_MS, useCapability } from './useCapability';
import type { NarrationApi } from './types';

function wrapper(api: Pick<NarrationApi, 'dawCapabilities' | 'subscribeDawCapabilities'>) {
  return ({ children }: { children: ReactNode }) => createElement(ApiProvider, { api: api as NarrationApi, children });
}

describe('useCapability', () => {
  it('reads the entry for a known capability from the first dawCapabilities() answer', async () => {
    const api = createDawMock({ daw: 'REAPER', toggles: { punch: 'on' }, experimentalOn: true });
    const { result } = renderHook(() => useCapability('punch'), { wrapper: wrapper(api) });
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current.level).toBe('experimental');
  });

  it('follows a daw_capabilities_changed update for the same capability', async () => {
    let onUpdate: ((state: DawCapabilities) => void) | undefined;
    const seed: DawMockSeed = { daw: 'REAPER', toggles: { punch: 'off' } };
    const base = createDawMock(seed);
    const api: Pick<NarrationApi, 'dawCapabilities' | 'subscribeDawCapabilities'> = {
      dawCapabilities: base.dawCapabilities,
      subscribeDawCapabilities: (fn) => {
        onUpdate = fn;
        return base.subscribeDawCapabilities(fn);
      },
    };
    const { result } = renderHook(() => useCapability('punch'), { wrapper: wrapper(api) });
    await waitFor(() => expect(result.current.level).toBe('experimental'));
    expect(result.current.available).toBe(false);
    expect(result.current.message).toBe('Turned off in Settings.');

    act(() => {
      onUpdate?.({
        daw: 'REAPER',
        reachable: true,
        capabilities: { punch: { level: 'experimental', available: true } },
      });
    });
    await waitFor(() => expect(result.current.available).toBe(true));
  });

  it('treats an unknown capability as unsupported and unavailable', async () => {
    const api = createDawMock({ daw: 'REAPER' });
    // @ts-expect-error exercising a capability key the host report does not carry
    const { result } = renderHook(() => useCapability('not_a_real_capability'), { wrapper: wrapper(api) });
    await waitFor(() => expect(result.current).toEqual({ level: 'unsupported', available: false }));
  });

  it('unsubscribes on unmount', async () => {
    let unsubscribed = false;
    const base = createDawMock({ daw: 'REAPER' });
    const api: Pick<NarrationApi, 'dawCapabilities' | 'subscribeDawCapabilities'> = {
      dawCapabilities: base.dawCapabilities,
      subscribeDawCapabilities: (fn) => {
        const unsubscribe = base.subscribeDawCapabilities(fn);
        return () => {
          unsubscribed = true;
          unsubscribe();
        };
      },
    };
    const { result, unmount } = renderHook(() => useCapability('review'), { wrapper: wrapper(api) });
    await waitFor(() => expect(result.current.available).toBe(true));
    unmount();
    expect(unsubscribed).toBe(true);
  });
});

describe('useCapability heals itself when the first answer or an event is lost', () => {
  afterEach(() => vi.useRealTimers());
  const available: DawCapabilities = { daw: 'REAPER', reachable: true, capabilities: { punch: { level: 'experimental', available: true } } };

  it('a failed first read is retried on a timer until the DAW answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    const api = {
      dawCapabilities: async () => {
        calls += 1;
        if (calls < 3) throw new Error('not yet');
        return available;
      },
      subscribeDawCapabilities: () => () => {},
    };
    const { result } = renderHook(() => useCapability('punch'), { wrapper: wrapper(api) });
    await act(() => vi.advanceTimersByTimeAsync(CAPABILITY_RETRY_MS * 3));
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(calls).toBe(3);
  });

  it('re-reads when the window is focused again, so a lost event does not leave a stale answer', async () => {
    let truth: DawCapabilities = {
      daw: 'REAPER',
      reachable: false,
      capabilities: { punch: { level: 'experimental', available: false, reason: 'not_running', message: 'REAPER is not answering.' } },
    };
    const api = { dawCapabilities: async () => truth, subscribeDawCapabilities: () => () => {} };
    const { result } = renderHook(() => useCapability('punch'), { wrapper: wrapper(api) });
    await waitFor(() => expect(result.current.message).toBe('REAPER is not answering.'));
    truth = available;
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(result.current.available).toBe(true));
  });

  it('does not poll once it has an answer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    const api = { dawCapabilities: async () => (calls++, available), subscribeDawCapabilities: () => () => {} };
    const { result } = renderHook(() => useCapability('punch'), { wrapper: wrapper(api) });
    await waitFor(() => expect(result.current.available).toBe(true));
    const settled = calls;
    await act(() => vi.advanceTimersByTimeAsync(CAPABILITY_RETRY_MS * 5));
    expect(calls).toBe(settled);
  });

  it('a slow read that answers after an event does not undo the event', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let release: (value: DawCapabilities) => void = () => {};
    let emit: (next: DawCapabilities) => void = () => {};
    const api = {
      dawCapabilities: () => new Promise<DawCapabilities>((resolve) => (release = resolve)),
      subscribeDawCapabilities: (fn: (next: DawCapabilities) => void) => ((emit = fn), () => {}),
    };
    const { result } = renderHook(() => useCapability('punch'), { wrapper: wrapper(api) });
    act(() => emit(available));
    await waitFor(() => expect(result.current.available).toBe(true));
    release({ daw: 'REAPER', reachable: false, capabilities: { punch: { level: 'experimental', available: false, reason: 'not_running' } } });
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(result.current.available).toBe(true);
  });
});
