import type { ChapterSyncBackground } from '../../../api/contracts/chapterSync';
import type { CoverageState } from '../../../api/contracts/coverage';
import { Button } from '../../primitives/Button';
import { ProgressBar } from '../../primitives/ProgressBar';
import { doneText, PAUSED_TEXT, queuedText, runningDetail, runningText } from './backgroundCheckText';

/** What the corner shows: a check running, chapters waiting, everything done, or paused. */
export type BackgroundCorner =
  { kind: 'running'; state: CoverageState; title: string; done: number } | { kind: 'queued' } | { kind: 'done'; done: number } | { kind: 'paused' };

/** The corner for these facts, or undefined when there is nothing to say. Running wins, then paused, waiting and done. */
export function cornerFor({
  background,
  running,
  title,
  done,
  finished,
  paused,
}: {
  background: ChapterSyncBackground | undefined;
  running: CoverageState | undefined;
  title: string;
  done: number;
  /** A run of checks just finished and its line has not timed out. */
  finished: boolean;
  /** The narrator pressed Pause in this window and has not resumed. */
  paused: boolean;
}): BackgroundCorner | undefined {
  if (running) return { kind: 'running', state: running, title, done };
  if (paused && background?.enabled === false) return { kind: 'paused' };
  if (background && queuedText(background)) return { kind: 'queued' };
  if (finished && done > 0) return { kind: 'done', done };
  return undefined;
}

/**
 * The background check's progress, at the bottom left of every page (the toasts keep the bottom right): the chapter being
 * checked, how far, which chapter of how many, with which models, with Pause (turns background checks off) and Cancel (this check
 * only; the host does not start it again until the chapter changes). With none running it says how many chapters wait and why,
 * that everything waiting was checked, or that checks are paused, with Resume.
 */
export function BackgroundCheckStatus({
  background,
  corner,
  onPause,
  onCancel,
  onResume,
}: {
  background: ChapterSyncBackground | undefined;
  corner: BackgroundCorner | undefined;
  onPause: () => void;
  onCancel: () => void;
  onResume: () => void;
}) {
  if (!corner) return null;
  const headline =
    corner.kind === 'running'
      ? runningText(corner.title, corner.state)
      : corner.kind === 'queued'
        ? queuedText(background!)
        : corner.kind === 'done'
          ? doneText(corner.done)
          : PAUSED_TEXT;
  return (
    <section
      aria-label="Background recording check"
      data-background-check={corner.kind}
      className="fixed bottom-[calc(1.25rem+var(--toast-clear,0px))] left-5 z-[var(--z-toast)] flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[0.8125rem] shadow-[var(--shadow)]"
    >
      <div role="status" aria-live="polite" className="flex flex-col gap-0.5">
        <span className="font-semibold">{headline}</span>
        {corner.kind === 'running' && <span className="text-[var(--text-muted)]">{runningDetail(background, corner.state, corner.done)}</span>}
      </div>
      {corner.kind === 'running' && <ProgressBar label={`Checking ${corner.title} in the background`} value={corner.state.percent} running size="thin" />}
      {(corner.kind === 'running' || corner.kind === 'queued') && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onPause}>
            Pause
          </Button>
          {corner.kind === 'running' && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
      {corner.kind === 'paused' && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onResume}>
            Resume
          </Button>
        </div>
      )}
    </section>
  );
}
