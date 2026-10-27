import { useEffect } from 'react';
import { overlay } from '../../../../overlay/overlayService';
import { Button } from '../../../primitives/Button';
import { ProgressBar } from '../../../primitives/ProgressBar';
import { scanFailures } from './selectors';
import type { ExtractionScan } from './useSuggestions';

/** A failure sentence longer than this is cut for the toast: a tool's whole log is not a message (the host keeps it in the job's log). */
export const SCAN_FAILURE_TOAST_CHARS = 240;
const cut = (sentence: string): string => (sentence.length > SCAN_FAILURE_TOAST_CHARS ? `${sentence.slice(0, SCAN_FAILURE_TOAST_CHARS).trimEnd()}…` : sentence);

/**
 * The scan's progress while it runs, with the host's percent and message (docs/architecture/principles.md: nothing made up) and the Cancel scan
 * button that stops it. When it ended, what did not run is told once in a toast, in the host's sentences, never in the page's flow, where a long
 * BookNLP message pushed the list down; what the other sources found stays listed. Nothing is drawn when idle. It stands under the filters, so a
 * scan starting or ending moves the table, never the controls the pointer is on.
 */
export function ScanStatus({ scan }: { scan: ExtractionScan }) {
  const { job, running } = scan;
  const failures = running ? [] : scanFailures(job);
  const key = failures.length > 0 ? `${job?.id ?? ''}|${failures.join('\n')}` : '';
  useEffect(() => {
    if (key) overlay.toast(failures.map(cut).join(' '), { tone: 'error' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the failures: one toast per ended scan
  }, [key]);
  if (!running) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-scan="running">
      {job && (
        <>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <ProgressBar label="Scan progress" value={job.percent} running valueText={`${job.percent}%. ${job.message}`} size="thin" />
            </div>
            <Button size="sm" variant="secondary" onClick={() => void scan.cancel()}>
              Cancel scan
            </Button>
          </div>
          <p className="min-w-0 truncate text-[var(--text-muted)]" role="status">
            {job.percent}% · {job.message}
          </p>
        </>
      )}
    </div>
  );
}
