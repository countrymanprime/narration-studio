import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { headingName } from '../../chapterHeading';
import { Button } from '../primitives/Button';
import { ProgressBar } from '../primitives/ProgressBar';
import type { RunState } from './checkRun';

/** The run in progress: a bar per chapter under its name (the real percent for each one running, full for the ones through, empty for the ones
 * waiting) and Stop checking beside the line that says what runs (alignment audit XPF-18, R3PF-8: the card's button says the same). */
export function RunningView({ chapters, run, model, onStop }: { chapters: readonly ManuscriptChapter[]; run: RunState; model: string; onStop: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 min-w-0 flex-1 text-[var(--text-muted)]">Checking with {model}…</p>
        <Button variant="secondary" onClick={onStop}>
          Stop checking
        </Button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {run.ids.map((id) => {
          const chapter = chapters.find((candidate) => candidate.id === id);
          const name = chapter ? headingName(chapter) : id;
          const active = run.active[id];
          const value = active ? active.percent : run.finished.includes(id) ? 100 : 0;
          return (
            <li key={id} className="flex flex-col gap-1.5">
              <span className="[overflow-wrap:anywhere]">{name}</span>
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
