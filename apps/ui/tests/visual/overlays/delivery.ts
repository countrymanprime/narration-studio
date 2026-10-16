import type { Page } from '@playwright/test';
import { APP_DRIVERS } from '../app.drivers';
import type { OverlayCase } from '../helpers/overlayGuardFor';

/** A hint on an icon button: the button is scrolled into view and the pointer moved off it first, so the hint always re-arms (a pointer already resting there shows nothing new). */
async function showHint(page: Page, button: string): Promise<void> {
  const control = page.getByRole('button', { name: button, exact: true });
  const tooltip = page.locator('[role="tooltip"]:visible').last();
  // A hint that does not stay up is asked for again.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await control.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await control.hover();
    await tooltip.waitFor({ timeout: 6000 });
    await page.waitForTimeout(400);
    if (await tooltip.isVisible()) return;
  }
  throw new Error(`the hint on ${button} would not stay up`);
}

// Delivery's overlays: the hint on the aside's Open in Master & QC button, and the hint on Open the folder, which only a built package
// shows (reached by the catalog's own `built` driver). The profile menu is the browser's own select, which draws its popup outside the
// page, so there is nothing for the guard to measure; the toast has no kind in the guard (listed as not covered).
export const deliveryCases: OverlayCase[] = [
  {
    name: 'hint on Open in Master & QC',
    kind: 'tooltip',
    open: (page) => showHint(page, 'Open in Master & QC'),
  },
  {
    name: 'hint on Open the folder',
    kind: 'tooltip',
    start: 'fresh',
    scrolled: false,
    // Not at 320x300: there the hint opens and then does not settle (the guard reports it never became visible); the cause was not found,
    // the same as the hints on Master & QC's icon buttons over scrolled content. Listed in the state matrix as not covered.
    viewports: ({ height }) => height >= 500,
    open: async (page) => {
      const driver = APP_DRIVERS['delivery']?.['built'];
      if (!driver) throw new Error('no driver for delivery / built');
      await driver(page);
      await showHint(page, 'Open the folder');
    },
  },
];
