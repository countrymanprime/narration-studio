import type { DawCapabilities, DawResult } from '../../../../api/contracts/daw';

/**
 * What the split needs of the DAW. The DAW port has no `splitTake` or `backupAround` yet (SN-D5 added none; the DAW PRD names neither), so this
 * slice states what it needs and the slice that adds the commands to the port supplies an implementation. Nothing here is called until one is
 * passed in; without one the split is refused with a sentence (`NO_SPLIT_COMMAND`).
 */
export interface TakeSplitter {
  /** The DAW cuts a take in two at a project time, in one undo step of its own. Nothing is deleted. */
  splitTake(takeId: string, at: number): Promise<DawResult>;
  /** The DAW keeps a copy of the audio around the cut before it is made (Audacity, where a cut replaces audio). */
  backupAround(chapterId: string, at: number, label: string): Promise<DawResult>;
  /** The built-in recorder cuts its own take; no DAW is asked. */
  cutOwnTake(takeId: string, at: number): Promise<DawResult>;
  /** Puts back the take the recorder cut, so its Undo works. */
  joinOwnTakes(takeId: string): Promise<DawResult>;
}

/** How a split will go, or why it will not. */
export type SplitPlan =
  | { kind: 'daw'; dawName: string }
  /** The DAW keeps no takes of its own, so the audio around the cut is backed up first. */
  | { kind: 'backup-then-daw'; dawName: string }
  | { kind: 'recorder'; dawName: string }
  | { kind: 'refused'; reason: string };

/** Shown when no implementation of the split is wired in yet. */
export const NO_SPLIT_COMMAND = 'Splitting a take is not available in this version yet.';

const BUILT_IN = 'the built-in recorder';
const isRecorder = (caps: DawCapabilities): boolean => caps.daw === 'none' || caps.daw === 'Built-in';

/** The `takes` capability decides whether a cut can be made, and its own sentence is the reason when it cannot. The recorder cuts its own take;
 * Audacity (which keeps takes only with backups on) backs up first; any other DAW cuts the take where it is. */
export function planSplit(caps: DawCapabilities): SplitPlan {
  const takes = caps.capabilities['takes'];
  if (!takes?.available) return { kind: 'refused', reason: takes?.message ?? `${isRecorder(caps) ? BUILT_IN : caps.daw} cannot cut a take now.` };
  if (isRecorder(caps)) return { kind: 'recorder', dawName: BUILT_IN };
  return caps.daw === 'Audacity' ? { kind: 'backup-then-daw', dawName: caps.daw } : { kind: 'daw', dawName: caps.daw };
}
