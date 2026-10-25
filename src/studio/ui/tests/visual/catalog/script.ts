// The `script` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured. The Studio Next Script page (SN-B77,
// swapped in by SN-B8): three columns at 1440, the rail a drawer below 1280 px and the chapter list a drawer below 1180 px.
import type { StateEntry } from '../lib/types';
import { KEEPS_DESKTOP_SCROLL, POPUP_ANCHORED_AT_FIRST_WIDTH, RAIL_DEPENDS_ON_WIDTH, TOAST_FADES_OUT } from './shared';

// A rail tab: the column beside the reader at 1440, the drawer over the text with its scrim below 1280 px.
const railTab = (state: string, description: string): StateEntry => ({ page: 'script', state, description, ...RAIL_DEPENDS_ON_WIDTH });

export const scriptStates: StateEntry[] = [
  {
    page: 'script',
    state: 'reader',
    description:
      'Script, the continuous reader on Chapter 1: the chapter list with its prep dots, the chapter card, the marks and speaker chips in the text, and the rail on its Words tab',
  },
  railTab('rail-words', 'Script, the rail on its Words tab with a word chosen: how to say it, its source and the web look-ups'),
  railTab('rail-story-bible', "Script, the rail on its Story Bible tab: the book's entries by kind, one opened"),
  railTab('rail-notes', "Script, the rail on its Notes tab: the chapter's notes, each with where it is"),
  {
    page: 'script',
    state: 'first-use-tip',
    description: 'Script, the first time it opens: the one-time tip over the reader about selecting text, with Got it',
  },
  {
    page: 'script',
    state: 'chapter-list',
    description:
      'Script, Chapter 3 chosen from the chapter list: the column at 1440, the drawer from the left with its scrim below 1180 px (the header’s Chapters button)',
    // The driver opens the drawer only where the width shows its button, so each width loads afresh.
    reloadPerViewport: true,
  },
  {
    page: 'script',
    state: 'reader-context-menu',
    description:
      'Script, the right-click menu on a selected word, opened under the word: Mark as and Add to the Story Bible as as submenus, then Look up, Find, Copy, Bookmark here and Record from here',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'script',
    state: 'skip-to-side-panel',
    description:
      'Script, the "Skip to the side panel" button under the reader header, shown while it has focus: one Tab from the header past every chapter card to the rail',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'script',
    state: 'bookmark-added',
    description: 'Script, B pressed in the reader: the "Bookmark added." toast with Undo, and the bookmark ribbon beside its line',
    ...TOAST_FADES_OUT,
    // Each width loads the Script with its manuscript, drives the bookmark and its editor, and runs axe in one test: 15 to 20 s under
    // UI_CPU_THROTTLE=6 on a fast runner, past the 30 s default on a slower one (4 of 15 runs).
    timeoutFactor: 2,
  },
  {
    page: 'script',
    state: 'jump-menu',
    description: 'Script, the jump menu opened with Ctrl+K: "On this page" first with one row per group (Chapters, Story Bible, Mark types), then the commands',
  },
  {
    page: 'script',
    state: 'search-menu',
    description: 'Script, Ctrl+F then "Alice": the menu searching only the page, its matches under "In the script" with the matched word marked',
  },
  {
    page: 'script',
    state: 'search-shown',
    description: 'Script, a match chosen in the menu: every match of "Alice" lit in the text and the chosen one ringed and in view',
  },
  {
    page: 'script',
    state: 'selection-tools',
    description: 'Script, the selection toolbar over a selected word: Mark, the Story Bible kinds, Bookmark here, Record here and Look up',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'script',
    state: 'mark-composer',
    description: 'Script, the mark composer for a selected word: the mark’s type and its note',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  { page: 'script', state: 'define-marks', description: 'Script, the Define how you mark up dialog: each mark type with its name, colour and line' },
  {
    page: 'script',
    state: 'text-settings',
    description: 'Script, the text settings popover: font, size, line spacing and column width',
    ...POPUP_ANCHORED_AT_FIRST_WIDTH,
  },
  {
    page: 'script',
    state: 'credits-cards',
    description:
      'Script, the Opening credits drawn as the mock draws a chapter above Chapter 1: the Credits card with My prep and its unresolved tokens, then the credits text',
  },
  {
    page: 'script',
    state: 'credits-setup-banner',
    description: 'Script, the credits-setup banner above the Opening credits and the card’s own Fill in (?mockCredits=setup, kept as built)',
    ...KEEPS_DESKTOP_SCROLL,
  },
  {
    page: 'script',
    state: 'retail-sample',
    description:
      'Script, the retail sample picked on lines 1-3 of Chapter 3 (?mockCredits=extras): "Retail sample starts · about ..." beside the first line and "Retail sample ends" beside the last (kept as built)',
  },
  { page: 'script', state: 'reader-dark', description: 'Script, the reader in the Dark theme' },
  {
    page: 'script',
    state: 'invalid-payload',
    description:
      'Script, the inline error with Retry when the data it loads could not be read, beside the notice Home raised for the same data; navigation still works',
  },
  {
    page: 'script',
    state: 'no-manuscript',
    description:
      'Script with no manuscript imported (?mockNoManuscript=1), opened by its address: the page asks for the manuscript, with Import manuscript, which opens the import on this page (it neither opens it by itself nor goes to Production)',
  },
  {
    page: 'script',
    state: 'loading',
    description:
      'Script while its chapters are still being read (?mockChapters=loading): the hidden page title kept and the three columns as framed blocks - the chapter list (from 1180 px), the reader, the rail (from 1281 px) - with one polite "Reading the manuscript…" status',
  },
];
