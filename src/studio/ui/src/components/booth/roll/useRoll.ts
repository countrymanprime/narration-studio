import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import type { BoothPunch } from '../../../api/contracts/voiceTracks';
import type { OverlayService } from '../../../overlay/overlayService';
import { PRESS_NOTE_TOPIC } from '../record/pressLimits';
import { sentenceOr } from '../record/sentenceOr';
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
  notify: (sentence: string, topic?: string) => void;
  /** Says why the press ended without a take (a refusal, a lookup that failed or ran out): one message that stays until dismissed and takes the press's notes away. */
  refuse: (sentence: string) => void;
};

/** How long the Booth waits for the host to say where a passage was recorded (the host's own limit is shorter): then it says so and starts nothing. */
export const LOOKUP_MS = 8000;

const NOT_KNOWN = 'Where this passage was recorded is not known, so no take was started.';
const LOOKUP_FAILED = 'Where this passage was recorded could not be read, so no take was started. No start is chosen now: choose the phrase again to retry.';
const LOOKUP_SLOW =
  'Where this passage was recorded did not come back in time, so no take was started. No start is chosen now: choose the phrase again to retry.';

/** Said when a press (Start from here, R, Punch and roll, Space) is not the one already under way before a take; nothing is changed. */
export const START_BUSY = 'A take is already starting, so that press was ignored.';

/** Said when the narrator tries to move the reading (Resume at, the arrow keys, Next or Back one phrase, a word) while a press is under way: the take records where the press chose, so the reading stays there. */
export const START_BUSY_MOVE = 'A take is already starting, so the reading stays where it is.';

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
        actionsRef.current.refuse(sentenceOr(result.refused, sentenceOr(result.message, 'The DAW refused to roll again.')));
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
      if (plan.kind === 'refused') return actionsRef.current.refuse(plan.reason);
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
   * A second ask for a phrase whose answer is still out joins it (one host call per phrase, however many presses); the entry ends with the
   * answer or at LOOKUP_MS, so a retry after a call that never came asks the host again.
   */
  const inFlight = useRef(new Map<number, Promise<BoothPunch>>());
  const lookUp = useCallback((phrase: number): Promise<BoothPunch> => {
    const joined = inFlight.current.get(phrase);
    if (joined) return joined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<BoothPunch>((resolve) => {
      timer = setTimeout(() => resolve({ outcome: 'refused', reason: 'timeout', message: LOOKUP_SLOW }), LOOKUP_MS);
    });
    // An async wrapper: a `punchTarget` that throws at once is a failed read like any other.
    const asked = (async () => sessionRef.current.punchTarget(phrase))().catch((): BoothPunch => ({
      outcome: 'refused',
      reason: 'failed',
      message: LOOKUP_FAILED,
    }));
    const answer: Promise<BoothPunch> = Promise.race([asked, slow]).finally(() => {
      clearTimeout(timer);
      // Only its own entry: a cancel may have cleared the map and a newer ask for this phrase may be there now.
      if (inFlight.current.get(phrase) === answer) inFlight.current.delete(phrase);
    });
    inFlight.current.set(phrase, answer);
    return answer;
  }, []);
  /** Each start gets a number; an answer that comes back after a newer start (or after a take began, or after the Booth was left) is dropped, so a slow lookup never starts a take. */
  const latestStart = useRef(0);
  /** True from a start's press until its take is handed to the Booth, or it is refused or dropped: Record shows it. */
  const [lookingUp, setLookingUp] = useState(false);
  /** The start in flight (its number and phrase), from the press to its end: take handed over, refused, cancelled or past the lookup's limit. A press for the same phrase meanwhile is that press. */
  const pressing = useRef<{ mine: number; at: number | null; joined?: boolean } | null>(null);
  const alive = useRef(true);
  /** Drops every start still waiting: the Booth was left, or the chapter changed. Nothing they were waiting for may begin a take. */
  const cancelStart = useCallback(() => {
    latestStart.current += 1;
    inFlight.current.clear();
    pressing.current = null;
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
  /** Ends the wait of start `mine`, unless a newer start owns it now. */
  const endWait = useCallback((mine: number) => {
    // The press's own entry ends with the press, whatever start was chosen meanwhile.
    if (pressing.current?.mine === mine) pressing.current = null;
    if (mine !== latestStart.current || !alive.current) return;
    setLookingUp(false);
  }, []);
  const punchable = useCallback(() => rollPlan(sessionRef.current.capabilities).kind !== 'refused', []);
  /**
   * True when a press is already under way before a take: the same phrase is that press (nothing is looked up, chosen or said twice); another
   * phrase, or any phrase during a plain press (`at` null), is refused with a sentence, before it can look anything up, move the reading,
   * choose a voice or say it starts there.
   */
  const joinsOrRefuses = useCallback(
    (at: number) => {
      if (sessionRef.current.recording || !pressing.current) return false;
      if (pressing.current.at === at) return true;
      // Only where the DAW can punch: there a different phrase is a different spot to record over. A DAW that cannot punch keeps its own way (#3329).
      if (!punchable()) return false;
      actionsRef.current.notify(START_BUSY);
      return true;
    },
    [punchable],
  );
  /**
   * True while a press is under way before a take and the DAW can punch: the reading must stay on the spot the press chose, because the take
   * records there. Controls that move the reading or the chosen start ask this before they change anything. During a take the reading follows
   * the voice and this is false; a DAW that cannot punch keeps its own way (#3329), as `joinsOrRefuses` does.
   */
  const pressUnderway = useCallback(() => !sessionRef.current.recording && pressing.current !== null && punchable(), [punchable]);
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
      if (joinsOrRefuses(to)) return;
      // Before a take, a start the DAW could not punch to is not armed: the narrator is told now, not after Space, where the take will start.
      // The lookup is a press like any other (#3329): Space meanwhile joins it, a hung one ends once at LOOKUP_MS, and its answer is the only one asked for.
      const plan = rollPlan(s.capabilities);
      if (!s.recording && plan.kind === 'refused') {
        const mine = ++latestStart.current;
        pressing.current = { mine, at: to };
        setLookingUp(true);
        try {
          const looked = await lookUp(to);
          if (outdated(mine)) return;
          if (looked.outcome === 'found') {
            // Not armed. A Space or Record press that joined this one meant to record: the take starts from the end, said in the same sentence.
            const joined = pressing.current?.mine === mine && pressing.current.joined === true;
            actionsRef.current.notify(
              `${plan.reason} ${joined ? 'The take starts' : 'The next take starts'} from the end of what is already there, not from ¶ ${s.paragraphOf(to) + 1}.`,
            );
            return joined ? await actionsRef.current.beginTake() : undefined;
          }
          if (looked.outcome !== 'never_recorded') {
            // A failed, stale or unanswered lookup: said once, nothing started, and no start left chosen (as for a DAW that can punch).
            actionsRef.current.refuse(sentenceOr(looked.message, NOT_KNOWN));
            actionsRef.current.clearStart?.();
            return;
          }
          // Never recorded: nothing to punch over on any DAW, so the take goes on from the end from this phrase, with no second lookup.
          actionsRef.current.chooseStart(to, true);
          actionsRef.current.notify(`Starting from ¶ ${s.paragraphOf(to) + 1}`, PRESS_NOTE_TOPIC);
          actionsRef.current.notify(
            `¶ ${s.paragraphOf(to) + 1} was not recorded before, so the take goes on from the end of the chapter's audio.`,
            PRESS_NOTE_TOPIC,
          );
          return await actionsRef.current.beginTake();
        } finally {
          endWait(mine);
        }
      }
      actionsRef.current.chooseStart(to, !s.recording);
      if (s.recording) return rollFrom(to);
      // Not recording yet: the text moves to the phrase (chooseStart), and the take starts there now, with the DAW moved to that spot first,
      // so the narrator never has to find the place and click in the DAW with a live microphone.
      actionsRef.current.notify(`Starting from ¶ ${s.paragraphOf(to) + 1}`, PRESS_NOTE_TOPIC);
      return startTakeRef.current(to);
    },
    [rollFrom, lookUp, endWait, joinsOrRefuses],
  );
  startFromHereRef.current = startFromHere;

  /**
   * Starts the take. A phrase chosen with Start from here is looked up (the host reads where it was recorded before): found, the take records
   * over exactly that spot, on the voice that read it, and follows the plan; never recorded, it is not a punch and the take goes on from the end
   * of the chapter; refused, the sentence is shown and nothing starts (a start is never guessed).
   */
  const startTake = useCallback(
    async (from?: number) => {
      const s = sessionRef.current;
      const at = from ?? s.punchAt;
      if (at == null || at >= s.phraseCount) {
        // A plain press is a press too: it joins another plain press (Space again), and a Start from here meanwhile is refused.
        if (s.recording) return actionsRef.current.beginTake();
        if (pressing.current) {
          // Another plain press (Space again) is that press. A plain press during a press for a phrase is told so on a DAW that can punch (it never
          // drops silently); on one that cannot it is that press too, whose lookup answers once (#3329), not a take at once from the end.
          if (pressing.current.at !== null) {
            if (punchable()) actionsRef.current.notify(START_BUSY);
            else pressing.current.joined = true;
          }
          return;
        }
        // A DAW that cannot punch has no spot to wait for: the press goes straight to the Booth's own one-at-a-time guard.
        if (!punchable()) return actionsRef.current.beginTake();
        const plain = ++latestStart.current;
        pressing.current = { mine: plain, at: null };
        try {
          return await actionsRef.current.beginTake();
        } finally {
          endWait(plain);
        }
      }
      if (!punchable() && pressing.current?.at === at) pressing.current.joined = true;
      if (joinsOrRefuses(at)) return;
      const mine = ++latestStart.current;
      pressing.current = { mine, at };
      setLookingUp(true);
      try {
        const target = await lookUp(at);
        // A newer start was chosen meanwhile, a take began (the Space key, the DAW's own Record) or the Booth was left: this answer is out of date.
        if (outdated(mine)) return;
        if (target.outcome === 'never_recorded') {
          // Not a punch: said, so a narrator never thinks earlier work is being recorded over.
          actionsRef.current.notify(
            `¶ ${s.paragraphOf(at) + 1} was not recorded before, so the take goes on from the end of the chapter's audio.`,
            PRESS_NOTE_TOPIC,
          );
          return await actionsRef.current.beginTake();
        }
        if (target.outcome !== 'found' || target.start === undefined) {
          actionsRef.current.refuse(sentenceOr(target.message, NOT_KNOWN));
          actionsRef.current.clearStart?.();
          return;
        }
        const plan = rollPlan(s.capabilities);
        if (plan.kind === 'refused') {
          // A punch the DAW cannot do must not leave the narrator unable to record at all: the chosen start is let go, the take starts at the end of
          // what is recorded, and the sentence says why.
          actionsRef.current.notify(`${plan.reason} Recording from the end of what is already there instead.`);
          actionsRef.current.clearStart?.();
          return await actionsRef.current.beginTake();
        }
        if (plan.kind === 'confirm' && !(await ask(`Punch in at ¶ ${s.paragraphOf(at) + 1}?`, 'Punch in', plan.dawName))) return;
        if (outdated(mine)) return;
        if (target.trackGuid && actionsRef.current.chooseVoice && !(await actionsRef.current.chooseVoice(target.trackGuid))) return;
        if (outdated(mine)) return;
        // The narrator is told which track is recorded over before the take starts, never only after.
        actionsRef.current.notify(`Recording over ¶ ${s.paragraphOf(at) + 1}${target.trackName ? ` on ${target.trackName}` : ''}.`, PRESS_NOTE_TOPIC);
        return await actionsRef.current.beginTake(target.start);
      } finally {
        endWait(mine);
      }
    },
    [ask, lookUp, endWait, joinsOrRefuses, punchable],
  );
  startTakeRef.current = startTake;

  /** `hold` is the one switch for the take: the page holds it for an open menu too, so neither resumes what the other still holds. */
  return { punchAndRoll, startFromHere, startTake, cancelStart, pressUnderway, lookingUp, hold: hold.current };
}
