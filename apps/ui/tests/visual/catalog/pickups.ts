// The `pickups` rows of STATE_CATALOG: the Studio Next Pickups page (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';
import { REFLOW } from './shared';

export const pickupsStates: StateEntry[] = [
  {
    page: 'pickups',
    state: 'list',
    description:
      'Pickups, all chapters (Studio Next mock): the head with the chapter stepper, Check recordings and Add a pickup by hand, the lines grouped by chapter with include, time, type, line, source and status, and the Pickup session panel with Open N in Booth',
    ...REFLOW,
  },
  {
    page: 'pickups',
    state: 'scoped',
    description: 'Pickups narrowed to Chapter 1 in the stepper: "No pickups for this chapter", the session panel counting none',
    ...REFLOW,
  },
  {
    page: 'pickups',
    state: 'session-left-out',
    description: 'Pickups with one line left out of the session (its box cleared): the session panel counts one line fewer',
    ...REFLOW,
  },
  {
    page: 'pickups',
    state: 'add-popover',
    description: 'Pickups with Add a pickup by hand open: the time in the recording and the line to re-record',
    ...REFLOW,
  },
  {
    page: 'pickups',
    state: 'empty',
    description: 'Pickups after every line is removed: "No pickups queued", the way to Proof, and an empty session',
    ...REFLOW,
  },
  {
    page: 'pickups',
    state: 'no-manuscript',
    description:
      'Pickups with no manuscript imported (?mockNoManuscript=1): the page asks for the manuscript, the rail shows no count, and nothing moves to Production',
    ...REFLOW,
  },
  {
    page: 'pickups',
    state: 'marked-recorded',
    description: 'Pickups after Mark recorded on a line: its status reads Recorded with "Not in the DAW yet" under it, and the session counts one line fewer',
    ...REFLOW,
  },
  {
    page: 'pickups',
    state: 'unreadable',
    description:
      'Pickups with the host unable to read the list (?mockPickupList=unreadable): the reason and Check again, not "No pickups queued"; the session panel counts none',
    ...REFLOW,
  },
];
