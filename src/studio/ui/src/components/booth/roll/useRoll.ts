import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import type { BoothPunch } from '../../../api/contracts/voiceTracks';
import type { OverlayService } from '../../../overlay/overlayService';
import { rollConfirmSpec } from './rollConfirm';
import { rollPlan } from './rollPlan';
import { clampPhrase } from './startFromHere';
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
  /** Where the phrase was recorded before (the host reads it from the recording check and the DAW's items), on which track. */
  punchTarget: (phrase: number) => Promise<BoothPunch>;
  /** Seconds into the running take. */
  takeSeconds: number;
};

/** What the Booth does when a command settles. */
export type RollActions = TakeControls & {
  roll: RollFn;
  /** Starts a take, at `punchAt` seconds when it is a punch. */
  beginTake: (punchAt?: number) => void | Promise<void>;
  /** Makes the voice the passage was recorded on the one the take records on; false (with the reason said) when it could not. */
  chooseVoice?: (trackGuid: string) => Promise<boolean>;
  /** Marks the phrase the next roll starts from; before a take, `move` also moves the reading position there. */
  chooseStart: (phrase: number, move: boolean) => void;
  /** Lets go of the phrase chosen with Start from here. */
  clearStart?: () => void;
  /** Moves the reading position to the phrase a roll started from. */
  moveTo: (phrase: number) => void;
  /** The punch for the passage map: the paragraph rolled from and the seconds into the take. */
  logPunch: (punch: { paragraph: number; seconds: number }) => void;
  notify: (sentence: string) => void;
};

/** How long the Booth waits for the host to say where a passage was recorded (the host's own limit is shorter): then it says so and starts nothing. */
export const LOOKUP_MS = 8000;

const LOOKUP_FAILED = 'Where this passage was recorded could not be read, so no take was started. Try again.';
const LOOKUP_SLOW = 'Where this passage was recorded did not come back in time, so no take was started. Try again.';

/** How long after a roll went through another is ignored (milliseconds). */

const ROLL_PAUSE_MS = 700;

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

  // One roll at a time, and a short pause after one went through: a key that repeats, or a narrator pressing R again to be sure, must not
  // stop and restart the DAW's take ten times in a second. A roll the DAW refused leaves no pause: the next press may try again.
  const rolling = useRef(false);
  const lastRollAt = useRef(0);
  const doRoll = useCallback(async (to: number, confirmed: boolean) => {
    const s = sessionRef.current;
    if (!s.recording) return;
    if (rolling.current || Date.now() - lastRollAt.current < ROLL_PAUSE_MS) return;
    rolling.current = true;
    try {
      const seconds = s.takeSeconds;
      const result = await actionsRef.current.roll(to, { confirmed });
      if (!result.ok) {
        actionsRef.current.notify(result.refused ?? result.message);
        return;
      }
      lastRollAt.current = Date.now();
      actionsRef.current.logPunch({ paragraph: s.paragraphOf(to), seconds });
      actionsRef.current.moveTo(to);
      actionsRef.current.notify(`Rolling again from ¶ ${s.paragraphOf(to) + 1}`);
    } finally {
      rolling.current = false;
    }
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

  /**
   * The host's answer for a phrase, or a refusal that says why there is none: a failed read and one that never comes back are both sentences.
   * A second ask for a phrase whose answer is still out joins it: one host call per phrase, however many presses.
   */
  const inFlight = useRef(new Map<number, Promise<BoothPunch>>());
  const lookUp = useCallback((phrase: number): Promise<BoothPunch> => {
    const joined = inFlight.current.get(phrase);
    if (joined) return joined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<BoothPunch>((resolve) => {
      timer = setTimeout(() => resolve({ outcome: 'refused', reason: 'timeout', message: LOOKUP_SLOW }), LOOKUP_MS);
    });
    const asked = sessionRef.current.punchTarget(phrase).catch((): BoothPunch => ({ outcome: 'refused', reason: 'failed', message: LOOKUP_FAILED }));
    const answer = Promise.race([asked, slow]).finally(() => {
      clearTimeout(timer);
      inFlight.current.delete(phrase);
    });
    inFlight.current.set(phrase, answer);
    return answer;
  }, []);
  /** Each start gets a number; an answer that comes back after a newer start (or after a take began, or after the Booth was left) is dropped, so a slow lookup never starts a take. */
  const latestStart = useRef(0);
  /** True while the newest start waits for the host's answer: Record shows it, so a slow lookup is never a button that does nothing. */
  const [lookingUp, setLookingUp] = useState(false);
  const alive = useRef(true);
  /** Drops every start still waiting: the Booth was left, or the chapter changed. Nothing they were waiting for may begin a take. */
  const cancelStart = useCallback(() => {
    latestStart.current += 1;
    inFlight.current.clear();
    setLookingUp(false);
  }, []);
  useEffect(() => {
    alive.current = true;
    const lookups = inFlight.current;
    return () => {
      alive.current = false;
      latestStart.current += 1;
      lookups.clear();
    };
  }, []);
  /** Looks `phrase` up for start number `mine`; the wait shows until `endWait(mine)`, which the start calls once nothing is left to await for it. */
  const lookUpFor = useCallback(
    (_mine: number, phrase: number): Promise<BoothPunch> => {
      setLookingUp(true);
      return lookUp(phrase);
    },
    [lookUp],
  );
  /** Ends the wait for start `mine`, unless a newer start owns it now. */
  const endWait = useCallback((mine: number) => {
    if (mine === latestStart.current && alive.current) setLookingUp(false);
  }, []);
  /** This start is out of date: a newer one was chosen, a take began (the Space key, the DAW's own Record) or the Booth was left. */
  const outdated = (mine: number) => mine !== latestStart.current || sessionRef.current.recording;

  const startTakeRef = useRef<(from?: number) => Promise<void>>(async () => {});
  const startFromHereRef = useRef<(unit: number) => Promise<void>>(async () => {});

  /** R: while a take runs, roll again from the phrase chosen with Start from here, otherwise from the current one; before one, start the take there in the same press. */
  const punchAndRoll = useCallback(async () => {
    const s = sessionRef.current;
    const from = s.punchAt ?? s.phrase;
    if (!s.recording) return startFromHereRef.current(from);
    return rollFrom(from);
  }, [rollFrom]);

  /** Start from here (right-click on a phrase): while a take runs it goes through the same plan as R; before one it marks the start. */
  const startFromHere = useCallback(
    async (unit: number) => {
      const s = sessionRef.current;
      const to = clampPhrase(unit, s.phraseCount);
      // Before a take, a start the DAW could not punch to is not armed: the narrator is told now, not after Space, where the take will start.
      const plan = rollPlan(s.capabilities);
      if (!s.recording && plan.kind === 'refused') {
        const mine = ++latestStart.current;
        const looked = await lookUpFor(mine, to).finally(() => endWait(mine));
        if (outdated(mine)) return;
        if (looked.outcome === 'found') {
          actionsRef.current.notify(`${plan.reason} The next take starts from the end of what is already there, not from ¶ ${s.paragraphOf(to) + 1}.`);
          return;
        }
      }
      actionsRef.current.chooseStart(to, !s.recording);
      if (s.recording) return rollFrom(to);
      // Not recording yet: the text moves to the phrase (chooseStart), and the take starts there now, with the DAW moved to that spot first,
      // so the narrator never has to find the place and click in the DAW with a live microphone.
      actionsRef.current.notify(`Starting from ¶ ${s.paragraphOf(to) + 1}`);
      return startTakeRef.current(to);
    },
    [rollFrom, lookUpFor, endWait],
  );
  startFromHereRef.current = startFromHere;

  /** One start, from its lookup to the take's first step. */
  const startAt = useCallback(
    async (mine: number, at: number, s: RollSession) => {
      const target = await lookUpFor(mine, at);
      if (outdated(mine)) return;
      if (target.outcome === 'never_recorded') {
        // Not a punch: said, so a narrator never thinks earlier work is being recorded over.
        actionsRef.current.notify(`¶ ${s.paragraphOf(at) + 1} was not recorded before, so the take goes on from the end of the chapter's audio.`);
        return actionsRef.current.beginTake();
      }
      if (target.outcome !== 'found' || target.start === undefined) {
        actionsRef.current.notify(target.message ?? 'Where this passage was recorded is not known, so no take was started.');
        actionsRef.current.clearStart?.();
        return;
      }
      const plan = rollPlan(s.capabilities);
      if (plan.kind === 'refused') {
        // A punch the DAW cannot do must not leave the narrator unable to record at all: the chosen start is let go, the take starts at the end of
        // what is recorded, and the sentence says why.
        actionsRef.current.notify(`${plan.reason} Recording from the end of what is already there instead.`);
        actionsRef.current.clearStart?.();
        return actionsRef.current.beginTake();
      }
      if (plan.kind === 'confirm' && !(await ask(`Punch in at ¶ ${s.paragraphOf(at) + 1}?`, 'Punch in', plan.dawName))) return;
      if (outdated(mine)) return;
      if (target.trackGuid && actionsRef.current.chooseVoice && !(await actionsRef.current.chooseVoice(target.trackGuid))) return;
      if (outdated(mine)) return;
      // The narrator is told which track is recorded over before the take starts, never only after.
      actionsRef.current.notify(`Recording over ¶ ${s.paragraphOf(at) + 1}${target.trackName ? ` on ${target.trackName}` : ''}.`);
      return actionsRef.current.beginTake(target.start);
    },
    [ask, lookUpFor],
  );

  /**
   * Starts the take. A phrase chosen with Start from here is looked up (the host reads where it was recorded before): found, the take records
   * over exactly that spot, on the voice that read it, and follows the plan; never recorded, it is not a punch and the take goes on from the end
   * of the chapter; refused, the sentence is shown and nothing starts (a start is never guessed).
   */
  const startTake = useCallback(
    async (from?: number) => {
      const s = sessionRef.current;
      const at = from ?? s.punchAt;
      if (at == null || at >= s.phraseCount) return actionsRef.current.beginTake();
      const mine = ++latestStart.current;
      try {
        return await startAt(mine, at, s);
      } finally {
        endWait(mine);
      }
    },
    [startAt, endWait],
  );
  startTakeRef.current = startTake;

  /** `hold` is the one switch for the take: the page holds it for an open menu too, so neither resumes what the other still holds. */
  return { punchAndRoll, startFromHere, startTake, cancelStart, lookingUp, hold: hold.current };
}
