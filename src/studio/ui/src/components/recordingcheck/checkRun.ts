import type { CoverageActivity, CoveragePass, CoverageStartResult } from '../../api/contracts/coverage';

/** One chapter that has been handed to the host: waiting for its start to be answered, or running with the run id that names its events. */
type ActiveRun = { phase: 'starting' | 'running'; runId?: string; percent: number; pass?: CoveragePass; activity?: CoverageActivity };

/** A run's end, kept when it arrives before the start's answer does (the host sends the state event first). */
type EarlyEnd = { phase: 'complete' | 'cancelled' | 'failed'; message: string; activity?: CoverageActivity };

/**
 * The run of a set of chapters, up to `limit` at a time. The host runs one check per chapter and answers `busy` past the limit
 * the start asked for, so the dialog never has more than `limit` in progress and starts the next as each one ends.
 */
export type RunState = {
  ids: readonly string[];
  /** How many chapters may be in progress at once. */
  limit: number;
  /** The index in `ids` of the next chapter to hand to the host; ids.length once all have been. */
  next: number;
  step: 'idle' | 'running' | 'done' | 'stopped';
  /** The chapters in progress, by chapter id. */
  active: Readonly<Record<string, ActiveRun>>;
  /** A refused or failed chapter's message, in the host's words, by chapter id. */
  messages: Readonly<Record<string, string>>;
  /** The chapters whose run ended complete, in order. */
  finished: readonly string[];
  /** Ends that arrived for a run id no answer has named yet. */
  early: Readonly<Record<string, EarlyEnd | undefined>>;
  /** How many chapters were in progress when the run was stopped, for what the dialog says about them. */
  interrupted: number;
  /** The last activity the host reported for each chapter of the run, kept after the chapter ends so the activity panel can total the run and the result can show what it did. */
  seen: Readonly<Record<string, CoverageActivity>>;
  /** When the run began (ms since the epoch, from the action), for the panel's elapsed time. */
  startedAt?: number;
};

export type RunAction =
  | { type: 'begin'; ids: readonly string[]; limit?: number; at?: number }
  | { type: 'answered'; answer: CoverageStartResult; id: string }
  | { type: 'progress'; runId: string; percent: number; pass?: CoveragePass; activity?: CoverageActivity }
  | { type: 'ended'; runId: string; phase: 'complete' | 'cancelled' | 'failed'; message: string; activity?: CoverageActivity }
  | { type: 'stop' }
  /** A start the host held for a model download: the run goes back to idle, nothing started and nothing to report, so the dialog can ask. */
  | { type: 'halt' };

export const idleRun: RunState = { ids: [], limit: 1, next: 0, step: 'idle', active: {}, messages: {}, finished: [], early: {}, interrupted: 0, seen: {} };

/** Hands chapters to the host while there is room, and finishes the run when none is left. */
function fill(state: RunState): RunState {
  const active = { ...state.active };
  let next = state.next;
  while (Object.keys(active).length < state.limit && next < state.ids.length) {
    active[state.ids[next]] = { phase: 'starting', percent: 0 };
    next += 1;
  }
  const step = Object.keys(active).length === 0 && next >= state.ids.length ? 'done' : state.step;
  return { ...state, active, next, step };
}

/** The words a start that did not run gives for its chapter. */
function startMessage(answer: Exclude<CoverageStartResult, { status: 'started' }>): string {
  if (answer.status === 'refused') return answer.message;
  return `The ${answer.model.displayName} speech model is not installed. Download it in Settings.`;
}

const without = <T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));

/** The chapter id of the active run with this run id. */
const chapterOf = (state: RunState, runId: string): string | undefined => Object.entries(state.active).find(([, run]) => run.runId === runId)?.[0];

/** What a chapter's activity says once it has ended: nothing is running. */
const settled = (activity: CoverageActivity): CoverageActivity => ({
  ...activity,
  firstPass: { ...activity.firstPass, busy: 0 },
  ...(activity.recheck ? { recheck: { ...activity.recheck, busy: 0 } } : {}),
});

function end(state: RunState, id: string, ended: EarlyEnd): RunState {
  const last = ended.activity ?? state.active[id]?.activity;
  if (last) state = { ...state, seen: { ...state.seen, [id]: settled(last) } };
  const active = without(state.active, id);
  if (ended.phase === 'complete') return fill({ ...state, active, finished: [...state.finished, id] });
  return fill({ ...state, active, messages: { ...state.messages, [id]: ended.message } });
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'begin':
      return action.ids.length === 0
        ? state
        : fill({ ...idleRun, ids: action.ids, limit: Math.max(1, action.limit ?? 1), step: 'running', startedAt: action.at });
    case 'answered': {
      // Only the start a chapter is waiting on counts; a late answer for another chapter is dropped.
      const waiting = state.active[action.id];
      if (state.step !== 'running' || waiting?.phase !== 'starting') return state;
      if (action.answer.status !== 'started')
        return fill({ ...state, active: without(state.active, action.id), messages: { ...state.messages, [action.id]: startMessage(action.answer) } });
      const runId = action.answer.state.runId;
      const { pass, activity } = action.answer.state;
      const running = {
        ...state,
        active: { ...state.active, [action.id]: { phase: 'running' as const, runId, percent: action.answer.state.percent, pass, activity } },
      };
      const early = runId ? state.early[runId] : undefined;
      return early ? end({ ...running, early: without(state.early, runId ?? '') }, action.id, early) : running;
    }
    case 'progress': {
      const id = chapterOf(state, action.runId);
      if (state.step !== 'running' || id === undefined) return state;
      const run = state.active[id];
      const seen = action.activity ? { ...state.seen, [id]: action.activity } : state.seen;
      return {
        ...state,
        seen,
        active: {
          ...state.active,
          [id]: { ...run, percent: Math.max(run.percent, action.percent), pass: action.pass ?? run.pass, activity: action.activity ?? run.activity },
        },
      };
    }
    case 'ended': {
      if (state.step !== 'running') return state;
      const id = chapterOf(state, action.runId);
      const ended = { phase: action.phase, message: action.message, activity: action.activity };
      if (id !== undefined) return end(state, id, ended);
      // A run no answer has named yet: keep its end for the answer, when a chapter is still waiting for one.
      return Object.values(state.active).some((run) => run.phase === 'starting') ? { ...state, early: { ...state.early, [action.runId]: ended } } : state;
    }
    case 'halt':
      return state.step === 'running' ? idleRun : state;
    case 'stop':
      return state.step === 'running' ? { ...state, step: 'stopped', active: {}, interrupted: Object.keys(state.active).length } : state;
  }
}

/** The run's overall percent: the mean of the chapters that can still count, each at its own percent (full once finished). A chapter the host refused or
 * whose run failed or was cancelled is out of the mean, so it cannot hold the bar below what the others have done. */
export function overallPercent(state: RunState): number {
  const counted = state.ids.filter((id) => !(id in state.messages));
  if (counted.length === 0) return 0;
  const total = counted.reduce((sum, id) => sum + (state.active[id] ? state.active[id].percent : state.finished.includes(id) ? 100 : 0), 0);
  return total / counted.length;
}
