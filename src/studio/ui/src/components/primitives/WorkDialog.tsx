import { useEffect, useRef } from 'react';
import type { WorkJob } from '../../types';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { ProgressBar } from './ProgressBar';
import { SectionLabel } from './SectionLabel';

const active = new Set<WorkJob['phase']>(['preparing', 'committing', 'running']);
/** How far from the bottom the log can be and still count as at the bottom. */
const FOLLOW_SLACK_PX = 24;

// Shown while a job runs with no Cancel (the Story Bible rebuild, an import that is writing): the dialog stays blocking, so
// it says why nothing can be pressed and what will change. It is the dialog's description, so a screen reader hears it on open.
const NOT_CANCELLABLE_NOTICE = 'This step cannot be cancelled. Close appears when it finishes.';
// The same, for a job the caller lets keep running without the dialog: the app tells the narrator when it ends.
const BACKGROUND_NOTICE = 'This step cannot be cancelled. You can close this window: it keeps running, and a message appears when it finishes.';

// One ellipsis: the host's steps end in three dots ("Starting the recording check...") where the app's own lines use the character (R3PR2-22).
const tidy = (line: string) => line.replace(/\.\.\.(?=\s|$)/g, '…');

export function WorkDialog({
  title,
  job,
  close,
  cancel,
  background,
  retry,
}: {
  title: string;
  job: WorkJob;
  close?: () => void;
  cancel?: () => void;
  /** Lets the narrator dismiss the dialog while the job runs. Only for a job whose end the app announces on its own. */
  background?: () => void;
  /** Runs the job again after it failed: a primary Retry beside Close. Only for a job that is safe to start again (a download). */
  retry?: () => void;
}) {
  const running = active.has(job.phase);
  // The live activity follows its newest line, so a running job looks like what it is: something moving. Scrolling up to read stops that, and
  // coming back to the bottom starts it again.
  const logBox = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const onLogScroll = () => {
    const box = logBox.current;
    if (box) following.current = box.scrollHeight - box.scrollTop - box.clientHeight < FOLLOW_SLACK_PX;
  };
  // A running job that has reported no progress yet (percent 0) is indeterminate: no value, and the bar slides.
  const indeterminate = running && job.percent === 0;
  const showCancel = Boolean(cancel) && running;
  const showClose = Boolean(close) && !running;
  const showBackground = Boolean(background) && running;
  const notCancellable = running && !cancel;
  const showRetry = Boolean(retry) && job.phase === 'error';
  const status = tidy(job.error || job.message);
  // The log keeps what the status line above it does not say: a line that repeats the status is left out, and with nothing left there is no log
  // box, so a one-step job does not show its sentence twice over an empty grey box (R4SB-8, R3SE1-1, R3SB2-15).
  const history = job.logs.map(tidy).filter((line) => line.trim() !== status.trim());
  useEffect(() => {
    const box = logBox.current;
    if (box && following.current) box.scrollTop = box.scrollHeight;
  }, [history.length]);
  return (
    <Dialog
      title={title}
      dismissOnOutsidePress={false}
      actionsAlign="end"
      // Escape is ignored while a job runs (Cancel is a deliberate action) and works as Close once it has finished. The header draws no Close: the
      // action row's Close is the way out, and a second button of that name would be read twice.
      onEscape={close && !running ? close : showBackground ? background : undefined}
      // A running job with no Cancel has nothing to press: no action row is drawn, and the description says why.
      description={notCancellable ? (showBackground ? BACKGROUND_NOTICE : NOT_CANCELLABLE_NOTICE) : undefined}
      actions={
        showCancel || showClose || showBackground ? (
          <>
            {showBackground && (
              <Button variant="secondary" onClick={background}>
                Continue in background
              </Button>
            )}
            {showCancel && (
              <Button variant="secondary" onClick={cancel}>
                Cancel
              </Button>
            )}
            {showClose && (
              <Button variant={showRetry ? 'secondary' : 'primary'} onClick={close}>
                Close
              </Button>
            )}
            {showRetry && (
              <Button variant="primary" onClick={retry}>
                Retry
              </Button>
            )}
          </>
        ) : null
      }
    >
      <p className="text-sm">
        {/* A live region, so a screen reader hears each step; a failure interrupts (alert), progress does not (status). */}
        <span role={job.error ? 'alert' : 'status'}>{status}</span>
        {/* The numbers move on nearly every poll, so they sit outside the live region: the progress bar carries them for a screen reader. */}
        {job.detail && !job.error && <span> {job.detail}</span>}
      </p>
      <ProgressBar
        label={`${title} progress`}
        value={indeterminate ? null : job.percent}
        running={running}
        valueText={job.detail}
        tone={job.error ? 'danger' : 'accent'}
        className="mt-3"
      />
      {/* Elapsed time under the bar's left end, beside what it measures, not alone at the far edge of the status line (R3PR2-22, R4SB-8). */}
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">
        <span className="font-['IBM_Plex_Mono',ui-monospace,monospace]">{Math.floor(job.elapsed)} s</span> elapsed
      </p>
      {history.length > 0 && (
        <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          <SectionLabel as="div" className="mb-1.5">
            Live activity
          </SectionLabel>
          {/* As tall as its lines, up to 9 rem, then it scrolls. */}
          <div
            ref={logBox}
            onScroll={onLogScroll}
            tabIndex={0}
            className="max-h-36 overflow-x-hidden overflow-y-auto border border-[var(--border)] bg-[var(--surface-2)] font-['IBM_Plex_Mono',ui-monospace,monospace] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none focus-visible:ring-inset [&>:last-child]:border-b-0"
          >
            {history.map((line, index) => (
              <div key={`${index}-${line}`} className="border-b border-[var(--border)] px-[0.45rem] py-1 break-words">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
