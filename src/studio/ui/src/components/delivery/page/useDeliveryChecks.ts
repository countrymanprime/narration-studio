import { useEffect } from 'react';
import { usePort } from '../../../ports/usePort';
import { useStoreHandle, useStudio } from '../../../studio/StudioProvider';
import type { MeasureJob } from '../../../types';
import { useHostRead } from './useHostRead';

/** The store records a failed read in `errors.chapters`, which the page shows with Check again; the call itself has nothing more to do. */
const recorded = (_failure: unknown): void => undefined;

/**
 * What "Before you build" judges: the chapters (the store's `chapters` slot, docs/architecture/ui-state-and-journal.md#the-store-host-reads-cached: read when the page opens, stale when a job ends, read
 * again on focus, and a failed read keeps the last list) and the host's measurement of the files, read when the page opens, when the window
 * regains focus, when a job ends and every half second while a measurement runs. A measurement that cannot be read is not shown as
 * "Not mastered": the page says it cannot tell.
 */
export function useDeliveryChecks() {
  const measure = usePort('measure');
  const system = usePort('system');
  const studio = useStoreHandle();
  const chapters = useStudio((state) => state.slots.chapters);
  const chaptersError = useStudio((state) => state.errors.chapters);
  const job = useHostRead<MeasureJob>(
    () => measure.measureState(),
    (value) => value.phase === 'running',
  );
  const { again } = job;

  useEffect(() => {
    void studio.load('chapters').catch(recorded);
  }, [studio]);
  useEffect(() => system.subscribeJobEnded(() => again()), [system, again]);

  return {
    chapters,
    chaptersError: chaptersError?.message,
    job: job.value,
    jobError: job.error,
    lastHeard: job.lastHeard,
    /** Reads the measurement again: the host judges it against the profile as it is now, so a profile change or edit needs this. */
    reread: again,
    /** Reads the chapters and the measurement now. */
    checkAgain: () => {
      void studio.load('chapters').catch(recorded);
      again();
    },
  };
}
