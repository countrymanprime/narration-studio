import { useEffect, useRef } from 'react';
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
  const slot = useRef<HTMLSpanElement>(null);
  const wasRunning = useRef(running);
  // The two buttons are different elements, so the one under the keyboard goes when the scan starts or ends: hand focus to the one that
  // replaces it. Only when focus was lost (the narrator may have moved on), and never on arrival.
  useEffect(() => {
    if (running === wasRunning.current) return;
    wasRunning.current = running;
    if (document.activeElement && document.activeElement !== document.body) return;
    slot.current?.querySelector('button')?.focus();
  }, [running]);
  return (
    <span ref={slot} className="contents">
      {running ? (
        <TooltipTarget text="Cancel scan">
          <IconButton action="close" label="Cancel scan" onClick={() => void scan.cancel()} />
        </TooltipTarget>
      ) : (
        <IconButton action="sourceAuto" label="Scan the manuscript for suggestions" pending={starting} onClick={() => void scan.start()} />
      )}
    </span>
  );
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
