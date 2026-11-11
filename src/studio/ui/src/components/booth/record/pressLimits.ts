import { logUi } from '../../../api/uiLog';

/**
 * How long each wait in a Record press may take before the press ends with a sentence and Record is free again (#3321). The DAW start, the in-app
 * recorder's start and the listening start are each longer than the host's own limit for that call (`pressLimits.guard.test.ts` reads those from the Go
 * source), so a host that answers in its own time is never cut off. The model check, the project check and the voice choice have no host limit of their
 * own: their 8 s was chosen, not measured. A slow first model check (hashing, antivirus) would end at 8 s with "no take was started".
 */
export const PRESS_LIMITS_MS = {
  /** The asset list that says whether the speech model is on this computer. */
  modelCheck: 8_000,
  /** The project check (`bootstrap`) that says the DAW has the linked project open. */
  projectCheck: 8_000,
  /**
   * The listening start. The host first lets a running session end (up to `defaultGrace` 8 s, then 2 s more) and then waits `listeningWait` 20 s
   * for the sidecar's first event, so its worst case is about 30 s before the model loads; this is above that with a margin.
   */
  listening: 45_000,
  /** The start of the take by a DAW engine: the host's own limit is `readAloudVoiceStartTimeout`, 6 s (3 s for the track list, 3 s for the DAW to report recording). */
  recordStart: 10_000,
  /** The start of the take by the app's own recorder: the host runs it under `recorderDevicesTimeout`, 20 s, so the limit is above that. */
  recordStartInApp: 25_000,
  /** Making the voice a passage was recorded on the take's track (a punch). */
  voiceChoice: 8_000,
} as const;

export type PressStage = keyof typeof PRESS_LIMITS_MS;

/** The limit of the DAW's start of the take: the app's own recorder takes longer than a DAW engine to answer. */
export const recordStartLimit = (inApp: boolean): PressStage => (inApp ? 'recordStartInApp' : 'recordStart');

/** The answer of a limited wait, or that the limit was reached first. */
export type Limited<T> = { timedOut: false; value: T } | { timedOut: true };

/**
 * Waits for `start` (a promise, or a function of `over` that makes it) for at most `ms`. Past the limit the wait is over: the stage is written to the run log (which stage hit its limit), and an answer that comes later goes to `late`, which must undo whatever that answer
 * started; it is never ignored without a decision. A call that rejects rejects here, as before.
 *
 * Every host call a press awaits goes through here: `pressLimits.guard.test.ts` lists them.
 */
export function limited<T>(
  stage: PressStage,
  start: Promise<T> | ((over: () => boolean) => Promise<T>),
  late?: (value: T) => void,
  ms: number = PRESS_LIMITS_MS[stage],
): Promise<Limited<T>> {
  return new Promise<Limited<T>>((resolve, reject) => {
    let over = false;
    // A function is given `over`, so work that changes the page when it answers can tell it was given up on and change nothing.
    const work = typeof start === 'function' ? start(() => over) : start;
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
