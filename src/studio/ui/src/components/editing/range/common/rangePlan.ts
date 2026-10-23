import type { DawCapabilities } from '../../../../api/contracts/daw';

/** Who makes a change to a range of words, or why nobody will. */
export type RangePlan =
  /** The DAW makes it as one action of its own (`native`). */
  | { kind: 'daw'; dawName: string }
  /** The DAW changes the audio itself in several edits (`steps`), so the stretch is backed up first. */
  | { kind: 'backup-then-daw'; dawName: string; steps: number }
  /** The built-in recorder keeps the change in the app's edit list (`app`). */
  | { kind: 'recorder'; dawName: string }
  | { kind: 'refused'; reason: string };

/** What the narrator calls the built-in recorder in a sentence. */
export const BUILT_IN = 'the built-in recorder';

const isRecorder = (caps: DawCapabilities): boolean => caps.daw === 'none' || caps.daw === 'Built-in';

/**
 * The capability decides whether the range can be changed, and its own sentence is the reason when it cannot. Its `mode` decides who makes the
 * change: the recorder (or a DAW in `app` mode) keeps it in the edit list, a `steps` DAW changes the audio and is backed up first, any other DAW
 * makes it as one action.
 */
export function planRange(caps: DawCapabilities, capability: 'cut_range' | 'fx_range'): RangePlan {
  const support = caps.capabilities[capability];
  if (!support?.available) return { kind: 'refused', reason: support?.message ?? `${isRecorder(caps) ? BUILT_IN : caps.daw} cannot do this now.` };
  if (isRecorder(caps) || support.mode === 'app') return { kind: 'recorder', dawName: isRecorder(caps) ? BUILT_IN : caps.daw };
  if (support.mode === 'steps') return { kind: 'backup-then-daw', dawName: caps.daw, steps: 2 };
  return { kind: 'daw', dawName: caps.daw };
}

type Acting = Exclude<RangePlan, { kind: 'refused' }>;

/** What a cut does where the words sit and how it is undone, in one place so the dialog and the tests read the same sentences. */
export function cutPlanText(plan: Acting, mute: boolean): string {
  const verb = mute ? 'mutes' : 'cuts';
  switch (plan.kind) {
    case 'recorder':
      return `The app makes this change itself: the original file is kept, and the cut is one entry in the app's edit list, so playback and export leave those words out. Undo here removes the entry.`;
    case 'backup-then-daw':
      return `${plan.dawName} changes the audio itself, so the app backs up the stretch first, then ${verb} it. That is ${plan.steps} undo steps in ${plan.dawName}: Edit > Undo ${plan.steps} times there puts it back, and the backup keeps the full copy.`;
    case 'daw':
      return `${plan.dawName} splits the item at both ends and moves the middle piece to a muted track named Cuts. The recording file is not touched. It is one undo step in ${plan.dawName}: Edit > Undo there puts it back.`;
  }
}
