// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { TeleprompterEvent, TeleprompterState } from '../../types';
import { useTeleprompterSession } from './useTeleprompterSession';

/**
 * A cold read (#2251 item 13) is the same listening session with no take: it starts with `coldRead`, its flags are never a take's,
 * and Record waits for it to end before it starts the take's own session.
 */

const IDLE: TeleprompterState = { phase: 'idle', message: '', engine: null, chapter: null, paused: false, coldRead: false, script: null, position: null };
const FLAG: TeleprompterEvent = { type: 'flag', id: 1, kind: 'skipped', start: 3, end: 5, heard: '' };

function setup() {
  let onState: (state: TeleprompterState) => void = () => {};
  let onEvent: (event: TeleprompterEvent) => void = () => {};
  const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
  const teleprompterStop = vi.fn(async () => {});
  const api = createMockApi({
    teleprompterStart,
    teleprompterStop,
    teleprompterState: async () => IDLE,
    subscribeTeleprompterState: (listener: (state: TeleprompterState) => void) => {
      onState = listener;
      return () => {};
    },
    subscribeTeleprompterEvent: (listener: (event: TeleprompterEvent) => void) => {
      onEvent = listener;
      return () => {};
    },
  } as never);
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  const hook = renderHook(() => useTeleprompterSession({ chapterId: 'c-0001', chapter: undefined, migrateLegacyDevice: false }), { wrapper });
  const state = (next: Partial<TeleprompterState>) => act(() => onState({ ...IDLE, chapter: 'c-0001', engine: 'whisper', ...next }));
  const event = (next: TeleprompterEvent) => act(() => onEvent(next));
  return { hook, teleprompterStart, teleprompterStop, state, event };
}

describe('a cold read', () => {
  it('asks the host for a cold read, from the word it is given', async () => {
    const { hook, teleprompterStart } = setup();
    await act(async () => {
      await hook.result.current.start({ coldRead: true, startWord: 40 });
    });
    expect(teleprompterStart).toHaveBeenCalledWith(expect.objectContaining({ chapter: 'c-0001', coldRead: true, startWord: 40 }));
  });

  it('starts a session for a take without the cold read key', async () => {
    const { hook, teleprompterStart } = setup();
    await act(async () => {
      await hook.result.current.start();
    });
    expect(teleprompterStart.mock.calls[0]).not.toEqual([expect.objectContaining({ coldRead: expect.anything() })]);
  });

  it('says it is one while the host does, and after it stops', async () => {
    const { hook, state } = setup();
    expect(hook.result.current.coldRead).toBe(false);
    await state({ phase: 'running', coldRead: true });
    expect(hook.result.current.coldRead).toBe(true);
    await state({ phase: 'stopped', coldRead: true });
    expect(hook.result.current.coldRead).toBe(true);
    await state({ phase: 'starting', coldRead: false });
    expect(hook.result.current.coldRead).toBe(false);
  });

  it('keeps the flags it hears away from every reader, during it and after it stops', async () => {
    const { hook, state, event } = setup();
    await state({ phase: 'running', coldRead: true });
    await event(FLAG);
    expect(hook.result.current.session.flags).toEqual([]);
    await state({ phase: 'stopped', coldRead: true });
    expect(hook.result.current.session.flags).toEqual([]);
  });

  it('leaves the flags of a session for a take alone', async () => {
    const { hook, state, event } = setup();
    await state({ phase: 'running' });
    await event(FLAG);
    expect(hook.result.current.session.flags).toHaveLength(1);
  });
});

describe('stopping and waiting', () => {
  it('answers once the host says the session has stopped', async () => {
    const { hook, state, teleprompterStop } = setup();
    await state({ phase: 'running', coldRead: true });
    let done = false;
    let waiting: Promise<void> = Promise.resolve();
    act(() => {
      waiting = hook.result.current.stopAndWait().then(() => {
        done = true;
      });
    });
    await waitFor(() => expect(teleprompterStop).toHaveBeenCalled());
    await state({ phase: 'stopping', coldRead: true });
    expect(done).toBe(false);
    await state({ phase: 'stopped', coldRead: true });
    await act(() => waiting);
    expect(done).toBe(true);
  });

  it('answers at once when nothing runs', async () => {
    const { hook, teleprompterStop } = setup();
    await act(() => hook.result.current.stopAndWait());
    expect(teleprompterStop).not.toHaveBeenCalled();
  });

  it('answers after a time when the host never says, so Record is never stuck behind it', async () => {
    vi.useFakeTimers();
    try {
      const { hook, state } = setup();
      await state({ phase: 'running', coldRead: true });
      let done = false;
      act(() => {
        void hook.result.current.stopAndWait().then(() => {
          done = true;
        });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
