// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createLeaveGuard } from '../../../studio/journal/leaveGuard';
import { createOverlayService } from '../../../overlay/overlayService';
import type { DawResult } from '../../../api/contracts/daw';
import { useBoothLeaveGuard, type BoothLeaveSession } from './useBoothLeaveGuard';

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
      ask: {
        title: 'Stop recording?',
        body: 'Audacity is recording. Leaving the Booth stops it.',
        confirmLabel: 'Stop and leave',
        cancelLabel: 'Keep recording',
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
});
