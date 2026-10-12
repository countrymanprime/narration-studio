// The `pickups` rows of STATE_CATALOG: the Studio Next Pickups page (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';

export const pickupsStates: StateEntry[] = [
  {
    page: 'pickups',
    state: 'list',
    description:
      'Pickups, all chapters (Studio Next mock): the head with the chapter stepper, Check recordings and Add a pickup by hand, the lines grouped by chapter with include, time, type, line, source and status, and the Pickup session panel with Open N in Booth',
  },
  {
    page: 'pickups',
    state: 'scoped',
    description: 'Pickups narrowed to Chapter 1 in the stepper: "No pickups for this chapter", the session panel counting none',
  },
  {
    page: 'pickups',
    state: 'session-left-out',
    description: 'Pickups with one line left out of the session (its box cleared): the session panel counts one line fewer',
  },
  {
    page: 'pickups',
    state: 'add-popover',
    description: 'Pickups with Add a pickup by hand open: the time in the recording and the line to re-record',
  },
  {
    page: 'pickups',
    state: 'empty',
    description: 'Pickups after every line is removed: "No pickups queued", the way to Proof, and an empty session',
  },
];
