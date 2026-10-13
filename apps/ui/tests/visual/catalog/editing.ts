// The `editing` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured: the Editing page (the Studio Next mock's
// `pages/Editing.tsx`) at `/editing`, which replaced Proof's chapter workspace (SN-E9). Chapter 1 is linked to its track with
// `?mockChapterLink=confirmed`, so its words carry the times they were heard at; the edit rows also turn the DAW's experimental
// actions on (`?mockDawExperimentalOn=1`), which the mock REAPER keeps off by default.
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL, POPUP_ANCHORED_AT_FIRST_WIDTH } from './shared';

export const editingStates: StateEntry[] = [
  {
    page: 'editing',
    state: 'default',
    description:
      'Editing, Chapter 1 linked to its track - the header with the chapter step and the legend, the script with each line’s takes chip and time, the bar and the key hints',
  },
  {
    page: 'editing',
    state: 'selection',
    description: 'Editing, four words selected - the floating toolbar under them, the bar naming "4 words" with their times, and the line’s audio ribbon',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'editing',
    state: 'delete-dialog',
    description: 'Editing, Delete on four selected words - the question names how many words and their audio go, and what the DAW will do',
  },
  {
    page: 'editing',
    state: 'fx-menu',
    description: 'Editing, Add FX on four selected words - the menu of the DAW’s FX chains',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'editing',
    state: 'fx-dialog',
    description: 'Editing, an FX chain chosen for four words - the question names the chain and how the item is split around the words',
  },
  {
    page: 'editing',
    state: 'takes-open',
    description:
      'Editing, the first line’s takes opened under it - the suggested take with the steps that would make it surer, each take’s evidence, and how retries are kept',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'editing',
    state: 'suggestion-step',
    description: 'Editing, Normalise pressed in the suggestion’s steps - the question lists the takes it would bring to the same level',
  },
  {
    page: 'editing',
    state: 'drawer-cleanup',
    description: 'Editing, the drawer open on Clean up - what was found in the chapter and the findings by operation',
  },
  {
    page: 'editing',
    state: 'drawer-effects',
    description: 'Editing, the drawer on Effects - the effects on words and adding one',
  },
  {
    page: 'editing',
    state: 'drawer-timeline',
    description:
      'Editing, the drawer on Timeline (the strip does not fit beside the text at these widths) - the waveform and takes of the line the cursor is on',
  },
  {
    page: 'editing',
    state: 'never-checked',
    description:
      'Editing on Chapter 7, never checked - the alignment of a chapter never checked carries no paragraphs (the host’s as well as the mock’s), so the page says the chapter has no text yet; the bar stays',
  },
  {
    page: 'editing',
    state: 'unlinked',
    description:
      'Editing on Chapter 1 with no track linked (?mockChapterLink=none) - the banner says why there is no audio to edit and opens the audio engine panel, the legend says "No audio to edit", and the script reads plain with no word boxed "not read"',
  },
  {
    page: 'editing',
    state: 'daw-off',
    description: 'Editing with the DAW not connected (?mockDaw=Audacity) - the banner with its reason and Retry; the edit actions wait',
  },
  {
    page: 'editing',
    state: 'no-manuscript',
    description: 'Editing with no manuscript imported - the page asks for one, with Import manuscript',
  },
];
