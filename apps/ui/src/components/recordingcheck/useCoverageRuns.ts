import { useCallback, useEffect, useState } from 'react';
import type { CoverageState } from '../../api/contracts/coverage';
import { usePort } from '../../ports/usePort';

const IDLE: CoverageState = { phase: 'idle', percent: 0, message: '' };

/** The checks in progress and just ended, by chapter: what a page that shows or starts one chapter's check needs once checks of several chapters can overlap. */
export type CoverageRuns = {
  /** The state of the chapter's own latest check, or idle: never another chapter's. */
  forChapter: (chapterId: string) => CoverageState;
  /** How many checks of other chapters are running now. */
  othersRunning: (chapterId: string) => number;
};

/**
 * Follows `coverage:state` for every chapter. The host sends one event stream for all runs, and with several chapters checked at once
 * each event belongs to its own chapter, so the latest event of the whole stream names no chapter's state. A page keeps this for as long as it can start
 * or show a check (so a run left going is picked up again), seeded from the host's latest state, and gives each chapter's panel its own.
 */
export function useCoverageRuns(): CoverageRuns {
  const coverage = usePort('coverage');
  const [byChapter, setByChapter] = useState<Readonly<Record<string, CoverageState>>>({});
  useEffect(() => {
    let active = true;
    const apply = (state: CoverageState) => {
      if (active && state.chapterId) setByChapter((current) => ({ ...current, [state.chapterId as string]: state }));
    };
    const unsubscribe = coverage.subscribeCoverage(apply);
    // A failed seed leaves the pages on what the events say next.
    coverage.coverageState().then(apply, () => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [coverage]);
  const forChapter = useCallback((chapterId: string) => byChapter[chapterId] ?? IDLE, [byChapter]);
  const othersRunning = useCallback(
    (chapterId: string) => Object.values(byChapter).filter((state) => state.phase === 'running' && state.chapterId !== chapterId).length,
    [byChapter],
  );
  return { forChapter, othersRunning };
}
