import type { RetryMode } from '../model/stacking';

/** The words the stack controls use, one place so the dialog, the retry bar, the menu and the tests read the same sentences. */
export const STACK_TEXT = {
  action: 'Stack retries as takes',
  unstack: 'Un-stack the takes',
  cleanup: 'Clean up the other reads',
  howKept: 'How retries are kept',
  stackGo: 'Stack takes',
  unstackGo: 'Put them back',
  /** The chip under a line whose later reads sit on the first read's spot. */
  stacked: 'Stacked',
} as const;

/** The two ways a passage keeps its retries, as the narrator would say them. */
export const RETRY_LABEL: Record<RetryMode, string> = {
  stack: 'Stack takes at the first read’s spot',
  leave: 'Leave takes where they are and clean up when I keep one',
};
export const RETRY_SHORT: Record<RetryMode, string> = { stack: 'Stack', leave: 'Leave' };

export const KEPT_REASON = 'A take is kept';
export const KEPT_UNSTACK = 'Undo the kept take first.';
export const NO_RETRIES = 'There are no retries to stack.';
export const NO_STACKED = 'There are no stacked takes to put back.';
export const CHECKING = 'Checking what the DAW can do.';
export const NO_ANSWER = 'Could not ask the DAW what it can do.';
export const NO_BACKUP = 'The audio could not be backed up, so nothing was changed.';
export const AUDACITY_BACKUPS = 'Audacity makes this change in several edits, so it needs backups, and they are not available.';

/** The edits a `steps` DAW makes to stack retries, in order (the mock's STACK_PLAN.steps). */
export const STACK_EDITS = [
  'Add a take track',
  'Paste each later read into it',
  'Split at the point where the reads line up',
  'Shift the audio that follows to close the gap',
  'Mute the reads that are not on top',
] as const;

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
