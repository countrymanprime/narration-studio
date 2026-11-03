import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { pickupsDrivers } from './drivers/pickups';

// The real route, not a unit render: with no REAPER project file linked (?mockNoDaw=1) the top bar asks to link one, so Add N as markers is off
// and pressing it does not toast that markers are in REAPER (walkthrough 2026-11-03, #1939).
test('Pickups / no project file linked: the markers button is off and never claims success', async ({ page }) => {
  await pickupsDrivers['markers-not-linked']!(page);
  await expect(page.getByText('REAPER: Not linked')).toBeVisible();
  const add = page.getByRole('button', { name: /^Add \d+ as markers in / });
  await expect(add).toHaveAttribute('aria-disabled', 'true');
  await add.click({ force: true });
  await page.waitForTimeout(500);
  await expect(page.getByText(/Pickup markers? for .* in /)).toHaveCount(0);
});

// The markers sentence for a session that holds a line with no place (added by hand): it fits a 390 px window and agrees with the button's count.
// The window is narrowed after the state is driven (the rail the driver clicks is a drawer at 390).
test('Pickups / markers-partial-toast / the toast fits a 390 px window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settlePage(page);
  await pickupsDrivers['markers-partial-toast']!(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const toast = page.getByText(/^Pickup markers for 3 of 4 lines/);
  const box = (await toast.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'screenshots/pickups-markers-toast-390.png' });
});
