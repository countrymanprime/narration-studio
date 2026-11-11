import { logUi } from '../../../api/uiLog';

/**
 * How long each wait in a Record press may take before the press ends with a sentence and Record is free again (#3321). Each is longer than the
 * host's own limit for that call, so a host that answers in its own time is never cut off; these only end a call that never comes back.
 */
export const PRESS_LIMITS_MS = {
  /** The asset list that says whether the speech model is on this computer. */
  modelCheck: 8_000,
  /** The project check (`bootstrap`) that says the DAW has the linked project open. */
  projectCheck: 8_000,
  /** The listening start: the host itself waits up to 20 s for the sidecar's first event, and the first start of a session reads the whole model. */
  listening: 30_000,
  /** The host's start of the take: its own limit is 6 s (3 s for the track list, 3 s for the DAW to report recording). */
  recordStart: 10_000,
  /** Making the voice a passage was recorded on the take's track (a punch). */
  voiceChoice: 8_000,
} as const;

export type PressStage = keyof typeof PRESS_LIMITS_MS;

/** The answer of a limited wait, or that the limit was reached first. */
export type Limited<T> = { timedOut: false; value: T } | { timedOut: true };

/**
 * Waits for `work` for at most `ms`. Past the limit the wait is over: the stage is written to the run log (which stage hit its limit), and an answer that comes later goes to `late`, which must undo whatever that answer
 * started; it is never ignored without a decision. A call that rejects rejects here, as before.
 *
 * Every host call a press awaits goes through here: `pressLimits.guard.test.ts` lists them.
 */
export function limited<T>(stage: PressStage, work: Promise<T>, late?: (value: T) => void, ms: number = PRESS_LIMITS_MS[stage]): Promise<Limited<T>> {
  return new Promise<Limited<T>>((resolve, reject) => {
    let over = false;
    const timer = setTimeout(() => {
      over = true;
      logUi('ui.record.limit', `press stage=${stage} limit=${ms}ms reached; the press ended`);
      resolve({ timedOut: true });
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        if (!over) return resolve({ timedOut: false, value });
        logUi('ui.record.limit', `press stage=${stage} answered after its limit`);
        late?.(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        if (!over) reject(error);
      },
    );
  });
}
