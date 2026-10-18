import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { TooltipTarget } from '../../../primitives/Tooltip';
import { IconButton } from '../../../primitives/IconButton';
import { ProgressBar } from '../../../primitives/ProgressBar';
import { scanFailures } from './selectors';
import type { ExtractionScan } from './useSuggestions';

/**
 * The Story Bible header's scan button: the wand while idle, and the same slot as Cancel scan while the scan runs, so the buttons beside it and
 * everything below never move. What the scan reports (its percent and message, and what did not run) is `ScanStatus`, drawn under the filters.
 */
export function ScanButton({ scan }: { scan: ExtractionScan }) {
  const { running, starting } = scan;
  if (running)
    return (
      <TooltipTarget text="Cancel scan">
        <IconButton label="Cancel scan" onClick={() => void scan.cancel()}>
          <FontAwesomeIcon icon={faXmark} />
        </IconButton>
      </TooltipTarget>
    );
  return <IconButton action="sourceAuto" label="Scan the manuscript for suggestions" pending={starting} onClick={() => void scan.start()} />;
}

/**
 * The scan's progress while it runs, with the host's percent and message (docs/architecture/principles.md: nothing made up), and, when
 * it ended, what did not run in the host's sentences, while what the other sources found stays listed. Nothing is drawn when idle.
 */
export function ScanStatus({ scan }: { scan: ExtractionScan }) {
  const { job, running } = scan;
  const failures = running ? [] : scanFailures(job);
  if (!running && failures.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-scan={running ? 'running' : (job?.phase ?? 'idle')}>
      {running && job && (
        <>
          <ProgressBar label="Scan progress" value={job.percent} running valueText={`${job.percent}%. ${job.message}`} size="thin" />
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
