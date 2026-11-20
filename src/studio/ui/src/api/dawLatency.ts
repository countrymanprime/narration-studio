import type { NarrationApi } from '../types';

/** A slow DAW link for the mock (`?mockDawLatency=`, #3752): the same profile the host reads from `NARRATION_DAW_LATENCY` (`SlowLink` in src/studio/desktop/internal/bridge/slowlink.go). All times are milliseconds. */
export interface DawLatency {
  /** Every matching call is held this long; `jitter` adds up to this much more, different for each call. */
  delay: number;
  jitter: number;
  /** A stretch in which nothing reaches the DAW and nothing is heard from it, from the start and again every `stallEvery` (once when 0). */
  stallFor: number;
  stallEvery: number;
  /** How many of the first matching calls never reach the DAW. */
  drop: number;
  /** Limits delay, jitter and drop to these names; empty is every call. A stall holds every call. */
  only: string[];
}

const UNIT_MS: Record<string, number> = { ns: 1e-6, us: 1e-3, µs: 1e-3, ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

/** A Go duration (`300ms`, `1.5s`, `1m30s`) in milliseconds. */
function duration(value: string): number {
  let rest = value;
  let total = 0;
  while (rest !== '') {
    const part = /^(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/.exec(rest);
    if (!part) throw new Error(`"${value}" is not a duration`);
    total += Number(part[1]) * UNIT_MS[part[2]];
    rest = rest.slice(part[0].length);
  }
  if (value === '') throw new Error('a duration is missing');
  return total;
}

/**
 * Reads a profile: comma-separated `delay=1s`, `jitter=200ms`, `stall=8s` or `stall=8s/30s` (stalled for 8 s, every 30 s), `drop=1` and
 * `only=tracksLive+dawArmBoothVoice`. A bare duration (`300ms`, `10s`) is `delay=`, and `stall-recover` is `stall=8s`. Throws on anything else.
 * The cases both parsers must agree on are in src/studio/desktop/internal/bridge/testdata/slowlink_profiles.json.
 */
export function parseDawLatency(text: string): DawLatency {
  const link: DawLatency = { delay: 0, jitter: 0, stallFor: 0, stallEvery: 0, drop: 0, only: [] };
  for (const raw of text.split(',')) {
    const part = raw.trim() === 'stall-recover' ? 'stall=8s' : raw.trim();
    if (part === '') continue;
    const at = part.indexOf('=');
    const [key, value] = at < 0 ? ['delay', part] : [part.slice(0, at), part.slice(at + 1)];
    try {
      if (key === 'delay') link.delay = duration(value);
      else if (key === 'jitter') link.jitter = duration(value);
      else if (key === 'stall') {
        const [stalled, every] = value.split('/', 2);
        link.stallFor = duration(stalled);
        if (every !== undefined) {
          link.stallEvery = duration(every);
          if (link.stallEvery <= link.stallFor) throw new Error('a stall must be shorter than its period');
        }
      } else if (key === 'drop') {
        if (!/^\d+$/.test(value)) throw new Error('drop is a whole number');
        link.drop = Number(value);
      } else if (key === 'only') {
        link.only = value.split('+');
        if (link.only.includes('')) throw new Error('a command name is missing');
      } else throw new Error('unknown key');
    } catch (error) {
      throw new Error(`slow link profile "${text}": "${part}": ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  return link;
}

/** Whether the profile holds or drops anything. */
export function slows(link: DawLatency): boolean {
  return link.delay > 0 || link.jitter > 0 || link.stallFor > 0 || link.drop > 0;
}

/** When each call may reach the DAW on a slow link, in the order the calls were made (a slow link never reorders). Times are a clock's milliseconds. */
export class LinkClock {
  private last = 0;
  private dropped = 0;
  private counter = 0;

  constructor(
    private readonly link: DawLatency,
    private readonly started: number,
  ) {}

  /** How far into a stall `now` is: the milliseconds left of it, or 0 outside one. */
  stallLeft(now: number): number {
    if (this.link.stallFor <= 0) return 0;
    const since = this.link.stallEvery > 0 ? (now - this.started) % this.link.stallEvery : now - this.started;
    return since < this.link.stallFor ? this.link.stallFor - since : 0;
  }

  /** When the call named `name`, made at `now`, reaches the DAW; `Infinity` for one the profile drops. */
  release(name: string, now: number): number {
    const counter = this.counter++;
    let release = now;
    if (this.link.only.length === 0 || this.link.only.includes(name)) {
      if (this.dropped < this.link.drop) {
        this.dropped += 1;
        return Infinity;
      }
      // The host's spread (slowlink.go): Knuth's multiplicative hash of the call's number, the same on every run.
      release += this.link.delay + (this.link.jitter * ((counter * 2654435761) % 1000)) / 1000;
    }
    release += this.stallLeft(release);
    this.last = Math.max(this.last, release);
    return this.last;
  }
}

/** One REAPER command a host call sends and waits for: how long the host waits, and what it answers when that passes (thrown: the call rejects). With no `fail` the host falls back to what it has saved and carries on. */
type Step = { limit: number; fail?: Fail };
type Fail = (args: readonly unknown[], api: NarrationApi) => unknown;
/** A host call as the commands it waits on, in order; `deadline` is the call's own limit across them, answered with `overrun`. */
type HostCall = { steps: Step[]; deadline?: number; overrun?: Fail };

// The host's waits (src/studio/desktop/internal/bridge): 3 s for an answer, and 20 s more for a command REAPER has read that may run long
// (`mayRunLong`: the track list, a create, an arm). A held command reads as one REAPER has read, as on the host's own slow link.
const ANSWER_MS = 3_000;
const LONG_MS = ANSWER_MS + 20_000;
const TRACKS_LIVE_MS = 7_000;
/** How long the host keeps a track list it read (`liveTracksMaxAge`, tracks_cache.go). */
const TRACKS_KEPT_MS = 10_000;
/** How long the host still hands out a kept list past that while it reads a new one behind it (`liveTracksStaleAge`). */
const TRACKS_STALE_MS = 30_000;

const NOT_ANSWERING = 'REAPER is not answering. Check that REAPER is open, then try again; the app reconnects by itself.';
const NO_ANSWER = 'REAPER did not answer: check that REAPER is open; the app reconnects by itself';
const WITHIN_3S = 'REAPER did not answer within 3 seconds.';
const TOOK_NOT_CONFIRMED = 'REAPER took the command but did not confirm it in time, so what it did may not match. Check REAPER.';
const NOT_CONFIRMED_TRACK = 'REAPER took the command but has not confirmed the track yet. Look in REAPER before trying again: it may already be there.';

/** A `dawport.Result` refusal (internal/dawport/result.go). */
const refused = (message: string) => ({ ok: false, changed: false, message, undoSteps: 0, refused: message });
const answer =
  (value: unknown): Fail =>
  () =>
    value;
const reject =
  (message: string): Fail =>
  () => {
    throw new Error(message);
  };
const outcome = (reason: string, message: string, more: object = {}) => answer({ outcome: 'refused', reason, message, ...more });

/** The track list the host reads before many calls (`liveSelectedProject`, tracks_live.go): it waits 7 s, then uses the saved project, and keeps a list it read. */
const TRACKS: Step = { limit: TRACKS_LIVE_MS };
/** The same list read for a page to show: kept for 10 s, and never handed out stale. */
const PAGE_TRACKS: Step = { limit: TRACKS_LIVE_MS };
const one = (fail: Fail, limit = ANSWER_MS): HostCall => ({ steps: [{ limit, fail }] });
const afterTracks = (fail: Fail, limit = ANSWER_MS): HostCall => ({ steps: [TRACKS, { limit, fail }] });
const SHORT_REFUSAL = one(answer(refused(NOT_ANSWERING)));
const NOT_RUNNING = one(outcome('not_running', NOT_ANSWERING));
const RECORD_START: HostCall = {
  steps: [TRACKS, { limit: LONG_MS, fail: outcome('timeout', TOOK_NOT_CONFIRMED) }, { limit: ANSWER_MS, fail: outcome('not_running', NOT_ANSWERING) }],
  deadline: 10_000,
  overrun: outcome('timeout', TOOK_NOT_CONFIRMED),
};
const CREATE = afterTracks(outcome('failed', NOT_CONFIRMED_TRACK), LONG_MS);

/**
 * The host calls that send REAPER a command and wait for its answer, each with what the real host answers when REAPER does not answer in time (traced from the
 * bindings in src/studio/desktop for #3752). A call that is not here is not slowed: it reads files or the heartbeat, starts a job whose answer is an event, or its
 * answer on a silent REAPER depends on state this layer cannot see (`dawReleaseBoothMonitor`: only when a monitoring is owed; the voice-sample and teleprompter
 * follow calls). `chapterTrackLinks`, `chapterTrackMatch` and `boothVoiceGet` answer from the saved project after 7 s; the mock has one project, so here they answer as usual, late.
 */
export const DAW_CALLS: Readonly<Record<string, HostCall>> = {
  tracksLive: {
    steps: [
      {
        limit: TRACKS_LIVE_MS,
        fail: async (_args, api) => ({
          source: 'saved',
          reason: 'not_running',
          message: 'REAPER is not answering, so these are the tracks as of the last save.',
          readAt: new Date().toISOString(),
          project: await api.tracksList(),
        }),
      },
    ],
  },
  chapterTrackLinks: { steps: [PAGE_TRACKS] },
  chapterTrackMatch: { steps: [TRACKS] },
  boothVoiceGet: { steps: [TRACKS] },
  readAloudReaperState: afterTracks(answer({ status: 'unavailable', reason: 'not_running', message: NOT_ANSWERING, playing: false, recording: false })),
  readAloudRecordStart: RECORD_START,
  readAloudRecordStartAt: RECORD_START,
  readAloudRecordStop: NOT_RUNNING,
  boothVoiceSet: afterTracks(
    (args) => ({
      outcome: 'selected',
      trackGuid: args[1],
      reason: 'timeout',
      message: 'REAPER did not confirm in time, so the armed track may not match the voice. The Booth records on the voice you chose.',
    }),
    LONG_MS,
  ),
  boothVoiceAdd: CREATE,
  chapterTrackCreate: CREATE,
  dawArmBoothVoice: afterTracks(answer(refused(TOOK_NOT_CONFIRMED)), LONG_MS),
  dawPlace: one(answer({ ok: false, message: WITHIN_3S, chapterId: '', selected: 0, cursor: 0 })),
  dawGoToChapter: one(answer(refused(WITHIN_3S))),
  dawTransportSync: one(answer(refused(WITHIN_3S))),
  workspaceWordTimes: afterTracks(answer({ available: false, version: '', changeCount: 0, items: [], words: [] }), 5_000),
  dawMeters: one(
    answer({
      ok: false,
      output: 0,
      input: null,
      inputTrack: '',
      message: 'REAPER did not answer the level read in time. The levels show again when it does.',
      reason: '',
    }),
    1_500,
  ),
  dawMonitorLevel: one(
    answer({ ok: false, level: 0, message: 'REAPER did not answer the monitor level within 3 seconds. Check the level before trying again.' }),
  ),
  dawSetMonitorLevel: one(
    answer({ ok: false, level: 0, message: 'REAPER did not answer the monitor level within 3 seconds. Check the level before trying again.' }),
  ),
  dawPunchPreroll: one(
    answer({
      ok: false,
      onRecord: false,
      measures: 0,
      measureSeconds: 0,
      message: 'REAPER did not answer about its pre-roll within 3 seconds. Open the Record options menu again to read it.',
    }),
  ),
  dawLastAction: one(answer('unknown')),
  chapterFoldersCheck: one(
    outcome('not_running', 'REAPER is not answering, so its folders cannot be checked. Check that REAPER is open, then check again.', {
      moves: [],
      expected: [],
    }),
  ),
  chapterFoldersRepair: one(
    outcome('not_running', 'REAPER is not answering, so its folders cannot be checked. Check that REAPER is open, then check again.', {
      moves: [],
      expected: [],
    }),
  ),
  trackSelectInReaper: one(outcome('failed', `REAPER could not do that: ${NO_ANSWER}.`)),
  findingsGoTo: NOT_RUNNING,
  findingsLoop: NOT_RUNNING,
  findingsStopLoop: NOT_RUNNING,
  findingsAddMarker: NOT_RUNNING,
  workspaceGoTo: NOT_RUNNING,
  workspaceUseTake: NOT_RUNNING,
  teleprompterReaperInput: one(answer({ status: 'unavailable', reason: 'not_running', message: NOT_ANSWERING, candidates: [] })),
  boothPunchTarget: afterTracks(
    outcome('no_daw', 'The audio engine is not answering, so where this passage was recorded cannot be read. Check that it is open, then try again.'),
    5_000,
  ),
  chapterRegionsCreate: one(reject(`could not create the regions in REAPER: ${NO_ANSWER}`)),
  workspaceListFXChains: one(reject(NO_ANSWER)),
  workspaceProjectFx: one(reject(NO_ANSWER)),
  levelMatchApply: one(reject(NO_ANSWER)),
  dawUndoLast: SHORT_REFUSAL,
  dawSaveProject: SHORT_REFUSAL,
  dawDeleteRange: afterTracks(answer(refused(NOT_ANSWERING))),
  dawTrimRange: SHORT_REFUSAL,
  dawSplitTake: SHORT_REFUSAL,
  dawStackTakes: SHORT_REFUSAL,
  dawUnstackTakes: SHORT_REFUSAL,
  dawRoll: SHORT_REFUSAL,
  dawApplyFxToRange: SHORT_REFUSAL,
  dawRemoveFxFromRange: SHORT_REFUSAL,
  dawFxRangeParams: SHORT_REFUSAL,
  dawSetFxRangeParam: SHORT_REFUSAL,
  dawBypassFxRange: SHORT_REFUSAL,
  dawCompareFxRange: SHORT_REFUSAL,
  dawStopFxCompare: SHORT_REFUSAL,
  dawChooseFxForRange: SHORT_REFUSAL,
  dawChosenFxForRange: SHORT_REFUSAL,
  dawReduceRangeGain: SHORT_REFUSAL,
  dawRepairClick: SHORT_REFUSAL,
  dawReplaceRange: SHORT_REFUSAL,
  dawRestoreReplacement: SHORT_REFUSAL,
  workspaceHideTakes: SHORT_REFUSAL,
  masterPlayQuietest: SHORT_REFUSAL,
  workspacePreviewTake: SHORT_REFUSAL,
  dawStopFilePreview: SHORT_REFUSAL,
  masterOpenInDaw: SHORT_REFUSAL,
};

/** The events REAPER is the source of (its heartbeat, its transport, its own Stop): a stalled REAPER sends none, and they arrive when the stall ends. */
export const DAW_EVENTS: ReadonlySet<string> = new Set([
  'subscribeDawCapabilities',
  'subscribeDawTransport',
  'subscribeDawPosition',
  'subscribeDawProjectEdited',
  'subscribeDawRecordEnded',
]);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

declare global {
  interface Window {
    /** Puts the mock's DAW link on a profile from now on (a stall starts now); `''` makes it prompt again. Throws on a profile that does not parse. */
    __NARRATION_MOCK_DAW_LATENCY__?: (profile: string) => void;
  }
}

/**
 * The mock api on a slow DAW link (`?mockDawLatency=<profile>`, or `window.__NARRATION_MOCK_DAW_LATENCY__(profile)` once the page is up; mock builds only): each
 * call in `DAW_CALLS` waits as long as the link holds its commands, and when that is longer than the real host waits, answers what the real host answers then. A
 * command the host gave up on still reaches the DAW when the link lets it through, as it does on the host's slow link, so a refused arm or record start can still
 * happen afterwards. REAPER's events are held during a stall.
 */
export function withDawLatency(api: NarrationApi, initial: DawLatency): NarrationApi {
  let link = initial;
  let clock = new LinkClock(link, performance.now());
  let tracksReadAt = -Infinity;
  let tracksRefreshing = false;
  window.__NARRATION_MOCK_DAW_LATENCY__ = (profile) => {
    link = parseDawLatency(profile);
    clock = new LinkClock(link, performance.now());
  };

  async function run(name: string, call: HostCall, args: readonly unknown[], invoke: () => unknown): Promise<unknown> {
    if (!slows(link)) {
      // A prompt host reads the list too, and keeps it when the link turns slow.
      if (call.steps.includes(TRACKS) || call.steps.includes(PAGE_TRACKS)) tracksReadAt = performance.now();
      return invoke();
    }
    const began = performance.now();
    for (const [index, step] of call.steps.entries()) {
      if (step === TRACKS || step === PAGE_TRACKS) {
        const age = performance.now() - tracksReadAt;
        if (age < TRACKS_KEPT_MS) continue;
        if (step === TRACKS && age < TRACKS_STALE_MS) {
          // Stale while revalidate, as the host: this call has the kept list now, and one read behind it brings the next list.
          if (!tracksRefreshing) {
            tracksRefreshing = true;
            const wait = clock.release(name, performance.now()) - performance.now();
            setTimeout(
              () => {
                tracksRefreshing = false;
                if (wait <= LONG_MS) tracksReadAt = performance.now();
              },
              Math.min(wait, LONG_MS),
            );
          }
          continue;
        }
      }
      const release = clock.release(name, performance.now());
      const hold = release - performance.now();
      const left = call.deadline === undefined ? Infinity : began + call.deadline - performance.now();
      const limit = Math.min(step.limit, left);
      if (hold <= limit) {
        if (hold > 0) await sleep(hold);
        if (step === TRACKS || step === PAGE_TRACKS) tracksReadAt = performance.now();
        continue;
      }
      await sleep(limit);
      const fail = limit < step.limit ? (call.overrun ?? step.fail) : step.fail;
      if (!fail) continue;
      // The call's own command (its last) is on its way: it reaches the DAW when the link releases it, after the host has answered.
      if (index === call.steps.length - 1 && Number.isFinite(release)) {
        setTimeout(
          () =>
            void Promise.resolve()
              .then(invoke)
              .catch((error: unknown) => console.warn('mock DAW: a held command failed when it reached the DAW', error)),
          release - performance.now(),
        );
      }
      return fail(args, api);
    }
    return invoke();
  }

  /** A REAPER event's handler that delivers nothing during a stall and everything it missed, in order, when the stall ends. */
  function held(handler: (...event: unknown[]) => void): (...event: unknown[]) => void {
    const waiting: unknown[][] = [];
    const flush = () => {
      for (const event of waiting.splice(0)) handler(...event);
    };
    return (...event) => {
      const left = clock.stallLeft(performance.now());
      if (left <= 0 && waiting.length === 0) return handler(...event);
      if (waiting.push(event) === 1) setTimeout(flush, left);
    };
  }

  return new Proxy(api, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof value !== 'function') return value;
      if (DAW_EVENTS.has(property)) {
        return (handler: (...event: unknown[]) => void, ...rest: unknown[]): unknown => value.apply(target, [held(handler), ...rest]);
      }
      const call = DAW_CALLS[property];
      if (!call) return value;
      return (...args: unknown[]) =>
        run(property, call, args, () => {
          const result: unknown = value.apply(target, args);
          return result;
        });
    },
  });
}
