import { Button } from '../../primitives/Button';
import { Panel } from '../../primitives/Panel';
import { StatusBadge } from '../../primitives/StatusBadge';
import type { ChapterState } from './chapterStates';

const TONE = { ok: 'success', bad: 'danger', wait: 'neutral' } as const;

/** "Before you build" (the mock's aside): chapters passing n of N, then a row per chapter, named in the manuscript's heading style, that opens it in Master & QC. */
export function Preflight({ states, onOpen }: { states: readonly ChapterState[]; onOpen: (chapterId: string) => void }) {
  return (
    <Panel title="Before you build">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm">
          <span>Chapters passing</span>
          <b className="font-mono">
            {states.filter((state) => state.kind === 'ok').length} of {states.length}
          </b>
        </div>
        <ul className="flex flex-col">
          {states.map((state) => (
            <li key={state.id}>
              <Button
                variant="link"
                onClick={() => onOpen(state.id)}
                aria-label={`${state.name}: ${state.text}. Open in Master & QC`}
                className="flex w-full items-center justify-between gap-2 py-0.5 text-left text-sm no-underline"
              >
                <span className="min-w-0 flex-1 truncate">{state.name}</span>
                <StatusBadge tone={TONE[state.kind]} label={state.text} />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
