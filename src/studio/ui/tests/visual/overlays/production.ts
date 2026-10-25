import type { Page } from '@playwright/test';
import { openEnginePanel } from '../drivers/shared';
import { fromState, type OverlayCase } from '../helpers/overlayGuardFor';

// The engine panel (opened from the header's engine chip over the Production home) and one Chapter links row's More actions menu: the first
// row, near the panel's top, and the last, at the foot of the panel's scroll, so the menu opens downward and has to flip.
function engineRowMenu(row: 'first' | 'last'): OverlayCase {
  return {
    name: `engine panel: Chapter links ${row} row's More actions`,
    kind: 'menu',
    // Opened from the Production page at each window size itself (not reached at 390 px and narrowed after, as a `fresh` case is): a menu
    // follows its row, and narrowing the window under an open panel leaves the last row below the window.
    scrolled: false,
    open: async (page: Page) => {
      const panel = await openEnginePanel(page);
      const menus = panel.getByRole('table', { name: 'Chapter links' }).getByRole('button', { name: /^More actions for / });
      const trigger = row === 'first' ? menus.first() : menus.last();
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await page.getByRole('menu').waitFor();
    },
  };
}

// Production's overlays are dialogs and panels the catalog already reaches (tests/visual/drivers/production.ts): each is opened by
// its driver, so the guard follows how the suite gets there.
export const productionCases: OverlayCase[] = [
  fromState('production', 'chapter-track-panel-linked'),
  fromState('production', 'chapter-remove-confirm'),
  fromState('production', 'credits-setup-dialog'),
  fromState('production', 'import-confirm'),
  fromState('production', 'recording-check-complete'),
  fromState('production', 'recording-check-model-required'),
  fromState('production', 'chapter-sync-consent'),
  fromState('production', 'credits-panel'),
  fromState('production', 'editing-check-gain-match-confirm'),
  engineRowMenu('first'),
  engineRowMenu('last'),
];
