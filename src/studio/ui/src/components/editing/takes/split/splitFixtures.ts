import type { DawResult } from '../../../../api/contracts/daw';
import type { TakeSplitter } from './splitPlan';
import type { SplitTarget } from './splitCommand';

export const target: SplitTarget = { chapterId: '5', takeId: 't-12', label: 'T-12', at: 621.2 };

const done = (message: string): DawResult => ({ ok: true, changed: true, message, undoSteps: 1 });

/** A splitter that answers like a DAW that could cut, recording its calls in order. */
export function fakeSplitter(calls: string[] = []): TakeSplitter {
  return {
    splitTake: async (id, at) => (calls.push(`splitTake ${id} ${at}`), done('Split the take in one undo step.')),
    backupAround: async (chapter, at) => (calls.push(`backupAround ${chapter} ${at}`), done('Backed up the audio around the cut.')),
    cutOwnTake: async (id, at) => (calls.push(`cutOwnTake ${id} ${at}`), done('Cut the take.')),
    joinOwnTakes: async (id) => (calls.push(`joinOwnTakes ${id}`), done('Joined the takes.')),
  };
}
