// The `schedule` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';

export const scheduleStates: StateEntry[] = [
  {
    page: 'schedule',
    state: 'no-due-date',
    reloadPerViewport: true,
    description: 'Schedule before a due date is set - the heading says so, the verdict and the milestone table with nothing dated',
  },
  {
    page: 'schedule',
    state: 'on-pace',
    reloadPerViewport: true,
    description:
      'Schedule with a due date the pace meets (?mockProduction=on-pace) - the verdict, how the book pays, the work left worked out and the milestones',
  },
  {
    page: 'schedule',
    state: 'at-risk',
    reloadPerViewport: true,
    description: 'Schedule with a due date the pace misses (?mockProduction=at-risk) - the at-risk verdict and the work left worked out',
  },
  {
    page: 'schedule',
    state: 'milestone-dialog',
    reloadPerViewport: true,
    description: 'Schedule with the Add milestone dialog open',
  },
  {
    page: 'schedule',
    state: 'overdue',
    reloadPerViewport: true,
    description:
      'Schedule six days after the due date (?mockProduction=on-pace, the page clock moved on) - "6 days overdue" in the header, Behind in the verdict with no pace of Infinity',
  },
  {
    page: 'schedule',
    state: 'long-text',
    reloadPerViewport: true,
    description:
      'Schedule with milestones named in a 200-character word, in right-to-left text and with emoji - the table wraps them and does not widen the page',
  },
  {
    page: 'schedule',
    state: 'no-manuscript',
    description:
      'Schedule with no manuscript imported (?mockNoManuscript=1): the page asks for the manuscript, with no estimates left over from an earlier one',
  },
];
