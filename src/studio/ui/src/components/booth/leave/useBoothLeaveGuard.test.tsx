// @vitest-environment jsdom
import { renderHook, act, render, screen, waitFor } from '@testing-library/react';
import { OverlayHost } from '../../../overlay/OverlayHost';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLeaveGuard } from '../../../studio/journal/leaveGuard';
import { createOverlayService } from '../../../overlay/overlayService';
import type { DawResult } from '../../../api/contracts/daw';
import { IGNORE_ENTER_MS } from './stopRecordingSpec';
import { LEAVE_STOP_WAIT_MS, LEAVE_WAIT_MS, useBoothLeaveGuard, type BoothLeaveSession } from './useBoothLeaveGuard';

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

  // #3349 QA B-A: `recording` false is also what a DAW that went quiet leaves behind. Leaving is silent only when the end is confirmed with the DAW answering.
  describe('a take that ended with the DAW not (yet) known to answer', () => {
    const refusal = async () => ({ ok: false, changed: false, message: 'No answer.', undoSteps: 0, refused: 'No answer.' }) as DawResult;

    it('class guard: the exit is allowed with no question only when nothing records AND the end is confirmed', () => {
      for (const [recording, unconfirmed, allowed] of [
        [false, false, true],
        [false, true, false],
        [true, false, false],
        [true, true, false],
      ] as const) {
        const { store } = setup({ recording, endUnconfirmed: () => unconfirmed });
        expect(store.checkLeave('/script') === 'allow', `recording ${recording}, unconfirmed ${unconfirmed}`).toBe(allowed);
      }
    });

    // #3528: the question says only what is known. A DAW that went quiet may still be recording, and a take that really runs keeps the plain sentence. Its title names the page
    // (#3529's destination, from the same move) and does not claim a take is running ("Stop recording?" would).
    it('says the DAW may still be recording when the end is unconfirmed, and keeps the running sentence for a take that runs', () => {
      const quiet = setup({ recording: false, endUnconfirmed: () => true });
      act(() => void quiet.hook.result.current.leave('/script', quiet.go));
      expect(quiet.dialog()?.spec.body).toBe('REAPER may still be recording. Leaving tries to stop the take.');
      expect(quiet.dialog()?.spec.title).toBe('Leave for Script?');
      expect(quiet.dialog()?.spec.confirmLabel).toBe('Stop and leave');
      expect(quiet.dialog()?.spec).toMatchObject({ cancelLabel: 'Stay' });
      act(() => quiet.dialog()!.answer(false));
      // The shell's leave verdict (the nav, Back, Forward) carries the same sentence and names its page.
      const verdict = setup({ recording: false, endUnconfirmed: () => true }).store.checkLeave('/proof');
      expect(verdict).toEqual({
        decide: expect.any(Function),
        ask: expect.objectContaining({ title: 'Leave for Proof?', body: 'REAPER may still be recording. Leaving tries to stop the take.' }),
      });
      const running = setup({ recording: true, endUnconfirmed: () => true });
      act(() => void running.hook.result.current.leave('/script', running.go));
      expect(running.dialog()?.spec.title).toBe('Stop recording?');
      expect(running.dialog()?.spec.body).toBe('REAPER is recording. Leaving the Booth for Script stops it and saves the take.');
      act(() => running.dialog()!.answer(false));
    });

    // #3528 with #3529: the title names the page the move goes to, for each kind of destination, and never claims a take is running.
    it.each([
      ['/script', 'Leave for Script?'],
      ['/proof', 'Leave for Proof?'],
      ['/script?chapter=c2', 'Leave for Script?'],
      ['/settings#audio', 'Leave for Settings?'],
      ['/booth?chapter=chapter-3', 'Open another chapter?'],
      ['/not-a-rail-page', 'Leave the Booth?'],
    ])('with the end unconfirmed, leaving for %s asks "%s"', (next, title) => {
      const { store } = setup({ recording: false, endUnconfirmed: () => true });
      // The narrator stays in the Booth for a chapter change, so its sentence says opening, not leaving.
      const body =
        title === 'Open another chapter?'
          ? 'REAPER may still be recording. Opening another chapter tries to stop the take.'
          : 'REAPER may still be recording. Leaving tries to stop the take.';
      expect(store.checkLeave(next)).toMatchObject({ ask: { title, body, cancelLabel: 'Stay' } });
    });

    it('asks, tries the stop, and asks "Could not stop the take" when the stop is refused', async () => {
      const t = setup({ recording: false, endUnconfirmed: () => true, endConfirmed: async () => false }, refusal);
      act(() => void t.hook.result.current.leave('/script', t.go));
      expect(t.dialog()?.spec.title).toBe('Leave for Script?');
      act(() => t.dialog()!.answer(true));
      await flush();
      await flush();
      expect(t.stopRecording).toHaveBeenCalledTimes(1);
      expect(t.dialog()?.spec.title).toBe('Could not stop the take');
      // The refusal reached from this question offers Stay, as the question did, not "Keep recording".
      expect(t.dialog()?.spec).toMatchObject({ cancelLabel: 'Stay', confirmLabel: 'Leave anyway' });
      expect(t.go).not.toHaveBeenCalled();
      act(() => t.dialog()!.answer(false));
    });

    // QA B-D: the end check is a read of the DAW, and a read can hang. It is bounded like every other wait, and a timeout is "not confirmed".
    it('a stop wait whose end check never answers falls to the Could not stop the take question after LEAVE_WAIT_MS', async () => {
      vi.useFakeTimers();
      try {
        const t = setup({ recording: false, endUnconfirmed: () => true, endConfirmed: () => new Promise<boolean>(() => {}) }, refusal);
        render(<OverlayHost service={t.overlay} />);
        act(() => void t.hook.result.current.leave('/script', t.go));
        act(() => t.dialog()!.answer(true));
        await flush();
        expect(t.stopRecording).not.toHaveBeenCalled();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(LEAVE_WAIT_MS + 100);
        });
        expect(t.stopRecording).toHaveBeenCalledTimes(1);
        expect(t.dialog()?.spec.title).toBe('Could not stop the take');
        expect(t.go).not.toHaveBeenCalled();
        act(() => t.dialog()!.answer(false));
      } finally {
        vi.useRealTimers();
      }
    });

    it('Keep recording works while the end check hangs', async () => {
      const t = setup({ recording: false, endUnconfirmed: () => true, endConfirmed: () => new Promise<boolean>(() => {}) });
      let done: Promise<unknown> = Promise.resolve();
      act(() => {
        done = t.hook.result.current.leave('/script', t.go);
      });
      act(() => t.dialog()!.answer(false));
      await act(() => done);
      expect(t.go).not.toHaveBeenCalled();
      expect(t.dialog()).toBeUndefined();
    });

    it('an end check that fails is not a confirmed end: one stop, and it leaves when that succeeds', async () => {
      const t = setup({ recording: false, endUnconfirmed: () => true, endConfirmed: async () => Promise.reject(new Error('no answer')) });
      let done: Promise<unknown> = Promise.resolve();
      act(() => {
        done = t.hook.result.current.leave('/script', t.go);
      });
      act(() => t.dialog()!.answer(true));
      await act(() => done);
      expect(t.stopRecording).toHaveBeenCalledTimes(1);
      expect(t.go).toHaveBeenCalledWith('/script');
    });

    it('Keep recording stays, and the next exit asks again', async () => {
      const t = setup({ recording: false, endUnconfirmed: () => true, endConfirmed: async () => false });
      act(() => void t.hook.result.current.leave('/script', t.go));
      act(() => t.dialog()!.answer(false));
      await flush();
      act(() => void t.hook.result.current.leave('/script', t.go));
      expect(t.dialog()?.spec.title).toBe('Leave for Script?');
      act(() => t.dialog()!.answer(false));
      expect(t.go).not.toHaveBeenCalled();
    });

    it('a take that ended with the DAW answering leaves with no question and no stop', async () => {
      const t = setup({ recording: false, endUnconfirmed: () => false });
      await act(() => t.hook.result.current.leave('/script', t.go));
      expect(t.go).toHaveBeenCalledWith('/script');
      expect(t.stopRecording).not.toHaveBeenCalled();
    });
  });

  it('recording-asks-stop-recording, naming the DAW from the report', () => {
    const { store } = setup({ daw: { name: 'Audacity' } });
    expect(store.checkLeave('/proof')).toEqual({
      decide: expect.any(Function),
      ask: {
        title: 'Stop recording?',
        body: 'Audacity is recording. Leaving the Booth for Proof stops it and saves the take.',
        confirmLabel: 'Stop and leave',
        cancelLabel: 'Keep recording',
        safeDefault: true,
        ignoreEnterAfterMs: IGNORE_ENTER_MS,
      },
    });
  });

  // #3529: the question names the page the move goes to, and says nothing of a destination no rail page owns.
  it.each([
    ['/script', ' for Script'],
    ['/script?chapter=c2', ' for Script'],
    ['/editing/chapter-2', ' for Editing'],
    ['/settings#audio', ' for Settings'],
    ['/', ' for Production'],
    ['/somewhere-else', ''],
  ])('names where leaving goes: %s', (to, named) => {
    const { store } = setup();
    expect(store.checkLeave(to)).toMatchObject({ ask: { body: `REAPER is recording. Leaving the Booth${named} stops it and saves the take.` } });
  });

  // #3529 (ux-reviewer): a chapter link into the Booth during a take is a move within the Booth: the take stops, the narrator does not leave, and the question says so.
  it('a destination that is the Booth itself reads as opening another chapter, not as leaving', () => {
    const { store } = setup();
    expect(store.checkLeave('/booth?chapter=chapter-3')).toMatchObject({
      ask: { body: 'REAPER is recording. Opening another chapter stops it and saves the take.' },
    });
  });

  it('the question the Booth asks for its own exit names the destination too', () => {
    const t = setup();
    act(() => void t.hook.result.current.leave('/proof', t.go));
    expect(t.dialog()?.spec.body).toBe('REAPER is recording. Leaving the Booth for Proof stops it and saves the take.');
    act(() => t.dialog()!.answer(false));
  });

  it('names the built-in recorder', () => {
    const { store } = setup({ daw: { name: 'the built-in recorder' } });
    expect(store.checkLeave('/x')).toMatchObject({ ask: { body: 'The built-in recorder is recording. Leaving the Booth stops it and saves the take.' } });
  });

  it('keep-recording-stays-and-changes-nothing; the-take-is-held-while-the-question-is-open', async () => {
    const { overlay, stopRecording, go, hook, dialog } = setup();
    let done: Promise<unknown> = Promise.resolve();
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
    let done: Promise<unknown> = Promise.resolve();
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
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = hook.result.current.leave('/script', go);
    });
    act(() => dialog()!.answer(true));
    await act(() => done);
    expect(order).toEqual(['stop', 'flush', 'go']);
  });

  // #3529 (qa-breaker B1): what says the take is saved is held by the stop and raised by `arrived`, after the run is written and just before the move.
  it('a-leave-mid-take: the stop is asked to hold its telling, and `arrived` comes after the flush and before the navigation', async () => {
    const order: string[] = [];
    const stop = vi.fn(async (_options?: { deferTell?: boolean }) => {
      order.push('stop');
      return ok;
    });
    const { go, hook, dialog } = setup(
      {
        flush: vi.fn(async () => {
          order.push('flush');
        }),
        arrived: () => order.push('arrived'),
      },
      stop,
    );
    go.mockImplementation(() => order.push('go'));
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = hook.result.current.leave('/script', go);
    });
    act(() => dialog()!.answer(true));
    await act(() => done);
    expect(stop).toHaveBeenCalledWith({ deferTell: true });
    expect(order).toEqual(['stop', 'flush', 'arrived', 'go']);
  });

  it('a-leave-mid-take-flushes-the-run: nothing is flushed when the stop is refused, the question is declined, or the app did not start the take', async () => {
    const refusal: DawResult = { ok: false, changed: false, message: 'No.', undoSteps: 0, refused: 'No.' };
    const refused = setup({ flush: vi.fn(async () => {}) }, async () => refusal);
    let a: Promise<unknown> = Promise.resolve();
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
    let b: Promise<unknown> = Promise.resolve();
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
    let done: Promise<unknown> = Promise.resolve();
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

  // #3555 item 2: the open question follows the DAW, and a take the DAW records is stopped before the narrator leaves.
  describe('the question follows the DAW', () => {
    it('is asked again as the quiet DAW\'s question when the DAW goes quiet while "Stop recording?" is open', async () => {
      const { go, hook, dialog, session } = setup({});
      act(() => void hook.result.current.leave('/script', go));
      expect(dialog()?.spec.title).toBe('Stop recording?');
      hook.rerender({ ...session, recording: false, endUnconfirmed: () => true, endConfirmed: async () => false });
      await flush();
      await flush();
      expect(dialog()?.spec).toMatchObject({ title: 'Leave for Script?', cancelLabel: 'Stay', confirmLabel: 'Stop and leave' });
      expect(dialog()?.spec.body).toBe('REAPER may still be recording. Leaving tries to stop the take.');
      act(() => dialog()!.answer(false));
    });

    // Every end is unconfirmed until the DAW has been read once: a take that ends with the DAW answering keeps "Stop recording?", it is not rewritten to "may still be recording".
    it('keeps the running question when the take ends and the DAW answers the read that follows', async () => {
      let unconfirmed = true;
      const { go, hook, dialog, session } = setup({});
      act(() => void hook.result.current.leave('/script', go));
      hook.rerender({ ...session, recording: false, endUnconfirmed: () => unconfirmed, endConfirmed: async () => true });
      await flush();
      await flush();
      unconfirmed = false;
      hook.rerender({ ...session, recording: false, endUnconfirmed: () => unconfirmed, endConfirmed: async () => true });
      await flush();
      await flush();
      expect(dialog()?.spec).toMatchObject({ title: 'Stop recording?', cancelLabel: 'Keep recording' });
      act(() => dialog()!.answer(false));
    });

    it('is not asked again when the take merely ends with the DAW answering: Stop and leave then leaves (#3342)', async () => {
      const { go, hook, dialog, session } = setup({});
      act(() => void hook.result.current.leave('/script', go));
      hook.rerender({ ...session, recording: false });
      await flush();
      expect(dialog()?.spec.title).toBe('Stop recording?');
      act(() => dialog()!.answer(false));
    });

    it('a refusal after the DAW went quiet offers Stay, not Keep recording', async () => {
      let refuse: (result: DawResult) => void = () => undefined;
      const { go, hook, dialog, session } = setup({}, () => new Promise<DawResult>((resolve) => (refuse = resolve)));
      act(() => void hook.result.current.leave('/script', go));
      act(() => dialog()!.answer(true));
      await flush();
      hook.rerender({ ...session, recording: false, endUnconfirmed: () => true, endConfirmed: async () => false });
      refuse({ ok: false, changed: false, message: 'No answer.', undoSteps: 0, refused: 'No answer.' });
      await flush();
      await flush();
      expect(dialog()?.spec).toMatchObject({ title: 'Could not stop the take', cancelLabel: 'Stay', confirmLabel: 'Leave anyway' });
      act(() => dialog()!.answer(false));
    });

    it('a refusal is not asked again when the DAW goes quiet while it is open', async () => {
      const refusal: DawResult = { ok: false, changed: false, message: 'Disk full.', undoSteps: 0, refused: 'Disk full.' };
      const { go, hook, dialog, session } = setup({}, async () => refusal);
      act(() => void hook.result.current.leave('/script', go));
      act(() => dialog()!.answer(true));
      await flush();
      await flush();
      expect(dialog()?.spec.title).toBe('Could not stop the take');
      hook.rerender({ ...session, recording: false, endUnconfirmed: () => true });
      await flush();
      expect(dialog()?.spec.title).toBe('Could not stop the take');
      act(() => dialog()!.answer(false));
    });

    it('stops a take the DAW records although the end was believed over, and leaves once it is stopped', async () => {
      const { go, hook, dialog, stopRecording } = setup({ recording: false, endUnconfirmed: () => true, dawRecordingNow: async () => true });
      act(() => void hook.result.current.leave('/script', go));
      act(() => dialog()!.answer(true));
      await flush();
      await flush();
      expect(stopRecording).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(go).toHaveBeenCalledWith('/script'));
    });

    it('with the DAW not recording, or the read failing, leaves without a stop as before', async () => {
      for (const dawRecordingNow of [async () => false, () => Promise.reject(new Error('no answer'))]) {
        const { go, hook, dialog, stopRecording } = setup({ recording: false, endUnconfirmed: () => true, dawRecordingNow });
        act(() => void hook.result.current.leave('/script', go));
        act(() => dialog()!.answer(true));
        await flush();
        await flush();
        expect(stopRecording).not.toHaveBeenCalled();
        await waitFor(() => expect(go).toHaveBeenCalledWith('/script'));
      }
    });
  });

  it('a refused stop on a chapter question says it opens: Open anyway, and "open it anyway" in the sentence', async () => {
    const refusal: DawResult = { ok: false, changed: false, message: 'Disk full.', undoSteps: 0, refused: 'Disk full.' };
    const { go, hook, dialog } = setup({}, async () => refusal);
    act(() => void hook.result.current.leave('/booth?chapter=chapter-2', go));
    act(() => dialog()!.answer(true));
    await flush();
    await flush();
    expect(dialog()?.spec.confirmLabel).toBe('Open anyway');
    expect(dialog()?.spec.body).toContain('You can open it anyway, but it may keep recording.');
    expect(dialog()?.spec.body).not.toContain('leave');
    act(() => dialog()!.answer(false));
  });

  it('a refused stop does not trap the narrator: Leave anyway goes without a second stop', async () => {
    const refusal: DawResult = { ok: false, changed: false, message: 'REAPER is not answering.', undoSteps: 0, refused: 'REAPER is not answering.' };
    const { go, hook, dialog, stopRecording } = setup({}, async () => refusal);
    let done: Promise<unknown> = Promise.resolve();
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
    let a: Promise<unknown> = Promise.resolve();
    let b: Promise<unknown> = Promise.resolve();
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
    let done: Promise<unknown> = Promise.resolve();
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
    let first: Promise<unknown> = Promise.resolve();
    act(() => {
      first = hook.result.current.leave('/script', go);
    });
    act(() => dialog()!.answer(true));
    await flush();
    await flush();
    // The stop landed (the Booth reads no take) and the run is still being written.
    hook.rerender({ ...session, recording: false });
    const second = vi.fn();
    let secondDone: Promise<unknown> = Promise.resolve();
    act(() => {
      secondDone = hook.result.current.leave('/settings', second);
    });
    expect(second).not.toHaveBeenCalled();
    const verdict = store.checkLeave('/settings');
    expect(verdict).not.toBe('allow');
    let shellMoved: boolean | undefined;
    let shellDone: Promise<unknown> = Promise.resolve();
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
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = a.hook.result.current.leave('/script', a.go);
    });
    act(() => a.dialog()!.answer(true));
    await flush();
    expect(a.stopRecording).not.toHaveBeenCalled();
    landed(true);
    await act(() => done);
    expect(a.stopRecording).toHaveBeenCalledTimes(1);

    const b = setup({ settle: async () => false, startPending: true });
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
      let done: Promise<unknown> = Promise.resolve();
      act(() => {
        done = t.hook.result.current.leave('/script', t.go);
      });
      act(() => t.dialog()!.answer(true));
      await flush();
      // The narrator sees that the take is being stopped.
      expect(t.overlay.getSnapshot().toasts.map((toast) => toast.text)).toContain('Stopping the take…');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LEAVE_STOP_WAIT_MS + 50);
      });
      return { ...t, done: () => done };
    };
    afterEach(() => vi.useRealTimers());

    // The message that says a stop is pending stays for as long as it is (past the usual five seconds of a toast), and goes when the wait ends.
    // Drawn by the host, which is what ends a toast at its time.
    const stoppingShown = () => screen.queryByText('Stopping the take…') !== null;
    for (const [name, over, stop, firstWaitEnds] of [
      ['a hung stop', {}, never, LEAVE_STOP_WAIT_MS],
      [
        'a hung start, then a hung stop',
        { settle: async () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), LEAVE_WAIT_MS - 100)) },
        never,
        LEAVE_WAIT_MS - 100 + LEAVE_STOP_WAIT_MS,
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

    it('a stop that never answers names the connected DAW, not "the DAW"', async () => {
      const t = await yesAndWait({ daw: { name: 'Audacity' } }, never);
      expect(t.dialog()?.spec.body).toContain('Audacity did not answer in time. You can leave anyway, but it may keep recording.');
      expect(t.dialog()?.spec.body).not.toContain('The DAW');
      act(() => t.dialog()!.answer(true));
      await act(() => t.done());
    });

    it('a stop that never answers ends in "Could not stop the take", with Leave anyway, and asking is cleared', async () => {
      const t = await yesAndWait({}, never);
      expect(t.dialog()?.spec.title).toBe('Could not stop the take');
      expect(t.dialog()?.spec.body).toContain('REAPER did not answer in time. You can leave anyway, but it may keep recording.');
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

    // #3697: the page's own stop is allowed 10 s, so a stop that answers at 9 s is the guard's to take: it leaves with the take saved, with no refusal first.
    it('a stop that answers after the first wait but inside the stop limit leaves, with no "Could not stop the take" first', async () => {
      vi.useFakeTimers();
      const t = setup({}, () => new Promise<DawResult>((resolve) => setTimeout(() => resolve(ok), 9000)));
      let done: Promise<unknown> = Promise.resolve();
      act(() => {
        done = t.hook.result.current.leave('/script', t.go);
      });
      act(() => t.dialog()!.answer(true));
      await flush();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LEAVE_WAIT_MS + 500);
      });
      expect(t.dialog(), 'no refusal is up while the stop is still inside its limit').toBeUndefined();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await act(() => done);
      expect(t.go).toHaveBeenCalledWith('/script');
      expect(t.dialog()).toBeUndefined();
    });

    // #3752, qa-breaker: Stop was pressed, a slow DAW has taken it, and the narrator leaves. The guard waits for that stop as long as the stop itself may
    // take, and never says it could not stop a take that then stops.
    it('a stop already out that lands after 20 s is waited for: no refusal, and the narrator leaves', async () => {
      vi.useFakeTimers();
      const t = setup({ settle: () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 20_000)) });
      let done: Promise<unknown> = Promise.resolve();
      act(() => {
        done = t.hook.result.current.leave('/script', t.go);
      });
      act(() => t.dialog()!.answer(true));
      await flush();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(19_000);
      });
      expect(t.dialog()).toBeUndefined();
      expect(t.go).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      await act(() => done);
      expect(t.dialog()).toBeUndefined();
      expect(t.go).toHaveBeenCalledWith('/script');
    });

    // #3846's review: a start still out is waited for LEAVE_WAIT_MS, not the stop's longer limit, and what is out is judged when the wait begins.
    it('a pending start that never lands is refused after LEAVE_WAIT_MS, and a start that landed during the question waits as a stop does', async () => {
      const yes = async (over: Partial<BoothLeaveSession>, landedMeanwhile: boolean) => {
        vi.useFakeTimers();
        const t = setup({ startPending: true, settle: never, ...over });
        act(() => void t.hook.result.current.leave('/script', t.go));
        if (landedMeanwhile) t.hook.rerender({ ...t.session, recording: true, startPending: false });
        await flush();
        act(() => t.dialog()!.answer(true));
        await flush();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(LEAVE_WAIT_MS - 100);
        });
        expect(t.dialog()).toBeUndefined();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(200);
        });
        return t;
      };
      expect((await yes({}, false)).dialog()?.spec.title).toBe('Could not stop the take');
      const landed = await yes({}, true);
      expect(landed.dialog(), 'a stop is waited for as long as the stop itself').toBeUndefined();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LEAVE_STOP_WAIT_MS - LEAVE_WAIT_MS);
      });
      expect(landed.dialog()?.spec.title).toBe('Could not stop the take');
    });

    it('a start that never lands ends the same way', async () => {
      const t = await yesAndWait({ settle: never });
      expect(t.dialog()?.spec.title).toBe('Could not stop the take');
      expect(t.dialog()?.spec.body).toContain('REAPER did not answer in time. You can leave anyway, but it may keep recording.');
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

    // #3349 B3: the message has an X; a narrator who closed it and pressed another exit is told again that the stop is still out.
    it('a second exit while the stop is pending says "Stopping the take…" again after the narrator closed it', async () => {
      vi.useFakeTimers();
      const t = setup({}, never);
      act(() => void t.hook.result.current.leave('/script', t.go));
      act(() => t.dialog()!.answer(true));
      await flush();
      const shown = () => t.overlay.getSnapshot().toasts.filter((toast) => toast.text === 'Stopping the take…');
      expect(shown()).toHaveLength(1);
      act(() => t.overlay.dismissToast(shown()[0]!.id));
      expect(shown()).toHaveLength(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      act(() => void t.hook.result.current.leave('/proof', vi.fn()));
      expect(shown()).toHaveLength(1);
      act(() => void t.hook.result.current.decide());
      expect(shown()).toHaveLength(1);
      // It moved nowhere: the first decision is still the only one.
      expect(t.stopRecording).toHaveBeenCalledTimes(1);
    });

    // #3349 B2: the DAW ended the take itself (the Booth showed "Stopped. Recorded") while the stop was out: the refusal question would be about a take that is over.
    describe('the take ends in the DAW while the decision waits', () => {
      it('a take that ended during the stop wait leaves without the refusal question', async () => {
        vi.useFakeTimers();
        const t = setup({ endConfirmed: async () => true }, never);
        render(<OverlayHost service={t.overlay} />);
        let done: Promise<unknown> = Promise.resolve();
        act(() => {
          done = t.hook.result.current.leave('/script', t.go);
        });
        act(() => t.dialog()!.answer(true));
        await flush();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2000);
        });
        t.hook.rerender({ ...t.session, recording: false });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2000);
        });
        await act(() => done);
        expect(t.go).toHaveBeenCalledWith('/script');
        expect(t.dialog()).toBeUndefined();
        expect(screen.queryByText('Stopping the take…')).toBeNull();
        // Not waited out: it left when the take ended, not at the limit.
        expect(t.stopRecording).toHaveBeenCalledTimes(1);
      });

      // qa-breaker/ux-reviewer on the B1 fix: the DAW ended the take while the stop was out, so the move is not waited on the stop's answer; what the stop holds back is released
      // there too, and an answer that comes after is raised at once (the page's `arrived`), not held for good.
      it('a take that ended during the stop wait releases what the stop held back before the move', async () => {
        vi.useFakeTimers();
        const arrived = vi.fn();
        const t = setup({ endConfirmed: async () => true, arrived }, never);
        let done: Promise<unknown> = Promise.resolve();
        act(() => {
          done = t.hook.result.current.leave('/script', t.go);
        });
        act(() => t.dialog()!.answer(true));
        await flush();
        t.hook.rerender({ ...t.session, recording: false });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(4000);
        });
        await act(() => done);
        expect(t.go).toHaveBeenCalledWith('/script');
        expect(arrived).toHaveBeenCalledTimes(1);
      });

      it('a stop that is not answered in time releases what it held back, so a late answer is not held for good', async () => {
        vi.useFakeTimers();
        const arrived = vi.fn();
        const t = setup({ arrived }, never);
        render(<OverlayHost service={t.overlay} />);
        act(() => void t.hook.result.current.leave('/script', t.go));
        act(() => t.dialog()!.answer(true));
        await flush();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(LEAVE_STOP_WAIT_MS + 100);
        });
        expect(t.dialog()?.spec.title).toBe('Could not stop the take');
        expect(arrived).toHaveBeenCalledTimes(1);
        expect(t.go).not.toHaveBeenCalled();
      });

      it('a take already over when the narrator says yes (the DAW answering) is not stopped, and they leave', async () => {
        const t = setup({ endConfirmed: async () => true });
        let done: Promise<unknown> = Promise.resolve();
        act(() => {
          done = t.hook.result.current.leave('/script', t.go);
        });
        t.hook.rerender({ ...t.session, recording: false });
        act(() => t.dialog()!.answer(true));
        await act(() => done);
        expect(t.go).toHaveBeenCalledWith('/script');
        expect(t.dialog()).toBeUndefined();
        expect(t.stopRecording).not.toHaveBeenCalled();
      });

      // F2: the DAW pushes its stopped transport before the reply to this decision's own stop: the reply (the take's undo entry) is still waited for.
      it("the stopped transport pushed before the stop's own reply does not skip that reply", async () => {
        vi.useFakeTimers();
        const order: string[] = [];
        const t = setup(
          { endConfirmed: async () => true },
          () => new Promise<DawResult>((resolve) => setTimeout(() => (order.push('reply'), resolve(ok)), 500)),
        );
        t.go.mockImplementation(() => order.push('go'));
        let done: Promise<unknown> = Promise.resolve();
        act(() => {
          done = t.hook.result.current.leave('/script', t.go);
        });
        act(() => t.dialog()!.answer(true));
        await flush();
        t.hook.rerender({ ...t.session, recording: false });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2500);
        });
        await act(() => done);
        expect(order).toEqual(['reply', 'go']);
      });

      it('a refusal that arrives as the take ends leaves without the refusal question', async () => {
        let refuse: (result: DawResult) => void = () => {};
        const t = setup({ endConfirmed: async () => true }, () => new Promise<DawResult>((resolve) => (refuse = resolve)));
        let done: Promise<unknown> = Promise.resolve();
        act(() => {
          done = t.hook.result.current.leave('/script', t.go);
        });
        act(() => t.dialog()!.answer(true));
        await flush();
        expect(t.stopRecording).toHaveBeenCalledTimes(1);
        t.hook.rerender({ ...t.session, recording: false });
        await flush();
        refuse({ ok: false, changed: false, message: 'REAPER is busy.', undoSteps: 0, refused: 'REAPER is busy.' } as DawResult);
        await act(() => done);
        expect(t.go).toHaveBeenCalledWith('/script');
        expect(t.dialog()).toBeUndefined();
      });

      // F1: a DAW that went quiet reads as stopped too, and its take may still record: that is not an end, and the refusal question still comes.
      it('a DAW that went quiet during a hung stop is not a confirmed end: the refusal question still asks', async () => {
        vi.useFakeTimers();
        const t = setup({ endConfirmed: async () => false }, never);
        render(<OverlayHost service={t.overlay} />);
        let done: Promise<unknown> = Promise.resolve();
        act(() => {
          done = t.hook.result.current.leave('/script', t.go);
        });
        act(() => t.dialog()!.answer(true));
        await flush();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2000);
        });
        t.hook.rerender({ ...t.session, recording: false });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(LEAVE_STOP_WAIT_MS);
        });
        expect(t.go).not.toHaveBeenCalled();
        expect(t.dialog()?.spec.title).toBe('Could not stop the take');
        expect(t.dialog()?.spec.body).toContain('may keep recording');
        act(() => t.dialog()!.answer(false));
        await act(() => done);
      });

      // QA break 1: `settle` says "no take is running" for a take a quiet DAW ended too. For a take that was running when asked that is not "nothing to stop".
      it('settle saying no take runs is not nothing to stop for a take that was running: the stop is tried', async () => {
        const t = setup(
          { settle: async () => false, endConfirmed: async () => false },
          async () => ({ ok: false, changed: false, message: 'No answer.', undoSteps: 0, refused: 'No answer.' }) as DawResult,
        );
        act(() => void t.hook.result.current.leave('/script', t.go));
        t.hook.rerender({ ...t.session, recording: false });
        act(() => t.dialog()!.answer(true));
        await flush();
        await flush();
        expect(t.stopRecording).toHaveBeenCalledTimes(1);
        expect(t.go).not.toHaveBeenCalled();
        expect(t.dialog()?.spec.title).toBe('Could not stop the take');
        act(() => t.dialog()!.answer(false));
      });

      it('a DAW that went quiet before the narrator said yes is stopped like a running take, and its refusal asks', async () => {
        const t = setup(
          { endConfirmed: async () => false },
          async () => ({ ok: false, changed: false, message: 'No answer.', undoSteps: 0, refused: 'No answer.' }) as DawResult,
        );
        let done: Promise<unknown> = Promise.resolve();
        act(() => {
          done = t.hook.result.current.leave('/script', t.go);
        });
        t.hook.rerender({ ...t.session, recording: false });
        act(() => t.dialog()!.answer(true));
        await flush();
        await flush();
        expect(t.stopRecording).toHaveBeenCalledTimes(1);
        expect(t.dialog()?.spec.title).toBe('Could not stop the take');
        act(() => t.dialog()!.answer(false));
        await act(() => done);
        expect(t.go).not.toHaveBeenCalled();
      });

      it('a take that ended during the question is not stopped again when the narrator says yes', async () => {
        const t = setup();
        let done: Promise<unknown> = Promise.resolve();
        act(() => {
          done = t.hook.result.current.leave('/script', t.go);
        });
        t.hook.rerender({ ...t.session, recording: false });
        act(() => t.dialog()!.answer(true));
        await act(() => done);
        expect(t.stopRecording).not.toHaveBeenCalled();
        expect(t.go).toHaveBeenCalledWith('/script');
      });
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
          await vi.advanceTimersByTimeAsync(Math.max(2 * LEAVE_WAIT_MS, LEAVE_STOP_WAIT_MS) + 500);
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
          body: 'REAPER is starting a take. Leaving the Booth for Proof stops it once it has started.',
        },
      });
    });

    it('the question closes by itself, and the narrator stays, when the start ends at its limit with no take', async () => {
      const { overlay, stopRecording, go, hook, session, dialog } = setup({ startPending: true });
      let done: Promise<unknown> = Promise.resolve();
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
      let done: Promise<unknown> = Promise.resolve();
      act(() => {
        done = hook.result.current.leave('/proof', go);
      });
      hook.rerender({ ...session, recording: false });
      expect(overlay.getSnapshot().dialogs).toHaveLength(1);
      act(() => dialog()!.answer(true));
      await act(() => done);
      expect(go).toHaveBeenCalledWith('/proof');
    });

    it('a question re-asked after the start landed stays open when the take then ends by itself', async () => {
      const { overlay, go, hook, session, dialog } = setup({ startPending: true });
      act(() => void hook.result.current.leave('/proof', go));
      hook.rerender({ ...session, recording: true, startPending: false });
      await waitFor(() => expect(dialog()?.spec.title).toBe('Stop recording?'));
      // The DAW ends the take on its own: an ordinary question about a real take stays (#3342).
      hook.rerender({ ...session, recording: false, startPending: false });
      await act(async () => {});
      expect(overlay.getSnapshot().dialogs).toHaveLength(1);
      expect(dialog()?.spec.title).toBe('Stop recording?');
    });

    it('the question stays when the start lands as a take: Stop and leave still stops it', async () => {
      const { overlay, stopRecording, go, hook, session, dialog } = setup({ startPending: true });
      let done: Promise<unknown> = Promise.resolve();
      act(() => {
        done = hook.result.current.leave('/proof', go);
      });
      hook.rerender({ ...session, recording: true, startPending: false });
      // The question is asked again as the recording question once the start has landed (REAPER is recording, Stop is behind it).
      await waitFor(() => expect(dialog()?.spec.title).toBe('Stop recording?'));
      expect(dialog()?.spec.body).toBe('REAPER is recording. Leaving the Booth for Proof stops it and saves the take.');
      expect(overlay.getSnapshot().dialogs).toHaveLength(1);
      act(() => dialog()!.answer(true));
      await act(() => done);
      expect(stopRecording).toHaveBeenCalledTimes(1);
      expect(go).toHaveBeenCalledWith('/proof');
    });
  });
});

describe('a take the DAW started (#3666)', () => {
  it('asks Leave the Booth? with Stay (both answers leave the DAW recording) and stops nothing', () => {
    const { store } = setup({ startedByApp: false });
    expect(store.checkLeave('/script')).toMatchObject({ ask: { title: 'Leave the Booth?', cancelLabel: 'Stay', confirmLabel: 'Leave' } });
  });

  it('the foreign claim wins over an unconfirmed end: a take ended in a quiet DAW is still not the one the app stops', () => {
    const { store } = setup({ startedByApp: false, recording: false, endUnconfirmed: () => true });
    expect(store.checkLeave('/script')).toMatchObject({ ask: { title: 'Leave the Booth?' } });
  });

  it('the question goes when that take ends: the DAW no longer keeps recording after the narrator leaves', async () => {
    const { overlay, go, hook, session, dialog } = setup({ startedByApp: false });
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = hook.result.current.leave('/script', go);
    });
    expect(dialog()?.spec.title).toBe('Leave the Booth?');
    hook.rerender({ ...session, recording: false });
    await act(() => done);
    expect(overlay.getSnapshot().dialogs).toHaveLength(0);
    expect(go).not.toHaveBeenCalled();
  });
});
