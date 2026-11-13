// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { TeleprompterState } from '../../types';
import { claimListening, forgetListeningClaims } from './listening/listeningClaims';
import { useTeleprompterSession } from './useTeleprompterSession';

/**
 * #3409: a stop the host refuses, or never answers, leaves the listening session running behind the narrator's back. The hook sends it once more, and says
 * `stopFailed` after the second failure only: never for a stop that was let go of (an unmount), a session that ended meanwhile, or one that is not the
 * session the first stop meant.
 */

const IDLE: TeleprompterState = { phase: 'idle', message: '', engine: null, chapter: null, paused: false, coldRead: false, script: null, position: null };
const RUNNING: TeleprompterState = { ...IDLE, phase: 'running', chapter: 'c-0001', engine: 'whisper' };

type Answer = 'ok' | 'refuse' | 'hang';

function setup(answers: Answer[]) {
  let onState: (state: TeleprompterState) => void = () => {};
  const teleprompterStop = vi.fn(async () => {
    const answer = answers.shift() ?? 'ok';
    if (answer === 'hang') return new Promise<void>(() => {});
    if (answer === 'refuse') throw new Error('the host is busy');
  });
  const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
  const api = createMockApi({
    teleprompterStop,
    teleprompterStart,
    teleprompterState: async () => IDLE,
    subscribeTeleprompterState: (listener: (state: TeleprompterState) => void) => {
      onState = listener;
      return () => {};
    },
    subscribeTeleprompterEvent: () => () => {},
  } as never);
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  const hook = renderHook(() => useTeleprompterSession({ chapterId: 'c-0001', chapter: undefined, migrateLegacyDevice: false }), { wrapper });
  const state = (next: TeleprompterState) => act(() => onState(next));
  const elapse = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
  return { hook, teleprompterStop, teleprompterStart, state, elapse };
}

beforeEach(() => {
  vi.useFakeTimers();
  forgetListeningClaims();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a stop the host refuses', () => {
  it('is sent once more, and nothing is said when the second one is taken', async () => {
    const { hook, state, teleprompterStop, elapse } = setup(['refuse', 'ok']);
    await state(RUNNING);
    act(() => hook.result.current.stop());
    await elapse(100);
    expect(teleprompterStop).toHaveBeenCalledTimes(1);
    await elapse(2000);
    expect(teleprompterStop).toHaveBeenCalledTimes(2);
    expect(hook.result.current.stopFailed).toBe(false);
  });

  it('is said after the second refusal, not the first, and the stop is not sent a third time', async () => {
    const { hook, state, teleprompterStop, elapse } = setup(['refuse', 'refuse', 'ok']);
    await state(RUNNING);
    act(() => hook.result.current.stop());
    await elapse(100);
    expect(hook.result.current.stopFailed).toBe(false);
    await elapse(2000);
    expect(hook.result.current.stopFailed).toBe(true);
    await elapse(60_000);
    expect(teleprompterStop).toHaveBeenCalledTimes(2);
    // The raw refusal is not the narrator's sentence.
    expect(hook.result.current.error).toBe('');
  });

  it("counts a stop the host never answers as refused, after the host's own grace", async () => {
    const { hook, state, teleprompterStop, elapse } = setup(['hang', 'hang']);
    await state(RUNNING);
    act(() => hook.result.current.stop());
    await elapse(11_000);
    expect(teleprompterStop).toHaveBeenCalledTimes(1);
    expect(hook.result.current.stopFailed).toBe(false);
    await elapse(3000);
    expect(teleprompterStop).toHaveBeenCalledTimes(2);
    await elapse(13_000);
    expect(hook.result.current.stopFailed).toBe(true);
  });

  it('is not an error when the host says the session ended while the stop was out', async () => {
    const { hook, state, teleprompterStop, elapse } = setup(['hang']);
    await state(RUNNING);
    act(() => hook.result.current.stop());
    await elapse(100);
    await state({ ...IDLE, phase: 'stopped' });
    await elapse(60_000);
    expect(teleprompterStop).toHaveBeenCalledTimes(1);
    expect(hook.result.current.stopFailed).toBe(false);
  });

  it('is not sent again when the session ended during the wait', async () => {
    const { hook, state, teleprompterStop, elapse } = setup(['refuse']);
    await state(RUNNING);
    act(() => hook.result.current.stop());
    await elapse(100);
    await state({ ...IDLE, phase: 'stopped' });
    await elapse(5000);
    expect(teleprompterStop).toHaveBeenCalledTimes(1);
    expect(hook.result.current.stopFailed).toBe(false);
  });

  it('is not sent again once a newer session was asked for (it would end that one)', async () => {
    const { hook, state, teleprompterStop, teleprompterStart, elapse } = setup(['refuse', 'ok']);
    await state(RUNNING);
    act(() => hook.result.current.stop());
    await elapse(100);
    await act(async () => void (await hook.result.current.start()));
    expect(teleprompterStart).toHaveBeenCalledTimes(1);
    await elapse(5000);
    expect(teleprompterStop).toHaveBeenCalledTimes(1);
    expect(hook.result.current.stopFailed).toBe(false);
  });

  it('is not sent again while a press holds a claim on the session (a take joined it)', async () => {
    const { hook, state, teleprompterStop, elapse } = setup(['refuse', 'ok']);
    await state(RUNNING);
    act(() => hook.result.current.stop());
    await elapse(100);
    claimListening();
    await elapse(5000);
    expect(teleprompterStop).toHaveBeenCalledTimes(1);
    expect(hook.result.current.stopFailed).toBe(false);
  });

  it('is not sent again when a take joined the session after the refusal, with no claim (it would stop the take under its listening)', async () => {
    const { hook, state, teleprompterStop, elapse } = setup(['refuse', 'ok']);
    await state(RUNNING);
    act(() => hook.result.current.stop());
    await elapse(350);
    act(() => hook.result.current.sessionJoined());
    await elapse(5000);
    expect(teleprompterStop).toHaveBeenCalledTimes(1);
    expect(hook.result.current.stopFailed).toBe(false);
  });

  it('says nothing and is not sent again when the hook is gone (an unmount release is unknown, not failed)', async () => {
    const { hook, state, teleprompterStop, elapse } = setup(['refuse', 'refuse']);
    await state(RUNNING);
    act(() => hook.result.current.stop());
    await elapse(100);
    hook.unmount();
    await elapse(60_000);
    expect(teleprompterStop).toHaveBeenCalledTimes(1);
  });

  it('is cleared when the session ends, and when a new one starts', async () => {
    const { hook, state, elapse } = setup(['refuse', 'refuse']);
    await state(RUNNING);
    act(() => hook.result.current.stop());
    await elapse(3000);
    expect(hook.result.current.stopFailed).toBe(true);
    await state({ ...IDLE, phase: 'stopped' });
    expect(hook.result.current.stopFailed).toBe(false);
  });

  it('stopAndWait gives the retry its turn before the waiter is released, and a refusal twice still lets the take go on', async () => {
    const { hook, state, teleprompterStop, elapse } = setup(['refuse', 'refuse']);
    await state(RUNNING);
    let released = false;
    act(() => void hook.result.current.stopAndWait().then(() => (released = true)));
    await elapse(100);
    expect(released).toBe(false);
    await elapse(2000);
    expect(teleprompterStop).toHaveBeenCalledTimes(2);
    expect(released).toBe(true);
    expect(hook.result.current.stopFailed).toBe(true);
  });

  describe('Retry', () => {
    const failTwice = async (answers: Answer[]) => {
      const rig = setup(answers);
      await rig.state(RUNNING);
      act(() => rig.hook.result.current.stop());
      await rig.elapse(3000);
      expect(rig.hook.result.current.stopFailed).toBe(true);
      return rig;
    };

    it('sends the stop again, and says it again when that is refused twice', async () => {
      const { hook, teleprompterStop, elapse } = await failTwice(['refuse', 'refuse', 'refuse', 'refuse']);
      act(() => hook.result.current.retryStop());
      expect(hook.result.current.stopFailed).toBe(false);
      await elapse(3000);
      expect(teleprompterStop).toHaveBeenCalledTimes(4);
      expect(hook.result.current.stopFailed).toBe(true);
    });

    it('is in flight until the host answers, even a late 13 s answer, then says it stopped', async () => {
      const { hook, state, elapse } = await failTwice(['refuse', 'refuse', 'hang', 'ok']);
      act(() => hook.result.current.retryStop());
      expect(hook.result.current.stopRetry).toBe('trying');
      await elapse(12_000);
      expect(hook.result.current.stopRetry).toBe('trying');
      await elapse(2000);
      expect(hook.result.current.stopRetry).toBe('stopped');
      expect(hook.result.current.stopFailed).toBe(false);
      await state({ ...IDLE, phase: 'stopped' });
    });

    it('sent twice at once is sent once', async () => {
      const { hook, teleprompterStop, elapse } = await failTwice(['refuse', 'refuse', 'ok']);
      act(() => {
        hook.result.current.retryStop();
        hook.result.current.retryStop();
      });
      await elapse(3000);
      expect(teleprompterStop).toHaveBeenCalledTimes(3);
    });

    it('sends nothing when a newer session was asked for since', async () => {
      const { hook, teleprompterStop, elapse } = await failTwice(['refuse', 'refuse', 'ok']);
      await act(async () => void (await hook.result.current.start()));
      act(() => hook.result.current.retryStop());
      await elapse(3000);
      expect(teleprompterStop).toHaveBeenCalledTimes(2);
      expect(hook.result.current.stopFailed).toBe(false);
    });

    it('sends nothing when a press holds a claim on the session', async () => {
      const { hook, teleprompterStop, elapse } = await failTwice(['refuse', 'refuse', 'ok']);
      claimListening();
      act(() => hook.result.current.retryStop());
      await elapse(3000);
      expect(teleprompterStop).toHaveBeenCalledTimes(2);
      expect(hook.result.current.stopFailed).toBe(false);
    });

    it('is taken down by a press that joins the session (sessionJoined)', async () => {
      const { hook } = await failTwice(['refuse', 'refuse']);
      act(() => hook.result.current.sessionJoined());
      expect(hook.result.current.stopFailed).toBe(false);
    });

    it('from a sentence of an earlier hook sends nothing to a newer session', async () => {
      const rig = await failTwice(['refuse', 'refuse', 'ok']);
      rig.hook.unmount();
      act(() => rig.hook.result.current.retryStop());
      await rig.elapse(3000);
      expect(rig.teleprompterStop).toHaveBeenCalledTimes(2);
    });

    it('sends nothing when the session has ended', async () => {
      const { hook, state, teleprompterStop } = await failTwice(['refuse', 'refuse', 'ok']);
      await state({ ...IDLE, phase: 'stopped' });
      act(() => hook.result.current.retryStop());
      expect(teleprompterStop).toHaveBeenCalledTimes(2);
    });
  });
});
