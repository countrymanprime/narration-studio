import { expect, test, type Locator, type Page } from '@playwright/test';
import { goToPage } from './drivers/shared';
import { settlePage } from './helpers/settle';

// The Pickups page's overlays (definition of done, rule 1: overlays): the row menu, the Add popover, the chapter stepper's menu, the
// Check recordings dialog, a tooltip and a toast are each opened where the window is tight (the corners, beside the nav, at a small
// size, with another overlay already open) and must be the topmost element at their own points and fully on screen. The shared
// overlay guard (branch fix/booth-resiliency) had not merged when this was written, so this runs the same check for this page by hand.

const SIZES = [
  { name: 'wide', width: 1440, height: 900, navBesidePage: true },
  { name: 'short', width: 1100, height: 560, navBesidePage: true },
  { name: 'narrow', width: 760, height: 620, navBesidePage: false },
];

async function open(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Pickups');
  await page.getByRole('region', { name: 'Pickups' }).getByRole('button', { name: 'Open in Booth at this line' }).first().waitFor();
}

/** The overlay is on screen, and at its four corners and its middle the element under the pointer is the overlay or inside it. */
async function expectTopmostAndOnScreen(page: Page, overlay: Locator, what: string): Promise<void> {
  await overlay.waitFor();
  const box = (await overlay.boundingBox())!;
  const size = page.viewportSize()!;
  expect(box.x, `${what}: left edge on screen`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${what}: top edge on screen`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${what}: right edge on screen`).toBeLessThanOrEqual(size.width + 0.5);
  expect(box.y + box.height, `${what}: bottom edge on screen`).toBeLessThanOrEqual(size.height + 0.5);
  // Inside the rounded corners: a point 3 px in from a rounded dialog's corner is outside its curve, over the backdrop.
  const inset = 14;
  const points = [
    [box.x + inset, box.y + inset],
    [box.x + box.width - inset, box.y + inset],
    [box.x + inset, box.y + box.height - inset],
    [box.x + box.width - inset, box.y + box.height - inset],
    [box.x + box.width / 2, box.y + box.height / 2],
  ];
  for (const [x, y] of points) {
    const covered = await overlay.evaluate(
      (element, at) => {
        const top = document.elementFromPoint(at[0], at[1]);
        return top !== null && element.contains(top);
      },
      [x, y],
    );
    expect(covered, `${what}: topmost at ${Math.round(x)},${Math.round(y)}`).toBe(true);
  }
}

const rows = (page: Page) => page.locator('tr[data-pk]');

for (const size of SIZES) {
  test.describe(`Pickups overlays / ${size.name} ${size.width}x${size.height}`, () => {
    test.beforeEach(async ({ page }) => open(page, size.width, size.height));

    test('the row menu at the row corners, the last row and over the nav edge', async ({ page }) => {
      const last = rows(page).last();
      await last.scrollIntoViewIfNeeded();
      for (const row of [rows(page).first(), last]) {
        const box = (await row.boundingBox())!;
        for (const at of [
          { x: 4, y: 4 },
          { x: Math.max(4, box.width - 4), y: 4 },
          { x: 4, y: Math.max(4, Math.min(box.height - 4, size.height - box.y - 4)) },
          { x: Math.max(4, box.width - 4), y: Math.max(4, Math.min(box.height - 4, size.height - box.y - 4)) },
        ]) {
          await row.click({ button: 'right', position: at });
          await expectTopmostAndOnScreen(page, page.getByRole('menu').last(), `row menu at ${at.x},${at.y}`);
          await page.keyboard.press('Escape');
          await expect(page.getByRole('menu')).toHaveCount(0);
        }
      }
    });

    test('the Add popover, the stepper menu, the Check recordings dialog and a tooltip', async ({ page }) => {
      const list = page.getByRole('region', { name: 'Pickups' });
      await list.getByRole('button', { name: 'Add a pickup by hand' }).click();
      await expectTopmostAndOnScreen(page, page.getByRole('textbox', { name: 'Line to re-record' }).locator('xpath=ancestor::form[1]'), 'Add popover');
      await page.keyboard.press('Escape');

      await list.getByRole('button', { name: /^Chapter: .*\. Change chapter$/ }).click();
      await expectTopmostAndOnScreen(page, page.getByRole('menu').last(), 'stepper menu');
      await page.keyboard.press('Escape');

      await list.getByRole('button', { name: /Check recordings/ }).click();
      await expectTopmostAndOnScreen(page, page.getByRole('dialog').last(), 'Check recordings dialog');
      await page.keyboard.press('Escape');

      await rows(page).first().getByRole('button', { name: 'Remove from pickups' }).hover();
      await expectTopmostAndOnScreen(page, page.getByRole('tooltip').last(), "tooltip on the row's last icon");
    });

    test('the Check recordings dialog keeps Cancel and Check reachable on screen', async ({ page }) => {
      await page
        .getByRole('region', { name: 'Pickups' })
        .getByRole('button', { name: /Check recordings/ })
        .click();
      const dialog = page.getByRole('dialog').last();
      await dialog.waitFor();
      for (const name of [/^Cancel$/, /^Check \d+ chapters?$/i]) {
        const button = dialog.getByRole('button', { name });
        const box = (await button.boundingBox())!;
        expect(box.y + box.height, `${name} is above the bottom edge`).toBeLessThanOrEqual(size.height);
        expect(
          await button.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return top !== null && el.contains(top);
          }),
          `${name} is topmost`,
        ).toBe(true);
      }
    });

    test('a menu opened while the Add popover is open is on top of it', async ({ page }) => {
      const list = page.getByRole('region', { name: 'Pickups' });
      await list.getByRole('button', { name: 'Add a pickup by hand' }).click();
      await page.getByRole('textbox', { name: 'Line to re-record' }).waitFor();
      await rows(page)
        .first()
        .click({ button: 'right', position: { x: 4, y: 4 } });
      const menu = page.getByRole('menu').last();
      await expectTopmostAndOnScreen(page, menu, 'row menu over the Add popover');
    });

    // At the narrow size the nav is a drawer, not a rail beside the page, so there is no edge to open beside.
    if (size.navBesidePage)
      test('a row menu opened beside the expanded nav is on top, and the check itself fails on a covered overlay', async ({ page }) => {
        // The nav rail stays open while focus is in it and is drawn over the page; a menu opened right at its edge must still be on top.
        const item = page
          .locator('nav')
          .getByRole('button', { name: /Pickups/ })
          .first();
        await item.focus();
        const nav = (await page.locator('nav').first().boundingBox())!;
        const row = rows(page).first();
        const box = (await row.boundingBox())!;
        await page.mouse.click(Math.max(nav.x + nav.width, box.x) + 4, box.y + 12, { button: 'right' });
        const menu = page.getByRole('menu').last();
        await expectTopmostAndOnScreen(page, menu, 'row menu beside the nav');
        await page.evaluate(() => {
          const cover = document.createElement('div');
          cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
          document.body.append(cover);
        });
        await expect(expectTopmostAndOnScreen(page, menu, 'covered menu')).rejects.toThrow(/topmost/);
      });

    test('a toast is fully on screen and on top', async ({ page }) => {
      await page
        .context()
        .grantPermissions(['clipboard-read', 'clipboard-write'])
        .catch(() => undefined);
      await page.getByRole('button', { name: 'Copy the pickup script' }).click();
      await expectTopmostAndOnScreen(page, page.getByText(/^Copied\.$|could not be copied/).locator('xpath=ancestor-or-self::*[@role][1]'), 'toast');
    });
  });
}
