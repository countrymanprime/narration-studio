import { logUi } from '../../../api/uiLog';

/**
 * How long each wait in a Record press may take before the press ends with a sentence and Record is free again (#3321). The DAW start, the in-app
 * recorder's start and the listening start are each longer than the host's own limit for that call (`pressLimits.guard.test.ts` reads those from the Go
 * source), so a host that answers in its own time is never cut off. Every stage has its basis in `PRESS_LIMIT_BASIS` (`pressLimits.guard.test.ts` requires one).
 * A limit only bounds a host that never answers; it never decides that the speech model is missing (#3432): a model check that outlasts it lets the press go on.
 */
/** The five Whisper models read in full: the sizes of `whisperSizes` in `internal/assets/state_bench_test.go` (the guard compares the two). */
export const MODEL_CATALOG_BYTES = 5_319_586_941;

/**
 * The slowest disk a narrator can plausibly have, for the one read of every model: a hard disk or one under an antivirus scan, 100 MB/s. Measured on this
 * project's cloud machine (real files, #3432): 1.5 GB hashes in 1.1 s warm and 1.5 s cold, 1.0-1.3 GB/s, so the floor is a stated assumption, not a measurement of a slow disk.
 */
export const DISK_FLOOR_BYTES_PER_S = 100_000_000;

export const PRESS_LIMITS_MS = {
  /**
   * The asset list that says whether the speech model is on this computer. With no manifest the host reads every byte of every catalog model once
   * (`MODEL_CATALOG_BYTES`, 5.3 GB) and then writes the manifest, so it is cheap after. The limit is that read at `DISK_FLOOR_BYTES_PER_S`, rounded up: 54 s.
   * It only decides when the press stops waiting and goes on. A press does not wait at all for a model already known installed.
   */
  modelCheck: Math.ceil(MODEL_CATALOG_BYTES / DISK_FLOOR_BYTES_PER_S) * 1000,
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
  /** The stop of a take whose listening failed (`dropUnheardTake`). The host's stop goes through the bridge, which answers within `DefaultAnswerTimeout` (3 s, internal/bridge/navigation.go) when the DAW does not; this limit is the start's, well above that, so a stop is never cut off sooner than the bridge would give up. */
  recordStop: 10_000,
  /** Taking that short recording back: the host's own limit is `undoLastTimeout`, 12 s, so this is above it. */
  undoLast: 14_000,
  /** Rolling again in a take (R, Punch and roll): the host's own limit is `rollTimeout`, 5 s (the stop, the cursor move and the DAW recording again). */
  roll: 8_000,
  /** Making the voice a passage was recorded on the take's track (a punch). */
  voiceChoice: 8_000,
} as const;

export type PressStage = keyof typeof PRESS_LIMITS_MS;

/** Why each limit is what it is: a host limit it is above, or a measurement. `pressLimits.guard.test.ts` requires a basis for every stage. */
export const PRESS_LIMIT_BASIS: Record<PressStage, string> = {
  modelCheck:
    'catalog bytes (5.3 GB, read once by the host) at a 100 MB/s disk floor; measured 1.0-1.3 GB/s on real files here, 4.46 s for the catalog (state_bench_test.go)',
  projectCheck: 'measured: Host.Bootstrap takes 6-85 µs (local reads and cached DAW facts, no wait on the DAW); 8 s only bounds a host that never answers',
  listening: 'host limit: defaultGrace + 2 s + listeningWait (read from the Go source by the guard)',
  recordStart: 'host limit: readAloudRecordStartTimeout + tracksLiveTimeout (read from the Go source by the guard)',
  recordStartInApp: 'host limit: recorderDevicesTimeout (read from the Go source by the guard)',
  recordStop: "host limit: the bridge's DefaultAnswerTimeout, 3 s (internal/bridge/navigation.go); this is the start's limit",
  undoLast: 'host limit: undoLastTimeout, 12 s',
  roll: 'host limit: rollTimeout (read from the Go source by the guard)',
  voiceChoice: 'host limit: BoothVoiceSet runs under readAloudVoiceStartTimeout, 6 s (read from the Go source by the guard)',
};

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
