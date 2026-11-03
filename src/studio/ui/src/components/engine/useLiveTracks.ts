import { useCallback, useEffect, useRef, useState } from 'react';
import { describeApiError } from '../../api/errorMessage';
import type { TracksProject, TracksSavedReason, TracksSource } from '../../api/contracts/tracks';
import { usePort } from '../../ports/usePort';
import type { Notify } from '../primitives/Toast';

/** How often the panel reads REAPER's tracks again while the window is visible. */
export const LIVE_TRACKS_POLL_MS = 5_000;

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
  /** The last read failed: the tracks shown are from `readAt` and may not be what REAPER has now. */
  stale: boolean;
  /** Why the last read failed; empty when it did not. */
  error: string;
  /** Reads the tracks now (the Refresh button, the dialog opening). */
  refresh: () => void;
};

/**
 * The engine panel's one reader of the project's tracks (#2840): REAPER's track list now when REAPER has the linked project open, else the
 * saved .rpp with why (`TracksLive`). It reads when the panel opens and when `readKey` changes (the linked file, Check again), on window
 * focus, every LIVE_TRACKS_POLL_MS while the window is visible, and on `refresh`. A newer read always wins: an older one that answers late is
 * dropped, and an automatic read waits while one is in flight. A failure after a good read keeps the tracks, marks them stale and says so
 * once in a toast (and again on each Refresh press); a failure before any read is `error`, which the panel shows where the tracks would be.
 * Disabled (an Audacity project, whose tracks come from its snapshot), it never reads.
 */
export function useLiveTracks({ enabled, readKey, notify }: { enabled: boolean; readKey: unknown; notify: Notify }): LiveTracks {
  const tracks = usePort('tracks');
  const [state, setState] = useState<Omit<LiveTracks, 'refresh' | 'busy' | 'refreshing'>>({ reason: '', message: '', readAt: null, stale: false, error: '' });
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The newest read the narrator asked for, so its button stops spinning when that read ends.
  const pressedRead = useRef(0);
  // The newest read's number: an answer for any other is an older read answering late.
  const latest = useRef(0);
  const inFlight = useRef(0);
  const mounted = useRef(true);
  // Whether the last read failed, so a run of failed timer reads toasts once.
  const failing = useRef(false);
  const hasProject = useRef(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const read = useCallback(
    (force: boolean, pressed: boolean) => {
      if (!enabled || (!force && inFlight.current > 0)) return;
      const id = ++latest.current;
      inFlight.current += 1;
      setBusy(true);
      if (pressed) {
        pressedRead.current = id;
        setRefreshing(true);
      }
      tracks
        .tracksLive()
        .then((answer) => {
          if (!mounted.current || id !== latest.current) return;
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
        })
        .catch((reason: unknown) => {
          if (!mounted.current || id !== latest.current) return;
          const text = describeApiError(reason);
          if (hasProject.current && (pressed || !failing.current)) notifyRef.current(text, 'error');
          failing.current = true;
          setState((previous) => ({ ...previous, stale: hasProject.current, error: text }));
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
  useEffect(() => read(true, false), [read, readKey]);

  useEffect(() => {
    if (!enabled) return;
    const auto = () => read(false, false);
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

  const refresh = useCallback(() => read(true, true), [read]);
  return { ...state, busy, refreshing, refresh };
}
