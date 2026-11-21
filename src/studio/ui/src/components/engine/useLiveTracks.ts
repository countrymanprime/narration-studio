import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cutHostWords } from '../chapterTracks/chapterLink';
import { apiErrorMessage, describeApiError } from '../../api/errorMessage';
import type { TracksLive, TracksProject, TracksSavedReason, TracksSource } from '../../api/contracts/tracks';
import { usePort } from '../../ports/usePort';
import { retryAction, type Notify } from '../primitives/Toast';

/** How often the panel reads REAPER's tracks again while the window is visible and REAPER reports no track-list revision (an older bridge
 * script, REAPER not answering, the saved file's tracks). With a revision the track list changes only with `daw_tracks_changed`, and the timer reads every LIVE_TRACKS_SAVED_POLL_MS. */
export const LIVE_TRACKS_POLL_MS = 5_000;
/** While REAPER reports a revision the timer reads only this often: a save in REAPER changes what the list shows from the .rpp (items, colour, mute, solo) and sends no event. */
export const LIVE_TRACKS_SAVED_POLL_MS = 30_000;
/** The longest the timer waits between reads while REAPER does not answer: each failed automatic read doubles the wait (5 s, 10 s, 20 s, 40 s, then this), a good read ends it.
 * The wait is counted in timer ticks, so a clock set back or forward changes nothing, and it is about this long from the failure: the read's own time (up to
 * LIVE_TRACKS_TIMEOUT_MS) and the tick's phase come on top. */
export const LIVE_TRACKS_BACKOFF_MAX_MS = 60_000;
/** The topic of a tracks read's toast: a read's answer replaces the failure (or the earlier answer) it follows, so two opposite messages never stand together (#3339). */
export const TRACKS_READ_TOPIC = 'tracks-read';

/** How long one read may go unanswered before it counts as failed: the host gives REAPER 7 s (tracksLiveTimeout in tracks_live.go), and
 * this leaves time for the saved file's parse and the binding's own trip. A read that never answers must not hold every later read back. */
export const LIVE_TRACKS_TIMEOUT_MS = 10_000;

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
  /** The last read carried REAPER's track-list revision, so a change arrives as `daw_tracks_changed` and a page that polls for the DAW's state may poll less. */
  following: boolean;
  /** The last read failed after a good one: the tracks shown are from `readAt` and may not be what REAPER has now. */
  stale: boolean;
  /** Why the last read failed; empty when it did not. */
  error: string;
  /** Reads the tracks now (the Refresh button, a toast's Retry). */
  refresh: () => void;
  /** Reads now like `refresh` and answers the project, or `failed` when the read failed (its own toast says so); neither when no live read applies (Audacity's project, or a newer read replaced this one). */
  recheck: () => Promise<{ project?: TracksProject; source?: TracksSource; failed: boolean }>;
  /** Reads the tracks now as the timer does: not a press, so no spinner, and a failure is the run's one toast (a changed read key). */
  reread: () => void;
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
 * focus, on `refresh`, and when REAPER's track list changes: on `daw_tracks_changed` while the last read carried a revision, else every
 * LIVE_TRACKS_POLL_MS while the window is visible (every LIVE_TRACKS_SAVED_POLL_MS with a revision, for a save in REAPER). A newer read always wins: an older one that answers late is
 * dropped, and an automatic read waits while one is in flight. A read unanswered after LIVE_TRACKS_TIMEOUT_MS counts as failed, so the poll
 * goes on, less often while REAPER keeps not answering (LIVE_TRACKS_BACKOFF_MAX_MS). A failure is a toast with Retry: once for a run of automatic failures, and again on each press. After a good read the tracks are
 * kept and marked stale. Disabled (an Audacity project, whose tracks come from its snapshot), it never reads.
 */
export function useLiveTracks({
  enabled,
  readKey,
  notify,
  onRetry,
}: {
  enabled: boolean;
  readKey: unknown;
  notify: Notify;
  /** What a failure toast's Retry does, when it is not this hook's own `refresh` (the shared state, which also reads the links and works with no screen watching). */
  onRetry?: () => void;
}): LiveTracks {
  const tracks = usePort('tracks');
  const [state, setState] = useState<Omit<LiveTracks, 'refresh' | 'recheck' | 'reread' | 'join' | 'busy' | 'refreshing'>>({
    reason: '',
    message: '',
    readAt: null,
    stale: false,
    error: '',
    following: false,
  });
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The newest read the narrator asked for, so its button stops spinning when that read ends.
  const pressedRead = useRef(0);
  // The newest read's number: an answer for any other is an older read answering late.
  const latest = useRef(0);
  // The newest read's answer: a press that a newer read took over resolves with it, so it still gets its answer (#3339).
  const newest = useRef<Promise<{ project?: TracksProject; source?: TracksSource; failed: boolean }>>(undefined);
  const inFlight = useRef(0);
  const mounted = useRef(true);
  // Whether the last read failed, so a run of failed automatic reads toasts once.
  const failing = useRef(false);
  // Consecutive automatic reads that failed, and the timer ticks still to let pass before it reads again (not focus, Refresh or a new read key): a
  // REAPER that is closed or stalled costs each read up to its limit, so the timer asks less often until it answers (#3647). A failed press does
  // not count: the narrator pressing Retry must not lengthen the wait for the first automatic read after REAPER is back.
  const failures = useRef(0);
  const skipTicks = useRef(0);
  const hasProject = useRef(false);
  // The track-list revision the list shown was read at; '' is none known (no read yet, a failed read, the saved file, an older script), and
  // the timer reads. `heard` is that an event arrived during a read: the read may have left before the change, so one more follows it.
  const revision = useRef('');
  const heard = useRef(false);
  // Timer ticks since the last read while a revision is held (LIVE_TRACKS_SAVED_POLL_MS).
  const quiet = useRef(0);
  const readRef = useRef<() => void>(() => {});
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const refreshRef = useRef<() => void>(() => {});
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;

  const read = useCallback(
    (force: boolean, pressed: boolean): Promise<{ project?: TracksProject; source?: TracksSource; failed: boolean }> => {
      if (!enabled || (!force && inFlight.current > 0)) return Promise.resolve({ failed: false });
      const id = ++latest.current;
      inFlight.current += 1;
      setBusy(true);
      if (pressed) {
        pressedRead.current = id;
        setRefreshing(true);
      }
      const run = withinLimit(tracks.tracksLive())
        .then((answer) => {
          if (!mounted.current) return { failed: false };
          if (id !== latest.current) return newest.current ?? { failed: false };
          failing.current = false;
          failures.current = 0;
          skipTicks.current = 0;
          hasProject.current = true;
          revision.current = answer.revision;
          quiet.current = 0;
          setState({
            project: answer.project,
            source: answer.source,
            reason: answer.reason,
            message: answer.message,
            readAt: Date.now(),
            stale: false,
            error: '',
            following: answer.revision !== '',
          });
          return { project: answer.project, source: answer.source, failed: false };
        })
        .catch((reason: unknown) => {
          if (!mounted.current) return { failed: false };
          if (id !== latest.current) return newest.current ?? { failed: false };
          const text = cutHostWords(describeApiError(reason));
          if (pressed || !failing.current)
            notifyRef.current(
              text,
              'error',
              retryAction(() => (onRetryRef.current ?? refreshRef.current)()),
              undefined,
              undefined,
              TRACKS_READ_TOPIC,
            );
          failing.current = true;
          revision.current = '';
          if (!pressed && !force) {
            failures.current += 1;
            const ticks = Math.min(2 ** Math.min(failures.current - 1, 10), LIVE_TRACKS_BACKOFF_MAX_MS / LIVE_TRACKS_POLL_MS);
            skipTicks.current = ticks - 1;
          }
          // The toast above keeps describeApiError's wording; the line a panel draws is the bare message, without the "Error: " prefix.
          setState((previous) => ({ ...previous, stale: hasProject.current, error: apiErrorMessage(reason), following: false }));
          return { failed: true };
        })
        .finally(() => {
          inFlight.current -= 1;
          if (!mounted.current) return;
          if (inFlight.current === 0) setBusy(false);
          if (id === pressedRead.current) setRefreshing(false);
          // The list changed while this read was out: read once more.
          if (inFlight.current > 0 || !heard.current) return;
          heard.current = false;
          readRef.current();
        });
      newest.current = run;
      return run;
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
    // The timer keeps the backoff; coming back to the window (focus, visibility) is the narrator, and reads at once.
    const onTimer = () => {
      if (revision.current !== '') {
        quiet.current += 1;
        if (quiet.current < LIVE_TRACKS_SAVED_POLL_MS / LIVE_TRACKS_POLL_MS) return;
      }
      quiet.current = 0;
      if (skipTicks.current > 0) skipTicks.current -= 1;
      else onVisible();
    };
    const timer = window.setInterval(onTimer, LIVE_TRACKS_POLL_MS);
    readRef.current = auto;
    // REAPER's list changed, its revision became known or not known, or REAPER has another project with the same list: the host sends
    // the event only on a change, so each one reads. A hidden window reads when it is shown again.
    const stop = tracks.subscribeTracksChanged(() => {
      if (inFlight.current > 0) heard.current = true;
      else if (document.visibilityState === 'visible') auto();
    });
    window.addEventListener('focus', auto);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      stop();
      readRef.current = () => {};
      heard.current = false;
      window.removeEventListener('focus', auto);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, read, tracks]);

  const refresh = useCallback(() => void read(true, true), [read]);
  refreshRef.current = refresh;
  const recheck = useCallback(() => read(true, true), [read]);
  const reread = useCallback(() => void read(true, false), [read]);
  const join = useCallback(() => void read(false, false), [read]);
  // One object while nothing changed, so a consumer that depends on it does not render on every render of this hook's owner.
  return useMemo(() => ({ ...state, busy, refreshing, refresh, recheck, reread, join }), [state, busy, refreshing, refresh, recheck, reread, join]);
}
