// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { createOverlayService } from '../../../overlay/overlayService';
import { rollConfirmSpec } from './rollConfirm';
import { rollPlan } from './rollPlan';
import { clampPhrase, isPunch } from './startFromHere';
import { createTakeHold } from './takeHold';
import { useRoll, type RollSession } from './useRoll';

// The mock's setups: a roll REAPER keeps as a take, Audacity without backups (destructive), Audacity with backups (not).
const withRoll = (base: DawCapabilities, punch: DawCapabilities['capabilities'][string]): DawCapabilities => ({
  ...base,
  capabilities: { ...base.capabilities, punch },
});
const SETUPS = {
  reaper: DAW_SETUPS.reaper,
  audacity: withRoll(DAW_SETUPS.audacity, { level: 'experimental', available: true, destructive: true }),
  audacityBackups: withRoll(DAW_SETUPS['audacity-backups'], { level: 'experimental', available: true }),
  reaperOff: DAW_SETUPS['reaper-off'],
};
const ok: DawResult = { ok: true, changed: true, message: '', undoSteps: 1 };

function setup(capabilities: DawCapabilities | null, over: Partial<RollSession> = {}, roll = vi.fn(async (): Promise<DawResult> => ok)) {
  const overlay = createOverlayService();
  const actions = {
    roll,
    pause: vi.fn(),
    resume: vi.fn(),
    beginTake: vi.fn(),
    chooseStart: vi.fn(),
    clearStart: vi.fn(),
    moveTo: vi.fn(),
    logPunch: vi.fn(),
    notify: vi.fn(),
  };
  const session: RollSession = {
    capabilities,
    recording: true,
    phraseCount: 6,
    phrase: 3,
    punchAt: null,
    paragraphOf: (p) => Math.floor(p / 2),
    secondsOf: (p) => p * 10,
    recordedEnd: 30,
    takeSeconds: 42,
    ...over,
  };
  const hook = renderHook((s: RollSession) => useRoll(s, actions, { overlay }), { initialProps: session });
  const dialog = () =>
    overlay.getSnapshot().dialogs[0] as
      { spec: { title: string; body: string; confirmLabel: string; cancelLabel?: string }; answer: (c: boolean) => void } | undefined;
  return { hook, actions, overlay, dialog };
}
const settle = () =>
  act(async () => {
    await Promise.resolve();
  });

describe('rollPlan', () => {
  it('reaper-keeps-the-earlier-audio-so-a-roll-needs-no-question', () => {
    expect(rollPlan(SETUPS.reaper)).toEqual({ kind: 'roll' });
  });
  it('backups-make-the-roll-non-destructive', () => {
    expect(rollPlan(SETUPS.audacityBackups)).toEqual({ kind: 'roll' });
  });
  it('a destructive roll asks, naming the DAW from the report', () => {
    expect(rollPlan(SETUPS.audacity)).toEqual({ kind: 'confirm', dawName: 'Audacity' });
  });
  it('a-dawless-or-rollless-setup-says-why', () => {
    expect(rollPlan(SETUPS.reaperOff)).toEqual({ kind: 'refused', reason: SETUPS.reaperOff.capabilities.punch.message });
    // Audacity rolls destructively until its backups are on (SN-D83): it asks rather than refuses.
    expect(rollPlan(DAW_SETUPS.audacity)).toEqual({ kind: 'confirm', dawName: 'Audacity' });
    expect(rollPlan(null)).toEqual({ kind: 'refused', reason: 'Rolling again is not available.' });
  });
});

describe('useRoll', () => {
  it('reaper: rolls without a confirm, moves, and logs the punch', async () => {
    const { hook, actions, dialog } = setup(SETUPS.reaper);
    await act(() => hook.result.current.punchAndRoll());
    expect(dialog()).toBeUndefined();
    expect(actions.roll).toHaveBeenCalledWith(3, { confirmed: false });
    expect(actions.moveTo).toHaveBeenCalledWith(3);
    expect(actions.logPunch).toHaveBeenCalledWith({ paragraph: 1, seconds: 42 });
    expect(actions.pause).not.toHaveBeenCalled();
  });

  it('audacity-without-backups-asks-and-holds-the-take', async () => {
    const { hook, actions, dialog } = setup(SETUPS.audacity);
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = hook.result.current.punchAndRoll() as Promise<void>;
    });
    expect(dialog()?.spec).toEqual({
      title: 'Roll again from ¶ 2?',
      body: 'Audacity will record over the audio from here, and what it replaces is not kept as a take.',
      confirmLabel: 'Roll again',
      cancelLabel: 'Keep recording',
    });
    expect(actions.pause).toHaveBeenCalledTimes(1);
    act(() => dialog()!.answer(false));
    await act(() => done);
    expect(actions.resume).toHaveBeenCalledTimes(1);
    expect(actions.roll).not.toHaveBeenCalled();
    expect(actions.logPunch).not.toHaveBeenCalled();
  });

  it('yes-rolls-confirmed-and-logs-the-punch', async () => {
    const { hook, actions, dialog } = setup(SETUPS.audacity);
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = hook.result.current.punchAndRoll() as Promise<void>;
    });
    act(() => dialog()!.answer(true));
    await act(() => done);
    expect(actions.roll).toHaveBeenCalledWith(3, { confirmed: true });
    expect(actions.resume).toHaveBeenCalledTimes(1);
    expect(actions.moveTo).toHaveBeenCalledWith(3);
    expect(actions.logPunch).toHaveBeenCalledWith({ paragraph: 1, seconds: 42 });
  });

  it('a refused roll shows the DAW sentence and changes nothing', async () => {
    const roll = vi.fn(async (): Promise<DawResult> => ({ ok: false, changed: false, message: 'No.', undoSteps: 0, refused: 'No.' }));
    const { hook, actions } = setup(SETUPS.reaper, {}, roll);
    await act(() => hook.result.current.punchAndRoll());
    expect(actions.notify).toHaveBeenCalledWith('No.');
    expect(actions.logPunch).not.toHaveBeenCalled();
    expect(actions.moveTo).not.toHaveBeenCalled();
  });

  it('start-from-here-while-recording-goes-through-the-same-question', async () => {
    const { hook, actions, dialog } = setup(SETUPS.audacity);
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = hook.result.current.startFromHere(2) as Promise<void>;
    });
    expect(actions.chooseStart).toHaveBeenCalledWith(2, false);
    expect(dialog()?.spec.title).toBe('Roll again from ¶ 2?');
    expect(actions.logPunch).not.toHaveBeenCalled();
    act(() => dialog()!.answer(true));
    await act(() => done);
    expect(actions.moveTo).toHaveBeenCalledWith(2);
    expect(actions.logPunch).toHaveBeenCalledTimes(1);
  });

  it('start from here before a take only marks the place and moves there', async () => {
    const { hook, actions, dialog } = setup(SETUPS.audacity, { recording: false });
    await act(() => hook.result.current.startFromHere(4));
    expect(actions.chooseStart).toHaveBeenCalledWith(4, true);
    expect(actions.notify).toHaveBeenCalledWith('Starting from ¶ 3');
    expect(dialog()).toBeUndefined();
    expect(actions.roll).not.toHaveBeenCalled();
  });

  it('a-dawless-or-rollless-setup-says-why: nothing rolls', async () => {
    const { hook, actions } = setup(SETUPS.reaperOff);
    await act(() => hook.result.current.punchAndRoll());
    expect(actions.notify).toHaveBeenCalledWith(SETUPS.reaperOff.capabilities.punch.message);
    expect(actions.roll).not.toHaveBeenCalled();
  });

  it('r-rolls-only-while-recording', async () => {
    const { hook, actions } = setup(SETUPS.reaper, { recording: false });
    await act(() => hook.result.current.punchAndRoll());
    expect(actions.notify).toHaveBeenCalledWith('Start recording first.');
    expect(actions.roll).not.toHaveBeenCalled();
  });

  it('r-says-why-record-cannot-start-in-the-record-controls-own-sentence', async () => {
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, recordRefusal: 'Experimental: switched off in Settings.' });
    await act(() => hook.result.current.punchAndRoll());
    expect(actions.notify).toHaveBeenCalledWith('Experimental: switched off in Settings.');
    expect(actions.notify).not.toHaveBeenCalledWith('Start recording first.');
    expect(actions.roll).not.toHaveBeenCalled();
  });

  it('r rolls from the phrase chosen with Start from here', async () => {
    const { hook, actions } = setup(SETUPS.reaper, { punchAt: 1 });
    await act(() => hook.result.current.punchAndRoll());
    expect(actions.roll).toHaveBeenCalledWith(1, { confirmed: false });
  });

  describe('a-punch-before-recording-asks-only-inside-what-is-recorded', () => {
    it('inside what is recorded it is a punch and follows the plan', async () => {
      const { hook, actions, dialog } = setup(SETUPS.audacity, { recording: false, punchAt: 1 });
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = hook.result.current.startTake() as Promise<void>;
      });
      expect(dialog()?.spec).toMatchObject({ title: 'Punch in at ¶ 1?', confirmLabel: 'Punch in', cancelLabel: 'Cancel' });
      expect(actions.pause).not.toHaveBeenCalled();
      act(() => dialog()!.answer(true));
      await act(() => done);
      expect(actions.beginTake).toHaveBeenCalledWith(10);
    });
    it('a punch the DAW keeps as a take starts without a question', async () => {
      const { hook, actions, dialog } = setup(SETUPS.reaper, { recording: false, punchAt: 1 });
      await act(() => hook.result.current.startTake());
      expect(dialog()).toBeUndefined();
      expect(actions.beginTake).toHaveBeenCalledWith(10);
    });
    it('declining starts nothing', async () => {
      const { hook, actions, dialog } = setup(SETUPS.audacity, { recording: false, punchAt: 1 });
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = hook.result.current.startTake() as Promise<void>;
      });
      act(() => dialog()!.answer(false));
      await act(() => done);
      expect(actions.beginTake).not.toHaveBeenCalled();
    });
    it('beyond the end it is not a punch: no question, the take starts at the end', async () => {
      const { hook, actions, dialog } = setup(SETUPS.audacity, { recording: false, punchAt: 4 });
      await act(() => hook.result.current.startTake());
      expect(dialog()).toBeUndefined();
      expect(actions.beginTake).toHaveBeenCalledWith();
    });
    it('a punch the DAW cannot do says why, forgets the chosen start and takes from the end', async () => {
      const { hook, actions } = setup(SETUPS.reaperOff, { recording: false, punchAt: 1 });
      await act(() => hook.result.current.startTake());
      expect(actions.notify).toHaveBeenCalledWith(`${SETUPS.reaperOff.capabilities.punch.message} Recording from the end of what is already there instead.`);
      expect(actions.clearStart).toHaveBeenCalledTimes(1);
      expect(actions.beginTake).toHaveBeenCalledWith();
    });
    it('Start from here before a take, with a DAW that cannot punch, arms nothing and says where the take will start', async () => {
      const { hook, actions } = setup(SETUPS.reaperOff, { recording: false });
      await act(() => hook.result.current.startFromHere(1));
      expect(actions.chooseStart).not.toHaveBeenCalled();
      expect(actions.notify).toHaveBeenCalledWith(expect.stringContaining('The next take starts from the end of what is already there, not from ¶ 1.'));
    });
    it('isPunch and clampPhrase', () => {
      expect(isPunch({ phrase: 2, seconds: 29.6, recordedEnd: 30 })).toBe(false);
      expect(isPunch({ phrase: 2, seconds: 29.4, recordedEnd: 30 })).toBe(true);
      expect(clampPhrase(9, 6)).toBe(5);
      expect(clampPhrase(-1, 6)).toBe(0);
    });
  });

  it('only one question is open at a time', async () => {
    const { hook, overlay } = setup(SETUPS.audacity);
    act(() => {
      void hook.result.current.punchAndRoll();
      void hook.result.current.punchAndRoll();
    });
    await settle();
    expect(overlay.getSnapshot().dialogs).toHaveLength(1);
  });
});

describe('the-confirm-names-the-daw-from-the-capability', () => {
  it.each([
    ['Audacity', 'Audacity will record over the audio from here, and what it replaces is not kept as a take.'],
    ['the built-in recorder', 'The built-in recorder will record over the audio from here, and what it replaces is not kept as a take.'],
  ])('%s', (dawName, body) => {
    expect(rollConfirmSpec({ title: 't', confirmLabel: 'c', dawName, recording: true }).body).toBe(body);
  });
  it('cancel is Cancel when no take runs', () => {
    expect(rollConfirmSpec({ title: 't', confirmLabel: 'c', dawName: 'Audacity', recording: false }).cancelLabel).toBe('Cancel');
  });
});

describe('createTakeHold', () => {
  it('holds nest: the take resumes only when the last hold is released', () => {
    const pause = vi.fn();
    const resume = vi.fn();
    const hold = createTakeHold({ pause, resume });
    const menu = hold();
    const confirm = hold();
    expect(pause).toHaveBeenCalledTimes(1);
    menu();
    menu();
    expect(resume).not.toHaveBeenCalled();
    confirm();
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
