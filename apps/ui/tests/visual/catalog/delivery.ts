// The `delivery` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured. Delivery is the Studio Next mock's
// Delivery page (SN-M5): the profile card, Output, the profile's rules and the "Before you build" aside. `?mockDelivery=` boots
// every chapter measured and passing with the files mastered and encoded, so Build is on and the build's own states can be captured.
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
    state: 'ready',
    description:
      'Delivery with every chapter and both credits files passing and the files mastered and encoded (?mockDelivery=ready) - "Every chapter passes.", Build ACX package on and the folder to be chosen when it builds',
  },
  {
    page: 'delivery',
    state: 'built',
    description:
      'Delivery after Build ACX package, the host having chosen the folder - the Built pill, "n files in <folder>", Open the folder and a Written pill per file',
  },
  {
    page: 'delivery',
    state: 'building',
    description: 'Delivery with a started build still running (?mockDelivery=building) - the busy Build button, Cancel and the progress bar',
  },
  {
    page: 'delivery',
    state: 'build-failed',
    description: "Delivery after the host refused the build (?mockDelivery=fails) - the refusal in the host's words under Build, nothing listed as written",
  },
  {
    page: 'delivery',
    state: 'host-quiet',
    description:
      'Delivery with a build running and the host no longer answering (?mockDelivery=quiet) - "Can\'t tell how the build is going, last heard N s ago" with Check again, Cancel still offered',
  },
  {
    page: 'delivery',
    state: 'no-manuscript',
    description: 'Delivery opened by its address with no manuscript imported (?mockNoManuscript) - the page asks for the manuscript first',
  },
];
