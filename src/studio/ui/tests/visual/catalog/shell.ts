// The `shell` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';
import { LAYOUT_BANDS, REFLOW } from './shared';

export const shellStates: StateEntry[] = [
  // Back and Forward are jump-menu commands now (the header draws neither): the first-page states show the menu with both off, so the
  // rows here are the menu after a move. Captured at the reflow width too (docs/design/design-system.md's declared extension).
  {
    page: 'shell',
    state: 'jump-menu-back-enabled',
    description: 'Jump menu typed "> back", after one navigation (Story Bible): Back on, with its key',
    ...REFLOW,
  },
  { page: 'shell', state: 'jump-menu-forward-enabled', description: 'Jump menu typed "> forward", after a Back: Forward on', ...REFLOW },
  // The engine chip, replacing the REAPER pill: its three
  // REAPER states are the existing default/`daw-not-linked`/mismatch captures of other pages' headers, so only the
  // two states nothing else reaches get their own row here.
  {
    page: 'shell',
    state: 'engine-builtin',
    description:
      'Header engine chip in its "Built-in" state: the project records with the built-in recorder (RecorderState.engine; ?mockEngine=builtin seeds the mock recorder)',
    ...REFLOW,
  },
  {
    page: 'shell',
    state: 'engine-mismatch',
    description: 'Header engine chip reading REAPER with its warning dot and the different-project tooltip: a live heartbeat disagrees with the linked file',
    sameAs: {
      of: 'production/no-data',
      reason:
        'The chip draws a name and a warning dot for both a REAPER that is not running and a different open project; only the tooltip and the accessible name differ, and neither is on screen.',
    },
    ...REFLOW,
  },
  // The zoom chip: the default states show no chip (zoom is 100%), so a non-100% level gets its own row, and the chip's press its own. Reflow
  // (docs/design/design-system.md's declared extension): the header at 390px is what the narrator sees at high real zoom.
  {
    page: 'shell',
    state: 'zoom-level',
    description: 'Header zoom chip at 125% (?mockZoom=125), between the Jump button and the engine chip',
    ...REFLOW,
  },
  {
    page: 'shell',
    state: 'zoom-menu-open',
    description: 'The zoom chip pressed at 125%: the jump menu opened at its Zoom commands, Reset zoom on',
    ...REFLOW,
  },
  {
    page: 'shell',
    state: 'switch-project-open',
    description: 'The header project name pressed: the project picker over the open project, with Back to it',
    ...REFLOW,
  },
  // The three layers the shell mounts (SN-R8): the jump menu from the header's button, the menu on empty space in the page, and the
  // undo history. The context menu is opened by a right-click, so the pointer stays where the driver left it.
  {
    page: 'shell',
    state: 'jump-menu-open',
    description: 'The jump menu open from the header button: the field focused and one row per command group',
    // The header's Jump button is reachable below `md` (high zoom), so its menu is captured there too.
    extraViewports: [...REFLOW.extraViewports, ...LAYOUT_BANDS.extraViewports],
  },
  {
    page: 'shell',
    state: 'context-menu-open',
    description: 'The menu on empty space in the page: Go to, the zoom steps, the theme, then the jump menu and Find',
    pointer: 'keep',
    ...LAYOUT_BANDS,
  },
  // With no manuscript the rail shows the pages that need one off. A press on one opens a note with the reason; the jump menu lists the same pages off.
  {
    page: 'shell',
    state: 'nav-off-note',
    description:
      'No manuscript imported (?mockNoManuscript=1): the rail shows the nine pages that need one off with a lock, and a press on Proof opens its note with the reason, beside the item',
    pointer: 'keep',
    // Driven at each width: driven once at desktop and resized, the note stayed anchored to the rail item that hides below 860 px and
    // was drawn over the header (alignment audit XSL-9); at that width the press is in the drawer.
    reloadPerViewport: true,
    extraViewports: [...REFLOW.extraViewports, ...LAYOUT_BANDS.extraViewports],
  },
  {
    page: 'shell',
    state: 'jump-menu-off-pages',
    description:
      'No manuscript imported (?mockNoManuscript=1): the jump menu typed with "go to" lists the nine pages that need one off, each with its reason, and Production and Settings on',
  },
  {
    page: 'shell',
    state: 'history-panel-open',
    description: 'The undo history slide-over from the jump menu\'s "Open the undo history" command, with an empty journal',
    ...LAYOUT_BANDS,
  },
];
