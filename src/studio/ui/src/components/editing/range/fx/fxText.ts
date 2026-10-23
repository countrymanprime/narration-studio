import type { RangePlan } from '../common/rangePlan';
import { FX_FADE_MS } from './fxCommand';

type Acting = Exclude<RangePlan, { kind: 'refused' }>;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The question's title: how many words take an effect. The chain is chosen inside it, so it is not in the title. */
export const fxTitle = (n: number): string => `Add FX to ${plural(n, 'word', 'words')}?`;

/** What an effect does where the words sit and how it is undone, in one place so the dialog and the tests read the same sentences. */
export function fxPlanText(plan: Acting): string {
  switch (plan.kind) {
    case 'recorder':
      return `The app keeps this as an effect entry in its edit list and asks no DAW. The recording file is not touched. Undo here removes the entry.`;
    case 'backup-then-daw':
      return `${plan.dawName} changes the audio itself, so the app backs up the stretch first, then applies the effect to the selection. That is ${plan.steps} undo steps in ${plan.dawName}: Edit > Undo ${plan.steps} times there puts it back, and the backup keeps the full copy.`;
    case 'daw':
      return `${plan.dawName} splits the item at both ends and puts the chain on the middle piece only. Nothing else moves. It is one undo step in ${plan.dawName}: Edit > Undo there takes it off, and Remove joins the pieces again.`;
  }
}

/** The join at each split, in the dialog's words. */
export const FX_JOINS = `${FX_FADE_MS} ms fades at both splits, snapped to zero crossings. Nothing moves; the rest of the chapter is untouched.`;

/** The confirm button, by who makes the change; "Add anyway" when the narrator must first accept an overlap or the cap. */
export const fxButton = (over: boolean, plan: Acting): string => {
  if (over) return 'Add anyway';
  switch (plan.kind) {
    case 'recorder':
      return 'Add effect entry';
    case 'backup-then-daw':
      return 'Back up and apply effect';
    case 'daw':
      return 'Split and add effect';
  }
};
