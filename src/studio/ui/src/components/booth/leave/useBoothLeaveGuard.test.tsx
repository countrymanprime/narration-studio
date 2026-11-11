// @vitest-environment jsdom
import { renderHook, act, render, screen } from '@testing-library/react';
import { OverlayHost } from '../../../overlay/OverlayHost';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLeaveGuard } from '../../../studio/journal/leaveGuard';
import { createOverlayService } from '../../../overlay/overlayService';
import type { DawResult } from '../../../api/contracts/daw';
import { LEAVE_WAIT_MS, useBoothLeaveGuard, type BoothLeaveSession } from './useBoothLeaveGuard';

const ok: DawResult = { ok: true, changed: true, message: 'Stopped.', undoSteps: 0 };
const setup = (over: Partial<BoothLeaveSession> = {}, stop: () => Promise<DawResult> = async () => ok) => {
  const store = createLeaveGuard();
  const overlay = createOverlayService();
  const stopRecording = vi.fn(stop);
  const go = vi.fn();
  const session: BoothLeaveSession = { recording: true, daw: { name: 'REAPER' }, stopRecording, ...over };
  const hook = renderHook((s: BoothLeaveSession) => useBoothLeaveGuard(s, { guard: store, overlay }), { initialProps: session });
  const dialog = () =>
    overlay.getSnapshot().dialogs[0] as { spec: { title: string; body: string; confirmLabel: string }; answer: (c: boolean) => void } | undefined;
  return { store, overlay, stopRecording, go, hook, session, dialog };
};
const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

describe('useBoothLeaveGuard', () => {
  it('no-question-when-nothing-records', () => {
    const { store, hook, session } = setup({ recording: false });
    expect(store.checkLeave('/proof')).toBe('allow');
    expect(store.checkLeave('/script')).toBe('allow');
    hook.unmount();
    expect(session.recording).toBe(false);
  });

  it('recording-asks-stop-recording, naming the DAW from the report', () => {
    const { store } = setup({ daw: { name: 'Audacity' } });
    expect(store.checkLeave('/proof')).toEqual({
      decide: expect.any(Function),
      ask: {
        title: 'Stop recording?',
        body: 'Audacity is recording. Leaving the Booth stops it.',
        confirmLabel: 'Stop and leave',
        cancelLabel: 'Keep recording',
        safeDefault: true,
      },
    });
  });

  it('names the built-in recorder', () => {
    const { store } = setup({ daw: { name: 'the built-in recorder' } });
    expect(store.checkLeave('/x')).toMatchObject({ ask: { body: 'The built-in recorder is recording. Leaving the Booth stops it.' } });
  });

  it('keep-recording-stays-and-changes-nothing; the-take-is-held-while-the-question-is-open', async () => {
    const { overlay, stopRecording, go, hook, dialog } = setup();
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = hook.result.current.leave('/proof', go);
    });
    expect(dialog()?.spec.title).toBe('Stop recording?');
    // The page's own question names its way out as the mock does, as the shell's does.
    expect(dialog()?.spec).toMatchObject({ cancelLabel: 'Keep recording' });
    expect(stopRecording).not.toHaveBeenCalled();
    act(() => dialog()!.answer(false));
    await act(() => done);
    expect(stopRecording).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
    expect(overlay.getSnapshot().dialogs).toHaveLength(0);
  });

  it('stop-and-leave-stops-then-replays-the-navigation', async () => {
    const order: string[] = [];
    const { stopRecording, go, hook, dialog } = setup({}, async () => {
      order.push('stop');
      return ok;
    });
    go.mockImplementation(() => order.push('go'));
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = hook.result.current.leave('/script', go);
    });
    act(() => dialog()!.answer(true));
    await act(() => done);
    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith('/script');
    expect(order).toEqual(['stop', 'go']);
  });

  it('a-leave-mid-take-flushes-the-run: a confirmed stop flushes the passage map after the stop and before the navigation', async () => {
    const order: string[] = [];
    const flushRun = vi.fn(async () => {
      order.push('flush');
    });
    const { go, hook, dialog } = setup({ flush: flushRun }, async () => {
      order.push('stop');
      return ok;
    });
    go.mockImplementation(() => order.push('go'));
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = hook.result.current.leave('/script', go);
    });
    act(() => dialog()!.answer(true));
    await act(() => done);
    expect(order).toEqual(['stop', 'flush', 'go']);
  });

  it('a-leave-mid-take-flushes-the-run: nothing is flushed when the stop is refused, the question is declined, or the app did not start the take', async () => {
    const refusal: DawResult = { ok: false, changed: false, message: 'No.', undoSteps: 0, refused: 'No.' };
    const refused = setup({ flush: vi.fn(async () => {}) }, async () => refusal);
    let a: Promise<void> = Promise.resolve();
    act(() => {
      a = refused.hook.result.current.leave('/script', refused.go);
    });
    act(() => refused.dialog()!.answer(true));
    await flush();
    await flush();
    act(() => refused.dialog()!.answer(false));
    await act(() => a);
    expect(refused.session.flush).not.toHaveBeenCalled();

    const foreign = setup({ startedByApp: false, flush: vi.fn(async () => {}) });
    let b: Promise<void> = Promise.resolve();
    act(() => {
      b = foreign.hook.result.current.leave('/script', foreign.go);
    });
    act(() => foreign.dialog()!.answer(true));
    await act(() => b);
    expect(foreign.go).toHaveBeenCalledWith('/script');
    expect(foreign.session.flush).not.toHaveBeenCalled();
  });

  it('a refused stop keeps the question open with the host sentence and does not leave', async () => {
    const refusal: DawResult = { ok: false, changed: false, message: 'REAPER would not stop.', undoSteps: 0, refused: 'REAPER would not stop.' };
    const { go, hook, dialog, stopRecording } = setup({}, async () => refusal);
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = hook.result.current.leave('/script', go);
    });
    act(() => dialog()!.answer(true));
    await flush();
    await flush();
    expect(dialog()?.spec.body).toContain('REAPER would not stop.');
    expect(dialog()?.spec.confirmLabel).toBe('Leave anyway');
    expect(go).not.toHaveBeenCalled();
    act(() => dialog()!.answer(false));
    await act(() => done);
    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
  });

  it('a refused stop does not trap the narrator: Leave anyway goes without a second stop', async () => {
    const refusal: DawResult = { ok: false, changed: false, message: 'REAPER is not answering.', undoSteps: 0, refused: 'REAPER is not answering.' };
    const { go, hook, dialog, stopRecording } = setup({}, async () => refusal);
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = hook.result.current.leave('/script', go);
    });
    act(() => dialog()!.answer(true));
    await flush();
    await flush();
    act(() => dialog()!.answer(true));
    await act(() => done);
    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith('/script');
  });

  it('asked-once: a second exit does not stack a dialog', async () => {
    const { overlay, go, hook, dialog } = setup();
    let a: Promise<void> = Promise.resolve();
    let b: Promise<void> = Promise.resolve();
    act(() => {
      a = hook.result.current.leave('/proof', go);
      b = hook.result.current.leave('/proof', go);
    });
    expect(overlay.getSnapshot().dialogs).toHaveLength(1);
    act(() => dialog()!.answer(true));
    await act(async () => {
      await Promise.all([a, b]);
    });
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith('/proof');
  });

  it('leave goes straight through when nothing records', async () => {
    const { overlay, go, hook } = setup({ recording: false });
    await act(() => hook.result.current.leave('/proof', go));
    expect(go).toHaveBeenCalledWith('/proof');
    expect(overlay.getSnapshot().dialogs).toHaveLength(0);
  });

  it('guard-is-removed-when-the-booth-unmounts-or-recording-ends', () => {
    const { store, hook, session } = setup();
    expect(store.checkLeave('/x')).not.toBe('allow');
    hook.rerender({ ...session, recording: false });
    expect(store.checkLeave('/x')).toBe('allow');
    hook.rerender(session);
    expect(store.checkLeave('/x')).not.toBe('allow');
    hook.unmount();
    expect(store.checkLeave('/x')).toBe('allow');
  });

  it('only-the-app-started-recording-is-stopped', async () => {
    const { store, stopRecording, go, hook, dialog } = setup({ startedByApp: false });
    expect(store.checkLeave('/x')).toMatchObject({ ask: { body: expect.stringContaining('keeps recording') } });
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = hook.result.current.leave('/x', go);
    });
    act(() => dialog()!.answer(true));
    await act(() => done);
    expect(stopRecording).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith('/x');
  });

  // #3325: the page's own stop is skipped only for the take the narrator answered for.
  const decideYes = async (hook: ReturnType<typeof setup>['hook'], dialog: ReturnType<typeof setup>['dialog']) => {
    let result: boolean | undefined;
    act(() => void hook.result.current.decide().then((value) => (result = value)));
    act(() => dialog()!.answer(true));
    await flush();
    await flush();
    return () => result;
  };

  it('a take answered for is handled; a take that starts after the yes is not, though the page is still leaving', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { hook, dialog, session } = setup({ flush: () => gate });
    const result = await decideYes(hook, dialog);
    // The stop landed and the map's run is still being written: the Booth shows Record, and a new take begins.
    hook.rerender({ ...session, recording: false });
    hook.rerender({ ...session, recording: true });
    release();
    await flush();
    await flush();
    expect(result()).toBe(true);
    expect(hook.result.current.leaving()).toBe(true);
    expect(hook.result.current.handled()).toBe(false);
  });

  it('with no new take the answered take is handled', async () => {
    const { hook, dialog } = setup();
    await decideYes(hook, dialog);
    expect(hook.result.current.handled()).toBe(true);
  });

  it('a take the app did not start is left running with no stop, and is handled', async () => {
    const { hook, dialog, stopRecording } = setup({ startedByApp: false });
    await decideYes(hook, dialog);
    expect(stopRecording).not.toHaveBeenCalled();
    expect(hook.result.current.handled()).toBe(true);
  });

  it('the refusal question is armed against a double-click on the button it replaced', async () => {
    const refusal: DawResult = { ok: false, changed: false, message: 'No.', undoSteps: 0, refused: 'No.' };
    const { hook, dialog } = setup({}, async () => refusal);
    act(() => void hook.result.current.decide());
    act(() => dialog()!.answer(true));
    await flush();
    await flush();
    expect(dialog()?.spec.title).toBe('Could not stop the take');
    expect((dialog()!.spec as { armAfterMs?: number }).armAfterMs).toBeGreaterThan(0);
  });

  it('a second exit while the first one is being flushed asks nothing and moves nowhere', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { store, hook, dialog, go, session } = setup({ flush: () => gate });
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = hook.result.current.leave('/script', go);
    });
    act(() => dialog()!.answer(true));
    await flush();
    await flush();
    // The stop landed (the Booth reads no take) and the run is still being written.
    hook.rerender({ ...session, recording: false });
    const second = vi.fn();
    let secondDone: Promise<void> = Promise.resolve();
    act(() => {
      secondDone = hook.result.current.leave('/settings', second);
    });
    expect(second).not.toHaveBeenCalled();
    const verdict = store.checkLeave('/settings');
    expect(verdict).not.toBe('allow');
    let shellMoved: boolean | undefined;
    let shellDone: Promise<void> = Promise.resolve();
    if (verdict !== 'allow')
      act(() => {
        shellDone = verdict.decide!().then((value) => void (shellMoved = value));
      });
    expect(go).not.toHaveBeenCalled();
    release();
    await act(() => first);
    await act(() => Promise.all([secondDone, shellDone]));
    expect(shellMoved).toBe(false);
    expect(second).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith('/script');
  });

  it('a start still out when the question is answered is waited for, and stopped once it landed; one that did not start a take stops nothing', async () => {
    let landed!: (took: boolean) => void;
    const settle = vi.fn(() => new Promise<boolean>((resolve) => (landed = resolve)));
    const a = setup({ settle });
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = a.hook.result.current.leave('/script', a.go);
    });
    act(() => a.dialog()!.answer(true));
    await flush();
    expect(a.stopRecording).not.toHaveBeenCalled();
    landed(true);
    await act(() => done);
    expect(a.stopRecording).toHaveBeenCalledTimes(1);

    const b = setup({ settle: async () => false });
    act(() => {
      done = b.hook.result.current.leave('/script', b.go);
    });
    act(() => b.dialog()!.answer(true));
    await act(() => done);
    expect(b.stopRecording).not.toHaveBeenCalled();
    expect(b.go).toHaveBeenCalledWith('/script');
  });

  // An answer that never comes must not trap the narrator: each wait ends, in the refusal question (or, for the run, in leaving), and asking is cleared.
  describe('an answer that never comes (fake timers)', () => {
    const never = () => new Promise<never>(() => {});
    const yesAndWait = async (over: Partial<BoothLeaveSession>, stop?: () => Promise<DawResult>) => {
      vi.useFakeTimers();
      const t = setup(over, stop);
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = t.hook.result.current.leave('/script', t.go);
      });
      act(() => t.dialog()!.answer(true));
      await flush();
      // The narrator sees that the take is being stopped.
      expect(t.overlay.getSnapshot().toasts.map((toast) => toast.text)).toContain('Stopping the take…');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LEAVE_WAIT_MS + 50);
      });
      return { ...t, done: () => done };
    };
    afterEach(() => vi.useRealTimers());

    // The message that says a stop is pending stays for as long as it is (past the usual five seconds of a toast), and goes when the wait ends.
    // Drawn by the host, which is what ends a toast at its time.
    const stoppingShown = () => screen.queryByText('Stopping the take…') !== null;
    for (const [name, over, stop, firstWaitEnds] of [
      ['a hung stop', {}, never, LEAVE_WAIT_MS],
      [
        'a hung start, then a hung stop',
        { settle: async () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), LEAVE_WAIT_MS - 100)) },
        never,
        2 * LEAVE_WAIT_MS,
      ],
      ['a hung run', { flush: never }, undefined, LEAVE_WAIT_MS],
    ] as const) {
      it(`the "Stopping the take…" message is still up at 7 s and goes when the wait ends: ${name}`, async () => {
        vi.useFakeTimers();
        const t = setup(over as Partial<BoothLeaveSession>, stop);
        render(<OverlayHost service={t.overlay} />);
        act(() => void t.hook.result.current.leave('/script', t.go));
        act(() => t.dialog()!.answer(true));
        await flush();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(7000);
        });
        expect(stoppingShown()).toBe(true);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(firstWaitEnds + 200);
        });
        expect(stoppingShown()).toBe(false);
      });
    }

    it('a stop that never answers ends in "Could not stop the take", with Leave anyway, and asking is cleared', async () => {
      const t = await yesAndWait({}, never);
      expect(t.dialog()?.spec.title).toBe('Could not stop the take');
      expect(t.dialog()?.spec.body).toContain('did not answer in time');
      expect(t.overlay.getSnapshot().toasts.map((toast) => toast.text)).not.toContain('Stopping the take…');
      act(() => t.dialog()!.answer(true));
      await act(() => t.done());
      expect(t.go).toHaveBeenCalledWith('/script');
      // A later exit is not ignored.
      const next = vi.fn();
      act(() => void t.hook.result.current.leave('/proof', next));
      expect(t.dialog()?.spec.title).toBe('Stop recording?');
      act(() => t.dialog()!.answer(false));
    });

    it('a start that never lands ends the same way', async () => {
      const t = await yesAndWait({ settle: never });
      expect(t.dialog()?.spec.title).toBe('Could not stop the take');
      expect(t.stopRecording).not.toHaveBeenCalled();
      act(() => t.dialog()!.answer(false));
      await act(() => t.done());
      expect(t.go).not.toHaveBeenCalled();
    });

    it('a run that never finishes writing does not hold the narrator: the stop landed, and they leave', async () => {
      const t = await yesAndWait({ flush: never });
      await act(() => t.done());
      expect(t.go).toHaveBeenCalledWith('/script');
      expect(t.dialog()).toBeUndefined();
    });

    // The Booth went some other way mid-wait (the project picker drawn in its place): what still waits must not open a question over the new page, move the
    // narrator, or leave its message up (#3325, ux-reviewer).
    describe('the Booth is gone mid-wait', () => {
      const unmountedMidWait = async (over: Partial<BoothLeaveSession>, stop?: () => Promise<DawResult>) => {
        vi.useFakeTimers();
        const t = setup(over, stop);
        render(<OverlayHost service={t.overlay} />);
        act(() => void t.hook.result.current.leave('/script', t.go));
        act(() => t.dialog()!.answer(true));
        await flush();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
        t.hook.unmount();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2 * LEAVE_WAIT_MS + 500);
        });
        return t;
      };
      const quiet = (t: ReturnType<typeof setup>) => {
        expect(t.go).not.toHaveBeenCalled();
        expect(t.dialog()).toBeUndefined();
        expect(screen.queryByText('Stopping the take…')).toBeNull();
      };

      it('a stop that never answers: no refusal over the new page, no move, the message gone, the failure said as an error', async () => {
        const t = await unmountedMidWait({}, never);
        quiet(t);
        expect(t.stopRecording).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/could not be stopped/)).toBeTruthy();
      });

      it('a run that is never written: no move', async () => {
        const t = await unmountedMidWait({ flush: never });
        quiet(t);
      });

      it('a start that answers after the Booth is gone: no move, and this decision stops nothing (the late start stops itself)', async () => {
        const t = await unmountedMidWait({ settle: () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 3000)) });
        quiet(t);
        expect(t.stopRecording).not.toHaveBeenCalled();
      });
    });
  });

  describe('a start still pending (#3321)', () => {
    it('the question never says a take records while it is only starting', () => {
      const { store } = setup({ startPending: true });
      expect(store.checkLeave('/proof')).toMatchObject({
        ask: {
          title: 'Leave while a take is starting?',
          cancelLabel: 'Stay',
          body: 'REAPER is starting a take. Leaving the Booth stops it once it has started.',
        },
      });
    });

    it('the question closes by itself, and the narrator stays, when the start ends at its limit with no take', async () => {
      const { overlay, stopRecording, go, hook, session, dialog } = setup({ startPending: true });
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = hook.result.current.leave('/proof', go);
      });
      expect(dialog()?.spec.title).toBe('Leave while a take is starting?');
      hook.rerender({ ...session, recording: false, startPending: false });
      await act(() => done);
      expect(overlay.getSnapshot().dialogs).toHaveLength(0);
      expect(stopRecording).not.toHaveBeenCalled();
      expect(go).not.toHaveBeenCalled();
    });

    it('a question about a real take stays when that take ends by itself: Stop and leave still leaves', async () => {
      const { overlay, go, hook, session, dialog } = setup({ recording: true });
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = hook.result.current.leave('/proof', go);
      });
      hook.rerender({ ...session, recording: false });
      expect(overlay.getSnapshot().dialogs).toHaveLength(1);
      act(() => dialog()!.answer(true));
      await act(() => done);
      expect(go).toHaveBeenCalledWith('/proof');
    });

    it('the question stays when the start lands as a take: Stop and leave still stops it', async () => {
      const { overlay, stopRecording, go, hook, session, dialog } = setup({ startPending: true });
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = hook.result.current.leave('/proof', go);
      });
      hook.rerender({ ...session, recording: true, startPending: false });
      expect(overlay.getSnapshot().dialogs).toHaveLength(1);
      act(() => dialog()!.answer(true));
      await act(() => done);
      expect(stopRecording).toHaveBeenCalledTimes(1);
      expect(go).toHaveBeenCalledWith('/proof');
    });
  });
});
