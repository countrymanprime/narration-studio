import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { chapterName } from '../../chapterName';
import { Button } from '../primitives/Button';
import { ProgressBar } from '../primitives/ProgressBar';
import type { RunState } from './checkRun';

/** The run in progress: a bar per chapter (real percent for the one running, full for the ones through, empty for the ones waiting) and Stop. */
export function RunningView({ chapters, run, model, onStop }: { chapters: readonly ManuscriptChapter[]; run: RunState; model: string; onStop: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[var(--text-muted)]">Checking with {model}…</p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {run.ids.map((id, position) => {
          const chapter = chapters.find((candidate) => candidate.id === id);
          const name = chapter ? chapterName(chapter) : id;
          const through = position < run.index;
          const value = through ? (run.messages[id] ? 0 : 100) : position === run.index ? run.percent : 0;
          return (
            <li key={id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <div className="w-[11rem] flex-none">
                <ProgressBar label={`Checking ${name}`} value={value} running={position === run.index && run.step === 'running'} size="thin" />
              </div>
              {run.messages[id] ? (
                <span role="alert" className="text-[var(--danger-text)]">
                  {run.messages[id]}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div>
        <Button variant="secondary" onClick={onStop}>
          Stop
        </Button>
      </div>
    </div>
  );
}
