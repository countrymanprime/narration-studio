import type { Page } from '@playwright/test';
import { clickCase, fromState, type OverlayCase } from '../helpers/overlayGuardFor';

const stepper = (page: Page) => page.getByRole('button', { name: /^Chapter: .*Change chapter$/ });

// Editing's overlays: the chapter stepper's menu, the Add FX menu and its dialog, the delete and take-step confirms, the context
// menu on a word, and the clean-up and effects drawer, which the catalog reaches (tests/visual/drivers/editing.ts).
export const editingCases: OverlayCase[] = [
  clickCase('chapter stepper menu', 'menu', stepper),
  {
    name: 'context menu on a word',
    kind: 'context-menu',
    open: async (page) => {
      await page.locator('[data-k="p-1:1"]').click({ button: 'right' });
      await page.locator('[role="menu"]:visible').last().waitFor({ timeout: 2000 });
    },
  },
  fromState('editing', 'fx-menu', 'menu'),
  fromState('editing', 'fx-dialog'),
  fromState('editing', 'delete-dialog'),
  fromState('editing', 'suggestion-step'),
  fromState('editing', 'drawer-cleanup', 'slide-over', { root: (page) => page.locator('#drawer') }),
];
