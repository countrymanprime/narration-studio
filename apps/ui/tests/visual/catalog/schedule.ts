// The `schedule` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';

export const scheduleStates: StateEntry[] = [
  {
    page: 'schedule',
    state: 'no-due-date',
    description: 'Schedule before a due date is set - the heading says so, the verdict and the milestone table with nothing dated',
  },
  {
    page: 'schedule',
    state: 'on-pace',
    description:
      'Schedule with a due date the pace meets (?mockProduction=on-pace) - the verdict, how the book pays, the work left worked out and the milestones',
  },
  {
    page: 'schedule',
    state: 'at-risk',
    description: 'Schedule with a due date the pace misses (?mockProduction=at-risk) - the at-risk verdict and the work left worked out',
  },
  {
    page: 'schedule',
    state: 'milestone-dialog',
    description: 'Schedule with the Add milestone dialog open',
  },
];
