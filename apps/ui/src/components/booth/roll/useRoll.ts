import { useCallback, useRef } from 'react';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import type { OverlayService } from '../../../overlay/overlayService';
import { rollConfirmSpec } from './rollConfirm';
import { rollPlan } from './rollPlan';
import { clampPhrase, isPunch } from './startFromHere';
import { createTakeHold, type TakeControls } from './takeHold';

/** The roll itself, typed here until `DawClient.roll` exists (SN-D6x). `confirmed` is true when the narrator answered the question. */
type RollFn = (phrase: number, options: { confirmed: boolean }) => Promise<DawResult>;

/** What the Booth knows of the chapter and the take. Read when a command runs, so a stale render cannot roll from the wrong phrase. */
export type RollSession = {
  capabilities: DawCapabilities | null;
  recording: boolean;
  phraseCount: number;
  /** The phrase the reading position is on. */
  phrase: number;
  /** The phrase chosen with Start from here, or null. */
  punchAt: number | null;
  /** The paragraph (0-based) a phrase belongs to. */
  paragraphOf: (phrase: number) => number;
  /** Where a phrase sits in the chapter's audio, in seconds. */
  secondsOf: (phrase: number) => number;
  /** Where the last item on the chapter's track ends, in seconds. */
  recordedEnd: number;
  /** Seconds into the running take. */
  takeSeconds: number;
  /** Why Record cannot start right now, in the Record control's own sentence; '' when it can. A key that needs a take says this, not a guess. */
  recordRefusal?: string;
};

/** What the Booth does when a command settles. */
export type RollActions = TakeControls & {
  roll: RollFn;
  /** Starts a take, at `punchAt` seconds when it is a punch. */
  beginTake: (punchAt?: number) => void | Promise<void>;
  /** Marks the phrase the next roll starts from; before a take, `move` also moves the reading position there. */
  chooseStart: (phrase: number, move: boolean) => void;
  /** Moves the reading position to the phrase a roll started from. */
  moveTo: (phrase: number) => void;
  /** The punch for the passage map: the paragraph rolled from and the seconds into the take. */
  logPunch: (punch: { paragraph: number; seconds: number }) => void;
  notify: (sentence: string) => void;
};

/**
 * Roll again, Start from here and a punch-in over the DAW's roll. One plan (`rollPlan`) decides every path: a roll the DAW keeps as a
 * take just runs, a destructive one asks once with the take held, a refused one
 * shows the capability's sentence. Answering no resumes the take and rolls nothing.
 */
export function useRoll(session: RollSession, actions: RollActions, { overlay }: { overlay: Pick<OverlayService, 'confirm'> }) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const asking = useRef(false);
  const hold = useRef(createTakeHold({ pause: () => actionsRef.current.pause(), resume: () => actionsRef.current.resume() }));

  const ask = useCallback(
    async (title: string, confirmLabel: string, dawName: string): Promise<boolean> => {
      if (asking.current) return false;
      asking.current = true;
      const { recording } = sessionRef.current;
      const release = recording ? hold.current() : null;
      try {
        return await overlay.confirm(rollConfirmSpec({ title, confirmLabel, dawName, recording }));
      } finally {
        release?.();
        asking.current = false;
      }
    },
    [overlay],
  );

  const doRoll = useCallback(async (to: number, confirmed: boolean) => {
    const s = sessionRef.current;
    if (!s.recording) return;
    const seconds = s.takeSeconds;
    const result = await actionsRef.current.roll(to, { confirmed });
    if (!result.ok) {
      actionsRef.current.notify(result.refused ?? result.message);
      return;
    }
    actionsRef.current.logPunch({ paragraph: s.paragraphOf(to), seconds });
    actionsRef.current.moveTo(to);
    actionsRef.current.notify(`Rolling again from ¶ ${s.paragraphOf(to) + 1}`);
  }, []);

  const rollFrom = useCallback(
    async (from: number) => {
      const s = sessionRef.current;
      const to = clampPhrase(from, s.phraseCount);
      const plan = rollPlan(s.capabilities);
      if (plan.kind === 'refused') return actionsRef.current.notify(plan.reason);
      if (plan.kind === 'confirm') {
        if (!(await ask(`Roll again from ¶ ${s.paragraphOf(to) + 1}?`, 'Roll again', plan.dawName))) return;
        return doRoll(to, true);
      }
      return doRoll(to, false);
    },
    [ask, doRoll],
  );

  /** R: roll again from the phrase chosen with Start from here, otherwise from the current one. */
  const punchAndRoll = useCallback(async () => {
    const s = sessionRef.current;
    if (!s.recording) return actionsRef.current.notify(s.recordRefusal || 'Start recording first.');
    return rollFrom(s.punchAt ?? s.phrase);
  }, [rollFrom]);

  /** Start from here (right-click on a phrase): while a take runs it goes through the same plan as R; before one it marks the start. */
  const startFromHere = useCallback(
    async (unit: number) => {
      const s = sessionRef.current;
      const to = clampPhrase(unit, s.phraseCount);
      actionsRef.current.chooseStart(to, !s.recording);
      if (s.recording) return rollFrom(to);
      actionsRef.current.notify(`Starting from ¶ ${s.paragraphOf(to) + 1}`);
    },
    [rollFrom],
  );

  /** Starts the take: a phrase chosen inside what is recorded is a punch-in and follows the plan; anywhere else it starts at the end. */
  const startTake = useCallback(async () => {
    const s = sessionRef.current;
    const at = s.punchAt;
    if (at == null || at >= s.phraseCount || !isPunch({ phrase: at, seconds: s.secondsOf(at), recordedEnd: s.recordedEnd }))
      return actionsRef.current.beginTake();
    const seconds = Math.round(s.secondsOf(at));
    const plan = rollPlan(s.capabilities);
    if (plan.kind === 'refused') return actionsRef.current.notify(plan.reason);
    if (plan.kind === 'confirm' && !(await ask(`Punch in at ¶ ${s.paragraphOf(at) + 1}?`, 'Punch in', plan.dawName))) return;
    return actionsRef.current.beginTake(seconds);
  }, [ask]);

  /** `hold` is the one switch for the take: the page holds it for an open menu too, so neither resumes what the other still holds. */
  return { punchAndRoll, startFromHere, startTake, hold: hold.current };
}
