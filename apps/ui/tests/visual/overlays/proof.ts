import type { Page } from '@playwright/test';
import { clickCase, fromState, type OverlayCase } from '../helpers/overlayGuardFor';

const stepper = (page: Page) => page.getByRole('button', { name: /^Chapter: .*\. Change chapter$/ });

// Proof's overlays: the chapter stepper's menu, the context menu on a note, and the recording-check dialog the catalog reaches.
export const proofCases: OverlayCase[] = [
  clickCase('chapter stepper menu', 'menu', stepper),
  {
    name: 'context menu on a note',
    kind: 'context-menu',
    open: async (page) => {
      await page.getByRole('region', { name: 'Notes' }).locator('tr[data-row]').first().click({ button: 'right' });
      await page.locator('[role="menu"]:visible').last().waitFor({ timeout: 2000 });
    },
  },
  fromState('proof', 'check-checking'),
];
