// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoothPunch } from '../../../api/contracts/voiceTracks';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { createOverlayService } from '../../../overlay/overlayService';
import { rollConfirmSpec } from './rollConfirm';
import { rollPlan } from './rollPlan';
import { clampPhrase } from './startFromHere';
import { createTakeHold } from './takeHold';
import { LOOKUP_MS, START_BUSY, useRoll, type RollSession } from './useRoll';

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

  it('a passage nobody recorded says the take goes on from the end', async () => {
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 4 });
    await act(() => hook.result.current.startTake());
    expect(actions.notify).toHaveBeenCalledWith("¶ 3 was not recorded before, so the take goes on from the end of the chapter's audio.");
    expect(actions.beginTake).toHaveBeenCalledExactlyOnceWith();
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

    it('a lookup answered after another phrase was pressed still records its own phrase: the later press was refused, so no wrong voice', async () => {
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
      expect(actions.beginTake).toHaveBeenCalledExactlyOnceWith(20);
      expect(actions.chooseVoice).toHaveBeenCalledExactlyOnceWith('T2');
      expect(actions.notify).toHaveBeenCalledWith(START_BUSY);
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

describe('a start waits for the host: shown, joined, and dropped when the Booth is left (#3284)', () => {
  const found = (p: number): BoothPunch => ({ outcome: 'found', trackGuid: `T${p}`, trackName: `Voice ${p}`, start: p * 10, end: p * 10 + 5 });
  const gate = () => {
    let resolve!: (value: BoothPunch) => void;
    const promise = new Promise<BoothPunch>((r) => (resolve = r));
    return { promise, resolve };
  };

  it('five presses during one lookup make one host call and one take', async () => {
    const late = gate();
    const punchTarget = vi.fn(() => late.promise);
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget });
    const presses: Promise<void>[] = [];
    act(() => {
      for (let i = 0; i < 5; i++) presses.push(hook.result.current.startTake() as Promise<void>);
    });
    late.resolve(found(1));
    await act(() => Promise.all(presses));
    expect(punchTarget).toHaveBeenCalledTimes(1);
    expect(actions.beginTake).toHaveBeenCalledExactlyOnceWith(10);
  });

  it('two quick Start from here presses on the same phrase make one lookup and start once', async () => {
    const punchTarget = vi.fn(async (p: number) => found(p));
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchTarget });
    await act(async () => {
      await Promise.all([hook.result.current.startFromHere(1), hook.result.current.startFromHere(1)]);
    });
    expect(punchTarget).toHaveBeenCalledTimes(1);
    expect(actions.beginTake).toHaveBeenCalledTimes(1);
  });

  it('a call that never settles is joined until the lookup limit, then a retry asks the host again', async () => {
    vi.useFakeTimers();
    try {
      const punchTarget = vi.fn(() => new Promise<BoothPunch>(() => {}));
      const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget });
      act(() => void hook.result.current.startTake());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LOOKUP_MS - 100);
      });
      act(() => void hook.result.current.startTake());
      expect(punchTarget).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      // The first press ended with its sentence at the limit: the next one is a new press and asks the host again.
      expect(actions.notify).toHaveBeenCalledWith(expect.stringContaining('did not come back in time'));
      act(() => void hook.result.current.startTake());
      expect(punchTarget).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a press for the same phrase after the lookup answered, while the take is being handed over, is that press: no second lookup, voice or message', async () => {
    const take = gate();
    const punchTarget = vi.fn(async (p: number) => found(p));
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget });
    actions.beginTake.mockImplementation(async () => {
      await take.promise;
    });
    let first: Promise<unknown> = Promise.resolve();
    act(() => {
      first = hook.result.current.startTake();
    });
    await waitFor(() => expect(actions.beginTake).toHaveBeenCalledTimes(1));
    await act(async () => {
      await hook.result.current.startTake();
      await hook.result.current.startFromHere(1);
    });
    expect(punchTarget).toHaveBeenCalledTimes(1);
    expect(actions.chooseVoice).toHaveBeenCalledTimes(1);
    expect(actions.chooseStart).not.toHaveBeenCalled();
    expect(actions.notify).toHaveBeenCalledTimes(1);
    take.resolve(found(1));
    await act(() => first);
  });

  it('says a lookup is out while it waits, and not before or after', async () => {
    const late = gate();
    const { hook } = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: () => late.promise });
    expect(hook.result.current.lookingUp).toBe(false);
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = hook.result.current.startTake();
    });
    expect(hook.result.current.lookingUp).toBe(true);
    late.resolve(found(1));
    await act(() => done);
    expect(hook.result.current.lookingUp).toBe(false);
  });

  it('unmounting while the lookup is out starts no take', async () => {
    const late = gate();
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: () => late.promise });
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = hook.result.current.startTake();
    });
    hook.unmount();
    late.resolve(found(1));
    await done;
    expect(actions.beginTake).not.toHaveBeenCalled();
    expect(actions.chooseVoice).not.toHaveBeenCalled();
    expect(actions.notify).not.toHaveBeenCalled();
  });

  it('unmounting during Start from here (the path of R and the menu item) starts no take', async () => {
    const late = gate();
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchTarget: () => late.promise });
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = hook.result.current.startFromHere(1);
    });
    hook.unmount();
    late.resolve(found(1));
    await done;
    expect(actions.beginTake).not.toHaveBeenCalled();
  });

  it('a chapter change (cancelStart) drops the pending start', async () => {
    const late = gate();
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: () => late.promise });
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = hook.result.current.startTake();
    });
    act(() => hook.result.current.cancelStart());
    expect(hook.result.current.lookingUp).toBe(false);
    late.resolve(found(1));
    await done;
    expect(actions.beginTake).not.toHaveBeenCalled();
  });

  it('leaving while the punch-in question is open starts no take', async () => {
    const { hook, actions, dialog } = setup(SETUPS.audacity, { recording: false, punchAt: 1 });
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = hook.result.current.startTake();
    });
    await waitFor(() => expect(dialog()).toBeTruthy());
    hook.unmount();
    await act(async () => dialog()?.answer(true));
    await done;
    expect(actions.beginTake).not.toHaveBeenCalled();
  });

  it('leaving while the voice is being chosen starts no take', async () => {
    const voice = gate();
    const { hook, actions } = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: async (p) => found(p) });
    actions.chooseVoice.mockImplementation(async () => (await voice.promise, true));
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = hook.result.current.startTake();
    });
    await waitFor(() => expect(actions.chooseVoice).toHaveBeenCalledTimes(1));
    hook.unmount();
    voice.resolve(found(1));
    await done;
    expect(actions.beginTake).not.toHaveBeenCalled();
  });

  it('repeated Start from here on the same phrase under a refused plan makes one lookup (the in-flight map alone)', async () => {
    const late = gate();
    const punchTarget = vi.fn(() => late.promise);
    const { hook } = setup(SETUPS.reaperOff, { recording: false, punchTarget });
    const presses: Promise<unknown>[] = [];
    act(() => {
      for (let i = 0; i < 3; i++) presses.push(hook.result.current.startFromHere(1));
    });
    expect(punchTarget).toHaveBeenCalledTimes(1);
    late.resolve({ outcome: 'never_recorded' });
    await act(() => Promise.all(presses));
  });

  it('a Start from here on another phrase under a refused plan does not leave the first press standing: the next press asks again', async () => {
    const first = gate();
    const punchTarget = vi.fn((p: number) => (p === 1 ? first.promise : Promise.resolve(found(p))));
    const { hook } = setup(SETUPS.reaperOff, { recording: false, punchAt: 1, punchTarget });
    let pressed: Promise<unknown> = Promise.resolve();
    act(() => {
      pressed = hook.result.current.startTake();
    });
    await act(() => hook.result.current.startFromHere(2));
    first.resolve(found(1));
    await act(() => pressed);
    const asked = punchTarget.mock.calls.length;
    await act(() => hook.result.current.startTake());
    expect(punchTarget.mock.calls.length).toBeGreaterThan(asked);
  });

  describe('pressUnderway: the reading may not move while a press is under way (#3338)', () => {
    const press = (h: ReturnType<typeof setup>, kind: 'plain' | 'phrase') => {
      let pressed: Promise<unknown> = Promise.resolve();
      act(() => {
        pressed = h.hook.result.current.startTake(kind === 'plain' ? undefined : 1);
      });
      return () => pressed;
    };
    for (const kind of ['plain', 'phrase'] as const) {
      it(`${kind} press, DAW that can punch: true from the press until the take is handed over, then false`, async () => {
        const late = gate();
        const h = setup(SETUPS.reaper, {
          recording: false,
          punchAt: kind === 'plain' ? null : 1,
          punchTarget: (p) => (p === 1 ? late.promise : Promise.resolve(found(p))),
        });
        expect(h.hook.result.current.pressUnderway()).toBe(false);
        let handOver = () => {};
        h.actions.beginTake.mockImplementation(() => new Promise<void>((resolve) => (handOver = resolve)));
        const done = press(h, kind);
        expect(h.hook.result.current.pressUnderway()).toBe(true);
        late.resolve(found(1));
        await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
        // The checks and the record start are out too.
        expect(h.hook.result.current.pressUnderway()).toBe(true);
        handOver();
        await act(() => done() as Promise<void>);
        expect(h.hook.result.current.pressUnderway()).toBe(false);
      });
    }
    it('a refused lookup, a cancel and an unanswered lookup end it', async () => {
      const h = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: () => new Promise(() => {}) });
      press(h, 'phrase');
      expect(h.hook.result.current.pressUnderway()).toBe(true);
      act(() => h.hook.result.current.cancelStart());
      expect(h.hook.result.current.pressUnderway()).toBe(false);
      vi.useFakeTimers();
      try {
        const slow = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: () => new Promise(() => {}) });
        press(slow, 'phrase');
        expect(slow.hook.result.current.pressUnderway()).toBe(true);
        await act(async () => void (await vi.advanceTimersByTimeAsync(LOOKUP_MS + 10)));
        expect(slow.hook.result.current.pressUnderway()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
    it('during a take it is false: the reading follows the voice, even for a press that has not ended yet', () => {
      const h = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: () => new Promise(() => {}) });
      press(h, 'phrase');
      expect(h.hook.result.current.pressUnderway()).toBe(true);
      h.hook.rerender({ ...h.session, recording: true, punchAt: 1, punchTarget: () => new Promise(() => {}) });
      expect(h.hook.result.current.pressUnderway()).toBe(false);
    });
    it('a DAW that cannot punch keeps its own way (#3329): false even with a press waiting', () => {
      const h = setup(SETUPS.reaperOff, { recording: false, punchAt: 1, punchTarget: () => new Promise(() => {}) });
      press(h, 'phrase');
      expect(h.hook.result.current.pressUnderway()).toBe(false);
    });
  });

  describe('a second Start from here on another phrase while a press is under way is refused before it changes anything (#3320)', () => {
    type Hook = ReturnType<typeof setup>;
    const untouched = (h: Hook, punchTarget: ReturnType<typeof vi.fn>) => {
      expect(punchTarget).toHaveBeenCalledTimes(1);
      expect(h.actions.chooseStart).not.toHaveBeenCalledWith(2, expect.anything());
      expect(h.actions.chooseVoice).not.toHaveBeenCalledWith('T2');
      expect(h.actions.notify.mock.calls.map((c) => c[0] as string).filter((text) => text === 'Starting from ¶ 2')).toHaveLength(0);
      expect(h.actions.notify.mock.calls.filter((c) => c[0] === START_BUSY)).toHaveLength(1);
    };
    const kinds = {
      'a plain Record press with a start chosen': (h: Hook) => h.hook.result.current.startTake(),
      'a Start from here press': (h: Hook) => h.hook.result.current.startFromHere(1),
    } as const;
    for (const [kind, first] of Object.entries(kinds)) {
      for (const [where, caps] of [['a DAW that can punch', SETUPS.reaper]] as const) {
        it(`${kind}, ${where}: the lookup is out`, async () => {
          const late = gate();
          const punchTarget = vi.fn((p: number) => (p === 1 ? late.promise : Promise.resolve(found(p))));
          const h = setup(caps, { recording: false, punchAt: 1, punchTarget });
          let pressed: Promise<unknown> = Promise.resolve();
          act(() => {
            pressed = first(h) as Promise<unknown>;
          });
          await act(() => h.hook.result.current.startFromHere(2));
          untouched(h, punchTarget);
          late.resolve(found(1));
          await act(() => pressed);
          if (caps === SETUPS.reaper) expect(h.actions.beginTake).toHaveBeenCalledExactlyOnceWith(10);
          // The first press is over: the next one on the other phrase works as usual.
          await act(() => h.hook.result.current.startFromHere(2));
          expect(punchTarget).toHaveBeenCalledTimes(2);
          if (caps === SETUPS.reaper) expect(h.actions.chooseStart).toHaveBeenLastCalledWith(2, true);
          expect(h.actions.notify.mock.calls.filter((c) => c[0] === START_BUSY)).toHaveLength(1);
        });
      }
      it(`${kind}: the take is being handed over (the check or the record start is out)`, async () => {
        const take = gate();
        const punchTarget = vi.fn(async (p: number) => found(p));
        const h = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget });
        h.actions.beginTake.mockImplementation(async () => {
          await take.promise;
        });
        let pressed: Promise<unknown> = Promise.resolve();
        act(() => {
          pressed = first(h) as Promise<unknown>;
        });
        await waitFor(() => expect(h.actions.beginTake).toHaveBeenCalledTimes(1));
        await act(() => h.hook.result.current.startFromHere(2));
        untouched(h, punchTarget);
        expect(h.actions.beginTake).toHaveBeenCalledTimes(1);
        take.resolve({ outcome: 'never_recorded' });
        await act(() => pressed);
        await act(() => h.hook.result.current.startFromHere(2));
        expect(punchTarget).toHaveBeenCalledTimes(2);
        expect(h.actions.beginTake).toHaveBeenCalledTimes(2);
      });
    }

    it('a plain press under way (no start chosen), then Start from here on a phrase: refused, one take, no lookup', async () => {
      const take = gate();
      const punchTarget = vi.fn(async (p: number) => found(p));
      const h = setup(SETUPS.reaper, { recording: false, punchAt: null, punchTarget });
      h.actions.beginTake.mockImplementation(async () => {
        await take.promise;
      });
      let pressed: Promise<unknown> = Promise.resolve();
      act(() => {
        pressed = h.hook.result.current.startTake();
      });
      await waitFor(() => expect(h.actions.beginTake).toHaveBeenCalledTimes(1));
      await act(() => h.hook.result.current.startFromHere(2));
      await act(() => h.hook.result.current.punchAndRoll());
      await act(() => h.hook.result.current.startTake());
      expect(h.actions.beginTake).toHaveBeenCalledTimes(1);
      expect(punchTarget).not.toHaveBeenCalled();
      expect(h.actions.chooseStart).not.toHaveBeenCalled();
      expect(h.actions.notify.mock.calls.filter((c) => c[0] === START_BUSY)).toHaveLength(2);
      expect(h.actions.notify.mock.calls.filter((c) => String(c[0]).startsWith('Starting from'))).toHaveLength(0);
      take.resolve({ outcome: 'never_recorded' });
      await act(() => pressed);
      await act(() => h.hook.result.current.startFromHere(2));
      expect(punchTarget).toHaveBeenCalledTimes(1);
      expect(h.actions.beginTake).toHaveBeenCalledTimes(2);
    });

    for (const [name, again] of [
      ['the same phrase', 1],
      ['another phrase', 2],
    ] as const) {
      it(`a press pending when the chapter changes does not hold the next chapter's press (${name}): neither joined nor refused`, async () => {
        const late = gate();
        const punchTarget = vi.fn((p: number) => (p === 1 && punchTarget.mock.calls.length === 1 ? late.promise : Promise.resolve(found(p))));
        const h = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget });
        let pressed: Promise<unknown> = Promise.resolve();
        act(() => {
          pressed = h.hook.result.current.startTake();
        });
        act(() => h.hook.result.current.cancelStart());
        await act(() => h.hook.result.current.startFromHere(again));
        expect(h.actions.notify).not.toHaveBeenCalledWith(START_BUSY);
        expect(punchTarget).toHaveBeenCalledTimes(2);
        expect(h.actions.beginTake).toHaveBeenCalledExactlyOnceWith(again * 10);
        late.resolve(found(1));
        await act(() => pressed);
        expect(h.actions.beginTake).toHaveBeenCalledTimes(1);
      });
    }

    describe("a DAW that cannot punch keeps main's behaviour after a never-recorded Start from here (#3329 owns it)", () => {
      const first = async () => {
        const punchTarget = vi.fn(async (): Promise<BoothPunch> => ({ outcome: 'never_recorded' }));
        const late = gate();
        punchTarget.mockImplementationOnce(() => late.promise as Promise<BoothPunch>);
        const h = setup(SETUPS.reaperOff, { recording: false, punchAt: null, punchTarget });
        let pressed: Promise<unknown> = Promise.resolve();
        act(() => {
          pressed = h.hook.result.current.startTake(1);
        });
        return { h, punchTarget, finish: async () => (late.resolve({ outcome: 'never_recorded' }), act(() => pressed as Promise<void>)) };
      };
      it('(i) Start from here on another phrase is not refused: it looks up and says the plan sentence', async () => {
        const { h, punchTarget, finish } = await first();
        await act(() => h.hook.result.current.startFromHere(2));
        expect(h.actions.notify).not.toHaveBeenCalledWith(START_BUSY);
        expect(punchTarget.mock.calls.some((c) => (c as unknown[])[0] === 2)).toBe(true);
        await finish();
      });
      it('(ii) a plain press goes to beginTake and is not refused', async () => {
        const { h, finish } = await first();
        await act(() => h.hook.result.current.startTake(undefined));
        expect(h.actions.notify).not.toHaveBeenCalledWith(START_BUSY);
        expect(h.actions.beginTake).toHaveBeenCalled();
        await finish();
      });
    });

    it('a plain press during a Start from here lookup on a DAW that cannot punch is not refused: it starts the take once, as before (#3329 owns this path)', async () => {
      const late = gate();
      const punchTarget = vi.fn(() => late.promise);
      const h = setup(SETUPS.reaperOff, { recording: false, punchAt: null, punchTarget });
      let pressed: Promise<unknown> = Promise.resolve();
      act(() => {
        pressed = h.hook.result.current.startFromHere(1);
      });
      await act(() => h.hook.result.current.startTake());
      expect(h.actions.beginTake).toHaveBeenCalledTimes(1);
      expect(h.actions.notify).not.toHaveBeenCalledWith(START_BUSY);
      late.resolve(found(1));
      await act(() => pressed);
    });

    it('a plain press during a Start from here lookup on a DAW that can punch is told, once, and starts nothing', async () => {
      const late = gate();
      const punchTarget = vi.fn(() => late.promise);
      const h = setup(SETUPS.reaper, { recording: false, punchAt: null, punchTarget });
      let pressed: Promise<unknown> = Promise.resolve();
      act(() => {
        pressed = h.hook.result.current.startFromHere(1);
      });
      await act(() => h.hook.result.current.startTake());
      expect(h.actions.notify.mock.calls.filter((c) => c[0] === START_BUSY)).toHaveLength(1);
      expect(h.actions.beginTake).not.toHaveBeenCalled();
      late.resolve(found(1));
      await act(() => pressed);
    });

    it('Start from here while the take is being handed over with recording true still rolls', async () => {
      const take = gate();
      const h = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget: async (p) => found(p) });
      h.actions.beginTake.mockImplementation(async () => {
        await take.promise;
      });
      let pressed: Promise<unknown> = Promise.resolve();
      act(() => {
        pressed = h.hook.result.current.startTake();
      });
      await waitFor(() => expect(h.actions.beginTake).toHaveBeenCalledTimes(1));
      h.hook.rerender({ ...h.session, recording: true, punchAt: 1 });
      await act(() => h.hook.result.current.startFromHere(2));
      expect(h.actions.roll).toHaveBeenCalledTimes(1);
      expect(h.actions.notify).toHaveBeenCalledWith('Rolling again from ¶ 2');
      expect(h.actions.notify).not.toHaveBeenCalledWith(START_BUSY);
      take.resolve({ outcome: 'never_recorded' });
      await act(() => pressed);
    });

    it('the same phrase still joins: no sentence', async () => {
      const late = gate();
      const punchTarget = vi.fn(() => late.promise);
      const h = setup(SETUPS.reaper, { recording: false, punchTarget });
      const presses: Promise<unknown>[] = [];
      act(() => {
        for (let i = 0; i < 3; i++) presses.push(h.hook.result.current.startFromHere(1));
      });
      late.resolve(found(1));
      await act(() => Promise.all(presses));
      expect(punchTarget).toHaveBeenCalledTimes(1);
      expect(h.actions.notify.mock.calls.filter((c) => c[0] === START_BUSY)).toHaveLength(0);
    });

    it('a press after the lookup limit works again', async () => {
      vi.useFakeTimers();
      try {
        const punchTarget = vi.fn((p: number) => (p === 1 ? new Promise<BoothPunch>(() => {}) : Promise.resolve(found(p))));
        const h = setup(SETUPS.reaper, { recording: false, punchAt: 1, punchTarget });
        let pressed: Promise<unknown> = Promise.resolve();
        act(() => {
          pressed = h.hook.result.current.startTake();
        });
        await act(() => h.hook.result.current.startFromHere(2));
        expect(h.actions.notify).toHaveBeenCalledWith(START_BUSY);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(LOOKUP_MS + 1);
        });
        await act(() => pressed);
        await act(() => h.hook.result.current.startFromHere(2));
        expect(punchTarget).toHaveBeenCalledTimes(2);
        expect(h.actions.beginTake).toHaveBeenCalledWith(20);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('a press stays one press until its take has been handed over (return await)', () => {
    const handedOver = async (setupCaps: typeof SETUPS.reaper, punchTarget: RollSession['punchTarget'], over: Partial<RollSession> = {}) => {
      const take = gate();
      const spy = vi.fn(punchTarget);
      const { hook, actions } = setup(setupCaps, { recording: false, punchAt: 1, punchTarget: spy, ...over });
      actions.beginTake.mockImplementation(async () => {
        await take.promise;
      });
      let first: Promise<unknown> = Promise.resolve();
      act(() => {
        first = hook.result.current.startTake();
      });
      await waitFor(() => expect(actions.beginTake).toHaveBeenCalledTimes(1));
      await act(() => hook.result.current.startTake());
      expect(spy).toHaveBeenCalledTimes(1);
      take.resolve({ outcome: 'never_recorded' });
      await act(() => first);
    };
    it('a passage nobody recorded', () => handedOver(SETUPS.reaper, async () => ({ outcome: 'never_recorded' })));
    it('a punch the DAW cannot do', () => handedOver(SETUPS.reaperOff, async (p) => ({ outcome: 'found', trackGuid: 'T', start: p * 10, end: p * 10 + 5 })));
  });
});
