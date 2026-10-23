import type { ChapterSyncBackground } from '../../../api/contracts/chapterSync';
import type { CoverageState } from '../../../api/contracts/coverage';
import { Button } from '../../primitives/Button';
import { ProgressBar } from '../../primitives/ProgressBar';
import { queuedText, runningDetail, runningText } from './backgroundCheckText';

/**
 * The background check's progress, at the bottom left of every page (the toasts keep the bottom right): the chapter being
 * checked, how far, with which models and how many wait, with Pause (turns background checks off) and Cancel (this check
 * only; the host does not start it again until the chapter changes). With none running it says how many chapters wait and why,
 * or nothing.
 */
export function BackgroundCheckStatus({
  background,
  running,
  title,
  onPause,
  onCancel,
}: {
  background: ChapterSyncBackground | undefined;
  /** The background check in progress, if any. */
  running: CoverageState | undefined;
  /** The chapter `running` checks. */
  title: string;
  onPause: () => void;
  onCancel: () => void;
}) {
  const queued = !running && background ? queuedText(background) : '';
  if (!running && !queued) return null;
  return (
    <section
      aria-label="Background recording check"
      data-background-check
      className="fixed bottom-[calc(1.25rem+var(--toast-clear,0px))] left-5 z-[var(--z-toast)] flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[0.8125rem] shadow-[var(--shadow)]"
    >
      <div role="status" aria-live="polite" className="flex flex-col gap-0.5">
        <span className="font-semibold">{running ? runningText(title, running) : queued}</span>
        {running && <span className="text-[var(--text-muted)]">{runningDetail(background, running)}</span>}
      </div>
      {running && <ProgressBar label={`Checking ${title} in the background`} value={running.percent} running size="thin" />}
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onPause}>
          Pause
        </Button>
        {running && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </section>
  );
}
