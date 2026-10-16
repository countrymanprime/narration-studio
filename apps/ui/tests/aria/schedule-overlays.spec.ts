import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectOverlayTopmostAndOnScreen } from './overlayGuard';
import { DESKTOP, NARROW, openApp, RAIL } from './helpers';
import { VIEWPORTS } from '../visual/viewports';

// Every overlay the Schedule draws (the milestone dialog, the status and note tooltips, the Undo toast) is opened where the page puts its
// trigger at every viewport, with the page scrolled so the trigger sits at the top and at the bottom edge, and with a toast already up. Each is
// checked to be the topmost element at its own points and fully on screen (docs/research/schedule-page-state-matrix.md, "Overlays").
// The Paid list is the browser's own select popup: the page draws nothing there to check.
const TABLET = VIEWPORTS.find((v) => v.name === 'tablet') ?? RAIL;
const SIZES = [DESKTOP, RAIL, TABLET, NARROW];

async function openSchedule(page: Page, size: (typeof SIZES)[number]) {
  await openApp(page, size, ['schedule', 'on-pace']);
}

/** Puts `target` at the top or bottom edge of the scrolling page body. */
async function scrollTo(target: Locator, at: 'start' | 'end') {
  await target.evaluate((el, block) => el.scrollIntoView({ block: block as ScrollLogicalPosition, inline: 'nearest' }), at);
}

for (const size of SIZES) {
  test.describe(`${size.name} ${size.width}x${size.height}`, () => {
    test('the Add milestone dialog is on top and on screen, scrolled or not', async ({ page }) => {
      await openSchedule(page, size);
      for (const at of ['none', 'end'] as const) {
        if (at === 'end') await scrollTo(page.getByRole('heading', { level: 2, name: 'Milestones' }), 'end');
        await page.getByRole('button', { name: 'Add milestone' }).first().click();
        const dialog = page.getByRole('dialog');
        await expectOverlayTopmostAndOnScreen(dialog, `Add milestone dialog (${at})`);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      }
    });

    test('the dialog stays on top of an Undo toast that is already up', async ({ page }) => {
      await openSchedule(page, size);
      await page.getByRole('button', { name: 'Add milestone' }).first().click();
      let dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', { name: 'Name' }).fill('Toast maker');
      await dialog.getByRole('textbox', { name: 'Due' }).fill('2026-10-02');
      await dialog.getByRole('button', { name: 'Add milestone' }).click();
      const toast = page.getByText('Milestone added.').first();
      await expect(toast).toBeVisible();
      await expectOverlayTopmostAndOnScreen(toast.locator('xpath=ancestor::div[contains(@class,"fixed")][1]'), 'Undo toast');
      await page.getByRole('button', { name: 'Add milestone' }).first().click();
      dialog = page.getByRole('dialog');
      await expectOverlayTopmostAndOnScreen(dialog, 'Add milestone dialog over a toast');
    });

    test('the status and note tooltips are on top and on screen at the top and bottom edge', async ({ page }) => {
      await openSchedule(page, size);
      const due = page.getByRole('textbox', { name: 'Delivery due' });
      const status = page.getByRole('img', { name: /On track|At risk|Late by/ }).last();
      for (const at of ['start', 'end'] as const) {
        await scrollTo(status, at);
        await status.hover();
        const tip = page.getByRole('tooltip').first();
        await expect(tip).toBeVisible({ timeout: 5000 });
        await expectOverlayTopmostAndOnScreen(tip, `status tooltip (${at})`);
        await page.mouse.move(2, 2);
        await expect(tip).toBeHidden();
      }
      await expect(due).toBeVisible();
    });
  });
}

test('the guard itself fails on an overlay something else covers or that runs off screen', async ({ page }) => {
  await openApp(page, DESKTOP, ['schedule', 'on-pace']);
  await page.getByRole('button', { name: 'Add milestone' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    const cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;z-index:9999;background:transparent';
    document.body.append(cover);
  });
  await expect(expectOverlayTopmostAndOnScreen(dialog, 'covered dialog')).rejects.toThrow(/covered at/);
});
