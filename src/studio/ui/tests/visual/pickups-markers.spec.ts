import { expect, test } from '@playwright/test';
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
