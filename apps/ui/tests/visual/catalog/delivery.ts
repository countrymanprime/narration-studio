// The `delivery` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured. Delivery is the Studio Next mock's
// Delivery page (SN-M5, ADR 0802): the profile card, Output, the profile's rules and the "Before you build" aside. A built package has
// no row: the mock host measures six of the book's twelve chapters, so Build never turns on.
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL } from './shared';

export const deliveryStates: StateEntry[] = [
  {
    page: 'delivery',
    state: 'default',
    description:
      'Delivery judged against ACX with nothing measured - the built-in profile card with its checks and files read-only, the profile rules, Output with Build off, and "Before you build" with every chapter waiting',
  },
  {
    page: 'delivery',
    state: 'measured',
    description:
      'Delivery with the book already checked (?mockMeasure=spread) - "Before you build" counting the chapters that pass, each row opening the chapter in Master & QC, and Output asking to master to spec first',
  },
  {
    page: 'delivery',
    state: 'custom-profile',
    description:
      'Delivery judged against a custom profile (?mockDeliveryProfile=custom) - the profile name and each limit editable on the card, the Custom mark, and its rules',
  },
  {
    page: 'delivery',
    state: 'profile-rules',
    description:
      'Delivery, the profile\'s "Rules and their sources" opened - every ACX rule with what ACX requires, how the app checks it and a verified, to verify or conflicting-sources mark',
    ...KEEPS_DESKTOP_SCROLL,
  },

  {
    page: 'delivery',
    state: 'no-manuscript',
    description: 'Delivery opened by its address with no manuscript imported (?mockNoManuscript) - the page asks for the manuscript first',
  },
];
