// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoothPunch } from '../../../api/contracts/voiceTracks';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { createOverlayService } from '../../../overlay/overlayService';
import { rollConfirmSpec } from './rollConfirm';
import { rollPlan } from './rollPlan';
import { clampPhrase } from './startFromHere';
import { createTakeHold } from './takeHold';
import { LOOKUP_MS, useRoll, type RollSession } from './useRoll';

// The mock's setups: a roll REAPER keeps as a take, Audacity without backups (destructive), Audacity with backups (not).
const withRoll = (base: DawCapabilities, punch: DawCapabilities['capabilities'][string]): DawCapabilities => ({
  ...base,
  capabilities: { ...base.capabilities, punch },
});
const SETUPS = {
  reaper: DAW_SETUPS.reaper,
  audacity: withRoll(DAW_SETUPS.audacity, { level: 'experimental', available: true, destructive: true }),
  audacityBackups: withRoll(DAW_SETUPS.audacity, { level: 'experimental', available: true }),
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
    chooseVoice: vi.fn(async () => true),
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
    // Phrases 0-2 were recorded before, at p * 10 seconds on the track 'T'; later ones never were.
    punchTarget: async (p): Promise<BoothPunch> =>
      p < 3 ? { outcome: 'found', trackGuid: 'T', trackName: 'Narrator', start: p * 10, end: p * 10 + 5 } : { outcome: 'never_recorded' },
    takeSeconds: 42,
    ...over,
  };
  const hook = renderHook((s: RollSession) => useRoll(s, actions, { overlay }), { initialProps: session });
  const dialog = () =>
    overlay.getSnapshot().dialogs[0] as
      { spec: { title: string; body: string; confirmLabel: string; cancelLabel?: string }; answer: (c: boolean) => void } | undefined;
  return { hook, actions, overlay, dialog, session };
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
    // Audacity keeps backups while it answers (SN-D83), so its roll keeps the earlier audio and needs no question.
    expect(rollPlan(DAW_SETUPS.audacity)).toEqual({ kind: 'roll' });
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

  it('start from here past what is recorded moves the text there and starts the take at the end', async () => {
    const { hook, actions, dialog } = setup(SETUPS.audacity, { recording: false });
    await act(() => hook.result.current.startFromHere(4));
    expect(actions.chooseStart).toHaveBeenCalledWith(4, true);
    expect(actions.notify).toHaveBeenCalledWith('Starting from ¶ 3');
    expect(dialog()).toBeUndefined();
    expect(actions.roll).not.toHaveBeenCalled();
    expect(actions.beginTake).toHaveBeenCalledExactlyOnceWith();
  });

  it('start from here inside what is recorded moves the text there and starts the take at that spot, not at the end', async () => {
    const { hook, actions } = setup(SETUPS.reaper, { recording: false });
    await act(() => hook.result.current.startFromHere(1));
    expect(actions.chooseStart).toHaveBeenCalledWith(1, true);
    expect(actions.beginTake).toHaveBeenCalledExactlyOnceWith(10);
  });

  it('a-dawless-or-rollless-setup-says-why: nothing rolls', async () => {
    const { hook, actions } = setup(SETUPS.reaperOff);
    await act(() => hook.result.current.punchAndRoll());
    expect(actions.notify).toHaveBeenCalledWith(SETUPS.reaperOff.capabilities.punch.message);
    expect(actions.roll).not.toHaveBeenCalled();
  });

  it('r-before-a-take-starts-one-at-the-word-in-the-same-press', async () => {
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, phrase: 1 });
    await act(() => hook.result.current.punchAndRoll());
    expect(actions.chooseStart).toHaveBeenCalledWith(1, true);
    expect(actions.beginTake).toHaveBeenCalledWith(10);
    expect(actions.roll).not.toHaveBeenCalled();
  });

  it('r-before-a-take-starts-from-the-chosen-start-over-the-reading-position', async () => {
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, phrase: 4, punchAt: 2 });
    await act(() => hook.result.current.punchAndRoll());
    expect(actions.beginTake).toHaveBeenCalledWith(20);
  });

  it('a passage recorded on a voice is punched on that voice, at its own earlier spot', async () => {
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 1 });
    await act(() => hook.result.current.startTake());
    expect(actions.chooseVoice).toHaveBeenCalledExactlyOnceWith('T');
    expect(actions.notify).toHaveBeenCalledWith('Recording over ¶ 1 on Narrator.');
    expect(actions.notify.mock.invocationCallOrder[0]).toBeLessThan(actions.beginTake.mock.invocationCallOrder[0]);
    expect(actions.beginTake).toHaveBeenCalledExactlyOnceWith(10);
  });

  it('a voice that cannot be chosen starts no take', async () => {
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 1 });
    actions.chooseVoice.mockResolvedValue(false);
    await act(() => hook.result.current.startTake());
    expect(actions.beginTake).not.toHaveBeenCalled();
  });

  it('a passage the host cannot find says why, forgets the start and starts nothing', async () => {
    const refused: BoothPunch = { outcome: 'refused', reason: 'stale', message: 'The recording has changed since it was last checked.' };
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: async () => refused });
    await act(() => hook.result.current.startTake());
    expect(actions.notify).toHaveBeenCalledWith(refused.message);
    expect(actions.clearStart).toHaveBeenCalledTimes(1);
    expect(actions.beginTake).not.toHaveBeenCalled();
  });

  it('a lookup that fails is a sentence and no take, never a guess', async () => {
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: async () => Promise.reject(new Error('down')) });
    await act(() => hook.result.current.startTake());
    expect(actions.notify).toHaveBeenCalledWith(expect.stringContaining('could not be read'));
    expect(actions.beginTake).not.toHaveBeenCalled();
  });

  describe('a lookup that is slow, never comes or comes late (the host is the other side)', () => {
    const found = (p: number): BoothPunch => ({ outcome: 'found', trackGuid: `T${p}`, trackName: `Voice ${p}`, start: p * 10, end: p * 10 + 5 });
    const gate = () => {
      let resolve!: (value: BoothPunch) => void;
      const promise = new Promise<BoothPunch>((r) => (resolve = r));
      return { promise, resolve };
    };

    it('a lookup that never answers times out with a sentence and starts no take', async () => {
      vi.useFakeTimers();
      try {
        const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: () => new Promise(() => {}) });
        let done: Promise<void> = Promise.resolve();
        act(() => {
          done = hook.result.current.startTake() as Promise<void>;
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(LOOKUP_MS);
          await done;
        });
        expect(actions.notify).toHaveBeenCalledWith(expect.stringContaining('did not come back in time'));
        expect(actions.clearStart).toHaveBeenCalledTimes(1);
        expect(actions.beginTake).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('Start from here with a DAW that cannot punch and a lookup that never answers does not hang', async () => {
      vi.useFakeTimers();
      try {
        const { hook, actions } = setup(SETUPS.reaperOff, { recording: false, punchTarget: () => new Promise(() => {}) });
        let done: Promise<void> = Promise.resolve();
        act(() => {
          done = hook.result.current.startFromHere(1) as Promise<void>;
        });
        await act(async () => {
          await vi.runAllTimersAsync(); // the early check's wait, then the take's own
          await done;
        });
        expect(actions.chooseStart).toHaveBeenCalledWith(1, true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('a lookup that answers after a take began starts nothing', async () => {
      const late = gate();
      const { hook, actions, session } = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: () => late.promise });
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = hook.result.current.startTake() as Promise<void>;
      });
      hook.rerender({ ...session, recording: true });
      late.resolve(found(1));
      await act(() => done);
      expect(actions.beginTake).not.toHaveBeenCalled();
      expect(actions.chooseVoice).not.toHaveBeenCalled();
    });

    it('two quick Start from here presses look up twice but start once', async () => {
      const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchTarget: async (p) => found(p) });
      await act(async () => {
        await Promise.all([hook.result.current.startFromHere(1), hook.result.current.startFromHere(1)]);
      });
      expect(actions.beginTake).toHaveBeenCalledTimes(1);
      expect(actions.chooseVoice).toHaveBeenCalledTimes(1);
    });

    it('a lookup answered after a newer start was chosen is ignored: the wrong voice is never recorded over', async () => {
      const slow = gate();
      const { hook, actions } = setup(SETUPS.reaper, {
        recording: false,
        punchTarget: (p) => (p === 2 ? slow.promise : Promise.resolve(found(p))),
      });
      let first: Promise<void> = Promise.resolve();
      act(() => {
        first = hook.result.current.startFromHere(2) as Promise<void>;
      });
      await act(() => hook.result.current.startFromHere(1));
      slow.resolve(found(2));
      await act(() => first);
      expect(actions.beginTake).toHaveBeenCalledExactlyOnceWith(10);
      expect(actions.chooseVoice).toHaveBeenCalledExactlyOnceWith('T1');
    });
  });

  it('r-before-a-take-past-the-recorded-end-records-at-the-end', async () => {
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, phrase: 5 });
    await act(() => hook.result.current.punchAndRoll());
    expect(actions.beginTake).toHaveBeenCalledWith();
  });

  it('r-before-a-take-the-daw-cannot-punch-says-why-and-starts-nothing', async () => {
    const { hook, actions } = setup(SETUPS.reaperOff, { recording: false, phrase: 1 });
    await act(() => hook.result.current.punchAndRoll());
    expect(actions.notify).toHaveBeenCalledWith(expect.stringContaining(SETUPS.reaperOff.capabilities.punch.message ?? ''));
    expect(actions.beginTake).not.toHaveBeenCalled();
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
      await settle();
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
      await settle();
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
    it('clampPhrase', () => {
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

describe('rapid R (Booth pass 3, M12)', () => {
  it('ten presses in a few milliseconds roll the DAW once', async () => {
    const roll = vi.fn(async (): Promise<DawResult> => ok);
    const { hook, actions } = setup(SETUPS.reaper, {}, roll);
    await act(async () => {
      for (let i = 0; i < 10; i++) void hook.result.current.punchAndRoll();
    });
    await settle();
    expect(roll).toHaveBeenCalledTimes(1);
    expect(actions.logPunch).toHaveBeenCalledTimes(1);
    expect(actions.notify.mock.calls.filter(([sentence]) => /^Rolling again/.test(sentence as string))).toHaveLength(1);
  });

  it('a press after the pause rolls again: the guard is a pause, not a lock', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const roll = vi.fn(async (): Promise<DawResult> => ok);
      const { hook } = setup(SETUPS.reaper, {}, roll);
      await act(async () => void hook.result.current.punchAndRoll());
      vi.setSystemTime(Date.now() + 2000);
      await act(async () => void hook.result.current.punchAndRoll());
      expect(roll).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a roll the DAW refused does not hold the next press back', async () => {
    const roll = vi.fn(async (): Promise<DawResult> => ({ ok: false, changed: false, message: 'busy', undoSteps: 0, refused: 'REAPER is busy.' }));
    const { hook } = setup(SETUPS.reaper, {}, roll);
    await act(async () => void hook.result.current.punchAndRoll());
    await act(async () => void hook.result.current.punchAndRoll());
    expect(roll).toHaveBeenCalledTimes(2);
  });
});
