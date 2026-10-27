import type { DawCapabilities, DawMeters, DawTransport } from '../api/contracts/daw';
import type { WorkspaceProjectFxResult } from '../api/contracts/workspace';
import { apiErrorMessage, describeApiError } from '../api/errorMessage';
import type { NarrationApi } from '../types';

/** How often the DAW's meters are read while any screen holds a lease: often enough to follow a voice, one read at a time. */
export const DAW_METERS_EVERY_MS = 250;

/** How long without an answer before the meters say they cannot tell instead of showing the last reading as now. */
export const DAW_METERS_QUIET_MS = 2_000;

/** How often a capability report that has never been heard is asked for again; an off DAW is asked again every `DAW_OFF_RECHECK_MS`. */
export const DAW_RETRY_MS = 4_000;
export const DAW_OFF_RECHECK_MS = 10_000;

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
  /** Counts every capability report taken, so a consumer that re-reads something on a DAW change keys an effect on it. */
  capsVersion: number;
  /** REAPER's transport from `daw_transport_changed`; stopped until the first push. */
  transport: DawTransport;
  meters: DawMetersState;
  fx: DawFxState;
}

/** The part of the api the session reads: the one place the app talks to the DAW's live state. */
export type DawSessionApi = Pick<NarrationApi, 'dawCapabilities' | 'subscribeDawCapabilities' | 'subscribeDawTransport' | 'dawMeters' | 'workspaceProjectFx'>;

export interface DawSession {
  getState(): DawSessionState;
  subscribe(listener: () => void): () => void;
  /** Subscribes to the host and reads the first answers; safe to call again after `stop`. */
  start(): void;
  /** Drops every subscription, timer and listener the session made. */
  stop(): void;
  /** Asks the DAW for its capabilities again, resolving once the answer is in. */
  refreshCapabilities(): Promise<void>;
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
  capsVersion: 0,
  transport: { playing: false, recording: false },
  meters: { kind: 'loading' },
  fx: { chain: null, reading: true, error: '', readAt: null },
};

/**
 * The one session the app holds with the DAW: its capability report, transport, meters and FX are read, pushed and kept here once, from
 * app start, and every screen reads them from this store. No screen subscribes to the host for DAW state by itself, so what a screen
 * shows never depends on which other screen has mounted. `ApiProvider` creates and starts it; see `useDawSession.ts` for the hooks.
 */
export function createDawSession(host: DawSessionApi): DawSession {
  // A call that throws before it returns a promise (an api double without the method) is a failed read, like any other.
  const api = {
    dawCapabilities: () => Promise.resolve().then(() => host.dawCapabilities()),
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

  const set = (patch: Partial<DawSessionState>) => {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  };

  const takeCapabilities = (next: DawCapabilities) => {
    // The transport validates every report against its schema, so only a half-built test double can answer with nothing.
    if (!running || !next) return;
    const now = Date.now();
    set({
      caps: next,
      capsCheckedAt: now,
      capsHeardAt: next.reachable ? now : state.capsHeardAt,
      capsReadFailed: false,
      capsError: '',
      capsVersion: state.capsVersion + 1,
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
    subscribeDawTransport: onChange((state) => state.transport),
  };
}
