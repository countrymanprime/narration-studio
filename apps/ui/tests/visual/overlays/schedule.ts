import type { Page } from '@playwright/test';
import { APP_DRIVERS } from '../app.drivers';
import { clickCase, type OverlayCase } from '../helpers/overlayGuardFor';

const addButton = (page: Page) => page.getByRole('button', { name: 'Add milestone' }).first();
const statusCells = (page: Page) => page.getByRole('img', { name: /On track|At risk|Late by|Done|Due/ });

// Schedule's overlays: the Add milestone dialog (also over an Undo toast that is already up) and the hint on a milestone's status cell.
// The Paid list is the browser's own select popup, which the page draws nothing of.
export const scheduleCases: OverlayCase[] = [
  clickCase('Add milestone dialog', 'dialog', addButton),
  {
    name: 'Add milestone dialog over an Undo toast',
    kind: 'dialog',
    over: {
      name: 'Undo toast',
      open: async (page) => {
        await addButton(page).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('textbox', { name: 'Name' }).fill('Toast maker');
        await dialog.getByRole('textbox', { name: 'Due' }).fill('2026-10-02');
        await dialog.getByRole('button', { name: 'Add milestone' }).click();
        await page.getByText('Milestone added.').first().waitFor();
      },
    },
    open: async (page) => addButton(page).click(),
  },
  {
    // The default load has no plan, so the catalog's own `on-pace` driver reaches a page with milestones first.
    name: 'hint on a milestone status',
    kind: 'tooltip',
    start: 'fresh',
    scrolled: false,
    // Not run below 390 px: a state-driven case is reached at 390 px and the window then narrowed with the hint open, and a hint is placed
    // once when it opens, so the narrowed window would judge a placement that no person sees (NOT tested there, said in the PR).
    viewports: ({ width }) => width >= 390,
    open: async (page) => {
      await APP_DRIVERS.schedule['on-pace'](page);
      await statusCells(page).last().hover();
      await page.locator('[role="tooltip"]:visible').last().waitFor({ timeout: 4000 });
    },
  },
];
