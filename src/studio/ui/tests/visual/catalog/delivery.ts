// The `delivery` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured. Delivery is the Studio Next mock's
// Delivery page (SN-M5): the profile card, Output, the profile's rules and the "Before you build" aside. `?mockDelivery=` boots
// every chapter measured and passing with the files mastered and encoded, so Build is on and the build's own states can be captured.
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL, REFLOW, wholePage } from './shared';

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
      'Delivery with the book already checked (?mockMeasure=spread) - "Before you build" counting the chapters that pass, each row opening the chapter in Master & QC, and Output with Build off, counting the chapters not ready and naming the first of them in red ("Opening credits: no measured file yet.")',
    ...REFLOW,
  },
  {
    page: 'delivery',
    state: 'failing-chapter',
    description:
      'Delivery after Master & QC measured three files (the first at 48 kHz, the second silent, the third unreadable) - Build off, "1 failing, ..." and, in red under it, the first failing chapter with its rule, value and limit ("Chapter 1 — Down the Rabbit-Hole: sample rate 48 kHz (limit 44.1 kHz).")',
  },
  {
    page: 'delivery',
    state: 'many-chapters',
    // 5002 chapters: each resize lays the whole list out again, about 28 s a viewport, so the default 90 s for three left no margin on a CI runner.
    timeoutFactor: 2,
    description:
      'Delivery for a 5002-chapter book (?mockBooth=many-chapters) - the first hundred chapters listed under "Before you build", the count above them for the whole book, and "Show the other 4902 chapters" below the list',
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
      'Delivery with a build running and the host no longer answering (?mockDelivery=quiet) - "Can\'t tell how the build is going, last heard N s ago" with Check again, Cancel still offered, and no "Every chapter passes." beside Build (it would be a stale fact)',
  },
  {
    page: 'delivery',
    state: 'host-quiet-cancelled',
    description:
      'Delivery with the host not answering (?mockDelivery=quiet), after Check again and then Cancel - the quiet notice ending "(you checked again just now)." and "Cancel was sent, but the host did not confirm it, so the build may still be running." with the quiet notice and Cancel still up',
  },
  {
    page: 'delivery',
    state: 'no-manuscript',
    description: 'Delivery opened by its address with no manuscript imported (?mockNoManuscript) - the page asks for the manuscript first',
  },
  {
    page: 'delivery',
    state: 'loading',
    description:
      'Delivery while the chapters are still being read (?mockChapters=loading): the page as usual, and in Before you build grey blocks in place of the chapter checks, with one polite "Reading the chapters…" status',
  },
];
deliveryStates.push(wholePage(deliveryStates, 'measured'));
