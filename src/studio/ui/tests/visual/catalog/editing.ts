// The `editing` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured: the Editing page (the Studio Next mock's
// `pages/Editing.tsx`) at `/editing`, which replaced Proof's chapter workspace (SN-E9). Chapter 1 is linked to its track with
// `?mockChapterLink=confirmed`, so its words carry the times they were heard at; the edit rows also turn the DAW's experimental
// actions on (`?mockDawExperimentalOn=1`), which the mock REAPER keeps off by default.
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL, POPUP_ANCHORED_AT_FIRST_WIDTH, TOAST_FADES_OUT } from './shared';

export const editingStates: StateEntry[] = [
  {
    page: 'editing',
    state: 'jump-menu',
    description:
      'Editing, the jump menu typed "selected" with no words selected: the selection actions listed under On this page, each off with "Select some words in the script first."',
  },
  {
    page: 'editing',
    state: 'default',
    description:
      'Editing, Chapter 1 linked to its track - the header with the chapter step and the legend, the script with each line’s takes chip and time, the one waveform docked above the bar, the bar and the key hints',
  },
  {
    page: 'editing',
    state: 'selection',
    description:
      'Editing, four words selected - the floating toolbar under them, the bar naming "4 words" with their times, and their band on the waveform docked above the bar',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'editing',
    state: 'range',
    description:
      'Editing, a range drawn on the docked waveform with an edge inside a word and the view zoomed in once - the handles, the arrows at its ends (no scrollbar), the partial word and the sub-word preview',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'editing',
    state: 'wave-scrolled',
    description:
      'Editing, the docked waveform dragged with the right button to the next line - the script marks the line now on screen in the waveform and brings it into view, the cursor stays where it was',
  },
  {
    page: 'editing',
    state: 'wave-menu',
    description:
      'Editing, a right click on the docked waveform without a drag - its own menu: play from that moment, put the cursor on the word there, select the line, zoom and show the whole line or recording',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'editing',
    state: 'output-popover',
    description:
      'Editing, the Output button pressed - the popover over the bar with the speed, the volume, the output device and the DAW’s monitor level, and the silence button beside it',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'editing',
    state: 'output-no-outputs',
    description: 'Editing, the Output popover on a computer that names no outputs - the device choice is off with its reason and Check again',
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
    state: 'word-menu-fx',
    description: 'Editing, right-click on four selected words with Add FX open - the word menu with its submenu of the DAW’s FX chains',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
    // The pointer rests on the Add FX row, which is what holds its submenu open: moved away, the submenu closes before the shot.
    pointer: 'keep',
  },
  {
    page: 'editing',
    state: 'drawer-effects-inspector',
    description: 'Editing, the Effects tab with two effects on words - the inspector with Previous and Next effect and Show in the DAW',
  },
  {
    page: 'editing',
    state: 'fx-dialog',
    description: 'Editing, an FX chain chosen for four words - the question names the chain and how the item is split around the words',
  },
  {
    page: 'editing',
    state: 'voice-sample-dialog',
    description:
      'Editing, Voice sample on four selected words - the character chosen from the chapter’s speakers, the words with Play range, the label and note, Make primary and Save sample',
  },
  {
    page: 'editing',
    state: 'voice-sample-refused',
    description:
      'Editing, Voice sample on a word that was said and is not in the script - the dialog says in one sentence that the words were not heard, with Play range and Save sample off',
  },
  {
    page: 'editing',
    state: 'voice-sample-saved',
    description:
      'Editing, a voice sample saved from four selected words - the dialog closed and the toast says whom it was saved for, with Undo for ten seconds',
    ...TOAST_FADES_OUT,
  },
  {
    page: 'editing',
    state: 'voice-sample-mark',
    description:
      'Editing, a voice sample saved from four selected words - the dot after the last word of the range, with its accessible name naming the character and what was saved',
    ...TOAST_FADES_OUT,
  },
  {
    page: 'editing',
    state: 'voice-sample-mark-open',
    description: 'Editing, the dot after a marked range opened - the character, its length and a play control under the dot, with Open in Story Bible',
    ...TOAST_FADES_OUT,
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
    state: 'drawer-effects-chains',
    description: 'Editing, the drawer on Effects with a DAW that lists its chains - each chain with a Favourite button, the favourites first',
  },
  {
    page: 'editing',
    state: 'drawer-timeline',
    description:
      'Editing, the drawer on Timeline (the strip does not fit beside the text at these widths) - the takes of the line the cursor is on, one lane each, with the waveform docked above the bar',
  },
  {
    page: 'editing',
    state: 'never-checked',
    description:
      'Editing on Chapter 7, never checked - the alignment of a chapter never checked carries the chapter’s paragraphs and nothing heard (the host’s as well as the mock’s), so the script reads plain; the fixture also leaves Chapter 7 without a track, so the no-audio banner shows and the bar stays',
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
  {
    page: 'editing',
    state: 'loading',
    description:
      'Editing while the chapters are still being read (?mockChapters=loading): the page\'s own header (the title, a block where the chapter stepper will be, the strip and Clean up and effects buttons) and the script\'s three paragraphs as grey blocks, with one polite "Reading the chapters…" status',
  },
  {
    page: 'editing',
    state: 'load-failed',
    description:
      'Editing when the chapters cannot be read (?mockChapters=fails): the Editing title and "This page could not be loaded" with the read\'s own sentence as an alert and a Retry button that reads the chapters again; no skeleton left behind',
  },
  {
    page: 'editing',
    state: 'chapter-load-failed',
    description:
      'Editing when one chapter cannot be read (?mockChapterRead=fails): the header and chapter stepper stay and, under them, "This page could not be loaded" with the read\'s own sentence as an alert and a Retry button that reads the chapter again; no skeleton left behind',
  },
  {
    page: 'editing',
    state: 'address-checking',
    description:
      'Editing opened from a link to a chapter the list does not have, while the list is read once more (?mockChapters=reread-hangs, at /editing/gone): the Editing title and a block where the chapter stepper will be, then the script\'s three paragraphs as grey blocks, with one polite "Checking this link…" status',
  },
];
