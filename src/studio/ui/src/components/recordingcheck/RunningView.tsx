import type { CoverageActivity } from '../../api/contracts/coverage';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { headingName } from '../../chapterHeading';
import { Button } from '../primitives/Button';
import { ProgressBar } from '../primitives/ProgressBar';
import { CheckActivityPanel } from './CheckActivityPanel';
import { summarizeActivity } from './activityView';
import { overallPercent, type RunState } from './checkRun';

/** The run in progress: a bar per chapter under its name (the real percent for each one running, full for the ones through, empty for the ones
 * waiting) and Stop checking beside the line that says what runs (alignment audit XPF-18, R3PF-8: the card's button says the same). */
export function RunningView({ chapters, run, model, onStop }: { chapters: readonly ManuscriptChapter[]; run: RunState; model: string; onStop: () => void }) {
  const view = summarizeActivity(
    run.ids.map((id) => ({ activity: run.active[id]?.activity ?? run.seen[id], pass: run.active[id]?.pass, running: id in run.active })),
  );
  const overall = overallPercent(run);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 min-w-0 flex-1 text-[var(--text-muted)]">Checking with {model}…</p>
        <Button variant="secondary" onClick={onStop}>
          Stop checking
        </Button>
      </div>
      <CheckActivityPanel view={view} percent={overall} startedAt={run.startedAt} ticking />
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {run.ids.map((id) => {
          const chapter = chapters.find((candidate) => candidate.id === id);
          const name = chapter ? headingName(chapter) : id;
          const active = run.active[id];
          const value = active ? active.percent : run.finished.includes(id) ? 100 : 0;
          return (
            <li key={id} className="flex flex-col gap-1.5">
              <span className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{name}</span>
                <span className="shrink-0 font-mono text-[var(--text-muted)]">
                  {run.ids.length > 1 ? chapterLine(run.active[id]?.activity ?? run.seen[id]) : ''}
                </span>
              </span>
              {/* The card's bar (default size), so the two read as one run. */}
              <ProgressBar label={`Checking ${name}`} value={value} running={active?.phase === 'running'} />
              {run.messages[id] ? (
                <span role="alert" className="text-[var(--danger-text)]">
                  {run.messages[id]}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A chapter's own counts on its row: its chunks, and the passages its re-check has finished when it asked for one. A fixed one-line slot, so a row never grows. */
function chapterLine(activity: CoverageActivity | undefined): string {
  if (!activity) return '';
  const chunks = `${activity.firstPass.done}/${activity.firstPass.total}`;
  const recheck = activity.recheck && activity.recheck.total > 0 ? ` · re-check ${activity.recheck.done}/${activity.recheck.total}` : '';
  return `${chunks}${recheck}`;
}
