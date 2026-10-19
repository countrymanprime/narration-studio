import type { Page } from '@playwright/test';
import { clickCase, hoverCase, type OverlayCase } from '../helpers/overlayGuardFor';

const list = (page: Page) => page.getByRole('region', { name: 'Pickups' });
const addButton = (page: Page) => list(page).getByRole('button', { name: 'Add a pickup by hand' });
const rows = (page: Page) => page.locator('tr[data-pk]');

// Pickups' overlays: the context menu on a line, the Add popover, the chapter stepper's menu, the Check recordings dialog and the hint on
// a line's last icon. The row menu is also opened over the Add popover. (The Add popover is not a shell overlay, so it is listed here.)
export const pickupsCases: OverlayCase[] = [
  {
    name: 'context menu on a line',
    kind: 'context-menu',
    open: async (page) => {
      await rows(page).first().click({ button: 'right' });
      await page.locator('[role="menu"]:visible').last().waitFor({ timeout: 2000 });
    },
  },
  {
    name: 'context menu on a line over the Add popover',
    kind: 'context-menu',
    over: { name: 'Add popover', open: async (page) => addButton(page).click() },
    open: async (page) => {
      // The popover can lie over the whole top of the first line at narrow widths, so the click goes to the line's bottom left corner.
      const row = rows(page).first();
      const box = await row.boundingBox();
      await row.click({ button: 'right', position: { x: 4, y: Math.max(4, (box?.height ?? 8) - 4) } });
      await page.locator('[role="menu"]:visible').last().waitFor({ timeout: 2000 });
    },
  },
  clickCase('Add a pickup by hand', 'popover', addButton),
  clickCase('chapter stepper menu', 'menu', (page) => list(page).getByRole('button', { name: /^Chapter: .*\. Change chapter$/ }), {
    viewports: ({ height }) => height >= 500,
  }),
  clickCase('Check recordings', 'dialog', (page) => list(page).getByRole('button', { name: /Check recordings/ })),
  hoverCase('hint on Remove from pickups', (page) => rows(page).first().getByRole('button', { name: 'Remove from pickups' })),
];
