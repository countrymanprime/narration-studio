import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import type { ProductionPlan } from '../../api/contracts/production';
import type { Measured } from '../../api/schemas/base';
import type { TakeLogEntry } from '../../fixtures/measurements';
import { usePort } from '../../ports/usePort';
import { scheduleChapters, type ScheduleChapter } from './progress';

/** The host answers nothing by itself when a book changes on disk or in the DAW, so the page asks again this often while it is open. */
export const REREAD_EVERY_MS = 60_000;
/** Coming back to the window re-reads at most this often, so a burst of focus events is one read. */
export const REREAD_FOCUS_GAP_MS = 30_000;

type Reading = {
  plan: ProductionPlan;
  chapters: ScheduleChapter[];
  profileId: string | undefined;
  /** Finished hours recorded so far, summed over the narrated chapters whose length was measured. */
  recordedHours: number;
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
 * What the Schedule reads from the host and keeps fresh: the plan, the chapters the estimates come from, the delivery profile and the take
 * log. It reads when the page opens, when the window is focused again (at most every 30 s), every minute while open, when the journal changes, and on `reload`.
 * A failed re-read keeps the last reading and says so; a first read that fails is an error with Retry.
 */
export function useScheduleReading(fixedToday: Date | undefined, journal: { subscribe: (listener: () => void) => () => void }): ScheduleReading {
  const production = usePort('production');
  const deliveryProfiles = usePort('deliveryProfiles');
  const measurements = usePort('measurements');
  const [state, setState] = useState<Phase>({ phase: 'loading' });
  const [refreshFailure, setRefreshFailure] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const writes = useRef(0);
  const lastAttempt = useRef(0);
  const plan = useRef<ProductionPlan | null>(null);
  const live = useRef(true);

  const reload = useCallback(async (): Promise<void> => {
    const writesAtStart = writes.current;
    lastAttempt.current = Date.now();
    try {
      const [fresh, overview, profiles, log] = await Promise.all([
        production.productionPlan(),
        production.productionOverview(),
        // The profile only decides which measures are offered; if it cannot be read the neutral profile applies.
        Promise.allSettled([deliveryProfiles.deliveryProfiles()]),
        // The take log only draws the chart's recorded line; a refused read leaves the line out with its reason.
        measurements.takeLog().catch((error: unknown): Measured<TakeLogEntry[]> => ({ ok: false, reason: apiErrorMessage(error) })),
      ]);
      // A save answered while this read was under way: its plan is newer than what this read saw, so this read gives way.
      if (!live.current || writes.current !== writesAtStart) return;
      const read = profiles[0];
      plan.current = fresh;
      setRefreshFailure(null);
      setClock(Date.now());
      setState({
        phase: 'ready',
        plan: fresh,
        chapters: scheduleChapters(overview.chapters),
        profileId: platformIdOf(read.status === 'fulfilled' ? read.value.projectProfile : undefined),
        recordedHours: overview.chapters.filter((c) => c.contentKind !== 'reference').reduce((a, c) => a + (c.recordedSeconds ?? 0), 0) / 3600,
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
  }, [production, deliveryProfiles, measurements]);

  useEffect(() => {
    live.current = true;
    void reload();
    return () => {
      live.current = false;
    };
  }, [reload]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setClock(Date.now());
      void reload();
    }, REREAD_EVERY_MS);
    const back = () => {
      if (document.visibilityState === 'hidden') return;
      setClock(Date.now());
      if (Date.now() - lastAttempt.current >= REREAD_FOCUS_GAP_MS) void reload();
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, [reload]);

  // An entry taken back from the history panel changes the plan without this page: read it again, so the page shows what the host holds.
  useEffect(() => journal.subscribe(() => void reload()), [journal, reload]);

  const keepPlan = useCallback((next: ProductionPlan) => {
    writes.current += 1;
    plan.current = next;
    setState((now) => (now.phase === 'ready' ? { ...now, plan: next } : now));
  }, []);

  return {
    state,
    refreshFailure,
    day: fixedToday ?? new Date(clock),
    reload,
    keepPlan,
    now: clock,
  };
}
