import { Button } from '../../../primitives/Button';
import { IconButton } from '../../../primitives/IconButton';
import { ProgressBar } from '../../../primitives/ProgressBar';
import { scanFailures } from './selectors';
import type { ExtractionScan } from './useSuggestions';

/**
 * The Story Bible header's scan button. Idle it is the icon button; while the scan runs it is busy, shows the host's percent and message
 * (ADR 0015: nothing made up) with Cancel (ADR 0076), and when the scan ended it says what did not run, in the host's sentences, while
 * what the other sources found stays listed.
 */
export function ScanButton({ scan }: { scan: ExtractionScan }) {
  const { job, running, starting } = scan;
  const failures = running ? [] : scanFailures(job);
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-scan={running ? 'running' : (job?.phase ?? 'idle')}>
      <div className="flex min-w-0 items-center gap-2">
        <IconButton action="sourceAuto" label="Scan the manuscript for suggestions" pending={running || starting} onClick={() => void scan.start()} />
        {running && (
          <Button variant="secondary" size="sm" onClick={() => void scan.cancel()}>
            Cancel scan
          </Button>
        )}
      </div>
      {running && job && (
        <div className="flex min-w-0 flex-col gap-1">
          <ProgressBar label="Scan progress" value={job.percent} running valueText={`${job.percent}%. ${job.message}`} size="thin" />
          <p className="min-w-0 truncate text-[var(--text-muted)]" role="status">
            {job.percent}% · {job.message}
          </p>
        </div>
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
