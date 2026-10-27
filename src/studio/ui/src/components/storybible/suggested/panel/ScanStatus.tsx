import { useErrorToast } from '../../../../hooks/useErrorToast';
import { StatusBadge } from '../../../primitives/StatusBadge';
import { TooltipTarget } from '../../../primitives/Tooltip';
import { Button } from '../../../primitives/Button';
import { ProgressBar } from '../../../primitives/ProgressBar';
import { scanFailures } from './selectors';
import type { ExtractionScan } from './useSuggestions';

/**
 * The scan's progress while it runs, with the host's percent and message (docs/architecture/principles.md: nothing made up) and the Cancel scan
 * button that stops it. When it ended, what did not run is told once in a toast, in the host's sentences, never in the page's flow, where a long
 * BookNLP message pushed the list down; what the other sources found stays listed. Nothing is drawn when idle. It stands under the filters, so a
 * scan starting or ending moves the table, never the controls the pointer is on.
 */
export function ScanStatus({ scan }: { scan: ExtractionScan }) {
  const { job, running } = scan;
  const failures = running ? [] : scanFailures(job);
  const told = failures.join(' ');
  useErrorToast(told);
  // What the toast said stays on the page as a fixed-size cue, so a partial list never reads as a complete one once the toast is gone.
  if (!running && told)
    return (
      <div className="flex min-w-0" data-scan="incomplete">
        <TooltipTarget text={told.length > 240 ? `${told.slice(0, 240).trimEnd()}…` : told}>
          <StatusBadge tone="warning" label="Scan incomplete" />
        </TooltipTarget>
      </div>
    );
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
