import type { DawCapabilities, DawChoice, DawMeters, DawTransport } from '../api/contracts/daw';
import type { WorkspaceProjectFxResult } from '../api/contracts/workspace';
import { apiErrorMessage, describeApiError } from '../api/errorMessage';
import type { NarrationApi } from '../types';

/** How often the DAW's meters are read while any screen holds a lease: often enough to follow a voice, one read at a time. */
export const DAW_METERS_EVERY_MS = 250;

/** How long without an answer before the meters say they cannot tell instead of showing the last reading as now. */
export const DAW_METERS_QUIET_MS = 2_000;

/** How often a capability report that has never been heard is asked for again; an off DAW is asked again every `DAW_OFF_RECHECK_MS`. */
export const DAW_RETRY_MS = 4_000;
const DAW_OFF_RECHECK_MS = 10_000;
/** How long a read of the host's DAW choice is waited for before it counts as failed. */
export const DAW_CHOICE_READ_MS = 8_000;
/** How long the host holds a start it made before it reports a bridge problem instead (reaperbridge.go `reaperStartWait`). */
const DAW_START_WINDOW_MS = 90_000;

export type DawMetersState =
  /** No answer yet. */
  | { kind: 'loading' }
  /** The DAW's meters as last read. */
  | { kind: 'ready'; meters: Extract<DawMeters, { ok: true }> }
  /** The DAW refused or cannot be asked, in its own sentence. */
  | { kind: 'off'; message: string }
  /** The last answer is older than DAW_METERS_QUIET_MS: how long ago it was heard. */
  | { kind: 'quiet'; seconds: number; message: string };

/** The FX on the linked DAW's tracks and master track, as last read. */
export interface DawFxState {
  /** What the DAW answered last, or null before its first answer and while the read failed. */
  chain: WorkspaceProjectFxResult | null;
  /** True while a read is on its way. */
  reading: boolean;
  /** Why the last read failed, or ''. */
  error: string;
  /** When the DAW last answered (ms since the epoch), null before it has. */
  readAt: number | null;
}

export interface DawSessionState {
  /** The DAW's capability report, or null until it has answered. */
  caps: DawCapabilities | null;
  /** When the report was last read and answered. */
  capsCheckedAt: number | null;
  /** When the DAW was last seen reachable. */
  capsHeardAt: number | null;
  /** The last read failed: `caps` is still what was heard before. */
  capsReadFailed: boolean;
  /** The host's sentence for the last failed read, '' when it did not fail. */
  capsError: string;
  /**
   * What the host knows about the project's DAW beyond "not answering" (closed, starting, linked, not linked), read with every report; undefined
   * until the first read, null when the read failed. The host owns "starting" (a start the app made that has not answered, up to 90 s), so no screen keeps a clock of its own for it.
   */
  choice: DawChoice | null | undefined;
  /** When the DAW went from answering (or unknown) to not answering, or when the project's DAW changed while it was off; null while it answers. */
  offSince: number | null;
  /** Counts every capability report taken, so a consumer that re-reads something on a DAW change keys an effect on it. */
  capsVersion: number;
  /** Counts every Check again the narrator pressed, so the facts read elsewhere (the host's bootstrap) are read again with the report. */
  checkVersion: number;
  /** REAPER's transport from `daw_transport_changed`; stopped until the first push. */
  transport: DawTransport;
  meters: DawMetersState;
  fx: DawFxState;
}

/** The part of the api the session reads: the one place the app talks to the DAW's live state. */
export type DawSessionApi = Pick<
  NarrationApi,
  'dawChoice' | 'dawCapabilities' | 'subscribeDawCapabilities' | 'subscribeDawTransport' | 'dawMeters' | 'workspaceProjectFx'
>;

export interface DawSession {
  getState(): DawSessionState;
  subscribe(listener: () => void): () => void;
  /** Subscribes to the host and reads the first answers; safe to call again after `stop`. */
  start(): void;
  /** Drops every subscription, timer and listener the session made. */
  stop(): void;
  /** Asks the DAW for its capabilities again, resolving once the answer is in. */
  refreshCapabilities(): Promise<void>;
  /** The narrator's Check again, the one route every connection check takes: the report is read now and `checkVersion` tells the other readers to read their facts again. */
  checkConnection(): Promise<void>;
  /** A fresh read for a caller that gates an action on it: every screen sees the answer, and a failed read rejects with the host's error. */
  readCapabilities(): Promise<DawCapabilities>;
  /** Takes a report read elsewhere (the dialog's wait after Start), so every screen follows it. */
  takeCapabilities(caps: DawCapabilities): void;
  /** Reads the FX in the DAW again. */
  refreshFx(): Promise<void>;
  /** Holds the DAW's meters being read until the returned release is called; the reads stop with the last lease. */
  leaseMeters(): () => void;
}

const INITIAL: DawSessionState = {
  caps: null,
  capsCheckedAt: null,
  capsHeardAt: null,
  capsReadFailed: false,
  capsError: '',
  choice: undefined,
  offSince: null,
  capsVersion: 0,
  checkVersion: 0,
  transport: { playing: false, recording: false },
  meters: { kind: 'loading' },
  fx: { chain: null, reading: true, error: '', readAt: null },
};

/**
 * The one session the app holds with the DAW: its capability report, transport, meters and FX are read, pushed and kept here once, from
 * app start, and every screen reads them from this store. No screen subscribes to the host for DAW state by itself, so what a screen
 * shows never depends on which other screen has mounted. `ApiProvider` creates and starts it; see `useDawSession.ts` for the hooks.
 */
/**
 * The capability report as every screen should read it: while the host is starting the DAW (it is not answering and the host says "starting"), a
 * capability that is off is off because the DAW is not up yet, so its sentence says that instead of "Open REAPER" (#3668). Done here, once, so the
 * twenty places that read a capability's message from the session all say the same, whichever way they read it.
 */
/** The one sentence for a capability or setting that is off only because the host is starting the DAW (#3668). */
export function startingSentence(daw: string): string {
  return `${startingStatement(daw)} The app connects to it by itself.`;
}

/** The short statement of the same state (the audio engine panel's line). */
export function startingStatement(daw: string): string {
  return `${daw} is starting.`;
}

/** The message after a press of Start: the app opened the DAW and the Booth turns on Record once it answers. */
export function startedToast(daw: string, path: string): string {
  return `${daw} is starting (${path}). Record turns on here once it connects.`;
}

/** The label of the connection mark, and the title of the dialog and the card badge: one word for the state wherever it is drawn. */
export function startingLabel(daw: string): string {
  return `Starting ${daw}…`;
}
export function startingTitle(daw: string): string {
  return `Starting ${daw}`;
}

export function presentCaps(caps: DawCapabilities | null, choice: DawChoice | null | undefined): DawCapabilities | null {
  if (!caps || caps.reachable || caps.daw === 'none' || choice?.state !== 'starting') return caps;
  const message = startingSentence(caps.daw);
  const capabilities = Object.fromEntries(
    Object.entries(caps.capabilities).map(([key, entry]) => [
      key,
      entry && !entry.available && entry.level !== 'unsupported' && !['not_yet', 'unsupported'].includes(entry.reason ?? '') ? { ...entry, message } : entry,
    ]),
  ) as DawCapabilities['capabilities'];
  return { ...caps, capabilities };
}

export function createDawSession(host: DawSessionApi): DawSession {
  // A call that throws before it returns a promise (an api double without the method) is a failed read, like any other.
  const api = {
    dawCapabilities: () => Promise.resolve().then(() => host.dawCapabilities()),
    dawChoice: () => Promise.resolve().then(() => host.dawChoice()),
    dawMeters: () => Promise.resolve().then(() => host.dawMeters()),
    workspaceProjectFx: () => Promise.resolve().then(() => host.workspaceProjectFx()),
    subscribeDawCapabilities: (on: Parameters<DawSessionApi['subscribeDawCapabilities']>[0]) => host.subscribeDawCapabilities?.(on) ?? (() => undefined),
    subscribeDawTransport: (on: Parameters<DawSessionApi['subscribeDawTransport']>[0]) => host.subscribeDawTransport?.(on) ?? (() => undefined),
  };
  let state: DawSessionState = INITIAL;
  const listeners = new Set<() => void>();
  let running = false;
  let teardown: Array<() => void> = [];
  let leases = 0;
  let meterTimer: ReturnType<typeof setInterval> | undefined;
  let heardMetersAt: number | null = null;
  let asking = false;
  let episode = 0;
  // The report as the host sent it; `state.caps` is that report presented for the host's choice (see `presentCaps`).
  let rawCaps: DawCapabilities | null = null;

  const set = (patch: Partial<DawSessionState>) => {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  };

  const takeCapabilities = (next: DawCapabilities) => {
    // The transport validates every report against its schema, so only a half-built test double can answer with nothing.
    if (!running || !next) return;
    const now = Date.now();
    // Every change between answering and not answering is a new episode: a choice asked in an earlier one is about a start that is over.
    if (state.caps !== null && state.caps.reachable !== next.reachable) episode += 1;
    rawCaps = next;
    set({
      caps: presentCaps(next, next.reachable ? undefined : state.choice),
      capsCheckedAt: now,
      capsHeardAt: next.reachable ? now : state.capsHeardAt,
      capsReadFailed: false,
      capsError: '',
      offSince: next.reachable ? null : (state.offSince ?? now),
      // What the host says about a DAW that is not answering matters only while it is not: asked then, forgotten when it answers.
      ...(next.reachable && state.choice !== undefined ? { choice: undefined } : {}),
      capsVersion: state.capsVersion + 1,
    });
    if (!next.reachable) void readChoice();
  };

  // One read of the host's DAW choice at a time, asked with every report of a DAW that is not answering so "starting" and "connected" follow the report; a read that fails is `null`, which the callers treat as "the host cannot say".
  let choosing = false;
  // A report that comes in while a read is out (the host's emit right after it starts the DAW) asks for one more when this one ends, so "starting" is never missed.
  let askAgain = false;
  const readChoice = (): Promise<void> => {
    if (!running) return Promise.resolve();
    if (choosing) {
      askAgain = true;
      return Promise.resolve();
    }
    choosing = true;
    const asked = episode;
    // A read the host never answers is given up after a bound, so it cannot hold every later read back for the life of the app.
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    let gaveUp = false;
    const bound = new Promise<'gave up'>((resolve) => {
      giveUp = setTimeout(() => {
        gaveUp = true;
        resolve('gave up');
      }, DAW_CHOICE_READ_MS);
    });
    const answer = api.dawChoice();
    // The host's own answer that comes after the bound is still taken when it is about the same episode and nothing newer has been heard (#3668).
    void answer.then(
      (late) => {
        if (!gaveUp || !running || state.caps?.reachable || asked !== episode || state.choice) return;
        set({ choice: late, caps: presentCaps(rawCaps, late) });
      },
      () => undefined,
    );
    return Promise.race([answer, bound])
      .then(
        (next) => (next === 'gave up' ? undefined : next),
        () => undefined,
      )
      .then((next) => {
        // An answer that came in after the DAW did, or after it went off again, is about another episode: dropped, and asked again when it is still off.
        if (!running || state.caps?.reachable) return;
        if (asked !== episode) {
          askAgain = true;
          return;
        }
        // A read that failed keeps what the host last said: one failed read does not turn a start that is going on into "the host cannot say".
        if (next === undefined) {
          const was = state.choice;
          // What was heard is kept through a failed read only while the host's own window for a start (90 s) has not run out, so reads that keep failing cannot hold "starting" for ever.
          const windowEnds = was?.state === 'starting' && was.starting ? Date.parse(was.starting.since) + DAW_START_WINDOW_MS : 0;
          if (was === undefined || (was !== null && !(windowEnds > Date.now()))) set({ choice: null, caps: presentCaps(rawCaps, null) });
          return;
        }
        const was = state.choice;
        // The project's DAW changed while it was off (another project, a file linked): the time it has been off starts again.
        const changed = was && next && (was.daw !== next.daw || was.linkedFile !== next.linkedFile || was.hasProject !== next.hasProject);
        set({ choice: next, caps: presentCaps(rawCaps, next), ...(changed && state.offSince !== null ? { offSince: Date.now() } : {}) });
      })
      .finally(() => {
        clearTimeout(giveUp);
        choosing = false;
        if (askAgain && state.caps && !state.caps.reachable) {
          askAgain = false;
          void readChoice();
        }
        askAgain = false;
      });
  };

  let capsEvents = 0;
  const refreshCapabilities = () => {
    const before = capsEvents;
    return api.dawCapabilities().then(
      (next) => {
        // An event that arrived while the read was on its way is newer than the read.
        if (before === capsEvents) takeCapabilities(next);
      },
      (error: unknown) => {
        // A failed read keeps what was heard before and says it failed.
        if (running) set({ capsReadFailed: true, capsError: describeApiError(error) });
      },
    );
  };

  const checkConnection = () => {
    set({ checkVersion: state.checkVersion + 1 });
    return refreshCapabilities();
  };

  const readCapabilities = () =>
    api.dawCapabilities().then(
      (next) => {
        takeCapabilities(next);
        return next;
      },
      (error: unknown) => {
        if (running) set({ capsReadFailed: true, capsError: describeApiError(error) });
        throw error;
      },
    );

  const refreshFx = () => {
    if (!running) return Promise.resolve();
    set({ fx: { ...state.fx, reading: true } });
    return api.workspaceProjectFx().then(
      (chain) => {
        if (running) set({ fx: { chain, reading: false, error: '', readAt: Date.now() } });
      },
      (problem: unknown) => {
        // A failed read keeps its sentence and no stale list: the DAW's chain is a fact about now.
        if (running) set({ fx: { chain: null, reading: false, error: apiErrorMessage(problem), readAt: null } });
      },
    );
  };

  const metersAvailable = () => state.caps?.capabilities['daw_meters']?.available === true;

  const askMeters = () => {
    const now = Date.now();
    if (heardMetersAt !== null && now - heardMetersAt > DAW_METERS_QUIET_MS) {
      const seconds = Math.floor((now - heardMetersAt) / 1000);
      set({ meters: { kind: 'quiet', seconds, message: `Can't tell: the DAW's levels were last heard ${seconds} s ago.` } });
    }
    if (asking) return;
    asking = true;
    api
      .dawMeters()
      .then((answer) => {
        if (!running || leases === 0) return;
        if (!answer.ok) {
          heardMetersAt = null;
          set({ meters: { kind: 'off', message: answer.message } });
          return;
        }
        heardMetersAt = Date.now();
        set({ meters: { kind: 'ready', meters: answer } });
      })
      .catch((error: unknown) => {
        if (running && heardMetersAt === null) set({ meters: { kind: 'off', message: `Could not read the DAW's levels: ${apiErrorMessage(error)}` } });
      })
      .finally(() => {
        asking = false;
      });
  };

  // The meters are read while a screen holds a lease and the DAW declares them; either changing starts or stops the loop.
  const syncMeters = () => {
    const want = running && leases > 0 && metersAvailable();
    if (want && meterTimer === undefined) {
      askMeters();
      meterTimer = setInterval(askMeters, DAW_METERS_EVERY_MS);
    } else if (!want && meterTimer !== undefined) {
      clearInterval(meterTimer);
      meterTimer = undefined;
      heardMetersAt = null;
      if (state.meters.kind !== 'loading') set({ meters: { kind: 'loading' } });
    }
  };

  const session: DawSession = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (running) return;
      running = true;
      teardown = [
        api.subscribeDawCapabilities((next) => {
          capsEvents += 1;
          const was = state.caps?.reachable;
          // Any event says something changed, so a consumer that re-reads on a DAW change (capsVersion) re-reads even if the payload is empty.
          if (next) takeCapabilities(next);
          else set({ capsVersion: state.capsVersion + 1 });
          // The FX in the DAW are a fact about a running DAW: read again when it starts or stops answering, not on every report.
          if (was !== undefined && next && was !== next.reachable) void refreshFx();
        }),
        api.subscribeDawTransport((transport) => set({ transport })),
      ];
      const reread = () => {
        void refreshCapabilities();
        void refreshFx();
      };
      window.addEventListener('focus', reread);
      const timer = setInterval(() => {
        const { caps, capsCheckedAt } = state;
        if (caps === null || (!caps.reachable && Date.now() - (capsCheckedAt ?? 0) >= DAW_OFF_RECHECK_MS)) void refreshCapabilities();
      }, DAW_RETRY_MS);
      const sync = session.subscribe(syncMeters);
      teardown.push(
        () => window.removeEventListener('focus', reread),
        () => clearInterval(timer),
        sync,
      );
      void refreshCapabilities();
      void refreshFx();
      syncMeters();
    },
    stop() {
      if (!running) return;
      for (const undo of teardown) undo();
      teardown = [];
      if (meterTimer !== undefined) clearInterval(meterTimer);
      meterTimer = undefined;
      heardMetersAt = null;
      running = false;
      state = INITIAL;
    },
    refreshCapabilities,
    checkConnection,
    readCapabilities,
    takeCapabilities,
    refreshFx,
    leaseMeters() {
      leases += 1;
      syncMeters();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        leases -= 1;
        syncMeters();
      };
    },
  };
  return session;
}

/**
 * `api` with its DAW reads answered by `session`: a capability read goes to the host through the session (so every screen sees it), and
 * a subscription to capabilities or transport is a subscription to the session's state, not a second subscription to the host. The
 * DAW client port (`usePort('daw')`) is built over this, so a screen that asks the port is a consumer of the one session.
 */
export function withDawSession<A extends DawSessionApi>(api: A, session: DawSession): A {
  const onChange =
    <T>(read: (state: DawSessionState) => T | null | undefined) =>
    (onUpdate: (value: T) => void) => {
      let last = read(session.getState());
      return session.subscribe(() => {
        const next = read(session.getState());
        if (next === last) return;
        last = next;
        if (next !== null && next !== undefined) onUpdate(next);
      });
    };
  return {
    ...api,
    dawCapabilities: session.readCapabilities,
    subscribeDawCapabilities: onChange((state) => state.caps),
    subscribeDawTransport: (onUpdate) => {
      // Like the host's first tick on subscribe: a screen that subscribes after the DAW changed (the Booth, once a take has started) hears
      // the state the DAW is in now, so a later stop reads as a change from it.
      onUpdate(session.getState().transport);
      return onChange((state) => state.transport)(onUpdate);
    },
  };
}
