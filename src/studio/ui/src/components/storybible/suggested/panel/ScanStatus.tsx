import { Button } from '../../../primitives/Button';
import { ProgressBar } from '../../../primitives/ProgressBar';
import { scanFailures } from './selectors';
import type { ExtractionScan } from './useSuggestions';

/**
 * The scan's progress while it runs, with the host's percent and message (docs/architecture/principles.md: nothing made up) and the Cancel scan
 * button that stops it, and, when it ended, what did not run in the host's sentences, while what the other sources found stays listed. Nothing
 * is drawn when idle. It stands under the filters, so a scan starting or ending moves the table, never the controls the pointer is on.
 */
export function ScanStatus({ scan }: { scan: ExtractionScan }) {
  const { job, running } = scan;
  const failures = running ? [] : scanFailures(job);
  if (!running && failures.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-scan={running ? 'running' : (job?.phase ?? 'idle')}>
      {running && job && (
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
      {failures.length > 0 && (
        <div className="text-[var(--warn-text)]" role="status">
          <ul>
            {failures.map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
