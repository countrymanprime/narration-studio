import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import type { ProductionPlan } from '../../api/contracts/production';
import type { Measured } from '../../api/schemas/base';
import type { TakeLogEntry } from '../../fixtures/measurements';
import { usePort } from '../../ports/usePort';
import { useChapters, useReadChapters } from '../../studio/useChapters';
import { masterByChapter } from '../production/usePipelineSources';
import { scheduleChapters, type ScheduleChapter } from './progress';

/** The host answers nothing by itself when a book changes on disk or in the DAW, so the page asks again this often while it is open. */
export const REREAD_EVERY_MS = 60_000;
/** Coming back to the window re-reads at most this often, so a burst of focus events is one read. */
export const REREAD_FOCUS_GAP_MS = 30_000;

type Reading = {
  plan: ProductionPlan;
  chapters: ScheduleChapter[];
  profileId: string | undefined;
  /** The chapters the delivery review has mastered, as Production reads them: a chapter delivered with its checks passing is recorded whatever its stage says. Absent while the measurement cannot be read. */
  master: ReturnType<typeof masterByChapter> | undefined;
  /** The take log, or why it could not be read: the chart's recorded line is drawn from it. */
  takeLog: Measured<TakeLogEntry[]>;
  /** When this reading was taken (ms since the epoch). */
  readAt: number;
};

type Phase = { phase: 'loading' } | { phase: 'error'; message: string } | ({ phase: 'ready' } & Reading);

/** The platform a delivery profile key ("acx@2026-09") names. */
const platformIdOf = (projectProfile: string | undefined): string | undefined => projectProfile?.split('@')[0] || undefined;

export type ScheduleReading = {
  state: Phase;
  /** Why the last re-read failed while an earlier reading is still on screen; null when the last read worked. */
  refreshFailure: string | null;
  /** The day the estimates start from: the real date, read again with every re-read and every tick, so the page moves on at midnight. */
  day: Date;
  /** Reads again now. A read that began before a save never replaces what that save answered. */
  reload: () => Promise<void>;
  /** Puts a plan the host just answered on screen, and makes any read already under way give way to it. */
  keepPlan: (plan: ProductionPlan) => void;
  /** The time now, for a notice that says how long ago the reading was. Moves with the tick. */
  now: number;
};

/**
 * What the Schedule reads from the host and keeps fresh: the plan, the shared chapter list the estimates come from, the delivery profile and the take
 * log. It reads when the page opens, when the window is focused again (at most every 30 s), every minute while open, when the journal changes, and on `reload`.
 * A failed re-read keeps the last reading and says so; a first read that fails is an error with Retry.
 */
export function useScheduleReading(fixedToday: Date | undefined, journal: { subscribe: (listener: () => void) => () => void }): ScheduleReading {
  const production = usePort('production');
  const deliveryProfiles = usePort('deliveryProfiles');
  const measurements = usePort('measurements');
  const measure = usePort('measure');
  // The chapters (their set, names, kinds, words, stages and recorded length) are the shared list every page reads, not a copy from the overview.
  const readChapters = useReadChapters();
  const [state, setState] = useState<Phase>({ phase: 'loading' });
  const [refreshFailure, setRefreshFailure] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const writes = useRef(0);
  const lastAttempt = useRef(0);
  const plan = useRef<ProductionPlan | null>(null);
  const live = useRef(true);

  // `fresh` reads the list now: the tick, the focus and Retry exist for a DAW or disk change that sends no event. The first read and a journal change take the held list.
  const read = useCallback(
    async (fresh: boolean): Promise<void> => {
      const writesAtStart = writes.current;
      lastAttempt.current = Date.now();
      try {
        const [nextPlan, chapters, profiles, log, job] = await Promise.all([
          production.productionPlan(),
          readChapters(fresh),
          // The profile only decides which measures are offered; if it cannot be read the neutral profile applies.
          Promise.allSettled([deliveryProfiles.deliveryProfiles()]),
          // The take log only draws the chart's recorded line; a refused read leaves the line out with its reason.
          measurements.takeLog().catch((error: unknown): Measured<TakeLogEntry[]> => ({ ok: false, reason: apiErrorMessage(error) })),
          // The mastering measurement only says which chapters are delivered; one that cannot be read leaves them as their stage says.
          measure.measureState().catch(() => undefined),
        ]);
        // A save answered while this read was under way: its plan is newer than what this read saw, so this read gives way.
        if (!live.current || writes.current !== writesAtStart) return;
        const read = profiles[0];
        plan.current = nextPlan;
        setRefreshFailure(null);
        const master = job?.files.length ? masterByChapter(chapters, job.files) : undefined;
        setClock(Date.now());
        setState({
          phase: 'ready',
          plan: nextPlan,
          chapters: scheduleChapters(chapters, master),
          master,
          profileId: platformIdOf(read.status === 'fulfilled' ? read.value.projectProfile : undefined),
          takeLog: log,
          readAt: Date.now(),
        });
      } catch (error) {
        if (!live.current || writes.current !== writesAtStart) return;
        const message = apiErrorMessage(error);
        // With a reading on screen the page keeps it and says it is old; with none the first read failed.
        if (plan.current) setRefreshFailure(message);
        else setState({ phase: 'error', message: `The schedule could not be read: ${message}` });
      }
    },
    [production, deliveryProfiles, measurements, measure, readChapters],
  );
  // Retry from the first read's error swaps the error for the skeleton while it reads again, as on every other page (the error comes back if it fails again).
  const reload = useCallback(() => {
    setState((current) => (current.phase === 'error' ? { phase: 'loading' } : current));
    return read(true);
  }, [read]);

  useEffect(() => {
    live.current = true;
    void read(false);
    return () => {
      live.current = false;
    };
  }, [read]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setClock(Date.now());
      void read(true);
    }, REREAD_EVERY_MS);
    const back = () => {
      if (document.visibilityState === 'hidden') return;
      setClock(Date.now());
      if (Date.now() - lastAttempt.current >= REREAD_FOCUS_GAP_MS) void read(true);
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, [read]);

  // An entry taken back from the history panel changes the plan without this page: read it again, so the page shows what the host holds.
  useEffect(() => journal.subscribe(() => void read(false)), [journal, read]);

  const keepPlan = useCallback((next: ProductionPlan) => {
    writes.current += 1;
    plan.current = next;
    setState((now) => (now.phase === 'ready' ? { ...now, plan: next } : now));
  }, []);

  // The chapter figures follow the live shared list, as the pace does: when the store re-reads the list (a focus, an event, another page) every figure on this page moves
  // with it, so the page never sets an old copy of the list beside the pace worked out from the new one. The read above still decides loading, the first error and the plan.
  const shared = useChapters().chapters;
  const view = useMemo<Phase>(
    () => (state.phase === 'ready' && shared ? { ...state, chapters: scheduleChapters(shared, state.master) } : state),
    [state, shared],
  );

  return {
    state: view,
    refreshFailure,
    day: fixedToday ?? new Date(clock),
    reload,
    keepPlan,
    now: clock,
  };
}
