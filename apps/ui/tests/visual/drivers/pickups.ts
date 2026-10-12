// How to reach each `pickups` state (the Studio Next Pickups page) in STATE_CATALOG (see app.drivers.ts).
import type { Locator, Page } from '@playwright/test';
import { type Driver, goToPage } from './shared';

const list = (page: Page): Locator => page.getByRole('region', { name: 'Pickups' });

// Opens Pickups and waits for the host's list to have drawn its lines.
async function openPickups(page: Page): Promise<void> {
  await goToPage(page, 'Pickups');
  await list(page).getByRole('button', { name: 'Open in Booth at this line' }).first().waitFor();
}

export const pickupsDrivers: Record<string, Driver> = {
  list: async (page) => {
    await openPickups(page);
    await page.getByRole('heading', { name: 'Pickup session' }).waitFor();
  },
  scoped: async (page) => {
    await openPickups(page);
    await list(page)
      .getByRole('button', { name: /^Chapter: .*\. Change chapter$/ })
      .click();
    await page.getByRole('menuitemradio', { name: /^Chapter 1( — |$)/ }).click();
    await page.getByText('No pickups for this chapter').waitFor();
  },
  'session-left-out': async (page) => {
    await openPickups(page);
    await list(page).getByRole('checkbox').first().click();
    await page.getByRole('button', { name: 'Open 2 in Booth' }).waitFor();
  },
  'add-popover': async (page) => {
    await openPickups(page);
    await list(page).getByRole('button', { name: 'Add a pickup by hand' }).click();
    await page.getByRole('textbox', { name: 'Line to re-record' }).waitFor();
  },
  empty: async (page) => {
    await openPickups(page);
    const remove = list(page).getByRole('button', { name: 'Remove from pickups' });
    while ((await remove.count()) > 0) {
      const before = await remove.count();
      await remove.first().click();
      await page.waitForFunction(
        ([n]) => document.querySelectorAll('section[aria-label="Pickups"] button[aria-label="Remove from pickups"]').length < n,
        [before],
      );
    }
    await page.getByText('No pickups queued').waitFor();
  },
};
