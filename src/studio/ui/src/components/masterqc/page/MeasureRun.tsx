// The run controls Master & QC keeps above the files table (not in the mock's grid): pick files, read the measurement while it runs
// (docs/architecture/principles.md progress), cancel, and check again. The logic is the old page's, copied because that page is deleted by the swap.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { useErrorToast } from '../../../hooks/useErrorToast';
import { usePort } from '../../../ports/usePort';
import type { MeasureJob } from '../../../types';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { ProgressBar } from '../../primitives/ProgressBar';

/** How often a running measurement is read. */
const POLL_MS = 500;
/** How often a read that failed is tried again. */
const RETRY_MS = 2000;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function useMeasureRun() {
  const measure = usePort('measure');
  const [job, setJob] = useState<MeasureJob>();
  const [jobError, setJobError] = useState<string>();
  const [lastHeard, setLastHeard] = useState<number>();
  const [problem, setProblem] = useState<string>();
  const [checking, setChecking] = useState(false);
  // Every read and every start or cancel takes a number when it is sent; an answer older than one already shown is dropped, so a read that
  // arrives late (after Cancel, or after a newer read) never brings an old state back.
  const sent = useRef(0);
  const shown = useRef(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const accept = useCallback((seq: number, next: MeasureJob) => {
    if (!live.current || seq < shown.current) return false;
    shown.current = seq;
    setJob(next);
    setJobError(undefined);
    setLastHeard(Date.now());
    return true;
  }, []);
  const read = useCallback(() => {
    const seq = ++sent.current;
    return measure.measureState().then(
      (state) => void accept(seq, state),
      (error) => {
        if (live.current) setJobError(apiErrorMessage(error));
      },
    );
  }, [measure, accept]);

  // The host's job is read when the page opens (a run that started before is shown again) and when the window regains focus.
  useEffect(() => {
    void read();
    const again = () => void read();
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, [read]);

  // A running measurement is read until it ends, and a read that failed or never answered is tried again: one lost answer does not
  // freeze the bar. An answer after the page closed is dropped.
  const running = job?.phase === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => void read(), jobError ? RETRY_MS : POLL_MS);
    return () => clearTimeout(timer);
  }, [read, running, job, jobError]);

  const files = job?.files ?? [];
  const ended = job !== undefined && (job.phase === 'success' || job.phase === 'cancelled' || job.phase === 'error');
  // The files of a measurement that has ended were picked, so they can be checked again without picking them again.
  const paths = ended ? files.map((file) => file.path) : [];

  const analyze = async (picked: string[]) => {
    const seq = ++sent.current;
    accept(seq, await measure.measureAnalyze(picked));
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
  const cancel = () => {
    const seq = ++sent.current;
    void measure.measureCancel().then(
      (next) => void accept(seq, next),
      (error) => setProblem(apiErrorMessage(error)),
    );
  };

  return {
    job,
    files,
    running,
    paths,
    checking,
    jobError,
    lastHeard,
    checkAgain: () => void read(),
    problem,
    check: () => run(true),
    chooseOther: () => run(false),
    cancel,
  };
}
export type MeasureRun = ReturnType<typeof useMeasureRun>;

/** The icon buttons "Check files…" (or "Re-check n files" once some were measured) and "Choose other files…"; their words are the name and the tooltip. */
export function MeasureControls({ run }: { run: MeasureRun }) {
  // Check files… is gated while a run goes (a native-disabled one drops focus to the page, an aria-disabled one keeps it on a dead control): send the keyboard to Cancel, the one
  // control the run offers, and back to the check button when Cancel goes away with the run. Only when focus is lost, and never on
  // arrival (a page that opens on a run in flight is the shell's to focus). It lives here, not in `MeasureProgress`, which is drawn
  // only while it has something to say.
  const cancelShown = !!run.job && run.running;
  const wasShown = useRef(cancelShown);
  useEffect(() => {
    if (cancelShown === wasShown.current) return;
    wasShown.current = cancelShown;
    const active = document.activeElement as HTMLButtonElement | null;
    if (active && active !== document.body && !active.disabled && active.getAttribute('aria-disabled') !== 'true') return;
    document.querySelector<HTMLElement>(cancelShown ? '[data-measure-cancel]' : '[data-measure-check]')?.focus();
  }, [cancelShown]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {run.paths.length > 0 && (
        <IconButton
          variant="default"
          action="openFolder"
          label="Choose other files…"
          onClick={() => void run.chooseOther()}
          disabledReason={run.running || run.checking ? (run.running ? 'A check is running' : 'Starting the check') : undefined}
        />
      )}
      <IconButton
        variant="primary"
        action={run.paths.length > 0 ? 'recheckFiles' : 'checkFiles'}
        label={run.paths.length > 0 ? `Re-check ${plural(run.paths.length, 'file', 'files')}` : 'Check files…'}
        onClick={() => void run.check()}
        pending={run.checking}
        disabledReason={run.running ? 'A check is running' : undefined}
        data-measure-check
      />
    </div>
  );
}

/** Whether `MeasureProgress` has anything to show. */
export const hasMeasureProgress = (run: MeasureRun): boolean => !!run.job && run.running;

/**
 * What went wrong reading or starting a measurement, as toasts (rule 7, #2632): the host gone quiet, with Check again as its Retry, a start
 * that was refused, and a measurement that ended in error. Called once by the page, whether or not a run is drawn.
 */
export function useMeasureErrors(run: MeasureRun): void {
  // No age in the sentence: a toast that read "3 s ago" would be a new message at every tick of the clock.
  useErrorToast(run.jobError && `Can't tell how the measurement is going: ${run.jobError}`, run.checkAgain);
  useErrorToast(run.problem);
  useErrorToast(run.job?.phase === 'error' ? `${run.job.message} Choose the files again to measure them.` : undefined);
}

/** The progress of a running measurement with Cancel. */
export function MeasureProgress({ run }: { run: MeasureRun }) {
  const { job } = run;
  return (
    <>
      {job && run.running && (
        <div className="flex flex-col gap-2">
          <ProgressBar label="Measuring" value={job.percent} running valueText={`${job.percent}% read`} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite" className="text-sm">
              {job.message}
            </p>
            <Button variant="secondary" onClick={run.cancel} data-measure-cancel>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
