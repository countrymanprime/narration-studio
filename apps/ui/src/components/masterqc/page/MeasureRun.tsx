// The run controls Master & QC keeps above the files table (not in the mock's grid): pick files, read the measurement while it runs
// (ADR 0015 progress), cancel, and check again. The logic is the old page's, copied because that page is deleted by the swap.
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { MeasureJob } from '../../../types';
import { Button } from '../../primitives/Button';
import { ProgressBar } from '../../primitives/ProgressBar';

/** How often a running measurement is read. */
const POLL_MS = 500;

const DANGER = { color: 'var(--danger-text)' };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function useMeasureRun() {
  const measure = usePort('measure');
  const [job, setJob] = useState<MeasureJob>();
  const [jobError, setJobError] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let active = true;
    measure.measureState().then(
      (state) => active && setJob(state),
      (error) => active && setJobError(apiErrorMessage(error)),
    );
    return () => {
      active = false;
    };
  }, [measure]);

  // A running measurement is read until it ends; an answer after the page closed is dropped.
  const running = job?.phase === 'running';
  useEffect(() => {
    if (!running) return;
    let active = true;
    const timer = setTimeout(() => {
      measure.measureState().then(
        (next) => active && setJob(next),
        (error) => active && setJobError(apiErrorMessage(error)),
      );
    }, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [measure, running, job]);

  const files = job?.files ?? [];
  const ended = job !== undefined && (job.phase === 'success' || job.phase === 'cancelled' || job.phase === 'error');
  // The files of a measurement that has ended were picked, so they can be checked again without picking them again.
  const paths = ended ? files.map((file) => file.path) : [];

  const analyze = async (picked: string[]) => {
    setJob(await measure.measureAnalyze(picked));
    setJobError(undefined);
  };
  const run = async (reuse: boolean) => {
    setChecking(true);
    setProblem(undefined);
    try {
      if (reuse && paths.length > 0) return await analyze(paths);
      const picked = await measure.measurePickFiles();
      if (picked.paths.length > 0) await analyze(picked.paths);
    } catch (error) {
      setProblem(apiErrorMessage(error));
    } finally {
      setChecking(false);
    }
  };
  const cancel = () => void measure.measureCancel().then(setJob, (error) => setProblem(apiErrorMessage(error)));

  return { job, files, running, paths, checking, jobError, problem, check: () => run(true), chooseOther: () => run(false), cancel };
}
export type MeasureRun = ReturnType<typeof useMeasureRun>;

/** "Check files…" (or "Re-check n files" once some were measured) and "Choose other files…". */
export function MeasureControls({ run }: { run: MeasureRun }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {run.paths.length > 0 && (
        <Button variant="ghost" onClick={() => void run.chooseOther()} disabled={run.running || run.checking}>
          Choose other files…
        </Button>
      )}
      <Button onClick={() => void run.check()} pending={run.checking} disabled={run.running}>
        {run.paths.length > 0 ? `Re-check ${plural(run.paths.length, 'file', 'files')}` : 'Check files…'}
      </Button>
    </div>
  );
}

/** The progress of a running measurement with Cancel, and what went wrong reading or starting one. */
export function MeasureProgress({ run }: { run: MeasureRun }) {
  const { job } = run;
  return (
    <>
      {run.jobError && (
        <p role="alert" className="text-sm" style={DANGER}>
          The measurement could not be read: {run.jobError}
        </p>
      )}
      {run.problem && (
        <p role="alert" className="text-sm" style={DANGER}>
          {run.problem}
        </p>
      )}
      {job?.phase === 'error' && (
        <p role="alert" className="text-sm" style={DANGER}>
          {job.message} Choose the files again to measure them.
        </p>
      )}
      {job && run.running && (
        <div className="flex flex-col gap-2">
          <ProgressBar label="Measuring" value={job.percent} running valueText={`${job.percent}% read`} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite" className="text-sm">
              {job.message}
            </p>
            <Button variant="secondary" onClick={run.cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
