import type { DawCapabilities } from '../../../api/contracts/daw';
import { STACK_EDITS, AUDACITY_BACKUPS } from './stackText';

/** Who stacks the retries and how it is undone, or why nobody will. */
export type StackHow =
  /** The DAW stacks them as one action of its own (`native`). */
  | { kind: 'daw'; dawName: string }
  /** The DAW cannot, so it does the edits one by one (`steps`) after a backup of the audio around the takes. */
  | { kind: 'steps'; dawName: string; steps: readonly string[] }
  /** The app makes the change itself (the built-in recorder, or a DAW in `app` mode); no DAW is asked. */
  | { kind: 'recorder'; dawName: string }
  | { kind: 'refused'; reason: string };

export type StackActing = Exclude<StackHow, { kind: 'refused' }>;

/** What the narrator calls the built-in recorder in a sentence. */
export const BUILT_IN = 'the built-in recorder';
export const isRecorder = (caps: DawCapabilities): boolean => caps.daw === 'none' || caps.daw === 'Built-in';

/**
 * The `stack_takes` capability decides whether retries can be stacked, and its own sentence is the reason when it cannot. Its `mode` decides
 * who makes the change; a `steps` DAW also needs the `backups` capability, and its sentence is the reason when it is missing. The built-in
 * recorder is the app's own, so it needs no DAW.
 */
export function planStack(caps: DawCapabilities): StackHow {
  if (isRecorder(caps)) return { kind: 'recorder', dawName: BUILT_IN };
  const support = caps.capabilities['stack_takes'];
  if (!support?.available) return { kind: 'refused', reason: support?.message ?? `${caps.daw} cannot stack takes now.` };
  if (support.mode === 'app') return { kind: 'recorder', dawName: caps.daw };
  if (support.mode === 'steps') {
    const backups = caps.capabilities['backups'];
    if (!backups?.available) return { kind: 'refused', reason: backups?.message ?? AUDACITY_BACKUPS };
    return { kind: 'steps', dawName: caps.daw, steps: STACK_EDITS };
  }
  return { kind: 'daw', dawName: caps.daw };
}

/** How the DAW undoes it, in words (the mock's STACK_PLAN.undo). */
export function undoSentence(how: StackActing): string {
  switch (how.kind) {
    case 'recorder':
      return 'The app makes this change itself. Un-stack puts the takes back.';
    case 'steps':
      return `${how.dawName} cannot do this as one action, so it is ${how.steps.length} undo steps. A backup of the audio around the takes is made first, and Undo in ${how.dawName} puts them back.`;
    case 'daw':
      return `${how.dawName} does this as one action, so it is one undo step. Edit > Undo in ${how.dawName} puts the takes back.`;
  }
}

/** How far the audio that follows moves, in a sentence. */
export function shiftText(shift: number): string {
  const s = Math.abs(shift);
  return s < 0.05 ? 'The audio that follows does not move.' : `The audio that follows moves ${s.toFixed(1)} s ${shift < 0 ? 'earlier' : 'later'}.`;
}
