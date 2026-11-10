import { useCallback, useEffect, useRef, useState } from 'react';
import { describeApiError } from '../../api/errorMessage';
import type { TracksLive, TracksProject, TracksSavedReason, TracksSource } from '../../api/contracts/tracks';
import { usePort } from '../../ports/usePort';
import { retryAction, type Notify } from '../primitives/Toast';

/** How often the panel reads REAPER's tracks again while the window is visible. */
export const LIVE_TRACKS_POLL_MS = 5_000;

/** How long one read may go unanswered before it counts as failed: the host gives REAPER 3 s (tracksLiveTimeout in tracks_live.go), and
 * this leaves time for the saved file's parse and the binding's own trip. A read that never answers must not hold every later read back. */
export const LIVE_TRACKS_TIMEOUT_MS = 8_000;

export type LiveTracks = {
  /** The project's tracks from the last read that answered; undefined before the first. */
  project?: TracksProject;
  /** Where they came from: REAPER now, or the saved project file. */
  source?: TracksSource;
  /** Why they are the saved file's, and the host's sentence for it; empty for REAPER's own list. */
  reason: TracksSavedReason | '';
  message: string;
  /** When the last read answered (Unix ms); null before the first. */
  readAt: number | null;
  /** A read is in flight. */
  busy: boolean;
  /** A read the narrator asked for (Refresh) is in flight; the timer's and focus's reads are not shown as busy. */
  refreshing: boolean;
  /** The last read failed after a good one: the tracks shown are from `readAt` and may not be what REAPER has now. */
  stale: boolean;
  /** Why the last read failed; empty when it did not. */
  error: string;
  /** Reads the tracks now (the Refresh button, a toast's Retry). */
  refresh: () => void;
  /** Reads the tracks now like `refresh` and answers what the read found, or undefined when it failed (a toast says so), was replaced by a newer read, or the project is Audacity's. */
  /** Reads now and answers with the project, or `failed` when the read failed (its own toast says so); neither when no live read applies. */
  recheck: () => Promise<{ project?: TracksProject; failed: boolean }>;
  /** Reads the tracks unless a read is already in flight, which it then shares (the Link chapters dialog opening). */
  join: () => void;
};

class UnansweredError extends Error {}

/** `read`, or a failure once LIVE_TRACKS_TIMEOUT_MS passes with no answer; the late answer is then dropped. */
function withinLimit(read: Promise<TracksLive>): Promise<TracksLive> {
  let timer = 0;
  const limit = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new UnansweredError('REAPER did not answer.')), LIVE_TRACKS_TIMEOUT_MS);
  });
  return Promise.race([read, limit]).finally(() => window.clearTimeout(timer));
}

/**
 * The engine panel's one reader of the project's tracks (#2840): REAPER's track list now when REAPER has the linked project open, else the
 * saved .rpp with why (`TracksLive`). It reads when the panel opens and when `readKey` changes (the linked file, Check again), on window
 * focus, every LIVE_TRACKS_POLL_MS while the window is visible, and on `refresh`. A newer read always wins: an older one that answers late is
 * dropped, and an automatic read waits while one is in flight. A read unanswered after LIVE_TRACKS_TIMEOUT_MS counts as failed, so the poll
 * goes on. A failure is a toast with Retry: once for a run of automatic failures, and again on each press. After a good read the tracks are
 * kept and marked stale. Disabled (an Audacity project, whose tracks come from its snapshot), it never reads.
 */
export function useLiveTracks({ enabled, readKey, notify }: { enabled: boolean; readKey: unknown; notify: Notify }): LiveTracks {
  const tracks = usePort('tracks');
  const [state, setState] = useState<Omit<LiveTracks, 'refresh' | 'recheck' | 'join' | 'busy' | 'refreshing'>>({
    reason: '',
    message: '',
    readAt: null,
    stale: false,
    error: '',
  });
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The newest read the narrator asked for, so its button stops spinning when that read ends.
  const pressedRead = useRef(0);
  // The newest read's number: an answer for any other is an older read answering late.
  const latest = useRef(0);
  const inFlight = useRef(0);
  const mounted = useRef(true);
  // Whether the last read failed, so a run of failed automatic reads toasts once.
  const failing = useRef(false);
  const hasProject = useRef(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const refreshRef = useRef<() => void>(() => {});

  const read = useCallback(
    (force: boolean, pressed: boolean): Promise<{ project?: TracksProject; failed: boolean }> => {
      if (!enabled || (!force && inFlight.current > 0)) return Promise.resolve({ failed: false });
      const id = ++latest.current;
      inFlight.current += 1;
      setBusy(true);
      if (pressed) {
        pressedRead.current = id;
        setRefreshing(true);
      }
      return withinLimit(tracks.tracksLive())
        .then((answer) => {
          if (!mounted.current || id !== latest.current) return { failed: false };
          failing.current = false;
          hasProject.current = true;
          setState({
            project: answer.project,
            source: answer.source,
            reason: answer.reason,
            message: answer.message,
            readAt: Date.now(),
            stale: false,
            error: '',
          });
          return { project: answer.project, failed: false };
        })
        .catch((reason: unknown) => {
          if (!mounted.current || id !== latest.current) return { failed: false };
          const text = describeApiError(reason);
          if (pressed || !failing.current)
            notifyRef.current(
              text,
              'error',
              retryAction(() => refreshRef.current()),
            );
          failing.current = true;
          setState((previous) => ({ ...previous, stale: hasProject.current, error: text }));
          return { failed: true };
        })
        .finally(() => {
          inFlight.current -= 1;
          if (!mounted.current) return;
          if (inFlight.current === 0) setBusy(false);
          if (id === pressedRead.current) setRefreshing(false);
        });
    },
    [enabled, tracks],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // readKey has no meaning of its own: a change asks for a fresh read (another linked file, Check again).
  useEffect(() => {
    void read(true, false);
  }, [read, readKey]);

  useEffect(() => {
    if (!enabled) return;
    const auto = () => void read(false, false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') auto();
    };
    const timer = window.setInterval(onVisible, LIVE_TRACKS_POLL_MS);
    window.addEventListener('focus', auto);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', auto);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, read]);

  const refresh = useCallback(() => void read(true, true), [read]);
  refreshRef.current = refresh;
  const recheck = useCallback(() => read(true, true), [read]);
  const join = useCallback(() => void read(false, false), [read]);
  return { ...state, busy, refreshing, refresh, recheck, join };
}
