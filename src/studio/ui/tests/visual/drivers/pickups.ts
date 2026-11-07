// How to reach each `pickups` state (the Studio Next Pickups page) in STATE_CATALOG (see app.drivers.ts).
import type { Locator, Page } from '@playwright/test';
import { settlePage } from '../helpers/settle';
import { type Driver, closeDawDialogOnArrival, goToPage, openWithoutManuscript } from './shared';

const list = (page: Page): Locator => page.getByRole('region', { name: 'Pickups' });

// Opens Pickups and waits for the host's list to have drawn its lines.
async function openPickups(page: Page): Promise<void> {
  await goToPage(page, 'Pickups');
  await list(page).getByRole('button', { name: 'Open in Booth at this line' }).first().waitFor();
}

// Adds a line by hand ("Pickup by hand") to the first chapter in the list's popover and waits for it to be listed.
async function addByHand(page: Page): Promise<void> {
  await list(page).getByRole('button', { name: 'Add a pickup by hand' }).click();
  await page.getByRole('textbox', { name: 'Time in the recording' }).fill('01:00.0');
  await page.getByRole('textbox', { name: 'Line to re-record' }).fill('Pickup by hand');
  await page.getByRole('button', { name: 'Add pickup', exact: true }).click();
  await page.getByRole('button', { name: /^Open 4 in Booth$/ }).waitFor();
}

export const pickupsDrivers: Record<string, Driver> = {
  'daw-off-closed': (page) => closeDawDialogOnArrival(page, 'Pickups'),
  list: async (page) => {
    await openPickups(page);
    await page.getByRole('heading', { name: 'Pickup session' }).waitFor();
  },
  'show-where': async (page) => {
    await openPickups(page);
    await list(page).locator('tr[data-pk]').filter({ hasText: '07:30.9' }).getByRole('cell').nth(1).click();
    const where = list(page).getByRole('region', { name: 'Where 07:30.9 is' });
    await where.getByRole('button', { name: 'Fine, not a pickup' }).waitFor();
    await where.getByRole('region', { name: 'In the script' }).waitFor();
  },
  scoped: async (page) => {
    await openPickups(page);
    await list(page)
      .getByRole('button', { name: /^Chapter: .*\. Change chapter$/ })
      .click();
    await page.getByRole('menuitemradio', { name: /^Chapter 1(: | |$)/ }).click();
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
  // Submitted empty: the one message under the line box, no toast with it (rule 7).
  'add-popover-empty': async (page) => {
    await openPickups(page);
    await list(page).getByRole('button', { name: 'Add a pickup by hand' }).click();
    await page.getByRole('button', { name: 'Add pickup', exact: true }).click();
    await page.getByText('Type the line first.').waitFor();
  },
  // A line over 500 characters: the one message under the line box, no toast.
  'add-popover-too-long': async (page) => {
    await openPickups(page);
    await list(page).getByRole('button', { name: 'Add a pickup by hand' }).click();
    await page.getByRole('textbox', { name: 'Time in the recording' }).fill('05:12.0');
    await page.getByRole('textbox', { name: 'Line to re-record' }).fill('word '.repeat(101));
    await page.getByRole('button', { name: 'Add pickup', exact: true }).click();
    await page.getByText('A line can be at most 500 characters.').waitFor();
  },
  // A line added by hand has no place in the recording yet, so it gets no marker: the toast counts the placed lines against the session.
  'markers-partial-toast': async (page) => {
    await openPickups(page);
    await addByHand(page);
    await page.getByRole('button', { name: /^Add 3 as markers in / }).click();
    await page.getByText(/^Pickup markers for 3 of 4 lines are in .+ 1 line has no place in the recording yet and was left out\.$/).waitFor();
  },
  'marked-recorded': async (page) => {
    await openPickups(page);
    await list(page).getByRole('button', { name: 'Mark recorded' }).first().click();
    await page.getByText('Not in the DAW yet').first().waitFor();
  },
  // The list never answers, so `openPickups` (which waits for its lines) is not used.
  loading: async (page) => {
    await page.goto('/?mockPickupList=loading');
    await settlePage(page);
    await goToPage(page, 'Pickups');
    await page.getByRole('group', { name: 'Loading the pickups' }).waitFor();
  },
  // REAPER with no project file linked: the markers button is off and says why, as the top bar's badge does.
  'markers-not-linked': async (page) => {
    await page.goto('/?mockNoDaw=1');
    await settlePage(page);
    await openPickups(page);
    await page
      .getByRole('button', { name: /^Add \d+ as markers in / })
      .and(page.locator('[aria-disabled="true"]'))
      .waitFor();
  },
  unreadable: async (page) => {
    await page.goto('/?mockPickupList=unreadable');
    await settlePage(page);
    await goToPage(page, 'Pickups');
    await page.getByText('The pickup list could not be read').waitFor();
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
  'no-manuscript': async (page) => {
    await openWithoutManuscript(page, 'Pickups');
  },
};
