// The `global` rows of STATE_CATALOG (see state-catalog.ts), in the order they are captured.
import type { StateEntry } from '../lib/types';
import { TOOLTIP_CLOSES_ON_RESIZE, FREEZES_THE_CLOCK, LAYOUT_BANDS } from './shared';

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
  {
    page: 'global',
    state: 'shortcut-sheet',
    description: 'The "?" shortcut sheet, listing every command grouped by scope',
  },
  {
    page: 'global',
    state: 'nav-rail-open',
    description:
      'Primary navigation - hovering the collapsed rail opens it over the page with the labels and group headings; at desktop width the rail is already open, so this is a no-op there',
    pointer: 'keep',
    sameAs: {
      of: 'production/no-data',
      reason: 'Only the collapsed rail opens on hover; the wide rail is always open.',
      viewports: ['desktop'],
    },
    ...TOOLTIP_CLOSES_ON_RESIZE,
    ...LAYOUT_BANDS,
  },

  // Theme smoke check (the Production home only, not the full page/state matrix - see
  // ADR 0010) - explicit Light/Dark selected via Settings > Appearance,
  // captured on the Production home across every viewport.
  {
    page: 'global',
    state: 'theme-light',
    description: 'The Production home with Light explicitly selected in Settings > Appearance',
  },
  { page: 'global', state: 'theme-dark', description: 'The Production home with Dark explicitly selected in Settings > Appearance' },
];
