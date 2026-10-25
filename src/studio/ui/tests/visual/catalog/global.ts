// The `global` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';
import { TOOLTIP_CLOSES_ON_RESIZE, FREEZES_THE_CLOCK, LAYOUT_BANDS, REFLOW } from './shared';

export const globalStates: StateEntry[] = [
  // Global overlays (captured once against the Production home, not per-page)
  {
    page: 'global',
    state: 'tooltip',
    description: 'Global tooltip overlay',
    pointer: 'keep',
    ...TOOLTIP_CLOSES_ON_RESIZE,
  },
  {
    page: 'global',
    state: 'toast',
    description: 'Global toast overlay',
    sameAs: {
      of: 'proof-chapter/compare-toast',
      reason: 'The global overlay is captured by asking a Proof chapter view to suggest vocabulary hints, the same flow as its compare-toast.',
    },
    ...FREEZES_THE_CLOCK,
  },
  {
    page: 'global',
    state: 'confirm-dialog',
    description: 'Global confirm dialog overlay',
    sameAs: { of: 'storybible/delete-confirm', reason: 'The global overlay is captured by opening the same delete-entity confirm dialog.' },
  },
  // Background recording checks (#2251): the first-time notice, a check in progress shown on another page, and chapters waiting.
  {
    page: 'global',
    state: 'background-check-notice',
    description: 'The first-time "Check recordings in the background?" notice, naming the models before anything starts',
  },
  {
    page: 'global',
    state: 'background-check-running',
    description: 'A background check in progress on the Editing page: chapter, percent, models and what waits, with Pause and Cancel, bottom left',
  },
  {
    page: 'global',
    state: 'background-check-booth',
    description: 'A background check in progress while the Booth is open: the corner starts folded to its chip, so it never covers the text being read',
  },
  {
    page: 'global',
    state: 'background-check-hidden',
    description: 'The background check corner folded to its one-line chip with Hide',
  },
  {
    page: 'global',
    state: 'background-check-waiting',
    description: 'Two chapters waiting for a background check while REAPER records, bottom left, with Pause',
  },
  {
    page: 'global',
    state: 'shortcut-sheet',
    description: 'The "?" shortcut sheet, listing every command grouped by scope',
  },
  {
    page: 'global',
    state: 'nav-rail-collapsed',
    description:
      'Primary navigation - the collapsed rail at rest (below 1360 px): icons centred in the rail, a thin rule between the groups; at desktop width the rail is already open, so this is the same page',
    sameAs: {
      of: 'production/no-data',
      reason:
        'The Production home at rest is already this picture: the wide rail at desktop and the collapsed rail below it. The row exists to name the guide image, and to capture the rail-only and medium-only widths the home is not captured at.',
      viewports: ['desktop', 'small-desktop', 'tablet'],
    },
    ...LAYOUT_BANDS,
  },
  {
    page: 'global',
    state: 'nav-rail-collapsed-dark',
    description: 'Primary navigation - the collapsed rail at rest in the Dark theme (selected in Settings > Appearance), as nav-rail-collapsed',
    sameAs: {
      of: 'global/theme-dark',
      reason:
        'The Production home in Dark at rest is already this picture: the wide rail at desktop and the collapsed rail below it. The row exists to name the guide image, and to capture the rail-only and medium-only widths the home is not captured at.',
      viewports: ['desktop', 'small-desktop', 'tablet'],
    },
    ...LAYOUT_BANDS,
  },
  {
    page: 'global',
    state: 'nav-rail-open',
    description:
      'Primary navigation - hovering the collapsed rail opens it over the page with the labels and group headings; at desktop width the rail is already open, and at tablet width (768 px) there is no rail, so this is a no-op there',
    pointer: 'keep',
    sameAs: {
      of: 'production/no-data',
      reason:
        'Only the collapsed rail (860 to 1359 px) opens on hover; the wide rail is always open, and below 860 px the hamburger and drawer replace the rail.',
      viewports: ['desktop', 'tablet'],
    },
    ...TOOLTIP_CLOSES_ON_RESIZE,
    ...LAYOUT_BANDS,
  },
  {
    page: 'global',
    state: 'nav-drawer-open',
    description:
      "Primary navigation - below 860 px the top bar's Open navigation button opens the navigation drawer over the page, with the groups and their items; from 860 px there is a rail and no drawer, so this is the page as it was",
    sameAs: {
      of: 'production/no-data',
      reason: 'From 860 px the rail replaces the drawer and its button, so there is nothing to open (alignment audit: the open drawer had no state).',
      viewports: ['desktop', 'small-desktop'],
    },
    ...REFLOW,
  },

  // Theme smoke check (not the full page/state matrix - see docs/design/design-system.md#theme) - explicit Light/Dark selected via
  // Settings > Appearance. Dark is captured on the Production home across every viewport; Light is the default theme, so its Production
  // home is production/no-data and Light is captured where it was chosen.
  {
    page: 'global',
    state: 'theme-light',
    description: 'Settings > Appearance & keys with Light explicitly selected (Light is the default theme, so the Production home in it is production/no-data)',
  },
  { page: 'global', state: 'theme-dark', description: 'The Production home with Dark explicitly selected in Settings > Appearance' },
];
