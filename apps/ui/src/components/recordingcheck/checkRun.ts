import type { CoverageStartResult } from '../../api/contracts/coverage';

/** The run of a set of chapters, one at a time (the host runs one check at a time and answers `busy` to a second). */
export type RunState = {
  ids: readonly string[];
  /** The chapter in progress, or ids.length once all are through. */
  index: number;
  step: 'idle' | 'starting' | 'running' | 'done' | 'stopped';
  runId?: string;
  percent: number;
  /** A refused chapter's message, in the host's words, by chapter id. */
  messages: Readonly<Record<string, string>>;
  /** The chapters whose run ended complete, in order. */
  finished: readonly string[];
};

export type RunAction =
  | { type: 'begin'; ids: readonly string[] }
  | { type: 'answered'; answer: CoverageStartResult; id: string }
  | { type: 'progress'; runId: string; percent: number }
  | { type: 'ended'; runId: string; phase: 'complete' | 'cancelled' | 'failed'; message: string }
  | { type: 'stop' };

export const idleRun: RunState = { ids: [], index: 0, step: 'idle', percent: 0, messages: {}, finished: [] };

const advance = (state: RunState, patch: Partial<RunState>): RunState => {
  const index = state.index + 1;
  return { ...state, ...patch, index, runId: undefined, percent: 0, step: index >= state.ids.length ? 'done' : 'starting' };
};

/** The words a start that did not run gives for its chapter. */
function startMessage(answer: Exclude<CoverageStartResult, { status: 'started' }>): string {
  if (answer.status === 'refused') return answer.message;
  return `The ${answer.model.displayName} speech model is not installed. Download it in Settings.`;
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'begin':
      return action.ids.length === 0 ? state : { ...idleRun, ids: action.ids, step: 'starting' };
    case 'answered': {
      // Only the start this state is waiting on counts; a late answer for another chapter is dropped.
      if (state.step !== 'starting' || state.ids[state.index] !== action.id) return state;
      if (action.answer.status === 'started') return { ...state, step: 'running', runId: action.answer.state.runId, percent: action.answer.state.percent };
      return advance(state, { messages: { ...state.messages, [action.id]: startMessage(action.answer) } });
    }
    case 'progress':
      return state.step === 'running' && state.runId === action.runId ? { ...state, percent: Math.max(state.percent, action.percent) } : state;
    case 'ended': {
      if (state.step !== 'running' || state.runId !== action.runId) return state;
      const id = state.ids[state.index];
      if (action.phase === 'complete') return advance(state, { finished: [...state.finished, id] });
      return advance(state, { messages: { ...state.messages, [id]: action.message } });
    }
    case 'stop':
      return state.step === 'starting' || state.step === 'running' ? { ...state, step: 'stopped' } : state;
  }
}
